## Issues/Notes
- `instruction.md` was not present in the repository root, so implementation followed the ticket files available under `input/PB-2/`.
- `npm run test` currently fails due pre-existing repository tests that reference missing absolute/local paths and missing migration/seed files unrelated to this ticket. This baseline issue existed before the BetSlip changes.
- Added `.gitignore` entries for local task artifacts (`/input/`, `/cacheBasicJiraClient/`) to avoid accidental staging by automated `git add .`.

## Approach
- Hardened BetSlip against stale odds by forcing an event-level odds sync as soon as the slip opens.
- During this initial sync window, stake input and confirm actions are disabled to prevent acting on stale prices.
- The slip now continuously aligns the displayed odds with the latest cached live outcome after refresh, so potential payout/confirmation are computed from current odds instead of the stale open-time snapshot.
- Existing submit-time server guard behavior remains intact (drift and untradable protection still enforced at RPC level).

## Files Modified
- `.gitignore`  
  Added ignores for local task/job artifacts that should never be committed.

- `src/widgets/BetSlip/BetSlip.tsx`  
  Added initial live-odds synchronization on mount, UI gating while syncing, and live `displayOdds` alignment from refreshed cache.

- `tests-component/widgets/BetSlip/BetSlip.test.tsx`  
  Expanded/updated unit coverage for:
  - immediate live-odds replacement of stale open-time odds
  - disabled interactions during initial sync
  - submit behavior with synced odds when open-time odds were stale
  - existing untradable and drift/RPC guard scenarios with sync-aware timing

## Test Coverage
- `npm run build` ✅
- `npm run test:component -- tests-component/widgets/BetSlip/BetSlip.test.tsx` ✅
- `npm run test:component` ✅
- `npm run test` ❌ (fails on unrelated pre-existing repository tests; see Issues/Notes)
