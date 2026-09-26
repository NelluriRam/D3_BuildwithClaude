import React from 'react';

// Client-side-only organization personalization: org name + the same
// "scale" assumptions the ROI calculator uses (agents in production, avg
// sessions/agent/day). Persisted to localStorage, no backend involved.
// A single source of truth so the settings panel and the ROI calculator
// read/write the exact same values instead of duplicating state.

const KEY = 'loopsentinel.orgConfig';

export const ORG_CONFIG_DEFAULTS = {
  orgName: 'Your Organization',
  agentsInProd: 10,
  sessionsPerAgentPerDay: 20,
};

const EVENT = 'loopsentinel:orgConfigChanged';

export function getOrgConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...ORG_CONFIG_DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...ORG_CONFIG_DEFAULTS, ...parsed };
  } catch {
    return { ...ORG_CONFIG_DEFAULTS };
  }
}

export function setOrgConfig(partial) {
  const next = { ...getOrgConfig(), ...partial };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore (private browsing, quota, etc) */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  return next;
}

export function useOrgConfig() {
  const [config, setConfig] = React.useState(getOrgConfig);
  React.useEffect(() => {
    function onChange(e) {
      setConfig(e.detail ?? getOrgConfig());
    }
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return config;
}
