#!/usr/bin/env node
/**
 * Generate the catalog sections of README.md from the skills themselves.
 *
 * The README was hand-maintained and drifted every time a skill was added —
 * four behind on 23 Sep, two behind again the next morning. The counts, the
 * per-category tables and the engine list are all derivable, so they are
 * derived. Everything outside the markers stays hand-written.
 *
 *   node platform/scripts/generate-readme.mjs          # rewrite README.md
 *   node platform/scripts/generate-readme.mjs --check  # fail if it would change
 *   node platform/scripts/generate-readme.mjs --stdout # print, write nothing
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

const current = readFileSync(README, "utf8");
const eol = current.includes("\r\n") ? "\r\n" : "\n";
const next = render(current.replace(/\r\n/g, "\n"), build(skills)).replace(/\n/g, eol);

const mode = process.argv[2] || "";
if (mode === "--stdout") { process.stdout.write(next); process.exit(0); }

if (next === current) {
  console.log(`README.md up to date — ${skills.length} skills, ${skills.filter((s) => s.hasEngine).length} engines`);
  process.exit(0);
}

if (mode === "--check") {
  const a = current.replace(/\r\n/g, "\n").split("\n");
  const b = next.replace(/\r\n/g, "\n").split("\n");
  console.error("README.md is out of date. Run: node platform/scripts/generate-readme.mjs\n");
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 20; i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) console.error(`  ${i + 1}- ${a[i]}`);
      if (b[i] !== undefined) console.error(`  ${i + 1}+ ${b[i]}`);
      shown++;
    }
  }
  process.exit(1);
}

writeFileSync(README, next);
console.log(`README.md written — ${skills.length} skills, ${skills.filter((s) => s.hasEngine).length} engines`);
