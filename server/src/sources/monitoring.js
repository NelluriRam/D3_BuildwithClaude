// Simulated monitoring source (Datadog-style): metrics + alerts per service.
// In-memory only, background-mutated. No real monitoring backend involved.

import { SERVICE_NAMES } from './topology.js';
import { randFloat, chance, nowIso, nextId } from '../util.js';

const METRICS = ['latency_ms', 'error_rate_pct', 'traffic_rps'];
const BASELINES = {
  latency_ms: { min: 40, max: 220 },
  error_rate_pct: { min: 0.01, max: 1.5 },
  traffic_rps: { min: 20, max: 900 },
};
const HISTORY_LEN = 30;

const metrics = new Map(); // service -> { latency_ms: [{ts,value}], ... }
const alerts = new Map(); // alert id -> alert

function seed() {
  for (const service of SERVICE_NAMES) {
    const series = {};
    for (const m of METRICS) {
      const { min, max } = BASELINES[m];
      series[m] = Array.from({ length: HISTORY_LEN }, () => ({
        ts: nowIso(),
        value: randFloat(min, max, 2),
      }));
    }
    metrics.set(service, series);
  }
}
seed();

function pushPoint(service, metric, value) {
  const series = metrics.get(service)[metric];
  series.push({ ts: nowIso(), value });
  if (series.length > HISTORY_LEN) series.shift();
}

function tick() {
  for (const service of SERVICE_NAMES) {
    for (const metric of METRICS) {
      const { min, max } = BASELINES[metric];
      const series = metrics.get(service)[metric];
      const last = series[series.length - 1].value;
      let next = last + (Math.random() - 0.5) * (max - min) * 0.08;
      next = Math.max(min * 0.5, Math.min(max * 1.2, next));
      pushPoint(service, metric, Number(next.toFixed(2)));
    }
  }

  // Occasionally spike one service's error rate / latency and raise an alert.
  if (chance(0.12)) {
    const service = SERVICE_NAMES[Math.floor(Math.random() * SERVICE_NAMES.length)];
    const metric = chance(0.6) ? 'error_rate_pct' : 'latency_ms';
    const spikeValue = metric === 'error_rate_pct' ? randFloat(8, 35, 2) : randFloat(800, 2500, 0);
    pushPoint(service, metric, spikeValue);
    raiseAlert(service, metric, spikeValue);
  }

  // Resolve some old alerts.
  for (const alert of alerts.values()) {
    if (alert.status === 'active' && chance(0.15)) {
      alert.status = 'resolved';
      alert.resolved_at = nowIso();
    }
  }
}

function raiseAlert(service, metric, value) {
  const severity = value > (metric === 'error_rate_pct' ? 20 : 1500) ? 'critical' : 'warning';
  const id = nextId('alert');
  alerts.set(id, {
    id,
    service,
    metric,
    value,
    severity,
    status: 'active',
    message: `${metric} anomaly on ${service}: ${value}${metric === 'error_rate_pct' ? '%' : 'ms'}`,
    created_at: nowIso(),
    resolved_at: null,
  });
  return id;
}

export function startBackgroundProcess(intervalMs = 3000) {
  return setInterval(tick, intervalMs);
}

// --- Tool-callable functions -------------------------------------------------

export function get_active_alerts() {
  return [...alerts.values()]
    .filter((a) => a.status === 'active')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function get_metric_history({ service, metric }) {
  const series = metrics.get(service);
  if (!series) return { error: `unknown service: ${service}` };
  if (!METRICS.includes(metric)) return { error: `unknown metric: ${metric}`, available: METRICS };
  return { service, metric, points: series[metric] };
}

// --- Scenario hooks ----------------------------------------------------------

export function _forceAlert(service, metric, value, severity = 'critical') {
  pushPoint(service, metric, value);
  return raiseAlert(service, metric, value, severity);
}

export function _forceMetricFlat(service, metric, value) {
  const series = metrics.get(service)[metric];
  for (let i = 0; i < series.length; i += 1) series[i] = { ts: nowIso(), value };
}

export function _listServicesWithActiveAlerts() {
  return [...new Set([...alerts.values()].filter((a) => a.status === 'active').map((a) => a.service))];
}
