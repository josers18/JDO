import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * A pinned-account request raised from the sidebar. The sidebar knows only a
 * client's name/id; the page turns that into a full ClientSelection payload
 * (it owns the book data). So the shared channel carries the *request*, not the
 * rendered selection — the page reads `pinnedRequest` and resolves it.
 */
export interface PinnedClientRequest {
  id?: string;
  name: string;
  /** Bumped on every pin click so re-selecting the same client re-fires. */
  nonce: number;
}

interface WorkspaceSelectionValue {
  pinnedRequest: PinnedClientRequest | null;
  selectClient: (name: string, id?: string) => void;
  clear: () => void;
}

const WorkspaceSelectionContext = createContext<WorkspaceSelectionValue | null>(null);

/**
 * Bridges the left sidebar's pinned-accounts block (which lives in the
 * per-persona layout, outside HomePage) to HomePage's right context panel.
 * Keeping the bridge in a shared context lets HomePage stay byte-identical
 * across the three persona bundles — neither side imports the other.
 */
export function WorkspaceSelectionProvider({ children }: { children: ReactNode }) {
  const [pinnedRequest, setPinnedRequest] = useState<PinnedClientRequest | null>(null);

  const value = useMemo<WorkspaceSelectionValue>(
    () => ({
      pinnedRequest,
      selectClient: (name, id) =>
        setPinnedRequest(prev => ({ id, name, nonce: (prev?.nonce ?? 0) + 1 })),
      clear: () => setPinnedRequest(null),
    }),
    [pinnedRequest],
  );

  return <WorkspaceSelectionContext.Provider value={value}>{children}</WorkspaceSelectionContext.Provider>;
}

/**
 * Read the workspace-selection bridge. Returns a no-op fallback when no
 * provider is mounted, so a bundle that hasn't wired the sidebar bridge (or a
 * unit test) still renders — the pinned-accounts block simply does nothing.
 */
export function useWorkspaceSelection(): WorkspaceSelectionValue {
  return (
    useContext(WorkspaceSelectionContext) ?? {
      pinnedRequest: null,
      selectClient: () => {},
      clear: () => {},
    }
  );
}
