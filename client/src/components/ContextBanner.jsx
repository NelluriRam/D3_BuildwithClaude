import React from 'react';
import { useOrgConfig } from '../orgConfig.js';

const STORAGE_KEY = 'loopsentinel.contextBannerDismissed';

export default function ContextBanner() {
  const { orgName } = useOrgConfig();
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="context-banner">
      <p>
        AI agents at {orgName} don't fail loudly — they can loop, re-check the same evidence, or fan
        out into sub-agents for hours or days while every individual tool call still looks successful
        and dashboards stay green. Real incidents like this have run up tens of thousands of dollars
        in unchecked spend before anyone noticed. LoopSentinel watches every call an agent makes and
        pauses it the moment a pattern like that starts, instead of finding out afterward.
      </p>
      <button type="button" className="context-banner-dismiss" onClick={handleDismiss}>
        Dismiss
      </button>
    </section>
  );
}
