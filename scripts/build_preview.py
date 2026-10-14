#!/usr/bin/env python3
"""Builds assets/preview.svg, the README's animated preview, from Clawd's real frames.

The frames come from the mod itself: a throwaway test prints them through
`claude plugin test`, so the picture always matches what the terminal draws.
It ends on a teaser of the disco; the words that start it stay secret.

    python3 scripts/build_preview.py
"""
import base64
import json
import pathlib
import struct
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROBE = ROOT / 'tests' / 'zz-preview-probe.test.ts'
OUT = ROOT / 'assets' / 'preview.svg'

# Each reel: the line under him, and the dance to play, once or more.
PROBE_SOURCE = """
import { test } from 'claude-code/testing'
import { CALM, CHEER, COLUMNS, danceFor, discoFrame, framesOf, HEARTS, NERD_TYPING, ROWS, TICK_MS } from '../hooks/register'
const reels = [
  ['Pondering…', danceFor('Pondering'), 1],
  ['Moonwalking…', danceFor('Moonwalking'), 1],
  ['Spinning…', danceFor('Spinning'), 1],
  ['Frolicking…', danceFor('Frolicking'), 1],
  ['tests pass', CHEER, 2],
  ['/clawd-chill', CALM, 1],
  ['light theme', NERD_TYPING, 2],
  ['♥', HEARTS, 1],
] as const
const party = { label: 'if you know the words…', tempo: 1, loops: 1, frames: Array.from({ length: 48 }, (_, b) => discoFrame(b)) }
test('probe', () => {
  console.log('PREVIEW=' + JSON.stringify({
    COLUMNS, ROWS, TICK_MS,
    reels: [...reels.map(([label, dance, loops]) => ({ label, tempo: dance.tempo ?? 1, loops, frames: framesOf(dance) })), party],
  }))
})
"""

DEFAULT = 0x01000000
QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
CELL_W, CELL_H = 16, 32  # a terminal cell is about twice as tall as it is wide
PAD_X, PAD_Y = 24, 20
LINE_H = 34
BACKGROUND = '#1e1e1e'
ORANGE = '#d77757'


def probe() -> dict:
    PROBE.write_text(PROBE_SOURCE)
    try:
        out = subprocess.run(['claude', 'plugin', 'test', str(ROOT)], capture_output=True, text=True, check=False)
    finally:
        PROBE.unlink(missing_ok=True)
    for line in (out.stdout + out.stderr).splitlines():
        if 'PREVIEW=' in line:
            return json.loads(line.split('PREVIEW=', 1)[1])
    raise SystemExit('No frames came back from `claude plugin test`:\n' + out.stdout + out.stderr)


def color(value: int) -> str | None:
    return None if value == DEFAULT else f'#{value & 0xFFFFFF:06x}'


def cells_of(b64: str) -> list[tuple[int, int, int]]:
    raw = base64.b64decode(b64)
    return [struct.unpack_from('<III', raw, i) for i in range(0, len(raw), 12)]


def frame_svg(b64: str, columns: int) -> str:
    parts = []
    for i, (glyph, fg, bg) in enumerate(cells_of(b64)):
        x, y = (i % columns) * CELL_W, (i // columns) * CELL_H
        if (back := color(bg)) is not None:
            parts.append(f'<rect x="{x}" y="{y}" width="{CELL_W}" height="{CELL_H}" fill="{back}"/>')
        ch, ink = chr(glyph), color(fg)
        if ch == ' ' or ink is None:
            continue
        if ch in QUADRANTS:
            mask = QUADRANTS.index(ch)
            for bit, (dx, dy) in enumerate(((0, 0), (1, 0), (0, 1), (1, 1))):
                if mask & (1 << bit):
                    parts.append(f'<rect x="{x + dx * CELL_W // 2}" y="{y + dy * CELL_H // 2}" '
                                 f'width="{CELL_W // 2}" height="{CELL_H // 2}" fill="{ink}"/>')
        else:
            text = {'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;'}.get(ch, ch)
            parts.append(f'<text x="{x + CELL_W / 2}" y="{y + CELL_H * 0.7}" fill="{ink}">{text}</text>')
    return ''.join(parts)


def build(data: dict) -> str:
    columns, rows, tick = data['COLUMNS'], data['ROWS'], data['TICK_MS']
    # The timeline: (frame, label, milliseconds on screen).
    timeline = []
    for reel in data['reels']:
        for _ in range(reel['loops']):
            for frame in reel['frames']:
                timeline.append((frame, reel['label'], reel['tempo'] * tick))
    total = sum(ms for _, _, ms in timeline)

    # Each distinct picture is drawn once and shown in every window it owns.
    windows: dict[str, list[tuple[float, float]]] = {}
    at = 0
    for key, ms in [(f'f:{frame}', ms) for frame, _, ms in timeline] + [(f'l:{label}', ms) for _, label, ms in timeline]:
        if key.startswith('l:') and at >= total:
            at = 0
        windows.setdefault(key, []).append((at / total * 100, (at + ms) / total * 100))
        at += ms
    ids = {key: f'p{n}' for n, key in enumerate(windows)}

    styles, groups = [], []
    for key, spans in windows.items():
        name = ids[key]
        stops = ['0%{opacity:0}']
        for start, end in spans:
            stops.append(f'{start:.4f}%{{opacity:1}}')
            stops.append(f'{end:.4f}%{{opacity:0}}')
        styles.append(f'@keyframes {name}{{{"".join(stops)}}}')
        styles.append(f'#{name}{{opacity:0;animation:{name} {total}ms step-end infinite}}')
        if key.startswith('f:'):
            groups.append(f'<g id="{name}">{frame_svg(key[2:], columns)}</g>')
        else:
            label = key[2:].replace('&', '&amp;')
            groups.append(f'<g id="{name}"><text class="spinner" x="0" y="{rows * CELL_H + 26}">'
                          f'<tspan fill="{ORANGE}">✻</tspan> {label}</text></g>')

    width = columns * CELL_W + 2 * PAD_X
    height = rows * CELL_H + LINE_H + 2 * PAD_Y
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<title>Dancing Clawd</title>'
        f'<style>rect{{shape-rendering:crispEdges}}text{{font-family:Menlo,Consolas,monospace;font-size:18px;text-anchor:middle}}'
        f'.spinner{{text-anchor:start;font-size:15px;fill:#9a9a9a}}{"".join(styles)}</style>'
        f'<rect width="{width}" height="{height}" rx="12" fill="{BACKGROUND}"/>'
        f'<g transform="translate({PAD_X},{PAD_Y})">{"".join(groups)}</g>'
        '</svg>\n'
    )


if __name__ == '__main__':
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(build(probe()))
    print(f'wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)')
