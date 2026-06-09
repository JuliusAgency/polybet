/**
 * Maps a raw Supabase RPC balance error to a localized, user-facing message.
 *
 * The balance-adjust / withdraw RPCs (`manager_adjust_balance`,
 * `admin_adjust_balance`, `admin_adjust_manager_balance`) raise
 * `'Insufficient balance'` (and the `'Insufficient balance for user'` variant)
 * as raw English with no ERRCODE, so we match by message substring — the same
 * approach BetSlip uses for liquidity / odds errors. Any non-matching message
 * is passed through unchanged so other RPC errors are never swallowed.
 *
 * Note: an insufficient-balance error can only arise on a WITHDRAWAL (a deposit
 * adds funds and can never be "insufficient"), so the localized message is
 * worded for the withdrawal context across every real call path.
 */
export function mapBalanceErrorMessage(raw: string, t: (key: string) => string): string {
  if (/insufficient balance/i.test(raw)) {
    return t('treasury.insufficientBalance');
  }
  return raw;
}
