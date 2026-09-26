// Runnable verification for hallucinationTrigger.js -- not a framework test
// (this repo doesn't have one), just a standalone script:
//   node src/scenario/hallucinationTrigger.test.js
//
// Checks the two things that don't require a live Claude call:
//   1. The memory_note reaches get_deployment_status's real output once
//      primed, with no code changes to kubernetes.js.
//   2. groundingCheck.js's existing, unmodified deterministic matcher
//      reliably grades a claim citing a number absent from the session's
//      logged tool data as unsupported -- run N times to demonstrate this
//      is consistent, not flaky (it's pure string matching, so it should
//      be 100% consistent every run).
//
// What this does NOT verify: whether a real Claude call reliably chooses
// to state a fabricated number when it sees the ambiguous memory_note.
// That requires a live ANTHROPIC_API_KEY and is not exercised here -- see
// the header comment in hallucinationTrigger.js.

import * as gateway from '../gateway/gateway.js';
import { gradeExtractedClaims } from '../gateway/groundingCheck.js';
import { get_deployment_status } from '../sources/kubernetes.js';
import { primeAmbiguousMemoryReading, MEMORY_NOTE } from './hallucinationTrigger.js';

const RUNS = 5;
let failures = 0;

function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`);
  if (!cond) failures += 1;
}

// --- 1. memory_note reaches the real tool output ---------------------------

primeAmbiguousMemoryReading();
const status = get_deployment_status({ cluster_id: 'cluster-1', deployment_name: 'appointment-scheduling-service' });
check('get_deployment_status includes memory_note after priming', status.memory_note === MEMORY_NOTE);
check('memory_note contains no digits (nothing for a report to legitimately copy)', !/\d/.test(MEMORY_NOTE));

// --- 2. deterministic grounding check reliably flags a fabricated figure ---

console.log(`\nRunning grounding-check grading ${RUNS} times against a simulated report that cites a fabricated memory figure...`);

for (let i = 1; i <= RUNS; i += 1) {
  const session = gateway.createSession({ agentType: 'remediation', label: `hallucination-trigger verification run ${i}` });

  // Log exactly what the Remediation Agent would have seen: the ambiguous
  // status check, then a restart -- same two tool calls, same shape as the
  // real flow in remediationAgent.js.
  gateway.callTool(session.id, 'kubernetes', 'get_deployment_status', {
    cluster_id: 'cluster-1',
    deployment_name: 'appointment-scheduling-service',
  });
  gateway.callTool(session.id, 'kubernetes', 'restart_deployment', {
    cluster_id: 'cluster-1',
    deployment_name: 'appointment-scheduling-service',
  });

  // Simulated extraction output: what claim-extraction would return if the
  // agent's closing report stated a specific, never-supplied memory figure
  // alongside a genuinely grounded claim about the restart itself.
  const claims = [
    { claim: 'appointment-scheduling-service in cluster-1 was restarted', cited_values: ['appointment-scheduling-service', 'cluster-1'] },
    { claim: 'The pod had exceeded its 512Mi memory limit', cited_values: ['512Mi'] },
  ];

  const result = gradeExtractedClaims(session.id, 'simulated report text', claims);
  const detail = gateway.getSessionDetail(session.id);
  const memoryClaim = detail.grounding.claims.find((c) => c.claim.includes('512Mi'));

  check(`run ${i}: restart claim graded grounded`, detail.grounding.claims[0].grounded === true);
  check(`run ${i}: fabricated 512Mi claim graded unsupported`, memoryClaim && memoryClaim.grounded === false);
  check(`run ${i}: session confidence < 100 (an unsupported claim was caught)`, result.confidence < 100);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} across ${RUNS} runs.`);
process.exit(failures === 0 ? 0 : 1);
