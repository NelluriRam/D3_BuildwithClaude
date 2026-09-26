import React from 'react';
import ClusterHealthGrid from '../components/ClusterHealthGrid.jsx';
import DeploymentsTable from '../components/DeploymentsTable.jsx';

export default function Clusters() {
  const [selectedCluster, setSelectedCluster] = React.useState(null);

  return (
    <div className="page-grid">
      <ClusterHealthGrid onSelectCluster={setSelectedCluster} selectedCluster={selectedCluster} />
      <DeploymentsTable clusterId={selectedCluster} />
    </div>
  );
}
