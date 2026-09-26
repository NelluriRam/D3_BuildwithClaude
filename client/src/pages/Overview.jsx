import React from 'react';
import ActivityFeed from '../components/ActivityFeed.jsx';
import IncidentFeed from '../components/IncidentFeed.jsx';
import ClusterHealthGrid from '../components/ClusterHealthGrid.jsx';
import AlertsPanel from '../components/AlertsPanel.jsx';
import ScenarioInfo from '../components/ScenarioInfo.jsx';
import MetricsRow from '../components/MetricsRow.jsx';
import HallucinationResolvedPanel from '../components/HallucinationResolvedPanel.jsx';
import HeroPanel from '../components/HeroPanel.jsx';
import ContextBanner from '../components/ContextBanner.jsx';
import WalkthroughToggle from '../components/WalkthroughToggle.jsx';
import OrgSettings from '../components/OrgSettings.jsx';

export default function Overview() {
  return (
    <div className="page-grid">
      <ContextBanner />
      <div className="overview-toggles">
        <WalkthroughToggle />
        <OrgSettings />
      </div>
      <HeroPanel />
      <MetricsRow />
      <HallucinationResolvedPanel />
      <ActivityFeed />
      <IncidentFeed />
      <div className="page-grid-two">
        <ClusterHealthGrid />
        <AlertsPanel />
      </div>
      <ScenarioInfo />
    </div>
  );
}
