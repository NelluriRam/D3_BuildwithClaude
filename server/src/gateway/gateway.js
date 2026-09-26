// LoopSentinel Gateway: every tool call and every Claude API call from
// either agent is forwarded through here. It logs everything to SQLite,
// runs deterministic loop detection, and enforces budget ceilings in code
// (never as a prompt instruction) before a call is allowed through.

import Anthropic from '@anthropic-ai/sdk';
import { db, nowIso } from '../db.js';
import { detectLoops } from './loopDetection.js';
import { estimateCostUsd, computeCostAvoidedUsd, COST_SAVED_PROJECTION_WINDOW_SECONDS } from './pricing.js';
import { invokeTool } from '../sources/index.js';
import { nextId } from '../util.js';

const SESSION_BUDGET_USD = Number(process.env.SESSION_BUDGET_USD || 0.5);
const HOURLY_BUDGET_USD = Number(process.env.HOURLY_BUDGET_USD || 3.0);
const MAX_CALLS_PER_SESSION = 40; // defensive hard cap even if detection somehow misses

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const stmts = {
  insertSession: db.prepare(
    `INSERT INTO sessions (id, agent_type, incident_id, parent_session_id, label, status, status_reason, needs_review, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,0,?,?)`
  ),
  getSession: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  setStatus: db.prepare(
    `UPDATE sessions SET status=?, status_reason=?, needs_review=?, updated_at=? WHERE id=?`
  ),
  setStatusPaused: db.prepare(
    `UPDATE sessions SET status=?, status_reason=?, needs_review=?, updated_at=?, paused_at=? WHERE id=?`
  ),
  bumpTotals: db.prepare(
    `UPDATE sessions SET total_cost_usd = total_cost_usd + ?, total_tokens = total_tokens + ?, call_count = call_count + 1, updated_at=? WHERE id=?`
  ),
  insertCall: db.prepare(
    `INSERT INTO calls (session_id, seq, call_type, tool_source, tool_name, args_json, response_json, tokens_input, tokens_output, cost_usd, flagged, blocked, timestamp)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ),
  markCallFlagged: db.prepare(`UPDATE calls SET flagged = 1 WHERE id = ?`),
  listToolCalls: db.prepare(`SELECT * FROM calls WHERE session_id = ? AND call_type='tool_call' ORDER BY seq ASC`),
  listAllCalls: db.prepare(`SELECT * FROM calls WHERE session_id = ? ORDER BY seq ASC`),
  insertFlag: db.prepare(
    `INSERT INTO flags (session_id, flag_type, detail, call_id_ref, signal_strength, signal_strength_detail, created_at) VALUES (?,?,?,?,?,?,?)`
  ),
  listFlags: db.prepare(`SELECT * FROM flags WHERE session_id = ? ORDER BY id ASC`),
  listSessions: db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`),
  auditCallsForSession: db.prepare(`
    SELECT calls.*, sessions.agent_type
    FROM calls JOIN sessions ON calls.session_id = sessions.id
    WHERE calls.session_id = ?
    ORDER BY calls.session_id ASC, calls.seq ASC
  `),
  auditCallsAll: db.prepare(`
    SELECT calls.*, sessions.agent_type
    FROM calls JOIN sessions ON calls.session_id = sessions.id
    ORDER BY calls.session_id ASC, calls.seq ASC
  `),
  auditFlagsForSession: db.prepare(`SELECT call_id_ref, flag_type, signal_strength FROM flags WHERE session_id = ?`),
  auditFlagsAll: db.prepare(`SELECT call_id_ref, flag_type, signal_strength FROM flags`),
  listClaims: db.prepare(`SELECT * FROM claims WHERE session_id = ? ORDER BY id ASC`),
  topFlagPerSession: db.prepare(`
    SELECT session_id, flag_type, MAX(signal_strength) as signal_strength
    FROM flags GROUP BY session_id
  `),
  // Only sessions paused by a loop flag or a budget flag -- excludes
  // needs_review pauses caused by an agent/API error (status_reason
  // 'Agent error: ...'), which are neither loop nor budget flags and
  // shouldn't count toward "cost saved" or "time to detect".
  flaggedSessionsTiming: db.prepare(`
    SELECT sessions.id, sessions.total_cost_usd, sessions.paused_at, sessions.created_at,
           (SELECT MIN(timestamp) FROM calls WHERE calls.session_id = sessions.id) as first_call_at
    FROM sessions
    WHERE sessions.needs_review = 1
      AND sessions.paused_at IS NOT NULL
      AND (sessions.status_reason IS NULL OR sessions.status_reason NOT LIKE 'Agent error:%')
  `),
  hourlySpend: db.prepare(`SELECT COALESCE(SUM(cost_usd),0) as total FROM calls WHERE timestamp >= ?`),
  recentActivity: db.prepare(`
    SELECT calls.id, calls.session_id, calls.call_type, calls.tool_source, calls.tool_name,
           calls.args_json, calls.response_json, calls.flagged, calls.timestamp,
           sessions.agent_type, sessions.incident_id
    FROM calls JOIN sessions ON calls.session_id = sessions.id
    ORDER BY calls.id DESC LIMIT ?
  `),
};

// --- Session lifecycle --------------------------------------------------

export function createSession({ agentType, incidentId = null, parentSessionId = null, label = null }) {
  const id = nextId('sess');
  const ts = nowIso();
  stmts.insertSession.run(id, agentType, incidentId, parentSessionId, label, 'active', null, ts, ts);
  return getSession(id);
}

export function getSession(id) {
  return stmts.getSession.get(id);
}

export function listSessions() {
  return stmts.listSessions.all();
}

function setStatus(id, status, reason, needsReview) {
  stmts.setStatus.run(status, reason, needsReview ? 1 : 0, nowIso(), id);
}

export function pauseForReview(id, reason) {
  // Records paused_at distinctly from updated_at so time-to-detect and the
  // cost-saved projection (both derived from "when did we stop this
  // session") have a stable timestamp that a later status change can't
  // overwrite.
  const ts = nowIso();
  stmts.setStatusPaused.run('paused', reason, 1, ts, ts, id);
}

export function killSession(id) {
  setStatus(id, 'killed', 'Killed by operator via dashboard kill-switch', false);
}

export function completeSession(id) {
  const s = getSession(id);
  if (!s || s.status !== 'active') return; // don't override paused/killed
  setStatus(id, 'completed', null, false);
}

// --- Budget enforcement (code, not prompt) -------------------------------

function hourlySpendNow() {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return stmts.hourlySpend.get(since).total;
}

/** Checked before every call is forwarded. Returns {ok:true} or {ok:false, reason}. */
function checkGate(session) {
  if (session.status !== 'active') {
    return { ok: false, reason: session.status_reason || `session is ${session.status}` };
  }
  if (session.call_count >= MAX_CALLS_PER_SESSION) {
    const reason = `Safety cap reached: ${MAX_CALLS_PER_SESSION} calls in one session (possible undetected loop).`;
    pauseForReview(session.id, reason);
    return { ok: false, reason };
  }
  if (session.total_cost_usd >= SESSION_BUDGET_USD) {
    const reason = `Session budget ceiling exceeded: $${session.total_cost_usd.toFixed(4)} >= $${SESSION_BUDGET_USD}`;
    pauseForReview(session.id, reason);
    return { ok: false, reason };
  }
  const hourly = hourlySpendNow();
  if (hourly >= HOURLY_BUDGET_USD) {
    const reason = `Hourly budget ceiling exceeded: $${hourly.toFixed(4)} >= $${HOURLY_BUDGET_USD} across all sessions`;
    pauseForReview(session.id, reason);
    return { ok: false, reason };
  }
  return { ok: true };
}

// --- Tool calls -----------------------------------------------------------

export function callTool(sessionId, source, toolName, args) {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);

  const gate = checkGate(session);
  if (!gate.ok) {
    return { blocked: true, reason: gate.reason };
  }

  let response;
  try {
    response = invokeTool(source, toolName, args);
  } catch (err) {
    response = { error: String(err.message || err) };
  }

  const seq = session.call_count;
  const ts = nowIso();
  const argsJson = JSON.stringify(args || {});
  const responseJson = JSON.stringify(response);
  const info = stmts.insertCall.run(
    sessionId, seq, 'tool_call', source, toolName, argsJson, responseJson, 0, 0, 0, 0, 0, ts
  );
  const callId = Number(info.lastInsertRowid);
  stmts.bumpTotals.run(0, 0, ts, sessionId);

  const toolCalls = stmts.listToolCalls.all(sessionId);
  const loopFlags = detectLoops(toolCalls);

  if (loopFlags.length > 0) {
    stmts.markCallFlagged.run(callId);
    for (const f of loopFlags) {
      stmts.insertFlag.run(sessionId, f.flag_type, f.detail, callId, f.signal_strength, JSON.stringify(f.signal_strength_detail), nowIso());
    }
    const summary = loopFlags.map((f) => `[${f.flag_type}] ${f.detail}`).join(' | ');
    pauseForReview(sessionId, summary);
  }

  return { blocked: false, response, flagged: loopFlags.length > 0, flags: loopFlags, callId };
}

// --- Claude API calls -------------------------------------------------------

/**
 * @param {string} sessionId
 * @param {{system?: string, messages: any[], tools?: any[], tool_choice?: any}} req
 */
export async function callClaude(sessionId, { system, messages, tools, tool_choice }) {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);

  const gate = checkGate(session);
  if (!gate.ok) {
    return { blocked: true, reason: gate.reason };
  }

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages,
    tool_choice,
    tools,
  });

  const tokensIn = resp.usage?.input_tokens ?? 0;
  const tokensOut = resp.usage?.output_tokens ?? 0;
  const cost = estimateCostUsd(MODEL, tokensIn, tokensOut);
  const ts = nowIso();

  stmts.insertCall.run(
    sessionId,
    session.call_count,
    'claude_message',
    null,
    null,
    JSON.stringify({ last_message: messages[messages.length - 1] ?? null, tool_count: tools?.length ?? 0 }),
    JSON.stringify({ content: resp.content, stop_reason: resp.stop_reason, usage: resp.usage }),
    tokensIn,
    tokensOut,
    cost,
    0,
    0,
    ts
  );
  stmts.bumpTotals.run(cost, tokensIn + tokensOut, ts, sessionId);

  // Post-hoc budget check: this call's spend may have just crossed the
  // ceiling. Pause now so the *next* call is blocked at the gate above.
  const updated = getSession(sessionId);
  if (updated.total_cost_usd >= SESSION_BUDGET_USD && updated.status === 'active') {
    pauseForReview(sessionId, `Session budget ceiling exceeded: $${updated.total_cost_usd.toFixed(4)} >= $${SESSION_BUDGET_USD}`);
  } else if (hourlySpendNow() >= HOURLY_BUDGET_USD && updated.status === 'active') {
    pauseForReview(sessionId, `Hourly budget ceiling exceeded across all sessions.`);
  }

  return { blocked: false, response: resp };
}

// --- Dashboard-facing read API ---------------------------------------------

export function getSessionsOverview() {
  const topFlagBySession = new Map(stmts.topFlagPerSession.all().map((r) => [r.session_id, r]));
  return listSessions().map((s) => {
    const top = topFlagBySession.get(s.id);
    return {
      ...s,
      needs_review: !!s.needs_review,
      top_flag: top ? { flag_type: top.flag_type, signal_strength: top.signal_strength } : null,
    };
  });
}

function parseFlag(row) {
  let signal_strength_detail = null;
  try { signal_strength_detail = row.signal_strength_detail ? JSON.parse(row.signal_strength_detail) : null; } catch { /* ignore */ }
  return { ...row, signal_strength_detail };
}

function parseClaim(row) {
  let cited_values = [];
  let unmatched_values = [];
  try { cited_values = JSON.parse(row.cited_values_json); } catch { /* ignore */ }
  try { unmatched_values = row.unmatched_values_json ? JSON.parse(row.unmatched_values_json) : []; } catch { /* ignore */ }
  return {
    id: row.id,
    claim: row.claim_text,
    cited_values,
    grounded: !!row.grounded,
    unmatched_values,
    cross_session_leakage: !!row.cross_session_leakage,
  };
}

export function getSessionDetail(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  const claims = stmts.listClaims.all(sessionId).map(parseClaim);
  return {
    session: { ...session, needs_review: !!session.needs_review },
    calls: stmts.listAllCalls.all(sessionId),
    flags: stmts.listFlags.all(sessionId).map(parseFlag),
    grounding: session.grounding_computed_at
      ? {
          confidence: session.grounding_confidence,
          reportText: session.grounding_report_text,
          computedAt: session.grounding_computed_at,
          claims,
        }
      : null,
  };
}

function describeActivity(row) {
  let text;
  if (row.call_type === 'tool_call') {
    let args = {};
    try { args = JSON.parse(row.args_json); } catch { /* ignore */ }
    const argsStr = Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ');
    text = `calling ${row.tool_source}.${row.tool_name}(${argsStr})`;
  } else {
    let resp = {};
    try { resp = JSON.parse(row.response_json); } catch { /* ignore */ }
    const toolUse = (resp.content || []).find((b) => b.type === 'tool_use');
    if (toolUse?.name === 'submit_findings') text = 'concluding investigation (submit_findings)';
    else if (toolUse?.name === 'report_outcome') text = 'reporting remediation outcome';
    else if (toolUse) text = `deciding next step → calling ${toolUse.name}`;
    else text = 'analyzing...';
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    incidentId: row.incident_id,
    agentType: row.agent_type,
    flagged: !!row.flagged,
    timestamp: row.timestamp,
    text,
  };
}

/** Recent tool/Claude calls across all sessions, formatted for a live "what is the agent doing" feed. */
export function getRecentActivity(limit = 40) {
  return stmts.recentActivity.all(limit).map(describeActivity).reverse();
}

// --- Audit / compliance export ----------------------------------------------

function truncate(str, max = 300) {
  if (!str) return '';
  const flat = str.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Full call history for one session (or every session, if sessionId is
 * omitted) shaped for the compliance CSV export: one row per logged call,
 * with any flags raised on that specific call folded in. Every field comes
 * straight from what the gateway already logged -- nothing is recomputed.
 */
export function getAuditLogRows(sessionId) {
  const calls = sessionId ? stmts.auditCallsForSession.all(sessionId) : stmts.auditCallsAll.all();
  const flagRows = sessionId ? stmts.auditFlagsForSession.all(sessionId) : stmts.auditFlagsAll.all();

  const flagsByCall = new Map();
  for (const f of flagRows) {
    if (!f.call_id_ref) continue;
    if (!flagsByCall.has(f.call_id_ref)) flagsByCall.set(f.call_id_ref, []);
    flagsByCall.get(f.call_id_ref).push(f);
  }

  return calls.map((c) => {
    const flags = flagsByCall.get(c.id) ?? [];
    const tool = c.call_type === 'tool_call' ? `${c.tool_source}.${c.tool_name}` : 'claude_message';
    return {
      session_id: c.session_id,
      timestamp: c.timestamp,
      agent: c.agent_type,
      tool,
      arguments: truncate(c.args_json, 500),
      response_summary: truncate(c.response_json, 300),
      flags_raised: flags.map((f) => f.flag_type).join('; '),
      signal_strength: flags.length ? Math.max(...flags.map((f) => f.signal_strength ?? 0)) : '',
      cost_usd: c.cost_usd,
    };
  });
}

// --- Cost-saved & time-to-detect metrics ------------------------------------
//
// Both are derived from the same underlying set: every session LoopSentinel
// ever paused (needs_review=1, paused_at set), whether the pause came from
// a loop flag or a budget flag. No new logging is introduced -- this reads
// timestamps and totals the gateway already recorded above.

function todayStartIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Raw timing rows for every session LoopSentinel has ever paused. */
function getFlaggedSessionsTiming() {
  return stmts.flaggedSessionsTiming.all();
}

const baselineStmt = db.prepare(`SELECT date, unprotected_cost_usd FROM baseline_history ORDER BY date ASC`);

/**
 * costSavedThisPeriod: sum of cost-avoided (see pricing.js) across sessions
 * paused today (UTC calendar day) -- real, computed from live gateway data.
 *
 * costSavedLastPeriod: NOT a real prior "cost saved" figure (LoopSentinel
 * didn't exist "last period" in this demo) -- it's the average daily spend
 * from the illustrative unprotected baseline (last 7 baseline days),
 * offered purely as a comparison anchor for how costly an average
 * unprotected day looks. Always presented in the UI as "vs. illustrative
 * unprotected baseline", never as real historical billing.
 */
export function getCostSavedStats() {
  const since = todayStartIso();
  const timing = getFlaggedSessionsTiming();

  let costSavedThisPeriod = 0;
  for (const row of timing) {
    if (row.paused_at < since) continue;
    costSavedThisPeriod += computeCostAvoidedUsd({
      totalCostUsd: row.total_cost_usd,
      firstCallAt: row.first_call_at,
      pausedAt: row.paused_at,
    });
  }

  const baseline = baselineStmt.all();
  const last7 = baseline.slice(-7);
  const costSavedLastPeriod = last7.length
    ? last7.reduce((sum, r) => sum + r.unprotected_cost_usd, 0) / last7.length
    : 0;

  const percentChange = costSavedLastPeriod > 0 ? ((costSavedThisPeriod - costSavedLastPeriod) / costSavedLastPeriod) * 100 : null;

  // 30-point sparkline: the last 29 illustrative baseline days for visual
  // scale, plus today's real live cost-saved figure as the final point.
  const sparkline = [
    ...baseline.map((r) => ({ date: r.date, value: r.unprotected_cost_usd, kind: 'baseline' })),
    { date: since.slice(0, 10), value: Number(costSavedThisPeriod.toFixed(2)), kind: 'live' },
  ];

  return {
    costSavedThisPeriod: Number(costSavedThisPeriod.toFixed(2)),
    costSavedLastPeriod: Number(costSavedLastPeriod.toFixed(2)),
    percentChange: percentChange === null ? null : Number(percentChange.toFixed(1)),
    projectionWindowMinutes: COST_SAVED_PROJECTION_WINDOW_SECONDS / 60,
    sparkline,
    note: 'costSavedLastPeriod is the average of the last 7 days of an illustrative, synthetic "unprotected" baseline -- not real historical billing.',
  };
}

/** Average elapsed time (seconds) between a session's first tool call and the moment it was flagged/paused. */
export function getTimeToDetectStats() {
  const timing = getFlaggedSessionsTiming().filter((r) => r.first_call_at);
  if (timing.length === 0) return { averageSeconds: null, sampleCount: 0 };

  const deltas = timing.map((r) => (new Date(r.paused_at).getTime() - new Date(r.first_call_at).getTime()) / 1000);
  const averageSeconds = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { averageSeconds: Number(averageSeconds.toFixed(1)), sampleCount: timing.length };
}

export const config = { SESSION_BUDGET_USD, HOURLY_BUDGET_USD, MAX_CALLS_PER_SESSION, MODEL };
