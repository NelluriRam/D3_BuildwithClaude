// Evidence-grounding check for the Remediation Agent's final report.
//
// Two distinct steps, deliberately kept separate:
//
//  (a) Claim EXTRACTION -- one lightweight Claude call whose only job is to
//      pull discrete factual assertions out of the report text as
//      structured data (claim + cited_values). It is never asked whether
//      any claim is TRUE -- forced tool-use on a single schema, nothing
//      more. This is the only new LLM call this feature introduces.
//
//  (b) Grounding CHECK -- plain deterministic string matching of each
//      claim's cited_values against that session's own logged tool-call
//      responses, plus every ancestor session's (its parent chain up the
//      SRE -> Remediation -> Verification pipeline for this incident) --
//      already in SQLite from the gateway. No LLM is involved in deciding
//      whether a claim is grounded -- same "not AI judgment" principle as
//      loopDetection.js.
//
// Scope: only the Remediation Agent's single final report for one session
// is ever checked here -- not the SRE Agent's reasoning, not intermediate
// messages.

import { db, nowIso } from '../db.js';
import * as gateway from './gateway.js';

const EXTRACT_CLAIMS_TOOL = {
  name: 'extract_claims',
  description:
    'Return the discrete factual claims this report makes, each tagged with the specific values it cites (deployment name, cluster id, service name, metric name/value, error code, replica count, log line fragment, etc). Extract only -- do not evaluate whether any claim is true.',
  input_schema: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string', description: 'The factual assertion, in the report\'s own words.' },
            cited_values: {
              type: 'array',
              items: { type: 'string' },
              description:
                'The bare data values this claim cites, and nothing else -- exactly as they would appear in a raw API response or log line. One value per array entry. Correct: "4", "Running", "1100", "02:35:11". Wrong: "4/4 replicas Running" (a whole phrase), "0.2% baseline" (a value plus commentary), "readiness probes passing" (paraphrased, not quoted). If the report gives a derived or paraphrased description, cite only the underlying number, status word, or identifier it is based on.',
            },
          },
          required: ['claim', 'cited_values'],
        },
      },
    },
    required: ['claims'],
  },
};

const EXTRACTION_SYSTEM_PROMPT = `You extract structured claims from an incident-remediation report. For every discrete factual assertion the report makes, output the claim text and the specific values it cites. You are an extractor, not a fact-checker: do not judge whether any claim is true, do not add claims the report doesn't make, and do not omit a claim because it seems wrong. cited_values must be bare, individually-checkable data values -- never a multi-word phrase, and never a value with descriptive words attached. Call extract_claims exactly once.`;

async function extractClaims(sessionId, reportText) {
  const result = await gateway.callClaude(sessionId, {
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Report:\n${reportText}\n\nCall extract_claims with the structured claims this report makes.` }],
    tools: [EXTRACT_CLAIMS_TOOL],
    tool_choice: { type: 'tool', name: 'extract_claims' },
  });
  if (result.blocked) return { blocked: true, reason: result.reason, claims: [] };
  const toolUse = result.response.content.find((b) => b.type === 'tool_use' && b.name === 'extract_claims');
  return { blocked: false, claims: toolUse?.input?.claims ?? [] };
}

const toolCallsForSession = db.prepare(`SELECT args_json, response_json FROM calls WHERE session_id = ? AND call_type = 'tool_call'`);
const allToolCalls = db.prepare(`SELECT session_id, args_json, response_json FROM calls WHERE call_type = 'tool_call'`);
const sessionParent = db.prepare(`SELECT parent_session_id FROM sessions WHERE id = ?`);

// A Remediation/Verification report can accurately cite a fact an earlier
// agent in the same incident already established (e.g. a number Remediation
// itself never re-fetched, but that its parent SRE session did) -- that's
// still grounded evidence, just one session up the chain, not a
// hallucination. Walk parent_session_id to find this session's own evidence
// chain. Depth-capped since SRE -> Remediation -> Verification is 3 deep max.
function ownSessionChain(sessionId) {
  const ids = [sessionId];
  let current = sessionId;
  for (let i = 0; i < 5; i += 1) {
    const row = sessionParent.get(current);
    if (!row || !row.parent_session_id) break;
    ids.push(row.parent_session_id);
    current = row.parent_session_id;
  }
  return ids;
}

function ownEvidenceRows(sessionId) {
  return ownSessionChain(sessionId).flatMap((id) => toolCallsForSession.all(id));
}

// Evidence from every session EXCEPT this one's own ancestor chain -- used
// only for the cross_session_leakage signal (a report pulling in facts from
// a different, unrelated incident). An ancestor's legitimate evidence must
// never count as "leakage from elsewhere", so the whole chain is excluded
// here, not just the current session.
function otherEvidenceRows(sessionId) {
  const chain = new Set(ownSessionChain(sessionId));
  return allToolCalls.all().filter((r) => !chain.has(r.session_id));
}

const insertClaim = db.prepare(
  `INSERT INTO claims (session_id, claim_text, cited_values_json, grounded, unmatched_values_json, cross_session_leakage, created_at) VALUES (?,?,?,?,?,?,?)`
);
const setSessionGrounding = db.prepare(
  `UPDATE sessions SET grounding_confidence=?, grounding_report_text=?, grounding_computed_at=? WHERE id=?`
);

function buildHaystack(rows) {
  return rows.map((r) => `${r.args_json ?? ''} ${r.response_json ?? ''}`).join(' \n ').toLowerCase();
}

function extractLeadingNumber(value) {
  const m = String(value).match(/-?\d+(\.\d+)?/);
  return m ? m[0] : null;
}

function extractClockTime(value) {
  const m = String(value).match(/\d{2}:\d{2}:\d{2}/);
  return m ? m[0] : null;
}

// Real extraction sometimes cites a value with units or truncated precision
// attached ("1100ms", "02:35:11Z", "0.2% baseline") that never appears as an
// exact substring of raw JSON or log lines even though the underlying fact
// is correct. The exact match is tried first and is what catches a genuine
// hallucination (a number/time that doesn't appear anywhere in the
// evidence); only if it fails do we fall back to comparing the bare number
// or clock-time fragment, so this stays numeric/deterministic rather than
// approximate or LLM-judged -- no fuzzy matching is added for words.
function citedValueAppears(haystack, value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return true; // nothing cited -- trivially not contradicted
  if (haystack.includes(v)) return true;
  const clock = extractClockTime(v);
  if (clock && haystack.includes(clock)) return true;
  const num = extractLeadingNumber(v);
  if (num !== null && haystack.includes(num)) return true;
  return false;
}

// --- Grounding confidence (0-100), deterministic ----------------------------
//
//   groundedRatio = groundedClaimCount / totalClaimCount
//   confidence    = round(groundedRatio * 100) - 5 * crossSessionLeakageCount
//                   clamped to [0, 100]
//
// A claim is "grounded" only if EVERY value it cites appears, as a plain
// substring match, somewhere in this session's own logged tool-call
// arguments/responses OR those of an ancestor session in its own chain
// (see ownSessionChain above). One missing value makes the whole claim
// "unsupported". For an unsupported claim, if a missing value is found in
// some OTHER session's tool-call data instead, that claim is additionally
// marked cross_session_leakage -- evidence the report may have pulled in
// facts from a different investigation -- and costs the session's overall
// confidence an extra 5 points (this is a per-session penalty, not
// per-claim, since it reflects an integrity concern about the whole
// report). With zero extracted claims, confidence is left null ("nothing
// to assess") rather than defaulting to 0 or 100.
const LEAKAGE_PENALTY = 5;

export async function runGroundingCheck(sessionId, reportText) {
  const extraction = await extractClaims(sessionId, reportText);
  if (extraction.blocked || extraction.claims.length === 0) {
    return { computed: false, reason: extraction.blocked ? extraction.reason : 'no claims extracted' };
  }
  return gradeExtractedClaims(sessionId, reportText, extraction.claims);
}

/** The deterministic half, split out so it's testable without a live Claude call. */
export function gradeExtractedClaims(sessionId, reportText, claims) {
  const ownHaystack = buildHaystack(ownEvidenceRows(sessionId));
  let otherHaystack = null; // computed lazily, only if a claim actually needs it

  let groundedCount = 0;
  let leakageCount = 0;
  const ts = nowIso();

  for (const claim of claims) {
    const citedValues = Array.isArray(claim.cited_values) ? claim.cited_values : [];
    const unmatched = citedValues.filter((v) => !citedValueAppears(ownHaystack, v));
    const grounded = unmatched.length === 0;
    if (grounded) groundedCount += 1;

    let crossSessionLeakage = false;
    if (!grounded) {
      otherHaystack ??= buildHaystack(otherEvidenceRows(sessionId));
      crossSessionLeakage = unmatched.some((v) => citedValueAppears(otherHaystack, v));
      if (crossSessionLeakage) leakageCount += 1;
    }

    insertClaim.run(
      sessionId,
      String(claim.claim ?? ''),
      JSON.stringify(citedValues),
      grounded ? 1 : 0,
      JSON.stringify(unmatched),
      crossSessionLeakage ? 1 : 0,
      ts
    );
  }

  const total = claims.length;
  const groundedRatio = groundedCount / total;
  const confidence = Math.max(0, Math.min(100, Math.round(groundedRatio * 100) - LEAKAGE_PENALTY * leakageCount));

  setSessionGrounding.run(confidence, reportText, ts, sessionId);

  return { computed: true, confidence, totalClaims: total, groundedCount, leakageCount };
}
