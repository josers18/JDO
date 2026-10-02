// Absolute paths this session's Edit/Write calls changed: "mine" to git-safety.
export type TouchedPaths = string[]

declare module 'claude-code' {
  interface PluginState {
    'jdo-guardrails': { touched: TouchedPaths }
  }
}
