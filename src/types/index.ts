/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Group, Pillar } from '../engine/params.ts';

export type { Group, Pillar };

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat]
}

export interface GeoLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [[lon, lat], ...]
}

export interface Reach {
  _id: string; // e.g. "coimbra:r0421"
  city: string;
  name?: string;
  geometry: GeoLineString;
  lengthM: number;
  upstream: string[]; // reach IDs that flow into this one
  downstream: string[]; // reach IDs this one flows into
  topoIndex: number;
  observable: boolean;
  oahSiteCodes: string[];
  exposure: Record<Pillar, number>;
  labGap: boolean;
  lastCheckAt: Partial<Record<Group, string>>; // ISO date strings
  crewId?: string;
  streakWeeks: number;
  demo?: boolean;
}

export interface AccessPoint {
  _id: string;
  reachId: string;
  location: GeoPoint;
  kind: 'bridge' | 'path' | 'ford' | 'manual';
  name?: string;
}

export interface Check {
  _id: string;
  idempotencyKey: string;
  reachId: string;
  accessPointId: string;
  userId: string;
  userNickname: string;
  crewId?: string;
  requestId?: string;
  groups: Group[];
  answers: Record<string, string>; // OneAquaHealth question code -> answer code
  confirmedUnchanged: Group[];
  signs: string[]; // derived signs: "sewage", "foam", "pipe_discharge", "abnormal_color", etc.
  photoUrl?: string;
  photoThumbnail?: string;
  location: GeoPoint;
  accuracyM: number;
  takenAt: string;
  receivedAt: string;
  points: number;
  status: 'pending' | 'corroborated' | 'disputed' | 'rejected';
  fhirObservationId?: string;
  freshnessBefore?: number;
  freshnessAfter?: number;
}

export type RequestSource =
  | 'staleness'
  | 'weather'
  | 'disagreement'
  | 'lab-gap'
  | 'trace'
  | 'external';

export interface RequestMission {
  _id: string;
  source: RequestSource;
  reachId: string;
  accessPointId?: string;
  groups: Group[];
  reason: string; // plain language template
  requester: {
    kind: 'naiad' | 'organisation';
    name: string;
  };
  value: number; // 0..1
  opensAt: string;
  expiresAt: string;
  status: 'pending-approval' | 'open' | 'claimed' | 'fulfilled' | 'expired' | 'cancelled';
  claim?: {
    userId: string;
    userNickname: string;
    until: string;
  };
  crewFirstUntil?: string;
  incidentId?: string;
  fhir?: {
    serviceRequestId: string;
    taskId: string;
  };
}

export interface IncidentObservation {
  checkId: string;
  reachId: string;
  positive: boolean;
  userId: string;
  userNickname: string;
  at: string;
  photoUrl?: string;
  notes?: string;
}

export interface Incident {
  _id: string;
  city: string;
  sign: string;
  originCheckId: string;
  originReachId: string;
  status: 'watch' | 'advisory' | 'confirmed' | 'handed-off' | 'resolved' | 'dismissed';
  openedAt: string;
  observations: IncidentObservation[];
  posterior: Record<string, number>; // reachId -> probability (0..1)
  downstream: {
    reachId: string;
    etaMinMinutes: number;
    etaMaxMinutes: number;
  }[];
  sourceReachId?: string;
  title: string;
  /** A practice incident started from the Trace Hunts screen, not a real report. */
  isDrill?: boolean;
  coordinatorReviewNotes?: string;
}

export interface Crew {
  _id: string;
  name: string;
  joinCode: string;
  memberIds: string[];
  reachIds: string[];
  city: string;
  avatarIcon?: string;
}

export interface User {
  _id: string;
  nickname: string;
  role: 'citizen' | 'coordinator';
  crewId?: string;
  points: number;
  arm?: 'missions' | 'plain';
}

export interface ExposureSite {
  _id: string;
  pillar: Pillar;
  kind: string;
  name?: string;
  location: GeoPoint;
  reachId: string;
  distanceM: number;
}

// FHIR R4 simplified typing for the UI bridge
export interface FhirServiceRequest {
  resourceType: 'ServiceRequest';
  id: string;
  status: 'draft' | 'active' | 'completed' | 'revoked';
  intent: 'order';
  category: Array<{
    coding: Array<{ system: string; code: string; display?: string }>;
  }>;
  code: {
    coding: Array<{ system: string; code: string; display: string }>;
  };
  subject: {
    reference: string;
    display?: string;
  };
  occurrencePeriod?: {
    start: string;
    end: string;
  };
  authoredOn: string;
  requester: {
    reference: string;
    display?: string;
  };
  reasonCode: Array<{
    text: string;
  }>;
}

export interface FhirTask {
  resourceType: 'Task';
  id: string;
  status: 'requested' | 'accepted' | 'in-progress' | 'completed' | 'cancelled';
  intent: 'order';
  focus: {
    reference: string;
  };
  for: {
    reference: string;
  };
  output?: Array<{
    type: { text: string };
    valueReference: { reference: string };
  }>;
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  meta?: {
    profile: string[];
  };
  status: 'preliminary' | 'final';
  category: Array<{
    coding: Array<{ system: string; code: string }>;
  }>;
  code: {
    coding: Array<{ system: string; code: string; display: string }>;
  };
  subject: {
    reference: string;
  };
  effectiveDateTime: string;
  performer?: Array<{
    reference: string;
  }>;
  basedOn?: Array<{
    reference: string;
  }>;
  component: Array<{
    code: {
      coding: Array<{ system: string; code: string }>;
    };
    valueCodeableConcept?: {
      coding: Array<{ system: string; code: string }>;
    };
    valueString?: string;
  }>;
}
