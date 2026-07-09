/**
 * Runtime org-environment helpers for UI-bundle apps.
 *
 * A UI bundle renders at the Salesforce **App Domain** origin
 * (`https://<myDomain>--c.<...>.my.salesforce.app/...`), but several platform
 * integrations — notably Lightning Out 2.0 / the Agentforce Conversation
 * Client — need the org's **core** origin (`https://<...>.my.salesforce.com`).
 * The platform injects `globalThis.SFDC_ENV` at runtime; we prefer whatever
 * origin it carries and only derive one from the URL as a last resort.
 */

interface SfdcEnv {
  basePath?: string;
  // Different platform versions expose the origin under different keys; try all.
  orgDomainUrl?: string;
  instanceUrl?: string;
  baseUrl?: string;
  origin?: string;
}

function env(): SfdcEnv | undefined {
  return (globalThis as unknown as { SFDC_ENV?: SfdcEnv }).SFDC_ENV;
}

/**
 * The org's core (`*.my.salesforce.com`) origin, for Lightning Out 2.0 embeds.
 * Resolution order: an explicit origin from SFDC_ENV → derived from the App
 * Domain host → the raw page origin.
 */
export function orgCoreOrigin(): string {
  const e = env();
  // Prefer an explicit origin from SFDC_ENV — BUT only if it's a real core
  // host. A UI bundle's page origin is the App Domain (`.my.salesforce.app`),
  // which serves the bundle but NOT LEX routes; some platform builds surface
  // that App-Domain URL under `baseUrl`/`origin`. Trusting it would build
  // every `/lightning/...` deep link on a host that 404s ("invalid link").
  for (const candidate of [e?.orgDomainUrl, e?.instanceUrl, e?.baseUrl, e?.origin]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (!url.hostname.endsWith('.my.salesforce.app')) return url.origin;
    } catch {
      /* ignore malformed candidate, try the next */
    }
  }

  // Derive from the App Domain host:
  //   <mydomain>--c.<seg>.my.salesforce.app  ->  <mydomain>.<seg>.my.salesforce.com
  const { hostname, origin, protocol } = window.location;
  if (hostname.endsWith('.my.salesforce.app')) {
    const core = hostname
      .replace(/--c\./, '.') // drop the App-Domain "--c" container segment
      .replace(/\.my\.salesforce\.app$/, '.my.salesforce.com');
    return `${protocol}//${core}`;
  }
  return origin;
}

/**
 * LEX deep link to a native org app, e.g. Sales or Service Console.
 *
 * The path segment MUST be the app's **`AppDefinition.DurableId`** (prefix
 * `06m…`) — the identifier LEX's router actually resolves and exactly what the
 * native App Launcher tiles link to. Verified live (2026-07-08): the bare
 * `CustomApplication.DeveloperName`, the `AppMenuItem.ApplicationId` (`02u…`),
 * and `AppMenuItem.Id` (`0DS…`) all fail to resolve and silently fall back to
 * the default landing page (the "invalid or inaccessible" waffle bug). Query
 * DurableIds via the Tooling/Data API: `SELECT DurableId, DeveloperName FROM
 * AppDefinition`.
 *
 * Lives at the CORE origin — must open in the top frame (`target="_top"`);
 * scripted redirects out of the App Domain are browser-blocked.
 */
export function lexAppUrl(appDurableId: string): string {
  return `${orgCoreOrigin()}/lightning/app/${appDurableId}`;
}

/** LEX record page for a standard object (Contact, Opportunity, …). */
export function lexRecordUrl(objectApiName: string, recordId: string): string {
  return `${orgCoreOrigin()}/lightning/r/${objectApiName}/${recordId}/view`;
}

/**
 * LEX global search results deep link.
 *
 * Verified against the live org (2026-07-08): neither `/lightning/search/:term`
 * nor `/lightning/search/results?searchTerm=` runs the query — both silently
 * redirect to the default Home tab (the "random home page" the search footer
 * used to land on). The route LEX itself navigates to is the Aura hash
 * `/one/one.app#<base64-JSON>`, where the payload names the search component and
 * carries the term at `attributes.term`. We emit exactly that shape with a
 * minimal, deterministic payload (the per-session `searchDialogSessionId` LEX
 * adds is cosmetic and omitted). `orgCoreOrigin()` is on `.my.salesforce.com`,
 * which auto-redirects to `.lightning.force.com` for `one.app` — so this works
 * from the App Domain via a top-frame anchor.
 */
export function lexSearchUrl(term: string): string {
  const payload = {
    componentDef: 'forceSearch:searchPageDesktop',
    attributes: { term, scopeMap: { type: 'TOP_RESULTS' }, groupId: 'DEFAULT' },
    state: {},
  };
  // base64 of the JSON; the unescape/encodeURIComponent dance keeps btoa
  // Unicode-safe for non-ASCII search terms.
  const hash = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${orgCoreOrigin()}/one/one.app#${hash}`;
}

/**
 * LEX default landing (the org's default app home). Used as the App-Launcher
 * escape hatch: `/lightning/app/AppLauncher` is NOT a real app route and errors
 * with "invalid or inaccessible"; `/lightning/page/home` always resolves and
 * carries the native waffle for the full permission-aware app list.
 */
export function lexHomeUrl(): string {
  return `${orgCoreOrigin()}/lightning/page/home`;
}

/**
 * LEX Setup home. Setup lives on the dedicated `*.my.salesforce-setup.com`
 * domain (derived from the core origin); the landing node is `SetupOneHome/home`.
 */
export function setupUrl(): string {
  return `${setupOrigin()}/lightning/setup/SetupOneHome/home`;
}

/**
 * Data Cloud Setup. Verified live (2026-07-08): there is NO `CdpSetupHome`
 * node — the gear-menu "Data Cloud Setup" item is Setup home scoped into the
 * Data Cloud app via `?setupApp=audience360`, which loads the Data Cloud setup
 * nav (Data Spaces, Ingestion API, Snowflake, …).
 */
export function dataCloudSetupUrl(): string {
  return `${setupOrigin()}/lightning/setup/SetupOneHome/home?setupApp=audience360`;
}

/**
 * The org's Setup origin. Setup redirects `*.my.salesforce.com` →
 * `*.my.salesforce-setup.com`; emitting the final host avoids the bounce.
 */
function setupOrigin(): string {
  return orgCoreOrigin().replace(/\.my\.salesforce\.com$/, '.my.salesforce-setup.com');
}

/**
 * URL of a sibling React persona bundle. These UIBundles only render at the
 * App Domain origin (LEX `/lightning/app/...` is a dead end for them — see
 * CLAUDE.md), so switch on the CURRENT origin, changing only the app segment.
 */
export function personaAppUrl(customApplicationDevName: string): string {
  return `${window.location.origin}/app/c__${customApplicationDevName}`;
}

/**
 * LEX personal-settings landing. The canonical route is
 * `.../personal/PersonalInformation/home` — bare `.../personal/home` is not a
 * real settings node and lands on an error page ("bad link").
 */
export function personalSettingsUrl(page = 'PersonalInformation/home'): string {
  return `${orgCoreOrigin()}/lightning/settings/personal/${page}`;
}

/** Org logout endpoint (top-frame navigation). */
export function logoutUrl(): string {
  return `${orgCoreOrigin()}/secur/logout.jsp`;
}

/** Which React persona bundle is currently rendering (from the URL), if any. */
export function currentPersonaDevName(): string | null {
  const m = window.location.pathname.match(/c__React(Retail|Wealth|Commercial|Headless)/i);
  return m ? `React${m[1]}` : null;
}
