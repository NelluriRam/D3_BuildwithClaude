// Tracks whether a signed-in dashboard session is currently open, via a
// heartbeat the frontend sends only while authenticated. Real Claude API
// calls (auto-investigation) are gated on this so the deployed app never
// burns tokens with nobody signed in and watching.
const ACTIVE_WINDOW_MS = 15_000; // heartbeat fires every 5s; 15s covers a couple of missed beats

let lastSeenAt = 0;

export function recordActivity() {
  lastSeenAt = Date.now();
}

export function isAnyoneActive() {
  return Date.now() - lastSeenAt < ACTIVE_WINDOW_MS;
}
