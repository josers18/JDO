import { useEffect, useState } from 'react';
import { fetchCurrentUser, type CurrentUser } from '../data/crmWriteClient';

/**
 * The signed-in Salesforce user (`GET /crm/whoami`), fetched once per page load
 * and shared by every caller (rail footer, email sign-off, …). Returns null
 * while loading or when the lookup fails, and callers render without a name
 * rather than substituting a placeholder identity.
 */
let cached: Promise<CurrentUser | null> | null = null;

function loadCurrentUser(): Promise<CurrentUser | null> {
  if (!cached) {
    cached = fetchCurrentUser().then(u => {
      if (!u) cached = null; // allow a later mount to retry a failed lookup
      return u;
    });
  }
  return cached;
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    let alive = true;
    loadCurrentUser().then(u => { if (alive) setUser(u); });
    return () => { alive = false; };
  }, []);
  return user;
}
