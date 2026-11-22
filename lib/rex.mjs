// Thin wrapper over the `rex` CLI. Every call is best-effort: failures return null/false, never throw.
import { execFileSync, spawnSync } from "node:child_process";

const session = () => process.env.REX_SESSION;

export function available() {
  return spawnSync("sh", ["-c", "command -v rex"], { stdio: "ignore" }).status === 0;
}

/** Opens a pane running cmd. plan.split null → new background window. Returns {block}, {timedOut: true}, or {}. */
export function openPane({ label, plan, cmd }) {
  const args = ["run", "-s", session(), "--focus=false", "--json", "--label", label, "--shell=none"];
  if (plan.split) args.push("--split", plan.split, "-b", plan.anchor);
  try {
    const out = execFileSync("rex", [...args, "--", ...cmd], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    const block = JSON.parse(out).block_ids?.[0];
    return typeof block === "string" && block.startsWith("block:") ? { block } : {};
  } catch (err) {
    return err?.code === "ETIMEDOUT" || err?.signal ? { timedOut: true } : {};
  }
}

export function blockExists(block) {
  return spawnSync("rex", ["block", "inspect", "-s", session(), block, "--json"], { stdio: "ignore", timeout: 1500 }).status === 0;
}

export function closeBlock(block) {
  spawnSync("rex", ["block", "close", "-s", session(), block], { stdio: "ignore", timeout: 1500 });
}
