# Dancing Clawd

A tiny Claude mascot for Claude Code. He stands just above your prompt, 4 cells
wide and 2 rows tall, drawn in the same block style as Claude Code's own logo,
and he never stops dancing:

```
 ▐▜▛▌
 ▀▛▜▀
```

- **While Claude works** he dances to the spinner's word. Each word gets its own
  dance: pondering words look around with a hand to the chin, cooking words stir
  the pot, spinning words spin, frolicking words skip, wandering words walk the
  strip, and every other word gets a mix of moves picked from the word itself.
- **Only "Moonwalking…"** gets the moonwalk: he glides backwards across his strip,
  facing forward.
- **Between turns** he grooves at half speed.

Terminal only. Collapse him with `ctrl+x ctrl+a` or the `[-]` at the end of his
strip.

## Install

Type this at the prompt of a Claude Code terminal session:

```
/plugin install dancing-clawd --marketplace TaggalongTech/dancing-clawd
```

Answer `y` to add the marketplace, then press Enter for the user scope.

## See every dance

```
/clawd-demo
```

Plays all 14 dances back to back (about 35 seconds), each one labeled with its
spinner word.

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
- Check before committing: `claude plugin validate .` and, once Claude Code has
  loaded the folder (it writes `.claude-plugin/types/`), `npx tsc -p .`
