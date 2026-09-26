import { Router } from 'express';
import { sources } from '../sources/index.js';
import * as gateway from '../gateway/gateway.js';
import { getScenarioStatus } from '../scenario/crashLoopScenario.js';

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

// --- Scripted demo scenario (Phase 4) ---------------------------------------
// Read-only status only -- the scenario injects itself automatically on a
// timer (see server/src/index.js); there is no manual trigger endpoint.

router.get('/scenario', (req, res) => {
  res.json(getScenarioStatus());
});
