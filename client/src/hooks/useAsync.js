import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAsync(loader, deps) — loading / error / data triple with refetch.
 * The loader receives an AbortSignal-like `{ cancelled }` guard through the
 * returned promise being ignored after unmount.
 */
export function useAsync(loader, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: immediate });
  const alive = useRef(true);
  const seq = useRef(0);

  const run = useCallback(
    async (...args) => {
      const id = ++seq.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await loader(...args);
        if (alive.current && id === seq.current) setState({ data, error: null, loading: false });
        return data;
      } catch (error) {
        if (alive.current && id === seq.current) setState((s) => ({ data: s.data, error, loading: false }));
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    alive.current = true;
    if (immediate) run().catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [run, immediate]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, refetch: run, setData };
}
