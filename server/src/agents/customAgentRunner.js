// Runner for custom, operator-registered agents (Agent Registry onboarding).
// A "Simulate activity" click runs one lightweight investigation of a
// randomly chosen deployment's current state, through the exact same
// gateway.createSession/callTool/callClaude path the three built-in agents
// use -- same loop detection, same budget enforcement, same grounding
// check. Nothing here is a separate or weakened monitoring path: it is
// parameterized only by the agent's name/purpose, not by any different
// gateway behavior. This demonstrates onboarding, not a connection to any
// real external system.

import * as gateway from '../gateway/gateway.js';
import { sources } from '../sources/index.js';
import { runGroundingCheck } from '../gateway/groundingCheck.js';

const MAX_ITERATIONS = 6;

const INVESTIGATION_TOOLS = [
  {
    source: 'kubernetes',
    name: 'get_deployment_status',
    description: 'Get the status of one deployment (replica count, status, hpa_enabled, etc).',
    input_schema: {
      type: 'object',
      properties: { cluster_id: { type: 'string' }, deployment_name: { type: 'string' } },
      required: ['cluster_id', 'deployment_name'],
    },
  },
  {
    source: 'kubernetes',
    name: 'get_pod_logs',
    description: 'Get the most recent pod log lines for a deployment.',
    input_schema: {
      type: 'object',
      properties: { cluster_id: { type: 'string' }, deployment_name: { type: 'string' } },
      required: ['cluster_id', 'deployment_name'],
    },
  },
];

const SUBMIT_OBSERVATION_TOOL = {
  name: 'submit_observation',
  description: 'Call this exactly once, after checking the deployment, to record what you found.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Plain-language summary of what you observed.' },
      healthy: { type: 'boolean', description: 'True if the deployment looks healthy right now.' },
    },
    required: ['summary', 'healthy'],
  },
};

const toolLookup = Object.fromEntries(INVESTIGATION_TOOLS.map((t) => [t.name, t.source]));
const claudeTools = [
  ...INVESTIGATION_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
  SUBMIT_OBSERVATION_TOOL,
];

function pickRandomDeployment() {
  const all = sources.kubernetes._listAllRaw();
  return all[Math.floor(Math.random() * all.length)];
}

/**
 * Simulated onboarding activity for a custom registered agent. Picks a
 * random deployment, investigates it through the real gateway (loop
 * detection + budget enforcement apply identically to the built-in
 * agents), then runs the same grounding check on its final report.
 */
export async function runSimulatedActivity({ agentName, purpose }) {
  const target = pickRandomDeployment();

  const session = gateway.createSession({
    agentType: agentName,
    label: `Simulated onboarding activity: ${agentName}`,
  });

  const messages = [
    {
      role: 'user',
      content: `You have been asked to check on one Kubernetes deployment as a lightweight onboarding activity.\n\nTarget: cluster_id=${target.cluster_id}, deployment_name=${target.deployment_name}\n\nCheck its current status and recent logs, then conclude with submit_observation.`,
    },
  ];

  const purposeClause = purpose ? ` (purpose: ${purpose})` : '';
  const SYSTEM_PROMPT = `You are "${agentName}", a custom monitored agent registered with LoopSentinel${purposeClause} (demo -- everything is synthetic, no real systems). You've been asked to check on one Kubernetes deployment as a lightweight demonstration that LoopSentinel's monitoring applies to any agent registered with it, not just the built-in ones. Check the deployment's status (get_deployment_status) and recent logs (get_pod_logs), then call submit_observation exactly once with a plain-language summary. Be decisive -- check once, not repeatedly.`;

  let observation = null;
  let blockedReason = null;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
      const result = await gateway.callClaude(session.id, {
        system: SYSTEM_PROMPT,
        messages,
        tools: claudeTools,
      });

      if (result.blocked) {
        blockedReason = result.reason;
        break;
      }

      const resp = result.response;
      messages.push({ role: 'assistant', content: resp.content });

      const toolUseBlocks = resp.content.filter((b) => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        if (resp.stop_reason === 'end_turn') {
          messages.push({ role: 'user', content: 'Please call submit_observation to conclude.' });
          continue;
        }
        break;
      }

      const toolResults = [];
      let hitBlock = false;

      for (const block of toolUseBlocks) {
        if (block.name === 'submit_observation') {
          observation = block.input;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Observation recorded.' });
          continue;
        }

        const source = toolLookup[block.name];
        if (!source) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true });
          continue;
        }

        const callResult = gateway.callTool(session.id, source, block.name, block.input);
        if (callResult.blocked) {
          blockedReason = callResult.reason;
          hitBlock = true;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `BLOCKED: ${callResult.reason}`, is_error: true });
          continue;
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(callResult.response) });
      }

      messages.push({ role: 'user', content: toolResults });

      if (hitBlock || observation) break;
    }
  } catch (err) {
    const reason = `Agent error: ${String(err.message || err)}`;
    gateway.pauseForReview(session.id, reason);
    return { sessionId: session.id, status: 'paused', reason, target: { cluster_id: target.cluster_id, deployment_name: target.deployment_name } };
  }

  if (blockedReason) {
    return { sessionId: session.id, status: 'paused', reason: blockedReason, target: { cluster_id: target.cluster_id, deployment_name: target.deployment_name } };
  }

  let grounding = null;
  if (observation) {
    const reportText = `Summary: ${observation.summary}\nHealthy: ${observation.healthy}`;
    try {
      grounding = await runGroundingCheck(session.id, reportText);
    } catch (err) {
      grounding = { computed: false, reason: `grounding check error: ${String(err.message || err)}` };
    }
  }

  gateway.completeSession(session.id);
  return {
    sessionId: session.id,
    status: 'completed',
    observation,
    grounding,
    target: { cluster_id: target.cluster_id, deployment_name: target.deployment_name },
  };
}
