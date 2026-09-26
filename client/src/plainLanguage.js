// Plain-English translations shown alongside (never instead of) the
// technical detail already displayed. Pure client-side copy/formatting --
// no detection, scoring, or cost logic lives here.

const FLAG_TYPE_PLAIN = {
  exact_repetition:
    'This agent got stuck repeating the exact same check over and over. Without LoopSentinel it would have kept running — and costing money — indefinitely.',
  oscillation:
    'This agent was bouncing back and forth between the same couple of actions in a loop, never actually making progress.',
  no_progress:
    'This agent kept getting essentially the same answer back and didn’t notice nothing was changing — it would have kept polling forever.',
};

export function describeFlagType(flagType) {
  return FLAG_TYPE_PLAIN[flagType] ?? 'LoopSentinel detected a repeating pattern in this agent’s behavior and flagged it.';
}

const FLAG_TYPE_SHORT = {
  exact_repetition: 'stuck repeating itself',
  oscillation: 'stuck bouncing back and forth',
  no_progress: 'not making progress',
};

export function describeFlagTypeShort(flagType) {
  return FLAG_TYPE_SHORT[flagType] ?? 'flagged pattern';
}

export function describePauseReason(reason) {
  if (!reason) return null;
  if (/^Agent error:/.test(reason)) {
    return 'This session hit an unrelated technical error (not a loop or overspend) and was paused for a human to review.';
  }
  if (/hourly budget ceiling exceeded/i.test(reason)) {
    return 'Total spending across every session hit the hourly cap LoopSentinel enforces, so this one was paused as a precaution — automatically, in code, not by a human watching a dashboard.';
  }
  if (/session budget ceiling exceeded/i.test(reason)) {
    return 'This session hit its spending limit and was paused automatically before it could spend more — no human had to notice first.';
  }
  if (/safety cap reached/i.test(reason)) {
    return 'This session made an unusually large number of calls, so it was paused as a safety net even though no specific loop pattern matched.';
  }
  if (/^\[(exact_repetition|oscillation|no_progress)\]/.test(reason)) {
    return 'LoopSentinel detected a repeating pattern in this agent’s tool calls and paused it before it could keep going unchecked.';
  }
  return null;
}

export function describeGroundingConfidence(grounding) {
  if (!grounding) return null;
  const total = grounding.claims.length;
  const unsupported = grounding.claims.filter((c) => !c.grounded).length;
  if (total === 0) return null;
  if (unsupported === 0) {
    return `Every claim in this report matched something the agent actually checked — nothing here was stated without evidence.`;
  }
  return `${unsupported} of ${total} claim${total === 1 ? '' : 's'} in this report couldn’t be matched to anything the agent actually checked — meaning it stated something as fact it never confirmed.`;
}
