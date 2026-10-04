/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/** A grey block standing in for content that is still loading. Size it with `className`. */
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-md bg-slate-800 ${className}`} />
);

/** The loading stand-in for one card of a card grid. */
export const SkeletonCard: React.FC = () => {
  return (
    <div aria-hidden="true" className="card animate-pulse space-y-3 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
};
