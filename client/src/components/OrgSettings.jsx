import React from 'react';
import { useOrgConfig, setOrgConfig, ORG_CONFIG_DEFAULTS } from '../orgConfig.js';
import ScaleInputs from './ScaleInputs.jsx';

// Client-side-only personalization: organization name + the same scale
// inputs the ROI calculator uses (ScaleInputs.jsx, shared state). Nothing
// here touches the backend -- it's stored in localStorage and just changes
// how the existing numbers are labeled.
export default function OrgSettings() {
  const [open, setOpen] = React.useState(false);
  const config = useOrgConfig();
  const [nameDraft, setNameDraft] = React.useState(config.orgName);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setNameDraft(config.orgName);
  }, [config.orgName]);

  function handleSave(e) {
    e.preventDefault();
    setOrgConfig({ orgName: nameDraft.trim() || ORG_CONFIG_DEFAULTS.orgName });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="walkthrough">
      <button type="button" className="walkthrough-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide organization settings' : 'Configure for your organization'}
      </button>
      {open && (
        <form className="org-settings-panel" onSubmit={handleSave}>
          <div className="call-detail-label">Organization</div>
          <div className="org-settings-row">
            <label className="roi-input org-name-input">
              <span>Organization name</span>
              <input
                type="text"
                value={nameDraft}
                placeholder={ORG_CONFIG_DEFAULTS.orgName}
                onChange={(e) => setNameDraft(e.target.value)}
              />
            </label>
            <ScaleInputs />
            <button type="submit" className="btn btn-small org-settings-save">
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="example-note">
            Stored only in this browser (localStorage) — no account, no backend. Used purely to label the numbers
            already on this page (e.g. "{nameDraft.trim() || ORG_CONFIG_DEFAULTS.orgName}'s typical unprotected day");
            it doesn't change what's measured.
          </p>
        </form>
      )}
    </div>
  );
}
