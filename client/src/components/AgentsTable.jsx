import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

function formatLastActive(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function AgentsTable({ onSimulated }) {
  const { data: agents, loading, refresh } = usePolling(api.agents, 4000);
  const [simulating, setSimulating] = React.useState(null);
  const [error, setError] = React.useState(null);

  async function handleSimulate(name) {
    setSimulating(name);
    setError(null);
    try {
      const result = await api.simulateAgent(name);
      onSimulated?.(name, result);
      await refresh();
    } catch (err) {
      setError(`${name}: ${err.message}`);
    } finally {
      setSimulating(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Agents</h2>
        <span className="panel-subtle">Every agent LoopSentinel currently monitors — built-in and registered</span>
      </div>
      {loading && !agents ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Role / purpose</th>
              <th>Status</th>
              <th>Sessions run</th>
              <th>Last active</th>
              <th>Flags raised</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(agents ?? []).map((a) => (
              <tr key={a.key}>
                <td>
                  {a.name}
                  {a.builtin && <span className="text-faint"> (built-in)</span>}
                </td>
                <td className="text-faint">{a.role || '—'}</td>
                <td>
                  <span className={`badge badge-session-${a.status === 'active' ? 'completed' : 'paused'}`}>{a.status}</span>
                </td>
                <td className="mono">{a.sessionCount}</td>
                <td className="mono">{formatLastActive(a.lastActive)}</td>
                <td className="mono">{a.flagsRaised}</td>
                <td>
                  {!a.builtin && (
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={simulating === a.key}
                      onClick={() => handleSimulate(a.key)}
                      title="Runs one lightweight, synthetic investigation for this agent through the same LoopSentinel gateway as the built-in agents."
                    >
                      {simulating === a.key ? 'Simulating…' : 'Simulate activity'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="plain-caption" style={{ color: 'var(--accent)' }}>{error}</p>}
    </section>
  );
}
