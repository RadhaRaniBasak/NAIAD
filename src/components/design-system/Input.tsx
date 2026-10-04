/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

/** Shared by Input and Select: the field itself, without its paddings. */
export const FIELD_STYLES =
  'w-full text-slate-100 text-xs rounded-xl border transition-colors duration-150 placeholder:text-slate-400 disabled:opacity-60 disabled:bg-slate-850 disabled:cursor-not-allowed';
export const FIELD_NORMAL = 'bg-slate-900 border-control hover:border-slate-400';
export const FIELD_INVALID = 'bg-rose-950 border-rose-500';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      id,
      className = '',
      disabled,
      required,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const hasError = Boolean(error);
    const describedBy = hasError ? errorId : helperText ? helperId : undefined;

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-slate-200">
            {label}
            {required && <span className="text-rose-400 ml-0.5">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            className={`${FIELD_STYLES} py-2.5 px-3.5 ${leftIcon ? 'pl-9' : ''} ${rightIcon || hasError ? 'pr-9' : ''} ${
              hasError ? FIELD_INVALID : FIELD_NORMAL
            } ${className}`}
            {...props}
          />

          {hasError ? (
            <div className="absolute right-3 text-rose-400 pointer-events-none flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          ) : (
            rightIcon && (
              <div className="absolute right-3 text-slate-400 pointer-events-none flex items-center justify-center">
                {rightIcon}
              </div>
            )
          )}
        </div>

        {hasError && (
          <p id={errorId} role="alert" className="text-2xs text-rose-400 font-medium">
            {error}
          </p>
        )}

        {!hasError && helperText && (
          <p id={helperId} className="text-2xs text-slate-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
