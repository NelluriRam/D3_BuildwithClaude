// Remediation Agent: receives a structured handoff from the SRE Agent,
// proposes and applies a specific remediation action, and reports the
// outcome. "Applying" a fix only ever mutates the simulated in-memory
// Kubernetes state (see sources/kubernetes.js) -- no real system is touched.
// All tool/Claude calls route through the LoopSentinel gateway.

import * as gateway from '../gateway/gateway.js';
import { REMEDIATION_TOOLS } from '../sources/index.js';

const MAX_ITERATIONS = 8;

const REPORT_OUTCOME_TOOL = {
  name: 'report_outcome',
  description: 'Call this exactly once, after applying a remediation action, to report the final outcome.',
  input_schema: {
    type: 'object',
    properties: {
      action_taken: { type: 'string', description: 'e.g. restart_deployment, scale_deployment' },
      outcome: { type: 'string', enum: ['success', 'partial', 'failed'] },
      notes: { type: 'string' },
    },
    required: ['action_taken', 'outcome', 'notes'],
  },
};

const toolLookup = Object.fromEntries(REMEDIATION_TOOLS.map((t) => [t.name, t.source]));
const claudeTools = [
  ...REMEDIATION_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
  REPORT_OUTCOME_TOOL,
];

const SYSTEM_PROMPT = `You are the Remediation Agent for a simulated enterprise environment (LoopSentinel demo -- everything is synthetic, no real systems). \
You receive a structured handoff from the SRE Agent with a hypothesis, evidence, and a proposed fix. Confirm current deployment status, apply exactly one remediation action (restart_deployment or scale_deployment) that matches the proposed fix, confirm the result, then call report_outcome exactly once. Be decisive -- do not re-check the same status repeatedly.`;

export async function runRemediation({ incidentId, sreSessionId, findings }) {
  const session = gateway.createSession({
    agentType: 'remediation',
    incidentId,
    parentSessionId: sreSessionId,
    label: `Remediation: ${incidentId}`,
  });

  const messages = [
    {
      role: 'user',
      content: `Handoff from SRE Agent:\n${JSON.stringify(findings, null, 2)}\n\nApply the remediation and conclude with report_outcome.`,
    },
  ];

  let report = null;
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
        messages.push({ role: 'user', content: 'Please call report_outcome to conclude.' });
        continue;
      }
      break;
    }

    const toolResults = [];
    let hitBlock = false;

    for (const block of toolUseBlocks) {
      if (block.name === 'report_outcome') {
        report = block.input;
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Outcome recorded.' });
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

    if (hitBlock || report) break;
  }
  } catch (err) {
    const reason = `Agent error: ${String(err.message || err)}`;
    gateway.pauseForReview(session.id, reason);
    return { sessionId: session.id, status: 'paused', reason, incidentId };
  }

  if (blockedReason) {
    return { sessionId: session.id, status: 'paused', reason: blockedReason, incidentId };
  }

  gateway.completeSession(session.id);
  return { sessionId: session.id, status: 'completed', report, incidentId };
}
