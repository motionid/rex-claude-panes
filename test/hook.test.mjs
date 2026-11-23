import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { utimesSync, chmodSync, mkdirSync as mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "../lib/hook.mjs";
import { DEFAULT_DIR } from "../lib/state.mjs";

const HOOK = new URL("../bin/hook.mjs", import.meta.url).pathname;
const VIEWER = new URL("../bin/viewer.mjs", import.meta.url).pathname;
const env = { REX_SESSION: "session:s", REX_BLOCK: "block:claude" };
const payload = (agent_id, agent_type = "Explore") => ({
  session_id: "sess-1",
  transcript_path: "/p/proj/sess-1.jsonl",
  agent_id,
  agent_type,
});

function fakeRex({ splitFails = false, splitTimesOut = false, closeFails = false } = {}) {
  let n = 0;
  const live = new Set();
  const calls = [];
  return {
    calls,
    live,
    available: () => true,
    openPane(opts) {
      calls.push(["open", opts]);
      if (splitFails && opts.plan.split) return {};
      if (splitTimesOut && opts.plan.split) return { timedOut: true };
      const block = `block:${++n}`;
      live.add(block);
      return { block };
    },
    blockExists: (b) => live.has(b),
    closeBlock(b) {
      calls.push(["close", b]);
      if (!closeFails) live.delete(b);
    },
  };
}

const deps = (rex) => ({ rex, env, stateDir: mkdtempSync(join(tmpdir(), "hook-")) });
const state = (d) => JSON.parse(readFileSync(join(d.stateDir, "sess-1.json"), "utf8"));
const mapping = (d, id) => { try { return readFileSync(join(d.stateDir, "sess-1.agents", id), "utf8"); } catch { return null; } };

test("start opens right of REX_BLOCK and records the agent", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("a1"), d);
  assert.deepEqual(d.rex.calls, [["open", {
    label: "Explore",
    plan: { split: "right", anchor: "block:claude" },
    cmd: [process.execPath, VIEWER, "/p/proj/sess-1/subagents/agent-a1.jsonl", "Explore"],
  }]]);
  assert.deepEqual(state(d).stack, ["block:1"]);
  assert.equal(mapping(d, "a1"), "block:1");
});

test("second concurrent start stacks below the first", async () => {
  const d = deps(fakeRex());
  await Promise.all([handle("start", payload("a1"), d), handle("start", payload("a2"), d)]);
  const plans = d.rex.calls.map(([, o]) => o.plan);
  assert.deepEqual(plans, [{ split: "right", anchor: "block:claude" }, { split: "below", anchor: "block:1" }]);
  assert.deepEqual(state(d).stack, ["block:1", "block:2"]);
});

test("stale blocks are pruned before planning", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("a1"), d);
  d.rex.live.delete("block:1"); // user closed it by hand
  await handle("start", payload("a2"), d);
  assert.deepEqual(d.rex.calls[1][1].plan, { split: "right", anchor: "block:claude" });
  assert.deepEqual(state(d).stack, ["block:2"]);
});

test("failed split falls back to a tab", async () => {
  const d = deps(fakeRex({ splitFails: true }));
  await handle("start", payload("a1"), d);
  assert.deepEqual(d.rex.calls.map(([, o]) => o.plan), [{ split: "right", anchor: "block:claude" }, { split: null }]);
  assert.deepEqual(state(d).stack, []);
  assert.equal(mapping(d, "a1"), "block:1");
});

test("stop closes and forgets the agent", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("a1"), d);
  await handle("stop", payload("a1"), d);
  assert.deepEqual(d.rex.calls.at(-1), ["close", "block:1"]);
  assert.deepEqual(state(d).stack, []);
  assert.equal(mapping(d, "a1"), null);
});

test("a lost shared-state write does not orphan the pane", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("a1"), d);
  writeFileSync(join(d.stateDir, "sess-1.json"), JSON.stringify({ stack: [], agents: {} })); // another hook's unlocked write won
  await handle("stop", payload("a1"), d);
  assert.deepEqual(d.rex.calls.at(-1), ["close", "block:1"]);
});

test("timed-out split does not fall back to a second pane", async () => {
  const d = deps(fakeRex({ splitTimesOut: true }));
  await handle("start", payload("a1"), d);
  assert.equal(d.rex.calls.length, 1);
});

test("a repeated start for the same agent closes its old pane", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("a1"), d);
  await handle("start", payload("a1"), d);
  assert.ok(d.rex.calls.some(([k, b]) => k === "close" && b === "block:1"));
  assert.equal(mapping(d, "a1"), "block:2");
});

test("a failed close keeps the record", async () => {
  const d = deps(fakeRex({ closeFails: true }));
  await handle("start", payload("a1"), d);
  await handle("stop", payload("a1"), d);
  assert.equal(mapping(d, "a1"), "block:1");
});

test("records older than a day are closed and removed on start", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("old"), d);
  const file = join(d.stateDir, "sess-1.agents", "old");
  const twoDaysAgo = (Date.now() - 2 * 86400_000) / 1000;
  utimesSync(file, twoDaysAgo, twoDaysAgo);
  await handle("start", payload("a2"), d);
  assert.ok(d.rex.calls.some(([k, b]) => k === "close" && b === "block:1"));
  assert.equal(mapping(d, "old"), null);
  assert.equal(mapping(d, "a2"), "block:2");
});

test("stop for unknown agent is a no-op", async () => {
  const d = deps(fakeRex());
  await handle("stop", payload("nope"), d);
  assert.deepEqual(d.rex.calls, []);
});

test("outside Rex does nothing", async () => {
  const d = { ...deps(fakeRex()), env: {} };
  await handle("start", payload("a1"), d);
  assert.deepEqual(d.rex.calls, []);
});

test("bad stdin exits 0", () => {
  const r = spawnSync(process.execPath, [HOOK, "start"], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("CLI works when the plugin path goes through a symlink", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hook-cli-"));
  const sid = `cli-${Date.now()}`;
  t.after(() => {
    rmSync(join(DEFAULT_DIR, `${sid}.agents`), { recursive: true, force: true });
    rmSync(join(DEFAULT_DIR, `${sid}.json`), { force: true });
  });
  const log = join(dir, "rex.log");
  const fakeBin = join(dir, "bin");
  symlinkSync(new URL("..", import.meta.url).pathname, join(dir, "plugin"));
  const rexScript = `#!/bin/sh\necho "$@" >> ${log}\n[ "$1" = run ] && echo '{"block_ids":["block:x"]}'\nexit 0\n`;
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, "rex"), rexScript);
  chmodSync(join(fakeBin, "rex"), 0o755);
  const r = spawnSync(process.execPath, [join(dir, "plugin", "bin", "hook.mjs"), "start"], {
    input: JSON.stringify({ ...payload("cli1"), session_id: sid }),
    encoding: "utf8",
    env: { ...process.env, ...env, PATH: `${fakeBin}:${process.env.PATH}` },
  });
  assert.equal(r.status, 0);
  assert.match(readFileSync(log, "utf8"), /^run .*--split right -b block:claude/m);
});
