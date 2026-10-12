#!/usr/bin/env node
/**
 * Generate the catalog sections of README.md from the skills themselves.
 *
 * The README was hand-maintained and drifted every time a skill was added —
 * four behind on 23 Sep, two behind again the next morning. The counts, the
 * per-category tables and the engine list are all derivable, so they are
 * derived. Everything outside the markers stays hand-written.
 *
 *   node platform/scripts/generate-readme.mjs           # rewrite README.md, package.json's description and counts.json
 *   node platform/scripts/generate-readme.mjs --check   # fail if any of them would change, or a count is typed by hand
 *   node platform/scripts/generate-readme.mjs --stdout  # print the README, write nothing
 *   node platform/scripts/generate-readme.mjs --phrases # print the wording to paste into Product Hunt, bios and the deck
 *
 * counts.json is the published copy of every count (platform/lib/counts.mjs).
 * The hosted MCP server serves it at /counts.json and aajconsult.com copies it
 * at build, so one `npm run counts` moves every surface together.
 *
 * Two kinds of generated region:
 *   block  <!-- aaj:begin <id> --> ... <!-- aaj:end <id> -->   whole sections
 *   count  <!-- aaj:n <id> -->43<!-- aaj:/n -->                a number in prose
 *
 * The one-liner in each table's "What it does" column comes from the skill's
 * own frontmatter (`metadata.card`). A skill with no card fails the run — the
 * README is not the place to discover that a skill was added half-finished.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listSkills } from "../lib/catalog.mjs";
import { buildCounts, serializeCounts } from "../lib/counts.mjs";
import { existsSync, readdirSync, statSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(process.env.AAJ_SKILLS_ROOT || join(HERE, "..", ".."));
const README = join(REPO_ROOT, "README.md");

// Presentation order. It is not derivable and it is not a taxonomy copy — the
// categories themselves come from the skills. A category that is not listed
// here stops the run rather than being silently dropped off the page.
const CATEGORY_ORDER = [
  "Strategy & Positioning",
  "Research & Personas",
  "SEO, GEO & AEO",
  "Content & Copy",
  "Conversion & Web",
  "Paid Media & Budgeting",
  "Analytics & Experimentation",
  "Sales & Pipeline",
  "Retention & Lifecycle",
  "Growth, Retention & RevOps",
];
const PHASE_ORDER = ["Diagnose", "Design", "Execute"];

// skills.sh groups the repo page by these (skills.sh.json at the root). The
// first group is the math layer: the engines founders reach for first. Every
// other skill is grouped by its own category, so a new skill lands in the right
// group without anyone editing this file.
const SKILLS_SH_START = {
  title: "Founder math: start here",
  description:
    "Engines that return the number and a verdict, not advice: unit economics, pipeline coverage, " +
    "retention, pricing, market size, inference cost and test significance. Same input, same answer.",
  skills: [
    "unit-economics", "pipeline-and-forecast", "lifecycle-and-retention", "pricing-and-packaging",
    "market-sizing", "ai-inference-pricing", "paid-media-budget-allocation", "ab-test-significance",
    "win-loss-analysis", "pilot-to-contract", "marketing-leadership-model",
  ],
};
const CATEGORY_BLURB = {
  "Strategy & Positioning": "Who you are for, what you charge and why you win, checked against the alternative.",
  "Research & Personas": "Interviews, surveys and reviews turned into evidence a decision can rest on.",
  "SEO, GEO & AEO": "Whether search engines and AI answer engines can find, read and cite you.",
  "Content & Copy": "Writing that is specific and provable, and checks for voice, claims and proof.",
  "Conversion & Web": "Where visitors stall on the site, the signup and the upgrade, and what to fix first.",
  "Paid Media & Budgeting": "How much to spend, where, and whether the creative and the account are working.",
  "Analytics & Experimentation": "Whether a result is real: significance, incrementality and board-ready reporting.",
  "Sales & Pipeline": "Accounts, buying committees, handoffs and the forecast, from first touch to contract.",
  "Retention & Lifecycle": "Churn, NRR and the lifecycle email that keeps customers.",
  "Growth, Retention & RevOps": "Loops, launches, partners, events and the marketing team itself.",
};

const fail = (msg) => { console.error(`generate-readme: ${msg}`); process.exit(2); };

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to dashes. */
const anchor = (h) =>
  h.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

function build(skills) {
  for (const s of skills) {
    if (!s.category) fail(`${s.slug}: no metadata.category`);
    if (!s.phase) fail(`${s.slug}: no metadata.phase`);
    if (!s.card) fail(`${s.slug}: no metadata.card — add a one-line "what it does" to its frontmatter`);
    if (!PHASE_ORDER.includes(s.phase)) fail(`${s.slug}: unknown phase "${s.phase}"`);
    if (!CATEGORY_ORDER.includes(s.category)) fail(`${s.slug}: category "${s.category}" is not in CATEGORY_ORDER`);
    if (s.card.includes("|")) fail(`${s.slug}: card contains a pipe, which would break the table`);
  }

  const byCategory = new Map(CATEGORY_ORDER.map((c) => [c, []]));
  for (const s of skills) byCategory.get(s.category).push(s);
  for (const [, list] of byCategory) list.sort((a, b) => a.slug.localeCompare(b.slug));

  const used = CATEGORY_ORDER.filter((c) => byCategory.get(c).length);
  const engines = skills.filter((s) => s.hasEngine);

  const counts = {
    skills: String(skills.length),
    engines: String(engines.length),
    ...Object.fromEntries(
      PHASE_ORDER.map((p) => [`phase-${p.toLowerCase()}`, String(skills.filter((s) => s.phase === p).length)])
    ),
  };

  const contents = used.map((c) => {
    const list = byCategory.get(c);
    const e = list.filter((s) => s.hasEngine).length;
    return `  - [${c}](#${anchor(c)}) — ${list.length} skill${list.length === 1 ? "" : "s"}, ` +
           `${e} engine${e === 1 ? "" : "s"}`;
  }).join("\n");

  const catalog = used.map((c) => {
    const rows = byCategory.get(c).map((s) =>
      `| ${s.hasEngine ? "**E**" : ""} | [\`${s.slug}\`](skills/${s.slug}) | ${s.card} | ${s.phase} |`
    ).join("\n");
    return `### ${c}\n\n| | Skill | What it does | Phase |\n|---|---|---|---|\n${rows}`;
  }).join("\n\n");

  const engineRows = engines.flatMap((s) =>
    s.jsFiles.map((f) => `| \`${s.slug}\` | \`node .agents/skills/${s.slug}/resources/${f} --demo\` |`)
  ).join("\n");
  const engineTable = `| Skill | Command |\n|---|---|\n${engineRows}`;

  return { blocks: { "catalog-contents": contents, catalog, engines: engineTable }, counts };
}

function render(readme, { blocks, counts }) {
  let out = readme;
  const seen = new Set();

  for (const [id, body] of Object.entries(blocks)) {
    const re = new RegExp(
      `(<!-- aaj:begin ${id} -->\\n)[\\s\\S]*?(\\n<!-- aaj:end ${id} -->)`, "g"
    );
    let hits = 0;
    out = out.replace(re, (_m, open, close) => { hits++; return open + body + close; });
    if (hits !== 1) fail(`block marker "${id}" appears ${hits} times in README.md, expected 1`);
    seen.add(id);
  }

  for (const [id, value] of Object.entries(counts)) {
    const re = new RegExp(`(<!-- aaj:n ${id} -->)[^<]*(<!-- aaj:/n -->)`, "g");
    let hits = 0;
    out = out.replace(re, (_m, open, close) => { hits++; return open + value + close; });
    if (hits === 0) fail(`count marker "${id}" is not in README.md`);
  }

  // Any marker in the file that this run does not know how to fill is a marker
  // left behind by a rename — louder here than as a stale number on the page.
  for (const m of out.matchAll(/<!-- aaj:begin ([\w-]+) -->/g)) {
    if (!seen.has(m[1])) fail(`README.md has block marker "${m[1]}" but nothing generates it`);
  }
  for (const m of out.matchAll(/<!-- aaj:n ([\w-]+) -->/g)) {
    if (!(m[1] in counts)) fail(`README.md has count marker "${m[1]}" but nothing generates it`);
  }
  return out;
}

const skills = listSkills(REPO_ROOT);
if (!skills.length) fail(`no skills found under ${REPO_ROOT}/skills`);

// package.json's description is what npm and `npx skills` show, and the
// GitHub "About" text was copied from it. Both said "39 skills, 24 engines"
// while the README said 59 and 45 (found Oct 10). The description is derived
// here too, so the same --check catches it.
const PACKAGE = join(REPO_ROOT, "package.json");
const COUNT_PHRASE = /\d+ skills, \d+ with runnable engines/;
const nSkills = skills.length;
const nEngines = skills.filter((s) => s.hasEngine).length;
const phrase = `${nSkills} skills, ${nEngines} with runnable engines`;
const pkgText = readFileSync(PACKAGE, "utf8");
const pkg = JSON.parse(pkgText);
if (!COUNT_PHRASE.test(pkg.description || "")) fail(`package.json description has no "<n> skills, <n> with runnable engines" phrase to keep current`);
const pkgNext = pkgText.replace(JSON.stringify(pkg.description), JSON.stringify(pkg.description.replace(COUNT_PHRASE, phrase)));
const pkgStale = pkgNext !== pkgText;

const current = readFileSync(README, "utf8");
const eol = current.includes("\r\n") ? "\r\n" : "\n";
const next = render(current.replace(/\r\n/g, "\n"), build(skills)).replace(/\n/g, eol);

// skills.sh.json: how skills.sh groups this repo's page. Derived, so it is never stale.
const SKILLS_SH = join(REPO_ROOT, "skills.sh.json");
const slugSet = new Set(skills.map((x) => x.slug));
const startHere = SKILLS_SH_START.skills.filter((x) => slugSet.has(x));
const skillsSh = {
  $schema: "https://skills.sh/schemas/skills.sh.schema.json",
  notGrouped: "bottom",
  groupings: [
    { title: SKILLS_SH_START.title, description: SKILLS_SH_START.description, skills: startHere },
    ...CATEGORY_ORDER.map((c) => ({
      title: c,
      description: CATEGORY_BLURB[c] || "",
      skills: skills.filter((x) => x.category === c && !startHere.includes(x.slug)).map((x) => x.slug),
    })).filter((g) => g.skills.length),
  ],
};
for (const g of skillsSh.groupings) {
  if (!g.description) delete g.description;
  if (g.title.length > 120 || (g.description || "").length > 500) fail(`skills.sh group "${g.title}" exceeds skills.sh's length limits`);
}
const skillsShNext = JSON.stringify(skillsSh, null, 2) + "\n";
const skillsShCurrent = existsSync(SKILLS_SH) ? readFileSync(SKILLS_SH, "utf8").replace(/\r\n/g, "\n") : "";
const skillsShStale = skillsShNext !== skillsShCurrent;

// counts.json: the published copy of every count. Same --check as the README.
const COUNTS = join(REPO_ROOT, "counts.json");
const counts = buildCounts(skills);
const countsNext = serializeCounts(counts);
const countsCurrent = existsSync(COUNTS) ? readFileSync(COUNTS, "utf8").replace(/\r\n/g, "\n") : "";
const countsStale = countsNext !== countsCurrent;

// A count typed by hand anywhere a reader sees it is the bug this script exists
// to prevent. Generated regions are stripped first; what remains must not state
// "<n> skills" or "<n> engines". Allowed: numbers inside a skill's own method
// (for example "21 checks"), which do not describe the size of the library.
const TYPED_COUNT = /\b\d{2,3}\s+(?:(?:marketing|agent|runnable|real|deterministic|free|open-source)\s+){0,2}(?:skills|engines)\b/gi;
const stripGenerated = (text) =>
  text
    .replace(/<!-- aaj:begin ([\w-]+) -->[\s\S]*?<!-- aaj:end \1 -->/g, "")
    .replace(/<!-- aaj:n [\w-]+ -->[^<]*<!-- aaj:\/n -->/g, "");
const authored = [
  "README.md", "AUTHORING_GUIDE.md", "SKILL_TEMPLATE.md", "skills.sh.json",
  ".claude-plugin/marketplace.json", ".claude-plugin/plugin.json", ".agents/plugins/marketplace.json",
  "platform/mcp/README.md", "platform/mcp-worker/README.md",
];
const walkMd = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walkMd(p) : /\.(md|json)$/.test(f) ? [p] : [];
}) : []);
const typed = [];
for (const rel of [...authored.map((f) => join(REPO_ROOT, f)), ...walkMd(join(REPO_ROOT, "recipes"))]) {
  if (!existsSync(rel)) continue;
  const text = rel.endsWith("README.md") && rel === README ? stripGenerated(next) : readFileSync(rel, "utf8");
  for (const m of text.matchAll(TYPED_COUNT)) typed.push(`${rel.slice(REPO_ROOT.length + 1)}: "${m[0]}"`);
}

const mode = process.argv[2] || "";
if (mode === "--stdout") { process.stdout.write(next); process.exit(0); }

const about = () => console.log(`GitHub "About" text (CI sets it on push to main when REPO_ADMIN_TOKEN is present): ${counts.phrases.github_about}`);

if (mode === "--phrases") {
  console.log(`Counts from skills/: ${nSkills} skills, ${nEngines} with engines, ${counts.skills_without_engine} without.\n`);
  for (const [k, v] of Object.entries(counts.phrases)) console.log(`${k} (${v.length} chars):\n  ${v}\n`);
  process.exit(0);
}

// Plugin manifests: Claude Code reads .claude-plugin/, Codex reads .agents/plugins/.
// On Oct 11, 2026 the Codex file sat in a gitignored folder and never reached GitHub
// while the commit message said it had, so CI now checks that both are present and
// name the same plugin and marketplace as the install commands in the README.
const manifestProblems = [];
const readManifest = (rel) => {
  const path = join(REPO_ROOT, rel);
  if (!existsSync(path)) { manifestProblems.push(`${rel} is missing`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { manifestProblems.push(`${rel} is not valid JSON`); return null; }
};
const pluginManifest = readManifest(".claude-plugin/plugin.json");
const claudeMarketplace = readManifest(".claude-plugin/marketplace.json");
const codexMarketplace = readManifest(".agents/plugins/marketplace.json");
if (pluginManifest && claudeMarketplace && codexMarketplace) {
  for (const [rel, m] of [[".claude-plugin/marketplace.json", claudeMarketplace], [".agents/plugins/marketplace.json", codexMarketplace]]) {
    if (!(m.plugins || []).some((p) => p.name === pluginManifest.name)) manifestProblems.push(`${rel} has no plugin entry named "${pluginManifest.name}"`);
  }
  if (claudeMarketplace.name !== codexMarketplace.name) manifestProblems.push(`the Claude Code and Codex marketplaces are named differently ("${claudeMarketplace.name}" and "${codexMarketplace.name}")`);
  const installName = `${pluginManifest.name}@${claudeMarketplace.name}`;
  if (!next.includes(installName)) manifestProblems.push(`README.md does not show the install name ${installName}`);
}
if (manifestProblems.length) {
  console.error("Plugin manifests are incomplete:");
  for (const p of manifestProblems) console.error(`  ${p}`);
  process.exit(1);
}

if (typed.length) {
  console.error("A skill or engine count is typed by hand. Use a <!-- aaj:n skills --> marker, or leave the number out:");
  for (const t of typed) console.error(`  ${t}`);
  process.exit(1);
}

if (next === current && !pkgStale && !countsStale && !skillsShStale) {
  console.log(`README.md, package.json, counts.json and skills.sh.json up to date — ${nSkills} skills, ${nEngines} engines`);
  if (mode !== "--check") about();
  process.exit(0);
}

if (mode === "--check") {
  if (countsStale) console.error(`counts.json is out of date: skills/ has ${nSkills} skills and ${nEngines} engines. Run: npm run counts\n`);
  if (skillsShStale) console.error(`skills.sh.json is out of date with skills/. Run: npm run counts\n`);
  if (pkgStale) console.error(`package.json description is out of date: it should say "${phrase}". Run: npm run counts\n`);
  if (next !== current) {
    const a = current.replace(/\r\n/g, "\n").split("\n");
    const b = next.replace(/\r\n/g, "\n").split("\n");
    console.error("README.md is out of date. Run: npm run counts\n");
    let shown = 0;
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 20; i++) {
      if (a[i] !== b[i]) {
        if (a[i] !== undefined) console.error(`  ${i + 1}- ${a[i]}`);
        if (b[i] !== undefined) console.error(`  ${i + 1}+ ${b[i]}`);
        shown++;
      }
    }
  }
  process.exit(1);
}

if (next !== current) writeFileSync(README, next);
if (pkgStale) writeFileSync(PACKAGE, pkgNext);
if (countsStale) writeFileSync(COUNTS, countsNext);
if (skillsShStale) writeFileSync(SKILLS_SH, skillsShNext);
console.log(`${[next !== current && "README.md", pkgStale && "package.json", countsStale && "counts.json", skillsShStale && "skills.sh.json"].filter(Boolean).join(", ")} written — ${nSkills} skills, ${nEngines} engines`);
about();
