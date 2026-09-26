import React from 'react';
import ActivityFeed from '../components/ActivityFeed.jsx';
import IncidentFeed from '../components/IncidentFeed.jsx';
import ClusterHealthGrid from '../components/ClusterHealthGrid.jsx';
import AlertsPanel from '../components/AlertsPanel.jsx';
import ScenarioInfo from '../components/ScenarioInfo.jsx';
import MetricsRow from '../components/MetricsRow.jsx';
import HeroPanel from '../components/HeroPanel.jsx';
import ContextBanner from '../components/ContextBanner.jsx';
import WalkthroughToggle from '../components/WalkthroughToggle.jsx';

export default function Overview() {
  return (
    <div className="page-grid">
      <ContextBanner />
      <WalkthroughToggle />
      <HeroPanel />
      <MetricsRow />
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
