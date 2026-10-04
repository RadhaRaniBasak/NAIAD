/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CityInfo {
  id: string;
  name: string;
  country: string;
  streamName: string;
  center: [number, number]; // [lon, lat]
  bbox: [number, number, number, number]; // [south, west, north, east]
  description: string;
}

export const CITIES: CityInfo[] = [
  {
    id: 'coimbra',
    name: 'Coimbra',
    country: 'Portugal',
    streamName: 'Ribeira de Coselhas & Rio Mondego',
    center: [-8.428, 40.222],
    bbox: [40.15, -8.50, 40.27, -8.36],
    description: 'Demo network modelled on urban tributaries of the lower Mondego.',
  },
  {
    id: 'toulouse',
    name: 'Toulouse',
    country: 'France',
    streamName: 'Le Touch & Canal de Brienne',
    center: [1.385, 43.595],
    bbox: [43.53, 1.33, 43.68, 1.53],
    description: 'Demo network placed on a western urban creek of Toulouse. It reuses the Coimbra layout.',
  },
  {
    id: 'pilot',
    name: 'Guimarães (Pilot)',
    country: 'Portugal',
    streamName: 'Rio Selho & Ribeira da Costa',
    center: [-8.295, 41.445],
    bbox: [41.40, -8.35, 41.48, -8.24],
    description: 'Demo network for a planned pilot that would compare demand-pull missions with plain forms. It reuses the Coimbra layout.',
  },
];
