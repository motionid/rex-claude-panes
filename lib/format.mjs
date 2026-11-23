// strips ESC/OSC/CSI starters and other C0/C1 controls so agent output can't drive the terminal
const clean = (s) => String(s).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");

const SUMMARY_KEYS = ["file_path", "command", "pattern", "url", "query", "description"];

function oneLine(text, width) {
  const flat = clean(String(text).replace(/\s+/g, " ")).trim();
  return flat.length <= width ? flat : flat.slice(0, width - 1) + "…";
}

function toolSummary(input) {
  input ??= {};
  const key = SUMMARY_KEYS.find((k) => typeof input[k] === "string");
  return key ? input[key] : JSON.stringify(input);
}

/** Lines to print for one transcript entry; [] for anything not shown. */
export function formatEntry(entry, width = 100) {
  const content = entry?.message?.content;
  if (entry?.type === "user" && typeof content === "string") {
    return content.startsWith("<system-reminder>") ? [] : [oneLine(`▶ task: ${content}`, width)];
  }
  if (entry?.type !== "assistant" || !Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (block.type === "text") return clean(block.text ?? "").split("\n");
    if (block.type === "tool_use") return [oneLine(`• ${block.name} ${toolSummary(block.input)}`, width)];
    return [];
  });
}
