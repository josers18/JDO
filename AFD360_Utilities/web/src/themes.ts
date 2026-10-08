import { useEffect, useState } from "react";

// Every theme fills the same token set; index.css maps the tokens to Tailwind colors (bg-side, text-sent-ink, …).
const TOKENS = [
  ["ground", "surface", "line", "ink", "ink-2", "ink-3"],
  ["side", "side-2", "side-ink", "side-ink-2", "side-line"],
  ["rail", "rail-ink", "rail-on"],
  ["sent", "sent-line", "sent-ink", "sent-chip"],
  ["recv", "recv-line", "recv-ink"],
  ["ok", "live", "err"],
  ["action", "action-ink"],
] as const;

export interface Theme {
  id: string;
  label: string;
  group: "Finance" | "Color";
  dark?: boolean;
  // Light sidebars sit next to a dark rail, so the active rail item needs its own ink.
  railOnInk?: string;
  values: string;
}

export const THEMES: Theme[] = [
  { id: "navygold", label: "Navy & Gold", group: "Finance", values: "#F3F4F6 #FFFFFF #E0E3E8 #111827 #3D4554 #555E6D | #14213D #1E2E52 #EEF1F7 #AEB9CF #2B3C63 | #0D172C #93A1BC #1E2E52 | #E6ECF5 #C8D4E6 #1A3360 #D4DFEF | #F7F0DC #E6D6A8 #5F4A0F | #2F7D5B #E2C15A #B23A33 | #C9A227 #1A1405" },
  { id: "platinum", label: "Platinum & Navy", group: "Finance", railOnInk: "#FFFFFF", values: "#F5F6F8 #FFFFFF #E1E5EA #121821 #3E4753 #56606C | #DDE2E8 #F7F8FA #121821 #4B5562 #C7CED7 | #1B2B4B #A9B6CB #2C3E63 | #E7EDF4 #C9D5E4 #1B3358 #D6E1EE | #F6F0E1 #E4D6B4 #5E4A16 | #2F7D5B #2F7D5B #B23A33 | #1B2B4B #FFFFFF" },
  { id: "steel", label: "Steel & Sapphire", group: "Finance", values: "#EEF1F4 #FFFFFF #DCE1E7 #141A22 #3F4955 #56606C | #2B3440 #37414F #EDF1F5 #AEB8C4 #465263 | #1F262F #98A3B0 #37414F | #E3EAF6 #C3D1EA #1C3D78 #D2DEF2 | #F1EFEA #DCD7CB #4E473A | #2F7D5B #8FB4E8 #B23A33 | #1F4FA3 #FFFFFF" },
  { id: "champagne", label: "Charcoal & Champagne", group: "Finance", values: "#F4F3F0 #FFFFFF #E3E1DB #1A1A1A #45443F #5C5A54 | #232528 #303236 #F1F0EC #B8B6AF #3F4146 | #18191B #9D9B95 #303236 | #ECEBE7 #D6D4CC #33322E #E1DFD8 | #F5EEDC #E3D5B0 #5C4914 | #2F7D5B #D8BE7A #B23A33 | #D8BE7A #1E1A10" },
  { id: "ivory", label: "Ivory & Prussian", group: "Finance", railOnInk: "#FFFFFF", values: "#FBFAF7 #FFFFFF #E8E4DA #16202C #434B56 #5A616B | #EFEBE1 #FFFEFB #16202C #5A616B #DCD5C6 | #1D3A5F #A7B7CC #2C4E7A | #E7EDF4 #C8D5E4 #1D3A5F #D6E1EE | #F6EED8 #E3D3A8 #5D4812 | #2F7D5B #2F7D5B #B23A33 | #1D3A5F #FFFFFF" },
  { id: "pewter", label: "Pewter & Amber", group: "Finance", values: "#F2F2F0 #FFFFFF #E0E0DC #18191B #44464A #5B5D62 | #3C4148 #4A5058 #EFF0F2 #B5BAC1 #585E67 | #2D3137 #A0A5AD #4A5058 | #E9ECEF #D0D5DB #2F3640 #DDE1E6 | #FBF0D4 #EED69A #5E4405 | #2F7D5B #E8B23A #B23A33 | #E0A526 #1C1404" },
  { id: "citron", label: "Ink & Citron", group: "Finance", values: "#F3F4F6 #FFFFFF #E0E3E8 #12151C #3E4350 #565C69 | #161B26 #222938 #ECEFF4 #A6AEBD #333B4C | #0E121A #8D95A4 #222938 | #E8EBF0 #CDD2DB #252C3A #DADFE7 | #F8F4D8 #E6DC9E #554A0A | #2F7D5B #E6D35A #B23A33 | #E6D35A #17150A" },
  { id: "midnight", label: "Midnight & Silver", group: "Finance", dark: true, values: "#0F1622 #162032 #26324A #E8ECF2 #B4BDCB #8E99AA | #0A101B #162032 #E8ECF2 #8E99AA #26324A | #070B13 #7D889A #162032 | #1B2A44 #2C4166 #D5E2F7 #24365A | #262418 #463F27 #EADBB0 | #5BBF8F #C9D1DC #FF7A6E | #C9D1DC #0F1622" },
  { id: "evergreen", label: "Evergreen & Persimmon", group: "Color", values: "#EEF2EF #FFFFFF #DCE3DE #13201C #3F4F49 #56655F | #0F2E2B #18403C #E6F2EE #A8C4BD #24504B | #0A1F1D #8FB0A8 #18403C | #E2F1EC #BFDDD3 #0E4A3F #CBE8DE | #FBF1E1 #EBD6B0 #6E4810 | #117953 #4FD8A4 #C8382E | #C6411C #FFFFFF" },
  { id: "aubergine", label: "Aubergine & Saffron", group: "Color", values: "#F2EFF4 #FFFFFF #E2DCE8 #1D1525 #4A3F55 #5E536A | #2A1C36 #3A2949 #F1EAF7 #C3B2D3 #4A3760 | #1D1326 #A996BC #3A2949 | #EEE7F7 #D8CBEA #43256B #E1D4F2 | #FCF3E3 #EDD8AE #6B4708 | #28794C #F2B53A #C43B3B | #E9A52A #24160A" },
  { id: "graphite", label: "Graphite & Jade", group: "Color", values: "#F1F0EC #FFFFFF #E0DED7 #1C1B19 #4A4842 #5E5B54 | #262522 #34322E #EFEDE7 #B9B5AB #46433D | #1A1917 #A29E94 #34322E | #E6EFE8 #C7DACB #1F4D33 #D3E6D8 | #F7F1E4 #E5D7B7 #66501C | #1B7950 #3DD69A #C23E32 | #0D795E #FFFFFF" },
  { id: "oxblood", label: "Oxblood & Brass", group: "Color", values: "#F4EFEA #FFFDFB #E6DCD3 #22140F #4E3A33 #64504A | #3B1418 #4E1E23 #F6E9E4 #D2B2AA #64292F | #2A0E11 #C09A93 #4E1E23 | #F6E4E1 #E6C4BE #6A1E22 #EFD3CE | #F3EEDC #DED3AE #5C4A12 | #2F7D4F #E7B75A #B8322A | #D4A341 #24180A" },
  { id: "petrol", label: "Petrol & Coral", group: "Color", values: "#EDF1F2 #FFFFFF #D9E2E4 #10202A #3B4D57 #52636C | #0E2F3A #16404D #E4F0F3 #A3C0C8 #22525F | #08222B #8DAEB8 #16404D | #E1EEF0 #BCD6DB #0D4452 #CDE3E7 | #FCEDE6 #F0CDBE #7A3418 | #13845C #FF8A6B #C2362E | #C93F22 #FFFFFF" },
  { id: "linen", label: "Linen & Ink", group: "Color", railOnInk: "#FAF8F3", values: "#FAF8F3 #FFFFFF #E7E2D6 #1A1916 #4A473F #5F5B52 | #ECE5D6 #FFFDF8 #1A1916 #5F5B52 #D9D0BC | #1A1916 #B4AE9F #33312B | #E8EEE4 #C9D6C0 #2C4423 #D7E3CF | #F7E9E3 #E6CABD #6E3420 | #2F7D4F #28794C #B8322A | #1A1916 #FAF8F3" },
  { id: "obsidian", label: "Obsidian & Lime", group: "Color", dark: true, values: "#121417 #1A1D21 #2A2E34 #ECEEF0 #B7BCC3 #9097A0 | #0B0C0E #1A1D21 #ECEEF0 #9097A0 #2A2E34 | #070809 #7E858E #1A1D21 | #1D2A22 #2E4536 #CFEBD9 #27392D | #2A2419 #4A3E27 #F0D9A8 | #4CC38A #C6F24E #FF6B5E | #C6F24E #121417" },
  { id: "mulberry", label: "Mulberry & Mint", group: "Color", values: "#F5F0F3 #FFFFFF #E8DCE3 #1F1219 #4D3A44 #63505A | #3A1230 #4C1C40 #F7E8F1 #D0AFC3 #62284F | #29091F #BE97AF #4C1C40 | #F4E3EE #E3C2D6 #6A1F52 #ECD2E2 | #E3F3EC #BFE0D1 #1D5A42 | #1B7950 #5FE0B0 #C2362E | #0E7C5A #FFFFFF" },
  { id: "clay", label: "Clay & Olive", group: "Color", values: "#F3EEE6 #FFFDF9 #E3D9CA #231A12 #4F4335 #66594A | #4A2618 #5C3222 #F6EADF #D3B6A2 #70402D | #351A10 #C29F88 #5C3222 | #ECEBD8 #D3D1AE #444616 #E0DFC2 | #F7E6DA #E8C8B1 #7A3A17 | #3E7D3A #D9C25A #B8322A | #5E6B1C #FFFFFF" },
];

const DEFAULT = "navygold";
const KEY = "afd360.theme";

export function tokens(t: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  t.values.split("|").forEach((group, i) => group.trim().split(/\s+/).forEach((v, j) => (out[TOKENS[i][j]] = v)));
  out["rail-on-ink"] = t.railOnInk ?? out["side-ink"];
  return out;
}

function apply(t: Theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens(t))) root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = t.dark ? "dark" : "light";
  root.dataset.theme = t.id;
}

const find = (id: string | null) => THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT)!;

// Apply before first render so there is no flash of the default theme.
apply(find(localStorage.getItem(KEY)));

export function useTheme() {
  const [id, setId] = useState(() => find(localStorage.getItem(KEY)).id);
  useEffect(() => {
    apply(find(id));
    localStorage.setItem(KEY, id);
  }, [id]);
  return [id, setId] as const;
}

// MCP Apps host styles for widgets (HXL cards): the active theme mapped onto the standardized --color-*, --font-*,
// radius and shadow variables the HXL runtime reads from hostContext.styles.variables. Values must be literal
// colors, since the widget runs in its own document.
// The app's Card and Lift shadows, read from index.css (@theme static) so HXL cards share one source.
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function widgetHostStyles(): { theme: "light" | "dark"; variables: Record<string, string> } {
  const t = find(document.documentElement.dataset.theme ?? null);
  const k = tokens(t);
  const mix = (a: string, b: string, pct: number) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;
  const soft = (c: string) => mix(c, k.surface, 14);
  const tones = {
    info: { soft: k["sent-chip"], text: k["sent-ink"], surface: k.sent, border: k["sent-line"], solid: k["sent-ink"] },
    caution: { soft: k.recv, text: k["recv-ink"], surface: k.recv, border: k["recv-line"], solid: k["recv-ink"] },
    warning: { soft: k.recv, text: k["recv-ink"], surface: k.recv, border: k["recv-line"], solid: k["recv-ink"] },
    success: { soft: soft(k.ok), text: mix(k.ok, k.ink, 80), surface: soft(k.ok), border: mix(k.ok, k.surface, 40), solid: k.ok },
    danger: { soft: soft(k.err), text: k.err, surface: soft(k.err), border: mix(k.err, k.surface, 40), solid: k.err },
    discovery: { soft: k["sent-chip"], text: k["sent-ink"], surface: k.sent, border: k["sent-line"], solid: k["sent-ink"] },
  };
  const v: Record<string, string> = {
    "--font-sans": '"Archivo Variable", ui-sans-serif, system-ui, sans-serif',
    "--font-mono": '"JetBrains Mono Variable", ui-monospace, monospace',
    "--color-background-primary": k.surface,
    "--color-background-secondary": mix(k.ground, k.surface, 60),
    "--color-background-tertiary": k.ground,
    "--color-background-inverse": k.ink,
    "--color-text-primary": k.ink,
    "--color-text-secondary": k["ink-2"],
    "--color-text-tertiary": k["ink-3"],
    "--color-text-inverse": k.surface,
    "--color-border-primary": k.line,
    "--color-border-secondary": k.line,
    "--color-border-tertiary": mix(k.line, k.surface, 60),
    "--color-border-subtle": mix(k.line, k.surface, 60),
    "--color-border-strong": k["ink-3"],
    "--color-ring-primary": k.action,
    "--color-background-primary-solid": k.action,
    "--color-text-primary-solid": k["action-ink"],
    "--color-background-secondary-soft": mix(k.ground, k.surface, 60),
    "--color-text-secondary-soft": k["ink-2"],
    "--border-radius-sm": "6px",
    "--border-radius-md": "10px",
    "--border-radius-lg": "12px",
    "--border-radius-xl": "16px",
    "--shadow-sm": cssVar("--shadow-card"),
    "--shadow-md": cssVar("--shadow-lift"),
  };
  for (const [tone, c] of Object.entries(tones)) {
    v[`--color-background-${tone}-soft`] = c.soft;
    v[`--color-background-${tone}-surface`] = c.surface;
    v[`--color-background-${tone}-solid`] = c.solid;
    v[`--color-text-${tone}`] = c.text;
    v[`--color-text-${tone}-soft`] = c.text;
    v[`--color-text-${tone}-surface`] = c.text;
    v[`--color-border-${tone}-surface`] = c.border;
    v[`--color-border-${tone}`] = c.border;
    v[`--color-ring-${tone}`] = c.solid;
  }
  return { theme: t.dark ? "dark" : "light", variables: v };
}
