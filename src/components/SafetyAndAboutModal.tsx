/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, HeartHandshake, AlertTriangle, Lock } from 'lucide-react';
import { PARAMS } from '../engine/params.ts';
import { Button, Modal, Notice } from './design-system/index.ts';

interface SafetyModalProps {
  onClose: () => void;
}

const ONE_HEALTH_PILLARS = [
  { name: 'Human Health', examples: 'Playgrounds, bathing, allotments' },
  { name: 'Animal Health', examples: 'Dog parks, vet clinic inquiries' },
  { name: 'Ecosystem Health', examples: 'Canopy, riffles, native fish' },
];

export const SafetyAndAboutModal: React.FC<SafetyModalProps> = ({ onClose }) => {
  return (
    <Modal
      onClose={onClose}
      title="Naiad Safety, One Health Ethics & Credits"
      description="OneAquaHealth IEEE Global Hackathon 2026 • Track 5"
      icon={<ShieldCheck className="h-5 w-5" />}
      maxWidth="2xl"
    >
      <div className="space-y-4 text-xs">
        <Notice tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
          <h3 className="font-bold">Volunteer Safety Rules (Never Enter Water)</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-2xs">
            <li>
              <strong>Public Banks & Bridges Only:</strong> Conduct all visual observations from public footpaths,
              bridges, or park walkways. Never enter private property.
            </li>
            <li>
              <strong>Never Enter the Water:</strong> Naiad is a visual screening tool. Do not wade, step into
              current, or handle contaminated sewage/water samples.
            </li>
            <li>
              <strong>Daylight Only:</strong> Do not patrol urban stream channels alone after dark.
            </li>
            <li>
              <strong>Zero Confrontation:</strong> Never confront suspected dischargers or industrial facilities.
              Volunteers report what they see; following it up is for the municipality.
            </li>
          </ul>
        </Notice>

        <section className="well space-y-2 p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-50">
            <HeartHandshake className="h-4 w-4 text-amber-400" aria-hidden="true" />
            Communication Ethics & Limits
          </h3>
          <p className="text-2xs text-slate-300">
            Naiad reports visible ecological signs. <strong>It never declares water safe or unsafe.</strong> A single
            volunteer report remains at <code>watch</code>; an <code>advisory</code> requires two independent
            corroborated observations and municipal review.
          </p>
          <p className="text-2xs text-slate-300">
            Handoff reports name a <strong>~{PARAMS.reachLengthM}m stream reach</strong>, never a named individual or
            property.
          </p>
        </section>

        <section className="well space-y-2 p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-50">
            <Lock className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            Privacy & Anonymous-First Volunteer Protection
          </h3>
          <p className="text-2xs text-slate-300">
            Volunteers participate by nickname only. No home address, email, or telephone number is required. By
            design, a volunteer's position is compared with the {PARAMS.geofenceM}m access point geofence on their own
            device, and photos lose their EXIF and GPS tags before they are stored.
          </p>
          <p className="text-2xs text-slate-300">
            In this prototype the position is simulated and the photos are samples, so neither step runs yet.
          </p>
        </section>

        <section className="well space-y-2 p-4">
          <h3 className="font-bold text-slate-50">One Health Triad Integration</h3>
          <ul className="grid grid-cols-1 gap-2 text-center text-2xs sm:grid-cols-3">
            {ONE_HEALTH_PILLARS.map((pillar) => (
              <li key={pillar.name} className="rounded-xl border border-slate-700 bg-slate-900 p-2">
                <span className="block font-bold text-slate-100">{pillar.name}</span>
                <span className="text-3xs text-slate-400">{pillar.examples}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="well space-y-2 p-4">
          <h3 className="font-bold text-slate-50">Why "Naiad"</h3>
          <p className="text-2xs text-slate-300">
            In Greek myth a naiad is the nymph of a spring or a stream, bound to her own water. Biologists use the
            same word for the water-dwelling young of the mayfly, an insect read as a sign of good water quality.
          </p>
        </section>

        <section className="space-y-1.5 border-t border-slate-800 pt-4 text-2xs text-slate-400">
          <h3 className="text-xs font-bold text-slate-200">Sources & Open Data Credits:</h3>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong>OneAquaHealth:</strong> Funded by the European Union under Horizon Europe (Grant Agreement
              101086521). Canonical FHIR IG <code>hl7.eu.fhir.oah</code>.
            </li>
            <li>
              <strong>HL7 EU & HAPI FHIR:</strong> FHIR R4 standard observation and service request structures.
            </li>
            <li>
              <strong>Planned, not yet connected:</strong> OpenStreetMap for stream networks and public paths (©
              OpenStreetMap contributors, ODbL) and Open-Meteo for precipitation (CC BY 4.0). The networks and the
              weather in this prototype are demo data.
            </li>
          </ul>
        </section>

        <Button className="w-full" onClick={onClose}>
          I Understand & Agree
        </Button>
      </div>
    </Modal>
  );
};
