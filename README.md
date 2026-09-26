# LoopSentinel

**A runtime monitoring and circuit-breaker layer for AI agents.**
Built for the "Fix It Forward with Claude" hackathon (D3 2026).

AI agents fail while *looking* like they're working: stuck loops, runaway
sub-agent fan-out, and unbounded spend all hide behind dashboards that stay
green and individual tool calls that each look successful. LoopSentinel sits
between every agent and every tool it calls, logs everything, detects loop
patterns deterministically (not via LLM judgment), enforces budget ceilings
in code, and pauses for human review instead of failing silently or running
forever.

## ⚠️ All data is simulated

Every one of the five "systems" LoopSentinel monitors — ServiceNow,
Datadog-style monitoring, Kubernetes, Kafka, and Confluence — is a
synthetic, in-memory module that generates its own fictional data via a
background randomizer, modeling a fictional **healthcare platform**
(patient portal, EHR, appointment scheduling, login/SSO, billing, etc).
**No real production system, real credentials, real patient data, or real
company/customer data is read, written, or connected to anywhere in this
project.** This is a deliberate architecture choice required by the
contest rules, not a limitation: the only live network call this app ever
makes is to the Claude API, to power the two agents.

## Everything runs on its own — nothing is manually triggered

There is no "Investigate" button and no "Trigger scenario" button anywhere
in the UI. Instead:

- The five sources continuously generate incidents, alerts, metrics, and
  logs in the background, exactly like a real environment would.
- The **SRE Agent launches itself automatically** the moment a new P1 or P2
  incident appears (`server/src/autoInvestigate.js`, listening for a
  `ServiceNow` `incident_created` event) — triages it through the five tool
  sources, forms a hypothesis, and either resolves it directly or hands off
  to the **Remediation Agent**, which applies a fix (a simulated state
  change only). Every tool call and every Claude API call from both agents
  is routed through the LoopSentinel gateway.
- A scripted `CrashLoopBackOff` scenario with a red-herring log trail
  injects itself automatically on a timer (`SCENARIO_INTERVAL_MS`, default
  every 3 minutes, plus once ~12s after startup) — it just files a P1
  incident, and the same automatic investigation pipeline above picks it up
  like any other incident. The incident brief primes the SRE Agent (not a
  hidden instruction to the detector) to re-verify one metric more than
  once before concluding. LoopSentinel's detector — which knows nothing
  about this scenario — sees the same tool call with the same arguments
  repeated and pauses the session for human review, with the exact repeated
  call visible in the session drill-down.
- The **Overview** page's live activity feed streams "calling
  `kubernetes.get_pod_logs(...)`", "analyzing...", "concluding
  investigation" lines in real time — each line is generated straight from
  a real row LoopSentinel logged for a real tool call or Claude call, not
  scripted text.

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│   React dashboard (client)   │  HTTP  │   Express API (server)        │
│  Overview / Sessions / ...   │◄──────►│   /api/*                      │
└─────────────────────────────┘        └───────────────┬────────────────┘
                                                          │
                          ┌───────────────────────────────┼───────────────────────────────┐
                          │                               │                               │
                 ┌────────▼────────┐            ┌─────────▼─────────┐           ┌─────────▼─────────┐
                 │  SRE Agent        │            │ Remediation Agent │           │ Scripted scenario  │
                 │  (Claude tool-use)│──handoff──►│ (Claude tool-use)  │           │ (forces state)      │
                 └────────┬──────────┘            └─────────┬──────────┘           └─────────┬─────────┘
                          │  every tool / Claude call                              forces
                          ▼                                                        state via
                 ┌─────────────────────────────────────────────────────┐          the same
                 │            LoopSentinel Gateway                      │◄─────────sources
                 │  - logs every call to SQLite (node:sqlite)            │
                 │  - deterministic loop detection (pattern matching)    │
                 │  - budget ceilings enforced in code                   │
                 │  - pauses session + marks needs_review on a flag      │
                 └───────────────────────────┬─────────────────────────┘
                                              │
                    ┌───────────┬─────────────┼─────────────┬───────────┐
                    ▼           ▼             ▼             ▼           ▼
               ServiceNow  Monitoring    Kubernetes       Kafka    Confluence
               (incidents) (alerts/     (2 clusters ×   (20 topics) (5 static
                            metrics)     30 deployments)             docs)
               all five: in-memory state, background-randomized, synthetic
```

`ServiceNow` also emits an `incident_created` event on every new incident
(background-generated or scripted); `server/src/autoInvestigate.js`
subscribes to it and launches the SRE Agent automatically — this is what
removes the need for any manual "Investigate" or "Trigger scenario" button.

## Tech stack

- **Backend**: Node.js 22, Express, `node:sqlite` (Node's built-in SQLite —
  no native module compilation required), `@anthropic-ai/sdk`.
- **Frontend**: React 18 + Vite, `react-router-dom`, plain CSS (no UI
  framework, to keep full control over the no-icons/light-theme spec).
- **Claude models**: configurable via `CLAUDE_MODEL`; defaults to a fast/
  cheap model since agent loops are cost-sensitive by design.
- **Persistence**: a single SQLite file at `server/src/data/loopsentinel.sqlite`,
  recreated fresh on every server start (this is a demo whose whole point is
  a clean, reproducible scripted scenario).

## Repository layout

```
server/               Express API, gateway, agents, simulated sources
  src/sources/         ServiceNow, Monitoring, Kubernetes, Kafka, Confluence
  src/gateway/         gateway.js, loopDetection.js, pricing.js
  src/agents/          sreAgent.js, remediationAgent.js
  src/scenario/        crashLoopScenario.js (auto-injecting scripted demo)
  src/autoInvestigate.js  auto-launches the SRE Agent on every P1/P2 incident
  src/routes/          api.js
  src/db.js            SQLite schema + connection
client/               React dashboard (Vite)
  src/pages/            Login, Overview, Sessions, Clusters
  src/components/       TopBar, ActivityFeed, IncidentFeed, ClusterHealthGrid, ...
```

## Setup and run

Requires **Node.js 22+** (for built-in `node:sqlite`).

```bash
# 1. Install dependencies (root + both workspaces)
npm run setup

# 2. Configure your Claude API key
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3a. Development (hot reload, client on :5173 proxying API to :3001)
npm run dev

# 3b. OR production (single process, serves built client + API on :3001)
npm run build
npm start
```

Then open the dashboard (`http://localhost:5173` in dev, or
`http://localhost:3001` in production) and click **Sign in with SSO** (mock
— no real authentication) to reach the dashboard.

### Environment variables (`.env`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | **Required.** Claude API key, read from the environment — never hardcoded, never committed. |
| `CLAUDE_MODEL` | Model used by both agents. Defaults to a fast/cheap model. |
| `PORT` | Port the server (and, in production, the static frontend) listens on. |
| `SESSION_BUDGET_USD` | Hard per-session cost ceiling enforced by the gateway before every call. |
| `HOURLY_BUDGET_USD` | Hard rolling-hour cost ceiling across all sessions. Investigations launch automatically, so this needs headroom for continuous background activity. |
| `SCENARIO_INTERVAL_MS` | How often the scripted CrashLoopBackOff scenario injects itself (default 180000 = 3 min). It also fires once ~12s after startup. |

## How loop detection works (deterministic, not LLM-judged)

Every tool call is logged with its full arguments and response. Before each
call is forwarded, and after each call is logged, `server/src/gateway/loopDetection.js`
checks the session's call history for three patterns — pure data matching,
no model call involved:

1. **Exact repetition** — the same tool + arguments called ≥3 times within
   a trailing window of 10 calls.
2. **Oscillation** — a repeating cycle of period 2–4 in the call sequence
   (e.g. A, B, A, B, A, B).
3. **No-progress** — repeated calls to the same tool whose responses are
   functionally identical (timestamps and other volatile fields stripped
   before comparing) even if arguments differ slightly.

Any hit pauses the session (`status = 'paused'`, `needs_review = true`) and
blocks every subsequent call in that session — visible immediately in the
Sessions panel, with the exact flagged call highlighted in the drill-down.
Budget ceilings (`SESSION_BUDGET_USD`, `HOURLY_BUDGET_USD`) and a defensive
40-calls-per-session cap are checked the same way, in code, before every
call is forwarded — never as a prompt instruction.

## Note on cost estimates

`server/src/gateway/pricing.js` uses an approximate, hardcoded per-token
rate table to estimate session cost for the budget ceiling and dashboard —
it is a reasonable estimate for demo purposes, not a source of billing
truth.

## Enterprise metrics (signal strength, cost saved, time-to-detect, audit export)

Built entirely on top of the core gateway above, from data it already logs —
none of this introduces a new LLM call for scoring or detection, and none of
it changes the three loop-detection algorithms themselves:

- **Signal strength (0-100)** — `loopDetection.js` attaches a deterministic
  score to every flag it returns (repetition count vs. threshold +
  corroboration across detection types + how tightly the matched calls
  cluster in time; exact formula documented in that file). Shown with a
  hover tooltip in the Sessions table and session drill-down.
- **Cost saved** — for every session a loop/budget flag paused,
  `pricing.js` projects that session's own $/sec rate 30 minutes forward
  and reports the difference as "cost avoided" (`GET
  /api/metrics/cost-saved`). The comparison figure it's shown against
  (`costSavedLastPeriod`) comes from a **30-day synthetic, illustrative
  "unprotected" baseline** (`server/src/seedHistory.js`, seeded once into
  a `baseline_history` table that persists across restarts, tagged
  `is_baseline_illustrative`) — always labeled "vs. illustrative
  unprotected baseline" in the UI, never presented as real historical
  billing.
- **Time to detect** — elapsed time between a session's first tool call
  and the moment it was flagged/paused, averaged across all flagged
  sessions (`GET /api/metrics/time-to-detect`).
- **Audit export** — `GET /api/export/audit-log` (optionally
  `?session_id=...`) returns the full logged call history as CSV
  (timestamp, agent, tool, arguments, response summary, flags raised,
  signal strength, cost), downloadable from the Sessions page and from
  each session's drill-down.
- **Report grounding** — after the Remediation Agent's final report, one
  lightweight Claude call *extracts* the factual claims the report makes
  (never judges them); `server/src/gateway/groundingCheck.js` then
  deterministically checks whether each claim's cited values actually
  appear in that session's own logged tool responses, producing a
  grounded/unsupported label per claim and a 0-100 confidence score
  (formula documented in that file). Shown in the session drill-down.
- **Hallucination-trigger scenario** — `server/src/scenario/hallucinationTrigger.js`,
  fully isolated from the CrashLoopBackOff loop scenario, primes the same
  target deployment's `get_deployment_status` response with a realistic
  "memory reading unavailable" note (no number anywhere in it). This
  creates a genuine circumstance where a confident closing report is
  tempted to state a specific memory figure it never actually confirmed --
  if it does, the existing grounding check catches it with no changes.
  **The deterministic catching half is verified repeatedly** (see
  `hallucinationTrigger.test.js`); whether a live Claude call reliably
  takes the bait was **not** empirically verified in this environment (no
  working API key) and should be confirmed against a real key before
  relying on it for a demo.
- **Force scenario now (demo control)** — a small, de-emphasized link on
  the Overview page's automated-scenario panel, and `POST
  /api/scenario/force`, call the exact same `maybeInjectCrashLoopScenario()`
  the timer already uses. This is a rehearsal/demo-reliability safety net
  only -- live incidents are never manually triggered.

## Deployment

The production build is a single Node process (`npm run build && npm
start`) serving both the API and the static frontend on one port — this is
enough to deploy to any standard Node host (Render, Railway, Fly.io,
a VM, etc.) as-is: set `ANTHROPIC_API_KEY` (and optionally the other env
vars above) in the host's environment/secret manager, run the same two
commands, and expose `PORT`. No external database or other infrastructure
is required — SQLite is a local file.
