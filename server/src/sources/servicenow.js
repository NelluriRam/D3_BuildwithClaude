// Simulated ServiceNow-style incident queue. In-memory only, background
// generated. No real ITSM system or ticket data involved.

import { SERVICE_NAMES } from './topology.js';
import { pick, chance, nowIso, nextId } from '../util.js';
import { _listServicesWithActiveAlerts } from './monitoring.js';

const TITLE_TEMPLATES = [
  (s) => `Elevated error rate on ${s}`,
  (s) => `${s} failing health checks`,
  (s) => `Customers reporting slowness on ${s}`,
  (s) => `${s} pods restarting repeatedly`,
  (s) => `Degraded throughput on ${s}`,
  (s) => `Intermittent 5xx responses from ${s}`,
];

const incidents = new Map();

function priorityFor(service, hasAlert) {
  if (hasAlert && chance(0.5)) return 'P1';
  return pick(['P1', 'P2', 'P2', 'P4', 'P4']);
}

function createIncident(service) {
  const hasAlert = _listServicesWithActiveAlerts().includes(service);
  const id = nextId('INC');
  const rec = {
    id,
    priority: priorityFor(service, hasAlert),
    title: pick(TITLE_TEMPLATES)(service),
    affected_service: service,
    status: 'open',
    created_at: nowIso(),
    updated_at: nowIso(),
    resolved_at: null,
  };
  incidents.set(id, rec);
  return rec;
}

function tick() {
  if (chance(0.25)) {
    const alerting = _listServicesWithActiveAlerts();
    const service = alerting.length && chance(0.7) ? pick(alerting) : pick(SERVICE_NAMES);
    createIncident(service);
  }
  for (const inc of incidents.values()) {
    if (inc.status === 'open' && chance(0.08)) {
      inc.status = 'resolved';
      inc.updated_at = nowIso();
      inc.resolved_at = nowIso();
    }
  }
}

export function startBackgroundProcess(intervalMs = 6000) {
  return setInterval(tick, intervalMs);
}

// --- Tool-callable functions -------------------------------------------------

export function get_open_incidents() {
  return [...incidents.values()]
    .filter((i) => i.status === 'open')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function get_incident_detail({ id }) {
  const rec = incidents.get(id);
  if (!rec) return { error: `incident not found: ${id}` };
  return rec;
}

export function get_all_incidents() {
  return [...incidents.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// --- Scenario hooks ----------------------------------------------------------

export function _forceIncident(fields) {
  const id = nextId('INC');
  const rec = {
    id,
    priority: 'P1',
    title: 'Scripted scenario incident',
    affected_service: SERVICE_NAMES[0],
    status: 'open',
    created_at: nowIso(),
    updated_at: nowIso(),
    resolved_at: null,
    ...fields,
    id,
  };
  incidents.set(id, rec);
  return rec;
}

export function _resolveIncident(id) {
  const rec = incidents.get(id);
  if (!rec) return null;
  rec.status = 'resolved';
  rec.updated_at = nowIso();
  rec.resolved_at = nowIso();
  return rec;
}
