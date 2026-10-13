// The line shown beside Clawd during /clawd-demo: the dance playing, or null.
export type DemoLabel = string | null

declare module 'claude-code' {
  interface PluginState {
    'dancing-clawd': { demoLabel: DemoLabel }
  }
}
