/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useId } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { FIELD_INVALID, FIELD_NORMAL, FIELD_STYLES } from './Input.tsx';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      options,
      id,
      className = '',
      disabled,
      required,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    const hasError = Boolean(error);
    const describedBy = hasError ? errorId : helperText ? helperId : undefined;

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-slate-200">
            {label}
            {required && <span className="text-rose-400 ml-0.5">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            className={`${FIELD_STYLES} appearance-none py-2.5 pl-3.5 pr-10 ${
              hasError ? FIELD_INVALID : FIELD_NORMAL
            } ${className}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
                {opt.label}
              </option>
            ))}
          </select>

          <div className="absolute right-3 text-slate-400 pointer-events-none flex items-center justify-center">
            {hasError ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
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

Select.displayName = 'Select';
