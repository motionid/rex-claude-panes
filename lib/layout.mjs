// Master–Stack: first agent pane right of Claude, the rest stacked below it, overflow to a tab.
export function planPane(stack, max, rexBlock) {
  if (stack.length >= max) return { split: null };
  if (stack.length === 0) return { split: "right", anchor: rexBlock };
  return { split: "below", anchor: stack.at(-1) };
}

export function maxPanes(env = process.env) {
  const n = Number.parseInt(env.REX_AGENT_MAX_PANES ?? "", 10);
  return Number.isInteger(n) && n >= 0 ? n : 3;
}
