/**
 * Shared utility / helper functions.
 *
 * Add pure utility functions here. Keep them small, well-documented, and testable.
 */

export { formatVolume } from './formatVolume';
export { formatProbability } from './formatProbability';
export { formatSharePrice } from './formatSharePrice';
export { mapBalanceErrorMessage } from './mapBalanceError';
export { polymarketEventUrl } from './polymarketUrl';

/**
 * Returns a display name for a transaction/action initiator.
 * Super admins are shown using the localized alias instead of their username.
 */

export const formatInitiatorName = (
  role: string,
  username: string,
  t: (key: string) => string
): string => (role === 'super_admin' ? t('common.superAdminAlias') : `@${username}`);
