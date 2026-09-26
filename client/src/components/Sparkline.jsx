import React from 'react';

// Minimal inline-SVG sparkline: thin 2px line, muted for illustrative
// baseline points, a single distinguished marker for the live point.
// No external chart library, consistent with the rest of the dashboard.
export default function Sparkline({ points, width = 280, height = 56 }) {
  if (!points || points.length < 2) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0.01);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: height - ((p.value - min) / range) * (height - 8) - 4,
    ...p,
  }));

  const baselinePath = coords
    .filter((c) => c.kind === 'baseline')
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const live = coords.find((c) => c.kind === 'live');
  const lastBaseline = [...coords].reverse().find((c) => c.kind === 'baseline');

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Cost saved trend, last 30 days"
    >
      <path d={baselinePath} fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" />
      {lastBaseline && live && (
        <line
          x1={lastBaseline.x}
          y1={lastBaseline.y}
          x2={live.x}
          y2={live.y}
          stroke="var(--success-border)"
          strokeWidth="2"
          strokeDasharray="2,3"
        />
      )}
      {live && (
        <>
          <circle cx={live.x} cy={live.y} r="4" fill="var(--success)">
            <title>{`${live.date}: $${live.value.toFixed(2)} saved (live)`}</title>
          </circle>
        </>
      )}
      {coords
        .filter((c) => c.kind === 'baseline')
        .filter((_, i, arr) => i === 0 || i === arr.length - 1)
        .map((c) => (
          <circle key={c.date} cx={c.x} cy={c.y} r="2.5" fill="var(--border-strong)">
            <title>{`${c.date}: $${c.value.toFixed(2)} (illustrative baseline)`}</title>
          </circle>
        ))}
    </svg>
  );
}
