// The line shown beside Clawd during /clawd-demo: the dance playing, or null.
export type DemoLabel = string | null
// The dance card entries seen so far, by id.
export type SeenMoves = string[]

declare module 'claude-code' {
  interface PluginState {
    'dancing-clawd': { demoLabel: DemoLabel; seen: SeenMoves }
  }
}
