/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Accessibility (WCAG 2.1 AA) Compliance Audit Suite
 * Renders the real components to static markup and audits:
 * 1. Form controls label pairing (htmlFor/id)
 * 2. ARIA inline error announcements (role="alert", aria-invalid, aria-describedby)
 * 3. Modal dialog semantics (role="dialog", aria-modal="true", aria-labelledby)
 * 4. Button loading states (aria-busy="true")
 * 5. WCAG 1.4.1 Non-color reliant freshness text labels
 * 6. Semantic Table markup (scope="col", captions)
 * 7. Page structure (one <h1>, named buttons and labelled fields on every page; text labels on the Overview)
 * 8. The shell's landmarks (navigation, main, skip link, current page)
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { assert } from '../../../test/assert.ts';
import { AppProvider } from '../../context/AppContext.tsx';
import { AppShell } from '../AppShell.tsx';
import { CoordinatorConsole } from '../CoordinatorConsole.tsx';
import { CrewsView } from '../CrewsView.tsx';
import { DesignSystemShowcase } from '../DesignSystemShowcase.tsx';
import { EvidenceView } from '../EvidenceView.tsx';
import { FhirBridgeView } from '../FhirBridgeView.tsx';
import { FreshnessMap } from '../FreshnessMap.tsx';
import { MissionList } from '../MissionList.tsx';
import { MissionsDispatchScreen } from '../MissionsDispatchScreen.tsx';
import { Overview } from '../Overview.tsx';
import { SafetyAndAboutModal } from '../SafetyAndAboutModal.tsx';
import { StatusPage } from '../StatusPage.tsx';
import { TraceHuntView } from '../TraceHuntView.tsx';
import { Button, Input, Modal, Table, ToastProvider } from '../design-system/index.ts';

/** Value of an attribute on the first `<tag>` in the markup. */
function attr(html: string, tag: string, name: string): string | undefined {
  return html.match(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`))?.[1];
}

/** True when the markup contains an element with this id. */
const hasId = (html: string, id: string | undefined) => Boolean(id) && html.includes(` id="${id}"`);

/** Buttons with neither text nor an aria-label: nothing for a screen reader to announce. */
function unnamedButtons(html: string): number {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(
    ([, attrs, inner]) =>
      !/aria-label="[^"]+"/.test(attrs) &&
      inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim() === ''
  ).length;
}

/** Fields with no aria-label and no <label for> pointing at them. */
function unlabelledFields(html: string): number {
  return [...html.matchAll(/<(?:input|select|textarea)\b([^>]*)>/g)].filter(([, attrs]) => {
    const id = attrs.match(/\sid="([^"]+)"/)?.[1];
    return !/aria-label="[^"]+"/.test(attrs) && !(id && html.includes(`for="${id}"`));
  }).length;
}

const AGE_IN_WORDS = /\d+ days? old|&lt;24h fresh|Never checked/;


console.log('--- RUNNING NAIAD WCAG 2.1 AA ACCESSIBILITY AUDIT SUITE ---');

// The two audits above, on markup with a known answer
assert(
  unnamedButtons('<button><svg><path/></svg></button><button aria-label="Close"><svg></svg></button><button>Go</button>') === 1,
  'The button audit catches an icon-only button without a name'
);
assert(
  unlabelledFields('<label for="a">A</label><input id="a"/><input id="b"/><select aria-label="C"></select>') === 1,
  'The field audit catches a field without a label'
);

// 1 & 2. Form Input: label binding and inline error announcement
const invalidInput = renderToStaticMarkup(<Input label="Stream Reach" error="Reach is required" />);
const inputId = attr(invalidInput, 'input', 'id');

assert(Boolean(inputId) && attr(invalidInput, 'label', 'for') === inputId, 'Input id matches label htmlFor attribute');
assert(attr(invalidInput, 'input', 'aria-invalid') === 'true', 'Input with error has aria-invalid="true"');
assert(
  attr(invalidInput, 'input', 'aria-describedby') === attr(invalidInput, 'p', 'id'),
  'Input has aria-describedby pointing to error element'
);
assert(attr(invalidInput, 'p', 'role') === 'alert', 'Inline error message uses role="alert"');

const hintedInput = renderToStaticMarkup(<Input label="Stream Reach" helperText="e.g. coi:r01" />);
assert(
  hasId(hintedInput, attr(hintedInput, 'input', 'aria-describedby')),
  'Input without error is described by its helper text'
);

// 3. Modal dialog semantics: the design-system Modal, and a screen built on it
const modal = renderToStaticMarkup(
  <Modal onClose={() => {}} title="Issue Mission" description="Fill form below">
    body
  </Modal>
);
assert(modal.includes('role="dialog"'), 'Modal uses role="dialog"');
assert(modal.includes('aria-modal="true"'), 'Modal uses aria-modal="true"');
assert(hasId(modal, attr(modal, 'div', 'aria-labelledby')), 'Modal header bound with aria-labelledby');
assert(hasId(modal, attr(modal, 'div', 'aria-describedby')), 'Modal description bound with aria-describedby');
assert(attr(modal, 'button', 'aria-label') === 'Close dialog', 'Modal icon-only close button has an accessible name');

const safetyModal = renderToStaticMarkup(<SafetyAndAboutModal onClose={() => {}} />);
assert(
  safetyModal.includes('role="dialog"') && safetyModal.includes('aria-modal="true"'),
  'Safety modal is announced as a modal dialog'
);
assert(hasId(safetyModal, attr(safetyModal, 'div', 'aria-labelledby')), 'Safety modal is labelled by its title');

// 4. Button loading state (WCAG 4.1.2)
const loadingButton = renderToStaticMarkup(<Button isLoading>Publish</Button>);
const isDisabled = (html: string) => /<button\b[^>]*\sdisabled=""/.test(html);
assert(attr(loadingButton, 'button', 'aria-busy') === 'true', 'Button announces aria-busy="true" during loading');
assert(
  attr(loadingButton, 'button', 'aria-disabled') === 'true' && !isDisabled(loadingButton),
  'A loading button is announced as unavailable but keeps keyboard focus (aria-disabled, not disabled)'
);
assert(isDisabled(renderToStaticMarkup(<Button disabled>Publish</Button>)), 'A disabled button carries the disabled attribute');

// 5. WCAG 1.4.1 (Use of Color Alone): every reach on the map carries a text age label
const map = renderToStaticMarkup(
  <AppProvider>
    <FreshnessMap />
  </AppProvider>
);
// Each reach node: its attributes and what it draws, up to its first closing group
const reachNodes = map
  .split('<g role="button"')
  .slice(1)
  .map((chunk) => chunk.slice(0, chunk.indexOf('</g>')));
assert(reachNodes.length > 0, `Freshness map renders its reaches (${reachNodes.length})`);
assert(
  reachNodes.every((node) => node.startsWith(' tabindex="0"') && /aria-label="[^"]+: [^"]*% fresh/.test(node)),
  'Every reach on the map is a keyboard-reachable button named with its age and freshness'
);
assert(
  reachNodes.every((node) => new RegExp(`<text[^>]*>(${AGE_IN_WORDS.source})<`).test(node)),
  'Every reach on the map shows its age as text, never color alone'
);

// 6. Table headers
const table = renderToStaticMarkup(
  <Table
    caption="Reach freshness"
    columns={[{ key: 'reach', header: 'Reach Segment' }]}
    data={[{ reach: 'coi:r01' }]}
    keyExtractor={(row) => row.reach}
  />
);
assert(attr(table, 'th', 'scope') === 'col', 'Table column header includes scope="col"');
assert(table.includes('<caption'), 'Table has a caption for screen readers');

// 7. Page structure: every page has exactly one <h1>, and the Overview states freshness in words
const pages = {
  Overview,
  FreshnessMap,
  MissionList,
  TraceHuntView,
  CrewsView,
  MissionsDispatchScreen,
  CoordinatorConsole,
  FhirBridgeView,
  EvidenceView,
  DesignSystemShowcase,
  StatusPage,
};
for (const [name, Page] of Object.entries(pages)) {
  const html = renderToStaticMarkup(
    <AppProvider>
      <ToastProvider>
        <Page />
      </ToastProvider>
    </AppProvider>
  );
  const headings = html.match(/<h1\b/g)?.length ?? 0;
  assert(headings === 1, `${name} has exactly one <h1> (${headings})`);
  assert(unnamedButtons(html) === 0, `${name}: every button has a name (${unnamedButtons(html)} without)`);
  assert(unlabelledFields(html) === 0, `${name}: every field has a label (${unlabelledFields(html)} without)`);
}

const overview = renderToStaticMarkup(
  <AppProvider>
    <Overview />
  </AppProvider>
);
const overviewRows = overview
  .split('title="Open this reach on the map"')
  .slice(1)
  .map((chunk) => chunk.slice(0, chunk.indexOf('</button>')));
assert(overviewRows.length === reachNodes.length, `Overview lists every reach (${overviewRows.length})`);
assert(
  overviewRows.every((row) => AGE_IN_WORDS.test(row) && />(Fresh|Aging|Stale)</.test(row)),
  'Every reach on the Overview has its age and its freshness state in words'
);

// 8. The shell: landmarks, the skip link, the current page, named controls
const shell = renderToStaticMarkup(
  <AppProvider>
    <ToastProvider>
      <AppShell onOpenSafetyModal={() => {}} onOpenStatusPage={() => {}}>
        <Overview />
      </AppShell>
    </ToastProvider>
  </AppProvider>
);
assert(shell.includes('<nav aria-label="Main"'), 'The navigation is a named landmark');
assert(
  (shell.match(/<main\b/g)?.length ?? 0) === 1 && shell.includes('id="main"') && shell.includes('href="#main"'),
  'There is one main landmark, and a skip link leads to it'
);
assert(
  (shell.match(/aria-current="page"/g)?.length ?? 0) === 1,
  'Exactly one navigation item is marked as the current page'
);
assert(unnamedButtons(shell) === 0, `Every button in the shell has a name (${unnamedButtons(shell)} without)`);
assert(/<label\b[^>]*><span class="sr-only">City<\/span>[\s\S]*?<select/.test(shell), 'The city picker is labelled');

console.log('✅ ALL WCAG 2.1 AA ACCESSIBILITY AUDIT CHECKS PASSED!\n');
