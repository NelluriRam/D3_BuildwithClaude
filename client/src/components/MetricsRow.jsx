import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';
import Sparkline from './Sparkline.jsx';

function formatSeconds(s) {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export default function MetricsRow() {
  const { data: costSaved } = usePolling(api.costSaved, 5000);
  const { data: ttd } = usePolling(api.timeToDetect, 5000);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Protection metrics</h2>
        <span className="panel-subtle">computed from logged gateway data</span>
      </div>
      <div className="kpi-row">
        <div className="kpi-tile">
          <div className="kpi-label">Cost saved today</div>
          <div className="kpi-value">
            ${costSaved ? costSaved.costSavedThisPeriod.toFixed(2) : '—'}
          </div>
          <div
            className="kpi-caption"
            title={
              costSaved
                ? `costSavedLastPeriod = average of the last 7 illustrative baseline days = $${costSaved.costSavedLastPeriod.toFixed(2)}. percentChange = (${costSaved.costSavedThisPeriod.toFixed(2)} - ${costSaved.costSavedLastPeriod.toFixed(2)}) / ${costSaved.costSavedLastPeriod.toFixed(2)} * 100`
                : ''
            }
          >
            {costSaved && costSaved.percentChange !== null
              ? `${costSaved.percentChange > 0 ? '+' : ''}${costSaved.percentChange}% vs. illustrative unprotected baseline`
              : 'vs. illustrative unprotected baseline'}
          </div>
          {costSaved?.sparkline && (
            <div className="kpi-sparkline">
              <Sparkline points={costSaved.sparkline} />
            </div>
          )}
        </div>

        <div className="kpi-tile">
          <div className="kpi-label">Avg. time to detect</div>
          <div className="kpi-value">{ttd ? formatSeconds(ttd.averageSeconds) : '—'}</div>
          <div className="kpi-caption">
            {ttd ? `across ${ttd.sampleCount} flagged session${ttd.sampleCount === 1 ? '' : 's'}` : 'no flagged sessions yet'}
          </div>
        </div>
      </div>
      <p className="metrics-footnote">
        "Cost saved" projects each flagged session's own $/sec rate {costSaved?.projectionWindowMinutes ?? 30} minutes forward
        and compares it to what was actually spent before the pause — an estimate, not billing data. The baseline
        comparison is synthetic/illustrative (see the sparkline caption), never real historical billing.
      </p>
    </section>
  );
}
