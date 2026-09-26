import React from 'react';

const STEPS = [
  'An incident occurs (simulated — a deployment crash-loops, an alert fires, etc).',
  'The SRE Agent investigates it using real tool calls: logs, metrics, deployment status, internal docs.',
  'LoopSentinel sits between the agent and every one of those calls, logging each one and checking it against deterministic loop patterns as it happens.',
  'If the agent gets stuck repeating itself, fans out too far, overspends, or its final report states something the evidence never actually showed, LoopSentinel pauses the session and shows exactly which call and why.',
  'That pause is the real time and cost avoided — the numbers at the top of this page are computed from these actual paused sessions, not made up.',
];

export default function WalkthroughToggle() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="walkthrough">
      <button type="button" className="walkthrough-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide walkthrough' : 'What am I looking at?'}
      </button>
      {open && (
        <ol className="walkthrough-steps">
          {STEPS.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
