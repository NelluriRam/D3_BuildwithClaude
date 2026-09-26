import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function AlertsPanel() {
  const { data: alerts, loading } = usePolling(api.alerts, 3000);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Active alerts</h2>
        <span className="panel-subtle">Monitoring (simulated)</span>
      </div>
      {loading && !alerts ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Metric</th>
              <th>Value</th>
              <th>Severity</th>
              <th>Raised</th>
            </tr>
          </thead>
          <tbody>
            {(alerts ?? []).map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.service}</td>
                <td className="mono">{a.metric}</td>
                <td className="mono">{a.value}</td>
                <td>
                  <span className={`badge badge-severity-${a.severity}`}>{a.severity}</span>
                </td>
                <td className="mono">{new Date(a.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
            {alerts && alerts.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">No active alerts.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
