import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEntry } from "../lib/format.mjs";

const assistant = (...content) => ({ type: "assistant", message: { role: "assistant", content } });

test("user string prompt is shown once as \"▶ task:\"", () => {
  const lines = formatEntry({ type: "user", message: { role: "user", content: "List the files\nin this dir" } }, 40);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith("▶ task: "));
  assert.ok(lines[0].length <= 40);
});

test("assistant text is shown", () => {
  assert.deepEqual(formatEntry(assistant({ type: "text", text: "hi\nthere" })), ["hi", "there"]);
});

test("tool_use is one line", () => {
  assert.deepEqual(formatEntry(assistant({ type: "tool_use", name: "Read", input: { file_path: "/a/b.ts" } })), ["• Read /a/b.ts"]);
});

test("long tool input is truncated to one line", () => {
  const command = "echo x && ".repeat(50) + "\nls";
  const lines = formatEntry(assistant({ type: "tool_use", name: "Bash", input: { command } }), 100);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].length <= 100);
  assert.ok(lines[0].endsWith("…"));
  assert.ok(!lines[0].includes("\n"));
});

test("hidden kinds", () => {
  assert.deepEqual(formatEntry({ type: "user", message: { content: [{ type: "tool_result", content: "x" }] } }), []);
  assert.deepEqual(formatEntry(assistant({ type: "thinking", thinking: "hmm" })), []);
  assert.deepEqual(formatEntry({ type: "api-request" }), []);
  assert.deepEqual(formatEntry({ type: "api-request-blob", message: { role: "user", content: "x" } }), []);
  assert.deepEqual(formatEntry({ type: "attachment" }), []);
});
