/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ILLUSTRATIVE figures for the Evidence page. Nobody measured them: they are example numbers,
 * written for the prototype to show what each study would report. The page labels them so.
 * - An audit of public citizen submissions
 * - A one-year coverage model (demand-pull against free roaming)
 * - A 14-day randomized pilot
 *
 * The trace-hunt benchmark is not stored here: the Evidence page simulates it live with
 * src/engine/simulation.ts.
 */

export interface CitizenAuditSummary {
  auditDate: string;
  totalSubmissions: number;
  usableSubmissions: number;
  flaggedSubmissions: number;
  singleVisitSitesPct: number;
  repeatVisitSitesPct: number;
  cityBreakdown: {
    city: string;
    total: number;
    usable: number;
    repeatSites: number;
  }[];
  flagReasons: { reason: string; count: number }[];
}

export const CITIZEN_AUDIT_DATA: CitizenAuditSummary = {
  auditDate: '2026-10-02',
  totalSubmissions: 71,
  usableSubmissions: 28,
  flaggedSubmissions: 43,
  singleVisitSitesPct: 82.8, // 83% check once and stop!
  repeatVisitSitesPct: 17.2,
  cityBreakdown: [
    { city: 'Coimbra (Portugal)', total: 31, usable: 14, repeatSites: 3 },
    { city: 'Toulouse (France)', total: 18, usable: 7, repeatSites: 2 },
    { city: 'Ghent (Belgium)', total: 11, usable: 4, repeatSites: 1 },
    { city: 'Oslo (Norway)', total: 6, usable: 2, repeatSites: 0 },
    { city: 'Benevento (Italy)', total: 5, usable: 1, repeatSites: 0 },
  ],
  flagReasons: [
    { reason: 'Coordinates outside city bounding box (swapped lat/lon)', count: 19 },
    { reason: 'Duplicate submission within <60 seconds (spam submit)', count: 12 },
    { reason: 'Missing mandatory water appearance indicator', count: 8 },
    { reason: 'Location in open ocean / non-stream grid', count: 4 },
  ],
};

export interface CoverageSimulationSummary {
  simDays: number;
  annualRainDaysOver20mm: number;
  volunteerCount: number;
  demandPull: {
    medianWaterDataAgeDays: number;
    stormCheckedWithin72hPct: number;
    evenCoverageGini: number; // 0 = perfectly even, 1 = concentrated
    totalMissionsFulfilled: number;
  };
  freeRoaming: {
    medianWaterDataAgeDays: number;
    stormCheckedWithin72hPct: number;
    evenCoverageGini: number;
    totalMissionsFulfilled: number;
  };
}

export const COVERAGE_SIMULATION_DATA: CoverageSimulationSummary = {
  simDays: 365,
  annualRainDaysOver20mm: 19,
  volunteerCount: 25,
  demandPull: {
    medianWaterDataAgeDays: 1.8,
    stormCheckedWithin72hPct: 91.4,
    evenCoverageGini: 0.18,
    totalMissionsFulfilled: 684,
  },
  freeRoaming: {
    medianWaterDataAgeDays: 6.9,
    stormCheckedWithin72hPct: 24.1,
    evenCoverageGini: 0.64, // Heavy clustering at convenient bridges!
    totalMissionsFulfilled: 684,
  },
};

export interface PilotStudyMetrics {
  totalParticipants: number;
  studyDurationDays: number;
  streamName: string;
  missionsArm: {
    participants: number;
    week2ActiveRetentionPct: number; // primary outcome (days 8-14)
    checksPerPerson: number;
    medianDataAgeDays: number;
    corroborationRatePct: number;
    avgSecondsPerCheck: number;
  };
  plainArm: {
    participants: number;
    week2ActiveRetentionPct: number;
    checksPerPerson: number;
    medianDataAgeDays: number;
    corroborationRatePct: number;
    avgSecondsPerCheck: number;
  };
  drillResult: {
    secretSourceReach: string;
    checksNeeded: number;
    timeToLocateMinutes: number;
    volunteerConfirmation: string;
  };
}

export const PILOT_STUDY_DATA: PilotStudyMetrics = {
  totalParticipants: 28,
  studyDurationDays: 14,
  streamName: 'Rio Selho (Guimarães Pilot)',
  missionsArm: {
    participants: 14,
    week2ActiveRetentionPct: 71.4, // 10 out of 14 continued
    checksPerPerson: 5.1,
    medianDataAgeDays: 1.9,
    corroborationRatePct: 88.2,
    avgSecondsPerCheck: 48,
  },
  plainArm: {
    participants: 14,
    week2ActiveRetentionPct: 21.4, // only 3 out of 14 returned in week 2!
    checksPerPerson: 1.4,
    medianDataAgeDays: 8.4,
    corroborationRatePct: 35.0,
    avgSecondsPerCheck: 142,
  },
  drillResult: {
    secretSourceReach: 'Segment 4 (Pedrulha tributary confluence)',
    checksNeeded: 4,
    timeToLocateMinutes: 28,
    volunteerConfirmation: 'Example: confirmed by 3 independent volunteers, with nobody entering the stream.',
  },
};
