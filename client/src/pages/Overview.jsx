import React from 'react';
import IncidentFeed from '../components/IncidentFeed.jsx';
import ClusterHealthGrid from '../components/ClusterHealthGrid.jsx';
import AlertsPanel from '../components/AlertsPanel.jsx';
import ScenarioButton from '../components/ScenarioButton.jsx';
import { api } from '../api.js';

export default function Overview() {
  async function handleInvestigate(incidentId) {
    await api.investigate(incidentId);
  }

  return (
    <div className="page-grid">
      <ScenarioButton />
      <IncidentFeed onInvestigate={handleInvestigate} />
      <div className="page-grid-two">
        <ClusterHealthGrid />
        <AlertsPanel />
      </div>
    </div>
  );
}
