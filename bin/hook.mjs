#!/usr/bin/env node
// SubagentStart/SubagentStop hook entry. No main-guard: a symlinked plugin path must still run.
import { readFileSync } from "node:fs";
import { handle } from "../lib/hook.mjs";

try {
  await handle(process.argv[2], JSON.parse(readFileSync(0, "utf8")));
} catch {
  // never fail the agent over a pane
}
process.exit(0);
