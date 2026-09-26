// Static, clearly-labeled illustrative fallback -- shown ONLY when this
// server run has never paused a real session yet (see HeroPanel.jsx /
// ActivityFeed.jsx). It mirrors the actual mechanics of the scripted
// CrashLoopBackOff scenario (server/src/scenario/crashLoopScenario.js) and
// the worked signal_strength example already documented in
// server/src/gateway/loopDetection.js, so it's representative of a real
// catch, not arbitrary flavor text -- but it is not live data, and every
// place it's used says so.

export const EXAMPLE_CATCH = {
  incidentId: 'INC-example',
  deployment: 'appointment-scheduling-service',
  cluster: 'cluster-1',
  redHerring: 'patient-auth-service',
  flagType: 'exact_repetition',
  signalStrength: 92,
  costAvoided: 4.85,
  timeToDetectSeconds: 47,
  unsupportedClaims: 1,
  activityLines: [
    { agent: 'sre', text: 'calling kubernetes.get_pod_logs(cluster_id=cluster-1, deployment_name=appointment-scheduling-service)' },
    { agent: 'sre', text: 'calling monitoring.get_metric_history(service=patient-auth-service, metric=error_rate_pct)' },
    { agent: 'sre', text: 'calling monitoring.get_metric_history(service=patient-auth-service, metric=error_rate_pct)' },
    { agent: 'sre', text: 'calling monitoring.get_metric_history(service=patient-auth-service, metric=error_rate_pct)', flagged: true },
  ],
};
