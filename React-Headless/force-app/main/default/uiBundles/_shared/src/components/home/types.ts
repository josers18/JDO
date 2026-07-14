/**
 * A lightweight client profile the Prep sheet and 360 quick view render. All
 * fields optional — the modals compose sensible defaults when they're absent so
 * the components stay decoupled from any bundle's data model.
 */
export interface ClientProfile {
  initials?: string;
  /** Short descriptor, e.g. "Retail household" / "Commercial". */
  descriptor?: string;
  since?: string;
  csat?: string;
  value?: string;
  openCases?: string;
  facts?: [string, string][];
  recap?: string;
  talk?: string;
  nba?: string[];
}
