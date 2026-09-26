import React from 'react';
import { useOrgConfig, setOrgConfig } from '../orgConfig.js';

// The two "rough scale" number inputs (agents in production, avg sessions
// per agent per day) shown both in the org settings panel and inside the
// hero panel's ROI calculator -- one shared component, one shared
// localStorage-backed value (orgConfig.js), so the two surfaces can never
// drift out of sync.
export default function ScaleInputs() {
  const { agentsInProd, sessionsPerAgentPerDay } = useOrgConfig();

  return (
    <>
      <label className="roi-input">
        <span>Agents in production</span>
        <input
          type="number"
          min="0"
          value={agentsInProd}
          onChange={(e) => setOrgConfig({ agentsInProd: Number(e.target.value) })}
        />
      </label>
      <label className="roi-input">
        <span>Avg. sessions / agent / day</span>
        <input
          type="number"
          min="0"
          value={sessionsPerAgentPerDay}
          onChange={(e) => setOrgConfig({ sessionsPerAgentPerDay: Number(e.target.value) })}
        />
      </label>
    </>
  );
}
