import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CommandRailPinned } from '../CommandRail';

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

/**
 * A section-navigation request raised from the CommandRail. In the cockpit view
 * some rail targets (schedule / pipeline / life events / leads / alerts) no
 * longer exist as scroll anchors — their content moved into drill-in modals. So
 * the rail raises the *intent* ("navigate to leads") and the page decides how to
 * honor it (open the matching DataExplorerModal). Classic view still has the
 * anchors, so the rail scrolls there and this channel never fires.
 */
export interface SectionNavRequest {
  id: string;
  /** Bumped on every click so re-requesting the same section re-fires. */
  nonce: number;
}

interface WorkspaceSelectionValue {
  pinnedRequest: PinnedClientRequest | null;
  /** Select a client into the right context panel (does NOT add to the rail). */
  selectClient: (name: string, id?: string) => void;
  clear: () => void;
  /** A rail nav target with no on-page anchor (cockpit) — page opens a modal. */
  navRequest: SectionNavRequest | null;
  /** Raise a nav request for a section id (bumps the nonce). */
  requestNav: (id: string) => void;
  /** The live pinned-accounts list shown in the CommandRail. */
  pinned: CommandRailPinned[];
  /** Whether an account (matched by id when present, else name) is pinned. */
  isPinned: (item: { id?: string; name: string }) => boolean;
  /** Add the account to the rail if absent, remove it if present. Persisted. */
  togglePin: (item: CommandRailPinned) => void;
}

const WorkspaceSelectionContext = createContext<WorkspaceSelectionValue | null>(null);

/** Two accounts are the same pin when their ids match, or (id absent) names match. */
const samePin = (a: { id?: string; name: string }, b: { id?: string; name: string }) =>
  a.id && b.id ? a.id === b.id : a.name === b.name;

/**
 * Bridges the left sidebar's pinned-accounts block (which lives in the
 * per-persona layout, outside HomePage) to HomePage's right context panel, and
 * OWNS the pinned-accounts list. Keeping both in a shared context lets HomePage
 * stay byte-identical across the three persona bundles — neither side imports
 * the other.
 *
 * The pinned list seeds from `initialPinned` and persists to localStorage under
 * `storageKey` (persona-scoped), so a banker's pins survive reloads. A pin's
 * identity is its id (or name when id-less), so re-seeding never duplicates a
 * pin the user already toggled.
 */
export function WorkspaceSelectionProvider({
  children,
  initialPinned = [],
  storageKey,
}: {
  children: ReactNode;
  initialPinned?: CommandRailPinned[];
  /** localStorage key for this persona's pins. Omit to disable persistence. */
  storageKey?: string;
}) {
  const [pinnedRequest, setPinnedRequest] = useState<PinnedClientRequest | null>(null);
  const [navRequest, setNavRequest] = useState<SectionNavRequest | null>(null);

  // Hydrate from localStorage once (falling back to the seed), then persist on
  // change. Reads are guarded — storage can throw in sandboxed frames.
  const [pinned, setPinned] = useState<CommandRailPinned[]>(() => {
    if (storageKey && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as CommandRailPinned[];
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        /* corrupt/unavailable storage → fall through to the seed */
      }
    }
    return initialPinned;
  });

  useEffect(() => {
    if (!storageKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(pinned));
    } catch {
      /* quota/unavailable → in-memory only for this session */
    }
  }, [storageKey, pinned]);

  const isPinned = useCallback(
    (item: { id?: string; name: string }) => pinned.some(p => samePin(p, item)),
    [pinned],
  );

  const togglePin = useCallback((item: CommandRailPinned) => {
    setPinned(prev =>
      prev.some(p => samePin(p, item)) ? prev.filter(p => !samePin(p, item)) : [...prev, item],
    );
  }, []);

  const value = useMemo<WorkspaceSelectionValue>(
    () => ({
      pinnedRequest,
      selectClient: (name, id) =>
        setPinnedRequest(prev => ({ id, name, nonce: (prev?.nonce ?? 0) + 1 })),
      clear: () => setPinnedRequest(null),
      navRequest,
      requestNav: id => setNavRequest(prev => ({ id, nonce: (prev?.nonce ?? 0) + 1 })),
      pinned,
      isPinned,
      togglePin,
    }),
    [pinnedRequest, navRequest, pinned, isPinned, togglePin],
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
      navRequest: null,
      requestNav: () => {},
      pinned: [],
      isPinned: () => false,
      togglePin: () => {},
    }
  );
}
