import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function IncidentFeed({ onInvestigate }) {
  const { data: incidents, loading } = usePolling(api.incidents, 3000);
  const [investigating, setInvestigating] = React.useState(null);

  async function handleInvestigate(id) {
    setInvestigating(id);
    try {
      await onInvestigate(id);
    } finally {
      setInvestigating(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Incident feed</h2>
        <span className="panel-subtle">ServiceNow (simulated)</span>
      </div>
      {loading && !incidents ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Priority</th>
              <th>Title</th>
              <th>Service</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(incidents ?? []).slice(0, 12).map((inc) => (
              <tr key={inc.id}>
                <td className="mono">{inc.id}</td>
                <td>
                  <span className={`badge badge-priority-${inc.priority}`}>{inc.priority}</span>
                </td>
                <td>{inc.title}</td>
                <td className="mono">{inc.affected_service}</td>
                <td>
                  <span className={`badge badge-status-${inc.status}`}>{inc.status}</span>
                </td>
                <td className="mono">{new Date(inc.created_at).toLocaleTimeString()}</td>
                <td>
                  {inc.status === 'open' && (
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={investigating === inc.id}
                      onClick={() => handleInvestigate(inc.id)}
                    >
                      {investigating === inc.id ? 'Investigating…' : 'Investigate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {incidents && incidents.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">No incidents yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
