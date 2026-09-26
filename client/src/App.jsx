import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Sessions from './pages/Sessions.jsx';
import Clusters from './pages/Clusters.jsx';
import Agents from './pages/Agents.jsx';
import TopBar from './components/TopBar.jsx';
import { isAuthed } from './auth.js';

function RequireAuth({ children }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return children;
}

function AuthedLayout({ children }) {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="page">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AuthedLayout>
                <Overview />
              </AuthedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/sessions"
          element={
            <RequireAuth>
              <AuthedLayout>
                <Sessions />
              </AuthedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/clusters"
          element={
            <RequireAuth>
              <AuthedLayout>
                <Clusters />
              </AuthedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/agents"
          element={
            <RequireAuth>
              <AuthedLayout>
                <Agents />
              </AuthedLayout>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
