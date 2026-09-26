import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function ScenarioInfo() {
  const { data } = usePolling(api.scenarioStatus, 5000);

  return (
    <section className="panel scenario-panel">
      <div className="panel-header">
        <h2>Automated demo scenario</h2>
        <span className="panel-subtle">runs on its own — no manual trigger</span>
      </div>
      <p className="scenario-copy">
        {data?.description ??
          'LoopSentinel periodically injects a scripted CrashLoopBackOff with a red-herring log trail, then automatically investigates it end to end.'}
      </p>
      <div className="scenario-status-row">
        <span className="session-meta-label">Last injected</span>
        <span className="mono">
          {data?.last_triggered_at ? new Date(data.last_triggered_at).toLocaleTimeString() : 'not yet — runs automatically shortly after startup'}
        </span>
      </div>
    </section>
  );
}
