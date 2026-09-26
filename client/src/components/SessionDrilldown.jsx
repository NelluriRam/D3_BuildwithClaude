import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';
import { describeFlagType, describePauseReason, describeGroundingConfidence } from '../plainLanguage.js';

function CallRow({ call }) {
  const [open, setOpen] = React.useState(false);
  const label = call.call_type === 'tool_call' ? `${call.tool_source}.${call.tool_name}` : 'claude_message';
  return (
    <>
      <tr className={call.flagged ? 'is-flagged' : ''} onClick={() => setOpen((v) => !v)}>
        <td className="mono">{call.seq}</td>
        <td className="mono">{label}</td>
        <td className="mono">{new Date(call.timestamp).toLocaleTimeString()}</td>
        <td className="mono">{call.tokens_input + call.tokens_output || '—'}</td>
        <td className="mono">${call.cost_usd.toFixed(4)}</td>
        <td>{call.flagged ? <span className="badge badge-flagged">flagged</span> : ''}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6}>
            <div className="call-detail">
              <div>
                <div className="call-detail-label">Args</div>
                <pre className="log-block">{call.args_json}</pre>
              </div>
              <div>
                <div className="call-detail-label">Response</div>
                <pre className="log-block">{call.response_json}</pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SessionDrilldown({ sessionId, onKilled }) {
  const { data, loading, refresh } = usePolling(
    () => (sessionId ? api.sessionDetail(sessionId) : Promise.resolve(null)),
    2000,
    [sessionId]
  );
  const [killing, setKilling] = React.useState(false);

  if (!sessionId) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Session detail</h2>
        </div>
        <p className="empty-state">Select a session to see its full call log.</p>
      </section>
    );
  }

  if (loading && !data) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Session detail</h2>
        </div>
        <p className="empty-state">Loading...</p>
      </section>
    );
  }

  if (!data) return null;
  const { session, calls, flags, grounding } = data;

  async function handleKill() {
    setKilling(true);
    try {
      await api.killSession(sessionId);
      await refresh();
      onKilled?.();
    } finally {
      setKilling(false);
    }
  }

  const canKill = session.status === 'active' || session.status === 'paused';

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Session detail — {session.id}</h2>
        <div className="panel-header-actions">
          <span className="panel-subtle">{session.agent_type} agent</span>
          <a className="btn btn-small" href={api.exportAuditLogUrl(session.id)} download>
            Export audit log
          </a>
        </div>
      </div>

      <div className="session-meta">
        <div>
          <span className="session-meta-label">Status</span>
          <span className={`badge badge-session-${session.status}`}>{session.status}</span>
        </div>
        <div>
          <span className="session-meta-label">Cost</span>
          <span className="mono">${session.total_cost_usd.toFixed(4)}</span>
        </div>
        <div>
          <span className="session-meta-label">Tokens</span>
          <span className="mono">{session.total_tokens}</span>
        </div>
        <div>
          <span className="session-meta-label">Calls</span>
          <span className="mono">{session.call_count}</span>
        </div>
        {canKill && (
          <button type="button" className="btn btn-danger btn-small" disabled={killing} onClick={handleKill}>
            {killing ? 'Killing…' : 'Kill session'}
          </button>
        )}
      </div>

      {session.status_reason && (
        <div className="session-reason">
          <span className="session-meta-label">Reason</span> {session.status_reason}
          {describePauseReason(session.status_reason) && (
            <span className="plain-caption">{describePauseReason(session.status_reason)}</span>
          )}
        </div>
      )}

      {flags.length > 0 && (
        <div className="flags-block">
          <div className="call-detail-label">Flagged claims / loops</div>
          <ul>
            {flags.map((f) => (
              <li key={f.id}>
                <span className="badge badge-flagged">{f.flag_type}</span>{' '}
                <span
                  className="badge badge-signal"
                  title={f.signal_strength_detail?.formula ?? 'signal strength'}
                >
                  signal {f.signal_strength}
                </span>{' '}
                {f.detail}
                <span className="plain-caption">{describeFlagType(f.flag_type)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {grounding && (
        <div className="grounding-block">
          <div className="call-detail-label">
            Report grounding{' '}
            <span
              className="badge badge-signal"
              title={`${grounding.claims.filter((c) => c.grounded).length} of ${grounding.claims.length} claims matched to logged evidence → ${grounding.confidence}`}
            >
              confidence {grounding.confidence}
            </span>
            <span className="plain-caption">{describeGroundingConfidence(grounding)}</span>
          </div>
          <pre className="log-block">{grounding.reportText}</pre>
          <ul className="claims-list">
            {grounding.claims.map((c) => (
              <li key={c.id} className={c.grounded ? '' : 'is-flagged'}>
                <span className={`badge ${c.grounded ? 'badge-grounded' : 'badge-flagged'}`}>
                  {c.grounded ? 'Grounded' : 'Unsupported'}
                </span>{' '}
                {c.claim}
                {!c.grounded && c.unmatched_values.length > 0 && (
                  <span className="text-faint">
                    {' '}
                    (unmatched: {c.unmatched_values.join(', ')}
                    {c.cross_session_leakage ? ' — matches another session’s evidence instead' : ''})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Call</th>
            <th>Time</th>
            <th>Tokens</th>
            <th>Cost</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <CallRow key={c.id} call={c} />
          ))}
          {calls.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-state">No calls logged yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
