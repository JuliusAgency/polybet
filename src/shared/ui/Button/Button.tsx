import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ButtonVariant } from './const';
import { getButtonClassName } from './className';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    children: ReactNode;
}

export const Button = ({ variant = 'primary', children, className = '', ...rest }: ButtonProps) => {
    return (
        <button
            className={getButtonClassName({
                variant,
                disabled: rest.disabled,
                className,
            })}
            {...rest}
        >
            {children}
        </button>
    );
};
