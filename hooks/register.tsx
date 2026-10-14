import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { DemoLabel, SeenMoves } from '../types'

// A mini Clawd, drawn the way Claude Code's own logo is: quadrant blocks, so
// each terminal cell is 2x2 pixels. The stage is 28x4 pixels, 14 cells by 2
// rows; Clawd is 11x4 of it and moves about the rest, with room for two of
// him. He only ever stands on even pixels: that keeps every outline cell
// clear of ▛, which terminals draw as two pieces with a hairline between.
const W = 28
const H = 4
const HOME = 8 // Clawd's left edge, in pixels, when he stands centered
const FAR_RIGHT = W - 12 // his left edge at the stage's right end
export const COLUMNS = W / 2
export const ROWS = H / 2
export const TICK_MS = 120 // one move per beat while Claude works; one per two beats idle

const ORANGE = 0xd77757
const EYE = 0x191a1b
const DEFAULT = 0x01000000 // the terminal's own color
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█' // indexed by mask: UL=1 UR=2 LL=4 LR=8

type Arm = 'mid' | 'up' | 'down' | 'in'
type Pose = {
  x: number // left edge on the stage, in pixels
  left: Arm
  right: Arm
  stride: number // feet stay on the ground; walking steps them out to his edges (1)
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
  swayLeft: [P({ x: HOME - 2, left: 'up', look: -1 }), P({ x: HOME - 2, look: -1 }), STAND],
  swayRight: [P({ x: HOME + 2, right: 'up', look: 1 }), P({ x: HOME + 2, look: 1 }), STAND],
  wave: [P({ left: 'up', look: -1 }), P({ right: 'up', look: 1 }), P({ left: 'up', look: -1 }), P({ right: 'up', look: 1 })],
  shimmy: [
    P({ x: HOME + 2, left: 'up', right: 'down' }),
    P({ x: HOME - 2, left: 'down', right: 'up' }),
    P({ x: HOME + 2, left: 'up', right: 'down' }),
    P({ x: HOME - 2, left: 'down', right: 'up' }),
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
    P({ x: HOME - 2, left: 'up' }),
    P({ x: HOME, right: 'up' }),
    P({ x: HOME + 2, right: 'up' }),
    P({ x: HOME, left: 'up' }),
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

// Walking: a cell a beat, feet stepping out and in, from one spot to another.
function walk(from: number, to: number, look: number): Pose[] {
  const poses: Pose[] = []
  const dir = 2 * Math.sign(to - from)
  for (let x = from, i = 0; x !== to + dir; x += dir, i++) {
    poses.push(P({ x, look, stride: i % 2 }))
  }
  return poses
}

// The moonwalk glides backwards: facing one way, sliding the other.
const MOONWALK_POSES = [
  ...walk(FAR_RIGHT, 0, 1),
  P({ x: 0, face: 'side', look: -1, left: 'in', right: 'in' }),
  ...walk(0, FAR_RIGHT, -1),
  P({ x: FAR_RIGHT, face: 'side', look: 1, left: 'in', right: 'in' }),
]
const WANDER_POSES = [
  ...walk(HOME, FAR_RIGHT, 1),
  P({ x: FAR_RIGHT, face: 'side', look: -1, left: 'in', right: 'in' }),
  ...walk(FAR_RIGHT, 0, -1),
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

// A frame is everyone on stage at one beat: Clawd, or Clawd and his twin.
type Frame = Pose[]
// `tempo` is beats per frame (1 when absent); `dress` adds what poses can't
// draw, such as glasses, a cigarette or smoke, to a frame's cells, placed
// from `x`, where Clawd stands in that frame.
export type Dance = {
  name: string
  frames: Frame[]
  tempo?: number
  dress?: (cells: Cell[], frame: number, x: number) => void
}
const solo = (poses: Pose[]): Frame[] => poses.map(pose => [pose])

export function danceFor(word: string | undefined): Dance {
  const w = (word ?? '').toLowerCase()
  if (w.startsWith('moonwalk')) return { name: 'moonwalk', frames: solo(MOONWALK_POSES) }
  if (/wander|meander|perambulat|schlep|mosey|spelunk|stroll|saunter|roam|explor|traips|herd/.test(w)) {
    return { name: 'wander', frames: solo(WANDER_POSES) }
  }
  const theme = THEMES.find(t => t.match.test(w))
  const phrases = theme ? [...theme.phrases, ...mix(w, 1, theme.phrases)] : mix(w, 3)
  return {
    name: `${theme?.name ?? 'mix'}:${phrases.join('+')}`,
    frames: solo(phrases.flatMap(p => PHRASES[p])),
  }
}

// Between turns he hangs about: mostly still, a blink, a glance each way, and
// one small move in a loop of about ten seconds.
const still = (n: number): Pose[] => Array.from({ length: n }, () => STAND)
export const IDLE: Dance = {
  name: 'idle',
  frames: solo([
    ...still(10),
    P({ blink: true }),
    ...still(6),
    P({ look: -1 }),
    P({ look: -1 }),
    P({ look: -1 }),
    ...still(2),
    P({ look: 1 }),
    P({ look: 1 }),
    P({ look: 1 }),
    ...still(5),
    P({ blink: true }),
    ...still(3),
    P({ left: 'up', look: -1 }),
    STAND,
    P({ right: 'up', look: 1 }),
    ...still(5),
  ]),
  tempo: 2,
}

// The secret move: Clawd shakes, splits in two, the twins dance facing each
// other and then side by side, and they merge back into one.
const TWIN_L = 2 // the twins' spots, a cell apart
const TWIN_R = 14
const facing = (a: Partial<Pose> = {}, b: Partial<Pose> = {}): Frame => [
  P({ x: TWIN_L, look: 1, ...a }),
  P({ x: TWIN_R, look: -1, ...b }),
]
const together = (pose: Partial<Pose> = {}, dx = 0): Frame => [
  P({ ...pose, x: TWIN_L + dx }),
  P({ ...pose, x: TWIN_R + dx }),
]
const one = (pose: Partial<Pose> = {}): Frame => [P(pose)]
const halfway: Frame = [P({ x: HOME - 4, look: 1 }), P({ x: HOME + 4, look: -1 })]
const stretched: Frame = [P({ x: HOME - 2 }), P({ x: HOME + 2 })]
// The right twin steps in so their raised hands meet on one pixel.
const highFive = facing({ right: 'up' }, { x: TWIN_L + 10, left: 'up' })

export const SPLIT: Dance = {
  name: 'split',
  frames: [
    // shake, stretch, split
    one(),
    one({ x: HOME - 2, blink: true }),
    one({ x: HOME + 2, blink: true }),
    one({ x: HOME - 2, blink: true }),
    one({ x: HOME + 2, blink: true }),
    stretched,
    halfway,
    facing(),
    facing(),
    // face to face: wave, high five, step apart
    facing({ right: 'up' }, { left: 'up' }),
    facing(),
    facing({ right: 'up' }, { left: 'up' }),
    facing(),
    highFive,
    highFive,
    facing(),
    facing({ x: TWIN_L - 2, left: 'up', look: -1 }, { x: TWIN_R + 2, right: 'up', look: 1 }),
    facing({ x: TWIN_L - 2, look: -1 }, { x: TWIN_R + 2, look: 1 }),
    facing(),
    // side by side: raise the roof, sway left, sway right, spin
    together(),
    together({ left: 'up', right: 'up' }),
    together(),
    together({ left: 'up', right: 'up' }),
    together({ left: 'up', look: -1 }, -2),
    together({ look: -1 }, -2),
    together(),
    together({ right: 'up', look: 1 }, 2),
    together({ look: 1 }, 2),
    together(),
    together({ face: 'side', look: 1, left: 'in', right: 'in' }),
    together({ face: 'back' }),
    together({ face: 'side', look: -1, left: 'in', right: 'in' }),
    together(),
    // back into one
    facing(),
    halfway,
    stretched,
    one({ blink: true }),
    one(),
    one({ left: 'up', right: 'up' }),
    one(),
  ],
}

// Roughly one turn in SECRET_ODDS starts with the split, decided by the turn's id.
const SECRET_ODDS = 20
export const isSecretTurn = (id: string) => hash(`split:${id}`) % SECRET_ODDS === 0

function pixels(frame: Frame): Uint8Array {
  const grid = new Uint8Array(W * H)
  for (const pose of frame) draw(grid, pose)
  return grid
}

const EYE_PIXEL = 2

function draw(grid: Uint8Array, p: Pose) {
  const set = (x: number, y: number, value = 1) => {
    const at = p.x + x
    if (at >= 0 && at < W && y >= 0 && y < H) grid[y * W + at] = value
  }

  // A 9x3 body (7 wide side-on), eyes two pixels in from its edges, an arm
  // each side, two feet. Pixels are 1 for body, 2 for an eye.
  const side = p.face === 'side'
  for (let y = 0; y < 3; y++) for (let x = side ? 2 : 1; x <= (side ? 8 : 9); x++) set(x, y)
  if (!p.blink && p.face === 'front') {
    set(3 + p.look, 1, EYE_PIXEL)
    set(7 + p.look, 1, EYE_PIXEL)
  }
  if (!p.blink && side) set(p.look < 0 ? 3 : 7, 1, EYE_PIXEL)

  const ARM_ROW: Record<Arm, number | null> = { up: 0, mid: 2, down: 3, in: null }
  const leftRow = side ? null : ARM_ROW[p.left]
  const rightRow = side ? null : ARM_ROW[p.right]
  if (leftRow !== null) set(0, leftRow)
  if (rightRow !== null) set(10, rightRow)

  // Feet on odd pixels, the right half of a cell, so the body above them is
  // never drawn with ▛.
  set(3 - 2 * p.stride, 3)
  set(7 + 2 * p.stride, 3)
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
//
// A cell wholly inside Clawd is painted as background, with his eye drawn on
// it: terminals paint backgrounds as solid blocks, while a block character
// such as ▛ is two pieces that can leave a hairline between them. A cell on
// his outline must show the terminal's own background, so it stays a block
// character in orange.
type Cell = [glyph: number, foreground: number, background: number]
const BLANK: Cell = [0x20, DEFAULT, DEFAULT]

function cellsOf(frame: Frame): Cell[] {
  const grid = pixels(frame)
  const at = (x: number, y: number) => grid[y * W + x] ?? 0
  const cells: Cell[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      const x = c * 2
      const y = r * 2
      const quadrants = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)]
      const maskOf = (value: number) => quadrants.reduce((mask, q, i) => (q === value ? mask | (1 << i) : mask), 0)
      const isInside = !quadrants.includes(0)
      const mask = isInside ? maskOf(EYE_PIXEL) : maskOf(1)
      const ink = isInside ? EYE : ORANGE
      cells.push([QUADRANTS.charCodeAt(mask), mask ? ink : DEFAULT, isInside ? ORANGE : DEFAULT])
    }
  }
  return cells
}

function pack(cells: Cell[]): string {
  const bytes = new Uint8Array(cells.length * 12)
  const view = new DataView(bytes.buffer)
  cells.forEach(([glyph, foreground, background], i) => {
    view.setUint32(i * 12, glyph, true)
    view.setUint32(i * 12 + 4, foreground, true)
    view.setUint32(i * 12 + 8, background, true)
  })
  return base64(bytes)
}

export function encode(frame: Frame): string {
  return pack(cellsOf(frame))
}

// Disco: an easter egg. A certain phrase in a prompt sets a disco ball down
// beside Clawd for that whole reply (DISCO_MIN_BEATS at least): its facets
// spin, sparkles twinkle, and a burst pops off his hand whenever he strikes a
// pose. The phrase lives here only as its SHA-256 fingerprint.
const DISCO_FINGERPRINT = 'cd6d54a65a9209b90d5568f8fe39c82069f35a6558881bc1db3a6dd863656bf2'
const DISCO_WORDS = 3
export const DISCO_MIN_BEATS = Math.ceil(15_000 / TICK_MS)

export function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean)
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Whether any run of `size` words in the text has the fingerprint.
export async function hasPhrase(text: string, fingerprint = DISCO_FINGERPRINT, size = DISCO_WORDS): Promise<boolean> {
  const words = wordsOf(text).slice(0, 2_000)
  for (let i = 0; i + size <= words.length; i++) {
    if ((await sha256(words.slice(i, i + size).join(' '))) === fingerprint) return true
  }
  return false
}

const SILVER = 0xc9ccd1
const FACET_DARK = 0x6f7680
const FACET_LIGHT = 0xe9ebee
const GLINT = 0xffffff
const SPARKLE_COLORS = [0xf7e7b4, 0xffb3c7, 0xa8e6ff, 0xcdb8ff, 0xffffff] // champagne, rose, aqua, lilac, white
const SPARKLE = ['·', '✧', '✦', '✧', '·'] // a sparkle's life, a beat a step
const BALL = ['..####..', '.######.', '.######.', '..####..'] // 8x4 pixels at the stage's left

// He dances right of the ball, on even pixels like everywhere else.
const DISCO_HOME = 12
const DISCO_POSES: Pose[] = [
  // the point: up to the right, then up to the left
  P({ x: DISCO_HOME + 2, right: 'up', left: 'down', look: 1 }),
  P({ x: DISCO_HOME + 2, right: 'up', left: 'down', look: 1 }),
  P({ x: DISCO_HOME }),
  P({ x: DISCO_HOME - 2, left: 'up', right: 'down', look: -1 }),
  P({ x: DISCO_HOME - 2, left: 'up', right: 'down', look: -1 }),
  P({ x: DISCO_HOME }),
  // raise the roof
  P({ x: DISCO_HOME, left: 'up', right: 'up' }),
  P({ x: DISCO_HOME }),
  P({ x: DISCO_HOME, left: 'up', right: 'up', blink: true }),
  P({ x: DISCO_HOME }),
  // spin, and ta-da
  P({ x: DISCO_HOME, face: 'side', look: 1, left: 'in', right: 'in' }),
  P({ x: DISCO_HOME, face: 'back' }),
  P({ x: DISCO_HOME, face: 'side', look: -1, left: 'in', right: 'in' }),
  P({ x: DISCO_HOME, left: 'up', right: 'up' }),
  P({ x: DISCO_HOME }),
  P({ x: DISCO_HOME }),
]
export const DISCO_DANCE: Dance = { name: 'disco', frames: solo(DISCO_POSES) }

const poseAt = (beat: number) => DISCO_POSES[beat % DISCO_POSES.length]!

// The sparkles a beat sets off, as [row, column, color]: now and then one
// anywhere, and a burst beside each hand he has just thrown up.
function sparksAt(beat: number): [number, number, number][] {
  const h = hash(`spark:${beat}`)
  const sparks: [number, number, number][] = []
  if (h % 5 < 3) {
    sparks.push([(h >>> 4) % ROWS, (h >>> 8) % COLUMNS, SPARKLE_COLORS[(h >>> 16) % SPARKLE_COLORS.length]!])
  }
  const pose = poseAt(beat)
  const before = beat > 0 ? poseAt(beat - 1) : STAND
  const color = (k: number) => SPARKLE_COLORS[(beat + k) % SPARKLE_COLORS.length]!
  if (pose.left === 'up' && before.left !== 'up') {
    const hand = pose.x >> 1
    sparks.push([0, hand - 1, color(0)], [0, hand - 2, color(1)], [1, hand - 1, color(2)])
  }
  if (pose.right === 'up' && before.right !== 'up') {
    const hand = (pose.x + 10) >> 1
    sparks.push([0, hand + 1, color(3)], [0, hand + 2, color(4)], [1, hand + 1, color(0)])
  }
  return sparks
}

export function discoCells(beat: number): Cell[] {
  const cells = cellsOf([poseAt(beat)])

  // The ball, its facets flipping each beat as it turns and a glint going round.
  const spin = beat % 2
  const glint = (beat >> 1) % 4
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < BALL[0]!.length / 2; c++) {
      const on = (dx: number, dy: number) => (BALL[r * 2 + dy]![c * 2 + dx] === '#' ? 1 : 0)
      const mask = on(0, 0) | (on(1, 0) << 1) | (on(0, 1) << 2) | (on(1, 1) << 3)
      if (mask === 15) {
        const facet = (r + c + spin) % 2 ? '▚' : '▞'
        const isGlint = [1, 2, COLUMNS + 2, COLUMNS + 1][glint] === r * COLUMNS + c
        cells[r * COLUMNS + c] = [facet.charCodeAt(0), isGlint ? GLINT : FACET_LIGHT, FACET_DARK]
      } else if (mask) {
        cells[r * COLUMNS + c] = [QUADRANTS.charCodeAt(mask), SILVER, DEFAULT]
      }
    }
  }

  // Sparkles from the last few beats, each a step further through its life.
  for (let age = SPARKLE.length - 1; age >= 0; age--) {
    if (beat - age < 0) continue
    for (const [row, column, color] of sparksAt(beat - age)) {
      if (column < 0 || column >= COLUMNS) continue
      const cell = row * COLUMNS + column
      const [glyph, , background] = cells[cell] ?? BLANK
      if (glyph !== 0x20 || background !== DEFAULT) continue
      cells[cell] = [SPARKLE[age]!.charCodeAt(0), color, DEFAULT]
    }
  }
  return cells
}

export const discoFrame = (beat: number) => pack(discoCells(beat))

function put(cells: Cell[], row: number, column: number, glyph: string, foreground: number, background = DEFAULT) {
  if (column >= 0 && column < COLUMNS) cells[row * COLUMNS + column] = [glyph.charCodeAt(0), foreground, background]
}

// Calm (/clawd-chill): no dancing. He chills, eyes shut, a cigarette in hand,
// ASCII smoke curling up from the tip; the tip glows when he takes a drag, and
// now and then he opens his eyes to watch the smoke.
const SMOKE = [0xb8b8b8, 0x8f8f8f, 0x666666] // fading as it rises
const PUFF: [row: number, dx: number, glyph: string][] = [
  [0, 0, '.'],
  [0, 0, '('],
  [0, 1, ')'],
  [0, 1, '~'],
  [0, 2, '~'],
  [0, 2, "'"],
]
const CALM_FRAMES = 24
const PUFF_EVERY = 4
export const CALM: Dance = {
  name: 'calm',
  frames: solo(Array.from({ length: CALM_FRAMES }, (_, i) => P({ blink: i < 14 || i >= 18, look: 1 }))),
  tempo: 3,
  dress: (cells, i, x) => {
    const c = x >> 1
    const tip = c + 7
    const isDrag = i % 12 < 2
    // Shut eyes as two relaxed lines.
    if (i < 14 || i >= 18) {
      put(cells, 0, c + 1, '▁', EYE, ORANGE)
      put(cells, 0, c + 3, '▁', EYE, ORANGE)
    }
    // His hand, the cigarette and its tip, in pixels at hand height.
    put(cells, 1, c + 5, '▀', ORANGE)
    put(cells, 1, c + 6, '▀', 0xf2f2f2)
    put(cells, 1, tip, '▘', isDrag ? 0xffb066 : 0xe8553d)
    for (let start = i - (PUFF.length - 1); start <= i; start++) {
      if ((start + CALM_FRAMES) % PUFF_EVERY !== 0) continue
      const step = i - start
      const [row, dx, glyph] = PUFF[step]!
      put(cells, row, tip + dx, glyph, SMOKE[step >> 1]!)
    }
  },
}

// Day mode, on a light theme: Clawd only dances in the dark. By day he's a
// nerd in ʘ─ʘ glasses and a navy bow tie, typing away while Claude works and
// pushing his glasses up now and then.
const NAVY = 0x1f3a68
export const isLightTheme = (theme: unknown) => typeof theme === 'string' && theme.startsWith('light')
const nerdDress = (cells: Cell[], _frame: number, x: number) => {
  const c = x >> 1
  put(cells, 0, c + 1, 'ʘ', EYE, ORANGE)
  put(cells, 0, c + 2, '─', EYE, ORANGE)
  put(cells, 0, c + 3, 'ʘ', EYE, ORANGE)
  put(cells, 1, c + 2, '▀', NAVY)
}
const PUSH_GLASSES = P({ right: 'up' })
const NERD_IDLE_POSES = [STAND, STAND, STAND, STAND, STAND, STAND, PUSH_GLASSES, PUSH_GLASSES, STAND, STAND, STAND, STAND]
const NERD_TYPING_POSES = [
  P({ left: 'down' }),
  P({ right: 'down' }),
  P({ left: 'down' }),
  P({ right: 'down' }),
  P({ left: 'down', right: 'down' }),
  STAND,
  P({ left: 'down' }),
  P({ right: 'down' }),
  P({ left: 'down' }),
  P({ right: 'down' }),
  PUSH_GLASSES,
  PUSH_GLASSES,
]
export const NERD_IDLE: Dance = { name: 'nerd', frames: solo(NERD_IDLE_POSES), tempo: 2, dress: nerdDress }
export const NERD_TYPING: Dance = { name: 'typing', frames: solo(NERD_TYPING_POSES), dress: nerdDress }

// By day, anything he does keeps his glasses and bow tie on.
const dayDressed = new Map<string, Dance>()
function byDay(dance: Dance): Dance {
  let dressed = dayDressed.get(dance.name)
  if (dressed === undefined) {
    dressed = { ...dance, name: `${dance.name}+day`, dress: (cells, i, x) => (dance.dress?.(cells, i, x), nerdDress(cells, i, x)) }
    dayDressed.set(dance.name, dressed)
  }
  return dressed
}

// Reactions: short bursts for what Claude is doing, and for being played with.
const SHUT_EYES = (cells: Cell[], x: number) => {
  put(cells, 0, (x >> 1) + 1, '▁', EYE, ORANGE)
  put(cells, 0, (x >> 1) + 3, '▁', EYE, ORANGE)
}
const HAPPY_EYES = (cells: Cell[], x: number) => {
  put(cells, 0, (x >> 1) + 1, '^', EYE, ORANGE)
  put(cells, 0, (x >> 1) + 3, '^', EYE, ORANGE)
}
const GOLD = [0xffd479, 0xffffff, 0xf7e7b4]
const CONFETTI = [0xff8fb1, 0x7fd4ff, 0xffd479, 0x9be7a6, 0xcdb8ff]
// The columns either side of him, standing at x.
const freeColumns = (x: number) => Array.from({ length: COLUMNS }, (_, c) => c).filter(c => c < x >> 1 || c > (x >> 1) + 5)

export const PEER: Dance = {
  name: 'peer',
  frames: solo([P({ look: -1 }), P({ look: -1 }), P({ look: 1 }), P({ look: 1 }), P({ look: -1 }), P({ look: 1 })]),
  tempo: 2,
}
export const HAMMER_TIME: Dance = { name: 'hammer-time', frames: solo([...PHRASES.hammer, ...PHRASES.hammer]) }
export const TAP: Dance = { name: 'tap', frames: solo(NERD_TYPING_POSES.slice(0, 8)) }
export const BOW: Dance = {
  name: 'bow',
  frames: solo([P({ left: 'down', right: 'down', blink: true }), P({ left: 'down', right: 'down', blink: true }), STAND]),
  tempo: 3,
}
export const STRETCH: Dance = {
  name: 'stretch',
  frames: solo([P({ blink: true }), P({ left: 'up', right: 'up', blink: true }), ROOF, STAND]),
  tempo: 3,
  dress: (cells, i, x) => i < 2 && SHUT_EYES(cells, x),
}
export const CHEER: Dance = {
  name: 'cheer',
  frames: solo([ROOF, STAND, ROOF, STAND, ROOF, ROOF, STAND, ROOF]),
  dress: (cells, i, x) => {
    HAPPY_EYES(cells, x)
    const c = x >> 1
    for (const [row, column, k] of [[0, c - 1, 0], [0, c + 6, 1], [1, c - 2, 2], [1, c + 7, 0]] as const) {
      put(cells, row, column, (i + k) % 2 ? '✦' : '✧', GOLD[(i + k) % GOLD.length]!)
    }
  },
}
export const FACEPALM: Dance = {
  name: 'facepalm',
  frames: solo(Array.from({ length: 8 }, () => P({ left: 'up' }))),
  tempo: 2,
  dress: (cells, i, x) => {
    SHUT_EYES(cells, x)
    const c = x >> 1
    const drop = ['▝', '▗', '▝', '▗'][i >> 1]!
    put(cells, i < 4 ? 0 : 1, c + 6, drop, 0x7fc8ff)
  },
}
export const CONFETTI_DANCE: Dance = {
  name: 'confetti',
  frames: solo([ROOF, STAND, ROOF, STAND, ROOF, STAND, ROOF, STAND, ROOF, STAND, ROOF, STAND]),
  dress: (cells, i, x) => {
    HAPPY_EYES(cells, x)
    const free = freeColumns(x)
    for (let k = 0; k < 6; k++) {
      const age = i - k
      if (age < 0 || age > 5) continue
      const column = free[(k * 3 + 1) % free.length]!
      put(cells, age < 3 ? 0 : 1, column, ['*', '•', '·'][age % 3]!, CONFETTI[k % CONFETTI.length]!)
    }
  },
}
export const HEARTS: Dance = {
  name: 'hearts',
  frames: solo(Array.from({ length: 10 }, (_, i) => P({ blink: false, look: i % 4 < 2 ? -1 : 1 }))),
  tempo: 2,
  dress: (cells, i, x) => {
    HAPPY_EYES(cells, x)
    const c = x >> 1
    const path: [number, number][] = [[1, c + 6], [0, c + 6], [0, c + 7], [0, c + 8]]
    for (const [start, side] of [[0, 1], [3, -1]] as const) {
      const step = i - start
      if (step < 0 || step >= path.length) continue
      const [row, column] = path[step]!
      put(cells, row, side > 0 ? column : 2 * c + 5 - column, '♥', step < 2 ? 0xff6b9a : 0xffb3c7)
    }
  },
}
export const COFFEE: Dance = {
  name: 'coffee',
  frames: solo([...PHRASES.shimmy, ...PHRASES.shimmy, ROOF, STAND]),
  dress: (cells, i, x) => i < 4 && put(cells, 0, (x >> 1) + 6, '!', 0xffd479),
}
export const NAP: Dance = {
  name: 'nap',
  frames: solo([P({ blink: true })]),
  dress: (cells, _i, x) => {
    SHUT_EYES(cells, x)
    put(cells, 0, (x >> 1) + 6, 'z', 0x9fa8da)
    put(cells, 0, (x >> 1) + 7, 'Z', 0xc5cae9)
  },
}

// Bash commands that run tests, for cheering or facepalming at the outcome.
export const isTestCommand = (command: string) =>
  /\b(test|tests|pytest|jest|vitest|mocha|rspec|phpunit|unittest|ctest|go test|cargo test|claude plugin test|apex run test)\b/.test(command)
export const isCommitCommand = (command: string) => /\bgit\s+commit\b/.test(command)
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'LS'])
const EDITING_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// The dance card: every move there is to see, two of them secret.
export const CARD: { id: string; name: string; isSecret?: true }[] = [
  { id: 'moonwalk', name: 'Moonwalk' },
  { id: 'wander', name: 'Stroll' },
  { id: 'spin', name: 'Spin' },
  { id: 'shimmy', name: 'Shimmy' },
  { id: 'ponder', name: 'Ponder' },
  { id: 'stir', name: 'Stir the pot' },
  { id: 'hammer', name: 'Hammer time' },
  { id: 'frolic', name: 'Frolic' },
  { id: 'flail', name: 'Flail' },
  { id: 'magic', name: 'Magic' },
  { id: 'wave', name: 'Wave' },
  { id: 'mix', name: 'Freestyle' },
  { id: 'calm', name: 'Chill' },
  { id: 'nerd', name: 'Day job' },
  { id: 'nap', name: 'Nap' },
  { id: 'cheer', name: 'Victory dance' },
  { id: 'facepalm', name: 'Facepalm' },
  { id: 'confetti', name: 'Confetti' },
  { id: 'hearts', name: 'Hearts' },
  { id: 'coffee', name: 'Caffeinated' },
  { id: 'split', name: 'Twin split', isSecret: true },
  { id: 'disco', name: 'Disco', isSecret: true },
]
// The card entry a dance counts toward, if any.
export const cardIdOf = (danceName: string) => {
  const id = danceName.split(/[:+]/)[0]!
  const alias: Record<string, string> = { typing: 'nerd' }
  const card = alias[id] ?? id
  return CARD.some(entry => entry.id === card) ? card : undefined
}

const frames = new Map<string, string[]>()
export function framesOf(dance: Dance): string[] {
  let encoded = frames.get(dance.name)
  if (encoded === undefined) {
    encoded = dance.frames.map((frame, i) => {
      const cells = cellsOf(frame)
      dance.dress?.(cells, i, frame[0]?.x ?? HOME)
      return pack(cells)
    })
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
  { word: '/clawd-chill', dance: CALM },
  { word: 'light theme, working', dance: NERD_TYPING },
  { word: 'tests pass', dance: CHEER },
  { word: 'tests fail', dance: FACEPALM },
  { word: 'git commit', dance: CONFETTI_DANCE },
  { word: '♥', dance: HEARTS },
  { word: '☕', dance: COFFEE },
  { word: 'after 3 quiet minutes', dance: NAP },
]
const loopOf = (dance: Dance) => dance.frames.length * (dance.tempo ?? 1)
const beatsOf = (dance: Dance) => loopOf(dance) * Math.ceil(DEMO_MIN_BEATS / loopOf(dance))
export const DEMO_MS = DEMO.reduce((sum, act) => sum + beatsOf(act.dance), 0) * TICK_MS

const demoLabel = atom({ plugin: 'dancing-clawd', key: 'demoLabel' } as const, null as DemoLabel)
const seenMoves = atom({ plugin: 'dancing-clawd', key: 'seen' } as const, [] as SeenMoves)
const CARD_PANE = 'clawd-card'

// After a few quiet minutes he falls asleep and the ticking stops.
export const SLEEP_AFTER_TICKS = Math.round((3 * 60_000) / TICK_MS)
const REQUESTABLE = DEMO_WORDS.filter(word => word !== 'Moonwalking') // the moonwalk stays Moonwalking's

// What the band shows and why; module state starts over on each reload.
let bandId: string | undefined
let shown = encode([STAND])
let isTicking = false
let isWorking = false
let turnId: string | undefined
let spinnerWord: string | undefined
let dance = IDLE.name
let beat = 0
let ticks = 0
let demoAct = -1 // the DEMO entry playing, or -1
let demoBeat = 0
let secretBeat = -1 // the SPLIT frame playing, or -1
let discoBeat = -1 // beats into the party, or -1
let discoTurn: string | undefined // the reply the party lasts for
let isDiscoTurnDone = false
let isCalm = false // /clawd-chill, remembered in the store
let isDay = false // a light theme
let reaction: { dance: Dance; beat: number } | undefined // a short burst playing
let idleTicks = 0
let isAsleep = false
let timer: Timer | undefined
let seen = new Set<string>() // the dance card, mirrored in the store and in `seenMoves`

function paint($: EngineInterface, cells: string) {
  if (cells === shown) return
  shown = cells
  if (bandId === undefined) return
  // Denied while the band is collapsed; the next draw shows `shown`.
  $.ui.blit({ requestId: bandId, key: 'clawd', cells }).catch(() => {})
}

// While Claude works his dances travel: the whole dance drifts across the
// strip and back, a cell (two pixels, so still on even pixels) every
// TRAVEL_EVERY beats, up to TRAVEL_REACH pixels either side of home.
const TRAVEL_EVERY = 4
const TRAVEL_REACH = 6
export const travelOffset = (tick: number) => {
  const steps = TRAVEL_REACH // one way, in cells
  const k = Math.floor(tick / TRAVEL_EVERY) % (2 * steps)
  return (k <= steps ? k : 2 * steps - k) * 2 - TRAVEL_REACH
}
const travelled = new Map<string, Dance>()
export function travelling(dance: Dance, dx: number): Dance {
  if (dx === 0) return dance
  const key = `${dance.name}@${dx}`
  let moved = travelled.get(key)
  if (moved === undefined) {
    moved = { ...dance, name: key, frames: dance.frames.map(frame => frame.map(pose => ({ ...pose, x: pose.x + dx }))) }
    travelled.set(key, moved)
  }
  return moved
}
// The moonwalk and the stroll have paths of their own.
const travels = (dance: Dance) => isWorking && !isCalm && !isDay && dance.name !== 'moonwalk' && dance.name !== 'wander'

// Calm when he's been told to chill, a nerd on a light theme, and otherwise
// the spinner word's dance while Claude works and the idle groove in between.
function currentDance(): Dance {
  if (isCalm) return CALM
  if (isDay) return isWorking ? NERD_TYPING : NERD_IDLE
  return isWorking ? danceFor(spinnerWord) : IDLE
}

function tick($: EngineInterface) {
  ticks += 1
  if (demoAct >= 0) return stepDemo($)
  if (discoBeat >= 0) return stepDisco($)
  if (secretBeat >= 0) return stepSecret($)
  if (reaction !== undefined) return stepReaction($)
  idleTicks = isWorking ? 0 : idleTicks + 1
  if (idleTicks >= SLEEP_AFTER_TICKS) return fallAsleep($)
  const next = currentDance()
  if (ticks % (next.tempo ?? 1) !== 0) return
  if (next.name !== dance) {
    dance = next.name
    beat = -1
    markSeen($, cardIdOf(next.name))
  }
  const moves = framesOf(travels(next) ? travelling(next, travelOffset(ticks)) : next)
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
  paint($, moves[Math.floor(demoBeat / (act.dance.tempo ?? 1)) % moves.length]!)
  demoBeat += 1
  if (demoBeat >= beatsOf(act.dance)) {
    demoAct += 1
    demoBeat = 0
  }
}

// The split plays once through at full speed, then the dance starts over.
function stepSecret($: EngineInterface) {
  const moves = framesOf(SPLIT)
  paint($, moves[secretBeat]!)
  secretBeat += 1
  if (secretBeat >= moves.length) {
    secretBeat = -1
    dance = ''
  }
}

// The party lasts the reply it started with, and DISCO_MIN_BEATS at least; a
// prompt that starts no reply (a slash command) ends it after the minimum.
function stepDisco($: EngineInterface) {
  paint($, discoFrame(discoBeat))
  discoBeat += 1
  if (discoTurn === undefined && discoBeat > 16) isDiscoTurnDone = true
  if (isDiscoTurnDone && discoBeat >= DISCO_MIN_BEATS) {
    discoBeat = -1
    discoTurn = undefined
    dance = ''
  }
}

// A reaction plays once through at its own tempo, by day in glasses.
function stepReaction($: EngineInterface) {
  const playing = reaction!
  const tempo = playing.dance.tempo ?? 1
  const dressed = isDay ? byDay(playing.dance) : playing.dance
  const moves = framesOf(isWorking && !isCalm && !isDay ? travelling(dressed, travelOffset(ticks)) : dressed)
  if (playing.beat % tempo === 0) paint($, moves[playing.beat / tempo]!)
  playing.beat += 1
  if (playing.beat >= moves.length * tempo) {
    reaction = undefined
    dance = ''
  }
}

// Something Claude did, or a press of his buttons. A reaction to an outcome
// (`isOutcome`) cuts in; one to a call starting waits for any playing to end.
function react($: EngineInterface, burst: Dance, isOutcome = false) {
  if (!isOutcome && reaction !== undefined) return
  reaction = { dance: burst, beat: 0 }
  idleTicks = 0
  startDancing($)
  markSeen($, cardIdOf(burst.name))
}

function fallAsleep($: EngineInterface) {
  paint($, framesOf(NAP)[0]!)
  markSeen($, 'nap')
  isAsleep = true
  isTicking = false
  timer?.cancel()
  timer = undefined
}

// The first time a move shows, it goes on the dance card (the demo doesn't count).
function markSeen($: EngineInterface, id: string | undefined) {
  if (id === undefined || seen.has(id) || demoAct >= 0) return
  const entry = CARD.find(card => card.id === id)
  if (entry === undefined) return
  seen.add(id)
  const list = [...seen]
  $.store.set('seen', list).catch(() => {})
  update($, seenMoves, () => list).catch(() => {})
  $.ui.toast(`New move: ${entry.name}! ${seen.size} of ${CARD.length} on your dance card (/clawd).`)
}

function noticeToolStart($: EngineInterface, tool: string) {
  if (isCalm) return
  if (EDITING_TOOLS.has(tool)) react($, HAMMER_TIME)
  else if (READING_TOOLS.has(tool)) react($, PEER)
  else if (tool === 'Bash') react($, TAP)
}

function noticeCommand($: EngineInterface, command: string, isOk: boolean) {
  if (isCalm) return
  if (isTestCommand(command)) react($, isOk ? CHEER : FACEPALM, true)
  else if (isCommitCommand(command) && isOk) react($, CONFETTI_DANCE, true)
}

function pet($: EngineInterface) {
  react($, HEARTS, true)
}

function giveCoffee($: EngineInterface) {
  react($, COFFEE, true)
}

function requestDance($: EngineInterface) {
  react($, danceFor(REQUESTABLE[hash(`request:${ticks}`) % REQUESTABLE.length]), true)
}

// Starts the ticking, waking him with a stretch if he's asleep.
function startDancing($: EngineInterface) {
  if (isAsleep) {
    isAsleep = false
    reaction = { dance: STRETCH, beat: 0 }
  }
  idleTicks = 0
  if (isTicking) return
  isTicking = true
  timer = $.clock.every(TICK_MS, () => tick($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (e.isInteractive) startDancing($)
    // Both run at once, even mid-reply, and answer with a toast: Clawd never
    // holds Claude up or puts words in its conversation.
    await $.command.register({
      name: 'clawd-demo',
      description: 'Watch Clawd do every dance, one after another',
      immediate: true,
    })
    await $.command.register({
      name: 'clawd-chill',
      description: 'Clawd stops dancing and chills; run it again to get him dancing',
      immediate: true,
    })
    await $.command.register({
      name: 'clawd',
      description: "Clawd's dance card, and everything he can do",
      immediate: true,
    })
    try {
      const stored = await $.store.get('seen')
      seen = new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [])
      const list = [...seen]
      await update($, seenMoves, () => list)
      isCalm = (await $.store.get('calm')) === true
      isDay = isLightTheme((await $.config.list()).find(row => row.key === 'theme')?.value)
    } catch {
      // Without the store or the settings he just dances.
    }
    return next(e)
  })

  on('command.run', { command: 'clawd' }, async $ => {
    const opened = await $.ui.open({ id: CARD_PANE, title: "Clawd's dance card", focus: true, closeOnEscape: true })
    if (!opened.isPlaced) $.ui.toast(`${seen.size} of ${CARD.length} moves on your dance card. Widen the terminal to see it.`)
    return {}
  })

  on('command.run', { command: 'clawd-chill' }, async $ => {
    startDancing($)
    isCalm = !isCalm
    if (isCalm) markSeen($, 'calm')
    await $.store.set('calm', isCalm).catch(() => {})
    $.ui.toast(isCalm ? 'Clawd is chilling. /clawd-chill again to get him dancing.' : 'Clawd is back on the dance floor.')
    return {}
  })

  // Day mode follows the theme as it changes.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) isDay = isLightTheme(e.value)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'clawd-demo' }, $ => {
    startDancing($)
    demoAct = 0
    demoBeat = 0
    const seconds = Math.round(DEMO_MS / 1000)
    $.ui.toast(`Clawd is doing all ${DEMO.length} dances in a row, about ${seconds}s. Watch above the prompt.`)
    return {}
  })

  on('turn.start', ($, e, next) => {
    startDancing($)
    isWorking = true
    turnId = e.turnId
    if (discoBeat >= 0 && discoTurn === undefined) discoTurn = e.turnId
    else if (isSecretTurn(e.turnId) && demoAct < 0 && discoBeat < 0 && !isCalm && !isDay) {
      secretBeat = 0
      markSeen($, 'split')
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && e.turnId === turnId) {
      isWorking = false
      if (!isCalm) react($, BOW)
    }
    if (e.agentId === undefined && e.turnId === discoTurn) isDiscoTurnDone = true
    return next(e)
  })

  // He reacts to what Claude does, never changing it: the call and its result
  // pass through untouched.
  on('tool.call', async ($, e, next) => {
    noticeToolStart($, String(e.tool))
    const result = await next(e)
    if (e.tool === 'Bash' && result.deny === undefined) {
      const record = result.result as { backgroundTaskId?: string } | undefined
      if (record?.backgroundTaskId === undefined) noticeCommand($, e.command, result.isError !== true)
    }
    return result
  }).catch(($, e, next) => next(e)) // a fault of his never stops a call or runs it twice

  // The prompt goes on to Claude unchanged; the right words also start a party.
  on('prompt.submit', async ($, e, next) => {
    startDancing($)
    if (await hasPhrase(e.text)) {
      markSeen($, 'disco')
      discoBeat = 0
      discoTurn = e.turnId
      isDiscoTurnDone = false
    }
    return next(e)
  }).catch(($, e, next) => next(e))

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

    const { Box, Button, Raster, Text } = $.ui.resolve(e)
    // His toys show while the pointer is over him; where nothing hovers, always (dim).
    const canHover = e.viewport?.isFullscreen === true
    const reveal = canHover ? ({ display: 'none', hover: { display: 'flex' } } as const) : {}
    return (
      <Box key="clawd-band" alignItems="center">
        <Raster key="clawd" columns={COLUMNS} rows={ROWS} cells={shown} />
        <Box gap={1} {...reveal}>
          <Button key="pet" plain hotkey="1" onPress={() => pet($)}>
            <Text dimColor={!canHover}>♥</Text>
          </Button>
          <Button key="coffee" plain hotkey="2" onPress={() => giveCoffee($)}>
            <Text dimColor={!canHover}>☕</Text>
          </Button>
          <Button key="dance" plain hotkey="3" onPress={() => requestDance($)}>
            <Text dimColor={!canHover}>♪</Text>
          </Button>
        </Box>
        {label === null ? null : <Text dimColor>{' ' + label}</Text>}
      </Box>
    )
  })

  // /clawd: the dance card, and how to play with him.
  on('ui.render', { component: 'Pane', requestId: CARD_PANE }, async ($, e) => {
    const ids = await read($, seenMoves)
    const { Box, Text } = $.ui.resolve(e)
    const line = (entry: (typeof CARD)[number]) =>
      ids.includes(entry.id) ? (
        <Text>{`✓ ${entry.name}`}</Text>
      ) : (
        <Text dimColor>{entry.isSecret ? '★ ???' : '· ???'}</Text>
      )
    const half = Math.ceil(CARD.length / 2)
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>{`Dance card: ${ids.length} of ${CARD.length} moves`}</Text>
        <Box gap={4} marginTop={1}>
          <Box flexDirection="column">{CARD.slice(0, half).map(line)}</Box>
          <Box flexDirection="column">{CARD.slice(half).map(line)}</Box>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Hover over Clawd for ♥ ☕ ♪, or ctrl+x tab to his strip and press 1 2 3.</Text>
          <Text dimColor>/clawd-chill  he chills, or dances again</Text>
          <Text dimColor>/clawd-demo   every move in a row</Text>
          <Text dimColor>★ moves are secret. Esc closes this.</Text>
        </Box>
      </Box>
    )
  })
}
