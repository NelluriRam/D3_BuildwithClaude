// Simulated ServiceNow-style incident queue. In-memory only, background
// generated. No real ITSM system or ticket data involved.

import { EventEmitter } from 'node:events';
import { SERVICE_NAMES } from './topology.js';
import { pick, chance, nowIso, nextId } from '../util.js';
import { _listServicesWithActiveAlerts } from './monitoring.js';

// Emits 'incident_created' with the new incident record whenever one is
// created, whether by the background randomizer or by a scripted scenario.
// Consumed by server/src/autoInvestigate.js to launch the SRE Agent
// automatically -- this module has no idea agents exist.
export const events = new EventEmitter();

const TITLE_TEMPLATES = [
  (s) => `Elevated error rate on ${s}`,
  (s) => `${s} failing health checks`,
  (s) => `Users reporting errors signing in via ${s}`,
  (s) => `${s} pods restarting repeatedly`,
  (s) => `Degraded throughput on ${s}`,
  (s) => `Intermittent 5xx responses from ${s}`,
  (s) => `Timeouts reported downstream of ${s}`,
];

const DESCRIPTION_TEMPLATES = [
  (s) => `Synthetic monitoring detected an anomaly on ${s}. Auto-filed for triage.`,
  (s) => `On-call paged after ${s} tripped its error-rate threshold for 3 consecutive checks.`,
  (s) => `Support escalation: multiple reports of failures traced to ${s}.`,
  (s) => `Deploy pipeline flagged ${s} as unhealthy post-rollout.`,
];

const REPORTERS = ['Synthetic monitoring', 'On-call page', 'Support escalation', 'Deploy pipeline'];

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
    description: pick(DESCRIPTION_TEMPLATES)(service),
    reported_by: pick(REPORTERS),
    affected_service: service,
    status: 'open',
    created_at: nowIso(),
    updated_at: nowIso(),
    resolved_at: null,
  };
  incidents.set(id, rec);
  events.emit('incident_created', rec);
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
    description: 'Injected by the LoopSentinel scripted demo scenario.',
    reported_by: 'Synthetic monitoring',
    affected_service: SERVICE_NAMES[0],
    status: 'open',
    created_at: nowIso(),
    updated_at: nowIso(),
    resolved_at: null,
    ...fields,
    id,
  };
  incidents.set(id, rec);
  events.emit('incident_created', rec);
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
