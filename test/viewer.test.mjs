import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
const newPath = () => join(mkdtempSync(join(tmpdir(), "viewer-")), "agent.jsonl");
import { tmpdir } from "node:os";
import { join } from "node:path";

const VIEWER = new URL("../bin/viewer.mjs", import.meta.url).pathname;
const FIXTURE = new URL("./fixtures/agent.jsonl", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runViewer(path, during) {
  const child = spawn(process.execPath, [VIEWER, path, "Explore"]);
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  await during?.();
  await sleep(1200);
  const alive = child.exitCode === null;
  child.kill();
  return { out, alive };
}

test("viewer prints fixture lines", async () => {
  const { out } = await runViewer(FIXTURE);
  assert.match(out, /▶ task:/);
  assert.match(out, /• (Bash|Glob|Read)/);
  assert.match(out, /Found 6 files\./);
});

test("viewer follows appended lines", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "viewer-")), "agent.jsonl");
  copyFileSync(FIXTURE, path);
  const { out } = await runViewer(path, async () => {
    await sleep(300);
    // written in two pieces to exercise the partial-line buffer
    appendFileSync(path, '{"type":"assistant","message":{"content":[{"type":"text","text":"appe');
    await sleep(300);
    appendFileSync(path, 'nded later"}]}}\n');
  });
  assert.match(out, /appended later/);
});

test("viewer waits for a missing file", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "viewer-")), "agent.jsonl");
  const { out, alive } = await runViewer(path, async () => {
    await sleep(300);
    writeFileSync(path, '{"type":"assistant","message":{"content":[{"type":"text","text":"late file"}]}}\n');
  });
  assert.match(out, /late file/);
  assert.ok(alive);
});

test("a multi-byte character split across reads is decoded", async () => {
  const path = newPath();
  const bytes = Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"café"}]}}\n');
  const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of é
  writeFileSync(path, bytes.subarray(0, cut));
  const { out } = await runViewer(path, async () => {
    await sleep(400);
    appendFileSync(path, bytes.subarray(cut));
  });
  assert.match(out, /café/);
});

test("viewer restarts when the file shrinks", async () => {
  const path = newPath();
  copyFileSync(FIXTURE, path);
  const { out } = await runViewer(path, async () => {
    await sleep(400);
    writeFileSync(path, '{"type":"assistant","message":{"content":[{"type":"text","text":"after shrink"}]}}\n');
  });
  assert.match(out, /after shrink/);
});
