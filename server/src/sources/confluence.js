// Simulated Confluence source: static, hand-written markdown docs describing
// a fictional architecture. Not randomized, not a real wiki.

import { CLUSTERS, SERVICES, TEAMS } from './topology.js';

const clusterList = CLUSTERS.map((c) => `- **${c.name}** (${c.id}, region: ${c.region})`).join('\n');
const ownerTable = SERVICES.map((s) => `| ${s.name} | ${s.team} |`).join('\n');

const docs = [
  {
    id: 'doc-architecture-overview',
    title: 'Architecture Overview (Fictional)',
    updated_at: '2026-08-01',
    content: `# Architecture Overview

_This document describes a fictional environment simulated for the LoopSentinel demo. No real systems are represented._

Traffic enters through **Apigee** (external API gateway), which routes to \`apigee-gateway\`, our internal edge service. From there, requests are proxied to \`gateway-service\`, which performs auth via \`auth-service\` and \`session-service\`, then fans out to the relevant domain microservice (checkout, catalog, search, etc).

All domain microservices run as Kubernetes Deployments across five clusters:

${clusterList}

\`staging-1\` is a non-production cluster used for pre-release validation and is excluded from customer-facing SLOs.

Each microservice publishes events to Kafka topics named \`<service>.events\`, with a matching \`<service>.dlq\` dead-letter topic for messages that fail processing.`,
  },
  {
    id: 'doc-cluster-layout',
    title: 'Cluster & Deployment Layout',
    updated_at: '2026-08-03',
    content: `# Cluster & Deployment Layout

Each of the five clusters runs the same set of ~25 core services, deployed as one primary Deployment per service plus, on a subset of clusters, additional \`-worker\` and \`-canary\` variants for background processing and progressive rollout respectively.

Deployments are considered healthy when \`status = Running\` and \`replica_count\` matches \`desired_replicas\`. A small number of deployments fleet-wide have a Horizontal Pod Autoscaler (\`hpa_enabled = true\`); most are fixed-replica.

When a deployment enters \`CrashLoopBackOff\` or \`OOMKilled\`, check \`get_pod_logs\` first, then cross-reference \`get_metric_history\` for the same service in Monitoring before assuming a downstream dependency is at fault — logs sometimes reference an upstream service by name even when the real fault is local (bad config, resource limits, bad deploy).`,
  },
  {
    id: 'doc-traffic-flow',
    title: 'Traffic Flow: Apigee to Microservices',
    updated_at: '2026-07-20',
    content: `# Traffic Flow

1. Client -> **Apigee** (external, not modeled in this simulation)
2. Apigee -> \`apigee-gateway\` (internal ingress shim)
3. \`apigee-gateway\` -> \`gateway-service\`
4. \`gateway-service\` -> \`auth-service\` (token validation) -> \`session-service\` (session lookup)
5. \`gateway-service\` -> domain service (e.g. \`checkout-service\`, \`catalog-service\`, \`search-service\`)
6. Domain services call each other directly for synchronous needs (e.g. \`checkout-service\` -> \`payment-service\` -> \`fraud-detection-service\`) and publish async events to Kafka for everything else (e.g. \`order-service\` -> \`order-service.events\` -> consumed by \`notification-service\`, \`analytics-service\`).

A spike in \`checkout-service\` error rate very often traces back to \`payment-service\` or \`fraud-detection-service\` being slow or unhealthy, since both are synchronous dependencies on the checkout path.`,
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
3. If logs reference a specific upstream host or service, check that service's health via \`get_active_alerts\` and \`get_metric_history\` **once**. If it is healthy, the log line is most likely a stale/misleading log message rather than the current root cause — do not keep re-polling the same upstream metric hoping for a different answer. Broaden the investigation instead (recent deploys, resource limits, config).
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
