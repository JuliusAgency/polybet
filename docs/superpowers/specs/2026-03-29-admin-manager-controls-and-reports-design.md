# Admin Manager Controls And Reports — Design Spec

**Date:** 2026-03-29
**Status:** Approved

---

## Problem

Current behavior and admin UX have four gaps:

1. Manager/account blocking is not consistently reflected in active sessions without refresh.
2. In manager profile view, manager row and managed users are mixed in one grid and are hard to distinguish.
3. Bet stake limits exist in schema but are not enforced consistently at bet placement and are not visible as hierarchical effective limits in admin UI.
4. Super admin cannot generate standardized PDF reports for core operational and audit scenarios.

---

## Goals

1. Enforce immediate logout semantics for block actions:
- Manager blocks a user: only that user is logged out immediately.
- Super admin blocks a manager: manager is logged out immediately, linked users are cascade-blocked and logged out immediately.

2. Make manager profile page structurally unambiguous.

3. Implement hierarchical max stake limits with server-side source of truth:
- `user` override > `manager` override > `global` fallback.

4. Provide PDF exports for high-value admin workflows with consistent filters and audit trail.

---

## Solution Overview

### A. Session invalidation and blocking

Keep `profiles.is_active` as the single revocation flag and realtime trigger source.

- Continue using realtime subscription to `profiles` updates in `AuthProvider`.
- Harden client-side revocation flow:
  - dedicated `forceSignOut` path for idempotent sign-out,
  - robust channel cleanup on auth state changes,
  - startup guard: if active session loads a profile with `is_active=false`, sign out immediately.

Server behavior remains authoritative:
- `admin_toggle_user_block` keeps manager cascade logic.
- `manager_toggle_user_block` applies only to linked users and affects only target user.

Expected result:
- single-user block by manager logs out only that user.
- manager block by super admin logs out manager and all cascade-blocked linked users.

### B. Manager profile IA and clarity

Refactor `ManagerProfilePage` into two distinct sections:

1. **Manager Card**
- role badge `Manager`, status, manager balance, manager-level actions (deposit/withdraw/block/reset password), manager-level limit controls.

2. **Managed Users Table**
- user-only rows with role badge `User`, balances, status, actions, and effective limit column.

This removes mixed semantics from a single table and avoids ambiguity.

### C. Hierarchical bet limits

#### Data model

- Global limit: `system_settings.key = 'bet_limits'`, JSON payload with `global_max_bet`.
- Manager limit: `managers.max_bet_limit`.
- User limit: `profiles.max_bet_limit` (for role `user`).

Limit value interpretation:
- `NULL` or `<= 0` means "not set".

#### Effective limit resolution

For user `U` linked to manager `M`:

1. If `profiles(U).max_bet_limit > 0`: use it (`source='user'`).
2. Else if `managers(M).max_bet_limit > 0`: use it (`source='manager'`).
3. Else if `system_settings.bet_limits.global_max_bet > 0`: use it (`source='global'`).
4. Else: no max stake limit.

#### Enforcement

Enforce in `place_bet` RPC before balance mutation:
- compute effective limit server-side,
- reject with explicit DB error when `p_stake` exceeds effective limit.

This guarantees correctness across all clients and prevents bypass via frontend tampering.

#### Admin UI representation

In managed users table:
- column `Effective Bet Limit`,
- tooltip/help icon containing:
  - active numeric limit,
  - source (`user`/`manager`/`global`),
  - short hierarchy explanation.

Admin-editable controls:
- set/clear manager limit,
- set/clear per-user limit,
- set global limit.

Changes are logged in `admin_action_logs`.

### D. PDF reporting

Implement a dedicated export endpoint via Supabase Edge Function for super admin.

Entry contract:
- `report_type`
- filter payload (date range, manager id, user id, status as relevant)

Output:
- generated PDF binary response (or signed storage URL if needed later).

Access control:
- super admin only.

Audit:
- log each export request in `admin_action_logs` with report type and filters snapshot.

Initial report set:

1. `system_summary`
- period KPIs: turnover, pnl, open exposure, active/blocked counts.

2. `managers_performance`
- per-manager rollup: balances, group turnover, group pnl, exposure, user counts.

3. `manager_detailed`
- one manager: profile summary, users summary, transactions, action log for period.

4. `user_statement`
- one user: balances, bets history, transactions, period totals.

5. `audit_actions`
- admin operations timeline: actor, action, target, amount/note, timestamp.

---

## Implementation Plan (High-Level)

1. **DB migrations**
- add global settings default for `bet_limits` (if missing),
- add helper SQL function(s) to resolve effective limit,
- update `place_bet` with effective-limit check,
- add RPCs for setting/clearing limits (global/manager/user),
- add optional SQL helpers/views for report datasets.

2. **Frontend: auth/session**
- harden `AuthProvider` revocation path and startup blocked-profile guard.

3. **Frontend: manager profile UX**
- split page into manager card + managed users table,
- add effective-limit column + help tooltip,
- add limit edit controls and mutation hooks.

4. **Backend: PDF export**
- add Edge Function for report generation and access checks,
- add report-specific query modules and rendering templates,
- return file to client and surface download action in admin UI.

5. **Admin UI: report center**
- add export controls in super admin area with report-type selector and filters,
- wire to edge function and handle loading/errors/download.

6. **Tests**
- SQL tests for limit precedence and rejection in `place_bet`,
- tests for manager/user block semantics and auth guard behavior,
- UI routing/state tests for manager profile structure,
- edge function tests for report authorization and payload validation.

---

## Risks And Mitigations

1. **Realtime race conditions during auth transitions**
- mitigate with idempotent `forceSignOut`, defensive null checks, and strict channel teardown.

2. **Limit regressions from mixed null/zero semantics**
- normalize rule (`NULL`/`<=0` = not set), cover with SQL unit tests.

3. **PDF complexity and latency**
- start with tabular reports and deterministic templates; optimize formatting iteratively.

4. **Scope creep in reporting**
- lock first version to 5 report types and extensible `report_type` contract.

---

## Files Expected To Change

- `supabase/migrations/*` (new migrations for limits + reports)
- `src/app/providers/AuthProvider/AuthProvider.tsx`
- `src/pages/super-admin/ManagerProfilePage/ManagerProfilePage.tsx`
- `src/features/admin/manager-users/*` and/or new admin limit hooks
- `src/shared/i18n/locales/en/translation.json`
- `src/shared/i18n/locales/he/translation.json`
- `supabase/functions/*` (new PDF report edge function)
- super admin page(s) for report export actions

