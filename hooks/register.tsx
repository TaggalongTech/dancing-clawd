import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DemoLabel } from '../types'

// A mini Clawd, drawn the way Claude Code's own logo is: quadrant blocks, so
// each terminal cell is 2x2 pixels. The stage is 18x4 pixels, 9 cells by 2
// rows; Clawd is 10x4 of it (5 cells) and moves about the rest.
const W = 18
const H = 4
const HOME = 4 // Clawd's left edge, in pixels, when he stands centered
export const COLUMNS = W / 2
export const ROWS = H / 2
export const TICK_MS = 120 // one move per beat while Claude works; one per two beats idle

const ORANGE = 0xd77757
const DEFAULT = 0x01000000 // the terminal's own color
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█' // indexed by mask: UL=1 UR=2 LL=4 LR=8

type Arm = 'mid' | 'up' | 'down' | 'in'
type Pose = {
  x: number // left edge on the stage, in pixels
  left: Arm
  right: Arm
  stride: number // feet stay on the ground; walking steps them in this many pixels
  look: number // eyes glance left (-1) or right (1)
  face: 'front' | 'side' | 'back'
  blink: boolean
}

const STAND: Pose = {
  x: HOME,
  left: 'mid',
  right: 'mid',
  stride: 0,
  look: 0,
  face: 'front',
  blink: false,
}
const P = (changes: Partial<Pose>): Pose => ({ ...STAND, ...changes })
const ROOF = P({ left: 'up', right: 'up' })

// Short phrases a dance is strung together from.
const PHRASES = {
  roof: [STAND, ROOF, STAND, ROOF],
  swayLeft: [P({ x: 2, left: 'up', look: -1 }), P({ x: 2, look: -1 }), STAND],
  swayRight: [P({ x: 6, right: 'up', look: 1 }), P({ x: 6, look: 1 }), STAND],
  wave: [P({ left: 'up', look: -1 }), P({ right: 'up', look: 1 }), P({ left: 'up', look: -1 }), P({ right: 'up', look: 1 })],
  shimmy: [
    P({ x: 5, left: 'up', right: 'down' }),
    P({ x: 3, left: 'down', right: 'up' }),
    P({ x: 5, left: 'up', right: 'down' }),
    P({ x: 3, left: 'down', right: 'up' }),
    STAND,
  ],
  spin: [
    P({ face: 'side', look: 1, left: 'in', right: 'in' }),
    P({ face: 'back' }),
    P({ face: 'side', look: -1, left: 'in', right: 'in' }),
    STAND,
    ROOF,
  ],
  ponder: [
    P({ look: -1 }),
    P({ look: -1 }),
    P({ look: 1 }),
    P({ look: 1 }),
    P({ right: 'up' }),
    P({ right: 'up', blink: true }),
    P({ right: 'up' }),
  ],
  stir: [P({ right: 'up', look: 1 }), P({ look: 1 }), P({ right: 'down', look: 1 }), P({ look: 1 })],
  hammer: [
    P({ left: 'up', right: 'up' }),
    P({ left: 'down', right: 'down' }),
    P({ left: 'up', right: 'up' }),
    P({ left: 'down', right: 'down', look: 1 }),
  ],
  frolic: [
    P({ x: 3, left: 'up' }),
    P({ x: 4, right: 'up' }),
    P({ x: 5, right: 'up' }),
    P({ x: 4, left: 'up' }),
  ],
  flail: [
    P({ left: 'up', right: 'down', look: -1 }),
    P({ left: 'down', right: 'up', look: 1 }),
    P({ left: 'in', right: 'up', blink: true }),
    P({ left: 'up', right: 'in' }),
  ],
  blink: [STAND, P({ blink: true }), STAND],
} satisfies Record<string, Pose[]>
type Phrase = keyof typeof PHRASES

// Walking: a step a beat, feet stepping in and out, from one spot to another.
function walk(from: number, to: number, look: number): Pose[] {
  const poses: Pose[] = []
  const dir = Math.sign(to - from)
  for (let x = from, i = 0; x !== to + dir; x += dir, i++) {
    poses.push(P({ x, look, stride: i % 2 }))
  }
  return poses
}

// The moonwalk glides backwards: facing one way, sliding the other.
const MOONWALK_POSES = [
  ...walk(8, 0, 1),
  P({ x: 0, face: 'side', look: -1, left: 'in', right: 'in' }),
  ...walk(0, 8, -1),
  P({ x: 8, face: 'side', look: 1, left: 'in', right: 'in' }),
]
const WANDER_POSES = [
  ...walk(HOME, 8, 1),
  P({ x: 8, face: 'side', look: -1, left: 'in', right: 'in' }),
  ...walk(8, 0, -1),
  P({ x: 0, face: 'side', look: 1, left: 'in', right: 'in' }),
  ...walk(0, HOME, 1),
]

// Spinner words with a dance of their own; the moonwalk is Moonwalking's alone.
const THEMES: { name: string; match: RegExp; phrases: Phrase[] }[] = [
  { name: 'spin', match: /spin|whirr|whirl|twirl|swirl|churn|reticulat|spiral|rotat/, phrases: ['spin', 'spin'] },
  {
    name: 'shimmy',
    match: /shimm|jiv|vib|boogi|groov|danc|wiggl|jitterbug|tango|waltz|rock/,
    phrases: ['shimmy', 'roof', 'shimmy'],
  },
  {
    name: 'ponder',
    match: /wonder|ponder|mus(e|ing)|contemplat|consider|mull|rumina|cogitat|deliberat|think|philosoph|cerebrat|reflect|specul|puzzl|medit|ideat|imagin|envision|inferr|deciph/,
    phrases: ['ponder', 'blink', 'ponder'],
  },
  {
    name: 'stir',
    match: /cook|brew|bak|simmer|stew|marinat|concoct|percolat|saut|whisk|stir|fry|roast|ferment|caramel|garnish|knead|season|chef/,
    phrases: ['stir', 'stir', 'roof'],
  },
  {
    name: 'hammer',
    match: /work|craft|forg|tinker|build|hustl|comput|process|crunch|hammer|wrangl|construct|assembl|engineer|smith|putter|accomplish|effect|doing/,
    phrases: ['hammer', 'hammer', 'roof'],
  },
  {
    name: 'frolic',
    match: /frolic|skip|gallivant|pranc|romp|cavort|hop|scamper|bound|caper|frisk|gambol/,
    phrases: ['frolic', 'frolic', 'roof'],
  },
  {
    name: 'flail',
    match: /flibbertigibbet|discombobul|combobul|wibbl|befuddl|finagl|bamboozl|kerfuffl|flummox|razzle|hullabaloo|shenanigan|lollygag/,
    phrases: ['flail', 'shimmy', 'flail'],
  },
  {
    name: 'magic',
    match: /conjur|enchant|wizard|divin|manifest|transmut|alchem|spell|sorcer|summon|channel|hatch|incubat|germinat/,
    phrases: ['roof', 'spin', 'blink'],
  },
  { name: 'wave', match: /greet|wav|hello|salut|beckon|honk|boop/, phrases: ['wave', 'wave'] },
]
const MIXABLE: Phrase[] = [
  'roof',
  'swayLeft',
  'swayRight',
  'wave',
  'shimmy',
  'spin',
  'ponder',
  'stir',
  'hammer',
  'frolic',
  'flail',
]

function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// A few phrases picked from the word itself, so each word dances its own way.
function mix(word: string, count: number, skip: Phrase[] = []): Phrase[] {
  let h = hash(word)
  const pool = MIXABLE.filter(p => !skip.includes(p))
  const picked: Phrase[] = []
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(h % pool.length, 1)[0]!)
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  }
  return picked
}

export type Dance = { name: string; poses: Pose[] }

export function danceFor(word: string | undefined): Dance {
  const w = (word ?? '').toLowerCase()
  if (w.startsWith('moonwalk')) return { name: 'moonwalk', poses: MOONWALK_POSES }
  if (/wander|meander|perambulat|schlep|mosey|spelunk|stroll|saunter|roam|explor|traips|herd/.test(w)) {
    return { name: 'wander', poses: WANDER_POSES }
  }
  const theme = THEMES.find(t => t.match.test(w))
  const phrases = theme ? [...theme.phrases, ...mix(w, 1, theme.phrases)] : mix(w, 3)
  return {
    name: `${theme?.name ?? 'mix'}:${phrases.join('+')}`,
    poses: phrases.flatMap(p => PHRASES[p]),
  }
}

export const IDLE: Dance = { name: 'idle', poses: (['roof', 'swayLeft', 'swayRight', 'wave'] as Phrase[]).flatMap(p => PHRASES[p]) }

function pixels(p: Pose): Uint8Array {
  const grid = new Uint8Array(W * H)
  const set = (x: number, y: number, value = 1) => {
    const at = p.x + x
    if (at >= 0 && at < W && y >= 0 && y < H) grid[y * W + at] = value
  }

  // An 8x3 body (6 wide side-on), eyes two pixels in from its edges, an arm
  // each side, two feet.
  const side = p.face === 'side'
  for (let y = 0; y < 3; y++) for (let x = side ? 2 : 1; x <= (side ? 7 : 8); x++) set(x, y)
  if (!p.blink && p.face === 'front') {
    set(3 + p.look, 1, 0)
    set(6 + p.look, 1, 0)
  }
  if (!p.blink && side) set(p.look < 0 ? 3 : 6, 1, 0)

  const ARM_ROW: Record<Arm, number | null> = { up: 0, mid: 2, down: 3, in: null }
  const leftRow = side ? null : ARM_ROW[p.left]
  const rightRow = side ? null : ARM_ROW[p.right]
  if (leftRow !== null) set(0, leftRow)
  if (rightRow !== null) set(9, rightRow)

  set(2 + p.stride, 3)
  set(7 - p.stride, 3)
  return grid
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

// A Raster's cells: per cell, little-endian u32 [codePoint, foreground, background].
export function encode(p: Pose): string {
  const grid = pixels(p)
  const at = (x: number, y: number) => grid[y * W + x] ?? 0
  const bytes = new Uint8Array(COLUMNS * ROWS * 12)
  const view = new DataView(bytes.buffer)
  let offset = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      const x = c * 2
      const y = r * 2
      const mask = at(x, y) | (at(x + 1, y) << 1) | (at(x, y + 1) << 2) | (at(x + 1, y + 1) << 3)
      view.setUint32(offset, QUADRANTS.charCodeAt(mask), true)
      view.setUint32(offset + 4, mask ? ORANGE : DEFAULT, true)
      view.setUint32(offset + 8, DEFAULT, true)
      offset += 12
    }
  }
  return base64(bytes)
}

const frames = new Map<string, string[]>()
export function framesOf(dance: Dance): string[] {
  let encoded = frames.get(dance.name)
  if (encoded === undefined) {
    encoded = dance.poses.map(encode)
    frames.set(dance.name, encoded)
  }
  return encoded
}

// /clawd-demo: every dance in a row, each for at least DEMO_MIN_BEATS.
const DEMO_MIN_BEATS = 16
const DEMO_WORDS = [
  'Moonwalking',
  'Wandering',
  'Spinning',
  'Shimmying',
  'Pondering',
  'Cooking',
  'Working',
  'Frolicking',
  'Flibbertigibbeting',
  'Conjuring',
  'Booping',
  'Clauding',
  'Noodling',
]
export const DEMO = [
  ...DEMO_WORDS.map(word => ({ word: `${word}…`, dance: danceFor(word) })),
  { word: 'between turns', dance: IDLE },
]
const beatsOf = (dance: Dance) => dance.poses.length * Math.ceil(DEMO_MIN_BEATS / dance.poses.length)
export const DEMO_MS = DEMO.reduce((sum, act) => sum + beatsOf(act.dance), 0) * TICK_MS

const demoLabel = atom({ plugin: 'dancing-clawd', key: 'demoLabel' } as const, null as DemoLabel)

// What the band shows and why; module state starts over on each reload.
let bandId: string | undefined
let shown = encode(STAND)
let isTicking = false
let isWorking = false
let turnId: string | undefined
let spinnerWord: string | undefined
let dance = IDLE.name
let beat = 0
let ticks = 0
let demoAct = -1 // the DEMO entry playing, or -1
let demoBeat = 0

function paint($: EngineInterface, cells: string) {
  if (cells === shown) return
  shown = cells
  if (bandId === undefined) return
  // Denied while the band is collapsed; the next draw shows `shown`.
  $.ui.blit({ requestId: bandId, key: 'clawd', cells }).catch(() => {})
}

// Always dancing: the spinner word's dance a move a beat while Claude works,
// the idle groove a move every other beat in between.
function tick($: EngineInterface) {
  ticks += 1
  if (demoAct >= 0) return stepDemo($)
  if (!isWorking && ticks % 2 === 1) return
  const next = isWorking ? danceFor(spinnerWord) : IDLE
  if (next.name !== dance) {
    dance = next.name
    beat = -1
  }
  const moves = framesOf(next)
  beat = (beat + 1) % moves.length
  paint($, moves[beat]!)
}

function stepDemo($: EngineInterface) {
  const act = DEMO[demoAct]
  if (act === undefined) {
    demoAct = -1
    dance = ''
    update($, demoLabel, () => null).catch(() => {})
    return
  }
  if (demoBeat === 0) {
    const label = `${act.word}  ${act.dance.name.split(':')[0]}  ${demoAct + 1}/${DEMO.length}`
    update($, demoLabel, () => label).catch(() => {})
  }
  const moves = framesOf(act.dance)
  paint($, moves[demoBeat % moves.length]!)
  demoBeat += 1
  if (demoBeat >= beatsOf(act.dance)) {
    demoAct += 1
    demoBeat = 0
  }
}

function startDancing($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  $.clock.every(TICK_MS, () => tick($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (e.isInteractive) startDancing($)
    await $.command.register({
      name: 'clawd-demo',
      description: 'Watch Clawd do every dance, one after another',
    })
    return next(e)
  })

  on('command.run', { command: 'clawd-demo' }, $ => {
    startDancing($)
    demoAct = 0
    demoBeat = 0
    const seconds = Math.round(DEMO_MS / 1000)
    return { text: `Clawd is doing all ${DEMO.length} dances in a row (about ${seconds}s). Watch above the prompt.` }
  })

  on('turn.start', ($, e, next) => {
    startDancing($)
    isWorking = true
    turnId = e.turnId
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && e.turnId === turnId) isWorking = false
    return next(e)
  })

  // The spinner's word ("Moonwalking", "Pondering") picks the dance; the
  // spinner itself is drawn as the engine draws it.
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    spinnerWord = e.props.word
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)

    bandId = e.requestId
    isWorking = e.props.isWorking
    const label = await read($, demoLabel)

    const { Box, Raster, Text } = $.ui.resolve(e)
    const clawd = <Raster key="clawd" columns={COLUMNS} rows={ROWS} cells={shown} />
    if (label === null) return <Box>{clawd}</Box>
    return (
      <Box>
        {clawd}
        <Text dimColor>
          {' ' + label}
        </Text>
      </Box>
    )
  })
}
