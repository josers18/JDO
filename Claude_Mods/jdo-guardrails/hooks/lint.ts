// gotcha-lint: JDO pitfalls that compile or deploy fine and break later.
// Each rule matches a file path, then tests either the text the edit added
// (`added`) or the file as it stands after the edit (`whole`).

export type Rule = {
  id: string
  path: RegExp
  test: (added: string, whole: string) => string | undefined
}

const match = (re: RegExp, text: string): string | undefined => text.match(re)?.[0]?.trim()

export const RULES: readonly Rule[] = [
  {
    id: 'apex-in-keyword',
    path: /\.(cls|trigger)$/,
    test: added => {
      // `in` as an identifier (a declaration or assignment), not SOQL `IN :binds`
      const hit = match(/\b[A-Z][\w.]*(?:<[^;=()]*>)?\s+in\s*[=;,)]/, added)
      return hit && `\`${hit}\`: \`in\` is a reserved Apex keyword; rename the variable.`
    },
  },
  {
    id: 'apex-decimal-double',
    path: /\.(cls|trigger)$/,
    test: added => {
      const hit = match(/Decimal\.valueOf\(\s*\(\s*Double\s*\)/, added)
      return hit && `\`${hit}…\` yields float artifacts; use \`Decimal.valueOf(String.valueOf(o))\`.`
    },
  },
  {
    id: 'apex-aura-exception',
    path: /\.cls$/,
    test: (added, whole) => {
      if (/new\s+AuraHandledException\(\s*\)/.test(added))
        return '`new AuraHandledException()` with no message surfaces nothing; pass the message AND call `setMessage()` (or use the `buildAuraException(safeMsg)` helper).'
      if (/new\s+AuraHandledException\(/.test(added) && !/\.setMessage\(/.test(whole))
        return '`AuraHandledException` needs the ctor arg AND `setMessage()` to surface its message; none in this file (or extract a `buildAuraException(safeMsg)` helper).'
      return undefined
    },
  },
  {
    id: 'lwc-boolean-api-true',
    path: /\/lwc\/[^/]+\/[^/]+\.(js|ts)$/,
    test: added => {
      const hit = match(/@api\s+(?:get\s+)?\w+\s*=\s*true\b/, added)
      return hit && `\`${hit}\`: LWC1503 forbids a Boolean \`@api\` defaulting to true; invert the name (e.g. \`hideX = false\`).`
    },
  },
  {
    id: 'uibundle-google-fonts',
    path: /\/uiBundles\//,
    test: added => {
      const hit = match(/fonts\.(googleapis|gstatic)\.com/, added)
      return hit && `\`${hit}\` is blocked by the App Domain CSP; self-host via \`@fontsource-variable/*\` imported in app.tsx (family becomes \`'X Variable'\`).`
    },
  },
  {
    id: 'uibundle-viewport-grid',
    path: /\/uiBundles\/.*\.(tsx|jsx|ts)$/,
    test: added => {
      const hit = match(/\b(?:md|lg|xl|2xl):grid-cols-\d+/, added)
      return hit && `\`${hit}\` keys off the viewport; multi-column grids use container queries (\`@container/name\` + \`@[900px]/name:grid-cols-…\`), content ≈ viewport − 240px rail.`
    },
  },
  {
    id: 'uibundle-missing-shared-source',
    path: /\/uiBundles\/(?!_shared\/)[^/]+\/src\/(?:.*\/)?global\.css$/,
    test: (_added, whole) =>
      /@import\s+["']tailwindcss["']/.test(whole) && !/@source\s+["'][^"']*_shared\/src["']/.test(whole)
        ? "no `@source '../../../_shared/src';` after the tailwind import: classes used only in `_shared` drop on cold builds."
        : undefined,
  },
  {
    id: 'snow-sql-ampersand',
    path: /\.sql$/,
    test: added =>
      added.includes('&')
        ? '`&` in a `snow sql -f` file triggers `&{...}` template substitution → SyntaxError; spell it out (`DnB`, `S+P`, "and").'
        : undefined,
  },
]

export const lint = (path: string, added: string, whole: string): string[] =>
  RULES.filter(r => r.path.test(path)).flatMap(r => {
    const msg = r.test(added, whole)
    return msg ? [`[${r.id}] ${msg}`] : []
  })
