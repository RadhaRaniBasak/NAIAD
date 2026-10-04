/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface PanelProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Shown at the end of the header: a count, a filter, a button. */
  action?: React.ReactNode;
  /** No padding around the content: for tables and lists that run edge to edge. */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** A card with a titled header: the standard section of a page. */
export const Panel: React.FC<PanelProps> = ({ title, description, icon, action, flush = false, className = '', children }) => (
  <section className={`card flex flex-col ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="shrink-0 text-slate-400" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-50">{title}</h2>
          {description && <p className="mt-0.5 text-2xs text-slate-400">{description}</p>}
        </div>
      </div>
      {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
    </div>
    <div className={`min-w-0 flex-1 ${flush ? '' : 'p-4 sm:p-5'}`}>{children}</div>
  </section>
);
