import { useEffect, useRef, useState, useCallback } from 'react';

export function usePolling(fetcher, intervalMs = 3000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      if (cancelled) return;
      await refresh();
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    }
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh };
}
