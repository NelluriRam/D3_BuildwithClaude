// Shared, fictional topology used to keep the five simulated data sources
// internally consistent with one another (same service names, same cluster
// names, same ownership). Nothing here is a real company or system.

export const CLUSTERS = [
  { id: 'cluster-1', name: 'us-east-1-prod', region: 'us-east-1' },
  { id: 'cluster-2', name: 'us-west-2-prod', region: 'us-west-2' },
  { id: 'cluster-3', name: 'eu-west-1-prod', region: 'eu-west-1' },
  { id: 'cluster-4', name: 'ap-south-1-prod', region: 'ap-south-1' },
  { id: 'cluster-5', name: 'staging-1', region: 'us-east-1' },
];

export const TEAMS = ['Team Nova', 'Team Atlas', 'Team Vega', 'Team Orion', 'Team Comet'];

export const SERVICES = [
  { name: 'apigee-gateway', team: 'Team Nova' },
  { name: 'gateway-service', team: 'Team Nova' },
  { name: 'auth-service', team: 'Team Nova' },
  { name: 'session-service', team: 'Team Nova' },
  { name: 'checkout-service', team: 'Team Atlas' },
  { name: 'cart-service', team: 'Team Atlas' },
  { name: 'payment-service', team: 'Team Atlas' },
  { name: 'fraud-detection-service', team: 'Team Atlas' },
  { name: 'order-service', team: 'Team Atlas' },
  { name: 'inventory-service', team: 'Team Vega' },
  { name: 'catalog-service', team: 'Team Vega' },
  { name: 'pricing-service', team: 'Team Vega' },
  { name: 'search-service', team: 'Team Vega' },
  { name: 'recommendation-service', team: 'Team Vega' },
  { name: 'shipping-service', team: 'Team Orion' },
  { name: 'user-profile-service', team: 'Team Orion' },
  { name: 'review-service', team: 'Team Orion' },
  { name: 'loyalty-service', team: 'Team Orion' },
  { name: 'notification-service', team: 'Team Comet' },
  { name: 'email-service', team: 'Team Comet' },
  { name: 'sms-service', team: 'Team Comet' },
  { name: 'analytics-service', team: 'Team Comet' },
  { name: 'reporting-service', team: 'Team Comet' },
  { name: 'billing-service', team: 'Team Atlas' },
  { name: 'refund-service', team: 'Team Atlas' },
];

export const SERVICE_NAMES = SERVICES.map((s) => s.name);

export function teamFor(serviceName) {
  const base = serviceName.replace(/-(worker|canary|cron)$/, '');
  return SERVICES.find((s) => s.name === base)?.team ?? 'Unowned';
}
