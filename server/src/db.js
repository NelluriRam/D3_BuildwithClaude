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

// Fresh DB on every server start: this is a demo app whose whole point is
// showing a clean, reproducible scripted scenario on stage.
if (fs.existsSync(dbPath)) fs.rmSync(dbPath);

export const db = new DatabaseSync(dbPath);

db.exec(`
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
  total_cost_usd REAL NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  call_count INTEGER NOT NULL DEFAULT 0
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
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_calls_session ON calls(session_id);
CREATE INDEX idx_flags_session ON flags(session_id);
`);

export function nowIso() {
  return new Date().toISOString();
}
