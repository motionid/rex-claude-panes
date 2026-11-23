#!/usr/bin/env node
// Follows an agent transcript (JSONL) and prints it readably. Runs until its pane is closed.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { formatEntry } from "../lib/format.mjs";

const [path, title = "agent"] = process.argv.slice(2);
const width = () => Math.max(40, (process.stdout.columns || 100) - 1);

console.log(`── ${title} ──`);
let offset = 0;
let partial = "";
let decoder = new StringDecoder("utf8"); // keeps a multi-byte char split across reads

function poll() {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return; // transcript not written yet
  }
  if (size < offset) {
    // file was rewritten: start over
    offset = 0;
    partial = "";
    decoder = new StringDecoder("utf8");
  }
  if (size === offset) return;
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(size - offset);
  readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  offset = size;
  const lines = (partial + decoder.write(buf)).split("\n");
  partial = lines.pop();
  for (const line of lines) {
    try {
      for (const out of formatEntry(JSON.parse(line), width())) console.log(out);
    } catch {
      // unparsable line: skip
    }
  }
}

poll();
setInterval(poll, 250);
