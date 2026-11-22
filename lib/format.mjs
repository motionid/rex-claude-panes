const SUMMARY_KEYS = ["file_path", "command", "pattern", "url", "query", "description"];

function oneLine(text, width) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length <= width ? flat : flat.slice(0, width - 1) + "…";
}

function toolSummary(input = {}) {
  const key = SUMMARY_KEYS.find((k) => typeof input[k] === "string");
  return key ? input[key] : JSON.stringify(input);
}

/** Lines to print for one transcript entry; [] for anything not shown. */
export function formatEntry(entry, width = 100) {
  const content = entry?.message?.content;
  if (entry?.type === "user" && typeof content === "string") return [oneLine(`▶ task: ${content}`, width)];
  if (entry?.type !== "assistant" || !Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (block.type === "text") return block.text.split("\n");
    if (block.type === "tool_use") return [oneLine(`• ${block.name} ${toolSummary(block.input)}`, width)];
    return [];
  });
}
