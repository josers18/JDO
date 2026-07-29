import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from '@/routes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyActiveThemeOnLoad } from '@shared';
// Self-hosted fonts, bundled into dist/. The App Domain CSP blocks
// fonts.googleapis.com, so any webfont must ship with the bundle rather than
// load from the Google Fonts CDN. Body + display now use the OS-native Apple
// SF Pro stack (see global.css --font-sans / --font-display), so no sans/serif
// webfont is loaded — only IBM Plex Mono remains for --font-mono.
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/global.css';

// Normalize basename: strip trailing slash so it matches URLs like /lwr/application/ai/c-app
const rawBasePath = (globalThis as any).SFDC_ENV?.basePath;
const basename =
  typeof rawBasePath === 'string' ? rawBasePath.replace(/\/+$/, '') : undefined;
const router = createBrowserRouter(routes, { basename });

// Apply the user's active brand theme (if any) once at load. Fire-and-forget:
// renders the persona default first, swaps to the brand on resolve (never blocks paint).
void applyActiveThemeOnLoad();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
