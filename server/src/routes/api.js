import { Router } from 'express';
import { sources } from '../sources/index.js';
import * as gateway from '../gateway/gateway.js';
import { getScenarioStatus, maybeInjectCrashLoopScenario } from '../scenario/crashLoopScenario.js';
import { getAgentRegistry, registerAgent, getRegisteredAgent } from '../gateway/agentRegistry.js';
import { runSimulatedActivity } from '../agents/customAgentRunner.js';

export const router = Router();

// --- Live overview data (Phase 1 sources, read-only) -----------------------

router.get('/incidents', (req, res) => {
  const incidents = sources.servicenow.get_all_incidents();
  const sessions = gateway.getSessionsOverview();

  // Most recent session per incident, so the feed can show live
  // investigation status without a manual "Investigate" button.
  const latestByIncident = new Map();
  for (const s of sessions) {
    if (!s.incident_id) continue;
    const prev = latestByIncident.get(s.incident_id);
    if (!prev || s.created_at > prev.created_at) latestByIncident.set(s.incident_id, s);
  }

  res.json(
    incidents.map((inc) => {
      const session = latestByIncident.get(inc.id);
      return {
        ...inc,
        investigation: session
          ? { sessionId: session.id, agentType: session.agent_type, status: session.status }
          : null,
      };
    })
  );
});

router.get('/clusters', (req, res) => {
  res.json(sources.kubernetes.list_clusters());
});

router.get('/deployments', (req, res) => {
  res.json(sources.kubernetes.list_deployments({ cluster_id: req.query.cluster_id }));
});

router.get('/deployments/:clusterId/:name/logs', (req, res) => {
  res.json(sources.kubernetes.get_pod_logs({ cluster_id: req.params.clusterId, deployment_name: req.params.name }));
});

router.get('/alerts', (req, res) => {
  res.json(sources.monitoring.get_active_alerts());
});

router.get('/kafka/topics', (req, res) => {
  res.json(sources.kafka.list_topics());
});

router.get('/docs', (req, res) => {
  res.json(sources.confluence.list_docs());
});

// --- LoopSentinel gateway (Phase 2) -----------------------------------------

router.get('/sessions', (req, res) => {
  res.json(gateway.getSessionsOverview());
});

router.get('/sessions/:id', (req, res) => {
  const detail = gateway.getSessionDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'session not found' });
  res.json(detail);
});

router.post('/sessions/:id/kill', (req, res) => {
  const session = gateway.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  gateway.killSession(req.params.id);
  res.json(gateway.getSession(req.params.id));
});

router.get('/config', (req, res) => {
  res.json(gateway.config);
});

// Live "calling X tool... analyzing..." feed, derived from real logged calls.
router.get('/activity', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  res.json(gateway.getRecentActivity(limit));
});

// --- Enterprise metrics ------------------------------------------------------

router.get('/metrics/cost-saved', (req, res) => {
  res.json(gateway.getCostSavedStats());
});

router.get('/metrics/time-to-detect', (req, res) => {
  res.json(gateway.getTimeToDetectStats());
});

router.get('/metrics/most-recent-catch', (req, res) => {
  res.json(gateway.getMostRecentCatch());
});

router.get('/metrics/unsupported-claims', (req, res) => {
  res.json({ unsupportedClaimsToday: gateway.getUnsupportedClaimsCount() });
});

router.get('/metrics/hallucination-resolved', (req, res) => {
  res.json({
    unsupportedClaimsLifetime: gateway.getUnsupportedClaimsLifetimeCount(),
    ticketsHeldOpen: gateway.getTicketsHeldOpenCount(),
  });
});

// --- Audit / compliance export ----------------------------------------------

const CSV_COLUMNS = [
  'session_id',
  'timestamp',
  'agent',
  'tool',
  'arguments',
  'response_summary',
  'flags_raised',
  'signal_strength',
  'cost_usd',
];

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) => CSV_COLUMNS.map((col) => csvEscape(row[col])).join(','));
  return [header, ...lines].join('\r\n');
}

// Full call-history audit log as CSV, for one session (?session_id=...) or
// every session (omit the param) -- supports the project's compliance/
// auditability claims.
router.get('/export/audit-log', (req, res) => {
  const sessionId = req.query.session_id || null;
  if (sessionId && !gateway.getSession(sessionId)) {
    return res.status(404).json({ error: 'session not found' });
  }
  const rows = gateway.getAuditLogRows(sessionId);
  const csv = toCsv(rows);
  const filename = sessionId ? `loopsentinel-audit-${sessionId}.csv` : `loopsentinel-audit-all-sessions.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// --- Scripted demo scenario (Phase 4) ---------------------------------------
// The scenario still injects itself automatically on a timer (see
// server/src/index.js) -- that autonomous, no-manual-trigger story is the
// real design and is unchanged. /scenario/force below is a demo/rehearsal
// safety net only: it calls the exact same maybeInjectCrashLoopScenario()
// the timer calls, so there is no duplicated scenario logic and no separate
// code path to keep in sync.

router.get('/scenario', (req, res) => {
  res.json(getScenarioStatus());
});

router.post('/scenario/force', (req, res) => {
  res.json(maybeInjectCrashLoopScenario());
});

// --- Agent registry (built-in agents + operator-registered custom agents) --
// "Simulate activity" for a custom agent runs through the exact same
// gateway.createSession/callTool/callClaude path as the built-in agents --
// see server/src/agents/customAgentRunner.js. This is a simulated onboarding
// demonstration; it does not connect to any real external system.

router.get('/agents', (req, res) => {
  res.json(getAgentRegistry());
});

router.post('/agents', (req, res) => {
  try {
    const agent = registerAgent({ name: req.body?.name, purpose: req.body?.purpose });
    res.json(agent);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

router.post('/agents/:name/simulate', async (req, res) => {
  const agent = getRegisteredAgent(req.params.name);
  if (!agent) return res.status(404).json({ error: 'registered agent not found' });
  try {
    const result = await runSimulatedActivity({ agentName: agent.name, purpose: agent.purpose });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
