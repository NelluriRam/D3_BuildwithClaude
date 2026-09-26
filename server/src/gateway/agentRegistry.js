// Agent registry: lists the three built-in agents plus any custom agents
// an operator has registered, each with live stats pulled from the
// existing sessions/flags tables (grouped by agent_type -- no new
// detection or scoring logic, just a read composition). Additive only:
// does not touch the built-in agents' own pipeline code.

import { db, nowIso } from '../db.js';
import { nextId } from '../util.js';

const insertAgent = db.prepare(`INSERT INTO registered_agents (id, name, purpose, status, created_at) VALUES (?,?,?,?,?)`);
const listAgentsStmt = db.prepare(`SELECT * FROM registered_agents ORDER BY created_at ASC`);
const findByNameStmt = db.prepare(`SELECT * FROM registered_agents WHERE name = ?`);

// One row per agent_type: how many sessions, when it last ran, how many
// flags were raised across all of its sessions. Works identically for
// built-in and custom agents since both are just values of agent_type.
const statsStmt = db.prepare(`
  SELECT sessions.agent_type as agent_type,
         COUNT(DISTINCT sessions.id) as session_count,
         MAX(sessions.created_at) as last_active,
         COUNT(flags.id) as flags_raised
  FROM sessions
  LEFT JOIN flags ON flags.session_id = sessions.id
  GROUP BY sessions.agent_type
`);

export const BUILTIN_AGENTS = [
  {
    key: 'sre',
    name: 'SRE Agent',
    role: 'Investigates incoming incidents using the five tool sources (ServiceNow, Monitoring, Kubernetes, Kafka, Confluence), forms a hypothesis, and either resolves minor issues directly or hands off to the Remediation Agent.',
  },
  {
    key: 'remediation',
    name: 'Remediation Agent',
    role: "Applies the specific fix proposed in the SRE Agent's handoff (a simulated state change only), then hands off to the Verification Agent.",
  },
  {
    key: 'verification',
    name: 'Verification Agent',
    role: 'Independently re-checks the deployment the fix touched -- fresh tool calls, not just trusting the report -- and only then closes the incident.',
  },
];

const RESERVED_KEYS = new Set(BUILTIN_AGENTS.flatMap((a) => [a.key.toLowerCase(), a.name.toLowerCase()]));

function statsFor(agentType, statsRows) {
  const row = statsRows.find((r) => r.agent_type === agentType);
  return {
    sessionCount: row?.session_count ?? 0,
    lastActive: row?.last_active ?? null,
    flagsRaised: row?.flags_raised ?? 0,
  };
}

/** Built-in agents + registered custom agents, each with live stats. */
export function getAgentRegistry() {
  const statsRows = statsStmt.all();

  const builtins = BUILTIN_AGENTS.map((a) => ({
    key: a.key,
    name: a.name,
    role: a.role,
    builtin: true,
    status: 'active',
    ...statsFor(a.key, statsRows),
  }));

  const registered = listAgentsStmt.all().map((r) => {
    const stats = statsFor(r.name, statsRows);
    return {
      key: r.name,
      name: r.name,
      role: r.purpose,
      builtin: false,
      status: stats.sessionCount > 0 ? 'active' : r.status,
      registeredAt: r.created_at,
      ...stats,
    };
  });

  return [...builtins, ...registered];
}

export function registerAgent({ name, purpose }) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Agent name is required.');
  if (RESERVED_KEYS.has(trimmedName.toLowerCase())) {
    throw new Error(`"${trimmedName}" is a built-in agent name -- choose a different name.`);
  }
  if (findByNameStmt.get(trimmedName)) {
    throw new Error(`An agent named "${trimmedName}" is already registered.`);
  }
  const id = nextId('agent');
  insertAgent.run(id, trimmedName, (purpose || '').trim(), 'registered', nowIso());
  return findByNameStmt.get(trimmedName);
}

export function getRegisteredAgent(name) {
  return findByNameStmt.get(name);
}

export function listRegisteredAgents() {
  return listAgentsStmt.all();
}
