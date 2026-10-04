/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DAY_MS } from '../engine/freshness.ts';
import type { Reach, AccessPoint, ExposureSite } from '../types/index.ts';

/** ISO timestamp for "this many days before the app loaded" (keeps the demo data relative to today). */
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();

// ----------------------------------------------------
// COIMBRA NETWORK: Ribeira de Coselhas draining to Mondego
// ----------------------------------------------------
// Stream topology:
// r01 (Headwater north) -> r02 -> r03 \
//                                      -> r05 -> r06 -> r07 -> r08 (Mondego confluence)
// r04 (Pedrulha tributary) ----------/
// ----------------------------------------------------

const COIMBRA_REACHES: Reach[] = [
  {
    _id: 'coi:r01',
    city: 'coimbra',
    name: 'Coselhas Upper Forest Reach',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.421, 40.239],
        [-8.423, 40.236],
      ],
    },
    lengthM: 260,
    upstream: [],
    downstream: ['coi:r02'],
    topoIndex: 0,
    observable: true,
    oahSiteCodes: ['PT_COI_01'],
    exposure: { human: 0, animal: 1, ecosystem: 2 },
    labGap: false,
    lastCheckAt: {
      water: daysAgo(4), // 4 days old (stale)
      vegetation: daysAgo(25),
      structure: daysAgo(110),
    },
    streakWeeks: 3,
  },
  {
    _id: 'coi:r02',
    city: 'coimbra',
    name: 'Coselhas North Agricultural Reach',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.423, 40.236],
        [-8.425, 40.233],
      ],
    },
    lengthM: 250,
    upstream: ['coi:r01'],
    downstream: ['coi:r03'],
    topoIndex: 1,
    observable: true,
    oahSiteCodes: [],
    exposure: { human: 1, animal: 2, ecosystem: 1 },
    labGap: false,
    lastCheckAt: {
      water: daysAgo(1), // 1 day old
      vegetation: daysAgo(10),
      structure: daysAgo(40),
    },
    streakWeeks: 7,
  },
  {
    _id: 'coi:r03',
    city: 'coimbra',
    name: 'Coselhas School & Garden Reach',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.425, 40.233],
        [-8.428, 40.230],
      ],
    },
    lengthM: 255,
    upstream: ['coi:r02'],
    downstream: ['coi:r05'],
    topoIndex: 2,
    observable: true,
    oahSiteCodes: [],
    exposure: { human: 3, animal: 1, ecosystem: 1 },
    labGap: true, // Lab found high E. coli but no recent upstream citizen check!
    lastCheckAt: {
      water: daysAgo(8), // 8 days old
      vegetation: daysAgo(55),
      structure: daysAgo(120),
    },
    crewId: 'crew_coselhas_guardians',
    streakWeeks: 9,
  },
  {
    _id: 'coi:r04',
    city: 'coimbra',
    name: 'Pedrulha Industrial Tributary',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.435, 40.233],
        [-8.429, 40.230],
      ],
    },
    lengthM: 245,
    upstream: [],
    downstream: ['coi:r05'],
    topoIndex: 2,
    observable: true,
    oahSiteCodes: ['PT_COI_02'],
    exposure: { human: 2, animal: 0, ecosystem: 0 },
    labGap: false,
    lastCheckAt: {
      water: daysAgo(0.5), // 12 hours old
      vegetation: daysAgo(20),
      structure: daysAgo(180),
    },
    streakWeeks: 12,
  },
  {
    _id: 'coi:r05',
    city: 'coimbra',
    name: 'Pedrulha Confluence & Rail Crossing',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.428, 40.230],
        [-8.430, 40.226],
      ],
    },
    lengthM: 270,
    upstream: ['coi:r03', 'coi:r04'],
    downstream: ['coi:r06'],
    topoIndex: 3,
    observable: true,
    oahSiteCodes: [],
    exposure: { human: 2, animal: 1, ecosystem: 1 },
    labGap: false,
    lastCheckAt: {
      water: daysAgo(5),
      vegetation: daysAgo(30),
      structure: daysAgo(60),
    },
    streakWeeks: 4,
  },
  {
    _id: 'coi:r06',
    city: 'coimbra',
    name: 'Choupal National Forest Inlet',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.430, 40.226],
        [-8.433, 40.222],
      ],
    },
    lengthM: 250,
    upstream: ['coi:r05'],
    downstream: ['coi:r07'],
    topoIndex: 4,
    observable: true,
    oahSiteCodes: ['PT_COI_03'],
    exposure: { human: 4, animal: 3, ecosystem: 4 },
    labGap: false,
    lastCheckAt: {
      water: daysAgo(2),
      vegetation: daysAgo(12),
      structure: daysAgo(45),
    },
    crewId: 'crew_coselhas_guardians',
    streakWeeks: 14,
  },
  {
    _id: 'coi:r07',
    city: 'coimbra',
    name: 'Mata do Choupal Play & Dog Park Reach',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.433, 40.222],
        [-8.436, 40.218],
      ],
    },
    lengthM: 260,
    upstream: ['coi:r06'],
    downstream: ['coi:r08'],
    topoIndex: 5,
    observable: true,
    oahSiteCodes: [],
    exposure: { human: 5, animal: 4, ecosystem: 3 },
    labGap: false,
    lastCheckAt: {
      water: daysAgo(6),
      vegetation: daysAgo(40),
      structure: daysAgo(90),
    },
    streakWeeks: 2,
  },
  {
    _id: 'coi:r08',
    city: 'coimbra',
    name: 'Mondego Riverbank Outfall & Rowing Canal',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-8.436, 40.218],
        [-8.439, 40.215],
      ],
    },
    lengthM: 250,
    upstream: ['coi:r07'],
    downstream: [],
    topoIndex: 6,
    observable: true,
    oahSiteCodes: ['PT_COI_04'],
    exposure: { human: 5, animal: 2, ecosystem: 4 },
    labGap: false,
    lastCheckAt: {
      water: daysAgo(0.2),
      vegetation: daysAgo(15),
      structure: daysAgo(30),
    },
    streakWeeks: 18,
  },
];

const COIMBRA_ACCESS_POINTS: AccessPoint[] = [
  {
    _id: 'ap:coi:01',
    reachId: 'coi:r01',
    name: 'Coselhas Footpath Trailhead',
    kind: 'path',
    location: { type: 'Point', coordinates: [-8.422, 40.237] },
  },
  {
    _id: 'ap:coi:02',
    reachId: 'coi:r02',
    name: 'Quinta das Varandas Bridge',
    kind: 'bridge',
    location: { type: 'Point', coordinates: [-8.424, 40.234] },
  },
  {
    _id: 'ap:coi:03',
    reachId: 'coi:r03',
    name: 'Escola Básica Pedestrian Crossing',
    kind: 'bridge',
    location: { type: 'Point', coordinates: [-8.427, 40.231] },
  },
  {
    _id: 'ap:coi:04',
    reachId: 'coi:r04',
    name: 'Ponte da Pedrulha (Rua de São Pedro)',
    kind: 'bridge',
    location: { type: 'Point', coordinates: [-8.432, 40.231] },
  },
  {
    _id: 'ap:coi:05',
    reachId: 'coi:r05',
    name: 'Linha do Norte Rail Overpass Culvert',
    kind: 'bridge',
    location: { type: 'Point', coordinates: [-8.429, 40.228] },
  },
  {
    _id: 'ap:coi:06',
    reachId: 'coi:r06',
    name: 'Choupal Main Forest Gate Bridge',
    kind: 'bridge',
    location: { type: 'Point', coordinates: [-8.431, 40.224] },
  },
  {
    _id: 'ap:coi:07',
    reachId: 'coi:r07',
    name: 'Parque Infantil & Picnic Ford',
    kind: 'ford',
    location: { type: 'Point', coordinates: [-8.434, 40.220] },
  },
  {
    _id: 'ap:coi:08',
    reachId: 'coi:r08',
    name: 'Mondego Nautical Club Boardwalk',
    kind: 'path',
    location: { type: 'Point', coordinates: [-8.438, 40.216] },
  },
];

const COIMBRA_EXPOSURE_SITES: ExposureSite[] = [
  {
    _id: 'exp:coi:01',
    pillar: 'human',
    kind: 'school',
    name: 'Escola Básica 1º Ciclo de Coselhas',
    location: { type: 'Point', coordinates: [-8.426, 40.232] },
    reachId: 'coi:r03',
    distanceM: 35,
  },
  {
    _id: 'exp:coi:02',
    pillar: 'human',
    kind: 'playground',
    name: 'Parque Infantil da Mata do Choupal',
    location: { type: 'Point', coordinates: [-8.433, 40.221] },
    reachId: 'coi:r07',
    distanceM: 20,
  },
  {
    _id: 'exp:coi:03',
    pillar: 'animal',
    kind: 'dog_park',
    name: 'Espaço Canino do Choupal',
    location: { type: 'Point', coordinates: [-8.435, 40.219] },
    reachId: 'coi:r07',
    distanceM: 30,
  },
  {
    _id: 'exp:coi:04',
    pillar: 'ecosystem',
    kind: 'nature_reserve',
    name: 'Mata Nacional do Choupal Habitat Sanctuary',
    location: { type: 'Point', coordinates: [-8.432, 40.223] },
    reachId: 'coi:r06',
    distanceM: 10,
  },
  {
    _id: 'exp:coi:05',
    pillar: 'human',
    kind: 'bathing_place',
    name: 'Praia Fluvial do Choupal & Rowing Slipway',
    location: { type: 'Point', coordinates: [-8.437, 40.216] },
    reachId: 'coi:r08',
    distanceM: 15,
  },
];

// ----------------------------------------------------
// DERIVED NETWORKS: Toulouse and the Guimarães pilot
// ----------------------------------------------------
// Both reuse the Coimbra network as a template: same topology with re-keyed IDs,
// localized names, and geometry shifted and scaled to the city's own origin.

const COIMBRA_PREFIX = 'coi';
const COIMBRA_ORIGIN: [number, number] = [-8.428, 40.222]; // [lon, lat]

interface DerivedCity {
  prefix: string;
  siteCode: string; // replaces Coimbra's "PT_COI" in the research-site codes
  origin: [number, number]; // [lon, lat]
  scale: number;
  reachName: (n: number) => string;
  accessPointName: (n: number) => string;
}

const DERIVED_CITIES: Record<string, DerivedCity> = {
  toulouse: {
    prefix: 'tou',
    siteCode: 'FR_TLS',
    origin: [1.38, 43.59],
    scale: 0.8,
    reachName: (n) => `Le Touch - Tronçon ${n}`,
    accessPointName: (n) => `Passerelle du Touch ${n}`,
  },
  pilot: {
    prefix: 'pilot',
    siteCode: 'PT_GMR',
    origin: [-8.295, 41.445],
    scale: 0.9,
    reachName: (n) => `Rio Selho - Segment ${n}`,
    accessPointName: (n) => `Ponte pedonal Selho ${n}`,
  },
};

/** 'coi:r03' -> 'tou:r03', 'ap:coi:03' -> 'ap:tou:03' */
const rekey = (id: string, city: DerivedCity): string => id.replace(`${COIMBRA_PREFIX}:`, `${city.prefix}:`);

const relocate = ([lon, lat]: [number, number], city: DerivedCity): [number, number] => [
  city.origin[0] + (lon - COIMBRA_ORIGIN[0]) * city.scale,
  city.origin[1] + (lat - COIMBRA_ORIGIN[1]) * city.scale,
];

export function getCityReaches(cityId: string): Reach[] {
  const city = DERIVED_CITIES[cityId];
  if (!city) return COIMBRA_REACHES;

  return COIMBRA_REACHES.map((r, idx) => ({
    ...r,
    _id: rekey(r._id, city),
    city: cityId,
    name: city.reachName(idx + 1),
    oahSiteCodes: r.oahSiteCodes.map((code) => code.replace('PT_COI', city.siteCode)),
    upstream: r.upstream.map((id) => rekey(id, city)),
    downstream: r.downstream.map((id) => rekey(id, city)),
    geometry: {
      type: 'LineString',
      coordinates: r.geometry.coordinates.map((point) => relocate(point, city)),
    },
  }));
}

export function getCityAccessPoints(cityId: string): AccessPoint[] {
  const city = DERIVED_CITIES[cityId];
  if (!city) return COIMBRA_ACCESS_POINTS;

  return COIMBRA_ACCESS_POINTS.map((ap, idx) => ({
    ...ap,
    _id: rekey(ap._id, city),
    reachId: rekey(ap.reachId, city),
    name: city.accessPointName(idx + 1),
    location: { type: 'Point', coordinates: relocate(ap.location.coordinates, city) },
  }));
}

export function getCityExposureSites(cityId: string): ExposureSite[] {
  const city = DERIVED_CITIES[cityId];
  if (!city) return COIMBRA_EXPOSURE_SITES;

  // The copies are named after what they are and the reach they sit on, not after Coimbra's places.
  const kindLabel = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, ' ');
  const reachNumber = (reachId: string) => COIMBRA_REACHES.findIndex((r) => r._id === reachId) + 1;

  return COIMBRA_EXPOSURE_SITES.map((site) => ({
    ...site,
    _id: rekey(site._id, city),
    name: `${kindLabel(site.kind)} by ${city.reachName(reachNumber(site.reachId))}`,
    reachId: rekey(site.reachId, city),
    location: { type: 'Point', coordinates: relocate(site.location.coordinates, city) },
  }));
}
