// SRE Agent: investigates an incident using the five simulated data sources,
// forms a hypothesis, and either resolves directly or hands off to the
// Remediation Agent. Every tool call and every Claude API call goes through
// the LoopSentinel gateway (Phase 2) -- nothing here calls Anthropic or the
// sources directly.

import * as gateway from '../gateway/gateway.js';
import { SRE_TOOLS } from '../sources/index.js';
import { runRemediation } from './remediationAgent.js';

const MAX_ITERATIONS = 14;

const SUBMIT_FINDINGS_TOOL = {
  name: 'submit_findings',
  description:
    'Call this exactly once, when you are ready to conclude the investigation. Either resolve the incident directly (minor, no remediation needed) or hand off to the Remediation Agent with a structured summary.',
  input_schema: {
    type: 'object',
    properties: {
      decision: { type: 'string', enum: ['resolve_directly', 'handoff_to_remediation'] },
      hypothesis: { type: 'string', description: 'Your root-cause hypothesis.' },
      evidence: { type: 'array', items: { type: 'string' }, description: 'Concrete evidence points gathered from tools.' },
      proposed_fix: { type: 'string', description: 'What should be done (e.g. restart deployment X, scale Y to N replicas).' },
      cluster_id: { type: 'string', description: 'Cluster id, if the fix targets a specific deployment.' },
      deployment_name: { type: 'string', description: 'Deployment name, if the fix targets a specific deployment.' },
    },
    required: ['decision', 'hypothesis', 'evidence', 'proposed_fix'],
  },
};

const toolLookup = Object.fromEntries(SRE_TOOLS.map((t) => [t.name, t.source]));
const claudeTools = [
  ...SRE_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
  SUBMIT_FINDINGS_TOOL,
];

const SYSTEM_PROMPT = `You are the SRE Agent for a simulated enterprise environment (LoopSentinel demo -- everything is synthetic, no real systems). \
You triage incidents using five tools sources: ServiceNow (incidents), Monitoring (alerts/metrics), Kubernetes (clusters/deployments/logs), Kafka (topics/lag), and Confluence (architecture docs/runbooks).

Investigate efficiently: gather just enough evidence to support a hypothesis, then call submit_findings exactly once. Prefer checking a runbook doc (search_docs) when unsure how to proceed. Avoid re-checking the same tool with the same arguments once you already have that answer -- if a log line references another service, check it once, and if it looks healthy, treat the log line as a red herring rather than re-polling it. Minor issues (e.g. a single pod already self-healed) can be resolved directly; anything requiring a real change (restart, scale) should be handed off to the Remediation Agent via submit_findings.`;

export async function runSreInvestigation(incidentId, { forcedSessionLabel, extraInstructions } = {}) {
  const session = gateway.createSession({
    agentType: 'sre',
    incidentId,
    label: forcedSessionLabel || `SRE investigation: ${incidentId}`,
  });

  const incidentLookup = gateway.callTool(session.id, 'servicenow', 'get_incident_detail', { id: incidentId });
  if (incidentLookup.blocked) {
    return { sessionId: session.id, status: 'paused', reason: incidentLookup.reason };
  }

  const messages = [
    {
      role: 'user',
      content: `A new incident needs triage:\n${JSON.stringify(incidentLookup.response, null, 2)}\n\n${
        extraInstructions ? `${extraInstructions}\n\n` : ''
      }Investigate and conclude with submit_findings.`,
    },
  ];

  let findings = null;
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
          messages.push({ role: 'user', content: 'Please call submit_findings to conclude the investigation.' });
          continue;
        }
        break;
      }

      const toolResults = [];
      let hitBlock = false;

      for (const block of toolUseBlocks) {
        if (block.name === 'submit_findings') {
          findings = block.input;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Findings recorded.' });
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

      if (hitBlock || findings) break;
    }
  } catch (err) {
    const reason = `Agent error: ${String(err.message || err)}`;
    gateway.pauseForReview(session.id, reason);
    return { sessionId: session.id, status: 'paused', reason, incidentId };
  }

  if (blockedReason) {
    return { sessionId: session.id, status: 'paused', reason: blockedReason, incidentId };
  }

  if (!findings) {
    gateway.completeSession(session.id);
    return {
      sessionId: session.id,
      status: 'completed',
      reason: 'Investigation ended without a conclusive submit_findings call (iteration cap reached).',
      incidentId,
    };
  }

  if (findings.decision === 'resolve_directly') {
    gateway.completeSession(session.id);
    return { sessionId: session.id, status: 'completed', findings, incidentId };
  }

  // handoff_to_remediation
  gateway.completeSession(session.id);
  const remediation = await runRemediation({
    incidentId,
    sreSessionId: session.id,
    findings,
  });

  return {
    sessionId: session.id,
    status: 'handed_off',
    findings,
    incidentId,
    remediation,
  };
}
