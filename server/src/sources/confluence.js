// Simulated Confluence source: static, hand-written markdown docs describing
// a fictional healthcare platform architecture. Not randomized, not a real
// wiki, no real patients/providers/organizations.

import { CLUSTERS, SERVICES, TEAMS } from './topology.js';

const clusterList = CLUSTERS.map((c) => `- **${c.name}** (${c.id}, region: ${c.region})`).join('\n');
const ownerTable = SERVICES.map((s) => `| ${s.name} | ${s.team} |`).join('\n');

const docs = [
  {
    id: 'doc-architecture-overview',
    title: 'Architecture Overview (Fictional)',
    updated_at: '2026-08-01',
    content: `# Architecture Overview

_This document describes a fictional healthcare platform simulated for the LoopSentinel demo. No real patients, providers, or organizations are represented._

Traffic enters through **api-gateway-service** (edge ingress), which routes login/session traffic to **sso-gateway-service**, **patient-auth-service** / **provider-auth-service**, and **identity-service**, then fans out authenticated requests to the relevant domain microservice (patient portal, scheduling, EHR, billing, etc).

All domain microservices run as Kubernetes Deployments across two clusters:

${clusterList}

Both clusters are production; there is no staging cluster in this environment.

Each microservice publishes events to Kafka topics named \`<service>.events\`, with a matching \`<service>.dlq\` dead-letter topic for messages that fail processing.`,
  },
  {
    id: 'doc-cluster-layout',
    title: 'Cluster & Deployment Layout',
    updated_at: '2026-08-03',
    content: `# Cluster & Deployment Layout

Each of the two clusters (us-east-1-prod, us-east-2-prod) runs the same set of ~20 core services, deployed as one primary Deployment per service plus, on a subset, additional \`-worker\` and \`-canary\` variants for background processing and progressive rollout respectively.

Deployments are considered healthy when \`status = Running\` and \`replica_count\` matches \`desired_replicas\`. A small number of deployments fleet-wide have a Horizontal Pod Autoscaler (\`hpa_enabled = true\`); most are fixed-replica.

When a deployment enters \`CrashLoopBackOff\` or \`OOMKilled\`, check \`get_pod_logs\` first, then cross-reference \`get_metric_history\` for the same service in Monitoring before assuming a downstream dependency is at fault -- logs sometimes reference an upstream service by name even when the real fault is local (bad config, resource limits, bad deploy).`,
  },
  {
    id: 'doc-traffic-flow',
    title: 'Traffic Flow: Gateway to Microservices',
    updated_at: '2026-07-20',
    content: `# Traffic Flow

1. Client -> **api-gateway-service** (edge ingress)
2. api-gateway-service -> **sso-gateway-service** for login, or **identity-service** for token validation on an existing session
3. Once authenticated, api-gateway-service -> domain service (e.g. \`patient-portal-service\`, \`appointment-scheduling-service\`, \`ehr-service\`)
4. Domain services call each other directly for synchronous needs (e.g. \`appointment-scheduling-service\` -> \`patient-auth-service\` to re-validate a session; \`ehr-service\` -> \`lab-results-service\`) and publish async events to Kafka for everything else (e.g. \`appointment-scheduling-service\` -> \`appointment-scheduling-service.events\` -> consumed by \`patient-messaging-service\` for reminders).

A spike in a patient-facing service's error rate very often traces back to \`patient-auth-service\`, \`sso-gateway-service\`, or \`identity-service\` being slow or unhealthy, since login/session validation sits on the synchronous path for nearly every request.`,
  },
  {
    id: 'doc-ownership',
    title: 'Service Ownership',
    updated_at: '2026-08-10',
    content: `# Service Ownership

| Service | Owning Team |
|---|---|
${ownerTable}

Teams: ${TEAMS.join(', ')}. Page the owning team via their on-call rotation (not modeled here) before escalating cross-team.`,
  },
  {
    id: 'doc-runbook-crashloop',
    title: 'Runbook: CrashLoopBackOff Triage',
    updated_at: '2026-08-15',
    content: `# Runbook: CrashLoopBackOff Triage

1. \`get_deployment_status\` to confirm the current status and replica count.
2. \`get_pod_logs\` to read the most recent lines. Look for the terminal error (OOM, panic, connection refused, failed probe).
3. If logs reference a specific upstream host or service, check that service's health via \`get_active_alerts\` and \`get_metric_history\` **once**. If it is healthy, the log line is most likely a stale/misleading log message rather than the current root cause -- do not keep re-polling the same upstream metric hoping for a different answer. Broaden the investigation instead (recent deploys, resource limits, config).
4. Once a root cause hypothesis has reasonable supporting evidence, hand off to the Remediation Agent rather than continuing to gather more of the same evidence.`,
  },
];

export function search_docs({ query }) {
  const q = (query || '').toLowerCase();
  return docs
    .filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
    .map(({ content, ...meta }) => meta);
}

export function get_doc({ doc_id }) {
  const doc = docs.find((d) => d.id === doc_id);
  if (!doc) return { error: `doc not found: ${doc_id}` };
  return doc;
}

export function list_docs() {
  return docs.map(({ content, ...meta }) => meta);
}
