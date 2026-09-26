import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function DeploymentsTable({ clusterId }) {
  const { data: deployments, loading } = usePolling(api.deployments.bind(null, clusterId), 3000, [clusterId]);
  const [expanded, setExpanded] = React.useState(null); // deployment_name
  const [logs, setLogs] = React.useState(null);

  async function toggleLogs(dep) {
    if (expanded === dep.deployment_name) {
      setExpanded(null);
      setLogs(null);
      return;
    }
    setExpanded(dep.deployment_name);
    const result = await api.deploymentLogs(dep.cluster_id, dep.deployment_name);
    setLogs(result);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Deployments{clusterId ? ` — ${clusterId}` : ' — all clusters'}</h2>
        <span className="panel-subtle">{deployments?.length ?? 0} shown</span>
      </div>
      {loading && !deployments ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Cluster</th>
              <th>Deployment</th>
              <th>Status</th>
              <th>Replicas</th>
              <th>HPA</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(deployments ?? []).map((d) => (
              <React.Fragment key={`${d.cluster_id}::${d.deployment_name}`}>
                <tr>
                  <td className="mono">{d.cluster_id}</td>
                  <td className="mono">{d.deployment_name}</td>
                  <td>
                    <span className={`badge badge-status-${d.status}`}>{d.status}</span>
                  </td>
                  <td className="mono">{d.replica_count}/{d.desired_replicas}</td>
                  <td className="mono">{d.hpa_enabled ? 'on' : 'off'}</td>
                  <td className="mono">{new Date(d.last_updated).toLocaleTimeString()}</td>
                  <td>
                    <button type="button" className="btn btn-small" onClick={() => toggleLogs(d)}>
                      {expanded === d.deployment_name ? 'Hide logs' : 'View logs'}
                    </button>
                  </td>
                </tr>
                {expanded === d.deployment_name && (
                  <tr>
                    <td colSpan={7}>
                      <pre className="log-block">
                        {(logs?.lines ?? ['Loading...']).join('\n')}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
