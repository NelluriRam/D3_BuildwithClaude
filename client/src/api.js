const BASE = '/api';

async function req(path, opts) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  incidents: () => req('/incidents'),
  clusters: () => req('/clusters'),
  deployments: (clusterId) => req(`/deployments${clusterId ? `?cluster_id=${clusterId}` : ''}`),
  deploymentLogs: (clusterId, name) => req(`/deployments/${clusterId}/${name}/logs`),
  alerts: () => req('/alerts'),
  kafkaTopics: () => req('/kafka/topics'),
  docs: () => req('/docs'),
  sessions: () => req('/sessions'),
  sessionDetail: (id) => req(`/sessions/${id}`),
  killSession: (id) => req(`/sessions/${id}/kill`, { method: 'POST' }),
  config: () => req('/config'),
  scenarioMeta: () => req('/scenario'),
  triggerScenario: () => req('/scenario/trigger', { method: 'POST' }),
  investigate: (incidentId) => req(`/incidents/${incidentId}/investigate`, { method: 'POST' }),
};
