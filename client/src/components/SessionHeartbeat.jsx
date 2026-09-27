import { useEffect } from 'react';
import { api } from '../api.js';

// Mounted only inside the authenticated layout (see App.jsx). Pings the
// backend every 5s so it knows a signed-in session is open. Closing the
// tab, navigating away, or signing out unmounts this and the pings
// simply stop -- the backend's own 15s window then turns the
// auto-investigation loop back off with no extra "goodbye" signal needed.
export default function SessionHeartbeat() {
  useEffect(() => {
    let cancelled = false;
    const send = () => {
      if (!cancelled) api.heartbeat().catch(() => {});
    };
    send();
    const id = setInterval(send, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return null;
}
