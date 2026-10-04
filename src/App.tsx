/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { AppShell } from './components/AppShell.tsx';
import { Overview } from './components/Overview.tsx';
import { FreshnessMap } from './components/FreshnessMap.tsx';
import { MissionList } from './components/MissionList.tsx';
import { MissionCheckModal } from './components/MissionCheckModal.tsx';
import { ReceiptModal } from './components/ReceiptModal.tsx';
import { TraceHuntView } from './components/TraceHuntView.tsx';
import { CrewsView } from './components/CrewsView.tsx';
import { FhirBridgeView } from './components/FhirBridgeView.tsx';
import { CoordinatorConsole } from './components/CoordinatorConsole.tsx';
import { EvidenceView } from './components/EvidenceView.tsx';
import { SafetyAndAboutModal } from './components/SafetyAndAboutModal.tsx';

import { ToastProvider } from './components/design-system/index.ts';
import { MissionsDispatchScreen } from './components/MissionsDispatchScreen.tsx';
import { DesignSystemShowcase } from './components/DesignSystemShowcase.tsx';
import { StatusPage } from './components/StatusPage.tsx';

const AppContent: React.FC = () => {
  const {
    activeTab,
    activeMissionToSubmit,
    setActiveMissionToSubmit,
    lastReceiptCheck,
    setLastReceiptCheck,
  } = useApp();

  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const [showStatusPage, setShowStatusPage] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.pathname === '/status';
  });

  if (showStatusPage) {
    return <StatusPage onBackToApp={() => setShowStatusPage(false)} />;
  }

  return (
    <AppShell onOpenSafetyModal={() => setShowSafetyModal(true)} onOpenStatusPage={() => setShowStatusPage(true)}>
      {activeTab === 'overview' && <Overview />}
      {activeTab === 'map' && <FreshnessMap />}
      {activeTab === 'missions' && <MissionList />}
      {activeTab === 'dispatch' && <MissionsDispatchScreen />}
      {activeTab === 'trace' && <TraceHuntView />}
      {activeTab === 'crews' && <CrewsView />}
      {activeTab === 'fhir' && <FhirBridgeView />}
      {activeTab === 'console' && <CoordinatorConsole />}
      {activeTab === 'evidence' && <EvidenceView />}
      {activeTab === 'design' && <DesignSystemShowcase />}

      {/* The one-minute check, then its receipt */}
      {activeMissionToSubmit && (
        <MissionCheckModal
          mission={activeMissionToSubmit}
          onClose={() => setActiveMissionToSubmit(null)}
          onCompleted={(check) => {
            setActiveMissionToSubmit(null);
            setLastReceiptCheck(check);
          }}
        />
      )}
      {lastReceiptCheck && <ReceiptModal check={lastReceiptCheck} onClose={() => setLastReceiptCheck(null)} />}

      {showSafetyModal && <SafetyAndAboutModal onClose={() => setShowSafetyModal(false)} />}
    </AppShell>
  );
};

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AppProvider>
  );
}
