/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PARAMS } from './params.ts';

export interface GraphReach {
  id: string;
  lengthM: number;
  downstream: string[];
  observable: boolean;
}

/** 
 * Kahn's algorithm. Returns reaches ordered upstream to downstream.
 * Throws if the network has a loop.
 */
export function topoOrder(reaches: Map<string, GraphReach>): string[] {
  const indeg = new Map<string, number>();
  for (const id of reaches.keys()) {
    indeg.set(id, 0);
  }
  for (const r of reaches.values()) {
    for (const d of r.downstream) {
      indeg.set(d, (indeg.get(d) ?? 0) + 1);
    }
  }
  const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const reach = reaches.get(id);
    if (!reach) continue;
    for (const d of reach.downstream) {
      indeg.set(d, (indeg.get(d) ?? 0) - 1);
      if (indeg.get(d) === 0) queue.push(d);
    }
  }
  if (order.length !== reaches.size) {
    throw new Error('Cycle in stream network: fix the source data');
  }
  return order;
}

/** 
 * up(r) = r plus every reach that drains into it. One pass over the topological order.
 */
export function upstreamClosure(
  reaches: Map<string, GraphReach>,
  order: string[]
): Map<string, Set<string>> {
  const up = new Map<string, Set<string>>();
  for (const id of order) {
    up.set(id, new Set([id]));
  }
  for (const id of order) {
    const reach = reaches.get(id);
    if (!reach) continue;
    for (const d of reach.downstream) {
      if (!up.has(d)) up.set(d, new Set([d]));
      for (const x of up.get(id)!) {
        up.get(d)!.add(x);
      }
    }
  }
  return up;
}

export interface Arrival {
  reachId: string;
  etaMinMinutes: number;
  etaMaxMinutes: number;
}

/** 
 * Reaches downstream of an incident, each with an arrival window (fast water to slow water).
 * Screening only based on vMin / vMax speeds.
 */
export function downstreamArrivals(
  reaches: Map<string, GraphReach>,
  order: string[],
  origin: string
): Arrival[] {
  const { vMin, vMax } = PARAMS.trace;
  const startM = new Map<string, number>(); // metres of channel between the incident and top of each reach
  const out: Arrival[] = [];
  const originIdx = order.indexOf(origin);
  if (originIdx === -1) return out;

  for (const id of order.slice(originIdx)) {
    const isOrigin = id === origin;
    if (!isOrigin && !startM.has(id)) continue; // not downstream of the incident
    const reach = reaches.get(id);
    if (!reach) continue;
    const top = isOrigin ? 0 : startM.get(id)!;
    if (!isOrigin) {
      out.push({
        reachId: id,
        etaMinMinutes: Math.round((top / vMax / 60) * 10) / 10,
        etaMaxMinutes: Math.round(((top + reach.lengthM) / vMin / 60) * 10) / 10,
      });
    }
    const bottom = isOrigin ? reach.lengthM : top + reach.lengthM;
    for (const d of reach.downstream) {
      startM.set(d, Math.min(startM.get(d) ?? Infinity, bottom));
    }
  }
  return out;
}
