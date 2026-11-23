# Rex panes for Claude Code agents — design

Status: approved 2026-11-23

## Intent

When Claude Code runs an agent (the built-in `Agent` tool: Explore, researcher,
implementer, reviewer, …), open a visible Rex pane beside the Claude pane that
shows the agent working, and close it when the agent finishes. Same feel as
rex-pi-agent's panes, but for Claude Code's native agents.

## Goals

- Pane opens on agent start, without stealing keyboard focus, labelled with the agent type.
- Pane shows live progress: the agent's text and one line per tool call.
- Pane closes when the agent finishes, including background agents.
- Master–Stack layout from rex-pi-agent: first pane splits right of Claude
  (`$REX_BLOCK`); further concurrent panes split below the bottom-most live
  agent pane on the right, up to 3; beyond that, a background Rex window (`rex run` without `--split`).
- Outside Rex (no `REX_SESSION`/`REX_BLOCK`), every hook is a silent no-op.

## Non-goals

- Typing into or taking over an agent (view-only panes).
- Status widget, model configuration, custom subagent tool.
- Any change to rex-pi-agent.

## Anti-goals

- Slowing down or breaking agent runs: hooks must never fail the agent and must return fast.
- Leaving orphan panes behind after agents finish.

## Constraints

- Claude Code 2.1.330. Agent transcripts are written to
  `~/.claude/projects/<project>/<session-id>/subagents/agent-<agentId>.jsonl`.
- Node only, no npm dependencies (Claude Code already requires Node); `rex` CLI on PATH.
- Packaged as a Claude Code plugin (hooks), installed once, works in every project.

## Approaches

- **A. Hooks on native agents, view-only panes (picked).** Smallest; keeps the
  built-in `Agent` tool and existing agent definitions unchanged.
- B. Port rex-pi-agent as a plugin with its own `subagent` tool launching
  interactive `claude` children. Gives type-in/take-over but is a large build
  and replaces the built-in tool — too heavy for the goal.
- C. Skill only. Dropped: pane closing would depend on the model remembering.

## How (decided)

- `SubagentStart` hook: split a Rex pane per the layout rule, run a Node viewer
  in it that tails the agent's transcript JSONL and pretty-prints it; record
  agentId → block id in a small state file.
- `SubagentStop` hook: look up the block for that agentId and `rex block close` it; drop the record.
- First build step: log real `SubagentStart`/`SubagentStop` payloads to confirm
  which fields exist (agent id, agent type, transcript path) before writing pane code.

## Left to the builder

- Exact viewer formatting, state-file location and locking, how to derive the
  transcript path from the hook payload, plugin install route (local marketplace
  vs `--plugin-dir`).
