import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

function investigationLabel(inc) {
  const inv = inc.investigation;
  if (!inv) {
    if (inc.priority === 'P1' || inc.priority === 'P2') return 'queued';
    return 'not auto-triaged (P4)';
  }
  if (inv.status === 'active') return 'investigating…';
  if (inv.status === 'paused') return 'paused — needs review';
  if (inv.status === 'killed') return 'killed';
  if (inv.status === 'completed') return 'resolved by agent';
  if (inv.status === 'handed_off') return 'handed off';
  return inv.status;
}

export default function IncidentFeed() {
  const { data: incidents, loading } = usePolling(api.incidents, 2000);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Incident feed</h2>
        <span className="panel-subtle">ServiceNow (simulated) — investigated automatically</span>
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
              <th>Investigation</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {(incidents ?? []).slice(0, 14).map((inc) => (
              <tr key={inc.id} title={inc.description}>
                <td className="mono">{inc.id}</td>
                <td>
                  <span className={`badge badge-priority-${inc.priority}`}>{inc.priority}</span>
                </td>
                <td>{inc.title}</td>
                <td className="mono">{inc.affected_service}</td>
                <td>
                  <span className={`badge badge-status-${inc.status}`}>{inc.status}</span>
                </td>
                <td>
                  <span className={`badge badge-investigation-${inc.investigation?.status ?? 'none'}`}>
                    {investigationLabel(inc)}
                  </span>
                </td>
                <td className="mono">{new Date(inc.created_at).toLocaleTimeString()}</td>
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
