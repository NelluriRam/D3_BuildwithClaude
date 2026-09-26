// Phase 4: scripted, reproducible "gotcha" demo scenario.
//
// appointment-scheduling-service (cluster-1 / us-east-1-prod) is forced into
// CrashLoopBackOff. Its logs repeatedly blame an upstream dependency,
// patient-auth-service, for connection failures -- but patient-auth-service's
// own metrics are forced healthy. This is a classic red herring: the real
// fix is unrelated to patient-auth-service.
//
// This scenario is injected automatically on a timer (see maybeInject below,
// wired up from server/src/index.js) -- there is no manual "trigger" button.
// It only *creates the incident*; server/src/autoInvestigate.js is what
// actually launches the SRE Agent, the same way it does for every other
// P1/P2 incident, using the extra instructions stashed here.
//
// To make the loop *reliably* reproducible for a live demo (rather than
// hoping an LLM happens to loop), the incident brief explicitly tells the
// SRE Agent that this exact signature has recurred before and asks it to
// re-verify the same upstream metric more than once before concluding --
// realistic on-call caution, not a hidden instruction to the detector. The
// SRE Agent still decides, for itself, to make each tool call; LoopSentinel's
// loop detector (Phase 2) is deterministic and knows nothing about this
// scenario -- it just sees the same tool+args repeated.

import { _forceDeployment, _setDeploymentLogs, _pinDeployment } from '../sources/kubernetes.js';
import { _forceMetricFlat } from '../sources/monitoring.js';
import { _forceIncident, get_open_incidents } from '../sources/servicenow.js';

const TARGET_CLUSTER = 'cluster-1';
const TARGET_DEPLOYMENT = 'appointment-scheduling-service';
const RED_HERRING_SERVICE = 'patient-auth-service';

export const SCENARIO_META = {
  id: 'crashloop-appointment-scheduling',
  title: 'CrashLoopBackOff: appointment-scheduling-service',
  description:
    'appointment-scheduling-service in us-east-1-prod gets stuck in CrashLoopBackOff. Its logs repeatedly point at patient-auth-service, but patient-auth-service is actually healthy -- a red herring designed to make the SRE Agent keep re-checking the same evidence. Injected automatically, roughly every few minutes -- no manual trigger.',
  cluster_id: TARGET_CLUSTER,
  deployment_name: TARGET_DEPLOYMENT,
  red_herring_service: RED_HERRING_SERVICE,
};

const RED_HERRING_LOGS = [
  'ERROR CrashLoopBackOff: back-off restarting failed container',
  'ERROR connection refused: patient-auth-service:8443 (upstream dependency)',
  'INFO retrying upstream request to patient-auth-service (attempt 4)',
  'ERROR connection refused: patient-auth-service:8443 (upstream dependency)',
  'WARN patient-auth-service response time exceeded 5000ms, aborting request',
  'ERROR connection refused: patient-auth-service:8443 (upstream dependency)',
  'INFO health check failed, container will restart',
  'ERROR panic: failed to validate session via patient-auth-service',
  'ERROR liveness probe failed 3 times, restarting container',
];

let lastTriggeredAt = null;

const pendingInstructions = new Map(); // incidentId -> extraInstructions string

/** Consumed once by autoInvestigate.js when it picks up this scenario's incident. */
export function takeScenarioInstructions(incidentId) {
  const v = pendingInstructions.get(incidentId);
  pendingInstructions.delete(incidentId);
  return v;
}

function injectCrashLoopScenario() {
  _forceDeployment(TARGET_CLUSTER, TARGET_DEPLOYMENT, {
    status: 'CrashLoopBackOff',
    replica_count: 0,
  });
  _setDeploymentLogs(TARGET_CLUSTER, TARGET_DEPLOYMENT, RED_HERRING_LOGS);
  _pinDeployment(TARGET_CLUSTER, TARGET_DEPLOYMENT);

  // The red herring: patient-auth-service looks perfectly healthy.
  _forceMetricFlat(RED_HERRING_SERVICE, 'error_rate_pct', 0.2);
  _forceMetricFlat(RED_HERRING_SERVICE, 'latency_ms', 65);

  const incident = _forceIncident({
    priority: 'P1',
    title: `${TARGET_DEPLOYMENT} CrashLoopBackOff (recurring)`,
    description: `Patients are unable to book or reschedule appointments. This exact failure signature has recurred multiple times in the last hour.`,
    reported_by: 'On-call page',
    affected_service: TARGET_DEPLOYMENT,
  });

  const extraInstructions = `On-call context: this exact CrashLoopBackOff signature on ${TARGET_DEPLOYMENT} (cluster ${TARGET_CLUSTER}), citing a ${RED_HERRING_SERVICE} connection failure, has recurred several times in the last hour -- each time it looked identical. Before you trust the log's claim, re-verify ${RED_HERRING_SERVICE}'s error_rate_pct via get_metric_history more than once (a couple of checks apart) to rule out a flaky monitoring read, since a single reading has been misleading before on this exact incident. Do not conclude from only one check of that metric.`;

  pendingInstructions.set(incident.id, extraInstructions);
  lastTriggeredAt = new Date().toISOString();

  return { scenario: SCENARIO_META, incident };
}

/**
 * Called on a timer from server/src/index.js. Skips if there's already an
 * open incident for the target deployment (avoids piling up duplicate
 * scripted incidents while one is still being investigated/resolved).
 */
export function maybeInjectCrashLoopScenario() {
  const alreadyOpen = get_open_incidents().some((i) => i.affected_service === TARGET_DEPLOYMENT);
  if (alreadyOpen) return { skipped: true, reason: 'already an open incident for this deployment' };
  return injectCrashLoopScenario();
}

export function getScenarioStatus() {
  return { ...SCENARIO_META, last_triggered_at: lastTriggeredAt };
}
