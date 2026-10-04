/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  /** Read by screen readers: say what the table lists. */
  caption?: string;
  className?: string;
}

const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' };

/**
 * A data table. Cells stay on one line and headers wrap, so on narrow screens it scrolls sideways
 * inside its own box instead of squeezing. Put it in a card or a flush Panel.
 */
export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found.',
  caption,
  className = '',
}: TableProps<T>) {
  return (
    <div
      className={`w-full overflow-x-auto ${className}`}
      {...(caption ? { role: 'region', 'aria-label': caption, tabIndex: 0 } : {})}
    >
      <table className="w-full border-collapse text-left text-xs">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-slate-800 bg-slate-850 text-3xs font-semibold uppercase tracking-wider text-slate-400">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-2.5 align-bottom sm:px-5 ${ALIGN_CLASS[col.align ?? 'left']}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-300">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr key={keyExtractor(item)} className="transition-colors hover:bg-slate-850">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap px-4 py-3 align-middle sm:px-5 ${ALIGN_CLASS[col.align ?? 'left']} ${col.className || ''}`}
                  >
                    {col.render ? col.render(item) : (item[col.key as keyof T] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
