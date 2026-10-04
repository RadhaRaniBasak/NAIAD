/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The frame around every page: the sidebar with the navigation, the top bar and the footer.
 * On screens narrower than Tailwind's `lg` the sidebar becomes a drawer, and the demo controls
 * (city, role, weather, offline) move from the top bar into it.
 */

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Award,
  ChevronDown,
  CloudRain,
  Download,
  Droplets,
  ExternalLink,
  FlaskConical,
  Info,
  LayoutDashboard,
  Map as MapIcon,
  MapPin,
  Menu,
  Moon,
  Palette,
  Radar,
  Radio,
  ShieldCheck,
  Sun,
  Timer,
  Users,
  Wifi,
  WifiOff,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useApp, type Tab } from '../context/AppContext.tsx';
import { CITIES } from '../data/cities.ts';
import { PARAMS } from '../engine/params.ts';
import { useTheme } from '../theme.ts';
import type { User } from '../types/index.ts';
import { Button, IconButton, Segmented, TONE_STYLES, useBackdropClose, useOverlay, type Tone } from './design-system/index.ts';
import { isActiveIncident } from './presentation.ts';

/**
 * Address of the public source repository, set when the frontend is built (VITE_REPO_URL).
 * Without it the footer offers the repository as a download, which the server packs with python3.
 */
const REPO_URL: string | undefined = import.meta.env?.VITE_REPO_URL;

interface NavItem {
  id: Tab;
  label: string;
  icon: LucideIcon;
  coordinatorOnly?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Home',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'map', label: 'Freshness Map', icon: MapIcon },
    ],
  },
  {
    label: 'Field work',
    items: [
      { id: 'missions', label: '1-Minute Missions', icon: Timer },
      { id: 'trace', label: 'Trace Hunts', icon: Radar },
      { id: 'crews', label: 'Crews & Streaks', icon: Users },
    ],
  },
  {
    label: 'Coordination',
    items: [
      { id: 'dispatch', label: 'Dispatch Queue', icon: Radio },
      { id: 'console', label: 'Coordinator Console', icon: ShieldCheck, coordinatorOnly: true },
      { id: 'fhir', label: 'Systems to Streams', icon: Workflow },
    ],
  },
  {
    label: 'Insight',
    items: [
      { id: 'evidence', label: 'Evidence & Studies', icon: FlaskConical },
      { id: 'design', label: 'Design System', icon: Palette },
    ],
  },
];

const ROLE_OPTIONS = [
  { id: 'citizen', label: 'Volunteer' },
  { id: 'coordinator', label: 'Coordinator' },
] as const satisfies readonly { id: User['role']; label: string }[];

const DESKTOP_QUERY = '(min-width: 64rem)'; // Tailwind's `lg`, in rem like Tailwind so both follow the reader's font size

/** True when the sidebar fits next to the page. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP_QUERY);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  );
}

const isStormy = (maxRain24hMm: number) => maxRain24hMm >= PARAMS.rainShockMm24h;

/** The Naiad mark: a droplet on the brand gradient. */
export const BrandMark: React.FC = () => (
  <span
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-success text-on-primary shadow-sm"
    aria-hidden="true"
  >
    <Droplets className="h-5 w-5" />
  </span>
);

const Brand: React.FC = () => (
  <div className="flex min-w-0 items-center gap-2.5">
    <BrandMark />
    <div className="min-w-0">
      <div className="text-base font-extrabold leading-tight tracking-tight text-slate-50">Naiad</div>
      <div className="truncate text-3xs leading-tight text-slate-400">OneAquaHealth citizen science</div>
    </div>
  </div>
);

/** The page links. `onNavigate` runs after a link is chosen (the drawer uses it to close). */
const Navigation: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { activeTab, setActiveTab, user, missions, incidents } = useApp();

  // What the number next to a page counts, in words for screen readers ("1-Minute Missions, 4 open").
  const counts: Partial<Record<Tab, { total: number; noun: string }>> = {
    missions: { total: missions.length, noun: 'open' },
    trace: { total: incidents.filter(isActiveIncident).length, noun: 'active' },
  };

  return (
    <nav aria-label="Main" className="space-y-5 px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1.5 text-3xs font-semibold uppercase tracking-wider text-slate-400">
            {group.label}
          </div>
          <ul className="space-y-0.5">
            {group.items
              .filter((item) => !item.coordinatorOnly || user.role === 'coordinator')
              .map((item) => {
                const isActive = activeTab === item.id;
                const count = counts[item.id];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => {
                        setActiveTab(item.id);
                        onNavigate?.();
                      }}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50'
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count && count.total > 0 && (
                        <span
                          className={`rounded-full px-1.5 text-3xs font-bold tabular-nums ${
                            isActive ? 'bg-on-primary text-primary' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span className="sr-only">, </span>
                          {count.total}
                          <span className="sr-only"> {count.noun}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
};

/** Who is using the app: nickname and crew. */
const UserCard: React.FC = () => {
  const { user, crews } = useApp();
  const crew = crews.find((c) => c._id === user.crewId);
  const initials = user.nickname
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="well flex items-center gap-3 p-2.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${TONE_STYLES.primary}`}
        aria-hidden="true"
      >
        {initials}
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-50">{user.nickname}</div>
        <div className="truncate text-3xs text-slate-400">{crew ? crew.name : 'Not in a crew yet'}</div>
      </div>
    </div>
  );
};

const CitySelect: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { currentCity, setCity } = useApp();
  return (
    <label className={`relative flex items-center ${className}`}>
      <span className="sr-only">City</span>
      <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
      <select
        value={currentCity}
        onChange={(e) => setCity(e.target.value)}
        className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-control bg-slate-900 pl-9 pr-8 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-400"
      >
        {CITIES.map((c) => (
          <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
    </label>
  );
};

const WeatherIcon: React.FC = () => {
  const { weather } = useApp();
  if (isStormy(weather.maxRain24hMm)) return <CloudRain className="h-4 w-4 text-cyan-400" aria-hidden="true" />;
  if (weather.heatSpell) return <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />;
  return <Droplets className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
};

/** The weather readings and the buttons that simulate a weather shock. No weather service is called. */
const WeatherControls: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const { weather, triggerStorm, triggerHeatwave, resetWeather } = useApp();

  const readings = [
    { label: 'Rain, wettest 24 h', value: `${weather.maxRain24hMm} mm`, alert: isStormy(weather.maxRain24hMm) },
    { label: 'Temperature', value: `${weather.currentTempC} °C`, alert: false },
    { label: 'Heat spell', value: weather.heatSpell ? 'Active (water checks fade twice as fast)' : 'None', alert: weather.heatSpell },
  ];
  const shocks: { label: string; effect: string; icon: LucideIcon; tone: Tone; run: () => void }[] = [
    { label: 'Simulate 26mm Storm', effect: 'Rain shock', icon: CloudRain, tone: 'primary', run: triggerStorm },
    { label: 'Heatwave (>30°C)', effect: 'Decay 2×', icon: Sun, tone: 'warning', run: triggerHeatwave },
    { label: 'Reset to Normal Dry Spell', effect: '', icon: Droplets, tone: 'neutral', run: resetWeather },
  ];

  return (
    <div className="space-y-3 text-xs">
      <dl className="space-y-1.5">
        {readings.map((reading) => (
          <div key={reading.label} className="flex justify-between gap-3">
            <dt className="text-slate-400">{reading.label}</dt>
            <dd className={`text-right font-semibold ${reading.alert ? 'text-amber-400' : 'text-slate-200'}`}>
              {reading.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1.5 border-t border-slate-800 pt-3">
        <p className="text-2xs text-slate-400">Simulate a weather shock:</p>
        {shocks.map((shock) => (
          <button
            key={shock.label}
            type="button"
            onClick={() => {
              shock.run();
              onDone?.();
            }}
            className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left font-semibold transition-opacity hover:opacity-80 ${TONE_STYLES[shock.tone]}`}
          >
            <span className="flex items-center gap-2">
              <shock.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {shock.label}
            </span>
            <span className="text-3xs font-medium">{shock.effect}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/** The navigation on small screens: slides in over the page. */
const NavDrawer: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  const panelRef = useOverlay<HTMLDivElement>(onClose);
  return (
    <div
      className="fixed inset-0 z-50 bg-scrim animate-in fade-in duration-150"
      {...useBackdropClose(onClose)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-900 shadow-pop animate-in slide-in-from-left duration-200 focus-visible:outline-none"
      >
        {children}
      </div>
    </div>
  );
};

interface AppShellProps {
  onOpenSafetyModal: () => void;
  onOpenStatusPage: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ onOpenSafetyModal, onOpenStatusPage, children }) => {
  const {
    user,
    setUserRole,
    weather,
    resetWeather,
    offlineMode,
    setOfflineMode,
    offlineQueue,
    syncOfflineQueue,
    activeTab,
    setActiveTab,
  } = useApp();
  const [theme, toggleTheme] = useTheme();
  const isDesktop = useIsDesktop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const weatherButton = useRef<HTMLButtonElement>(null);

  // Closing the weather menu from inside it (Escape, or choosing a shock) removes the element that
  // had focus: hand focus back to the button that opened the menu.
  const closeWeatherMenu = () => {
    setWeatherOpen(false);
    weatherButton.current?.focus();
  };
  // A banner button that removes its own banner sends focus to the page, not to nowhere.
  const focusPage = () => document.getElementById('main')?.focus();

  // A new page starts at its top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // The drawer and the weather menu each belong to one layout: crossing the breakpoint closes them.
  useEffect(() => {
    setDrawerOpen(false);
    setWeatherOpen(false);
  }, [isDesktop]);

  const changeRole = (role: User['role']) => {
    setUserRole(role);
    // The console is a coordinator page: a volunteer who was on it goes home.
    if (role === 'citizen' && activeTab === 'console') setActiveTab('overview');
  };

  const roleToggle = (
    <Segmented label="Role (demo)" options={ROLE_OPTIONS} value={user.role} onChange={changeRole} />
  );
  const toggleOffline = () => setOfflineMode(!offlineMode);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-on-primary"
      >
        Skip to content
      </a>

      {isDesktop && (
        <aside className="sticky top-0 flex h-screen flex-col border-r border-slate-800 bg-slate-900">
          <div className="flex h-16 shrink-0 items-center border-b border-slate-800 px-5">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto">
            <Navigation />
          </div>
          <div className="border-t border-slate-800 p-3">
            <UserCard />
          </div>
        </aside>
      )}

      {!isDesktop && drawerOpen && (
        <NavDrawer onClose={() => setDrawerOpen(false)}>
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-800 pl-5 pr-3">
            <Brand />
            <IconButton label="Close navigation" plain onClick={() => setDrawerOpen(false)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Navigation onNavigate={() => setDrawerOpen(false)} />

            <div className="space-y-3 border-t border-slate-800 px-4 py-4">
              <div className="text-3xs font-semibold uppercase tracking-wider text-slate-400">Demo controls</div>
              <CitySelect />
              {roleToggle}
              <details className="well group px-3 py-2 text-xs">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-200 [&::-webkit-details-marker]:hidden">
                  <WeatherIcon />
                  <span className="flex-1">
                    Weather: {weather.currentTempC}°C, {weather.rainTodayMm} mm rain
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="pb-1 pt-3">
                  <WeatherControls onDone={() => setDrawerOpen(false)} />
                </div>
              </details>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                leftIcon={offlineMode ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                onClick={toggleOffline}
              >
                {offlineMode ? 'Simulate reconnecting' : 'Simulate going offline'}
              </Button>
            </div>
          </div>
          <div className="border-t border-slate-800 p-3">
            <UserCard />
          </div>
        </NavDrawer>
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* No backdrop filter here: it would trap the weather menu's click-away layer inside the header. */}
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900">
          <div className="flex min-h-16 flex-wrap items-center gap-2 px-4 py-2 sm:px-6 xl:px-8">
            {isDesktop ? (
              <>
                {/* Between lg and xl the bar is tight: a narrower picker keeps it on one row */}
                <CitySelect className="lg:max-xl:w-40" />
                <div
                  className="relative"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && weatherOpen) closeWeatherMenu();
                  }}
                  onBlur={(e) => {
                    // Tabbing out of the menu closes it, so focus never sits under an open menu.
                    if (!e.currentTarget.contains(e.relatedTarget)) setWeatherOpen(false);
                  }}
                >
                  <button
                    ref={weatherButton}
                    type="button"
                    title="Weather state & simulation controls"
                    aria-label={`Weather: ${weather.currentTempC}°C, ${weather.rainTodayMm} mm rain (simulated). Simulation controls`}
                    aria-expanded={weatherOpen}
                    onClick={() => setWeatherOpen(!weatherOpen)}
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs transition-colors hover:border-slate-600"
                  >
                    <WeatherIcon />
                    <span className="font-semibold text-slate-50">{weather.currentTempC}°C</span>
                    <span className="hidden text-slate-400 xl:inline">{weather.rainTodayMm} mm rain</span>
                  </button>

                  {weatherOpen && (
                    <>
                      <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setWeatherOpen(false)} />
                      {/* Focusable, so a click on its text keeps focus inside the menu and the menu open */}
                      <div
                        tabIndex={-1}
                        className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-pop animate-in fade-in duration-150 focus-visible:outline-none"
                      >
                        <p className="mb-3 text-sm font-semibold text-slate-50">Weather (simulated)</p>
                        <WeatherControls onDone={closeWeatherMenu} />
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)}>
                  <Menu className="h-4 w-4" />
                </IconButton>
                <BrandMark />
                <span className="text-sm font-extrabold tracking-tight text-slate-50 max-[359px]:sr-only">Naiad</span>
              </>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div
                className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs ${TONE_STYLES.success}`}
                title="Patrol points earned by addressing real demand"
              >
                <Award className="h-4 w-4" aria-hidden="true" />
                <span className="font-extrabold tabular-nums">{user.points}</span>
                <span className="text-3xs lg:max-xl:sr-only">pts</span>
              </div>

              {isDesktop && (
                <>
                  {roleToggle}
                  <IconButton label="Offline mode (simulated)" aria-pressed={offlineMode} onClick={toggleOffline}>
                    {offlineMode ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                  </IconButton>
                </>
              )}

              <IconButton
                label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </IconButton>
              <IconButton label="Volunteer Safety, One Health Ethics & Hackathon Credits" onClick={onOpenSafetyModal}>
                <Info className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

        </header>

        {/* The banners sit under the sticky bar and scroll with the page: stuck, they would cover half a small screen. */}
        {offlineMode && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-800 bg-amber-950 px-4 py-2 text-xs text-amber-200 sm:px-6 xl:px-8"
            >
              <span className="flex items-center gap-2">
                <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Offline mode (simulated):</strong> checks queue on this device. {offlineQueue.length} queued.
                </span>
              </span>
              {offlineQueue.length > 0 && (
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => {
                    syncOfflineQueue();
                    focusPage();
                  }}
                >
                  Sync Now
                </Button>
              )}
            </div>
          )}

        {isStormy(weather.maxRain24hMm) && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-800 bg-indigo-950 px-4 py-2 text-xs text-indigo-200 sm:px-6 xl:px-8"
            >
              <span className="flex items-center gap-2">
                <CloudRain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Heavy storm ({weather.maxRain24hMm} mm in 24 h, simulated):</strong> rain shock active. Water
                  checks made before it are trusted far less, so storm runoff missions are open.
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  resetWeather();
                  focusPage();
                }}
                className="cursor-pointer font-semibold underline underline-offset-2 hover:text-indigo-100"
              >
                Clear Storm
              </button>
            </div>
          )}

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus-visible:outline-none sm:px-6 lg:py-8 xl:px-8">
          {children}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-slate-800 px-4 py-4 text-2xs text-slate-400 sm:px-6 xl:px-8">
          <span>
            Naiad prototype for the OneAquaHealth IEEE Global Hackathon 2026. The map, check-ins and crews run on demo
            data in this browser.
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onOpenStatusPage}
              className="cursor-pointer font-medium underline underline-offset-2 transition-colors hover:text-slate-50"
            >
              System Status Page →
            </button>
            {REPO_URL ? (
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-cyan-400 underline underline-offset-2 transition-colors hover:text-cyan-300"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Source Code Repository
              </a>
            ) : (
              <a
                href="/api/download-repo"
                download="naiad-repo.zip"
                title="Download complete Naiad repository archive as .ZIP"
                className="inline-flex items-center gap-1.5 font-medium text-cyan-400 underline underline-offset-2 transition-colors hover:text-cyan-300"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download Codebase (.ZIP)
              </a>
            )}
          </span>
        </footer>
      </div>
    </div>
  );
};
