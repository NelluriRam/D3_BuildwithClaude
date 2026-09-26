import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function HallucinationResolvedPanel() {
  const { data } = usePolling(api.hallucinationResolved, 5000);
  const claims = data?.unsupportedClaimsLifetime;
  const tickets = data?.ticketsHeldOpen;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Hallucination outcomes</h2>
        <span className="panel-subtle">computed from logged grounding checks and verification verdicts</span>
      </div>
      <div className="kpi-row">
        <div className="kpi-tile">
          <div className="kpi-label">Unsupported claims caught (lifetime)</div>
          <div className="kpi-value">{claims ?? '—'}</div>
          <div className="kpi-caption">across every agent, including the grounding check on the SRE Agent</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Tickets correctly held open</div>
          <div className="kpi-value">{tickets ?? '—'}</div>
          <div className="kpi-caption">Verification Agent could not confirm the fix, so it never closed the ticket</div>
        </div>
      </div>
      {data && (
        <p className="metrics-footnote">
          LoopSentinel has caught {claims} unsupported claim{claims === 1 ? '' : 's'} across all agents, and correctly
          kept {tickets} ticket{tickets === 1 ? '' : 's'} open rather than closing {tickets === 1 ? 'it' : 'them'} on an
          unconfirmed fix.
        </p>
      )}
    </section>
  );
}
