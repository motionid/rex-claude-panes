// Per-session pane state shared by concurrent hook processes, guarded by a mkdir lock.
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// worst-case hold ≈ 3 × 1.5 s blockExists + 3 s openPane; stale must exceed it
const STALE_MS = 10000;
const GIVE_UP_MS = 2000;
export const DEFAULT_DIR = join(tmpdir(), `rex-claude-panes-${process.getuid()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tryLock(lock) {
  try {
    mkdirSync(lock);
    return true;
  } catch {
    try {
      if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmSync(lock, { recursive: true, force: true });
    } catch {}
    return false;
  }
}

function read(file) {
  try {
    const s = JSON.parse(readFileSync(file, "utf8"));
    return { stack: Array.isArray(s.stack) ? s.stack : [], agents: s.agents && typeof s.agents === "object" ? s.agents : {} };
  } catch {
    return { stack: [], agents: {} };
  }
}

/** Runs fn(state) under the session lock, saves the (possibly mutated or returned) state, returns it. */
export async function withState(sessionId, fn, dir = DEFAULT_DIR) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${sessionId.replace(/[^\w-]/g, "_")}.json`);
  const lock = `${file}.lock`;
  const deadline = Date.now() + GIVE_UP_MS;
  let locked = tryLock(lock);
  while (!locked && Date.now() < deadline) {
    await sleep(25);
    locked = tryLock(lock);
  }
  // shortcut: past the deadline we proceed unlocked rather than stall the agent; a lost write only misplaces a pane.
  try {
    const state = read(file);
    const next = (await fn(state)) ?? state;
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next));
    renameSync(tmp, file);
    return next;
  } finally {
    if (locked) rmSync(lock, { recursive: true, force: true });
  }
}
