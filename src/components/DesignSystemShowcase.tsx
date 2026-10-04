/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The design system on one page: colour roles, type scale and every shared component, with
 * sample content. Colours and sizes are defined in src/index.css; components live in
 * ./design-system/.
 */

import React, { useState } from 'react';
import {
  Badge,
  Button,
  Chips,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Meter,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Segmented,
  Select,
  SkeletonCard,
  StatCard,
  Table,
  useToast,
  type Tone,
} from './design-system/index.ts';
import { Sparkles, Droplets, Search, Trash2, Compass, Palette, Gauge, Info, Bell, Timer } from 'lucide-react';

const TONES: Tone[] = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'];

/** The neutral scale: a step always plays the same role, and its value depends on the theme. */
const NEUTRAL_ROLES = [
  { swatch: 'bg-slate-950', step: '950', role: 'Page background' },
  { swatch: 'bg-slate-900', step: '900', role: 'Card surface' },
  { swatch: 'bg-slate-850', step: '850', role: 'Quiet surface' },
  { swatch: 'bg-slate-800', step: '800', role: 'Fills, quiet borders' },
  { swatch: 'bg-slate-700', step: '700', role: 'Borders' },
  { swatch: 'bg-slate-500', step: '500', role: 'Marks, not text' },
  { swatch: 'bg-slate-400', step: '400', role: 'Muted text' },
  { swatch: 'bg-slate-300', step: '300', role: 'Body text' },
  { swatch: 'bg-slate-50', step: '50', role: 'Headings' },
];

const SOLIDS = [
  { name: 'primary', className: 'bg-primary text-on-primary' },
  { name: 'success', className: 'bg-success text-on-success' },
  { name: 'warning', className: 'bg-warning text-on-warning' },
  { name: 'danger', className: 'bg-danger text-on-danger' },
];

const TYPE_SCALE = [
  { className: 'text-2xl font-bold tracking-tight text-slate-50', name: 'text-2xl', use: 'Page title, headline numbers' },
  { className: 'text-base font-bold text-slate-50', name: 'text-base', use: 'Dialog and card titles' },
  { className: 'text-sm font-semibold text-slate-50', name: 'text-sm', use: 'Section titles' },
  { className: 'text-xs text-slate-300', name: 'text-xs · 13px', use: 'Body text' },
  { className: 'text-2xs text-slate-400', name: 'text-2xs · 12px', use: 'Captions and hints' },
  { className: 'text-3xs font-semibold uppercase tracking-wider text-slate-400', name: 'text-3xs · 11px', use: 'Badges, table headers' },
];

const VIEW_OPTIONS = [
  { id: 'map', label: 'Map' },
  { id: 'list', label: 'List' },
  { id: 'table', label: 'Table' },
] as const;

const SAMPLE_ROWS = [
  { id: '1', reach: 'coi:r01', length: '260m', status: 'Fresh', tone: 'success' as Tone, age: '1 day old' },
  { id: '2', reach: 'coi:r02', length: '250m', status: 'Aging', tone: 'warning' as Tone, age: '3 days old' },
  { id: '3', reach: 'coi:r03', length: '240m', status: 'Stale', tone: 'danger' as Tone, age: '8 days old' },
];

export const DesignSystemShowcase: React.FC = () => {
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('Too short');
  const [selectValue, setSelectValue] = useState('water');
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  const [view, setView] = useState<(typeof VIEW_OPTIONS)[number]['id']>('map');
  const [offline, setOffline] = useState(false);

  const inputError = inputValue.length < 10 ? 'Observation notes must be at least 10 characters.' : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Design System"
        description="The building blocks of every screen: colour roles that hold in both themes, one type scale and the shared components. Switch the theme in the top bar to see all of it in light and dark."
        icon={<Palette className="h-5 w-5" />}
      />

      <Panel
        title="Colour roles"
        description="A step of a scale always plays the same role. Light and dark only change its value (src/index.css)."
      >
        <div className="space-y-5">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {NEUTRAL_ROLES.map((item) => (
              <li key={item.step} className="space-y-1.5">
                <div className={`h-10 rounded-xl border border-slate-700 ${item.swatch}`} />
                <div className="text-2xs">
                  <span className="font-mono font-semibold text-slate-200">slate-{item.step}</span>
                  <span className="block text-slate-400">{item.role}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">Tones: tinted background, border and text</h3>
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone}>
                  {tone}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">Solid fills, each with its own readable text colour</h3>
            <div className="flex flex-wrap gap-2">
              {SOLIDS.map((solid) => (
                <span key={solid.name} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${solid.className}`}>
                  {solid.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Type scale" description="System fonts. The small end is one pixel larger than Tailwind's default.">
        <ul className="space-y-3">
          {TYPE_SCALE.map((item) => (
            <li key={item.name} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <span className={item.className}>{item.use}</span>
              <span className="font-mono text-2xs text-slate-400">{item.name}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Buttons" description="Variants, sizes, icons and states.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="success">Success</Button>
            <Button variant="warning">Warning</Button>
            <Button variant="danger">Danger</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="primary" leftIcon={<Sparkles className="w-3.5 h-3.5" />}>
              Small with Icon
            </Button>
            <Button size="md" variant="secondary" leftIcon={<Compass className="w-4 h-4" />}>
              Medium with Icon
            </Button>
            <Button size="lg" variant="primary" rightIcon={<Droplets className="w-4 h-4" />}>
              Large Button
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              isLoading={isButtonLoading}
              onClick={() => {
                setIsButtonLoading(true);
                setTimeout(() => setIsButtonLoading(false), 1500);
              }}
            >
              {isButtonLoading ? 'Submitting...' : 'Click for Loading State'}
            </Button>
            <Button variant="primary" disabled>
              Disabled Primary
            </Button>
            <Button variant="secondary" disabled>
              Disabled Secondary
            </Button>
            <Button variant="danger" leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
              Delete Mission
            </Button>
            <IconButton label="Icon button">
              <Bell className="h-4 w-4" />
            </IconButton>
            <IconButton label="Toggle icon button" aria-pressed={offline} onClick={() => setOffline(!offline)}>
              <Info className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Badges, notices and meters" description="Colour supports the words; it never replaces them.">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">Fresh · 1 day old</Badge>
              <Badge tone="warning">Aging · 3 days old</Badge>
              <Badge tone="danger">Stale · 8 days old</Badge>
            </div>
            <Notice tone="warning" icon={<Info className="h-4 w-4" />}>
              A notice belongs to the content around it, in any of the six tones.
            </Notice>
            <div className="space-y-2">
              {[
                { label: 'Water', value: 16, tone: 'danger' as Tone },
                { label: 'Vegetation', value: 63, tone: 'warning' as Tone },
                { label: 'Structure', value: 92, tone: 'success' as Tone },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-2xs">
                  <span className="w-20 text-slate-300">{row.label}</span>
                  <Meter value={row.value} tone={row.tone} />
                  <span className="w-9 text-right tabular-nums text-slate-400">{row.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Choices" description="A track for a few short options; pills when there are many or they are long.">
          <div className="space-y-4">
            <Segmented label="Example view" options={VIEW_OPTIONS} value={view} onChange={setView} />
            <Chips label="Example filter" options={VIEW_OPTIONS} value={view} onChange={setView} />
            <p className="text-2xs text-slate-400">
              Both are groups of toggle buttons: the chosen one carries <code>aria-pressed</code>.
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Inputs & Select Dropdowns"
        description="Every field has a label bound to it, an optional hint, and an error that is announced when it appears."
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Input
            label="Default Input"
            placeholder="Search by reach ID..."
            leftIcon={<Search className="w-4 h-4" />}
            helperText="e.g. coi:r01 or Pedrulha Bridge"
          />

          <Input
            label="Input with Inline Validation Error"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            error={inputError}
            helperText="Valid: the note is long enough."
          />

          <Select
            label="Indicator Target Group"
            value={selectValue}
            onChange={(e) => setSelectValue(e.target.value)}
            options={[
              { value: 'water', label: 'Water Appearance & Odor (3-day half-life)' },
              { value: 'vegetation', label: 'Riparian Canopy & Bank Cover (45-day half-life)' },
              { value: 'structure', label: 'Hydraulic Structures & Barriers (365-day half-life)' },
            ]}
            helperText="Determines decay half-life and bounty urgency"
          />

          <Input label="Disabled Field" value="Not editable" disabled readOnly />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Stat card" value="55%" caption="One number, its label and a caption" icon={<Gauge className="h-5 w-5" />} tone="warning" />
        <StatCard label="Open missions" value={4} caption="Sample value" icon={<Timer className="h-5 w-5" />} />
        <StatCard label="Without an icon" value="240" caption="Sample value" />
        <StatCard label="Success tone" value="3/8" caption="Sample value" icon={<Sparkles className="h-5 w-5" />} tone="success" />
      </div>

      <Panel
        title="Modals & Notifications (Toasts)"
        description="A dialog keeps keyboard focus inside it, closes on Escape or a click outside, and gives focus back. Toasts dismiss themselves."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            Open Accessible Modal
          </Button>
          <Button variant="secondary" onClick={() => showToast('success', 'Success toast', 'Something worked.')}>
            Trigger Success Toast
          </Button>
          <Button variant="secondary" onClick={() => showToast('error', 'Error toast', 'Something failed, and why.')}>
            Trigger Error Toast
          </Button>
          <Button variant="secondary" onClick={() => showToast('warning', 'Warning toast', 'Something needs attention.')}>
            Trigger Warning Toast
          </Button>
          <Button variant="secondary" onClick={() => showToast('info', 'Info toast', 'Something happened.')}>
            Trigger Info Toast
          </Button>
        </div>

        {isModalOpen && (
          <Modal
            onClose={() => setIsModalOpen(false)}
            title="Demonstration Dialog"
            description="Press Tab to move through it, Esc or a click outside to close."
            icon={<Sparkles className="h-5 w-5" />}
          >
            <div className="space-y-4 text-xs">
              <p className="text-slate-300">
                The dialog is announced as a modal dialog (<code>role="dialog"</code>, <code>aria-modal</code>),
                labelled by its title, and the page behind it does not scroll.
              </p>
              <Input label="Sample Field Inside Dialog" placeholder="Type notes here..." />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setIsModalOpen(false);
                    showToast('success', 'Saved Changes', 'The dialog closed and focus went back to its button.');
                  }}
                >
                  Confirm Action
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </Panel>

      <Panel title="Data Table" description="Column headers are scoped, the caption is read by screen readers, and it scrolls sideways on phones." flush>
        <Table
          data={SAMPLE_ROWS}
          keyExtractor={(item) => item.id}
          caption="Sample Reach Freshness Table"
          columns={[
            { key: 'reach', header: 'Reach Segment', className: 'font-mono font-semibold text-cyan-400' },
            { key: 'length', header: 'Length' },
            { key: 'status', header: 'Freshness State', render: (item) => <Badge tone={item.tone}>{item.status}</Badge> },
            { key: 'age', header: 'Data Age (Text Label)', className: 'font-medium text-slate-200' },
          ]}
        />
      </Panel>

      <Panel title="Empty & Error States" description="Say what happened and offer the next step.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <EmptyState
            icon={<Droplets className="h-5 w-5" />}
            title="No Active Bounties"
            description="An empty state explains why there is nothing to show and, when it can, offers one action."
            actionLabel="Example action"
            onAction={() => showToast('info', 'Example action', 'The empty state button was pressed.')}
          />

          <ErrorState
            title="Could Not Load Missions"
            message="An error state names the problem in plain words and offers a retry."
            onRetry={() => showToast('info', 'Retry', 'The retry button was pressed.')}
          />
        </div>
      </Panel>

      <Panel title="Loading Skeletons" description="Stand-ins with the shape of the content, so the page does not jump when data arrives.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Panel>
    </div>
  );
};
