import React from 'react';
import { api } from '../api.js';
import { usePolling } from '../hooks/usePolling.js';

// Live "calling X tool... analyzing..." stream. Every line here is derived
// directly from a real row LoopSentinel logged for a real tool call or a
// real Claude API call -- nothing here is scripted or fabricated text.
export default function ActivityFeed() {
  const { data: activity, loading } = usePolling(() => api.activity(50), 1500);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity]);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Live agent activity</h2>
        <span className="panel-subtle">every line is a real logged gateway call</span>
      </div>
      {loading && !activity ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <div className="activity-feed" ref={scrollRef}>
          {(activity ?? []).length === 0 && <div className="empty-state">No agent activity yet.</div>}
          {(activity ?? []).map((a) => (
            <div key={a.id} className={`activity-line${a.flagged ? ' is-flagged' : ''}`}>
              <span className="activity-time mono">{new Date(a.timestamp).toLocaleTimeString()}</span>
              <span className="activity-agent mono">{a.agentType}</span>
              <span className="activity-incident mono">{a.incidentId ?? '—'}</span>
              <span className="activity-text mono">{a.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
