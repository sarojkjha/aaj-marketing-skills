#!/usr/bin/env node
/**
 * fix-skill-refs.mjs — apply the agreed dangling-reference resolutions.
 *
 *   node scripts/fix-skill-refs.mjs skills          # dry run, shows diff
 *   node scripts/fix-skill-refs.mjs skills --write  # actually edit
 *
 * Only touches the `Related skills` line. Reports anything it could not
 * find rather than guessing, so a silent miss is impossible.
 *
 * After running: node scripts/check-skill-refs.mjs skills   (must exit 0)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "skills";
const WRITE = process.argv.includes("--write");

// slug -> [ [find, replaceWith] ]
// replaceWith === null means: delete the reference and its parenthetical.
const FIXES = {
  "unit-economics": [["churn-prevention", "lifecycle-and-retention"]],
  "geo-content-optimization": [
    ["content-strategy", "content-calendar-planning"],
    ["schema", null],
  ],
  "seo-geo-aeo-audit": [
    ["site-architecture", null],
    ["schema", null],
  ],
  "positioning-statement": [
    ["customer-research", "customer-survey-design"],
    ["competitor-profiling", "win-loss-analysis"],
  ],
  "persona-builder": [
    ["customer-research", "customer-survey-design"],
    ["competitor-profiling", "win-loss-analysis"],
  ],
  "incrementality-and-mmm": [["marketing-attribution", null]],
  "paid-media-budget-allocation": [["analytics-tracking", "marketing-report"]],
  "ab-test-significance": [["analytics-tracking", "marketing-report"]],
  "marketing-budget-planning": [["marketing-plan", "campaign-orchestrator"]],
};

let changed = 0;
const notFound = [];

for (const [slug, edits] of Object.entries(FIXES)) {
  const path = join(DIR, slug, "SKILL.md");
  let body;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    notFound.push(`${slug}: SKILL.md unreadable`);
    continue;
  }

  const before = body;

  for (const [find, replaceWith] of edits) {
    const tick = "`" + find + "`";
    if (!body.includes(tick)) {
      notFound.push(`${slug}: \`${find}\` not present`);
      continue;
    }

    if (replaceWith) {
      body = body.split(tick).join("`" + replaceWith + "`");
    } else {
      // Remove `slug` plus an immediately following parenthetical,
      // then tidy the separators around the hole.
      const re = new RegExp(
        "`" + find + "`(\\s*\\([^)]*\\))?",
        "g"
      );
      body = body.replace(re, "\u0000");
      body = body
        .replace(/\s*·\s*\u0000/g, "")
        .replace(/\u0000\s*·\s*/g, "")
        .replace(/\u0000\s*and\s*/g, "")
        .replace(/\s*and\s*\u0000/g, "")
        .replace(/\u0000/g, "")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/ +\./g, ".");
    }
  }

  if (body !== before) {
    changed++;
    console.log(`\n--- ${slug}`);
    const oldLine = before.split("\n").find((l) => l.includes("`") && l.includes("·")) ?? "";
    const newLine = body.split("\n").find((l) => l.includes("`") && l.includes("·")) ?? "";
    console.log(`  -  ${oldLine.trim()}`);
    console.log(`  +  ${newLine.trim()}`);
    if (WRITE) writeFileSync(path, body, "utf8");
  }
}

console.log("");
console.log(`files changed: ${changed}${WRITE ? " (written)" : " (dry run)"}`);
if (notFound.length) {
  console.log("\nNOT APPLIED - handle these by hand:");
  for (const n of notFound) console.log("  " + n);
}
if (!WRITE) console.log("\nRe-run with --write to apply.");
