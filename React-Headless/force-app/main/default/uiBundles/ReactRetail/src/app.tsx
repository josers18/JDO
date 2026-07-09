import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from '@/routes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted display + body fonts (variable woff2, bundled into dist/). Google
// Fonts CDN is blocked by the App Domain's CSP style-src, so these must ship
// with the bundle rather than load from fonts.googleapis.com.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/hanken-grotesk';
import './styles/global.css';

// Normalize basename: strip trailing slash so it matches URLs like /lwr/application/ai/c-app
const rawBasePath = (globalThis as any).SFDC_ENV?.basePath;
const basename =
  typeof rawBasePath === 'string' ? rawBasePath.replace(/\/+$/, '') : undefined;
const router = createBrowserRouter(routes, { basename });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
