// Uniform tool-calling registry over the five simulated data sources.
// Every entry here is what the LoopSentinel gateway (Phase 2) and the
// Claude-powered agents (Phase 3) see as a callable "tool".

import * as servicenow from './servicenow.js';
import * as monitoring from './monitoring.js';
import * as kubernetes from './kubernetes.js';
import * as kafka from './kafka.js';
import * as confluence from './confluence.js';

export const sources = { servicenow, monitoring, kubernetes, kafka, confluence };

export function startAllBackgroundProcesses() {
  return [
    servicenow.startBackgroundProcess(),
    monitoring.startBackgroundProcess(),
    kubernetes.startBackgroundProcess(),
    kafka.startBackgroundProcess(),
  ];
}

// Investigation tools available to the SRE Agent.
export const SRE_TOOLS = [
  {
    source: 'servicenow',
    name: 'get_open_incidents',
    description: 'List all currently open incidents from the ServiceNow-style incident queue.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    source: 'servicenow',
    name: 'get_incident_detail',
    description: 'Get full detail for a single incident by id.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    source: 'monitoring',
    name: 'get_active_alerts',
    description: 'List all currently active monitoring alerts across all services.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    source: 'monitoring',
    name: 'get_metric_history',
    description: 'Get recent metric history (latency_ms, error_rate_pct, or traffic_rps) for a service.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name, e.g. patient-portal-service' },
        metric: { type: 'string', enum: ['latency_ms', 'error_rate_pct', 'traffic_rps'] },
      },
      required: ['service', 'metric'],
    },
  },
  {
    source: 'kubernetes',
    name: 'list_clusters',
    description: 'List all Kubernetes clusters with deployment health summary.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    source: 'kubernetes',
    name: 'list_deployments',
    description: 'List deployments in a cluster (or all clusters if cluster_id omitted).',
    input_schema: { type: 'object', properties: { cluster_id: { type: 'string' } }, required: [] },
  },
  {
    source: 'kubernetes',
    name: 'get_deployment_status',
    description: 'Get the status of one deployment (replica count, status, hpa_enabled, etc).',
    input_schema: {
      type: 'object',
      properties: { cluster_id: { type: 'string' }, deployment_name: { type: 'string' } },
      required: ['cluster_id', 'deployment_name'],
    },
  },
  {
    source: 'kubernetes',
    name: 'get_pod_logs',
    description: 'Get the most recent pod log lines for a deployment.',
    input_schema: {
      type: 'object',
      properties: { cluster_id: { type: 'string' }, deployment_name: { type: 'string' } },
      required: ['cluster_id', 'deployment_name'],
    },
  },
  {
    source: 'kafka',
    name: 'list_topics',
    description: 'List all Kafka topics with consumer lag and producer throughput.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    source: 'kafka',
    name: 'get_topic_lag',
    description: 'Get consumer lag detail for one Kafka topic.',
    input_schema: { type: 'object', properties: { topic_name: { type: 'string' } }, required: ['topic_name'] },
  },
  {
    source: 'confluence',
    name: 'search_docs',
    description: 'Search internal architecture/runbook docs by keyword.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    source: 'confluence',
    name: 'get_doc',
    description: 'Fetch a single internal doc by id.',
    input_schema: { type: 'object', properties: { doc_id: { type: 'string' } }, required: ['doc_id'] },
  },
];

// Remediation tools available to the Remediation Agent (simulated state
// changes only — no real system is ever touched).
export const REMEDIATION_TOOLS = [
  {
    source: 'kubernetes',
    name: 'get_deployment_status',
    description: 'Get the current status of a deployment before/after remediation.',
    input_schema: {
      type: 'object',
      properties: { cluster_id: { type: 'string' }, deployment_name: { type: 'string' } },
      required: ['cluster_id', 'deployment_name'],
    },
  },
  {
    source: 'kubernetes',
    name: 'restart_deployment',
    description: 'Restart a deployment (simulated): flips its status back to Running.',
    input_schema: {
      type: 'object',
      properties: { cluster_id: { type: 'string' }, deployment_name: { type: 'string' } },
      required: ['cluster_id', 'deployment_name'],
    },
  },
  {
    source: 'kubernetes',
    name: 'scale_deployment',
    description: 'Scale a deployment to a new replica count (simulated).',
    input_schema: {
      type: 'object',
      properties: {
        cluster_id: { type: 'string' },
        deployment_name: { type: 'string' },
        replicas: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['cluster_id', 'deployment_name', 'replicas'],
    },
  },
];

export function findTool(toolList, name) {
  return toolList.find((t) => t.name === name);
}

export function invokeTool(source, name, args) {
  const mod = sources[source];
  if (!mod || typeof mod[name] !== 'function') {
    throw new Error(`Unknown tool: ${source}.${name}`);
  }
  return mod[name](args || {});
}
