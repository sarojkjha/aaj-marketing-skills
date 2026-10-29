#!/usr/bin/env node
/**
 * Fails when a skill's front matter uses a value the skills site's database
 * rejects. The allowed values are read from the check constraints in
 * platform/supabase/schema.sql, so the two cannot drift apart.
 *
 * Why: on Oct 29, 2026 ai-referral-share shipped with difficulty "Beginner".
 * CI passed, and only the catalog sync failed ("skills_difficulty_check").
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const schema = readFileSync(join(ROOT, "platform/supabase/schema.sql"), "utf8");
const allowed = (col) => {
  const m = schema.match(new RegExp(`\\b${col}\\s+text check \\(${col} in \\(([^)]*)\\)\\)`));
  if (!m) { console.error(`check-frontmatter: no check constraint for "${col}" in schema.sql`); process.exit(1); }
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
};
const FIELDS = { phase: allowed("phase"), difficulty: allowed("difficulty") };

const errors = [];
const dir = join(ROOT, "skills");
for (const slug of readdirSync(dir).sort()) {
  const file = join(dir, slug, "SKILL.md");
  if (!existsSync(file)) continue;
  const front = readFileSync(file, "utf8").split(/^---\s*$/m)[1] ?? "";
  for (const [field, values] of Object.entries(FIELDS)) {
    const m = front.match(new RegExp(`^\\s+${field}:\\s*(.+?)\\s*$`, "m"));
    if (!m) errors.push(`${slug}: missing metadata.${field}`);
    else if (!values.includes(m[1])) errors.push(`${slug}: ${field} "${m[1]}" is not one of ${values.join(", ")}`);
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Front matter OK: phase and difficulty match the site schema in every skill.`);
