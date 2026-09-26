import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function SessionsTable({ selectedId, onSelect }) {
  const { data: sessions, loading } = usePolling(api.sessions, 2000);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Sessions</h2>
        <span className="panel-subtle">Every SRE / Remediation agent session</span>
      </div>
      {loading && !sessions ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Agent</th>
              <th>Incident</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Calls</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((s) => (
              <tr
                key={s.id}
                className={`session-row${selectedId === s.id ? ' is-selected' : ''}${s.needs_review ? ' is-flagged' : ''}`}
                onClick={() => onSelect(s.id)}
              >
                <td className="mono">{s.id}</td>
                <td>{s.agent_type}</td>
                <td className="mono">{s.incident_id ?? '—'}</td>
                <td>
                  <span className={`badge badge-session-${s.status}`}>{s.status}</span>
                </td>
                <td className="mono">${s.total_cost_usd.toFixed(4)}</td>
                <td className="mono">{s.call_count}</td>
                <td className="mono">{new Date(s.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
            {sessions && sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">No sessions yet — investigate an incident or trigger the scenario.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
