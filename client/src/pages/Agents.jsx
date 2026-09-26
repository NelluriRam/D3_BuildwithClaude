import React from 'react';
import AgentsTable from '../components/AgentsTable.jsx';
import RegisterAgentForm from '../components/RegisterAgentForm.jsx';

export default function Agents() {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [lastResult, setLastResult] = React.useState(null);

  function handleRegistered() {
    setRefreshKey((k) => k + 1);
  }

  function handleSimulated(name, result) {
    setLastResult({ name, result });
  }

  return (
    <div className="page-grid">
      <AgentsTable key={refreshKey} onSimulated={handleSimulated} />
      <RegisterAgentForm onRegistered={handleRegistered} />
      {lastResult && (
        <section className="panel">
          <div className="panel-header">
            <h2>Last simulated activity: {lastResult.name}</h2>
            <span className="panel-subtle">
              Simulated onboarding run — a synthetic investigation, not a connection to any real system
            </span>
          </div>
          <p className="mono" style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(lastResult.result, null, 2)}
          </p>
        </section>
      )}
    </div>
  );
}
