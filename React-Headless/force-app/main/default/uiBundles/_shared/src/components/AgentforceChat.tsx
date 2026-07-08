import { useEffect, useRef } from 'react';
import { embedAgentforceClient } from '@salesforce/agentforce-conversation-client';
import { orgCoreOrigin } from '../data/orgEnv';

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
 * Docs: https://developer.salesforce.com/docs/platform/multiframework/guide/reactdev-acc.html
 */
export function AgentforceChat({
  agentId,
  agentLabel = 'Cumulus Assistant',
}: {
  agentId: string;
  agentLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    // StrictMode double-invokes effects in dev; guard so we embed once.
    if (!container || mountedRef.current) return;
    mountedRef.current = true;

    let loApp: { remove?: () => void } | undefined;
    try {
      const result = embedAgentforceClient({
        container,
        salesforceOrigin: orgCoreOrigin(),
        agentforceClientConfig: {
          agentId,
          agentLabel,
          renderingConfig: {
            mode: 'floating',
            // Roomier than the default panel so long, formatted answers
            // (product overviews, tables) have space to breathe. Floating
            // mode has no fullscreen flag — width/height is the supported lever.
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
        },
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

    return () => {
      mountedRef.current = false;
      try {
        loApp?.remove?.();
      } catch {
        /* ignore */
      }
      container?.replaceChildren();
    };
  }, [agentId, agentLabel]);

  return <div ref={containerRef} data-testid="agentforce-chat" />;
}
