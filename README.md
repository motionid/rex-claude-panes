# rex-claude-panes

A Claude Code plugin that opens a [Rex](https://www.superlogical.com/rex/docs) pane for each agent Claude Code runs (Explore, your custom agents, background agents), shows the agent working live, and closes the pane when the agent finishes.

Panes are view-only: you watch the agent's messages and one line per tool call. Your keyboard focus stays in Claude.

## Requirements

- Claude Code, started from a Rex terminal (Rex sets `REX_SESSION` and `REX_BLOCK`)
- `rex` and `node` (≥ 20) on `PATH`

Outside Rex the plugin does nothing.

## Install

From GitHub:

```text
/plugin marketplace add motionid/rex-claude-panes
/plugin install rex-claude-panes@rex-claude-panes
```

From a local clone:

```text
/plugin marketplace add /path/to/rex-claude-panes
/plugin install rex-claude-panes@rex-claude-panes
```

Or for one run: `claude --plugin-dir /path/to/rex-claude-panes`.

## Layout

- The first agent pane opens to the right of Claude.
- Agents running at the same time stack below it on the right, up to 3.
- Further agents open in a background Rex window.
- Every agent's pane closes when that agent finishes.

Set `REX_AGENT_MAX_PANES` (for example `REX_AGENT_MAX_PANES=1 claude`) to change how many panes stack on the right. `0` sends every agent to a background window.

## How it works

1. Claude Code fires `SubagentStart` when an agent begins. `hooks/hooks.json` runs `bin/hook.mjs start` with the hook payload on stdin.
2. `lib/hook.mjs` works out where the agent's transcript will be (`<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl`). `lib/layout.mjs` then decides where the pane goes: a split next to Claude, a split below the last agent pane, or a background window.
3. `lib/rex.mjs` asks `rex` to open the pane. The pane runs `bin/viewer.mjs`, which tails the transcript every 250 ms and prints it through `lib/format.mjs`: agent text, plus one line per tool call.
4. When the agent ends, `SubagentStop` runs `bin/hook.mjs stop`. It looks up that agent's pane and closes it.

The hook never fails the agent. Any error is swallowed, and the hook always exits 0.

## Where state lives

State is kept per user in `$TMPDIR/rex-claude-panes-<uid>/` (mode `0700`):

- `<session>.json`: the stack of panes on the right, shared by concurrent hooks under a `mkdir` lock.
- `<session>.agents/<agent>`: the block ID of each agent's pane. It lives outside the locked file, so a lost layout write can't orphan a pane.

If a stop never arrives (a crash or a killed session), the pane is closed and its record deleted after a day, the next time an agent starts. You can delete the directory at any time while no agents are running.

## Troubleshooting

No pane appears:

- Check that `rex` is on `PATH`.
- Check that Claude was started inside a Rex terminal: `echo $REX_BLOCK` should print a block ID.
- Check that the plugin is enabled: `/plugin` should list `rex-claude-panes`.

A pane you close by hand is skipped next time. The stop hook then does nothing for that agent.

## Development

```bash
npm test
```

Design notes: [spec](docs/superpowers/specs/2026-11-23-rex-agent-panes-design.md) and [implementation plan](docs/superpowers/plans/2026-11-23-rex-agent-panes.md).

## License

[MIT](LICENSE)

## Hook payload fields

Confirmed on Claude Code 2.1.330:

- `SubagentStart`: `session_id`, `transcript_path` (parent), `cwd`, `agent_id`, `agent_type`.
- `SubagentStop`: the same plus `agent_transcript_path`, `stop_hook_active`, `background_tasks`.
- Agent transcript: `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl` (equals `agent_transcript_path`).
