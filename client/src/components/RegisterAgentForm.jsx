import React from 'react';
import { api } from '../api.js';

export default function RegisterAgentForm({ onRegistered }) {
  const [name, setName] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [error, setError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.registerAgent(name, purpose);
      setName('');
      setPurpose('');
      onRegistered?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Register a new agent</h2>
        <span className="panel-subtle">Onboard a custom agent for LoopSentinel to monitor</span>
      </div>
      <form className="org-settings-row" onSubmit={handleSubmit}>
        <label className="org-name-input">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Billing Reconciliation Bot"
            required
          />
        </label>
        <label className="org-name-input">
          One-line purpose
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Reconciles nightly payment batches"
          />
        </label>
        <button type="submit" className="btn btn-primary org-settings-save" disabled={saving}>
          {saving ? 'Registering…' : 'Register agent'}
        </button>
      </form>
      {error && <p className="plain-caption" style={{ color: 'var(--accent)' }}>{error}</p>}
      <p className="plain-caption">
        Registering an agent here does not connect LoopSentinel to any real system. Once registered, its
        "Simulate activity" button below runs one synthetic investigation through the exact same gateway
        (loop detection, budget enforcement, grounding check) that the built-in SRE, Remediation, and
        Verification agents use — demonstrating that LoopSentinel's protection applies to any agent you
        register, not just the three built-in ones.
      </p>
    </section>
  );
}
