import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';
import { EXAMPLE_CATCH } from '../data/exampleCatch.js';
import { useOrgConfig } from '../orgConfig.js';
import ScaleInputs from './ScaleInputs.jsx';

// Composes already-computed metrics (cost saved, time-to-detect,
// unsupported claims caught, most-recent-catch) into one narrative strip.
// No new computation lives here -- it's a display/composition layer over
// existing/simple-read endpoints. If nothing has been flagged yet in this
// server run, it falls back first to the most recent real catch (any time,
// not just today) and only then to a clearly-labeled static illustrative
// example, so the page is never a meaningless blank "0" on first load.

function formatSeconds(s) {
  if (s === null || s === undefined) return null;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatMoney(n) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'moments ago';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function HeroPanel() {
  const { data: costSaved } = usePolling(api.costSaved, 5000);
  const { data: ttd } = usePolling(api.timeToDetect, 5000);
  const { data: claims } = usePolling(api.unsupportedClaims, 5000);
  const { data: mostRecentCatch, loading: catchLoading } = usePolling(api.mostRecentCatch, 5000);
  const { orgName, agentsInProd, sessionsPerAgentPerDay } = useOrgConfig();

  const loaded = costSaved && ttd && claims;
  const sessionCount = ttd?.sampleCount ?? 0;
  const hasLiveCatch = sessionCount > 0;

  // Which source is powering the displayed numbers: real live data for
  // this period, a real catch from earlier in this run, or -- only when
  // this run has genuinely never flagged anything -- a static example.
  const source = hasLiveCatch ? 'live' : mostRecentCatch ? 'recent' : 'example';

  const display = hasLiveCatch
    ? {
        sessionCount,
        costAvoided: costSaved?.costSavedThisPeriod ?? 0,
        timeToDetect: formatSeconds(ttd?.averageSeconds),
        unsupportedCount: claims?.unsupportedClaimsToday ?? 0,
      }
    : mostRecentCatch
    ? {
        sessionCount: 1,
        costAvoided: mostRecentCatch.costAvoided,
        timeToDetect: formatSeconds(mostRecentCatch.timeToDetectSeconds),
        unsupportedCount: mostRecentCatch.unsupportedClaimsInSession,
      }
    : {
        sessionCount: 1,
        costAvoided: EXAMPLE_CATCH.costAvoided,
        timeToDetect: formatSeconds(EXAMPLE_CATCH.timeToDetectSeconds),
        unsupportedCount: EXAMPLE_CATCH.unsupportedClaims,
      };

  // Illustrative ROI projection only -- reuses whichever avg cost-avoided
  // figure is already on screen, no new scoring logic.
  const avgCostAvoidedPerSession = display.sessionCount > 0 ? display.costAvoided / display.sessionCount : null;
  const projectedAnnualSavings =
    avgCostAvoidedPerSession !== null
      ? avgCostAvoidedPerSession * Math.max(0, sessionsPerAgentPerDay) * Math.max(0, agentsInProd) * 365
      : null;

  return (
    <section className="panel hero-panel">
      <div className="panel-header">
        <h2>
          Business impact for {orgName} {source === 'live' ? '— last 24 hours' : '— most recent catch'}
        </h2>
        <span className="panel-subtle">
          {source === 'live' && 'composed from the metrics below, computed live'}
          {source === 'recent' && `session ${mostRecentCatch.sessionId} · ${timeAgo(mostRecentCatch.pausedAt)}`}
          {source === 'example' && 'illustrative example — no session has been flagged in this run yet'}
        </span>
      </div>

      {!loaded || catchLoading ? (
        <p className="hero-sentence">Loading business impact summary…</p>
      ) : (
        <>
          {source === 'example' && (
            <p className="example-note">
              Nothing has been paused in this run yet, so the numbers below show what a typical catch looks like
              (from the scripted demo scenario) rather than a blank dashboard. Real numbers will replace this
              automatically the moment LoopSentinel pauses a session.
            </p>
          )}

          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">{display.sessionCount}</div>
              <div className="hero-stat-label">runaway session{display.sessionCount === 1 ? '' : 's'} paused</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">${display.costAvoided.toFixed(2)}</div>
              <div className="hero-stat-label">estimated cost avoided</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">{display.timeToDetect ?? '—'}</div>
              <div className="hero-stat-label">time to detect</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">{display.unsupportedCount}</div>
              <div className="hero-stat-label">unsupported claims caught</div>
            </div>
          </div>

          <p className="hero-sentence">
            {source === 'live' &&
              `In the last 24 hours, LoopSentinel paused ${sessionCount} runaway session${sessionCount === 1 ? '' : 's'}, avoiding an estimated $${display.costAvoided.toFixed(2)} in unchecked spend, caught ${sessionCount === 1 ? 'it' : 'them'} in an average of ${display.timeToDetect ?? 'n/a'}, and flagged ${display.unsupportedCount} unsupported claim${display.unsupportedCount === 1 ? '' : 's'} before ${display.unsupportedCount === 1 ? 'it' : 'they'} reached a final report.`}
            {source === 'recent' &&
              `LoopSentinel's most recent catch (${timeAgo(mostRecentCatch.pausedAt)}) paused session ${mostRecentCatch.sessionId}${mostRecentCatch.topFlag ? ` for ${mostRecentCatch.topFlag.flag_type.replace(/_/g, ' ')}` : ''}, avoiding an estimated $${display.costAvoided.toFixed(2)} in unchecked spend and catching it in ${display.timeToDetect ?? 'n/a'}. No session is currently flagged — this dashboard is showing its last real catch so there's always something concrete to look at.`}
            {source === 'example' &&
              `This illustrative example mirrors the scripted demo scenario: a deployment stuck in CrashLoopBackOff whose logs kept blaming a healthy upstream service, caught after it re-checked the same evidence ${EXAMPLE_CATCH.signalStrength >= 90 ? 'repeatedly' : 'several times'} in ${display.timeToDetect}. Trigger the scenario (Overview panel below) to replace this with a real one.`}
          </p>
        </>
      )}

      <div className="roi-calculator">
        <div className="roi-calculator-header">
          <span className="call-detail-label">Illustrative ROI projection</span>
          <span className="panel-subtle">adjustable assumptions — not a guarantee</span>
        </div>
        <div className="roi-inputs">
          <ScaleInputs />
          <div className="roi-result">
            <div className="roi-result-value">
              {projectedAnnualSavings !== null ? `$${formatMoney(projectedAnnualSavings)}` : '—'}
            </div>
            <div className="roi-result-label">projected annual savings</div>
          </div>
        </div>
        <p className="roi-caption">
          Illustrative projection only, not a guarantee: (avg cost avoided per flagged session{source !== 'live' ? ', from the most recent catch shown above' : ' measured so far'}, $
          {avgCostAvoidedPerSession?.toFixed(2)}) × sessions/agent/day × agents × 365 days. Assumes every {orgName} session
          carries the same average risk as {source === 'live' ? 'this run has measured so far' : 'the example above'} — adjust the inputs to your own assumptions.
        </p>
      </div>
    </section>
  );
}
