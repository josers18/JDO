import { Outlet } from 'react-router';
import { ThemeProvider } from '@shared';

/**
 * CLIENT app layout — the embedded Customer 360 that lives ON a Salesforce
 * Account record page. NO in-app chrome (no left nav, no own Agentforce): the
 * Salesforce Lightning shell + its top-nav Agentforce provide that. Renders
 * full-bleed so it fills the record-page canvas. Light-mode retail theme.
 */
export default function ClientLayout() {
  return (
    <ThemeProvider persona="retail" mode="light">
      <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--wp-surface)', color: 'var(--wp-text)', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'var(--wp-aurora)', pointerEvents: 'none', zIndex: 0 }} />
        <main style={{ position: 'relative', zIndex: 1, maxWidth: 1600, margin: '0 auto', padding: '1.5rem' }}>
          <Outlet />
        </main>
      </div>
    </ThemeProvider>
  );
}
