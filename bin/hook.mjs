#!/usr/bin/env node
// SubagentStart/SubagentStop hook: open a Rex pane showing the agent, close it when the agent stops.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maxPanes, planPane } from "../lib/layout.mjs";
import * as realRex from "../lib/rex.mjs";
import { withState } from "../lib/state.mjs";

const VIEWER = fileURLToPath(new URL("./viewer.mjs", import.meta.url));

function transcriptFor({ transcript_path, session_id, agent_id }) {
  return join(dirname(transcript_path), session_id, "subagents", `agent-${agent_id}.jsonl`);
}

export async function handle(event, payload, { rex = realRex, env = process.env, stateDir } = {}) {
  const { session_id, agent_id, agent_type = "agent" } = payload ?? {};
  if (!session_id || !agent_id || !env.REX_SESSION || !env.REX_BLOCK || !rex.available()) return;

  if (event === "start") {
    if (!payload.transcript_path) return;
    await withState(session_id, (s) => {
      s.stack = s.stack.filter((b) => rex.blockExists(b));
      const cmd = [process.execPath, VIEWER, transcriptFor(payload), agent_type];
      const plan = planPane(s.stack, maxPanes(env), env.REX_BLOCK);
      let block = rex.openPane({ label: agent_type, plan, cmd });
      if (block && plan.split) s.stack.push(block);
      if (!block && plan.split) block = rex.openPane({ label: agent_type, plan: { split: null }, cmd });
      if (block) s.agents[agent_id] = block;
    }, stateDir);
  } else if (event === "stop") {
    await withState(session_id, (s) => {
      const block = s.agents[agent_id];
      if (!block) return;
      rex.closeBlock(block);
      delete s.agents[agent_id];
      s.stack = s.stack.filter((b) => b !== block);
    }, stateDir);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await handle(process.argv[2], JSON.parse(readFileSync(0, "utf8")));
  } catch {
    // never fail the agent over a pane
  }
  process.exit(0);
}
