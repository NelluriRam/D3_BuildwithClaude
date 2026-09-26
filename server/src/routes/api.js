import { Router } from 'express';
import { sources } from '../sources/index.js';
import * as gateway from '../gateway/gateway.js';
import { runSreInvestigation } from '../agents/sreAgent.js';
import { triggerCrashLoopScenario, SCENARIO_META } from '../scenario/crashLoopScenario.js';

export const router = Router();

// --- Live overview data (Phase 1 sources, read-only) -----------------------

router.get('/incidents', (req, res) => {
  res.json(sources.servicenow.get_all_incidents());
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

// --- Agents (Phase 3) --------------------------------------------------------

router.post('/incidents/:id/investigate', async (req, res) => {
  try {
    const result = await runSreInvestigation(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// --- Scripted demo scenario (Phase 4) ---------------------------------------

router.get('/scenario', (req, res) => {
  res.json(SCENARIO_META);
});

router.post('/scenario/trigger', async (req, res) => {
  try {
    const result = await triggerCrashLoopScenario();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
