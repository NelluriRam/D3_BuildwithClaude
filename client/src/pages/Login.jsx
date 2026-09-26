import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, isAuthed } from '../auth.js';

export default function Login() {
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthed()) navigate('/', { replace: true });
  }, [navigate]);

  function handleSignIn() {
    signIn();
    navigate('/', { replace: true });
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">LoopSentinel</div>
        <p className="login-tagline">Runtime monitoring and circuit-breaker layer for AI agents.</p>
        <button type="button" className="btn btn-primary btn-block" onClick={handleSignIn}>
          Sign in with SSO
        </button>
        <p className="login-mock-note">Demo SSO — no real authentication.</p>
      </div>
    </div>
  );
}
