import React, { createContext, useContext } from 'react';
import { useAsyncData } from './useAsyncData';

/** What the Home dashboard fetch exposes to layout + page (one shared fetch). */
interface HomeDataValue<T> {
  data: T | null;
  loading: boolean;
  /** Re-run the fetch on demand (e.g. after a CRM write); keeps current data on screen. */
  refetch: () => void;
}

/**
 * Builds a persona-specific HomeData context. The `HomeDashboard` type lives in
 * each bundle (src/home/homeTypes.ts) and is NOT shared, so the factory is
 * generic over T and each bundle instantiates it as
 * `createHomeDataContext<HomeDashboard>()`.
 *
 * HomeDataProvider runs a single `useAsyncData(fetch, [])` and provides its
 * result to both HomeLayout and HomePage — one fetch, two consumers — so the
 * layout's CommandRail and the page's cards derive from the same live snapshot.
 */
export function createHomeDataContext<T>(): {
  HomeDataProvider: React.FC<{ fetch: () => Promise<T>; children: React.ReactNode }>;
  useHomeData: () => HomeDataValue<T>;
} {
  const HomeDataContext = createContext<HomeDataValue<T> | null>(null);

  const HomeDataProvider: React.FC<{ fetch: () => Promise<T>; children: React.ReactNode }> = ({
    fetch,
    children,
  }) => {
    const { data, loading, refetch } = useAsyncData(fetch, []);
    return (
      <HomeDataContext.Provider value={{ data, loading, refetch }}>
        {children}
      </HomeDataContext.Provider>
    );
  };

  const useHomeData = (): HomeDataValue<T> => {
    const ctx = useContext(HomeDataContext);
    if (ctx === null) {
      throw new Error('useHomeData must be used within a HomeDataProvider');
    }
    return ctx;
  };

  return { HomeDataProvider, useHomeData };
}
