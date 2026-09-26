import React from 'react';
import SessionsTable from '../components/SessionsTable.jsx';
import SessionDrilldown from '../components/SessionDrilldown.jsx';

export default function Sessions() {
  const [selectedId, setSelectedId] = React.useState(null);

  return (
    <div className="page-grid">
      <SessionsTable selectedId={selectedId} onSelect={setSelectedId} />
      <SessionDrilldown sessionId={selectedId} />
    </div>
  );
}
