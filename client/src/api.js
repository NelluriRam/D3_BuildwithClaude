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
  scenarioStatus: () => req('/scenario'),
  forceScenario: () => req('/scenario/force', { method: 'POST' }),
  activity: (limit = 40) => req(`/activity?limit=${limit}`),
  costSaved: () => req('/metrics/cost-saved'),
  timeToDetect: () => req('/metrics/time-to-detect'),
  unsupportedClaims: () => req('/metrics/unsupported-claims'),
  mostRecentCatch: () => req('/metrics/most-recent-catch'),
  exportAuditLogUrl: (sessionId) => `${BASE}/export/audit-log${sessionId ? `?session_id=${sessionId}` : ''}`,
};
