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

  // (a) Exact repetition: same tool+args repeated >= threshold times within
  // a trailing window.
  {
    const window = toolCalls.slice(-EXACT_REPETITION_WINDOW);
    const latestSig = callSignature(window[window.length - 1]);
    const count = window.filter((c) => callSignature(c) === latestSig).length;
    if (count >= EXACT_REPETITION_THRESHOLD) {
      flags.push({
        flag_type: 'exact_repetition',
        detail: `Tool call repeated identically ${count}x within the last ${window.length} calls: ${latestSig}`,
      });
    }
  }

  // (b) Oscillation: a short repeating cycle (period 2-4) in the call
  // sequence, e.g. A,B,A,B,A,B.
  {
    const window = toolCalls.slice(-OSCILLATION_WINDOW).map(callSignature);
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
    const count = window.filter((c) => {
      if (`${c.tool_source}.${c.tool_name}` !== lastKey) return false;
      return hashOf(JSON.parse(c.response_json)) === lastHash;
    }).length;
    if (count >= NO_PROGRESS_THRESHOLD) {
      flags.push({
        flag_type: 'no_progress',
        detail: `${count} calls to ${lastKey} within the last ${window.length} calls returned functionally identical responses (evidence not changing).`,
      });
    }
  }

  return flags;
}
