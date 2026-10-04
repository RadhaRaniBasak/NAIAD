/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TONE_STYLES, type Tone } from './Tone.tsx';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
}

/** One headline number with its label and an explanatory caption. */
export const StatCard: React.FC<StatCardProps> = ({ label, value, caption, icon, tone = 'primary' }) => (
  <div className="card flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-3.5 sm:p-5">
    {icon && (
      <span className={`tile ${TONE_STYLES[tone]}`} aria-hidden="true">
        {icon}
      </span>
    )}
    {/* Captions can hold free text (a crew name): long words break instead of widening the card. */}
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="text-2xs font-medium text-slate-400">{label}</div>
      <div className="text-2xl font-bold tracking-tight text-slate-50 tabular-nums mt-0.5">{value}</div>
      {caption && <div className="text-2xs text-slate-400 mt-1">{caption}</div>}
    </div>
  </div>
);
