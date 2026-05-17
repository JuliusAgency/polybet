#!/usr/bin/env bash
#
# setup-dmtools.sh — bootstrap the dmtools / ai-teammate stack in a project:
#   1) add the `agents` git submodule
#   2) drop in .github/workflows/{ai-teammate,sm}.yml
#   3) create .dmtools/config.js
#
# Usage:
#   ./setup-dmtools.sh \
#       --owner JuliusAgency \
#       --repo  techory \
#       --jira  TECHORY \
#       --email jleprog39@gmail.com \
#       [--base-branch main] \
#       [--agents-url https://github.com/jleprog39/dmtools-agents.git] \
#       [--project-dir .]
#
# Env-var equivalents: REPO_OWNER, REPO_NAME, JIRA_PROJECT, AUTHOR_EMAIL,
# BASE_BRANCH, AGENTS_URL, PROJECT_DIR.
#
# Re-run-safe: existing submodule / files are left alone unless --force is passed.

set -euo pipefail

# --- defaults ---------------------------------------------------------------
REPO_OWNER="${REPO_OWNER:-}"
REPO_NAME="${REPO_NAME:-}"
JIRA_PROJECT="${JIRA_PROJECT:-}"
AUTHOR_EMAIL="${AUTHOR_EMAIL:-}"
BASE_BRANCH="${BASE_BRANCH:-main}"
AGENTS_URL="${AGENTS_URL:-https://github.com/jleprog39/dmtools-agents.git}"
PROJECT_DIR="${PROJECT_DIR:-.}"
FORCE=0

# --- arg parsing ------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)        REPO_OWNER="$2"; shift 2 ;;
    --repo)         REPO_NAME="$2"; shift 2 ;;
    --jira)         JIRA_PROJECT="$2"; shift 2 ;;
    --email)        AUTHOR_EMAIL="$2"; shift 2 ;;
    --base-branch)  BASE_BRANCH="$2"; shift 2 ;;
    --agents-url)   AGENTS_URL="$2"; shift 2 ;;
    --project-dir)  PROJECT_DIR="$2"; shift 2 ;;
    --force)        FORCE=1; shift ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

missing=()
[[ -z "$REPO_OWNER"   ]] && missing+=("--owner")
[[ -z "$REPO_NAME"    ]] && missing+=("--repo")
[[ -z "$JIRA_PROJECT" ]] && missing+=("--jira")
[[ -z "$AUTHOR_EMAIL" ]] && missing+=("--email")
if (( ${#missing[@]} > 0 )); then
  echo "Missing required args: ${missing[*]}" >&2
  echo "Run '$0 --help' for usage." >&2
  exit 2
fi

cd "$PROJECT_DIR"

if [[ ! -d .git ]]; then
  echo "ERROR: $PROJECT_DIR is not a git repository (no .git directory)." >&2
  exit 1
fi

log() { printf '\033[1;34m[setup-dmtools]\033[0m %s\n' "$*"; }

# --- 1) agents submodule ----------------------------------------------------
if [[ -d agents && -f .gitmodules ]] && grep -q 'path = agents' .gitmodules 2>/dev/null; then
  log "submodule 'agents' already present — syncing"
  git submodule update --init --recursive agents
else
  log "adding submodule 'agents' from $AGENTS_URL"
  git submodule add "$AGENTS_URL" agents
  git submodule update --init --recursive agents
fi

# --- 2) workflows -----------------------------------------------------------
mkdir -p .github/workflows

write_file() {
  local path="$1"
  if [[ -e "$path" && $FORCE -ne 1 ]]; then
    log "skip $path (exists; pass --force to overwrite)"
    return
  fi
  log "write $path"
  cat > "$path"
}

write_file .github/workflows/ai-teammate.yml <<'YAML'
name: ai-teammate

# Worker workflow. Dispatched by SM (sm.yml) or run manually for a single agent.
on:
  workflow_dispatch:
    inputs:
      config_file:
        description: 'Agent config file (e.g., agents/story_development.json)'
        required: true
        default: 'agents/story_development.json'
      concurrency_key:
        description: 'Concurrency key (usually ticket key, e.g., PET-7)'
        required: false
        default: 'manual'
      project_key:
        description: 'Project key override (e.g., PET)'
        required: false
        default: ''
      encoded_config:
        description: 'Base64-encoded JSON config override (used by SM dispatch)'
        required: false
        default: ''

concurrency:
  group: ai-teammate-${{ inputs.concurrency_key }}
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: write

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      JIRA_BASE_PATH: ${{ vars.JIRA_BASE_PATH }}
      JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
      JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
      JIRA_AUTH_TYPE: ${{ vars.JIRA_AUTH_TYPE }}
      AI_AGENT_PROVIDER: ${{ vars.AI_AGENT_PROVIDER }}
      COPILOT_MODEL: ${{ vars.COPILOT_MODEL }}
      COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
      GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
      # dmtools reads GitHub auth from SOURCE_GITHUB_* env vars (not GITHUB_TOKEN).
      SOURCE_GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
      SOURCE_GITHUB_WORKSPACE: ${{ github.repository_owner }}
      SOURCE_GITHUB_REPOSITORY: ${{ github.event.repository.name }}
      SOURCE_GITHUB_BRANCH: main
      DMTOOLS_INTEGRATIONS: 'jira,github,file'
      PROJECT_KEY: ${{ inputs.project_key }}

    steps:
      - name: Checkout (with submodules)
        uses: actions/checkout@v4
        with:
          submodules: recursive
          token: ${{ secrets.PAT_TOKEN }}
          fetch-depth: 0

      - name: Install tools (java, node, dmtools, copilot)
        # Pin dmtools to v1.7.184+ — older versions hit the deprecated Jira
        # /rest/api/latest/search endpoint (Atlassian CHANGE-2046) and return empty.
        run: bash agents/setup/install.sh java node dmtools:v1.7.184 copilot

      - name: Configure git
        run: |
          git config --global user.name "AI Teammate"
          git config --global user.email "agent.ai.native@gmail.com"

      - name: Run agent
        env:
          ENCODED_CFG: ${{ inputs.encoded_config }}
          CONFIG_FILE: ${{ inputs.config_file }}
          CI_RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        # dmtools `run <file> <encoded>` form: SM passes URL-encoded JSON overrides
        # (e.g. {"params":{"inputJql":"key = PET-8"}}) that dmtools merges onto <file>.
        #
        # dmtools exits 0 even when the underlying CLI agent (copilot/cursor/codemie)
        # bails or response.md is missing — it just posts an error comment to Jira.
        # We need the workflow to surface those internal failures, so:
        #   - pipefail catches a non-zero dmtools exit
        #   - run.log is grepped for the specific internal-failure markers
        run: |
          set -o pipefail
          if [ -n "$ENCODED_CFG" ]; then
            echo "── encoded_config (URL-decoded preview) ──"
            python3 -c "import os,urllib.parse; print(urllib.parse.unquote(os.environ['ENCODED_CFG']))"
            dmtools --debug run "$CONFIG_FILE" "$ENCODED_CFG" --ciRunUrl "$CI_RUN_URL" 2>&1 | tee run.log
          else
            dmtools --debug run "$CONFIG_FILE" --ciRunUrl "$CI_RUN_URL" 2>&1 | tee run.log
          fi

          if grep -qE '\[ERROR\] CliExecutionHelper - Failed to execute CLI command|CLI output file \(response\.md\) is missing or empty.*requireCliOutputFile=true|Classic Personal Access Tokens.*are not supported by Copilot' run.log; then
            echo "::error title=Agent CLI failed::The underlying CLI agent (copilot/cursor/codemie) failed or produced no response.md. See the Run agent log above."
            exit 1
          fi

      - name: Upload run artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ai-teammate-${{ inputs.concurrency_key }}
          path: |
            outputs/
            run.log
            pr_body_tmp.md
          if-no-files-found: ignore
          retention-days: 7
YAML

write_file .github/workflows/sm.yml <<'YAML'
name: sm

# Scrum Master orchestrator. Scans Jira every 20 minutes and dispatches
# the right agent (via ai-teammate.yml) for each matching ticket.
on:
  workflow_dispatch:
  schedule:
    - cron: "*/20 * * * *"

concurrency:
  group: sm-orchestrator
  cancel-in-progress: false

permissions:
  contents: read
  actions: write

jobs:
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      JIRA_BASE_PATH: ${{ vars.JIRA_BASE_PATH }}
      JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
      JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
      JIRA_AUTH_TYPE: ${{ vars.JIRA_AUTH_TYPE }}
      GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
      # dmtools reads GitHub auth from SOURCE_GITHUB_* env vars (not GITHUB_TOKEN).
      SOURCE_GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}
      SOURCE_GITHUB_WORKSPACE: ${{ github.repository_owner }}
      SOURCE_GITHUB_REPOSITORY: ${{ github.event.repository.name }}
      SOURCE_GITHUB_BRANCH: main
      DMTOOLS_INTEGRATIONS: 'jira,github,file'

    steps:
      - name: Checkout (with submodules)
        uses: actions/checkout@v4
        with:
          submodules: recursive
          token: ${{ secrets.PAT_TOKEN }}

      - name: Install tools (java, dmtools)
        # Pin dmtools to v1.7.184+ — older versions hit the deprecated Jira
        # /rest/api/latest/search endpoint (Atlassian CHANGE-2046) and return empty.
        run: bash agents/setup/install.sh java dmtools:v1.7.184

      - name: Run SM orchestrator
        run: |
          export CI_RUN_URL="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          dmtools --debug run agents/sm.json --ciRunUrl "$CI_RUN_URL"
YAML

# --- 3) .dmtools/config.js --------------------------------------------------
mkdir -p .dmtools

if [[ -e .dmtools/config.js && $FORCE -ne 1 ]]; then
  log "skip .dmtools/config.js (exists; pass --force to overwrite)"
else
  log "write .dmtools/config.js"
  cat > .dmtools/config.js <<EOF
module.exports = {
  repository: { owner: '${REPO_OWNER}', repo: '${REPO_NAME}' },
  jira:       { project: '${JIRA_PROJECT}' },
  git:        { baseBranch: '${BASE_BRANCH}', authorEmail: '${AUTHOR_EMAIL}' },
  scm:        { provider: 'github' }
};
EOF
fi

log "done. Review changes with: git status && git diff --cached"
log "Then commit: git add .gitmodules agents .github/workflows .dmtools && git commit -m 'chore: bootstrap dmtools/ai-teammate'"
