# rex-claude-panes

A Claude Code plugin that opens a [Rex](https://www.superlogical.com/rex/docs) pane for each agent Claude Code runs (Explore, your custom agents, background agents), shows the agent working live, and closes the pane when the agent finishes.

Panes are view-only: you watch the agent's messages and one line per tool call. Your keyboard focus stays in Claude.

## Requirements

- Claude Code, started from a Rex terminal (Rex sets `REX_SESSION` and `REX_BLOCK`)
- `rex` and `node` (≥ 20) on `PATH`

Outside Rex the plugin does nothing.

## Install

```text
/plugin marketplace add ~/Documents/rex-claude-panes
/plugin install rex-claude-panes@rex-claude-panes
```

Or for one run: `claude --plugin-dir ~/Documents/rex-claude-panes`.

## Layout

- The first agent pane opens to the right of Claude.
- Agents running at the same time stack below it on the right, up to 3.
- Further agents open in a background Rex window.
- Every agent's pane closes when that agent finishes.

Set `REX_AGENT_MAX_PANES` (for example `REX_AGENT_MAX_PANES=1 claude`) to change how many panes stack on the right. `0` sends every agent to a background window.

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

## Hook payload fields

Confirmed on Claude Code 2.1.330:

- `SubagentStart`: `session_id`, `transcript_path` (parent), `cwd`, `agent_id`, `agent_type`.
- `SubagentStop`: the same plus `agent_transcript_path`, `stop_hook_active`, `background_tasks`.
- Agent transcript: `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl` (equals `agent_transcript_path`).
