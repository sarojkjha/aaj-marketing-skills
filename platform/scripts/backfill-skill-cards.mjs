#!/usr/bin/env node
/**
 * One-time backfill, safe to re-run.
 *
 * Two jobs, both idempotent:
 *   1. Move each skill's "what it does" one-liner out of README.md and into its
 *      own SKILL.md as `metadata.card`. The README's table was the only place
 *      that sentence lived, which is why adding a skill meant remembering to
 *      hand-edit a table — and why the table was four skills behind.
 *   2. Insert the generator's markers into README.md.
 *
 * After this runs once, platform/scripts/generate-readme.mjs owns the counts,
 * the category tables and the engine list. This file can then be deleted.
 *
 * It validates every edit before writing anything: if one anchor does not
 * match exactly once, nothing on disk changes.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.AAJ_SKILLS_ROOT || join(HERE, "..", ".."));

const CARDS = {
  "ab-test-significance": "Checks whether an A/B result is significant, or sizes a test before you run it.",
  "abm-program-design": "Checks whether the team can run the account list and whether the list hits the number.",
  "agent-readiness-audit": "Scores whether an AI agent buying for a customer can find, evaluate and transact with you.",
  "ai-marketing-governance": "Scores whether a team's AI use is governed, and refuses citations that cannot be checked.",
  "brand-product-context": "Builds the shared brand brief every other skill reads first.",
  "brand-voice-governance": "Checks content block by block against your own voice rules, with a pass/revise verdict.",
  "campaign-orchestrator": "Diagnoses which play applies, then sequences the other skills in order.",
  "case-study-and-proof": "Scores whether proof would convince a sceptic, and whether you may publish it at all.",
  "cold-email-sequence": "Writes outbound sequences that survive a reply-rate audit.",
  "content-calendar-planning": "Costs a content plan in hours against real capacity, and names what to cut.",
  "content-repurposing": "Turns one pillar asset into channel-adapted derivatives, reusing only what it says.",
  "copywriting": "Rewrites page copy to ladder to the positioning, scored on claim-defensibility.",
  "customer-survey-design": "Designs surveys that produce usable answers, with sample sizing and segments.",
  "discovery-call-framework": "Structures discovery so the call qualifies rather than pitches.",
  "email-lifecycle-sequence": "Maps which lifecycle sequences exist, checks send load, writes the missing ones.",
  "founder-led-content": "Scores a founder's channel setup, and checks a post against the themes only they can write.",
  "geo-citation-tracker": "Measures whether AI engines name and cite you, and refuses to report noise as movement.",
  "geo-content-optimization": "Rewrites a page to maximise the chance an AI engine cites it.",
  "incrementality-and-mmm": "Designs and reads holdout tests honestly, including whether they could ever have answered.",
  "landing-page-brief": "Specs a landing page before anyone designs it.",
  "lifecycle-and-retention": "Computes churn, NRR, GRR and quick ratio, then diagnoses which one to fix.",
  "marketing-budget-planning": "Plans a budget from a CAC target rather than a percentage of revenue.",
  "marketing-loops": "Computes the loop factor, finds the throttling stage, projects users over time.",
  "marketing-psychology": "Diagnoses which decision friction blocks the buyer, with a line between persuasion and manipulation.",
  "marketing-report": "Turns funnel, spend and pipeline numbers into a board-ready narrative.",
  "messaging-framework": "Structures the message hierarchy beneath the positioning.",
  "objection-handling": "Builds responses to the objections that actually lose deals.",
  "onboarding-activation": "Defines the activation moment from data and finds where new users stall.",
  "paid-media-budget-allocation": "Splits spend across channels to hit a CAC target, with diminishing returns modelled.",
  "partnerships-and-co-marketing": "Scores partners on audience overlap rather than fame, and judges the result on pipeline.",
  "persona-builder": "Builds personas from evidence rather than imagination.",
  "pipeline-and-forecast": "Weights pipeline by stage and says whether coverage is real.",
  "positioning-statement": "Produces a positioning statement pressure-tested against the competitive alternative.",
  "pr-and-earned-media": "Scores a story before it is pitched, and aims it at twenty of the right people.",
  "pricing-and-packaging": "Designs tiers with an anchor check and a willingness-to-pay read.",
  "programmatic-seo": "Models whether a template-page build pays back before anything gets written.",
  "sales-process-design": "Designs the stages and exit criteria a forecast can rely on.",
  "seo-content-brief": "Produces a writer-ready brief: intent, answer block, entities, internal links.",
  "seo-geo-aeo-audit": "Scores a page 0-100 across SEO, GEO and AEO, with fixes in priority order.",
  "signup-flow-optimizer": "Scores signup friction and ranks what to remove by what it's worth.",
  "target-account-list": "Scores and tiers accounts by ICP fit, showing the signals each matched.",
  "unit-economics": "Computes LTV, CAC, payback and the ratio, then returns a verdict against benchmarks.",
  "value-proposition": "Sharpens the value proposition into something defensible.",
  "website-conversion-audit": "Audits a page for conversion friction and grades it.",
  "win-loss-analysis": "Finds the Pareto of why deals are actually lost, by revenue.",
};

const fail = (m) => { console.error(`backfill: ${m}`); process.exit(2); };

/* ---------------- 1. cards into frontmatter ---------------- */

const wrap = (s, width = 86, indent = "    ") => {
  const out = []; let line = indent;
  for (const w of s.split(/\s+/)) {
    if (line.length > indent.length && line.length + 1 + w.length > width) { out.push(line); line = indent; }
    line += (line.length > indent.length ? " " : "") + w;
  }
  if (line.trim()) out.push(line);
  return out.join("\n");
};

const planned = [];
let already = 0;

for (const [slug, card] of Object.entries(CARDS)) {
  const p = join(ROOT, "skills", slug, "SKILL.md");
  if (!existsSync(p)) fail(`${slug}: no SKILL.md at ${p}`);
  const src = readFileSync(p, "utf8");
  if (/^\s{2}card:/m.test(src)) { already++; continue; }
  const m = src.match(/^(\s{2}difficulty:.*)$/m);
  if (!m) fail(`${slug}: no "  difficulty:" line in the metadata block to anchor on`);
  const nl = src.includes("\r\n") ? "\r\n" : "\n";
  const block = m[1] + nl + "  card: >-" + nl + wrap(card).split("\n").join(nl);
  planned.push([p, src.slice(0, m.index) + block + src.slice(m.index + m[1].length), slug]);
}

/* ---------------- 2. markers into README ---------------- */

const readmePath = join(ROOT, "README.md");
let readme = readFileSync(readmePath, "utf8");
const readmeHadMarkers = readme.includes("<!-- aaj:begin catalog -->");
let newReadme = null;

if (!readmeHadMarkers) {
  let t = readme.replace(/\r\n/g, "\n");
  const n = (id, v) => `<!-- aaj:n ${id} -->${v}<!-- aaj:/n -->`;
  const one = (re, rep, label) => {
    const before = t;
    t = t.replace(re, rep);
    if (t === before) fail(`README anchor not found: ${label} — nothing was written`);
    if (before.match(new RegExp(re.source, re.flags.replace("g", "") + "g"))?.length !== 1)
      fail(`README anchor matched more than once: ${label} — nothing was written`);
  };

  one(/^# (\d+) Marketing Skills/m, (_m, v) => `# ${n("skills", v)} Marketing Skills`, "title skill count");
  one(/AI agents\. (\d+) run real engines\./, (_m, v) => `AI agents. ${n("engines", v)} run real engines.`, "title engine count");
  one(/\*\*(\d+) of the (\d+) ship a runnable engine\*\*/,
      (_m, e, s) => `**${n("engines", e)} of the ${n("skills", s)} ship a runnable engine**`, "intro sentence");
  one(/(  - \[Strategy & Positioning\][\s\S]*?revops\) — \d+ skills?, \d+ engines?)/,
      (_m, b) => `<!-- aaj:begin catalog-contents -->\n${b}\n<!-- aaj:end catalog-contents -->`, "contents list");
  one(/(### Strategy & Positioning\n[\s\S]*?\n)(\n---\n\n## Engines at a glance)/,
      (_m, b, tail) => `<!-- aaj:begin catalog -->\n${b.replace(/\n+$/, "")}\n<!-- aaj:end catalog -->\n${tail}`, "catalog tables");
  one(/(\| Skill \| Command \|\n\|---\|---\|\n(?:\|.*\n)+?)(\n---\n\n## Methodology)/,
      (_m, b, tail) => `<!-- aaj:begin engines -->\n${b.replace(/\n+$/, "")}\n<!-- aaj:end engines -->\n${tail}`, "engines table");
  for (const phase of ["Diagnose", "Design", "Execute"]) {
    one(new RegExp(`\\*\\*${phase}\\*\\* \\((\\d+) skills\\)`),
        (_m, v) => `**${phase}** (${n("phase-" + phase.toLowerCase(), v)} skills)`, `${phase} count`);
  }
  newReadme = readme.includes("\r\n") ? t.replace(/\n/g, "\r\n") : t;
}

/* ---------------- write ---------------- */

if (!planned.length && !newReadme) {
  console.log(`nothing to do — ${already} skills already carry a card, README already marked up`);
  process.exit(0);
}
for (const [p, out, slug] of planned) { writeFileSync(p, out); console.log(`  card  ${slug}`); }
if (newReadme) { writeFileSync(readmePath, newReadme); console.log("  markers  README.md"); }
console.log(`\n${planned.length} card(s) added, ${already} already had one${newReadme ? ", README marked up" : ""}.`);
console.log("Next: node platform/scripts/generate-readme.mjs");
