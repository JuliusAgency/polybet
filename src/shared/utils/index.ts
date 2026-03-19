/**
 * Shared utility / helper functions.
 *
 * Add pure utility functions here. Keep them small, well-documented, and testable.
 */

/**
 * Concatenates class names, filtering out falsy values.
 */
export const cn = (...classes: (string | false | null | undefined)[]): string =>
    classes.filter(Boolean).join(' ');

/**
 * Returns a display name for a transaction/action initiator.
 * Super admins are shown using the localized alias instead of their username.
 */
export const formatInitiatorName = (
  role: string,
  username: string,
  t: (key: string) => string,
): string =>
  role === 'super_admin' ? t('common.superAdminAlias') : `@${username}`;
