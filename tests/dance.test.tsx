import type { ConfigRow, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  BOW,
  CALM,
  CARD,
  CHEER,
  COFFEE,
  CONFETTI_DANCE,
  DEMO,
  DEMO_MS,
  danceFor,
  discoFrame,
  FACEPALM,
  framesOf,
  HAMMER_TIME,
  hasPhrase,
  HEARTS,
  IDLE,
  isSecretTurn,
  NERD_IDLE,
  NAP,
  NERD_TYPING,
  SLEEP_AFTER_TICKS,
  SPLIT,
  STRETCH,
  TICK_MS,
  wordsOf,
} from '../hooks/register'

const BAND = {
  plugin: 'dancing-clawd',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const spinner = (word: string) =>
  ({
    plugin: 'dancing-clawd',
    surface: 'terminal',
    component: 'Spinner',
    props: { word, message: null, suffix: '…', mode: 'thinking' },
  }) as const

// Turn ids that do and don't set off the secret split.
const IDS = Array.from({ length: 2000 }, (_, i) => `turn-${i}`)
const SECRET_ID = IDS.find(isSecretTurn)!
const NORMAL_ID = IDS.find(id => !isSecretTurn(id))!

// Spinner words Claude Code samples, Moonwalking among them.
const WORDS = [
  'Accomplishing', 'Baking', 'Booping', 'Brewing', 'Cerebrating', 'Churning', 'Clauding',
  'Cogitating', 'Combobulating', 'Concocting', 'Conjuring', 'Contemplating', 'Cooking',
  'Crafting', 'Crunching', 'Deciphering', 'Discombobulating', 'Divining', 'Enchanting',
  'Finagling', 'Flibbertigibbeting', 'Forging', 'Frolicking', 'Germinating', 'Hatching',
  'Herding', 'Honking', 'Hustling', 'Ideating', 'Imagining', 'Incubating', 'Jiving',
  'Manifesting', 'Marinating', 'Meandering', 'Moonwalking', 'Mulling', 'Musing', 'Noodling',
  'Percolating', 'Perusing', 'Pondering', 'Puttering', 'Reticulating', 'Ruminating',
  'Schlepping', 'Shimmying', 'Simmering', 'Spelunking', 'Spinning', 'Stewing', 'Sussing',
  'Thinking', 'Tinkering', 'Transmuting', 'Vibing', 'Wandering', 'Whirring', 'Wibbling',
  'Wizarding', 'Wondering', 'Working', 'Wrangling',
]

const COMMAND = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

// Toasts the mod raised, in order.
let toasts: string[] = []

// Stands in for the engine beneath the mod, its theme setting as given and its
// store in memory; returns the cells each blit painted.
function engine(on: On, theme = 'dark', stored: Record<string, unknown> = {}): string[] {
  const blits: string[] = []
  toasts = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  mock.store(on, stored)
  const row: ConfigRow = {
    key: 'theme',
    label: 'Theme',
    kind: 'choice',
    value: theme,
    provider: { plugin: 'claude-code', tier: 'core' },
    isLocked: false,
  }
  on('config.list', () => ({ value: [row] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', ($, e) => {
    const isFail = e.tool === 'Bash' && e.command.includes('fail')
    return (isFail ? { result: {}, text: 'failed', isError: true } : { result: {}, text: 'ok' }) as never
  })
  on('config.set', ($, e) => ({ value: e.value }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('ui.blit', ($, e) => {
    if ('cells' in e) blits.push(e.cells)
    return { value: {} }
  })
  return blits
}

test('Clawd moonwalks only when the spinner says Moonwalking', () => {
  expect(danceFor('Moonwalking').name).toBe('moonwalk')
  for (const word of WORDS.filter(w => w !== 'Moonwalking')) {
    expect(danceFor(word).name).not.toContain('moonwalk')
  }
})

test('each kind of spinner word gets its own dance', () => {
  const kinds = ['Frolicking', 'Wondering', 'Cooking', 'Spinning', 'Flibbertigibbeting', 'Wandering', 'Clauding', 'Noodling', 'Moonwalking']
  expect(new Set(kinds.map(w => danceFor(w).name)).size).toBe(kinds.length)
  expect(danceFor('Pondering').name).not.toBe(danceFor('Wondering').name)
  expect(danceFor('Pondering').name).toStartWith('ponder:')
})

test('Clawd hangs about calmly between turns and dances the spinner word at full speed', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ key: 'clawd' }))?.props.cells).toBeDefined()

  await clock.advance(TICK_MS * 24)
  expect(blits.length).toBeGreaterThan(0)
  expect(blits.length).toBeLessThan(6)
  for (const cells of blits) expect(framesOf(IDLE)).toContain(cells)

  await $.turn.start({ text: 'hi', turnId: NORMAL_ID })
  const row = await $.ui.mount(spinner('Moonwalking'))
  expect(await row.find({ type: 'Text', text: 'engine' })).toBeDefined()
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  expect(blits).toHaveLength(8)
  for (const cells of blits) expect(framesOf(danceFor('Moonwalking'))).toContain(cells)

  // A little bow when the reply is done, then back to hanging about.
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: NORMAL_ID, reason: 'answer' })
  blits.length = 0
  await clock.advance(TICK_MS * 16)
  expect(framesOf(BOW)).toContain(blits[0])
  for (const cells of blits) expect([...framesOf(BOW), ...framesOf(IDLE)]).toContain(cells)
})

test('Clawd steps aside for a survey', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ key: 'clawd' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
})

test('/clawd-demo plays every dance in a row, then goes back to hanging about', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)
  const ran = await $.command.run({ command: 'clawd-demo', ...COMMAND })
  expect(ran.text).toBeUndefined()
  expect(toasts.at(-1)).toContain(`all ${DEMO.length} dances`)

  await clock.advance(TICK_MS)
  expect(await ui.find({ type: 'Text', text: `Moonwalking…  moonwalk  1/${DEMO.length}` })).toBeDefined()
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  for (const cells of blits) expect(framesOf(danceFor('Moonwalking'))).toContain(cells)

  await clock.advance(DEMO_MS)
  expect(await ui.find({ type: 'Text', text: /Moonwalking|between turns/ })).toBeUndefined()
  blits.length = 0
  await clock.advance(TICK_MS * 30)
  for (const cells of blits) expect(framesOf(IDLE)).toContain(cells)
})

test('the secret split turns up about one turn in twenty', () => {
  const rate = IDS.filter(isSecretTurn).length / IDS.length
  expect(rate).toBeGreaterThan(0.03)
  expect(rate).toBeLessThan(0.07)
  expect(SPLIT.frames.some(frame => frame.length === 2)).toBe(true)
  expect(DEMO.map(act => act.dance.name)).not.toContain('split')
})

test('a secret turn plays the split once, then the spinner word dance', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.ui.mount(BAND)
  await $.turn.start({ text: 'hi', turnId: SECRET_ID })
  await $.ui.mount(spinner('Moonwalking'))
  await clock.advance(TICK_MS * SPLIT.frames.length)
  expect(blits.length).toBeGreaterThan(SPLIT.frames.length / 2)
  for (const cells of blits) expect(framesOf(SPLIT)).toContain(cells)

  blits.length = 0
  await clock.advance(TICK_MS * 8)
  expect(blits).toHaveLength(8)
  for (const cells of blits) expect(framesOf(danceFor('Moonwalking'))).toContain(cells)
})

// Every cell of a frame as [codePoint, foreground, background].
function cellsOf(cells: string): [number, number, number][] {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (let i = 0; i < cells.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | Math.max(0, B64.indexOf(cells[i + k] ?? '=')), 0)
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  const view = new DataView(Uint8Array.from(bytes).buffer)
  const out: [number, number, number][] = []
  for (let o = 0; o + 12 <= bytes.length; o += 12) {
    out.push([view.getUint32(o, true), view.getUint32(o + 4, true), view.getUint32(o + 8, true)])
  }
  return out
}

test('no frame of any dance draws ▛, which terminals split with a hairline', () => {
  const dances = [IDLE, SPLIT, CALM, NERD_IDLE, NERD_TYPING, BOW, STRETCH, NAP, ...WORDS.map(danceFor), ...DEMO.map(act => act.dance)]
  for (const dance of dances) {
    for (const frame of framesOf(dance)) {
      const seamy = cellsOf(frame).filter(([glyph]) => glyph === 0x259b)
      expect(seamy).toEqual([])
    }
  }
})

async function fingerprint(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

// The real phrase never appears here: these use a stand-in with its own fingerprint.
test('a phrase is found anywhere in a prompt, whatever its case and punctuation', async () => {
  expect(wordsOf("Let’s GO, party-people!!")).toEqual(['lets', 'go', 'party', 'people'])
  const standIn = await fingerprint('hello there friend')
  expect(await hasPhrase('Well... HELLO, there friend!', standIn, 3)).toBe(true)
  expect(await hasPhrase('hello friend there', standIn, 3)).toBe(false)
  expect(await hasPhrase('make it dance', standIn, 3)).toBe(false)
})

test('an ordinary prompt starts no party', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.ui.mount(BAND)
  await $.prompt.submit({
    text: 'make it dance, and lets get the tests passing',
    wait: false,
    origin: { kind: 'composer' },
  })
  await clock.advance(TICK_MS * 30)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(IDLE)).toContain(cells)
})

test('the disco ball spins beside Clawd and sparkles pop, with no ▛ anywhere', () => {
  const sparkles = new Set([0xb7, 0x2727, 0x2726])
  let sparkled = 0
  for (let beat = 0; beat < 64; beat++) {
    const cells = cellsOf(discoFrame(beat))
    expect([0x259a, 0x259e]).toContain(cells[1]![0])
    expect([0x259a, 0x259e]).toContain(cells[2]![0])
    expect(cells.filter(([glyph]) => glyph === 0x259b)).toEqual([])
    if (cells.some(([glyph]) => sparkles.has(glyph))) sparkled += 1
  }
  expect(sparkled).toBeGreaterThan(32)
  expect(cellsOf(discoFrame(0))[1]![0]).not.toBe(cellsOf(discoFrame(1))[1]![0])
})

test('/clawd-chill sets him chilling with a cigarette, and toggles back', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.ui.mount(BAND)
  const chill = await $.command.run({ command: 'clawd-chill', ...COMMAND })
  expect(chill.text).toBeUndefined()
  expect(toasts.at(-1)).toContain('chilling')

  await clock.advance(TICK_MS * 30)
  expect(blits).toHaveLength(10)
  for (const cells of blits) expect(framesOf(CALM)).toContain(cells)
  // Drawn mid-chill, the band validates: cigarette and smoke included.
  expect(await (await $.ui.mount(BAND)).find({ key: 'clawd' })).toBeDefined()

  await $.command.run({ command: 'clawd-chill', ...COMMAND })
  expect(toasts.at(-1)).toContain('dance floor')
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  for (const cells of blits) expect(framesOf(IDLE)).toContain(cells)
})

test('calm is remembered from one session to the next', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on, 'dark', { calm: true })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.ui.mount(BAND)
  await clock.advance(TICK_MS * 12)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(CALM)).toContain(cells)
})

test('on a light theme he is a nerd who types while Claude works, and dances again in the dark', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on, 'light')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.ui.mount(BAND)
  await clock.advance(TICK_MS * 8)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(NERD_IDLE)).toContain(cells)
  // Drawn by day, the band validates: glasses and bow tie included.
  expect(await (await $.ui.mount(BAND)).find({ key: 'clawd' })).toBeDefined()

  await $.turn.start({ text: 'hi', turnId: NORMAL_ID })
  await $.ui.mount(spinner('Moonwalking'))
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  for (const cells of blits) expect(framesOf(NERD_TYPING)).toContain(cells)

  await $.config.set({
    key: 'theme',
    value: 'dark',
    previous: 'light',
    provider: { plugin: 'claude-code', tier: 'core' },
    origin: { kind: 'composer' },
  })
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  for (const cells of blits) expect(framesOf(danceFor('Moonwalking'))).toContain(cells)
})

const PROMPT = { wait: false, origin: { kind: 'composer' } } as const

test('after a few quiet minutes he naps and stops ticking, and a prompt wakes him with a stretch', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.ui.mount(BAND)
  await clock.advance(TICK_MS * (SLEEP_AFTER_TICKS + 2))
  expect(blits.at(-1)).toBe(framesOf(NAP)[0])
  expect(toasts.some(text => text.includes('New move: Nap!'))).toBe(true)

  blits.length = 0
  await clock.advance(TICK_MS * 200)
  expect(blits).toEqual([])

  await $.prompt.submit({ text: 'morning', ...PROMPT })
  await clock.advance(TICK_MS * 6)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(STRETCH)).toContain(cells)
})

test('he reacts to Claude: hammers on edits, cheers or facepalms at tests, confetti on a commit', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)
  const settle = async () => {
    await clock.advance(TICK_MS * 30)
    blits.length = 0
  }

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.ui.mount(BAND)
  await $.turn.start({ text: 'hi', turnId: NORMAL_ID })
  await settle()

  await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(TICK_MS * 4)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(HAMMER_TIME)).toContain(cells)
  await settle()

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(TICK_MS * 4)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(CHEER)).toContain(cells)
  await settle()

  await $.tool.call({ tool: 'Bash', command: 'npm test -- --fail' })
  await clock.advance(TICK_MS * 4)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(FACEPALM)).toContain(cells)
  await settle()

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "dance"' })
  await clock.advance(TICK_MS * 4)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(CONFETTI_DANCE)).toContain(cells)
})

test('his toys show on hover and set him off, and new moves go on the dance card', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, viewport: { columns: 80, rows: 24, isFullscreen: true } })
  expect(await ui.find({ key: 'pet' })).toBeDefined()

  await ui.press({ key: 'pet' })
  await clock.advance(TICK_MS * 6)
  expect(blits.length).toBeGreaterThan(0)
  for (const cells of blits) expect(framesOf(HEARTS)).toContain(cells)
  expect(toasts.some(text => text.includes('New move: Hearts!'))).toBe(true)

  blits.length = 0
  await ui.press({ key: 'coffee' })
  await clock.advance(TICK_MS * 6)
  for (const cells of blits) expect(framesOf(COFFEE)).toContain(cells)
})

test('/clawd opens the dance card, secrets hidden until seen', async ($, on) => {
  engine(on, 'dark', { seen: ['moonwalk', 'hearts'] })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'clawd', ...COMMAND })
  expect(ran.text).toBeUndefined()

  const card = await $.ui.mount({
    plugin: 'dancing-clawd',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'clawd-card',
    props: {
      title: "Clawd's dance card",
      isFocused: true,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
  expect(await card.find({ type: 'Text', text: `Dance card: 2 of ${CARD.length} moves` })).toBeDefined()
  expect(await card.find({ type: 'Text', text: '✓ Moonwalk' })).toBeDefined()
  expect((await card.findAll({ type: 'Text', text: '★ ???' })).length).toBe(2)
})
