/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CheckCircle2, Send, Copy, Check, Workflow, ShieldCheck, Braces, Inbox, Repeat } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { plural } from './presentation.ts';
import {
  Badge,
  Button,
  PageHeader,
  Panel,
  Segmented,
  Select,
  useToast,
  type Tone,
} from './design-system/index.ts';

type ResourceType = 'ServiceRequest' | 'Task' | 'Observation';

const RESOURCE_TYPES = (['ServiceRequest', 'Task', 'Observation'] as const).map((type) => ({ id: type, label: type }));

const EMPTY_RESOURCE_MESSAGE: Record<ResourceType, string> = {
  ServiceRequest: '// No ServiceRequests posted yet',
  Task: '// No active Tasks generated yet',
  Observation: '// No completed Observations linked yet',
};

// Preset outside system requests
const PRESET_REQUESTS = [
  {
    title: 'Coimbra Companion Animal Hospital',
    reason:
      'Two dogs treated with acute gastroenteritis after drinking near Choupal ford. Is there visible algal scum or sewage?',
    reachId: 'coi:r07',
    code: 'water',
  },
  {
    title: 'Regional Environmental Health Agency (ARS Centro)',
    reason:
      'Routine bacterial threshold alert triggered at downstream intake. Ground-truth check on outfall pipe status requested.',
    reachId: 'coi:r04',
    code: 'water',
  },
  {
    title: 'University of Coimbra EcoHydrology Lab',
    reason:
      'Sensor network recalibration: verify whether riparian canopy vegetation has been cleared by recent municipal trimming.',
    reachId: 'coi:r03',
    code: 'vegetation',
  },
];

const LIFECYCLE_STEPS: { step: string; actor: string; tone: Tone; description: React.ReactNode }[] = [
  {
    step: '1. ServiceRequest',
    actor: 'Outside System',
    tone: 'info',
    description: (
      <>
        Outside partner posts a request targeting stream <code>Location</code>.
      </>
    ),
  },
  {
    step: '2. Task Created',
    actor: 'Coordinator Gate',
    tone: 'primary',
    description: (
      <>
        Coordinator approves request; Naiad spins up an active FHIR <code>Task</code>.
      </>
    ),
  },
  {
    step: '3. Citizen Mission',
    actor: 'Demand Engine',
    tone: 'warning',
    description: 'Mission appears in volunteer app stating requester name and reason.',
  },
  {
    step: '4. Observation',
    actor: 'FHIR Answer',
    tone: 'success',
    description: (
      <>
        Check answered as <code>Observation</code> with <code>basedOn</code> link.
      </>
    ),
  },
];

export const FhirBridgeView: React.FC = () => {
  const {
    fhirRequests,
    fhirTasks,
    fhirObservations,
    postFhirServiceRequest,
    approveFhirServiceRequest,
    reaches,
    user,
  } = useApp();
  const { showToast } = useToast();

  const [selectedResourceType, setSelectedResourceType] = useState<ResourceType>('ServiceRequest');
  // Which resource of that type is shown. Null shows the newest one.
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const resources: Record<ResourceType, { id: string }[]> = {
    ServiceRequest: fhirRequests,
    Task: fhirTasks,
    Observation: fhirObservations,
  };

  const showNewest = (type: ResourceType) => {
    setSelectedResourceType(type);
    setSelectedResourceId(null);
  };

  // The presets name a reach of the Coimbra network. Every city has the same layout, so in
  // another city the request goes to the reach in the same position there.
  const targetReach = (preset: (typeof PRESET_REQUESTS)[0]) =>
    reaches.find((r) => r._id.split(':')[1] === preset.reachId.split(':')[1]);

  const handleSimulatePost = (preset: (typeof PRESET_REQUESTS)[0]) => {
    const matchingReach = targetReach(preset);
    postFhirServiceRequest({
      code: {
        coding: [
          {
            system: 'https://example.org/naiad/CodeSystem/naiad',
            code: preset.code,
            display: `${preset.code.toUpperCase()} observation check`,
          },
        ],
      },
      subject: {
        reference: `Location/${matchingReach?._id ?? preset.reachId}`,
        display: matchingReach?.name || preset.reachId,
      },
      requester: {
        reference: `Organization/${preset.title.toLowerCase().replace(/\s+/g, '-')}`,
        display: preset.title,
      },
      reasonCode: [{ text: preset.reason }],
    });
    showNewest('ServiceRequest');
  };

  // The JSON on display: the selected resource, else the newest of its type
  const available = resources[selectedResourceType];
  const currentResource = available.find((r) => r.id === selectedResourceId) || available[0];
  const currentJson = currentResource
    ? JSON.stringify(currentResource, null, 2)
    : EMPTY_RESOURCE_MESSAGE[selectedResourceType];

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(currentJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('error', 'Could not copy', 'Select the JSON and copy it by hand.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Systems to Streams"
        description={
          <>
            The FHIR R4 bridge. External institutions (hospitals, municipal dashboards, veterinary clinics) can query
            urban streams using HL7 FHIR standard requests (<code>ServiceRequest</code>), which Naiad turns into
            volunteer missions and answers as <code>Observation</code> resources.
          </>
        }
        icon={<Workflow className="h-5 w-5" />}
        tone="info"
      >
        <div className="card flex items-center gap-2 px-3.5 py-2 text-xs">
          <ShieldCheck className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          <span>
            Target profile: <strong className="text-slate-50">hl7.eu.fhir.oah</strong> (R4 4.0.1)
          </span>
        </div>
      </PageHeader>

      <Panel title="Standard FHIR R4 Demand Lifecycle" icon={<Repeat className="h-4 w-4" />}>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {LIFECYCLE_STEPS.map((step) => (
            <li key={step.step} className="well space-y-2 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={step.tone} className="font-mono">
                  {step.step}
                </Badge>
                <span className="text-3xs text-slate-400">{step.actor}</span>
              </div>
              <p className="text-2xs text-slate-300">{step.description}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <Panel
            title="Simulate Outside System POST /ServiceRequest"
            description="Choose a preset to post a ServiceRequest into the demo pipeline. Nothing leaves this browser."
            icon={<Send className="h-4 w-4" />}
          >
            <ul className="space-y-2.5">
              {PRESET_REQUESTS.map((p) => (
                <li key={p.title} className="well space-y-2 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="font-semibold text-slate-100">{p.title}</strong>
                    <span className="font-mono text-3xs text-slate-400">Target: {targetReach(p)?._id ?? p.reachId}</span>
                  </div>
                  <p className="text-2xs italic text-slate-300">"{p.reason}"</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    leftIcon={<Send className="h-3 w-3" />}
                    onClick={() => handleSimulatePost(p)}
                  >
                    POST ServiceRequest to /fhir
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Coordinator Allowlist Approval Queue"
            icon={<Inbox className="h-4 w-4" />}
            action={<span className="font-mono text-3xs text-slate-400">{plural(fhirRequests.length, 'Request')}</span>}
          >
            <ul className="space-y-2.5">
              {fhirRequests.map((sr) => {
                const task = fhirTasks.find((t) => t.focus.reference === `ServiceRequest/${sr.id}`);
                const isApproved = task !== undefined;

                return (
                  <li key={sr.id} className="well space-y-2 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-bold text-slate-100">{sr.id}</span>
                      <Badge tone={isApproved ? 'success' : 'warning'}>
                        {task?.status === 'completed'
                          ? 'Answered (Observation Sent)'
                          : isApproved
                            ? 'Approved (Task Active)'
                            : 'Pending Coordinator Approval'}
                      </Badge>
                    </div>

                    <div className="text-2xs text-slate-300">
                      <strong>Requester:</strong> {sr.requester.display || sr.requester.reference}
                    </div>
                    <p className="text-2xs italic text-slate-400">"{sr.reasonCode[0].text}"</p>

                    {!isApproved &&
                      (user.role === 'coordinator' ? (
                        <Button
                          variant="success"
                          size="sm"
                          className="w-full"
                          leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() => {
                            approveFhirServiceRequest(sr.id);
                            showNewest('Task');
                          }}
                        >
                          Approve & Generate Volunteer Mission
                        </Button>
                      ) : (
                        <p className="text-2xs italic text-slate-400">
                          Approval is a coordinator's step. In this demo, switch the role to Coordinator to give it.
                        </p>
                      ))}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        <Panel
          className="lg:col-span-7"
          title="Resource Inspector"
          description="Canonical: http://hl7.eu/fhir/ig/oah"
          icon={<Braces className="h-4 w-4" />}
          action={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              onClick={handleCopyJson}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                label="Resource type"
                options={RESOURCE_TYPES}
                value={selectedResourceType}
                onChange={showNewest}
              />
              <Badge>Generated in this browser · not validated</Badge>
            </div>

            {available.length > 1 && currentResource && (
              <Select
                label={`${selectedResourceType} to show`}
                value={currentResource.id}
                onChange={(e) => setSelectedResourceId(e.target.value)}
                options={available.map((r) => ({ value: r.id, label: r.id }))}
              />
            )}

            <pre
              tabIndex={0}
              role="region"
              aria-label={`${selectedResourceType} JSON`}
              className="well max-h-[30rem] overflow-auto p-4 font-mono text-2xs leading-relaxed text-slate-200"
            >
              {currentJson}
            </pre>
          </div>
        </Panel>
      </div>
    </div>
  );
};
