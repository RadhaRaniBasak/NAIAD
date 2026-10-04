/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/** Tinted background, border and text for each tone. Shared by badges, icon tiles and notices. */
export const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-300 border-slate-700',
  primary: 'bg-cyan-950 text-cyan-300 border-cyan-800',
  success: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  warning: 'bg-amber-950 text-amber-300 border-amber-800',
  danger: 'bg-rose-950 text-rose-300 border-rose-800',
  info: 'bg-indigo-950 text-indigo-300 border-indigo-800',
};

/** The strong fill of each tone, for bars and marks. */
const FILL_STYLES: Record<Tone, string> = {
  neutral: 'bg-slate-500',
  primary: 'bg-cyan-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-indigo-500',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** A small status pill. The text carries the meaning; the tone only supports it. */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className = '', children, ...props }) => (
  <span className={`badge ${TONE_STYLES[tone]} ${className}`} {...props}>
    {children}
  </span>
);

export interface NoticeProps {
  tone?: Tone;
  icon?: React.ReactNode;
  /** Announce the notice to assistive technology when it appears. */
  role?: 'status' | 'alert';
  children: React.ReactNode;
  className?: string;
}

/** A tinted block for a message that belongs to the surrounding content. */
export const Notice: React.FC<NoticeProps> = ({ tone = 'neutral', icon, role, children, className = '' }) => (
  <div role={role} className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${TONE_STYLES[tone]} ${className}`}>
    {icon && (
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
    )}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export interface MeterProps {
  /** 0 to 100. */
  value: number;
  tone?: Tone;
}

/** A bar for a 0-100 value. It is decorative: always print the number next to it. */
export const Meter: React.FC<MeterProps> = ({ value, tone = 'primary' }) => (
  <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
    <span
      className={`block h-full rounded-full transition-[width] duration-500 ${FILL_STYLES[tone]}`}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </span>
);
