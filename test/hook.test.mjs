import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "../bin/hook.mjs";

const HOOK = new URL("../bin/hook.mjs", import.meta.url).pathname;
const VIEWER = new URL("../bin/viewer.mjs", import.meta.url).pathname;
const env = { REX_SESSION: "session:s", REX_BLOCK: "block:claude" };
const payload = (agent_id, agent_type = "Explore") => ({
  session_id: "sess-1",
  transcript_path: "/p/proj/sess-1.jsonl",
  agent_id,
  agent_type,
});

function fakeRex({ splitFails = false } = {}) {
  let n = 0;
  const live = new Set();
  const calls = [];
  return {
    calls,
    live,
    available: () => true,
    openPane(opts) {
      calls.push(["open", opts]);
      if (splitFails && opts.plan.split) return null;
      const block = `block:${++n}`;
      live.add(block);
      return block;
    },
    blockExists: (b) => live.has(b),
    closeBlock(b) {
      calls.push(["close", b]);
      live.delete(b);
    },
  };
}

const deps = (rex) => ({ rex, env, stateDir: mkdtempSync(join(tmpdir(), "hook-")) });
const state = (d) => JSON.parse(readFileSync(join(d.stateDir, "sess-1.json"), "utf8"));

test("start opens right of REX_BLOCK and records the agent", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("a1"), d);
  assert.deepEqual(d.rex.calls, [["open", {
    label: "Explore",
    plan: { split: "right", anchor: "block:claude" },
    cmd: [process.execPath, VIEWER, "/p/proj/sess-1/subagents/agent-a1.jsonl", "Explore"],
  }]]);
  assert.deepEqual(state(d), { stack: ["block:1"], agents: { a1: "block:1" } });
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
  assert.deepEqual(state(d), { stack: [], agents: { a1: "block:1" } });
});

test("stop closes and forgets the agent", async () => {
  const d = deps(fakeRex());
  await handle("start", payload("a1"), d);
  await handle("stop", payload("a1"), d);
  assert.deepEqual(d.rex.calls.at(-1), ["close", "block:1"]);
  assert.deepEqual(state(d), { stack: [], agents: {} });
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
