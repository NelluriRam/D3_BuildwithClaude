// Persistence layer for LoopSentinel. Uses Node's built-in node:sqlite
// (no native module compilation required) so every tool/agent call, every
// loop-detection flag, and every budget decision is durably logged.

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'loopsentinel.sqlite');

// The database file itself now persists across restarts (it didn't used
// to) because `baseline_history` must survive a restart -- it is seeded
// once and must NOT be regenerated on every server start. Everything else
// (sessions/calls/flags/claims) is still reset to a clean slate on every
// start below, so the live demo stays reproducible.
export const db = new DatabaseSync(dbPath);

db.exec(`
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS flags;
DROP TABLE IF EXISTS calls;
DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL,
  incident_id TEXT,
  parent_session_id TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  status_reason TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paused_at TEXT,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  call_count INTEGER NOT NULL DEFAULT 0,
  grounding_confidence REAL,
  grounding_report_text TEXT,
  grounding_computed_at TEXT
);

CREATE TABLE calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  call_type TEXT NOT NULL,
  tool_source TEXT,
  tool_name TEXT,
  args_json TEXT,
  response_json TEXT,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  flag_type TEXT NOT NULL,
  detail TEXT,
  call_id_ref INTEGER,
  signal_strength INTEGER,
  signal_strength_detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  cited_values_json TEXT NOT NULL,
  grounded INTEGER NOT NULL,
  unmatched_values_json TEXT,
  cross_session_leakage INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_calls_session ON calls(session_id);
CREATE INDEX idx_flags_session ON flags(session_id);
CREATE INDEX idx_claims_session ON claims(session_id);

-- Synthetic "unprotected" (no gateway) daily spend baseline, used only as
-- an illustrative point of comparison for the cost-saved metric. Seeded
-- once by seedHistory.js and never regenerated once populated -- it must
-- persist across restarts, unlike every table above.
CREATE TABLE IF NOT EXISTS baseline_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  unprotected_cost_usd REAL NOT NULL,
  is_baseline_illustrative INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
`);

export function nowIso() {
  return new Date().toISOString();
}
