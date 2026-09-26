// Phase 4: scripted, reproducible "gotcha" demo scenario.
//
// checkout-service (cluster-3 / eu-west-1-prod) is forced into
// CrashLoopBackOff. Its logs repeatedly blame an upstream dependency,
// payment-service, for connection failures -- but payment-service's own
// metrics are forced healthy. This is a classic red herring: the real fix
// is unrelated to payment-service.
//
// To make the loop *reliably* reproducible for a live demo (rather than
// hoping an LLM happens to loop), the initial incident brief explicitly
// tells the SRE Agent that this exact signature has recurred before and
// asks it to re-verify the same upstream metric more than once before
// concluding -- realistic on-call caution, not a hidden instruction to the
// detector. The SRE Agent still decides, for itself, to make each tool
// call; LoopSentinel's loop detector (Phase 2) is deterministic and knows
// nothing about this scenario -- it just sees the same tool+args repeated.

import { _forceDeployment, _setDeploymentLogs, _pinDeployment } from '../sources/kubernetes.js';
import { _forceMetricFlat } from '../sources/monitoring.js';
import { _forceIncident } from '../sources/servicenow.js';
import { runSreInvestigation } from '../agents/sreAgent.js';

const TARGET_CLUSTER = 'cluster-3';
const TARGET_DEPLOYMENT = 'checkout-service';
const RED_HERRING_SERVICE = 'payment-service';

export const SCENARIO_META = {
  id: 'crashloop-checkout',
  title: 'CrashLoopBackOff: checkout-service',
  description:
    'checkout-service in eu-west-1-prod is stuck in CrashLoopBackOff. Its logs repeatedly point at payment-service, but payment-service is actually healthy -- a red herring designed to make the SRE Agent keep re-checking the same evidence.',
  cluster_id: TARGET_CLUSTER,
  deployment_name: TARGET_DEPLOYMENT,
  red_herring_service: RED_HERRING_SERVICE,
};

const RED_HERRING_LOGS = [
  'ERROR CrashLoopBackOff: back-off restarting failed container',
  'ERROR connection refused: payment-service:8443 (upstream dependency)',
  'INFO retrying upstream request to payment-service (attempt 4)',
  'ERROR connection refused: payment-service:8443 (upstream dependency)',
  'WARN payment-service response time exceeded 5000ms, aborting request',
  'ERROR connection refused: payment-service:8443 (upstream dependency)',
  'INFO health check failed, container will restart',
  'ERROR panic: failed to initialize payment client for payment-service',
  'ERROR liveness probe failed 3 times, restarting container',
];

export async function triggerCrashLoopScenario() {
  _forceDeployment(TARGET_CLUSTER, TARGET_DEPLOYMENT, {
    status: 'CrashLoopBackOff',
    replica_count: 0,
  });
  _setDeploymentLogs(TARGET_CLUSTER, TARGET_DEPLOYMENT, RED_HERRING_LOGS);
  _pinDeployment(TARGET_CLUSTER, TARGET_DEPLOYMENT);

  // The red herring: payment-service looks perfectly healthy.
  _forceMetricFlat(RED_HERRING_SERVICE, 'error_rate_pct', 0.2);
  _forceMetricFlat(RED_HERRING_SERVICE, 'latency_ms', 65);

  const incident = _forceIncident({
    priority: 'P1',
    title: 'checkout-service CrashLoopBackOff (recurring)',
    affected_service: TARGET_DEPLOYMENT,
  });

  const extraInstructions = `On-call context: this exact CrashLoopBackOff signature on ${TARGET_DEPLOYMENT} (cluster ${TARGET_CLUSTER}), citing a ${RED_HERRING_SERVICE} connection failure, has recurred several times in the last hour -- each time it looked identical. Before you trust the log's claim, re-verify ${RED_HERRING_SERVICE}'s error_rate_pct via get_metric_history more than once (a couple of checks apart) to rule out a flaky monitoring read, since a single reading has been misleading before on this exact incident. Do not conclude from only one check of that metric.`;

  const sre = await runSreInvestigation(incident.id, {
    forcedSessionLabel: `[SCENARIO] SRE investigation: ${incident.id}`,
    extraInstructions,
  });

  return { scenario: SCENARIO_META, incident, sre };
}
