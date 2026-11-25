import { useEffect, useRef, useState, type ReactNode } from 'react';
import { embedAgentforceClient, type AgentforceContextVariable, type EmbedAgentforceClientResult } from '@salesforce/agentforce-conversation-client';
import type { PersonaKey } from '../theme/themes';
import { orgCoreOrigin } from '../data/orgEnv';
import { useBrandOverride } from '../theme/activeBrand';
import { buildAiFamily } from '../theme/brandThemes';

/** Baseline Aurora AI accent (pink) — the reserved agentic color when no
 *  custom brand is applied. A custom brand overrides it with its own accent. */
const DEFAULT_AGENT_COLOR = '#ec4899';

/** `#rrggbb` → `{r,g,b}`; falls back to the pink baseline on a malformed hex. */
function agentRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return { r: 236, g: 72, b: 153 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** A translucent tint of `accent` at the given alpha, for backgrounds/borders. */
function agentTint(accent: string, alpha: number): string {
  const { r, g, b } = agentRgb(accent);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A legible-on-white text shade of `accent` (darkened ~35% toward black), for
 *  the selected agent label in the picker (baseline used a dark pink #be185d). */
function agentTextColor(accent: string): string {
  const { r, g, b } = agentRgb(accent);
  const dark = (c: number) => Math.round(c * 0.65);
  return `#${[dark(r), dark(g), dark(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

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
function readSavedAgentId(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Build the ACC client config for a given agent. Extracted so the initial
 *  embed and a re-embed on switch produce byte-identical shape (only agentId /
 *  labels / accent differ). `accent` themes the FAB + header (ACC's styleTokens
 *  take flat hex strings, not CSS vars, since the panel is a cross-origin
 *  iframe — so the brand color is passed in, not read from the cascade). */
function buildAccConfig(agentId: string, agentLabel: string, accent: string, placeholder?: string, inline = false) {
  return {
    agentId,
    agentLabel,
    ...(placeholder ? { messageInputPlaceholderText: placeholder } : {}),
    renderingConfig: inline ? {
      mode: 'inline' as const,
      width: '100%',
      height: '100%',
      headerEnabled: false,
      showAvatar: false,
    } : {
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
    // Theme the FAB + header to the agentic accent (pink baseline, or the
    // active custom brand's accent).
    styleTokens: {
      // ACC stacks its avatar above the body. Paint the same Salesforce mark in
      // the message gutter so wrapped text aligns without moving the native content.
      ...(inline ? {
        messageBlockInboundBackgroundColor: `url("${orgCoreOrigin()}/resource/AtlasAgentforceAvatar") 0.5rem 0.68rem / 1.25rem 1.25rem no-repeat`,
        messageBlockPadding: '0.5rem 0.625rem 0.5rem 2.35rem',
        messageBlockContainerMarginTop: '0.25rem',
      } : {}),
      fabBackground: accent,
      fabForegroundColor: '#ffffff',
      // `containerBackground: transparent` keeps ACC from painting a backdrop
      // BEHIND the chat panel body. NOTE: this does NOT fix the white box behind
      // the MINIMIZED launcher pill — that white is a separate opaque launcher
      // card ACC renders inside a CLOSED shadow root, unreachable by any
      // styleToken/CSS-var (empirically swept 40+, incl. the SDK's real
      // `--agentic-chat-*` prefix, `--dxp/--slds/--sds`, and `color-scheme`).
      // Proof it's a distinct layer: with containerBackground ALREADY
      // transparent, the card still renders WHITE (transparent would show the
      // dark page through). The real fix is `clipLauncherCss()` below, which
      // trims that card off the light-DOM wrapper. The OPEN panel keeps its
      // readable white surface from ACC's own `.acc-frame.maximize{background:#fff}`.
      containerBackground: 'transparent',
      headerBackground: accent,
      headerBlockBackground: accent,
      headerBlockTextColor: '#ffffff',
      headerBlockIconColor: '#ffffff',
      headerBlockFontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
    },
  };
}

/** <style> id for the one-time minimized-launcher clip rule (see clipLauncherCss). */
const LAUNCHER_CLIP_STYLE_ID = 'acc-launcher-clip';

/**
 * Trim the white launcher card that ACC paints behind the minimized "Start a
 * chat" pill. That card fills the fixed 180×70 minimized frame and is drawn by
 * core CSS INSIDE a closed shadow root — no styleToken or CSS var reaches it
 * (empirically verified: swept the SDK's real `--agentic-chat-*` family plus
 * `--dxp/--slds/--sds` and `color-scheme`; none recolor it, and it renders
 * white even though `containerBackground` is `transparent`, proving it's a
 * distinct opaque layer, not the container). The ONE host-reachable surface is
 * the light-DOM wrapper element (`runtime_copilot-acc-sdk-wrapper`); a
 * `clip-path` on it clips the shadow content. ACC pins the minimized frame to a
 * fixed 180×70 via its own `--minimized-iframe-*` vars, so these measured px
 * insets are deterministic. The clip is scoped to the `.minimize`/`.initial`
 * (collapsed) states ONLY — on `.maximize` (the open 450×700 panel) it computes
 * to `none`, leaving the readable chat surface untouched (verified live).
 * Injected once as a shared singleton; harmless if ACC's launcher geometry ever
 * shifts (worst case a hairline of card peeks — never breaks the open panel).
 */
function clipLauncherCss(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LAUNCHER_CLIP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LAUNCHER_CLIP_STYLE_ID;
  // Insets measured against the fixed 180×70 minimized frame (top/left trim the
  // white margin above and left of the pill; the pill is flush right/bottom).
  style.textContent = [
    'runtime_copilot-acc-sdk-wrapper.acc-frame.minimize,',
    'runtime_copilot-acc-sdk-wrapper.acc-frame.initial {',
    '  clip-path: inset(13px 1px 0 42px round 28px) !important;',
    '}',
  ].join('\n');
  document.head.appendChild(style);
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
 * Inline V2 embeds use the SDK context bridge. Page and record changes update
 * the current session. Legacy floating clients use their existing chrome labels.
 *
 * Docs: https://developer.salesforce.com/docs/platform/multiframework/guide/reactdev-acc.html
 */
export function AgentforceChat({
  agentId,
  agentLabel = 'Cumulus Assistant',
  agents = CUMULUS_AGENTS,
  contextLabel,
  pageContext,
  agentScope,
  baselineAccent,
  inline = false,
  detailsOpen = false,
  workspaceDetails,
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
  pageContext?: AgentforceContextVariable[];
  agentScope?: PersonaKey;
  baselineAccent?: string;
  inline?: boolean;
  detailsOpen?: boolean;
  workspaceDetails?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Agentic accent for the FAB + header. A CUSTOM brand (override with no
  // `mode` — the fixed Dark/Light defaults set `mode`) retints the agent to its
  // accent; baseline and the fixed defaults keep the reserved Aurora pink.
  const brand = useBrandOverride();
  // A custom brand with a dedicated aiAccent tints the agent to THAT color;
  // without one it derives from the brand accent; baseline/fixed defaults keep
  // the reserved Aurora pink.
  const agentColor =
    !inline && brand && !brand.mode
      ? buildAiFamily(brand.aiAccent?.trim() || brand.accent).bubble
      : baselineAccent ?? DEFAULT_AGENT_COLOR;
  // A persisted user choice (from a prior switch) wins over the page default.
  const choiceKey = agentScope ? AGENT_CHOICE_KEY + '.' + agentScope : AGENT_CHOICE_KEY;
  const savedId = readSavedAgentId(choiceKey);
  const initialId =
    (savedId && agents.some(a => a.id === savedId) ? savedId : undefined) ??
    agentId ??
    agents[0]?.id ??
    '';
  const [chosenId, setActiveId] = useState(initialId);
  const activeId = agents.some(a => a.id === chosenId) ? chosenId : initialId;
  const handle = useRef<EmbedAgentforceClientResult | null>(null);
  const [contextState, setContextState] = useState<'syncing' | 'applied' | 'failed'>('syncing');
  const recordId = pageContext?.find(v => v.name === 'currentRecordId')?.value;
  const [copiedRecord, setCopiedRecord] = useState('');
  async function copyRecord(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedRecord(id);
    } catch {
      // The ID stays selectable when the browser does not allow clipboard writes.
      setCopiedRecord('');
    }
  }
  const [contextAttempt, setContextAttempt] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const embedKey = `${activeId}:${agentColor}:${attempt}`;
  const [connection, setConnection] = useState<{ key: string; ready: boolean } | null>(null);
  const inlineStatus = connection?.key === embedKey ? (connection.ready ? 'ready' : 'failed') : 'connecting';


  function pickAgent(id: string) {
    setPickerOpen(false);
    if (id === activeId) return;
    try { sessionStorage.setItem(choiceKey, id); } catch { /* The selection still applies here. */ }
    setActiveId(id);
  }

  const active = agents.find(a => a.id === activeId);
  const baseLabel = active?.label ?? agentLabel;
  const headerLabel = contextLabel ? `${baseLabel} · ${contextLabel}` : baseLabel;
  const placeholder = contextLabel ? `Ask about ${contextLabel}…` : undefined;

  // Embed the ACC client, re-embedding whenever the active agent OR its cosmetic
  // config (header label, agentic accent, input placeholder) changes. The
  // re-embed is load-bearing for TWO reasons, not one:
  //   1. Agent switch — re-embedding is what actually re-initializes the
  //      conversation for the new agentId (see the RE-EMBED note above).
  //   2. Brand accent — ACC's styleTokens (fabBackground/headerBackground) are
  //      consumed ONCE at embed time into a cross-origin iframe; there is NO
  //      post-embed recolor API. The active theme resolves ASYNC on load
  //      (applyActiveThemeOnLoad → setBrandOverride fires ~after first paint),
  //      flipping `agentColor` from the pink default to the brand accent. Keying
  //      the effect on `agentColor` re-embeds with the resolved color — that
  //      second embed is what themes the FAB (and, empirically, is the embed
  //      that reliably renders the launcher). DO NOT drop these deps to avoid a
  //      re-embed: an earlier attempt to do so left the FAB unthemed and hidden.
  //      The async flip fires ~1.5s after mount, before any conversation has
  //      started, so the re-embed is harmless to in-flight chat in practice.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeId) return;
    // Narrow once here so the nested embed() closure keeps the non-null type.
    const el: HTMLElement = container;

    let loApp: { remove?: () => void } | undefined;
    let cancelled = false;
    let slowTimer: number | undefined;
    const setInlineConnection = (ready: boolean) => {
      if (inline && !cancelled) setConnection({ key: embedKey, ready });
    };
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
          agentforceClientConfig: buildAccConfig(activeId, headerLabel, agentColor, placeholder, inline),
          onError: (err: { type: string; detail: unknown }) => {
            setInlineConnection(false);
            // Keep failures quiet in the UI; surface in console for debugging.
            // eslint-disable-next-line no-console
            console.warn('[AgentforceChat] Lightning Out error', err.type, err.detail);
          },
        });
        handle.current = result;
        loApp = result.loApp as unknown as { remove?: () => void };
        if (inline) {
          slowTimer = window.setTimeout(() => setInlineConnection(false), 20000);
          result.chatClientComponent.addEventListener('accready', () => {
            window.clearTimeout(slowTimer);
            setInlineConnection(true);
          }, { once: true });
        }
      } catch (e) {
        setInlineConnection(false);
        // eslint-disable-next-line no-console
        console.warn('[AgentforceChat] failed to embed', e);
      }
    }

    return () => {
      cancelled = true;
      handle.current = null;
      window.clearTimeout(slowTimer);
      cancelAnimationFrame(raf);
      try {
        loApp?.remove?.();
      } catch {
        /* ignore */
      }
      container?.replaceChildren();
    };
  }, [activeId, headerLabel, placeholder, agentColor, inline, embedKey]);

  useEffect(() => {
    if (!pageContext || inlineStatus !== 'ready' || !handle.current) return;
    let live = true;
    setContextState('syncing');
    const timer = window.setTimeout(() => { if (live) setContextState('failed'); }, 12000);
    handle.current.setContext(pageContext, { awaitApplied: true }).then(({ applied }) => {
      if (live) setContextState(applied === pageContext.length ? 'applied' : 'failed');
    }).catch(() => { if (live) setContextState('failed'); }).finally(() => window.clearTimeout(timer));
    return () => { live = false; window.clearTimeout(timer); };
  }, [pageContext, inlineStatus, embedKey, contextAttempt]);

  // Trim the white card ACC paints behind the minimized launcher pill (see
  // clipLauncherCss). One-time shared injection; safe across every persona/app
  // since the rule is scoped to the ACC wrapper's collapsed states.
  useEffect(() => {
    if (!inline) clipLauncherCss();
  }, [inline]);

  // Track the ACC panel's open/closed state so the picker can dock to the
  // panel's top edge when open and shrink to the FAB dot when closed. ACC fires
  // accmaximize/accminimize as NON-bubbling CustomEvents on the inner
  // .acc-frame — a CAPTURING listener on our container still receives them
  // (capture phase traverses ancestors regardless of the bubbles flag).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || inline) return;
    const onMax = () => setPanelOpen(true);
    const onMin = () => setPanelOpen(false);
    container.addEventListener('accmaximize', onMax, true);
    container.addEventListener('accminimize', onMin, true);
    return () => {
      container.removeEventListener('accmaximize', onMax, true);
      container.removeEventListener('accminimize', onMin, true);
    };
  }, [inline]);

  if (inline) return <>
    <div id="atlas-chat-details" className="atlas-chat-details" hidden={!detailsOpen}>
      {workspaceDetails}
      {agents.length > 1 && <label className="atlas-chat-agent">
        <span>Agent</span>
        <select aria-label="Agentforce agent" value={activeId} onChange={event => pickAgent(event.target.value)}>
          {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}
        </select>
      </label>}
      {pageContext && inlineStatus === 'ready' && <p className="atlas-chat-sync" role="status" data-context-status={contextState}>
        {contextState === 'applied' ? 'Workspace context shared' : contextState === 'syncing' ? 'Sharing workspace context…' :
          <>Workspace context unconfirmed. {typeof recordId === 'string' && <>Include <code>{recordId}</code> in your message. <button type="button" onClick={() => void copyRecord(recordId)}>{copiedRecord === recordId ? 'Record ID copied' : 'Copy record ID'}</button> </>}
            <button type="button" onClick={() => setContextAttempt(n => n + 1)}>Retry</button></>}
      </p>}
    </div>
    {inlineStatus === 'connecting' && <p role="status">Connecting to Agentforce…</p>}
    {inlineStatus === 'failed' && <p role="status">Agentforce is taking longer to connect. <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    <div ref={containerRef} className="atlas-chat-frame" data-testid="agentforce-chat" />
  </>;

  return (
    <>
      <div ref={containerRef} data-testid="agentforce-chat" />
      {agents.length > 1 && (
        <AgentPicker
          agents={agents}
          activeId={activeId}
          accent={agentColor}
          open={pickerOpen}
          panelOpen={panelOpen}
          onToggle={() => setPickerOpen(o => !o)}
          onPick={pickAgent}
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
  accent,
  open,
  panelOpen,
  onToggle,
  onPick,
}: {
  agents: AgentOption[];
  activeId: string;
  /** Agentic accent (pink baseline or the active custom brand's accent). */
  accent: string;
  open: boolean;
  /** True while the ACC chat panel is maximized (drives docked positioning). */
  panelOpen: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const active = agents.find(a => a.id === activeId);
  const textColor = agentTextColor(accent);
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
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
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
                    color: isActive ? textColor : '#1f2937',
                    background: isActive ? agentTint(accent, 0.12) : 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: isActive ? accent : 'rgba(0,0,0,0.2)',
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
          border: `1px solid ${agentTint(accent, expanded ? 0.35 : 0.55)}`,
          borderRadius: 999,
          cursor: 'pointer',
          background: expanded ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.9)',
          color: textColor,
          fontSize: '0.76rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          boxShadow: expanded ? '0 6px 18px rgba(0,0,0,0.14)' : '0 2px 8px rgba(0,0,0,0.12)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          contain: 'layout',
          willChange: 'width',
          transition: 'width 160ms ease, padding 160ms ease, gap 160ms ease, box-shadow 160ms ease',
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 9, height: 9, borderRadius: 999, background: accent, flexShrink: 0 }}
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
