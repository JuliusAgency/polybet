## Issues/Notes
- `instruction.md` was not present in repository root, so implementation followed the ticket files under `input/PB-3/`.
- Repository-wide `npm run test` currently fails due a pre-existing absolute-path test fixture (`tests/adjustBalanceModalLoopGuard.test.ts`) unrelated to this ticket.

## Approach
Aligned BetSlip displayed odds to Polymarket parity by deriving UI odds from the outcome `price` (with the same 0.001 floor used in market tradability/sync logic), instead of trusting potentially stale `effective_odds` values for presentation.

Bet placement flow remains unchanged in structure (still uses expected odds with drift checks and RPC guard), but now the displayed/confirmed odds used in BetSlip are computed consistently from price snapshots (initial + refreshed outcome), so what users see in the slip tracks Polymarket probabilities.

## Files Modified
- `src/widgets/BetSlip/BetSlip.tsx`  
  Added `getDisplayOdds` helper and switched BetSlip displayed/drift-compared odds updates to price-derived odds (`1 / max(0.001, price)`), with fallback to `effective_odds`.
- `tests-component/widgets/BetSlip/BetSlip.test.tsx`  
  Added a unit test that verifies BetSlip displays and submits odds derived from `price` even when `effective_odds` differs.

## Test Coverage
- Added component-level coverage for the new parity behavior:
  - BetSlip shows `2.50` for a `price=0.4` outcome even when `effective_odds=9.99`.
  - BetSlip submits `p_expected_odds=2.5` (price-derived) in the place-bet RPC payload.
- Executed:
  - `npm run -s build`
  - `npm run -s test:component -- tests-component/widgets/BetSlip/BetSlip.test.tsx`
  - `npx --yes tsx --test tests/marketsPolymarketFields.test.ts`
