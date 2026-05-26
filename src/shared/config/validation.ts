// Shared validation bounds for admin/manager balance adjustments (deposit/withdrawal).
// Mirrored by the server-side RPC guards in migration 20260525142805_balance_adjust_guards.
export const MIN_ADJUST_AMOUNT = 0.01;
export const MAX_NOTE_LENGTH = 100;
