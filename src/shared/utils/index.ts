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
