/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button.tsx';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center rounded-2xl border border-rose-800 bg-rose-950 p-8 text-center ${className}`}
    >
      <div className="tile mb-3 border-rose-800 bg-rose-900 text-rose-300" aria-hidden="true">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h2 className="text-sm font-bold tracking-tight text-rose-200">{title}</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-rose-300">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          className="mt-4"
        >
          Try Again
        </Button>
      )}
    </div>
  );
};
