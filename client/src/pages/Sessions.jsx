import React from 'react';
import SessionsTable from '../components/SessionsTable.jsx';
import SessionDrilldown from '../components/SessionDrilldown.jsx';
import { api } from '../api.js';

export default function Sessions() {
  const [selectedId, setSelectedId] = React.useState(null);

  return (
    <div className="page-grid">
      <div className="page-toolbar">
        <a
          className="btn btn-small"
          href={api.exportAuditLogUrl()}
          download
          title="Downloads the full logged call history (timestamp, agent, tool, arguments, response summary, flags raised, signal strength, cost) for every session as CSV."
        >
          Export audit log (all sessions)
        </a>
      </div>
      <SessionsTable selectedId={selectedId} onSelect={setSelectedId} />
      <SessionDrilldown sessionId={selectedId} />
    </div>
  );
}
