/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button.tsx';
import { TONE_STYLES, type Tone } from './Tone.tsx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** The overlays that are open, the top one last: only that one answers the keyboard. */
const openOverlays: HTMLElement[] = [];

/**
 * Behaviour shared by everything that opens over the page (dialogs, the navigation drawer):
 * focus moves into the overlay and stays there, Escape closes it, and focus returns to where it
 * was. Put the returned ref on the overlay's container, which needs `tabIndex={-1}`.
 * The page behind stops scrolling through a CSS rule on `aria-modal` (src/index.css).
 */
export function useOverlay<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previouslyFocused = document.activeElement;
    openOverlays.push(node);
    node.focus();

    // On the document, not on the overlay: focus can fall back to <body> (a focused button that
    // becomes disabled, a toast that is dismissed), and the keyboard must still work then.
    const onKeyDown = (event: KeyboardEvent) => {
      if (openOverlays[openOverlays.length - 1] !== node) return;
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const isOutside = !node.contains(active);
      if (!first) {
        event.preventDefault();
        node.focus();
      } else if (event.shiftKey && (isOutside || active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (isOutside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openOverlays.splice(openOverlays.indexOf(node), 1);
      // Back to what opened the overlay, or to the page when that element is gone.
      const target =
        previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected
          ? previouslyFocused
          : document.querySelector<HTMLElement>('main');
      target?.focus();
    };
  }, []);

  return ref;
}

const MAX_WIDTH = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export interface ModalProps {
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  /** A short line above the title: a badge, a timer. */
  eyebrow?: React.ReactNode;
  /** An icon shown in a tile next to the title, coloured by `tone`. */
  icon?: React.ReactNode;
  tone?: Tone;
  children: React.ReactNode;
  maxWidth?: keyof typeof MAX_WIDTH;
}

/** A dialog over the page. Render it while it should be open; closing is the caller's state. */
/**
 * Props for an overlay's backdrop: a click on it closes the overlay, but only a deliberate one.
 * Not the release of a drag that started inside the dialog (selecting text there), and not the
 * second click of the double-click that opened it.
 */
export function useBackdropClose(onClose: () => void) {
  const pressedOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => {
      pressedOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && pressedOnBackdrop.current && e.detail <= 1) onClose();
    },
  };
}

export const Modal: React.FC<ModalProps> = ({
  onClose,
  title,
  description,
  eyebrow,
  icon,
  tone = 'primary',
  children,
  maxWidth = 'md',
}) => {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useOverlay<HTMLDivElement>(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:p-4"
      {...useBackdropClose(onClose)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`my-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-slate-300 shadow-pop animate-in zoom-in-95 duration-150 focus-visible:outline-none ${MAX_WIDTH[maxWidth]}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className={`tile ${TONE_STYLES[tone]}`} aria-hidden="true">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <div className="mb-1 flex flex-wrap items-center gap-2 text-2xs text-slate-400">{eyebrow}</div>
              )}
              <h2 id={titleId} className="text-base font-bold tracking-tight text-slate-50">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-0.5 text-xs text-slate-400">
                  {description}
                </p>
              )}
            </div>
          </div>
          <IconButton label="Close dialog" plain onClick={onClose} className="-mr-1 -mt-1">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
};
