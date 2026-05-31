import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export function normalizeResearchBrief(value = {}) {
  const notes = normalizeList(value.notes || value.keyFacts || value.facts || value.text);
  const citations = normalizeList(value.citations || value.sources);
  const cautions = normalizeList(value.cautions || value.risks);
  return {
    provider: String(value.provider || "unknown").trim(),
    status: notes.length || citations.length ? "ok" : "empty",
    notes,
    citations,
    cautions,
    text: notes.join("\n"),
    updatedAt: value.updatedAt || new Date().toISOString(),
  };
}

export async function persistResearchBrief({ jobDir, brief }) {
  if (!jobDir) throw new Error("jobDir is required to persist research brief.");
  const normalized = normalizeResearchBrief(brief);
  const target = join(jobDir, "research_brief.json");
  await writeFile(target, JSON.stringify(normalized, null, 2), "utf8");
  return target;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
