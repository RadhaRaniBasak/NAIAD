/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Camera, CheckCircle2, AlertTriangle, ArrowRight, Eye, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type { RequestMission, Check } from '../types/index.ts';
import { OAH_QUESTIONS } from '../data/oahQuestions.ts';
import { PARAMS } from '../engine/params.ts';
import { Badge, Button, Modal, Notice } from './design-system/index.ts';

interface MissionCheckModalProps {
  mission: RequestMission;
  onClose: () => void;
  onCompleted: (check: Check) => void;
}

// Sample stream images: the demo has no camera, and nothing is uploaded.
const SAMPLE_PHOTOS = [
  {
    name: 'Clear Flowing Stream (Parque Choupal)',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Murky Runoff with Sediments',
    url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Foam & Discharging Culvert Outfall',
    url: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=800&q=80',
  },
];

/** The water questions of a micro-check, in the order they are asked. */
const WATER_QUESTIONS = [
  { code: 'water_aspect', legend: OAH_QUESTIONS.water_aspect.label, alertLabel: 'Alert' },
  { code: 'water_odor', legend: OAH_QUESTIONS.water_odor.label, alertLabel: 'Alert' },
  { code: 'visible_pollution', legend: 'Pollution Indicators (triggers incident trace if present)', alertLabel: 'Trace' },
];

const CHOICE = 'cursor-pointer rounded-xl border p-2.5 text-xs transition-colors';
const CHOICE_OFF = 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600';
const CHOICE_ON = 'border-cyan-600 bg-cyan-950 font-semibold text-cyan-200';

export const MissionCheckModal: React.FC<MissionCheckModalProps> = ({
  mission,
  onClose,
  onCompleted,
}) => {
  const { reaches, accessPoints, submitCheck } = useApp();

  const reach = useMemo(() => reaches.find((r) => r._id === mission.reachId), [reaches, mission.reachId]);
  const accessPoint = useMemo(
    () => accessPoints.find((ap) => ap.reachId === mission.reachId) || accessPoints[0],
    [accessPoints, mission.reachId]
  );

  // 1. Geofence simulation state
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean>(true);
  const [simulatedDistanceM, setSimulatedDistanceM] = useState<number>(24);

  // 2. Form answers state
  // One answer per question the dialog asks (WATER_QUESTIONS), nothing else
  const [answers, setAnswers] = useState<Record<string, string>>({
    water_aspect: 'clear',
    water_odor: 'natural',
    visible_pollution: 'none',
  });

  const [rapidChoice, setRapidChoice] = useState<'unchanged' | 'changed'>('unchanged');

  // 3. Photo state
  const [photoUrl, setPhotoUrl] = useState<string>(SAMPLE_PHOTOS[0].url);
  const [ghostOverlayEnabled, setGhostOverlayEnabled] = useState<boolean>(false);
  const [ghostOpacity, setGhostOpacity] = useState<number>(40);

  // Timer: 60-second target indicator
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine if this is a water micro-check or slower group
  const isWaterCheck = mission.groups.includes('water');
  const isSlowGroupCheck = mission.groups.includes('vegetation') || mission.groups.includes('structure');

  const handleAnswerSelect = (qCode: string, ansCode: string) => {
    setAnswers((prev) => ({ ...prev, [qCode]: ansCode }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isInsideGeofence) return;

    // A slow-group check asks no water questions, so it reports no water answers
    const given = isWaterCheck ? answers : {};

    // Detect signs for incident creation
    const derivedSigns = Object.entries(given).flatMap(([qCode, ansCode]) => {
      const sign = OAH_QUESTIONS[qCode]?.options.find((o) => o.code === ansCode)?.sign;
      return sign ? [sign] : [];
    });

    const check = submitCheck({
      reachId: mission.reachId,
      accessPointId: accessPoint?._id || 'ap_default',
      groups: mission.groups,
      answers: given,
      confirmedUnchanged: rapidChoice === 'unchanged' && isSlowGroupCheck ? mission.groups : [],
      signs: derivedSigns,
      photoUrl,
      location: accessPoint ? accessPoint.location.coordinates : [-8.428, 40.222],
      accuracyM: 6.2,
      requestId: mission._id,
    });

    onCompleted(check);
  };

  return (
    <Modal
      onClose={onClose}
      title={reach?.name || `Reach ${mission.reachId}`}
      maxWidth="xl"
      eyebrow={
        <>
          <Badge tone="primary">One-Minute Micro-Check</Badge>
          <span className="flex items-center gap-1 font-mono">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {secondsElapsed}s elapsed
          </span>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Why the check is asked for */}
        <div className="well space-y-1 p-3.5 text-xs">
          <span className="block text-3xs font-semibold uppercase tracking-wider text-slate-400">
            Demand Mission Objective:
          </span>
          <p className="font-medium italic text-slate-200">"{mission.reason}"</p>
        </div>

        {/* 1. Geofence: the check counts only near the access point */}
        <div className="well space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-200">
                Access Point Geofence ({PARAMS.geofenceM}m radius)
              </span>
            </div>
            <Badge tone={isInsideGeofence ? 'success' : 'danger'}>
              {isInsideGeofence ? 'Verified Inside Geofence' : 'Outside Geofence (Refused)'}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <strong className="block text-slate-50">{accessPoint?.name}</strong>
              <span className="text-2xs text-slate-400">
                Simulated GPS distance: {simulatedDistanceM}m from public bridge / bank
              </span>
            </div>

            {/* Lets a reviewer see the refusal: the demo has no real position */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsInsideGeofence(!isInsideGeofence);
                setSimulatedDistanceM(isInsideGeofence ? 195 : 24);
              }}
            >
              {isInsideGeofence ? 'Test Out-of-Bounds (195m)' : 'Teleport Inside (24m)'}
            </Button>
          </div>

          {!isInsideGeofence && (
            <Notice tone="danger" role="alert" icon={<AlertTriangle className="h-4 w-4" />}>
              Check refused: You must be within {PARAMS.geofenceM}m of the public access point to protect scientific
              ground-truth.
            </Notice>
          )}
        </div>

        {/* 2. The questions: only the group that is stale */}
        {isWaterCheck ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-50">Water Micro-Check Questions</h3>
              <p className="text-2xs text-slate-400">Only the stale group is queried. No 20-minute survey.</p>
            </div>

            {WATER_QUESTIONS.map((question) => (
              <fieldset key={question.code} className="space-y-1.5">
                <legend className="mb-1.5 text-xs font-semibold text-slate-200">{question.legend}:</legend>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {OAH_QUESTIONS[question.code].options.map((opt) => {
                    const isChosen = answers[question.code] === opt.code;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        aria-pressed={isChosen}
                        onClick={() => handleAnswerSelect(question.code, opt.code)}
                        className={`flex items-center justify-between gap-2 text-left ${CHOICE} ${isChosen ? CHOICE_ON : CHOICE_OFF}`}
                      >
                        <span>{opt.label}</span>
                        {opt.isAlert && <Badge tone="danger">{question.alertLabel}</Badge>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        ) : (
          /* Slow groups: one tap when nothing changed */
          <div role="group" aria-labelledby="rapid-protocol-title" className="well space-y-3 p-4">
            <h3 id="rapid-protocol-title" className="text-sm font-semibold text-slate-50">
              Slow Group Rapid Protocol ({mission.groups.join(', ')})
            </h3>
            <p className="text-xs text-slate-300">
              Banks and riparian structures change slowly. Has anything noticeably changed since the last check (margin
              mowed, fallen trees, new barriers)?
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={rapidChoice === 'unchanged'}
                onClick={() => setRapidChoice('unchanged')}
                className={`text-center font-bold ${CHOICE} ${
                  rapidChoice === 'unchanged' ? 'border-emerald-600 bg-emerald-950 text-emerald-300' : CHOICE_OFF
                }`}
              >
                ✓ No Change (One-Tap Confirm)
              </button>
              <button
                type="button"
                aria-pressed={rapidChoice === 'changed'}
                onClick={() => setRapidChoice('changed')}
                className={`text-center font-bold ${CHOICE} ${
                  rapidChoice === 'changed' ? 'border-amber-600 bg-amber-950 text-amber-300' : CHOICE_OFF
                }`}
              >
                ⚠ Something Changed
              </button>
            </div>
          </div>
        )}

        {/* 3. Photo, with the previous visit as an optional overlay for lining up the same view */}
        <div className="well space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-200">Stream Photo</span>
            </div>
            <Badge>Sample photos · nothing is uploaded</Badge>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
            <img
              src={photoUrl}
              alt="Stream viewpoint"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />

            {ghostOverlayEnabled && (
              <div
                className="pointer-events-none absolute inset-0 mix-blend-screen grayscale contrast-125 transition-opacity"
                style={{ opacity: ghostOpacity / 100 }}
              >
                <img
                  src={SAMPLE_PHOTOS[1].url}
                  alt="Earlier photo of the same viewpoint, overlaid"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="absolute bottom-2 right-2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-2xs">
              <button
                type="button"
                aria-pressed={ghostOverlayEnabled}
                onClick={() => setGhostOverlayEnabled(!ghostOverlayEnabled)}
                className={`flex cursor-pointer items-center gap-1 font-semibold ${
                  ghostOverlayEnabled ? 'text-cyan-400' : 'text-slate-400'
                }`}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Ghost Overlay (S1)
              </button>
              {ghostOverlayEnabled && (
                <input
                  type="range"
                  aria-label="Overlay opacity"
                  min="10"
                  max="90"
                  value={ghostOpacity}
                  onChange={(e) => setGhostOpacity(Number(e.target.value))}
                  // Enter in a form field submits the form: on a slider that would send the check
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  className="w-16 accent-cyan-500"
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-2xs">
            <span className="text-slate-400">Sample stream photo:</span>
            {SAMPLE_PHOTOS.map((sample) => (
              <button
                key={sample.url}
                type="button"
                aria-pressed={photoUrl === sample.url}
                onClick={() => setPhotoUrl(sample.url)}
                className={`cursor-pointer rounded-lg border px-2 py-1 text-left transition-colors ${
                  photoUrl === sample.url ? CHOICE_ON : CHOICE_OFF
                }`}
              >
                {sample.name}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!isInsideGeofence}
          leftIcon={<CheckCircle2 className="h-4 w-4" />}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Complete Check & Receive Receipt
        </Button>
      </form>
    </Modal>
  );
};
