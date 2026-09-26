import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function ScenarioInfo() {
  const { data, refresh } = usePolling(api.scenarioStatus, 5000);
  const [forcing, setForcing] = React.useState(false);

  async function handleForce() {
    setForcing(true);
    try {
      await api.forceScenario();
      await refresh();
    } finally {
      setForcing(false);
    }
  }

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
      <div className="demo-control-row">
        <button
          type="button"
          className="demo-control-link"
          onClick={handleForce}
          disabled={forcing}
          title="Operator/rehearsal safeguard only — fires the same automatic scenario the timer already runs, on demand. Live incidents are never manually triggered."
        >
          {forcing ? 'Forcing…' : 'Force scenario now (demo control)'}
        </button>
      </div>
    </section>
  );
}
