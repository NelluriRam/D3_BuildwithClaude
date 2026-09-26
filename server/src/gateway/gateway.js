// LoopSentinel Gateway: every tool call and every Claude API call from
// either agent is forwarded through here. It logs everything to SQLite,
// runs deterministic loop detection, and enforces budget ceilings in code
// (never as a prompt instruction) before a call is allowed through.

import Anthropic from '@anthropic-ai/sdk';
import { db, nowIso } from '../db.js';
import { detectLoops } from './loopDetection.js';
import { estimateCostUsd } from './pricing.js';
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
    `INSERT INTO flags (session_id, flag_type, detail, call_id_ref, created_at) VALUES (?,?,?,?,?)`
  ),
  listFlags: db.prepare(`SELECT * FROM flags WHERE session_id = ? ORDER BY id ASC`),
  listSessions: db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`),
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
  setStatus(id, 'paused', reason, true);
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
      stmts.insertFlag.run(sessionId, f.flag_type, f.detail, callId, nowIso());
    }
    const summary = loopFlags.map((f) => `[${f.flag_type}] ${f.detail}`).join(' | ');
    pauseForReview(sessionId, summary);
  }

  return { blocked: false, response, flagged: loopFlags.length > 0, flags: loopFlags, callId };
}

// --- Claude API calls -------------------------------------------------------

/**
 * @param {string} sessionId
 * @param {{system?: string, messages: any[], tools?: any[]}} req
 */
export async function callClaude(sessionId, { system, messages, tools }) {
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
  return listSessions().map((s) => ({
    ...s,
    needs_review: !!s.needs_review,
  }));
}

export function getSessionDetail(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  return {
    session: { ...session, needs_review: !!session.needs_review },
    calls: stmts.listAllCalls.all(sessionId),
    flags: stmts.listFlags.all(sessionId),
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

export const config = { SESSION_BUDGET_USD, HOURLY_BUDGET_USD, MAX_CALLS_PER_SESSION, MODEL };
