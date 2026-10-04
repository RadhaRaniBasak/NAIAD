/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TONE_STYLES, type Tone } from './Tone.tsx';

export interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  /** Actions or a status, shown at the end of the row (below the title when there is no room). */
  children?: React.ReactNode;
}

/** The title block at the top of every page: the page's only <h1>. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, icon, tone = 'primary', children }) => (
  <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
    <div className="flex min-w-[min(100%,22rem)] flex-1 items-start gap-3">
      {icon && (
        <span className={`tile mt-0.5 ${TONE_STYLES[tone]}`} aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-xs text-slate-400 sm:text-sm">{description}</p>}
      </div>
    </div>
    {children && <div className="flex max-w-full flex-wrap items-center gap-2">{children}</div>}
  </header>
);
