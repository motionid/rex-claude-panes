// SubagentStart/SubagentStop handling: open a Rex pane showing the agent, close it when the agent stops.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maxPanes, planPane } from "./layout.mjs";
import * as realRex from "./rex.mjs";
import { DEFAULT_DIR, withState } from "./state.mjs";

const VIEWER = fileURLToPath(new URL("../bin/viewer.mjs", import.meta.url));

function transcriptFor({ transcript_path, session_id, agent_id }) {
  return join(dirname(transcript_path), session_id, "subagents", `agent-${agent_id}.jsonl`);
}

// agent → block lives in its own file, outside the locked layout state, so a lost layout write can't orphan a pane.
const safe = (s) => String(s).replace(/[^\w-]/g, "_");
const agentFile = (dir, session, agent) => join(dir, `${safe(session)}.agents`, safe(agent));

export async function handle(event, payload, { rex = realRex, env = process.env, stateDir = DEFAULT_DIR } = {}) {
  const { session_id, agent_id, agent_type = "agent" } = payload ?? {};
  if (!session_id || !agent_id || !env.REX_SESSION || !env.REX_BLOCK || !rex.available()) return;
  const file = agentFile(stateDir, session_id, agent_id);

  if (event === "start") {
    if (!payload.transcript_path) return;
    await withState(session_id, (s) => {
      s.stack = s.stack.filter((b) => rex.blockExists(b));
      const cmd = [process.execPath, VIEWER, transcriptFor(payload), agent_type];
      const plan = planPane(s.stack, maxPanes(env), env.REX_BLOCK);
      let opened = rex.openPane({ label: agent_type, plan, cmd });
      if (opened.block && plan.split) s.stack.push(opened.block);
      // after a timeout the split may still have appeared; a fallback would duplicate it
      if (!opened.block && !opened.timedOut && plan.split) opened = rex.openPane({ label: agent_type, plan: { split: null }, cmd });
      if (opened.block) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, opened.block);
      }
    }, stateDir);
  } else if (event === "stop") {
    let block;
    try {
      block = readFileSync(file, "utf8");
    } catch {
      return;
    }
    rex.closeBlock(block);
    rmSync(file, { force: true });
    await withState(session_id, (s) => {
      s.stack = s.stack.filter((b) => b !== block);
    }, stateDir);
  }
}
