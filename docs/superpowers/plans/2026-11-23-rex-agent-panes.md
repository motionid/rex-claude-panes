# Rex Agent Panes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code plugin that opens a view-only Rex pane for each built-in agent while it runs and closes it when the agent stops.

**Architecture:** `SubagentStart`/`SubagentStop` hooks run one Node entry (`bin/hook.mjs`). Start picks a slot with a pure Master–Stack layout function, runs `rex run` to open a pane executing `bin/viewer.mjs` (which tails the agent transcript and pretty-prints it), and records agentId → block in a per-session state file under a lock. Stop looks up the block and closes it.

**Tech Stack:** Node ≥ 20 ESM (`.mjs`), no npm dependencies, `node --test`, `rex` CLI.

**Spec:** `docs/superpowers/specs/2026-11-23-rex-agent-panes-design.md`

## Global Constraints

- No npm dependencies; Node built-ins only.
- Hooks never fail the agent: every hook path exits 0, prints nothing to stdout, and finishes in well under the 10 s hook timeout.
- Outside Rex (`REX_SESSION` or `REX_BLOCK` unset, or `rex` not on PATH) hooks are silent no-ops.
- Panes open with `--focus=false`.
- Layout: first pane `rex run --split right -b $REX_BLOCK`; further concurrent panes `--split below -b <bottom-most live agent pane>`; max 3 visible (override `REX_AGENT_MAX_PANES`); overflow or failed split → `rex run` with no `--split` (new background window).
- Transcript path: `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl` (confirm in Task 1).

## Review Focus

- Several agents started in parallel (fan-out of 3–5): hooks run concurrently; expect no lost state entries and no two panes anchored to a stale block. → Task 3 test `concurrent withState calls do not lose writes`.
- User closes an agent pane by hand mid-run: expect later spawns to re-plan around it and the stop hook to no-op. → Task 3 test `stale blocks are pruned before planning`; Task 4 stop with missing block.
- Viewer starts before the transcript file exists: expect it to wait, not crash and close the pane. → Task 2 test `viewer waits for a missing file`.
- Hook payload missing fields or malformed JSON on stdin: expect exit 0, no pane. → Task 4 test `bad stdin exits 0`.
- Huge tool inputs or multi-line text: expect one truncated line per tool call so the pane stays readable. → Task 2 test `long tool input is truncated to one line`.

---

### Task 1: Probe hook payloads and scaffold the plugin

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `package.json`, `.gitignore`, `README.md`
- Create (temporary, deleted at end of task): `bin/probe.mjs`

**Interfaces:**
- Produces: `hooks/hooks.json` wiring `SubagentStart` → `node "${CLAUDE_PLUGIN_ROOT}/bin/hook.mjs" start` and `SubagentStop` → `... stop`, timeout 10. `package.json` with `"type": "module"` and `"test": "node --test test/"`.
- Produces: a recorded note in `README.md` ("Hook payload fields") listing the real field names for agent id, agent type, session id, transcript path.

- [ ] **Step 1:** Write `bin/probe.mjs` that appends stdin + `process.argv[2]` as one JSON line to `$TMPDIR/rex-claude-panes-probe.jsonl`; point hooks.json at it temporarily.
- [ ] **Step 2:** Run `claude -p --plugin-dir ~/Documents/rex-claude-panes "Use the Explore agent to list the files in this directory, then reply done"` from the plugin dir.
  Expected: probe file has one `start` and one `stop` line.
- [ ] **Step 3:** From those lines, confirm the fields (`agent_id`, `agent_type`, `session_id`, `transcript_path`, plus whatever stop adds, e.g. `agent_transcript_path`) and confirm the derived transcript path exists on disk. If any is missing, stop and report back before Task 2.
- [ ] **Step 4:** Point hooks.json at `bin/hook.mjs`, delete `bin/probe.mjs`, write README (what it does, install: `/plugin marketplace add ~/Documents/rex-claude-panes` then `/plugin install rex-claude-panes@rex-claude-panes`, or `claude --plugin-dir`; the payload field note).
- [ ] **Step 5:** Commit `chore: plugin scaffold and confirmed hook payload fields`.

### Task 2: Transcript viewer

**Files:**
- Create: `lib/format.mjs`, `bin/viewer.mjs`, `test/format.test.mjs`, `test/viewer.test.mjs`, `test/fixtures/agent.jsonl` (trimmed real transcript: one user string, one assistant text, one assistant tool_use, one tool_result, one `api-request` line)

**Interfaces:**
- Produces: `formatEntry(entry: object, width = 100) => string[]` — lines to print; `[]` for anything not shown.
- Produces: CLI `node bin/viewer.mjs <transcriptPath> <title>` — prints a title line, waits for the file, then follows it forever.

- [ ] **Step 1: Failing tests** in `test/format.test.mjs`:
  - `user string prompt is shown once as "▶ task:"` — first line starts with `▶ task: ` and is ≤ width.
  - `assistant text is shown` — `{type:"assistant",message:{content:[{type:"text",text:"hi\nthere"}]}}` → lines `["hi","there"]`.
  - `tool_use is one line` — `{...content:[{type:"tool_use",name:"Read",input:{file_path:"/a/b.ts"}}]}` → `["• Read /a/b.ts"]`.
  - `long tool input is truncated to one line` — 500-char Bash command → one line, length ≤ width, ends with `…`.
  - `hidden kinds` — `tool_result` users, `thinking`, `api-request*`, `attachment` → `[]`.
- [ ] **Step 2:** `npm test` → FAIL (module missing).
- [ ] **Step 3:** Implement `formatEntry`. Tool summary: first of `file_path`, `command`, `pattern`, `url`, `query`, `description`, else `JSON.stringify(input)`; newlines collapsed to spaces.
- [ ] **Step 4:** Failing tests in `test/viewer.test.mjs` (spawn the CLI, read stdout for ≤ 2 s, then kill):
  - `viewer prints fixture lines` — stdout contains `▶ task:` and `• Read`.
  - `viewer follows appended lines` — append an assistant text line after 300 ms; it appears.
  - `viewer waits for a missing file` — start on a nonexistent path, create it after 300 ms, its content appears; process still alive.
- [ ] **Step 5:** Implement `bin/viewer.mjs`: poll every 250 ms with `fs.statSync` + read from last offset; keep a partial-line buffer; ignore unparsable lines. (Polling, not `fs.watch`, for reliability on macOS.)
- [ ] **Step 6:** `npm test` → PASS. Commit `feat: transcript viewer`.

### Task 3: Layout and session state

**Files:**
- Create: `lib/layout.mjs`, `lib/state.mjs`, `test/layout.test.mjs`, `test/state.test.mjs`

**Interfaces:**
- Produces: `planPane(stack: string[], max: number, rexBlock: string) => {split: "right"|"below", anchor: string} | {split: null}` (pure).
- Produces: `maxPanes(env = process.env) => number` — `REX_AGENT_MAX_PANES` if a non-negative int, else 3.
- Produces: `withState(sessionId: string, fn: (state) => state|void, dir?: string) => Promise<state>` where `state = {stack: string[], agents: Record<agentId, block>}`; file `<dir ?? os.tmpdir()/rex-claude-panes>/<sessionId>.json`; lock via `mkdirSync(<file>.lock)` retried every 25 ms, lock older than 5 s treated as stale and removed; give up after 3 s (run `fn` on a fresh read anyway rather than block the agent).

- [ ] **Step 1: Failing tests** `test/layout.test.mjs`:
  - `empty stack splits right of REX_BLOCK` — `planPane([],3,"block:p")` → `{split:"right",anchor:"block:p"}`.
  - `next pane goes below the last` — `planPane(["block:a","block:b"],3,"block:p")` → `{split:"below",anchor:"block:b"}`.
  - `full stack overflows to a tab` — 3 entries, max 3 → `{split:null}`.
  - `max 0 always tabs`; `maxPanes` parses `"5"` → 5, `"x"` → 3, `"-1"` → 3.
- [ ] **Step 2: Failing tests** `test/state.test.mjs` (temp dir):
  - `round-trips state`.
  - `concurrent withState calls do not lose writes` — 10 child processes each push a distinct id into `stack`; final `stack.length === 10`.
  - `stale lock is broken` — pre-create a `.lock` dir with mtime 10 s ago; `withState` completes < 1 s.
- [ ] **Step 3:** `npm test` → FAIL. Implement both modules. `npm test` → PASS.
- [ ] **Step 4:** Commit `feat: master-stack layout and locked session state`.

### Task 4: Hook entry and Rex calls

**Files:**
- Create: `lib/rex.mjs`, `bin/hook.mjs`, `test/hook.test.mjs`

**Interfaces:**
- Consumes: `planPane`, `maxPanes`, `withState`, viewer CLI.
- Produces: `lib/rex.mjs` — `rexAvailable(env) => boolean`, `openPane({label, plan, cmd: string[]}) => string|null` (block id from `--json` `block_ids[0]`, `null` on failure), `blockExists(block) => boolean` (`rex block inspect -s $REX_SESSION <block> --json` exit 0), `closeBlock(block) => void` (swallow errors).
- Produces: `bin/hook.mjs` exporting `handle(event: "start"|"stop", payload: object, deps = {rex, state, env}) => Promise<void>` for tests; CLI reads stdin JSON and calls it inside a top-level try/catch that always exits 0.

- [ ] **Step 1: Failing tests** in `test/hook.test.mjs` with a fake `rex` dep recording calls:
  - `start opens right of REX_BLOCK and records the agent` — calls `openPane` with plan `{split:"right",anchor:REX_BLOCK}`, label = `agent_type`, cmd = `["node", <abs viewer path>, <derived transcript path>, <agent_type>]`; state has `agents[agent_id]` and `stack` with the block.
  - `second concurrent start stacks below the first`.
  - `stale blocks are pruned before planning` — `blockExists` false for the stacked block → plan is `right` again.
  - `failed split falls back to a tab` — `openPane` returns null for split, then is called with `{split:null}`; tab blocks recorded in `agents` but not in `stack`.
  - `stop closes and forgets the agent` — `closeBlock` called with recorded block; removed from `agents` and `stack`.
  - `stop for unknown agent is a no-op`.
  - `outside Rex does nothing` — env without `REX_BLOCK` → no rex calls.
  - `bad stdin exits 0` — spawn `bin/hook.mjs start` with `not json` on stdin → exit code 0, empty stdout.
- [ ] **Step 2:** `npm test` → FAIL. Implement. `openPane` runs `rex run -s $REX_SESSION --focus=false --json --label <label> [--split <dir> -b <anchor>] --shell=none -- <cmd...>` via `execFileSync` with a 5 s timeout. `npm test` → PASS.
- [ ] **Step 3:** Commit `feat: open and close Rex panes from agent hooks`.

### Task 5: End-to-end check in Rex

**Files:**
- Modify: `README.md` (usage + `REX_AGENT_MAX_PANES` + troubleshooting: "no pane → check `rex` on PATH and that Claude was started inside Rex")

- [ ] **Step 1:** From a Rex terminal: `claude -p --plugin-dir ~/Documents/rex-claude-panes "Run two Explore agents in parallel: one lists files, one reads README.md. Then reply done"`.
  Expected: two panes appear on the right (second below first), each shows `▶ task:` and tool lines; both close when the agents finish; `rex block list -s $REX_SESSION` shows no leftover agent panes.
- [ ] **Step 2:** Repeat with `REX_AGENT_MAX_PANES=1`: second agent opens in a background window, which also closes at stop.
- [ ] **Step 3:** Run outside Rex (`env -u REX_BLOCK -u REX_SESSION claude -p --plugin-dir … "Use Explore to list files"`): completes normally, no errors.
- [ ] **Step 4:** Update README, commit `docs: usage and verification`.
