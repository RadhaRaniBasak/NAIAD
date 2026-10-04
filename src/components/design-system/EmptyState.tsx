/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button } from './Button.tsx';
import { TONE_STYLES, type Tone } from './Tone.tsx';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  tone?: Tone;
  title: string;
  description: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  tone = 'primary',
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900 p-8 text-center ${className}`}
    >
      {icon && (
        <div className={`tile mb-3 ${TONE_STYLES[tone]}`} aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-sm font-bold tracking-tight text-slate-50">{title}</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
