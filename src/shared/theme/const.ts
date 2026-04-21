/**
 * Design tokens as JavaScript constants.
 * Use for dynamic styles, animations, or when CSS vars can't be used.
 * Keep in sync with tokens.css.
 *
 * NOTE: prefer CSS variables (`var(--color-*)`) for anything that should react to
 * theme changes at runtime. These constants are a fallback for JS-only contexts
 * (recharts, canvas, etc.) and expose BOTH theme values so consumers can pick.
 */
export type ThemeName = 'dark' | 'light';

export const colors = {
    bgBase: '#0f1117',
    bgSurface: '#1a1d27',
    bgElevated: '#22263a',
    accent: '#6c63ff',
    accentHover: '#5a52e0',
    win: '#22c55e',
    loss: '#ef4444',
    pending: '#f59e0b',
    open: '#3b82f6',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#475569',
    border: '#2d3148',
} as const;

export const colorsByTheme: Record<ThemeName, Record<keyof typeof colors, string>> = {
    dark: { ...colors },
    light: {
        bgBase: '#f8f9fb',
        bgSurface: '#ffffff',
        bgElevated: '#f1f3f7',
        accent: '#1f55ec',
        accentHover: '#1744c8',
        win: '#0a8a4a',
        loss: '#c8263a',
        pending: '#b6761a',
        open: '#1f55ec',
        textPrimary: '#111827',
        textSecondary: '#5b6474',
        textMuted: '#8a93a3',
        border: '#e4e7ec',
    },
};

export const zIndex = {
    base: 0,
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modalBackdrop: 400,
    modal: 500,
    popover: 600,
    toast: 700,
} as const;

export const radius = {
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '24px',
} as const;

export const THEME_STORAGE_KEY = 'polybet-theme';
export const THEME_DEFAULT: ThemeName = 'dark';
