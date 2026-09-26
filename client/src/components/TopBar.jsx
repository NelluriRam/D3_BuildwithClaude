import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getUser, signOut } from '../auth.js';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/sessions', label: 'Sessions' },
  { to: '/clusters', label: 'Clusters' },
  { to: '/agents', label: 'Agents' },
];

export default function TopBar() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const user = getUser();
  const ref = React.useRef(null);

  React.useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleSignOut() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand">LoopSentinel</div>
        <nav className="topbar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `topbar-nav-link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user" ref={ref}>
          <button type="button" className="avatar" onClick={() => setOpen((v) => !v)} aria-label="Account menu">
            {user?.initials || '?'}
          </button>
          {open && (
            <div className="avatar-dropdown">
              <div className="avatar-dropdown-name">{user?.name}</div>
              <div className="avatar-dropdown-email">{user?.email}</div>
              <div className="avatar-dropdown-divider" />
              <button type="button" className="avatar-dropdown-item" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
