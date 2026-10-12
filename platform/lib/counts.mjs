/**
 * The one place every AAJ skills count comes from.
 *
 * Counts drifted for months because each surface was typed by hand: the README
 * said 59 while package.json said 39, the skills site said 45, and the live
 * catalog had moved on to 73. Every number below is derived from skills/ at the
 * moment it is read, and `counts.json` at the repo root is the published copy:
 *
 *   README.md, package.json   filled by platform/scripts/generate-readme.mjs
 *   counts.json               written by the same script; CI fails when stale
 *   hosted MCP server         serves the same object at /counts.json
 *   aajconsult.com            copies counts.json at build (scripts/sync-skills-manifest.mjs)
 *   GitHub About line         set by CI from phrases.github_about
 *   Product Hunt, bios, deck  pasted from `npm run counts:phrases` (never retyped)
 *
 * Zero dependencies, like catalog.mjs: the MCP server imports this too.
 */
import { listSkills } from "./catalog.mjs";
import { createServer } from "../mcp/core.mjs";

export const PHASE_ORDER = ["Diagnose", "Design", "Execute"];

/** Agents the README documents an install route for. Not a count of anything that drifts. */
export const AGENTS = ["Claude Code", "OpenAI Codex", "Cursor", "Windsurf", "Cline"];

/** Tool names the MCP server exposes, read from the server itself so the count is never typed. */
export const MCP_TOOLS = createServer({ skills: [], engines: new Map(), run: async () => ({}) }).TOOLS.map((t) => t.name);

/**
 * Wording for the surfaces nobody can generate (Product Hunt, bios, the deck).
 * Paste these; never retype a number. Lengths respect each surface's limit.
 */
export function phrasesFor(n) {
  const { skills, engines } = n;
  return {
    headline: `${skills} marketing skills for AI agents. ${engines} run real engines.`,
    short: `${skills} marketing skills, ${engines} with runnable engines`,
    github_about:
      `The math layer for marketing agents: ${skills} skills, ${engines} with deterministic engines that ` +
      `return numbers and a verdict. Keep your writing skills, add the arithmetic. MIT, no API key.`,
    product_hunt_tagline: "Marketing skills that do the math for your AI agent",
    product_hunt_description:
      `Open-source marketing skills for AI agents. ${engines} of the ${skills} run deterministic engines: ` +
      `LTV:CAC, pipeline coverage, A/B significance, budget splits. Same input, same answer, code you can read. MIT.`,
    maker_bio:
      `Founder of AAJ. Marketing for Seed–Series B startups. I maintain ${skills} open-source marketing skills ` +
      `for AI agents; ${engines} of them do the math.`,
  };
}

/** Build the counts object from a list of skills (as returned by listSkills). */
export function buildCounts(skills) {
  const engines = skills.filter((s) => s.hasEngine);
  const categories = [...new Set(skills.map((s) => s.category).filter(Boolean))].sort();
  const n = { skills: skills.length, engines: engines.length };
  const phases = Object.fromEntries(
    PHASE_ORDER.map((p) => {
      const inPhase = skills.filter((s) => s.phase === p);
      return [p, { skills: inPhase.length, engines: inPhase.filter((s) => s.hasEngine).length }];
    })
  );
  const byCategory = Object.fromEntries(
    categories.map((c) => {
      const inCat = skills.filter((s) => s.category === c);
      return [c, { skills: inCat.length, engines: inCat.filter((s) => s.hasEngine).length }];
    })
  );
  return {
    $comment:
      "Generated from skills/ by platform/scripts/generate-readme.mjs (npm run counts). " +
      "Do not edit by hand: CI fails when this file disagrees with skills/.",
    skills: n.skills,
    engines: n.engines,
    skills_without_engine: n.skills - n.engines,
    engine_scripts: engines.reduce((sum, s) => sum + s.jsFiles.length, 0),
    categories: categories.length,
    mcp_tools: MCP_TOOLS.length,
    agents: AGENTS,
    phases,
    by_category: byCategory,
    phrases: phrasesFor(n),
    catalog: skills.map((s) => ({
      slug: s.slug,
      engine: s.hasEngine,
      category: s.category,
      phase: s.phase,
    })),
  };
}

export function countsFromRepo(repoRoot) {
  return buildCounts(listSkills(repoRoot));
}

/** Stable serialisation: the file only changes when a count or the catalog does. */
export const serializeCounts = (counts) => JSON.stringify(counts, null, 2) + "\n";
