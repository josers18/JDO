import { useEffect, useRef, useState } from 'react';
import { embedAgentforceClient } from '@salesforce/agentforce-conversation-client';
import { orgCoreOrigin } from '../data/orgEnv';

/** A selectable Agentforce agent (Employee Agent) in jdo-1lrnov. */
export interface AgentOption {
  /** BotDefinition Id (`0Xx…`) passed to ACC as `agentId`. */
  id: string;
  label: string;
}

/**
 * The org's employee agents, offered in the FAB's agent switcher. IDs verified
 * live (`SELECT Id, DeveloperName, MasterLabel FROM BotDefinition WHERE
 * AgentType='AgentforceEmployeeAgent'`). Cumulus Assistant is the default.
 */
export const CUMULUS_AGENTS: AgentOption[] = [
  { id: '0Xxam000000tfCDCAY', label: 'Cumulus Assistant' },
  { id: '0Xxam000000te4rCAA', label: 'Financial Advisor' },
  { id: '0Xxam000000tlG1CAI', label: 'Data Cloud Agent' },
  { id: '0Xxam000000sejdCAA', label: 'Analytics & Visualization' },
];

/** sessionStorage key holding the user's last-picked agent for this tab. */
const AGENT_CHOICE_KEY = 'cumulus.agentId';

/** Read the persisted agent choice (per tab), guarding no-storage envs. */
function readSavedAgentId(): string | null {
  try {
    return window.sessionStorage.getItem(AGENT_CHOICE_KEY);
  } catch {
    return null;
  }
}

/** Build the ACC client config for a given agent. Extracted so the initial
 *  embed and a re-embed on switch produce byte-identical shape (only agentId /
 *  labels differ). */
function buildAccConfig(agentId: string, agentLabel: string, placeholder?: string) {
  return {
    agentId,
    agentLabel,
    ...(placeholder ? { messageInputPlaceholderText: placeholder } : {}),
    renderingConfig: {
      mode: 'floating' as const,
      // Roomier than the default panel so long, formatted answers (product
      // overviews, tables) have space to breathe. Floating mode has no
      // fullscreen flag — width/height is the supported lever.
      width: 460,
      height: 680,
      showHeaderIcon: true,
      headerIconName: 'utility:agent',
    },
    floatingButtonLabel: 'Agentforce',
    floatingButtonIcon: 'utility:agent',
    // Theme the FAB + header to the Aurora pink AI accent.
    styleTokens: {
      fabBackground: '#ec4899',
      fabForegroundColor: '#ffffff',
      headerBlockBackground: '#ec4899',
      headerBlockTextColor: '#ffffff',
      headerBlockIconColor: '#ffffff',
      headerBlockFontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif",
    },
  };
}

/**
 * Real Agentforce chat, embedded via the official Agentforce Conversation
 * Client (Lightning Out 2.0). This is the supported React-native path for a
 * Multi-Framework UI bundle — it reuses the app's authenticated Salesforce
 * session (`salesforceOrigin`), so no Connected App / OAuth dance is needed.
 *
 * Renders in FLOATING mode: the client manages its own pink FAB + chat panel.
 * The FAB is themed with `styleTokens` to the Cumulus Aurora AI color
 * (pink #ec4899 — the reserved AI accent), so it reads as the one AI entry
 * point across the cockpit.
 *
 * AGENT SWITCHING is done by RE-EMBEDDING: picking an agent updates `activeId`,
 * which re-runs the embed effect — it tears down the current client
 * (`loApp.remove()` + clear the container) and mounts a fresh one for the new
 * agentId. This genuinely re-initializes the conversation (verified live: each
 * agent opens with its OWN greeting, not just a relabeled header). The subtlety
 * is Lightning Out's GLOBAL component registry: tearing one embed down and
 * mounting the next in the SAME tick races deregistration ("already registered
 * to another App" → the new session never establishes). One `requestAnimation-
 * Frame` between teardown and re-embed lets the registry settle, so the switch
 * lands a live session. (A pure in-place `configuration` prop swap does NOT
 * work — ACC's inner LWC reads `configuration` only once at mount to open the
 * session, so reassigning it later leaves the conversation on the old agent.)
 * The choice is persisted so a hard refresh keeps it. We render our OWN compact
 * selector (the ACC panel chrome is a cross-origin iframe we can't inject
 * into); it docks to the panel's top edge while open and collapses to a dot by
 * the FAB closed.
 *
 * CONTEXT: ACC v11.4.5 has NO context-injection channel — verified against both
 * the type surface and the built bundle (only outbound accready/min/max events,
 * no postMessage/send API), and the iframe is cross-origin so its input DOM is
 * unreachable. The honest ceiling is priming the visible chrome: header label +
 * input placeholder, so the panel opens scoped to the record.
 *
 * Docs: https://developer.salesforce.com/docs/platform/multiframework/guide/reactdev-acc.html
 */
export function AgentforceChat({
  agentId,
  agentLabel = 'Cumulus Assistant',
  agents = CUMULUS_AGENTS,
  contextLabel,
}: {
  /** Default agent for this page; overridden by a persisted user choice. */
  agentId?: string;
  agentLabel?: string;
  /** Agents offered in the switcher; a single entry hides the selector. */
  agents?: AgentOption[];
  /**
   * Optional record context (e.g. the current client's name on Customer 360).
   * Primes the visible chrome only (see CONTEXT note above) — the agent is not
   * silently told which record is open.
   */
  contextLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // A persisted user choice (from a prior switch) wins over the page default.
  const savedId = readSavedAgentId();
  const initialId =
    (savedId && agents.some(a => a.id === savedId) ? savedId : undefined) ??
    agentId ??
    agents[0]?.id ??
    '';
  const [activeId, setActiveId] = useState(initialId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const active = agents.find(a => a.id === activeId);
  const baseLabel = active?.label ?? agentLabel;
  const headerLabel = contextLabel ? `${baseLabel} · ${contextLabel}` : baseLabel;
  const placeholder = contextLabel ? `Ask about ${contextLabel}…` : undefined;

  // Embed the ACC client, re-embedding whenever the active agent (or its
  // primed labels) change. Re-embedding is what actually switches the agent's
  // conversation — see the RE-EMBED note in the component doc above.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeId) return;
    // Narrow once here so the nested embed() closure keeps the non-null type.
    const el: HTMLElement = container;

    let loApp: { remove?: () => void } | undefined;
    let cancelled = false;
    // Cross-origin Lightning Out registers the ACC web-component tag in a
    // GLOBAL registry; tearing one embed down and mounting the next in the same
    // tick races deregistration ("already registered to another App" → the new
    // agent's session never establishes). One rAF between teardown and re-embed
    // lets the registry settle, so switching agents lands a live session.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      embed();
    });

    function embed() {
      try {
        const result = embedAgentforceClient({
          container: el,
          salesforceOrigin: orgCoreOrigin(),
          agentforceClientConfig: buildAccConfig(activeId, headerLabel, placeholder),
          onError: (err: { type: string; detail: unknown }) => {
            // Keep failures quiet in the UI; surface in console for debugging.
            // eslint-disable-next-line no-console
            console.warn('[AgentforceChat] Lightning Out error', err.type, err.detail);
          },
        });
        loApp = result.loApp as unknown as { remove?: () => void };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AgentforceChat] failed to embed', e);
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        loApp?.remove?.();
      } catch {
        /* ignore */
      }
      container?.replaceChildren();
    };
  }, [activeId, headerLabel, placeholder]);

  // Track the ACC panel's open/closed state so the picker can dock to the
  // panel's top edge when open and shrink to the FAB dot when closed. ACC fires
  // accmaximize/accminimize as NON-bubbling CustomEvents on the inner
  // .acc-frame — a CAPTURING listener on our container still receives them
  // (capture phase traverses ancestors regardless of the bubbles flag).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMax = () => setPanelOpen(true);
    const onMin = () => setPanelOpen(false);
    container.addEventListener('accmaximize', onMax, true);
    container.addEventListener('accminimize', onMin, true);
    return () => {
      container.removeEventListener('accmaximize', onMax, true);
      container.removeEventListener('accminimize', onMin, true);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} data-testid="agentforce-chat" />
      {agents.length > 1 && (
        <AgentPicker
          agents={agents}
          activeId={activeId}
          open={pickerOpen}
          panelOpen={panelOpen}
          onToggle={() => setPickerOpen(o => !o)}
          onPick={id => {
            setPickerOpen(false);
            if (id === activeId) return;
            // Persist so a later hard refresh keeps this agent.
            try {
              window.sessionStorage.setItem(AGENT_CHOICE_KEY, id);
            } catch {
              /* ignore no-storage */
            }
            // Re-embed the client for the new agent (the embed effect keys on
            // activeId). This re-initializes the conversation to the new agent.
            setActiveId(id);
          }}
        />
      )}
    </>
  );
}

/**
 * Compact agent selector for the floating ACC client. Two positions, driven by
 * whether the ACC panel is open:
 *   • panel CLOSED → a small pink dot tucked just above the FAB (bottom-right),
 *     expanding to the agent name on hover. Minimal footprint, no overlap.
 *   • panel OPEN → docked to the panel's TOP edge as a header-style chip, so it
 *     reads as an in-panel "switch agent" control (the ACC header itself is a
 *     cross-origin iframe we can't inject into, so we sit just above it).
 * Picking an agent persists the choice and re-embeds the client (which
 * re-initializes the conversation for the new agent).
 */
function AgentPicker({
  agents,
  activeId,
  open,
  panelOpen,
  onToggle,
  onPick,
}: {
  agents: AgentOption[];
  activeId: string;
  open: boolean;
  /** True while the ACC chat panel is maximized (drives docked positioning). */
  panelOpen: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const active = agents.find(a => a.id === activeId);
  // Expanded (pill vs. dot) whenever docked to the panel, the list is open,
  // or the user is hovering the collapsed dot.
  const expanded = panelOpen || open || hover;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'fixed',
        // Panel open: dock to the top edge of the 700px-tall panel (bottom:24),
        // so the chip floats just above the ACC header. Panel closed: sit at
        // the FAB's top edge, small and right-anchored (no content overlap).
        right: 24,
        bottom: panelOpen ? 24 + 700 + 8 : 82,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif",
        transition: 'bottom 300ms ease',
      }}
    >
      {open && (
        <ul
          role="listbox"
          aria-label="Choose agent"
          style={{
            listStyle: 'none',
            margin: 0,
            // List drops BELOW the chip when docked to the panel top, else
            // rises above the dot near the FAB.
            marginBottom: panelOpen ? 0 : 8,
            marginTop: panelOpen ? 8 : 0,
            order: panelOpen ? 2 : 0,
            padding: 6,
            minWidth: 210,
            background: 'rgba(255,255,255,0.97)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          {agents.map(a => {
            const isActive = a.id === activeId;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => onPick(a.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '0.5rem 0.65rem',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.86rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#be185d' : '#1f2937',
                    background: isActive ? 'rgba(236,72,153,0.12)' : 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: isActive ? '#ec4899' : 'rgba(0,0,0,0.2)',
                    }}
                  />
                  {a.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Agent: ${active?.label ?? 'select'}. Choose agent`}
        onClick={onToggle}
        title={`Agent: ${active?.label ?? 'select'}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          // Collapsed: a bare dot (~26px). Expanded: pill with the agent name.
          gap: expanded ? 8 : 0,
          height: 26,
          padding: expanded ? '0 10px 0 8px' : 0,
          width: expanded ? 'auto' : 26,
          justifyContent: 'center',
          border: `1px solid rgba(236,72,153,${expanded ? 0.35 : 0.55})`,
          borderRadius: 999,
          cursor: 'pointer',
          background: expanded ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.9)',
          color: '#be185d',
          fontSize: '0.76rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          boxShadow: expanded ? '0 6px 18px rgba(0,0,0,0.14)' : '0 2px 8px rgba(0,0,0,0.12)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          transition: 'width 160ms ease, padding 160ms ease, gap 160ms ease, box-shadow 160ms ease',
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 9, height: 9, borderRadius: 999, background: '#ec4899', flexShrink: 0 }}
        />
        {expanded && (
          <>
            {active?.label ?? 'Agent'}
            <span aria-hidden="true" style={{ fontSize: '0.68rem', opacity: 0.7 }}>{open ? '▾' : '▸'}</span>
          </>
        )}
      </button>
    </div>
  );
}
