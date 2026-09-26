// Deterministic loop detection. No LLM is consulted here — every check is
// plain pattern-matching over the session's logged call history, per the
// contest constraint that detection must not rely on LLM judgment.

import { createHash } from 'node:crypto';

const VOLATILE_KEY_RE = /(time|timestamp|_at$|^ts$)/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Strip fields that legitimately change on every call (timestamps, "last
// updated" fields) so a *functionally* identical response still compares
// equal even if a clock ticked between calls.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (VOLATILE_KEY_RE.test(k)) continue;
      out[k] = canonicalize(v);
    }
    return out;
  }
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) return '<ts>';
  return value;
}

function hashOf(value) {
  return createHash('sha1').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function callSignature(call) {
  return `${call.tool_source}.${call.tool_name}:${call.args_json}`;
}

const EXACT_REPETITION_WINDOW = 10;
const EXACT_REPETITION_THRESHOLD = 3;

const NO_PROGRESS_WINDOW = 10;
const NO_PROGRESS_THRESHOLD = 3;

const OSCILLATION_WINDOW = 12;
const OSCILLATION_MIN_CYCLES = 2;
const OSCILLATION_PERIODS = [2, 3, 4];

/**
 * @param {Array} toolCalls chronological tool_call rows for one session
 *   (each: {tool_source, tool_name, args_json, response_json})
 * @returns {Array<{flag_type: string, detail: string}>}
 */
export function detectLoops(toolCalls) {
  const flags = [];
  if (toolCalls.length === 0) return flags;

  // Each pushed flag also carries `_matched` (the actual matched call rows)
  // and `_repetition` ({count, threshold}) -- internal-only fields consumed
  // by attachSignalStrength() below and stripped before returning. This is
  // purely additive bookkeeping; none of the pass/fail conditions below are
  // touched from the original implementation.

  // (a) Exact repetition: same tool+args repeated >= threshold times within
  // a trailing window.
  {
    const window = toolCalls.slice(-EXACT_REPETITION_WINDOW);
    const latestSig = callSignature(window[window.length - 1]);
    const matched = window.filter((c) => callSignature(c) === latestSig);
    const count = matched.length;
    if (count >= EXACT_REPETITION_THRESHOLD) {
      flags.push({
        flag_type: 'exact_repetition',
        detail: `Tool call repeated identically ${count}x within the last ${window.length} calls: ${latestSig}`,
        _matched: matched,
        _repetition: { count, threshold: EXACT_REPETITION_THRESHOLD },
      });
    }
  }

  // (b) Oscillation: a short repeating cycle (period 2-4) in the call
  // sequence, e.g. A,B,A,B,A,B.
  {
    const windowObjs = toolCalls.slice(-OSCILLATION_WINDOW);
    const window = windowObjs.map(callSignature);
    for (const period of OSCILLATION_PERIODS) {
      const needed = period * OSCILLATION_MIN_CYCLES;
      if (window.length < needed) continue;
      const tail = window.slice(-needed);
      let matches = true;
      for (let i = period; i < tail.length; i += 1) {
        if (tail[i] !== tail[i - period]) {
          matches = false;
          break;
        }
      }
      // Require at least 2 distinct calls in the cycle so period-1 exact
      // repeats (already covered above) aren't double-reported as oscillation.
      const distinct = new Set(tail.slice(0, period)).size;
      if (matches && distinct >= 2) {
        flags.push({
          flag_type: 'oscillation',
          detail: `Repeating cycle of period ${period} detected over the last ${needed} calls: ${[...new Set(tail)].join(' <-> ')}`,
          _matched: windowObjs.slice(-needed),
          _repetition: { count: needed, threshold: needed },
        });
        break;
      }
    }
  }

  // (c) No-progress: repeated calls to the same tool whose responses are
  // near-identical (after stripping volatile fields like timestamps), even
  // if the arguments differ slightly.
  {
    const window = toolCalls.slice(-NO_PROGRESS_WINDOW);
    const last = window[window.length - 1];
    const lastKey = `${last.tool_source}.${last.tool_name}`;
    const lastHash = hashOf(JSON.parse(last.response_json));
    const matched = window.filter((c) => {
      if (`${c.tool_source}.${c.tool_name}` !== lastKey) return false;
      return hashOf(JSON.parse(c.response_json)) === lastHash;
    });
    const count = matched.length;
    if (count >= NO_PROGRESS_THRESHOLD) {
      flags.push({
        flag_type: 'no_progress',
        detail: `${count} calls to ${lastKey} within the last ${window.length} calls returned functionally identical responses (evidence not changing).`,
        _matched: matched,
        _repetition: { count, threshold: NO_PROGRESS_THRESHOLD },
      });
    }
  }

  return flags.map((f) => attachSignalStrength(f, flags.length));
}

// --- Signal strength (0-100), deterministic ---------------------------------
//
// This is a scoring *layer on top of* the three detectors above -- it never
// changes whether a flag fires, only how strongly to present one that
// already fired. It is plain arithmetic over data the detectors already
// computed (repetition counts, how many detection types fired together,
// and how tightly the matched calls cluster in time) -- no LLM, no ML model.
//
// signal_strength = repetitionScore + corroborationScore + densityScore, capped at 100
//
//   repetitionScore (0-50):   min(50, (matchedCount / threshold) * 25)
//     -- how far the observed repetition count exceeds the detector's own
//        threshold. Exactly at threshold = 25; 2x threshold or more = capped 50.
//
//   corroborationScore (0-30): min(30, (numDistinctTypesFired - 1) * 15)
//     -- +15 for each additional detection type (exact_repetition/
//        oscillation/no_progress) that fired *in the same evaluation* for
//        this session, since independent detectors agreeing is stronger
//        evidence than one firing alone.
//
//   densityScore (0-20): round(20 * clamp(1 - timeSpanSeconds / 120, 0, 1))
//     -- how tightly clustered in time the matched calls are. All matched
//        calls within the same instant = 20; spread across >=120s = 0.
//        A tight cluster reads as "actively looping right now" rather than
//        "happened to repeat over a long session".
//
// Worked example matching the flag detail "repeated 6x vs threshold of 3":
// exact_repetition alone (numTypes=1) with matchedCount=6, threshold=3,
// matched within ~48s of each other:
//   repetitionScore   = min(50, (6/3)*25)      = 50
//   corroborationScore= min(30, (1-1)*15)      = 0
//   densityScore      = round(20*(1-48/120))   = 12
//   total = 62. Two more detection types firing alongside it (+30) would
//   bring the same call to 92, as in the docstring example.
const DENSITY_REFERENCE_SECONDS = 120;

function densityScore(matched) {
  if (!matched || matched.length < 2) return 20; // single instant, maximally tight
  const timestamps = matched.map((c) => new Date(c.timestamp).getTime()).filter((t) => !Number.isNaN(t));
  if (timestamps.length < 2) return 20;
  const spanSeconds = (Math.max(...timestamps) - Math.min(...timestamps)) / 1000;
  const clamped = Math.max(0, Math.min(1, 1 - spanSeconds / DENSITY_REFERENCE_SECONDS));
  return Math.round(20 * clamped);
}

function attachSignalStrength(flag, numDistinctTypesFired) {
  const { count, threshold } = flag._repetition;
  const repetitionScore = Math.min(50, (count / threshold) * 25);
  const corroborationScore = Math.min(30, (numDistinctTypesFired - 1) * 15);
  const density = densityScore(flag._matched);
  const signal_strength = Math.min(100, Math.round(repetitionScore + corroborationScore + density));

  const { _matched, _repetition, ...rest } = flag;
  return {
    ...rest,
    signal_strength,
    signal_strength_detail: {
      repetition_count: count,
      repetition_threshold: threshold,
      detection_types_fired: numDistinctTypesFired,
      repetition_score: Math.round(repetitionScore),
      corroboration_score: corroborationScore,
      density_score: density,
      formula: `${numDistinctTypesFired} detection type${numDistinctTypesFired === 1 ? '' : 's'} fired; repeated ${count}x vs threshold of ${threshold} -> ${signal_strength}`,
    },
  };
}
