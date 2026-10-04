/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const SIZE_STYLES = {
  sm: 'text-xs px-3 py-1.5 rounded-lg gap-1.5',
  md: 'text-xs px-4 py-2.5 rounded-xl gap-2',
  lg: 'text-sm px-5 py-3 rounded-xl gap-2.5',
};

// Solid variants take their fill and their text colour from the theme (src/index.css),
// so each stays readable in both themes.
const VARIANT_STYLES = {
  primary: 'bg-primary hover:bg-primary-hover text-on-primary shadow-sm',
  success: 'bg-success hover:bg-success-hover text-on-success shadow-sm',
  warning: 'bg-warning hover:bg-warning-hover text-on-warning shadow-sm',
  danger: 'bg-danger hover:bg-danger-hover text-on-danger shadow-sm',
  secondary: 'bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-700 hover:border-slate-600 shadow-sm',
  outline: 'bg-transparent hover:bg-slate-800 text-slate-300 hover:text-slate-50 border border-slate-700',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 hover:text-slate-50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      className = '',
      type = 'button',
      onClick,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold transition-colors duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]';
    const sizeStyles = SIZE_STYLES[size];
    const variantStyles = VARIANT_STYLES[variant];

    // While loading, the button ignores clicks but is not `disabled`: a disabled button drops
    // keyboard focus onto the page, and the reader loses their place.
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        aria-disabled={isLoading || undefined}
        aria-busy={isLoading}
        onClick={isLoading ? (event) => event.preventDefault() : onClick}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${isLoading ? 'cursor-progress opacity-70' : 'cursor-pointer'} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" aria-hidden="true" />
        ) : (
          leftIcon && <span className="shrink-0" aria-hidden="true">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="shrink-0" aria-hidden="true">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** What the button does. An icon-only button has no visible text, so this is its name. */
  label: string;
  /** No border and no background until hovered: for buttons inside a header or a row. */
  plain?: boolean;
}

/** A square button that shows only an icon. Pass `aria-pressed` to make it a toggle: it is tinted while on. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, plain = false, className = '', type = 'button', children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-50 aria-pressed:border-amber-800 aria-pressed:bg-amber-950 aria-pressed:text-amber-300 ${
        plain ? '' : 'border border-slate-800 bg-slate-900'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);

IconButton.displayName = 'IconButton';
