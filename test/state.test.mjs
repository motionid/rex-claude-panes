import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { withState } from "../lib/state.mjs";

const run = promisify(execFile);
const STATE = new URL("../lib/state.mjs", import.meta.url).href;
const tmp = () => mkdtempSync(join(tmpdir(), "state-"));

test("round-trips state", async () => {
  const dir = tmp();
  const first = await withState("s1", (s) => {
    assert.deepEqual(s, { stack: [], agents: {} });
    s.stack.push("block:a");
    s.agents.x = "block:a";
  }, dir);
  assert.deepEqual(first, { stack: ["block:a"], agents: { x: "block:a" } });
  assert.deepEqual(await withState("s1", () => {}, dir), first);
});

test("concurrent withState calls do not lose writes", async () => {
  const dir = tmp();
  const script = (i) =>
    `const { withState } = await import(${JSON.stringify(STATE)});` +
    `await withState("s", async (s) => { await new Promise((r) => setTimeout(r, 20)); s.stack.push("b${i}"); }, ${JSON.stringify(dir)});`;
  await Promise.all(Array.from({ length: 10 }, (_, i) => run(process.execPath, ["--input-type=module", "-e", script(i)])));
  const final = await withState("s", () => {}, dir);
  assert.equal(final.stack.length, 10);
});

test("stale lock is broken", async () => {
  const dir = tmp();
  const lock = join(dir, "s.json.lock");
  mkdirSync(lock);
  const old = (Date.now() - 10_000) / 1000;
  utimesSync(lock, old, old);
  const start = Date.now();
  await withState("s", (s) => { s.stack.push("b"); }, dir);
  assert.ok(Date.now() - start < 1000);
});
