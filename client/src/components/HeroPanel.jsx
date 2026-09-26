import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

// Composes three already-computed metrics (cost saved, time-to-detect,
// unsupported claims caught) into one narrative strip. No new computation
// lives here -- it's a display/composition layer over
// GET /api/metrics/cost-saved, GET /api/metrics/time-to-detect, and
// GET /api/metrics/unsupported-claims, all of which already existed.

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

export default function HeroPanel() {
  const { data: costSaved } = usePolling(api.costSaved, 5000);
  const { data: ttd } = usePolling(api.timeToDetect, 5000);
  const { data: claims } = usePolling(api.unsupportedClaims, 5000);

  const [agentsInProd, setAgentsInProd] = React.useState(10);
  const [sessionsPerAgentPerDay, setSessionsPerAgentPerDay] = React.useState(20);

  const loaded = costSaved && ttd && claims;
  const sessionCount = ttd?.sampleCount ?? 0;
  const costAvoided = costSaved?.costSavedThisPeriod ?? 0;
  const avgDetect = formatSeconds(ttd?.averageSeconds);
  const unsupportedCount = claims?.unsupportedClaimsToday ?? 0;

  // Illustrative projection only -- reuses the same costSavedThisPeriod /
  // sessionCount this demo has actually measured, no new scoring logic.
  const avgCostAvoidedPerSession = sessionCount > 0 ? costAvoided / sessionCount : null;
  const projectedAnnualSavings =
    avgCostAvoidedPerSession !== null
      ? avgCostAvoidedPerSession * Math.max(0, sessionsPerAgentPerDay) * Math.max(0, agentsInProd) * 365
      : null;

  return (
    <section className="panel hero-panel">
      <div className="panel-header">
        <h2>Business impact — last 24 hours</h2>
        <span className="panel-subtle">composed from the metrics below, computed live</span>
      </div>

      <div className="hero-stats">
        <div className="hero-stat">
          <div className="hero-stat-value">{sessionCount}</div>
          <div className="hero-stat-label">runaway sessions paused</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">${costAvoided.toFixed(2)}</div>
          <div className="hero-stat-label">estimated cost avoided</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">{avgDetect ?? '—'}</div>
          <div className="hero-stat-label">avg. time to detect</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">{unsupportedCount}</div>
          <div className="hero-stat-label">unsupported claims caught</div>
        </div>
      </div>

      <p className="hero-sentence">
        {!loaded && 'Loading business impact summary…'}
        {loaded && sessionCount === 0 &&
          `In the last 24 hours, LoopSentinel hasn't had to pause a runaway session yet — it's watching every agent call live. ${
            unsupportedCount > 0
              ? `Separately, it has already flagged ${unsupportedCount} unsupported claim${unsupportedCount === 1 ? '' : 's'} before ${unsupportedCount === 1 ? 'it' : 'they'} reached a final report.`
              : 'No unsupported claims have been flagged yet either.'
          }`}
        {loaded && sessionCount > 0 &&
          `In the last 24 hours, LoopSentinel paused ${sessionCount} runaway session${sessionCount === 1 ? '' : 's'}, avoiding an estimated $${costAvoided.toFixed(2)} in unchecked spend, caught ${sessionCount === 1 ? 'it' : 'them'} in an average of ${avgDetect ?? 'n/a'}, and flagged ${unsupportedCount} unsupported claim${unsupportedCount === 1 ? '' : 's'} before ${unsupportedCount === 1 ? 'it' : 'they'} reached a final report.`}
      </p>

      <div className="roi-calculator">
        <div className="roi-calculator-header">
          <span className="call-detail-label">Illustrative ROI projection</span>
          <span className="panel-subtle">adjustable assumptions — not a guarantee</span>
        </div>
        <div className="roi-inputs">
          <label className="roi-input">
            <span>Agents in production</span>
            <input
              type="number"
              min="0"
              value={agentsInProd}
              onChange={(e) => setAgentsInProd(Number(e.target.value))}
            />
          </label>
          <label className="roi-input">
            <span>Avg. sessions / agent / day</span>
            <input
              type="number"
              min="0"
              value={sessionsPerAgentPerDay}
              onChange={(e) => setSessionsPerAgentPerDay(Number(e.target.value))}
            />
          </label>
          <div className="roi-result">
            <div className="roi-result-value">
              {projectedAnnualSavings !== null ? `$${formatMoney(projectedAnnualSavings)}` : '—'}
            </div>
            <div className="roi-result-label">projected annual savings</div>
          </div>
        </div>
        <p className="roi-caption">
          {avgCostAvoidedPerSession !== null
            ? `Illustrative projection only, not a guarantee: (avg cost avoided per flagged session measured so far, $${avgCostAvoidedPerSession.toFixed(2)}) × sessions/agent/day × agents × 365 days. Assumes every session carries the same average risk this demo has observed so far — adjust the inputs above to your own assumptions.`
            : 'This demo hasn’t paused a flagged session yet, so there’s no measured average to project from. Once one occurs, this calculator uses that real figure — it never invents one.'}
        </p>
      </div>
    </section>
  );
}
