#!/usr/bin/env node
/**
 * check-skill-refs.mjs — catalog reference integrity
 *
 * Scans every skills/<slug>/SKILL.md and verifies that each backtick-quoted
 * skill reference points at a slug that actually exists on disk.
 *
 * Run from the repo root:   node scripts/check-skill-refs.mjs
 * Exits 1 on any dangling reference, so it can gate a deploy.
 *
 * Why this exists: `unit-economics` shipped a handoff to `churn-prevention`,
 * a skill that has never existed. Derive identifiers, never type them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = process.argv[2] ?? "skills";

// Words that look like slugs but are not skill references.
const IGNORE = new Set([
  "product-marketing",
  "aaj-brand",
  "package-lock",
  "read-me",
]);

function listSkills(dir) {
  return readdirSync(dir)
    .filter((name) => {
      try {
        return statSync(join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

const slugs = listSkills(SKILLS_DIR);
const valid = new Set(slugs);

// slug-shaped: lowercase, at least one hyphen, no dots or slashes
const SLUG_RE = /`([a-z][a-z0-9]*(?:-[a-z0-9]+){1,4})`/g;

const problems = [];
let refCount = 0;

for (const slug of slugs) {
  const path = join(SKILLS_DIR, slug, "SKILL.md");
  let body;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    problems.push({ slug, ref: "(SKILL.md missing)", kind: "missing-file" });
    continue;
  }

  const seen = new Set();
  for (const m of body.matchAll(SLUG_RE)) {
    const ref = m[1];
    if (seen.has(ref) || IGNORE.has(ref)) continue;
    seen.add(ref);
    refCount++;
    if (!valid.has(ref)) {
      problems.push({ slug, ref, kind: "dangling", suggestion: nearest(ref, slugs) });
    }
  }
}

function nearest(ref, candidates) {
  let best = null;
  let bestScore = 0;
  const refParts = new Set(ref.split("-"));
  for (const c of candidates) {
    const cParts = c.split("-");
    const overlap = cParts.filter((p) => refParts.has(p)).length;
    const score = overlap / Math.max(refParts.size, cParts.length);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.3 ? best : null;
}

console.log(`skills found:      ${slugs.length}`);
console.log(`references checked: ${refCount}`);
console.log("");

if (problems.length === 0) {
  console.log("OK - every skill reference resolves.");
  process.exit(0);
}

console.log(`DANGLING REFERENCES: ${problems.length}`);
console.log("");
const byRef = new Map();
for (const p of problems) {
  if (!byRef.has(p.ref)) byRef.set(p.ref, { refs: [], suggestion: p.suggestion });
  byRef.get(p.ref).refs.push(p.slug);
}
for (const [ref, info] of [...byRef].sort()) {
  const hint = info.suggestion ? `  -> did you mean: ${info.suggestion}` : "  -> no close match";
  console.log(`  ${ref}${hint}`);
  for (const s of info.refs.sort()) console.log(`      referenced by: ${s}`);
}
console.log("");
console.log("Fix the sources, not the generated copies.");
process.exit(1);
