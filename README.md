# Dancing Clawd

*An unofficial fan mod. Not affiliated with or endorsed by Anthropic.*

A tiny Claude mascot for Claude Code. He stands just above your prompt, about
5 cells wide and 2 rows tall, drawn in the same block style as Claude Code's own
logo, and he loves to dance:

![Clawd dancing to Claude Code's spinner words, cheering at passing tests, chilling, typing in day mode, catching hearts, and a glimpse of the party](assets/preview.svg)

- **While Claude works** he dances to the spinner's word. Each word gets its own
  dance: pondering words look around with a hand to the chin, cooking words stir
  the pot, spinning words spin, frolicking words skip, wandering words walk the
  strip, and every other word gets a mix of moves picked from the word itself.
- **Only "Moonwalking…"** gets the moonwalk: he glides backwards across his strip,
  facing forward.
- **He reacts to what Claude does**, in short bursts: peers around while it
  reads, hammers while it edits, types while it runs commands, does a victory
  dance when tests pass, facepalms when they fail, throws confetti on a git
  commit, and takes a little bow when a reply is done. He never changes or
  slows anything Claude does.
- **Between turns** he hangs about: mostly still, a blink, a glance, a small
  move now and then. After 3 quiet minutes he naps and stops animating
  entirely; your next message wakes him with a stretch.
- **Play with him**: hover over him for ♥ (pet him), ☕ (coffee) and ♪ (request
  a dance). Without a mouse, `ctrl+x tab` to his strip and press 1, 2 or 3.
- **Collect his moves**: the first time you see one, he tells you. `/clawd`
  opens your dance card, with everything he can do. Some moves are secret.
- **`/clawd-chill`** tells him to stop dancing and chill: eyes shut, a cigarette
  in hand, smoke curling up. Run it again to get him dancing. He remembers
  between sessions.
- **On a light theme** he won't dance. Clawd only dances in the dark; by day
  he's a nerd in glasses and a bow tie who types away while Claude works.
- **Now and then** he does something else entirely. Keep an eye on him.
- **The right words** in a prompt start a party. We're not saying which. 🪩

## Requirements

- Claude Code 2.1.296 or newer. He's a mod built on function hooks, an
  early-access part of Claude Code; older versions may not load him.
- Claude Code running in a terminal. He doesn't appear in the desktop app.
- Looks best on a dark theme. Built and tested in VS Code's integrated terminal;
  other terminals draw block characters their own way and may differ slightly.

## Install

Type this at the prompt of a Claude Code terminal session:

```
/plugin install dancing-clawd --marketplace TaggalongTech/dancing-clawd
```

Answer `y` to add the marketplace, then press Enter for the user scope.

## Tuck him away, or remove him

- Collapse his strip with `ctrl+x ctrl+a`, or click the `[-]` at its end. Do the
  same to bring him back.
- Remove him for good with `/plugin uninstall dancing-clawd`.

## See every dance

```
/clawd-demo
```

Plays every dance back to back, then `/clawd-chill`, day mode, his reactions
and his nap, each labeled with what sets it off. The demo doesn't count toward
your dance card.

`/clawd`, `/clawd-demo` and `/clawd-chill` work even while Claude is busy: they take
effect at once, never hold Claude up, and answer with a pop-up rather than a
message in the conversation.

## Working on it

Load your working copy instead of an installed one, so each save reloads him:

```
claude --plugin-dir ~/claude-mods/dancing-clawd
```

or, for every session, add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env`
block of `~/.claude/settings.json`. Don't also install him from the marketplace,
or two copies load.

- `hooks/register.tsx`: the sprite, the dances, and the hooks. Moves are poses
  strung into phrases (`PHRASES`); spinner words pick phrases through `THEMES`.
- `tests/dance.test.tsx`: run with `claude plugin test .`
- `scripts/build_preview.py`: rebuilds `assets/preview.svg` from his real frames
  after you change a move: `python3 scripts/build_preview.py`
- His solid parts are painted as background color and he only ever stands on
  even pixels, so no frame uses `▛`: terminals draw that character as two
  pieces, which shows a hairline when cells are an odd number of pixels wide.
  A test checks every frame.
- Check before committing: `claude plugin validate .` and, once Claude Code has
  loaded the folder (it writes `.claude-plugin/types/`), `npx tsc -p .`

## License

MIT. See [LICENSE](LICENSE).
