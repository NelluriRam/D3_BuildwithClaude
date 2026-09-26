// Approximate Claude API pricing (USD per token), used only to estimate
// session/hourly spend for the demo's budget enforcement. Not a source of
// billing truth — see README for the disclaimer.

const TABLE = [
  { match: /haiku/i, inputPerTok: 0.8 / 1_000_000, outputPerTok: 4 / 1_000_000 },
  { match: /opus/i, inputPerTok: 15 / 1_000_000, outputPerTok: 75 / 1_000_000 },
  { match: /sonnet/i, inputPerTok: 3 / 1_000_000, outputPerTok: 15 / 1_000_000 },
];
const DEFAULT_RATE = { inputPerTok: 3 / 1_000_000, outputPerTok: 15 / 1_000_000 };

export function estimateCostUsd(model, inputTokens, outputTokens) {
  const rate = TABLE.find((r) => r.match.test(model)) ?? DEFAULT_RATE;
  return inputTokens * rate.inputPerTok + outputTokens * rate.outputPerTok;
}

// --- Cost saved / cost avoided ----------------------------------------------
//
// For a session LoopSentinel paused (loop flag or budget flag -- both set
// needs_review + paused_at), "cost avoided" estimates the extra spend that
// would have accrued had the flagged pattern kept running at the same $/sec
// rate for PROJECTION_WINDOW_SECONDS more seconds after the pause point.
//
//   ratePerSecond          = totalCostUsd / durationSeconds
//   projectedCostAt30Min   = totalCostUsd + ratePerSecond * PROJECTION_WINDOW_SECONDS
//   costAvoided            = projectedCostAt30Min - totalCostUsd   (the spec's definition)
//                           = ratePerSecond * PROJECTION_WINDOW_SECONDS
//
// durationSeconds is floored at MIN_DURATION_SECONDS so a session paused
// within a couple of seconds of its first call doesn't extrapolate an
// absurd rate from a near-zero denominator. This is an estimate for the
// dashboard, not a source of billing truth (see pricing table above).
export const COST_SAVED_PROJECTION_WINDOW_SECONDS = 30 * 60; // "30 more minutes"
const MIN_DURATION_SECONDS = 5;

export function computeCostAvoidedUsd({ totalCostUsd, firstCallAt, pausedAt }, projectionWindowSeconds = COST_SAVED_PROJECTION_WINDOW_SECONDS) {
  if (!firstCallAt || !pausedAt || !totalCostUsd || totalCostUsd <= 0) return 0;
  const durationSeconds = Math.max(MIN_DURATION_SECONDS, (new Date(pausedAt).getTime() - new Date(firstCallAt).getTime()) / 1000);
  const ratePerSecond = totalCostUsd / durationSeconds;
  return ratePerSecond * projectionWindowSeconds;
}
