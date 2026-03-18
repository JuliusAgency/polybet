import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { BUTTON_VARIANTS, type ButtonVariant } from './const';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    children: ReactNode;
}

export const Button = ({ variant = 'primary', children, className = '', ...rest }: ButtonProps) => {
    const variantClasses = BUTTON_VARIANTS[variant];

    return (
        <button
            className={`rounded-lg px-4 py-2 font-medium transition-colors cursor-pointer ${variantClasses} ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
};
