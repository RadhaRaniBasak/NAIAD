/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Light and dark theme. Light is the default; the choice is kept in localStorage and applied
 * as `data-theme` on <html> (public/theme.js applies it before the first paint).
 * The colours themselves live in src/index.css.
 */

import { useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'naiad.theme';

function currentTheme(): Theme {
  // No document when a component is rendered to markup in a test: that is the default light theme.
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** The active theme and a function that switches to the other one. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private browsing): the choice lasts until the page closes.
    }
    setTheme(next);
  };

  return [theme, toggle];
}
