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
