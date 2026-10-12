/**
 * Skills that were renamed, old slug -> new slug.
 *
 * Oct 11, 2026: five skills took an `aaj-` prefix because another popular
 * library (coreyhaines31/marketingskills) publishes skills under the same five
 * names. Installing both put two different skills in one folder, and
 * `marketing-loops` even means something different there (a recurring agent
 * workflow, where ours is loop arithmetic). With the prefix, both libraries
 * install side by side.
 *
 * Readers of this map: the MCP server (old engine and skill ids keep working),
 * the skills site sync (old pages are unpublished, then redirect), and the
 * aajconsult.com link check. Add a row here whenever a slug changes; never
 * delete one, because links and agents in the wild still use the old names.
 */
export const RENAMED_SKILLS = {
  "copywriting": "aaj-copywriting",
  "marketing-psychology": "aaj-marketing-psychology",
  "programmatic-seo": "aaj-programmatic-seo",
  "marketing-loops": "aaj-marketing-loops",
  "sales-enablement": "aaj-sales-enablement",
};

/** Resolve a slug or engine id that may use an old name (engine ids may carry a ":file" suffix). */
export function currentSlug(id) {
  const s = String(id || "").trim();
  const [slug, file] = s.split(":");
  const now = Object.hasOwn(RENAMED_SKILLS, slug) ? RENAMED_SKILLS[slug] : slug;
  return file ? `${now}:${file}` : now;
}
