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

## Hook payload fields

Confirmed on Claude Code 2.1.330:

- `SubagentStart`: `session_id`, `transcript_path` (parent), `cwd`, `agent_id`, `agent_type`.
- `SubagentStop`: the same plus `agent_transcript_path`, `stop_hook_active`, `background_tasks`.
- Agent transcript: `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl` (equals `agent_transcript_path`).
