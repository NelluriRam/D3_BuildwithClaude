import React from 'react';
import { api } from '../api.js';

export default function ScenarioButton() {
  const [state, setState] = React.useState('idle'); // idle | running | done | error
  const [result, setResult] = React.useState(null);

  async function trigger() {
    setState('running');
    setResult(null);
    try {
      const res = await api.triggerScenario();
      setResult(res);
      setState('done');
    } catch (err) {
      setResult({ error: err.message });
      setState('error');
    }
  }

  const sreStatus = result?.sre?.status;

  return (
    <section className="panel scenario-panel">
      <div className="panel-header">
        <h2>Scripted demo scenario</h2>
        <span className="panel-subtle">checkout-service CrashLoopBackOff (red herring: payment-service)</span>
      </div>
      <p className="scenario-copy">
        Forces checkout-service into CrashLoopBackOff with logs that repeatedly implicate a healthy
        upstream service. Runs the SRE Agent against it live, through the LoopSentinel gateway.
      </p>
      <button type="button" className="btn btn-primary" disabled={state === 'running'} onClick={trigger}>
        {state === 'running' ? 'Running scenario…' : 'Trigger scenario'}
      </button>
      {result && !result.error && (
        <div className={`scenario-result${sreStatus === 'paused' ? ' is-flagged' : ''}`}>
          <div>
            Incident <span className="mono">{result.incident.id}</span> created, SRE session{' '}
            <span className="mono">{result.sre.sessionId}</span> ended as{' '}
            <strong>{sreStatus}</strong>.
          </div>
          {sreStatus === 'paused' && (
            <div>LoopSentinel paused this session for human review — see it in the Sessions panel.</div>
          )}
        </div>
      )}
      {result?.error && <div className="scenario-result is-flagged">Error: {result.error}</div>}
    </section>
  );
}
