// Verification Agent: the third step in the pipeline (SRE -> Remediation ->
// Verification). Receives the Remediation Agent's report, independently
// re-checks the deployment the fix touched (fresh tool calls -- it does not
// just trust the report), and only then closes the ServiceNow incident. If
// it can't confirm the fix held, it leaves the incident open and says why,
// rather than closing a ticket on a fix that didn't actually work.
// All tool/Claude calls route through the LoopSentinel gateway, same as
// the other two agents.

import * as gateway from '../gateway/gateway.js';
import { VERIFICATION_TOOLS } from '../sources/index.js';
import { runGroundingCheck } from '../gateway/groundingCheck.js';

const MAX_ITERATIONS = 8;

const SUBMIT_VERIFICATION_TOOL = {
  name: 'submit_verification',
  description: 'Call this exactly once, after checking the deployment (and, if confirmed, resolving the incident), to record your verdict.',
  input_schema: {
    type: 'object',
    properties: {
      verified: { type: 'boolean', description: 'True only if you independently confirmed the fix held.' },
      notes: { type: 'string', description: 'What you checked and what you found. If not verified, explain what is still wrong.' },
    },
    required: ['verified', 'notes'],
  },
};

const toolLookup = Object.fromEntries(VERIFICATION_TOOLS.map((t) => [t.name, t.source]));
const claudeTools = [
  ...VERIFICATION_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
  SUBMIT_VERIFICATION_TOOL,
];

const SYSTEM_PROMPT = `You are the Verification Agent for a simulated enterprise environment (LoopSentinel demo -- everything is synthetic, no real systems). \
You receive a report from the Remediation Agent describing an action it already took. Do not simply trust that report: independently re-check the deployment's current status (get_deployment_status) and recent logs (get_pod_logs) to confirm the fix actually held -- status Running, replica count matching desired, no continuing errors. Only if you confirm this, call resolve_incident to close the ticket. Then call submit_verification exactly once with your verdict. If you cannot confirm the fix held, do NOT resolve the incident -- explain what's still wrong in notes so a human can follow up. Be decisive -- check once, not repeatedly.`;

export async function runVerification({ incidentId, remediationSessionId, findings, report }) {
  const session = gateway.createSession({
    agentType: 'verification',
    incidentId,
    parentSessionId: remediationSessionId,
    label: `Verification: ${incidentId}`,
  });

  const messages = [
    {
      role: 'user',
      content: `Remediation Agent report for incident ${incidentId}:\n${JSON.stringify(report, null, 2)}\n\nTarget of the fix:\n${JSON.stringify(
        { cluster_id: findings?.cluster_id, deployment_name: findings?.deployment_name },
        null,
        2
      )}\n\nIndependently verify, then conclude with submit_verification.`,
    },
  ];

  let verdict = null;
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
          messages.push({ role: 'user', content: 'Please call submit_verification to conclude.' });
          continue;
        }
        break;
      }

      const toolResults = [];
      let hitBlock = false;

      for (const block of toolUseBlocks) {
        if (block.name === 'submit_verification') {
          verdict = block.input;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Verdict recorded.' });
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

      if (hitBlock || verdict) break;
    }
  } catch (err) {
    const reason = `Agent error: ${String(err.message || err)}`;
    gateway.pauseForReview(session.id, reason);
    return { sessionId: session.id, status: 'paused', reason, incidentId };
  }

  if (blockedReason) {
    return { sessionId: session.id, status: 'paused', reason: blockedReason, incidentId };
  }

  let grounding = null;
  if (verdict) {
    const reportText = `Verified: ${verdict.verified}\nNotes: ${verdict.notes}`;
    try {
      grounding = await runGroundingCheck(session.id, reportText);
    } catch (err) {
      // Grounding is a bonus signal, not core verification -- a failure here must never block the verdict.
      grounding = { computed: false, reason: `grounding check error: ${String(err.message || err)}` };
    }
  }

  gateway.completeSession(session.id);
  return { sessionId: session.id, status: 'completed', verdict, incidentId, grounding };
}
