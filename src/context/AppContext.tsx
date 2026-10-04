/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import confetti from 'canvas-confetti';
import type {
  Reach,
  AccessPoint,
  ExposureSite,
  RequestMission,
  Check,
  Incident,
  Crew,
  User,
  FhirServiceRequest,
  FhirTask,
  FhirObservation,
  Group,
  IncidentObservation,
} from '../types/index.ts';
import { getCityReaches, getCityAccessPoints, getCityExposureSites } from '../data/networks.ts';
import { DAY_MS, checkPoints, daysSince, demand, freshnessOf, type CheckKind, type WeatherSince } from '../engine/freshness.ts';
import { downstreamArrivals, topoOrder, upstreamClosure, type GraphReach } from '../engine/graph.ts';
import { isolatedSource, nextCheck, posterior } from '../engine/trace.ts';
import { PARAMS } from '../engine/params.ts';
import { canHandOff, isActiveIncident } from '../components/presentation.ts';

export type Tab =
  | 'overview'
  | 'map'
  | 'missions'
  | 'dispatch'
  | 'trace'
  | 'crews'
  | 'fhir'
  | 'console'
  | 'evidence'
  | 'design';

type Weather = WeatherSince & { currentTempC: number; rainTodayMm: number };

interface CheckInput {
  reachId: string;
  accessPointId: string;
  groups: Group[];
  answers: Record<string, string>;
  confirmedUnchanged: Group[];
  signs: string[];
  photoUrl?: string;
  location: [number, number];
  accuracyM: number;
  requestId?: string;
}

interface AppState {
  currentCity: string;
  setCity: (cityId: string) => void;
  user: User;
  setUserRole: (role: User['role']) => void;
  reaches: Reach[];
  /** The reaches of every city opened so far (a crew's reaches may be in another city). */
  allReaches: Reach[];
  accessPoints: AccessPoint[];
  exposureSites: ExposureSite[];
  missions: RequestMission[];
  checks: Check[];
  incidents: Incident[];
  crews: Crew[];
  weather: Weather;
  triggerStorm: () => void;
  triggerHeatwave: () => void;
  resetWeather: () => void;
  offlineMode: boolean;
  setOfflineMode: (offline: boolean) => void;
  offlineQueue: Check[];
  syncOfflineQueue: () => void;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  selectedReachId: string | null;
  setSelectedReachId: (id: string | null) => void;
  activeMissionToSubmit: RequestMission | null;
  setActiveMissionToSubmit: (m: RequestMission | null) => void;
  lastReceiptCheck: Check | null;
  setLastReceiptCheck: (c: Check | null) => void;
  submitCheck: (checkInput: CheckInput) => Check;
  createCrew: (name: string) => Crew;
  joinCrew: (joinCode: string) => boolean;
  adoptReach: (crewId: string, reachId: string) => void;
  // Trace actions
  startTraceDrill: () => void;
  performTraceCheck: (incidentId: string, reachId: string, positive: boolean) => void;
  confirmIncidentAdvisory: (incidentId: string, reviewNotes?: string) => void;
  handoffIncident: (incidentId: string) => void;
  dismissIncident: (incidentId: string) => void;
  // FHIR actions
  fhirRequests: FhirServiceRequest[];
  fhirTasks: FhirTask[];
  fhirObservations: FhirObservation[];
  postFhirServiceRequest: (sr: Partial<FhirServiceRequest>) => void;
  approveFhirServiceRequest: (id: string) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Signs that open a contamination incident (and its trace hunt) as soon as they are reported. */
const INCIDENT_SIGNS = ['sewage', 'foam', 'pipe_discharge', 'oil_film', 'dead_fish', 'chemical_odor'];

const NAIAD_CODE_SYSTEM = 'https://example.org/naiad/CodeSystem/naiad';

/** Category and code shared by every stream-check ServiceRequest. */
const STREAM_CHECK_REQUEST = {
  category: [
    {
      coding: [{ system: NAIAD_CODE_SYSTEM, code: 'stream-check' }],
    },
  ],
  code: {
    coding: [
      {
        system: NAIAD_CODE_SYSTEM,
        code: 'water',
        display: 'Water appearance & toxicity screening',
      },
    ],
  },
};

// Initial Seed Crews
const INITIAL_CREWS: Crew[] = [
  {
    _id: 'crew_coselhas_guardians',
    name: 'Guardiões de Coselhas',
    joinCode: 'COSELHAS26',
    memberIds: ['user_sara', 'user_joao', 'user_miguel'],
    reachIds: ['coi:r03', 'coi:r06'],
    city: 'coimbra',
    avatarIcon: '🌊',
  },
  {
    _id: 'crew_choupal_runners',
    name: 'Choupal EcoRunners',
    joinCode: 'CHOUPAL42',
    memberIds: ['user_ana', 'user_pedro'],
    reachIds: ['coi:r07'],
    city: 'coimbra',
    avatarIcon: '🏃',
  },
];

// Initial FHIR Requests
const INITIAL_FHIR_REQUESTS: FhirServiceRequest[] = [
  {
    resourceType: 'ServiceRequest',
    id: 'sr-vet-clinic-01',
    status: 'active',
    intent: 'order',
    ...STREAM_CHECK_REQUEST,
    subject: {
      reference: 'Location/coi:r07',
      display: 'Mata do Choupal Play & Dog Park Reach',
    },
    authoredOn: '2026-10-02T08:30:00Z',
    requester: {
      reference: 'Organization/coimbra-vet-hospital',
      display: 'Coimbra Companion Animal Hospital',
    },
    reasonCode: [
      {
        text: 'Two dogs treated with acute gastroenteritis after drinking near Choupal ford. Is there visible algal scum or sewage?',
      },
    ],
  },
];

const isoFromNow = (ms: number): string => new Date(Date.now() + ms).toISOString();

/** Posterior map -> plain record with probabilities rounded to 3 decimals. */
const roundPosterior = (post: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...post].map(([reachId, prob]) => [reachId, Math.round(prob * 1000) / 1000]));

/** The stream graph of one city: lookup, flow order and, for each reach, itself plus all that flows into it. */
function buildGraph(reaches: Reach[]) {
  const graphMap = new Map<string, GraphReach>(
    reaches.map((r) => [r._id, { id: r._id, lengthM: r.lengthM, downstream: r.downstream, observable: r.observable }])
  );
  let topoList: string[];
  try {
    topoList = topoOrder(graphMap);
  } catch (err) {
    console.warn('Topological graph cycle detected; falling back to natural reach sequence:', err);
    topoList = reaches.map((r) => r._id);
  }
  return { graphMap, topoList, upstreamMap: upstreamClosure(graphMap, topoList) };
}

/**
 * Where the source of an incident probably is: every candidate starts with a share of the
 * probability proportional to its channel length, then each observation updates it.
 */
function sourcePosterior(
  candidates: string[],
  cityReaches: Reach[],
  observations: IncidentObservation[]
): Record<string, number> {
  const lengthOf = (id: string) => cityReaches.find((r) => r._id === id)?.lengthM ?? PARAMS.reachLengthM;
  const totalLength = candidates.reduce((sum, id) => sum + lengthOf(id), 0);
  const prior = new Map(candidates.map((id) => [id, lengthOf(id) / totalLength]));
  return roundPosterior(posterior(prior, buildGraph(cityReaches).upstreamMap, observations));
}

/** A new incident on a reach of this city: its upstream candidates and the reaches downstream of it. */
export function openIncident(
  cityReaches: Reach[],
  first: IncidentObservation,
  sign: string,
  isDrill: boolean
): Incident | undefined {
  const origin = cityReaches.find((r) => r._id === first.reachId);
  if (!origin) return undefined;
  const { graphMap, topoList, upstreamMap } = buildGraph(cityReaches);
  const candidates = [...(upstreamMap.get(origin._id) ?? [origin._id])];
  const observations = [{ ...first, positive: true }];

  return {
    _id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    city: origin.city,
    sign,
    originCheckId: first.checkId,
    originReachId: origin._id,
    status: 'watch',
    openedAt: first.at,
    observations,
    posterior: sourcePosterior(candidates, cityReaches, observations),
    downstream: downstreamArrivals(graphMap, topoList, origin._id),
    title: `${isDrill ? 'DRILL: ' : ''}${sign.replace(/_/g, ' ').toUpperCase()} reported at ${origin.name || origin._id}`,
    isDrill,
  };
}

/**
 * An incident after one more observation. Two positive checks make it an advisory that waits for
 * approval; only a coordinator confirms it, however sure the hunt is of the source.
 */
export function withObservation(incident: Incident, observation: IncidentObservation, cityReaches: Reach[]): Incident {
  const observations = [...incident.observations, observation];
  const positives = observations.filter((o) => o.positive).length;
  return {
    ...incident,
    observations,
    posterior: sourcePosterior(Object.keys(incident.posterior), cityReaches, observations),
    status: incident.status === 'watch' && positives >= 2 ? 'advisory' : incident.status,
  };
}

/**
 * What a check means for the incidents of its city.
 * - A check that answers a hunt's trace mission is an observation for that hunt: sign present or absent.
 * - A report of the same sign on a candidate reach of a real hunt corroborates it.
 * - Any other alert sign opens a new incident.
 */
export function incidentsAfterCheck(incidents: Incident[], check: Check, cityReaches: Reach[]): Incident[] {
  const accountedFor = new Set<string>();
  const next = incidents.map((inc) => {
    if (!isActiveIncident(inc)) return inc;
    const reports = check.signs.includes(inc.sign);
    const answersItsMission = check.requestId?.startsWith(`mis:trace:${inc._id}:`) ?? false;
    const corroborates = reports && !inc.isDrill && check.reachId in inc.posterior;
    if (!answersItsMission && !corroborates) return inc;
    if (reports) accountedFor.add(inc.sign);
    return withObservation(
      inc,
      {
        checkId: check._id,
        reachId: check.reachId,
        positive: reports,
        userId: check.userId,
        userNickname: check.userNickname,
        at: check.takenAt,
      },
      cityReaches
    );
  });

  const alertSign = check.signs.find((sign) => INCIDENT_SIGNS.includes(sign) && !accountedFor.has(sign));
  const opened = alertSign
    ? openIncident(
        cityReaches,
        {
          checkId: check._id,
          reachId: check.reachId,
          positive: true,
          userId: check.userId,
          userNickname: check.userNickname,
          at: check.takenAt,
        },
        alertSign,
        false
      )
    : undefined;
  return opened ? [opened, ...next] : next;
}

/** Index of the ISO week (Monday to Sunday, UTC) a moment falls in: consecutive weeks differ by one. */
export const isoWeekIndex = (date: Date): number => Math.floor((Math.floor(date.getTime() / DAY_MS) + 3) / 7);

/** Why a check was asked for, as far as its points go, read from the id of the mission it answers. */
const checkKind = (requestId: string | undefined): CheckKind =>
  requestId?.startsWith('mis:trace:') ? 'trace' : requestId?.includes('disagreement') ? 'disagreement' : 'patrol';

/**
 * Records one check on its reach: returns the reach afterwards and the check with what it earned.
 * Both are worked out from the reach as it is at that moment, so a second check of a reach that
 * was just checked finds it fresh and earns next to nothing, sent at once or synced later.
 */
export function settleCheck(reach: Reach, check: Check, weather: WeatherSince): { reach: Reach; check: Check } {
  const takenAt = new Date(check.takenAt);
  const group = check.groups[0] ?? 'water';
  const before = freshnessOf(reach.lastCheckAt, group, takenAt, weather);

  const lastCheckAt = { ...reach.lastCheckAt };
  const covered = [...check.groups, ...check.confirmedUnchanged];
  for (const g of covered) {
    // A check synced late never moves a newer check back in time.
    if (!lastCheckAt[g] || lastCheckAt[g] < check.takenAt) lastCheckAt[g] = check.takenAt;
  }

  // The watch streak counts ISO weeks with a water check: the first check in a new week adds one,
  // a second check in the same week adds nothing.
  // ponytail: a missed week does not break the streak. The demo never runs across weeks, and its
  // seeded check ages are relative to today, so a reset would depend on the weekday it is shown on.
  // Add the reset once checks are stored.
  let streakWeeks = reach.streakWeeks;
  if (covered.includes('water')) {
    const previous = reach.lastCheckAt.water ? isoWeekIndex(new Date(reach.lastCheckAt.water)) : undefined;
    streakWeeks = Math.max(1, previous === isoWeekIndex(takenAt) ? streakWeeks : streakWeeks + 1);
  }

  return {
    // The lab gap was "no citizen patrol of this reach": a water check closes it.
    reach: { ...reach, lastCheckAt, streakWeeks, labGap: reach.labGap && !covered.includes('water') },
    check: {
      ...check,
      points: checkPoints(checkKind(check.requestId), before),
      freshnessBefore: Math.round(before * 100),
      freshnessAfter: Math.round(freshnessOf(lastCheckAt, group, takenAt, weather) * 100),
    },
  };
}

/** A join code from the crew's name: up to 8 letters or digits, then a number no other crew's code has. */
export function joinCodeFor(name: string, taken: string[]): string {
  const stem =
    [...name.toUpperCase()]
      .filter((ch) => /[\p{L}\p{N}]/u.test(ch))
      .slice(0, 8)
      .join('') || 'CREW';
  let n = 26;
  while (taken.includes(`${stem}${n}`)) n += 1;
  return `${stem}${n}`;
}

/**
 * The Demand Engine (F2): derives the open missions from the current state of the network.
 */
export function generateMissions(
  reaches: Reach[],
  weather: Weather,
  incidents: Incident[],
  fhirTasks: FhirTask[],
  fhirRequests: FhirServiceRequest[],
  upstreamMap: Map<string, Set<string>>
): RequestMission[] {
  const list: RequestMission[] = [];
  const now = new Date();

  reaches.forEach((reach) => {
    const fWater = freshnessOf(reach.lastCheckAt, 'water', now, weather);
    const fVeg = freshnessOf(reach.lastCheckAt, 'vegetation', now, weather);

    const ctx = {
      hasOahSite: reach.oahSiteCodes.length > 0,
      exposureCount: reach.exposure.human + reach.exposure.animal,
      labGap: reach.labGap,
    };
    const crewFirstUntil = reach.crewId ? isoFromNow(15 * MINUTE_MS) : undefined;

    // 1. Weather trigger (storm runoff)
    if (weather.maxRain24hMm >= PARAMS.rainShockMm24h && fWater < 0.6) {
      list.push({
        _id: `mis:weather:${reach._id}`,
        source: 'weather',
        reachId: reach._id,
        groups: ['water'],
        reason: `First look after heavy storm (${weather.maxRain24hMm}mm): check urban runoff & turbidity`,
        requester: { kind: 'naiad', name: 'Naiad Weather Engine' },
        value: Math.round(demand('water', fWater, ctx) * 100) / 100,
        opensAt: isoFromNow(-HOUR_MS),
        expiresAt: isoFromNow(48 * HOUR_MS),
        status: 'open',
        crewFirstUntil,
      });
    }
    // 2. Lab Gap trigger
    else if (reach.labGap && fWater < 0.7) {
      list.push({
        _id: `mis:labgap:${reach._id}`,
        source: 'lab-gap',
        reachId: reach._id,
        groups: ['water'],
        reason: 'The OneAquaHealth research lab detected elevated risk here that requires visual ground-truth',
        requester: { kind: 'organisation', name: 'OneAquaHealth Lab Node' },
        value: 0.92,
        opensAt: isoFromNow(-DAY_MS),
        expiresAt: isoFromNow(14 * DAY_MS),
        status: 'open',
      });
    }
    // 3. Staleness trigger
    else if (fWater < 0.5) {
      const days = reach.lastCheckAt.water ? Math.floor(daysSince(reach.lastCheckAt.water, now)) : null;
      list.push({
        _id: `mis:stale:${reach._id}`,
        source: 'staleness',
        reachId: reach._id,
        groups: ['water'],
        reason:
          days === null
            ? 'Unmonitored reach: initial baseline micro-check requested'
            : `Nobody has looked at this reach for ${days === 1 ? '1 day' : `${days} days`} (freshness at ${Math.round(fWater * 100)}%)`,
        requester: { kind: 'naiad', name: 'Freshness Engine' },
        value: Math.round(demand('water', fWater, ctx) * 100) / 100,
        opensAt: isoFromNow(-2 * HOUR_MS),
        expiresAt: isoFromNow(72 * HOUR_MS),
        status: 'open',
        crewFirstUntil,
      });
    }

    // 4. Slow-moving groups check (Vegetation)
    if (fVeg < 0.4) {
      list.push({
        _id: `mis:veg:${reach._id}`,
        source: 'staleness',
        reachId: reach._id,
        groups: ['vegetation'],
        reason: 'Riparian vegetation check: verify canopy shade and invasive acacia/reeds',
        requester: { kind: 'naiad', name: 'Riparian Botanical Watch' },
        value: Math.round(demand('vegetation', fVeg, ctx) * 100) / 100,
        opensAt: isoFromNow(-4 * HOUR_MS),
        expiresAt: isoFromNow(14 * DAY_MS),
        status: 'open',
      });
    }
  });

  // 5. Trace incident missions: the candidate reach whose check would teach the hunt the most,
  // for as long as the source is not isolated
  const observable = new Set(reaches.filter((r) => r.observable).map((r) => r._id));
  incidents.forEach((inc) => {
    if (isActiveIncident(inc) && !isolatedSource(inc.posterior)) {
      const candidates = Object.keys(inc.posterior).filter((id) => observable.has(id));
      const next = nextCheck(new Map(Object.entries(inc.posterior)), upstreamMap, candidates);
      if (next.reachId && next.gain > 1e-6) {
        list.unshift({
          _id: `mis:trace:${inc._id}:${next.reachId}`,
          source: 'trace',
          reachId: next.reachId,
          groups: ['water'],
          reason: `Trace Hunt: verify presence or absence of ${inc.sign.replace(/_/g, ' ')} to isolate source reach`,
          requester: { kind: 'organisation', name: 'Naiad Rapid Response' },
          value: 0.99, // Highest priority!
          opensAt: isoFromNow(0),
          expiresAt: isoFromNow(6 * HOUR_MS),
          status: 'open',
          incidentId: inc._id,
        });
      }
    }
  });

  // 6. External FHIR missions (approved)
  fhirTasks.forEach((task) => {
    if (task.status === 'requested' || task.status === 'accepted') {
      const reachId = task.for.reference.replace('Location/', '');
      const matchingReach = reaches.find((r) => r._id === reachId);
      const request = fhirRequests.find((sr) => `ServiceRequest/${sr.id}` === task.focus.reference);
      if (matchingReach) {
        const requesterName = request?.requester.display ?? 'External health partner';
        list.unshift({
          _id: `mis:fhir:${task.id}`,
          source: 'external',
          reachId: matchingReach._id,
          groups: ['water'],
          reason: `${requesterName} asks: ${request?.reasonCode[0]?.text ?? 'a look at the water surface'}`,
          requester: { kind: 'organisation', name: `${requesterName} (FHIR)` },
          value: 0.95,
          opensAt: isoFromNow(0),
          expiresAt: isoFromNow(24 * HOUR_MS),
          status: 'open',
          fhir: {
            serviceRequestId: task.focus.reference.replace('ServiceRequest/', ''),
            taskId: task.id,
          },
        });
      }
    }
  });

  return list;
}

/** The FHIR Observation that answers an external ServiceRequest once its mission is checked. */
function buildFhirObservation(check: Check, serviceRequestReference: string): FhirObservation {
  return {
    resourceType: 'Observation',
    id: `obs-${check._id}`,
    meta: {
      profile: ['http://hl7.eu/fhir/ig/oah/StructureDefinition/observation-indicators-oah'],
    },
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'survey',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://hl7.eu/fhir/ig/oah/CodeSystem/temporarySystem-oah-eu',
          code: 'foam',
          display: 'Foam/colour/smell',
        },
      ],
    },
    subject: {
      reference: `Location/${check.reachId}`,
    },
    effectiveDateTime: check.takenAt,
    performer: [
      {
        reference: check.crewId ? `Organization/${check.crewId}` : `Practitioner/${check.userId}`,
      },
    ],
    basedOn: [
      {
        reference: serviceRequestReference,
      },
    ],
    component: Object.entries(check.answers).map(([qCode, ansCode]) => ({
      code: {
        coding: [{ system: 'https://example.org/naiad/CodeSystem/oah-app-question', code: qCode }],
      },
      valueCodeableConcept: {
        coding: [{ system: 'https://example.org/naiad/CodeSystem/oah-app-answer', code: ansCode }],
      },
    })),
  };
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentCity, setCurrentCity] = useState<string>('coimbra');
  const [user, setUser] = useState<User>({
    _id: 'user_sara',
    nickname: 'Sara_Nobre',
    role: 'citizen',
    points: 240,
    crewId: 'crew_coselhas_guardians',
    arm: 'missions',
  });

  // Each city keeps its own reaches, loaded the first time it is opened, so what was done there
  // (checks, streaks, adoptions) is still there when the volunteer comes back.
  const [reachesByCity, setReachesByCity] = useState<Record<string, Reach[]>>(() => ({
    coimbra: getCityReaches('coimbra'),
  }));
  const reaches = useMemo(() => reachesByCity[currentCity] ?? [], [reachesByCity, currentCity]);
  const allReaches = useMemo(() => Object.values(reachesByCity).flat(), [reachesByCity]);
  const accessPoints = useMemo<AccessPoint[]>(() => getCityAccessPoints(currentCity), [currentCity]);
  const exposureSites = useMemo<ExposureSite[]>(() => getCityExposureSites(currentCity), [currentCity]);
  const [crews, setCrews] = useState<Crew[]>(INITIAL_CREWS);
  const [checks, setChecks] = useState<Check[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [weather, setWeather] = useState<Weather>({
    maxRain24hMm: 4,
    heatSpell: false,
    currentTempC: 22,
    rainTodayMm: 2,
  });

  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<Check[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedReachId, setSelectedReachId] = useState<string | null>('coi:r03');
  const [activeMissionToSubmit, setActiveMissionToSubmit] = useState<RequestMission | null>(null);
  const [lastReceiptCheck, setLastReceiptCheck] = useState<Check | null>(null);

  const [fhirRequests, setFhirRequests] = useState<FhirServiceRequest[]>(INITIAL_FHIR_REQUESTS);
  const [fhirTasks, setFhirTasks] = useState<FhirTask[]>([]);
  const [fhirObservations, setFhirObservations] = useState<FhirObservation[]>([]);

  // Opening a city loads its stream network the first time and keeps it afterwards
  const setCity = (cityId: string) => {
    const cityReaches = reachesByCity[cityId] ?? getCityReaches(cityId);
    setReachesByCity((prev) => (prev[cityId] ? prev : { ...prev, [cityId]: cityReaches }));
    setCurrentCity(cityId);
    if (cityReaches.length > 0) {
      setSelectedReachId(cityReaches[0]._id);
    }
  };

  const setUserRole = (role: User['role']) => {
    setUser((prev) => ({ ...prev, role }));
  };

  // Weather triggers
  const triggerStorm = () => {
    setWeather({
      maxRain24hMm: 26, // Exceeds PARAMS.rainShockMm24h (20mm) -> drops water freshness by 70%!
      rainAt: new Date().toISOString(), // ...of the checks made before it; a check made after is fresh
      heatSpell: false,
      currentTempC: 17,
      rainTodayMm: 26,
    });
  };

  const triggerHeatwave = () => {
    setWeather({
      maxRain24hMm: 0,
      heatSpell: true, // Halves water half-life!
      currentTempC: 34,
      rainTodayMm: 0,
    });
  };

  const resetWeather = () => {
    setWeather({
      maxRain24hMm: 2,
      heatSpell: false,
      currentTempC: 21,
      rainTodayMm: 1,
    });
  };

  // The current city's stream graph
  const graph = useMemo(() => buildGraph(reaches), [reaches]);

  // Incidents belong to the city they were opened in: the pages see the current city's only.
  const cityIncidents = useMemo(() => incidents.filter((i) => i.city === currentCity), [incidents, currentCity]);

  const missions = useMemo(
    () => generateMissions(reaches, weather, cityIncidents, fhirTasks, fhirRequests, graph.upstreamMap),
    [reaches, weather, cityIncidents, fhirTasks, fhirRequests, graph]
  );

  /** What this volunteer reports seeing on a reach, right now. */
  const observationBy = (reachId: string, positive: boolean, checkId: string): IncidentObservation => ({
    checkId,
    reachId,
    positive,
    userId: user._id,
    userNickname: user.nickname,
    at: new Date().toISOString(),
  });

  // Practice incident, labelled as a drill. It starts on the reach that leaves the most to do on
  // both sides: upstream candidates to bisect and downstream reaches to warn.
  const startTraceDrill = () => {
    const { graphMap, topoList, upstreamMap } = graph;
    let origin = { reachId: '', score: -1 };
    for (const reachId of topoList) {
      const upstreamCandidates = (upstreamMap.get(reachId)?.size ?? 1) - 1;
      const downstreamReaches = downstreamArrivals(graphMap, topoList, reachId).length;
      const score = Math.min(upstreamCandidates, downstreamReaches);
      if (score > origin.score) origin = { reachId, score };
    }
    const drill = openIncident(reaches, observationBy(origin.reachId, true, `chk_drill_${Date.now()}`), 'sewage', true);
    if (drill) setIncidents((prev) => [drill, ...prev]);
  };

  // The Trace Hunts page's own buttons: record that the sign was seen, or not, on a candidate reach
  const performTraceCheck = (incidentId: string, reachId: string, positive: boolean) => {
    const observation = observationBy(reachId, positive, `chk_trace_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    setIncidents((prev) =>
      prev.map((inc) =>
        inc._id === incidentId ? withObservation(inc, observation, reachesByCity[inc.city] ?? []) : inc
      )
    );
  };

  /** Changes one incident, if the rule for that step allows it in the state the incident is in. */
  const stepIncident = (incidentId: string, allowed: (inc: Incident) => boolean, changes: Partial<Incident>) => {
    setIncidents((prev) => prev.map((inc) => (inc._id === incidentId && allowed(inc) ? { ...inc, ...changes } : inc)));
  };

  // A coordinator confirms an advisory, which exists only once two checks were positive
  const confirmIncidentAdvisory = (incidentId: string, reviewNotes?: string) =>
    stepIncident(incidentId, (inc) => inc.status === 'advisory', {
      status: 'confirmed',
      coordinatorReviewNotes: reviewNotes || 'Reviewed and validated against downstream exposure sites.',
    });

  const handoffIncident = (incidentId: string) => stepIncident(incidentId, canHandOff, { status: 'handed-off' });

  const dismissIncident = (incidentId: string) => stepIncident(incidentId, isActiveIncident, { status: 'dismissed' });

  // Submit check (F3, F4)
  const submitCheck = (checkInput: CheckInput): Check => {
    const now = new Date().toISOString();
    const draft: Check = {
      _id: `chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      idempotencyKey: `idemp_${Date.now()}_${user._id}`,
      reachId: checkInput.reachId,
      accessPointId: checkInput.accessPointId,
      userId: user._id,
      userNickname: user.nickname,
      crewId: user.crewId,
      requestId: checkInput.requestId,
      groups: checkInput.groups,
      answers: checkInput.answers,
      confirmedUnchanged: checkInput.confirmedUnchanged,
      signs: checkInput.signs,
      photoUrl: checkInput.photoUrl,
      location: { type: 'Point', coordinates: checkInput.location },
      accuracyM: checkInput.accuracyM,
      takenAt: now,
      receivedAt: now,
      points: 0, // settled when the check is recorded
      status: 'pending',
    };

    if (offlineMode) {
      // Queued: the receipt shows what the check would earn now. It is settled again when synced.
      const reach = reaches.find((r) => r._id === draft.reachId);
      const queued = reach ? settleCheck(reach, draft, weather).check : draft;
      setOfflineQueue((prev) => [queued, ...prev]);
      return queued;
    }

    const recorded = recordChecks([draft])[0] ?? draft;

    // Celebratory confetti on the receipt, skipped for visitors who ask for reduced motion
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        disableForReducedMotion: true,
      });
    } catch {
      // ignore
    }

    setLastReceiptCheck(recorded);
    return recorded;
  };

  /**
   * Records checks, oldest first, each one seeing what the one before it left behind: the reach's
   * freshness and streak, the volunteer's points, the check log, and the incident or FHIR answer
   * the check leads to. Sent at once or synced later, a check goes through here.
   */
  const recordChecks = (list: Check[]): Check[] => {
    let nextReaches = reachesByCity;
    let nextIncidents = incidents;
    let nextTasks = fhirTasks;
    const recorded: Check[] = [];
    const observations: FhirObservation[] = [];

    for (const pending of list) {
      // The check's own city, which need not be the one on screen when a queue is synced
      const cityId = Object.keys(nextReaches).find((id) => nextReaches[id].some((r) => r._id === pending.reachId));
      const reach = cityId && nextReaches[cityId].find((r) => r._id === pending.reachId);
      if (!cityId || !reach) continue;

      const settled = settleCheck(reach, pending, weather);
      const check = settled.check;
      nextReaches = { ...nextReaches, [cityId]: nextReaches[cityId].map((r) => (r._id === reach._id ? settled.reach : r)) };
      nextIncidents = incidentsAfterCheck(nextIncidents, check, nextReaches[cityId]);
      recorded.push(check);

      // The first check that answers a FHIR task completes it and writes the Observation
      const task = nextTasks.find((t) => `mis:fhir:${t.id}` === check.requestId && t.status !== 'completed');
      if (task) {
        const observation = buildFhirObservation(check, task.focus.reference);
        observations.push(observation);
        nextTasks = nextTasks.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: 'completed',
                output: [
                  {
                    type: { text: 'Stream check observation' },
                    valueReference: { reference: `Observation/${observation.id}` },
                  },
                ],
              }
            : t
        );
      }
    }

    setReachesByCity(nextReaches);
    setIncidents(nextIncidents);
    setFhirTasks(nextTasks);
    setFhirObservations((prev) => [...observations.reverse(), ...prev]);
    setChecks((prev) => [...[...recorded].reverse(), ...prev]);
    setUser((prev) => ({ ...prev, points: prev.points + recorded.reduce((sum, check) => sum + check.points, 0) }));
    return recorded;
  };

  const syncOfflineQueue = () => {
    if (offlineQueue.length === 0) return;
    recordChecks([...offlineQueue].reverse());
    setOfflineQueue([]);
  };

  // Reconnecting sends what was queued
  const goOffline = (offline: boolean) => {
    setOfflineMode(offline);
    if (!offline) syncOfflineQueue();
  };

  // Crew operations
  const createCrew = (name: string): Crew => {
    const newCrew: Crew = {
      _id: `crew_${Date.now()}`,
      name,
      joinCode: joinCodeFor(name, crews.map((c) => c.joinCode)),
      memberIds: [user._id],
      reachIds: [], // a crew adopts its reaches from the map
      city: currentCity,
      avatarIcon: '🌱',
    };
    setCrews((prev) => [newCrew, ...prev]);
    setUser((prev) => ({ ...prev, crewId: newCrew._id }));
    return newCrew;
  };

  const joinCrew = (joinCode: string): boolean => {
    const found = crews.find((c) => c.joinCode.toUpperCase() === joinCode.trim().toUpperCase());
    if (!found) return false;

    setCrews((prev) =>
      prev.map((c) =>
        c._id === found._id && !c.memberIds.includes(user._id)
          ? { ...c, memberIds: [...c.memberIds, user._id] }
          : c
      )
    );
    setUser((prev) => ({ ...prev, crewId: found._id }));
    return true;
  };

  const adoptReach = (crewId: string, reachId: string) => {
    setCrews((prev) =>
      prev.map((c) =>
        c._id === crewId && !c.reachIds.includes(reachId) ? { ...c, reachIds: [...c.reachIds, reachId] } : c
      )
    );
    setReachesByCity((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([cityId, list]) => [cityId, list.map((r) => (r._id === reachId ? { ...r, crewId } : r))])
      )
    );
  };

  // FHIR Actions
  const postFhirServiceRequest = (sr: Partial<FhirServiceRequest>) => {
    const newReq: FhirServiceRequest = {
      resourceType: 'ServiceRequest',
      id: `sr-${Date.now()}`,
      status: 'active',
      intent: 'order',
      ...STREAM_CHECK_REQUEST,
      subject: {
        reference: sr.subject?.reference || 'Location/coi:r03',
        display: sr.subject?.display || 'Stream reach location',
      },
      authoredOn: new Date().toISOString(),
      requester: {
        reference: sr.requester?.reference || 'Organization/external-health-agency',
        display: sr.requester?.display || 'Regional Health Agency',
      },
      reasonCode: [
        {
          text: sr.reasonCode?.[0]?.text || 'External environmental observation inquiry.',
        },
      ],
    };
    setFhirRequests((prev) => [newReq, ...prev]);
  };

  const approveFhirServiceRequest = (srId: string) => {
    const sr = fhirRequests.find((r) => r.id === srId);
    if (!sr) return;

    // Create a FHIR Task
    const newTask: FhirTask = {
      resourceType: 'Task',
      id: `task-${Date.now()}`,
      status: 'requested',
      intent: 'order',
      focus: { reference: `ServiceRequest/${sr.id}` },
      for: { reference: sr.subject.reference },
    };

    setFhirTasks((prev) => [newTask, ...prev]);
  };

  return (
    <AppContext.Provider
      value={{
        currentCity,
        setCity,
        user,
        setUserRole,
        reaches,
        allReaches,
        accessPoints,
        exposureSites,
        missions,
        checks,
        incidents: cityIncidents,
        crews,
        weather,
        triggerStorm,
        triggerHeatwave,
        resetWeather,
        offlineMode,
        setOfflineMode: goOffline,
        offlineQueue,
        syncOfflineQueue,
        activeTab,
        setActiveTab,
        selectedReachId,
        setSelectedReachId,
        activeMissionToSubmit,
        setActiveMissionToSubmit,
        lastReceiptCheck,
        setLastReceiptCheck,
        submitCheck,
        createCrew,
        joinCrew,
        adoptReach,
        startTraceDrill,
        performTraceCheck,
        confirmIncidentAdvisory,
        handoffIncident,
        dismissIncident,
        fhirRequests,
        fhirTasks,
        fhirObservations,
        postFhirServiceRequest,
        approveFhirServiceRequest,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
