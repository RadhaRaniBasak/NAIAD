/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface ChoiceProps<T extends string> {
  options: readonly { id: T; label: React.ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  /** Names the group for assistive technology, e.g. "Indicator group". */
  label: string;
}

/**
 * Two to four short, mutually exclusive choices in one track: view switchers, the role toggle.
 * Where the track does not fit, its options wrap onto a second line inside it.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: ChoiceProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-850 p-1 text-xs"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold transition-colors ${
            value === option.id
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The same kind of choice as separate pills that wrap: filters, and choices with long labels. */
export function Chips<T extends string>({ options, value, onChange, label }: ChoiceProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 text-xs">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`cursor-pointer rounded-full border px-3 py-1.5 font-semibold transition-colors ${
            value === option.id
              ? 'border-transparent bg-primary text-on-primary shadow-sm'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-slate-50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
