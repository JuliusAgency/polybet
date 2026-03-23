import { BUTTON_VARIANTS, type ButtonVariant } from './const.ts';

interface GetButtonClassNameParams {
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}

export function getButtonClassName(params: GetButtonClassNameParams) {
  const {
    variant = 'primary',
    disabled = false,
    className = '',
  } = params;

  const variantClasses = BUTTON_VARIANTS[variant];
  const interactiveClasses = disabled
    ? 'cursor-not-allowed opacity-60'
    : 'cursor-pointer';
  const stateClasses = disabled
    ? variantClasses.replace(/\s*hover:[^\s]+/g, '')
    : variantClasses;

  return `rounded-lg px-4 py-2 font-medium transition-colors ${interactiveClasses} ${stateClasses} ${className}`.trim();
}
