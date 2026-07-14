import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAsyncDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the fetcher on demand (e.g. after a CRM write). */
  refetch: () => void;
}

/**
 * Runs an async fetcher on mount and whenever `deps` change. A generation
 * counter + cancellation flag prevent stale/out-of-order updates. Shared by
 * all cockpit components — today backed by mock fetchers, later by
 * executeGraphQL / queryDataCloud with zero call-site change.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [prevDeps, setPrevDeps] = useState(deps);
  if (deps.length !== prevDeps.length || deps.some((d, i) => d !== prevDeps[i])) {
    setPrevDeps(deps);
    setGeneration(g => g + 1);
    if (!loading) setLoading(true);
    if (error !== null) setError(null);
  }

  // Re-run the fetcher without flipping `loading` back to true: the current
  // data stays on screen while the fresh query runs in the background, then
  // swaps in. This is what lets a newly-created task/event appear without the
  // whole page collapsing to a spinner for the ~20s of a live refetch.
  const refetch = useCallback(() => setGeneration(g => g + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetcherRef
      .current()
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'An error occurred');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  return { data, loading, error, refetch };
}
