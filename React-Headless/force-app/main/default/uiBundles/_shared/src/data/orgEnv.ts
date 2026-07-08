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
  const fromEnv = e?.orgDomainUrl ?? e?.instanceUrl ?? e?.baseUrl ?? e?.origin;
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* fall through to URL derivation */
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
 * Lives at the CORE origin — must open in the top frame (`target="_top"`);
 * scripted redirects out of the App Domain are browser-blocked.
 */
export function lexAppUrl(appName: string): string {
  return `${orgCoreOrigin()}/lightning/app/${appName}`;
}

/** LEX record page for a standard object (Contact, Opportunity, …). */
export function lexRecordUrl(objectApiName: string, recordId: string): string {
  return `${orgCoreOrigin()}/lightning/r/${objectApiName}/${recordId}/view`;
}

/**
 * URL of a sibling React persona bundle. These UIBundles only render at the
 * App Domain origin (LEX `/lightning/app/...` is a dead end for them — see
 * CLAUDE.md), so switch on the CURRENT origin, changing only the app segment.
 */
export function personaAppUrl(customApplicationDevName: string): string {
  return `${window.location.origin}/app/c__${customApplicationDevName}`;
}

/** LEX personal-settings page (`home`, `PersonalInformation`, …). */
export function personalSettingsUrl(page = 'home'): string {
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
