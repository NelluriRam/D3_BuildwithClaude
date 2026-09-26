// Wires up fully-automatic investigation: whenever ServiceNow emits a new
// P1/P2 incident (whether from the background randomizer or from the
// scripted scenario), the SRE Agent is launched against it with no manual
// button. A small concurrency cap keeps a burst of incidents from firing
// off unbounded simultaneous Claude sessions.

import { events } from './sources/servicenow.js';
import { runSreInvestigation } from './agents/sreAgent.js';
import { takeScenarioInstructions } from './scenario/crashLoopScenario.js';

const MAX_CONCURRENT = 2;

let activeCount = 0;
const queue = [];
const seen = new Set();

function shouldAutoInvestigate(incident) {
  return incident.priority === 'P1' || incident.priority === 'P2';
}

function processQueue() {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const incident = queue.shift();
    activeCount += 1;
    const extraInstructions = takeScenarioInstructions(incident.id);
    runSreInvestigation(incident.id, extraInstructions ? { extraInstructions } : {})
      .catch((err) => {
        console.error(`[auto-investigate] ${incident.id} failed:`, err);
      })
      .finally(() => {
        activeCount -= 1;
        processQueue();
      });
  }
}

export function startAutoInvestigation() {
  events.on('incident_created', (incident) => {
    if (!shouldAutoInvestigate(incident)) return;
    if (seen.has(incident.id)) return;
    seen.add(incident.id);
    queue.push(incident);
    processQueue();
  });
}
