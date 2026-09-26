// Simulated Kubernetes source: 5 clusters x 30 deployments (150 total).
// All state is in-memory and mutated by a background interval. No real
// cluster, container runtime, or API server is involved.

import { CLUSTERS, SERVICE_NAMES } from './topology.js';
import { pick, randInt, chance, nowIso } from '../util.js';

const STATUSES = ['Running', 'Running', 'Running', 'Running', 'Pending', 'CrashLoopBackOff', 'OOMKilled'];
const DEPLOYMENTS_PER_CLUSTER = 30;

const NORMAL_LOG_LINES = [
  'INFO connection established to upstream pool',
  'INFO health check passed (200 OK)',
  'INFO request handled in {ms}ms',
  'INFO readiness probe succeeded',
  'DEBUG cache hit ratio 0.9{d}',
  'INFO graceful shutdown signal not received, continuing',
  'INFO scaled connection pool to {n} idle clients',
];

const WARN_LOG_LINES = [
  'WARN slow query detected ({ms}ms) on upstream',
  'WARN connection pool near capacity ({n}/{max})',
  'WARN retrying upstream request (attempt {n})',
];

const ERROR_LOG_LINES = [
  'ERROR readiness probe failed: connection refused',
  'ERROR OOMKilled: container exceeded memory limit ({n}Mi)',
  'ERROR CrashLoopBackOff: back-off restarting failed container',
  'ERROR panic: unexpected nil pointer in request handler',
  'ERROR liveness probe failed 3 times, restarting container',
];

function fill(line) {
  return line
    .replace('{ms}', randInt(5, 900))
    .replace('{d}', randInt(1, 9))
    .replace('{n}', randInt(1, 50))
    .replace('{max}', 50);
}

function genLogLines(status, count = randInt(5, 10)) {
  const lines = [];
  for (let i = 0; i < count; i += 1) {
    let pool = NORMAL_LOG_LINES;
    if (status === 'CrashLoopBackOff' || status === 'OOMKilled') {
      pool = chance(0.6) ? ERROR_LOG_LINES : WARN_LOG_LINES;
    } else if (status === 'Pending') {
      pool = chance(0.5) ? WARN_LOG_LINES : NORMAL_LOG_LINES;
    } else if (chance(0.1)) {
      pool = WARN_LOG_LINES;
    }
    lines.push({ ts: nowIso(), line: fill(pick(pool)) });
  }
  return lines;
}

const deployments = new Map(); // key: cluster_id::deployment_name

function key(clusterId, name) {
  return `${clusterId}::${name}`;
}

function seed() {
  for (const cluster of CLUSTERS) {
    for (let i = 0; i < DEPLOYMENTS_PER_CLUSTER; i += 1) {
      const service = SERVICE_NAMES[i % SERVICE_NAMES.length];
      const suffix = i < SERVICE_NAMES.length ? '' : (i % 2 === 0 ? '-worker' : '-canary');
      const name = `${service}${suffix}`;
      const status = chance(0.92) ? 'Running' : pick(STATUSES);
      const desired = randInt(2, 6);
      const rec = {
        cluster_id: cluster.id,
        cluster_name: cluster.name,
        deployment_name: name,
        desired_replicas: desired,
        replica_count: status === 'Running' ? desired : randInt(0, desired - 1),
        status,
        hpa_enabled: chance(0.15),
        last_updated: nowIso(),
        logs: genLogLines(status),
      };
      deployments.set(key(cluster.id, name), rec);
    }
  }
}
seed();

// Deployments pinned by a scripted scenario are skipped by the background
// randomizer so the demo stays reproducible while the scenario is live.
const pinned = new Set();

export function _pinDeployment(clusterId, deploymentName) {
  pinned.add(key(clusterId, deploymentName));
}

export function _unpinDeployment(clusterId, deploymentName) {
  pinned.delete(key(clusterId, deploymentName));
}

function randomWalk() {
  const all = [...deployments.values()].filter((d) => !pinned.has(key(d.cluster_id, d.deployment_name)));
  // Nudge a small handful of deployments per tick.
  const touched = new Set();
  const n = randInt(1, 4);
  for (let i = 0; i < n; i += 1) {
    const rec = pick(all);
    if (touched.has(rec)) continue;
    touched.add(rec);

    if (rec.status === 'Running' && chance(0.06)) {
      rec.status = pick(['CrashLoopBackOff', 'OOMKilled', 'Pending']);
      rec.replica_count = Math.max(0, rec.replica_count - randInt(1, 2));
    } else if (rec.status !== 'Running' && chance(0.35)) {
      // Self-heals sometimes, like a real flaky pod.
      rec.status = 'Running';
      rec.replica_count = rec.desired_replicas;
    }
    rec.logs = genLogLines(rec.status, randInt(1, 3)).concat(rec.logs).slice(0, 10);
    rec.last_updated = nowIso();
  }
}

export function startBackgroundProcess(intervalMs = 4000) {
  return setInterval(randomWalk, intervalMs);
}

// --- Tool-callable functions -------------------------------------------------

export function list_clusters() {
  return CLUSTERS.map((c) => {
    const deps = [...deployments.values()].filter((d) => d.cluster_id === c.id);
    const unhealthy = deps.filter((d) => d.status !== 'Running').length;
    return { ...c, deployment_count: deps.length, unhealthy_count: unhealthy };
  });
}

export function list_deployments({ cluster_id } = {}) {
  const all = [...deployments.values()];
  const filtered = cluster_id ? all.filter((d) => d.cluster_id === cluster_id) : all;
  return filtered.map(({ logs, ...rest }) => rest);
}

export function get_deployment_status({ cluster_id, deployment_name }) {
  const rec = deployments.get(key(cluster_id, deployment_name));
  if (!rec) return { error: `deployment not found: ${cluster_id}/${deployment_name}` };
  const { logs, ...rest } = rec;
  return rest;
}

export function get_pod_logs({ cluster_id, deployment_name }) {
  const rec = deployments.get(key(cluster_id, deployment_name));
  if (!rec) return { error: `deployment not found: ${cluster_id}/${deployment_name}` };
  return { cluster_id, deployment_name, lines: rec.logs.map((l) => `[${l.ts}] ${l.line}`) };
}

// --- Simulated remediation (state mutation only, no real system touched) ---

export function restart_deployment({ cluster_id, deployment_name }) {
  const rec = deployments.get(key(cluster_id, deployment_name));
  if (!rec) return { error: `deployment not found: ${cluster_id}/${deployment_name}` };
  rec.status = 'Running';
  rec.replica_count = rec.desired_replicas;
  rec.last_updated = nowIso();
  rec.logs = [{ ts: nowIso(), line: 'INFO deployment restarted by Remediation Agent (simulated action)' }, ...rec.logs].slice(0, 10);
  return { ok: true, cluster_id, deployment_name, new_status: rec.status };
}

export function scale_deployment({ cluster_id, deployment_name, replicas }) {
  const rec = deployments.get(key(cluster_id, deployment_name));
  if (!rec) return { error: `deployment not found: ${cluster_id}/${deployment_name}` };
  rec.desired_replicas = replicas;
  rec.replica_count = replicas;
  if (rec.status !== 'Running') rec.status = 'Running';
  rec.last_updated = nowIso();
  rec.logs = [{ ts: nowIso(), line: `INFO scaled to ${replicas} replicas by Remediation Agent (simulated action)` }, ...rec.logs].slice(0, 10);
  return { ok: true, cluster_id, deployment_name, new_status: rec.status, replica_count: rec.replica_count };
}

// --- Scenario hook (Phase 4 uses this to force reproducible state) ---------

export function _setDeploymentLogs(clusterId, deploymentName, lines) {
  const rec = deployments.get(key(clusterId, deploymentName));
  if (!rec) return null;
  rec.logs = lines.map((line) => ({ ts: nowIso(), line }));
  return rec;
}

export function _forceDeployment(clusterId, deploymentName, patch) {
  const rec = deployments.get(key(clusterId, deploymentName));
  if (!rec) return null;
  Object.assign(rec, patch, { last_updated: nowIso() });
  return rec;
}

export function _getRaw(clusterId, deploymentName) {
  return deployments.get(key(clusterId, deploymentName));
}

export function _listAllRaw() {
  return [...deployments.values()];
}
