import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { DEMO, DEMO_MS, danceFor, framesOf, IDLE, isSecretTurn, SPLIT, TICK_MS } from '../hooks/register'

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

// Stands in for the engine beneath the mod; returns the cells each blit painted.
function engine(on: On): string[] {
  const blits: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
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

test('Clawd grooves slowly while idle and dances the spinner word at full speed', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ key: 'clawd' }))?.props.cells).toBeDefined()

  await clock.advance(TICK_MS * 8)
  expect(blits).toHaveLength(4)
  for (const cells of blits) expect(framesOf(IDLE)).toContain(cells)

  await $.turn.start({ text: 'hi', turnId: NORMAL_ID })
  const row = await $.ui.mount(spinner('Moonwalking'))
  expect(await row.find({ type: 'Text', text: 'engine' })).toBeDefined()
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  expect(blits).toHaveLength(8)
  for (const cells of blits) expect(framesOf(danceFor('Moonwalking'))).toContain(cells)

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: NORMAL_ID, reason: 'answer' })
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  expect(blits).toHaveLength(4)
})

test('Clawd steps aside for a survey', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ key: 'clawd' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
})

test('/clawd-demo plays every dance in a row, then goes back to grooving', async ($, on) => {
  const clock = mock.clock(on)
  const blits = engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)
  const ran = await $.command.run({
    command: 'clawd-demo',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toContain(`all ${DEMO.length} dances`)

  await clock.advance(TICK_MS)
  expect(await ui.find({ type: 'Text', text: `Moonwalking…  moonwalk  1/${DEMO.length}` })).toBeDefined()
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  for (const cells of blits) expect(framesOf(danceFor('Moonwalking'))).toContain(cells)

  await clock.advance(DEMO_MS)
  expect(await ui.find({ type: 'Text', text: /Moonwalking|between turns/ })).toBeUndefined()
  blits.length = 0
  await clock.advance(TICK_MS * 8)
  expect(blits).toHaveLength(4)
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
