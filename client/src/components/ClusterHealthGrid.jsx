import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

export default function ClusterHealthGrid({ onSelectCluster, selectedCluster }) {
  const { data: clusters, loading } = usePolling(api.clusters, 3000);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Cluster health</h2>
        <span className="panel-subtle">Kubernetes (simulated) — 5 clusters × 30 deployments</span>
      </div>
      {loading && !clusters ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <div className="cluster-cards">
          {(clusters ?? []).map((c) => (
            <button
              type="button"
              key={c.id}
              className={`cluster-card${selectedCluster === c.id ? ' is-selected' : ''}`}
              onClick={() => onSelectCluster?.(c.id === selectedCluster ? null : c.id)}
            >
              <div className="cluster-card-name">{c.name}</div>
              <div className="cluster-card-region mono">{c.region}</div>
              <div className="cluster-card-stats">
                <span>{c.deployment_count} deployments</span>
                <span className={c.unhealthy_count > 0 ? 'text-flag' : ''}>
                  {c.unhealthy_count} unhealthy
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
