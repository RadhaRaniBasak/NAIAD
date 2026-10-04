/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Colour contrast of the design tokens, in both themes (WCAG 2.1 AA: 1.4.3 and 1.4.11).
 * src/index.css gives every step of a colour scale a role; this suite reads the colours from
 * that file (and Tailwind's palette for the dark theme) and checks the role pairs listed below:
 * text on surfaces, text on tints, text on solid fills, the outline of text fields, the focus
 * ring and accent marks. It checks the tokens, not how each screen uses them.
 */

import { readFileSync } from 'node:fs';
import tailwindColors from 'tailwindcss/colors';
import { assert } from '../../../test/assert.ts';

console.log('--- RUNNING DESIGN TOKEN CONTRAST SUITE ---');

type Rgb = [number, number, number];

/** oklch() to linear sRGB, then gamma-encoded 0..1 (CSS Color 4). */
function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  return linear.map((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

function parseColor(value: string): Rgb {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as Rgb;
  const oklch = value.match(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/);
  if (oklch) return oklchToRgb(Number(oklch[1]) / 100, Number(oklch[2]), Number(oklch[3]));
  throw new Error(`Unsupported colour: ${value}`);
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(parseColor(a)), luminance(parseColor(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Known answers for the colour maths: black on white, and Tailwind's slate-950 written both ways
assert(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9, 'Black on white is 21:1');
assert(contrast('oklch(12.9% 0.042 264.695)', '#020617') < 1.01, 'An oklch colour converts to the same sRGB colour as its hex form');

// The colours of each theme: Tailwind's palette, then the app's tokens, then the light overrides.
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
const lightStart = css.indexOf(":root:not([data-theme='dark'])");
const declared = (block: string) =>
  Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const tailwind: Record<string, string> = {};
for (const [name, steps] of Object.entries(tailwindColors)) {
  if (typeof steps === 'object') for (const [step, value] of Object.entries(steps)) tailwind[`${name}-${step}`] = value;
}
const dark = { ...tailwind, ...declared(css.slice(css.indexOf('@theme'), lightStart)) };
const light = { ...dark, ...declared(css.slice(lightStart, css.indexOf('@layer base'))) };

const ACCENTS = ['cyan', 'emerald', 'amber', 'rose', 'indigo'];
const SOLIDS = ['primary', 'success', 'warning', 'danger'];
const TEXT = 4.5; // WCAG 1.4.3, normal text
const OUTLINE = 3; // WCAG 1.4.11, the boundary of a control

for (const [theme, color] of Object.entries({ light, dark })) {
  const failures: string[] = [];
  const need = (foreground: string, background: string, minimum: number) => {
    const ratio = contrast(color[foreground], color[background]);
    if (ratio < minimum) failures.push(`${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`);
  };
  /** Asserts that no pair checked since the last call fell short, naming the ones that did. */
  const settle = (claim: string) => {
    assert(failures.length === 0, `[${theme}] ${claim}${failures.length > 0 ? ` (${failures.join('; ')})` : ''}`);
    failures.length = 0;
  };

  // Neutral text (400 is the faintest text step) on every surface text is set on
  for (const text of ['slate-50', 'slate-100', 'slate-200', 'slate-300', 'slate-400']) {
    for (const surface of ['slate-950', 'slate-900', 'slate-850', 'slate-800']) need(text, surface, TEXT);
  }
  settle('Neutral text reads on every surface');

  // Accent text: 400 on plain surfaces, 300 and 200 on the accent's own tints
  for (const accent of ACCENTS) {
    for (const surface of ['slate-950', 'slate-900', 'slate-850']) need(`${accent}-400`, surface, TEXT);
    for (const text of [`${accent}-300`, `${accent}-200`]) {
      for (const tint of [`${accent}-950`, `${accent}-900`]) need(text, tint, TEXT);
    }
  }
  settle('Accent text reads on surfaces and on its own tints');

  // Solid fills carry their own text colour, at rest and hovered
  for (const solid of SOLIDS) {
    need(`on-${solid}`, solid, TEXT);
    need(`on-${solid}`, `${solid}-hover`, TEXT);
  }
  need('primary', 'on-primary', TEXT); // the count pill of the active navigation item
  settle('Text on solid fills reads');

  // Text fields are outlined against the surfaces they sit on; the focus ring shows on all of them
  for (const surface of ['slate-950', 'slate-900', 'slate-850']) {
    need('control', surface, OUTLINE);
    need('primary', surface, OUTLINE);
  }
  settle('Field outlines and the focus ring are visible');

  // Marks that carry information as a shape: meter bars, map nodes, the donut (WCAG 1.4.11)
  for (const accent of ACCENTS) {
    for (const surface of ['slate-900', 'slate-850']) need(`${accent}-500`, surface, OUTLINE);
  }
  settle('Accent marks stand out from the card they are drawn on');
}

console.log('✅ ALL DESIGN TOKEN CONTRAST CHECKS PASSED!\n');
