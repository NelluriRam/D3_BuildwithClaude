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
background randomizer. **No real production system, real credentials, or
real company/customer data is read, written, or connected to anywhere in
this project.** This is a deliberate architecture choice required by the
contest rules, not a limitation: the only live network call this app ever
makes is to the Claude API, to power the two agents.

## Demo scenario

A simulated SRE Agent monitors the environment and triages incoming
incidents by calling the five tool sources. When it finds a root cause, it
hands off to a Remediation Agent, which proposes and applies a fix (a
simulated state change only). Every tool call and every Claude API call
from both agents is routed through the LoopSentinel gateway.

A one-click scripted scenario (**Overview → Trigger scenario**) forces a
deployment into `CrashLoopBackOff` with logs that repeatedly implicate a
healthy upstream service — a red herring. The SRE Agent's investigation is
primed (via the incident brief, not a hidden instruction to the detector)
to re-verify that upstream service's metrics more than once before
concluding. LoopSentinel's detector — which knows nothing about this
scenario — sees the same tool call with the same arguments repeated and
pauses the session for human review, with the exact repeated call visible
in the session drill-down.

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
               (incidents) (alerts/     (5 clusters ×   (20 topics) (5 static
                            metrics)     30 deployments)             docs)
               all five: in-memory state, background-randomized, synthetic
```

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
  src/scenario/        crashLoopScenario.js (Phase 4 scripted demo)
  src/routes/          api.js
  src/db.js            SQLite schema + connection
client/               React dashboard (Vite)
  src/pages/            Login, Overview, Sessions, Clusters
  src/components/       TopBar, IncidentFeed, ClusterHealthGrid, ...
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
| `HOURLY_BUDGET_USD` | Hard rolling-hour cost ceiling across all sessions. |

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

## Deployment

The production build is a single Node process (`npm run build && npm
start`) serving both the API and the static frontend on one port — this is
enough to deploy to any standard Node host (Render, Railway, Fly.io,
a VM, etc.) as-is: set `ANTHROPIC_API_KEY` (and optionally the other env
vars above) in the host's environment/secret manager, run the same two
commands, and expose `PORT`. No external database or other infrastructure
is required — SQLite is a local file.
