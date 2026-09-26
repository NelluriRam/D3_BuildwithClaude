// Shared, fictional topology used to keep the five simulated data sources
// internally consistent with one another (same service names, same cluster
// names, same ownership). Nothing here is a real company, patient, or
// system -- a fictional healthcare platform, entirely synthetic.

export const CLUSTERS = [
  { id: 'cluster-1', name: 'us-east-1-prod', region: 'us-east-1' },
  { id: 'cluster-2', name: 'us-east-2-prod', region: 'us-east-2' },
];

export const TEAMS = ['Team Nova', 'Team Atlas', 'Team Vega', 'Team Orion', 'Team Comet'];

export const SERVICES = [
  // Team Nova -- edge, identity & login
  { name: 'api-gateway-service', team: 'Team Nova' },
  { name: 'sso-gateway-service', team: 'Team Nova' },
  { name: 'patient-auth-service', team: 'Team Nova' },
  { name: 'provider-auth-service', team: 'Team Nova' },
  { name: 'identity-service', team: 'Team Nova' },
  { name: 'session-service', team: 'Team Nova' },
  // Team Atlas -- patient/provider facing
  { name: 'patient-portal-service', team: 'Team Atlas' },
  { name: 'provider-portal-service', team: 'Team Atlas' },
  { name: 'appointment-scheduling-service', team: 'Team Atlas' },
  { name: 'telehealth-service', team: 'Team Atlas' },
  // Team Vega -- clinical data
  { name: 'ehr-service', team: 'Team Vega' },
  { name: 'medical-records-service', team: 'Team Vega' },
  { name: 'lab-results-service', team: 'Team Vega' },
  { name: 'prescription-service', team: 'Team Vega' },
  { name: 'pharmacy-service', team: 'Team Vega' },
  // Team Orion -- financial/ops
  { name: 'billing-service', team: 'Team Orion' },
  { name: 'claims-processing-service', team: 'Team Orion' },
  { name: 'insurance-verification-service', team: 'Team Orion' },
  // Team Comet -- care coordination & comms
  { name: 'care-coordination-service', team: 'Team Comet' },
  { name: 'patient-messaging-service', team: 'Team Comet' },
];

export const SERVICE_NAMES = SERVICES.map((s) => s.name);

export function teamFor(serviceName) {
  const base = serviceName.replace(/-(worker|canary|cron)$/, '');
  return SERVICES.find((s) => s.name === base)?.team ?? 'Unowned';
}
