// One-time seed: 30 days of synthetic "unprotected" daily spend -- what a
// comparable agentic workload would plausibly have cost with NO gateway
// enforcement (no loop detection, no budget ceilings). This is entirely
// illustrative scaffolding for the cost-saved comparison metric; every row
// is tagged is_baseline_illustrative = 1 and it is never presented as real
// historical billing.
//
// Idempotent: runs once. If `baseline_history` already has any rows, this
// is a no-op -- the table persists across server restarts (see db.js) so
// re-running the server, or this script, never regenerates it.

import { db, nowIso } from './db.js';

const DAYS = 30;
const BASE_DAILY_USD = 11; // plausible mid-size agentic workload, unprotected
const WEEKDAY_MULTIPLIER = [0.6, 1.05, 1.15, 1.1, 1.1, 1.15, 0.85]; // Sun..Sat
const SPIKE_PROBABILITY = 0.12; // ~1 in 8 days has a "runaway session" spike
const SPIKE_MULTIPLIER_RANGE = [2.5, 5.5];

function seededRandom(seed) {
  // Small deterministic PRNG (mulberry32) so the generated baseline is
  // stable across seed runs if ever re-derived, not just "once ever".
  let t = seed;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function toDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function generateSeries() {
  const rand = seededRandom(20260101);
  const rows = [];
  for (let i = DAYS; i >= 1; i -= 1) {
    const date = dateNDaysAgo(i);
    const dayOfWeek = date.getUTCDay();
    const weekdayFactor = WEEKDAY_MULTIPLIER[dayOfWeek];

    // Gentle upward drift over the month (workload growing), plus noise.
    const driftFactor = 1 + ((DAYS - i) / DAYS) * 0.35;
    const noise = 0.8 + rand() * 0.4; // +/-20%ish
    let cost = BASE_DAILY_USD * weekdayFactor * driftFactor * noise;

    if (rand() < SPIKE_PROBABILITY) {
      const [lo, hi] = SPIKE_MULTIPLIER_RANGE;
      cost *= lo + rand() * (hi - lo);
    }

    rows.push({ date: toDateKey(date), unprotected_cost_usd: Number(cost.toFixed(2)) });
  }
  return rows;
}

export function seedHistoryIfNeeded() {
  const existing = db.prepare(`SELECT COUNT(*) as n FROM baseline_history`).get();
  if (existing.n > 0) {
    return { seeded: false, reason: 'baseline_history already populated', rowCount: existing.n };
  }

  const insert = db.prepare(
    `INSERT INTO baseline_history (date, unprotected_cost_usd, is_baseline_illustrative, created_at) VALUES (?, ?, 1, ?)`
  );
  const rows = generateSeries();
  const ts = nowIso();
  for (const row of rows) {
    insert.run(row.date, row.unprotected_cost_usd, ts);
  }
  return { seeded: true, rowCount: rows.length };
}

// Allow running directly: `node src/seedHistory.js`
if (process.argv[1] && process.argv[1].endsWith('seedHistory.js')) {
  const result = seedHistoryIfNeeded();
  console.log('[seedHistory]', result);
}
