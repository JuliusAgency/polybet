/**
 * Design tokens as JavaScript constants.
 * Use for dynamic styles, animations, or when CSS vars can't be used.
 * Keep in sync with tokens.css
 */
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
