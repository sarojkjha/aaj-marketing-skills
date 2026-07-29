#!/usr/bin/env node
/**
 * AAJ — brand-voice-governance engine
 *
 * Checks a piece of content against a brand's DEFINED voice — the do/don't list,
 * banned words, and reading-level ceiling captured in .agents/product-marketing.md
 * — block by block, and emits a pass/revise verdict plus an audit trail.
 *
 * This is NOT a general copy-quality scorer (that's copywriting/copy-scorer.js).
 * It answers one narrow question: does THIS content conform to THIS brand's
 * stated rules? A brand whose voice is "playful" and a brand whose voice is
 * "clinical" get opposite verdicts on the same sentence.
 *
 * Modes:
 *   check    — score content against a voice profile, block by block
 *   profile  — extract a checkable profile from a brand-context brief
 *   --demo   — run both on sample data, no arguments
 *   --help   — usage
 *
 * No dependencies. Node 18+.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------


'use strict';

/* ─────────────────────────────  text utils  ───────────────────────────── */

function splitBlocks(text) {
  // A "block" is a paragraph, list item, or heading — the unit an editor fixes.
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) => {
      // split a run of list items / headings into individual blocks
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
      const allListish = lines.length > 1 && lines.every((l) => /^([-*#]|\d+\.)/.test(l));
      return allListish ? lines : [b];
    });
}

function sentences(text) {
  return text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [];
}

function words(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []);
}

function syllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

// Flesch–Kincaid grade level
function gradeLevel(text) {
  const sents = sentences(text);
  const wds = words(text);
  if (!sents.length || !wds.length) return 0;
  const syl = wds.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * (wds.length / sents.length) + 11.8 * (syl / wds.length) - 15.59;
}

/* ─────────────────────────────  matchers  ───────────────────────────── */

// Match a banned term as a whole word/phrase, case-insensitive. Returns the
// matched surface forms with their positions so the audit trail can quote them.
function findTerm(block, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  const hits = [];
  let m;
  while ((m = re.exec(block)) !== null) {
    hits.push({ surface: m[0], index: m.index });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return hits;
}

// A small, defensible default set — only used if the profile names none and the
// brand hasn't opted out. These are the words the brand-context template itself
// lists as "words to avoid" in its example, i.e. AAJ's own house defaults.
const HOUSE_DEFAULT_AVOID = ['synergy', 'leverage', 'robust', 'seamless', 'cutting-edge', 'best-in-class', 'world-class', 'revolutionary', 'game-changing', 'unleash', 'supercharge'];

const HEDGES = ['very', 'really', 'quite', 'basically', 'actually', 'just', 'somewhat', 'fairly', 'rather', 'kind of', 'sort of', 'a bit', 'arguably', 'perhaps', 'maybe'];

/* ─────────────────────────────  profile mode  ───────────────────────────── */

// Extract a checkable voice profile from a brand-context brief's "Voice & tone"
// section. Deterministic parse — no inference, so the profile is auditable.
function profile(cfg) {
  const brief = cfg.brief || '';
  if (!brief.trim()) die('profile mode needs a "brief" field containing the brand-context markdown');

  const out = {
    brand: cfg.brand || null,
    avoid: [],
    prefer: [],
    dos: [],
    donts: [],
    maxGrade: cfg.maxGrade ?? null,
    source: 'parsed from brief',
  };

  // Isolate the Voice & tone section
  const m = brief.match(/#+\s*Voice\s*&?\s*tone[^\n]*\n([\s\S]*?)(?=\n#+\s|\n*$)/i);
  const section = m ? m[1] : brief;

  const grab = (label) => {
    const re = new RegExp(`^[-*]?\\s*${label}\\s*:?\\s*(.+)$`, 'im');
    const mm = section.match(re);
    return mm ? mm[1].trim() : '';
  };
  const listify = (s) => s
    .split(/[,;·]|\band\b/i)
    .map((x) => x.trim()
      .replace(/^[-*\s]+/, '')          // leading bullet/dash
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')  // wrapping quotes
      .replace(/[.。]+$/, '')           // trailing period
      .trim())
    .filter((x) => x && x.length > 1);

  const avoidLine = grab('words to avoid') || grab('avoid') || grab("don't");
  const preferLine = grab('words to use') || grab('prefer') || grab('do');

  out.avoid = listify(avoidLine);
  out.prefer = listify(preferLine);

  // Do / Don't can also appear as their own labelled lines
  const doLine = grab('do');
  const dontLine = grab("don't") || grab('dont') || grab('do not');
  if (doLine && doLine !== preferLine) out.dos = listify(doLine);
  if (dontLine && dontLine !== avoidLine) out.donts = listify(dontLine);

  // Reading-level ceiling, if stated
  const gm = section.match(/grade\s*(?:level|ceiling|max(?:imum)?)?\s*[:=<]?\s*(\d{1,2})/i);
  if (gm && out.maxGrade == null) out.maxGrade = parseInt(gm[1], 10);

  out.avoidEmpty = out.avoid.length === 0;
  return { __profile: out };
}

/* ─────────────────────────────  check mode  ───────────────────────────── */

function resolveProfile(cfg) {
  // Accept an inline profile, a profile parsed from a brief, or fall back to house defaults.
  let p = cfg.profile;
  if (!p && cfg.brief) p = profile({ brief: cfg.brief, brand: cfg.brand, maxGrade: cfg.maxGrade }).__profile;
  if (!p) p = {};
  const avoid = (p.avoid && p.avoid.length) ? p.avoid : (cfg.useHouseDefaults !== false ? HOUSE_DEFAULT_AVOID : []);
  return {
    brand: p.brand || cfg.brand || 'Brand',
    avoid: avoid.map((w) => w.toLowerCase()),
    prefer: (p.prefer || []).map((w) => w.toLowerCase()),
    maxGrade: p.maxGrade ?? cfg.maxGrade ?? 10,
    checkHedges: cfg.checkHedges !== false,
    usedHouseDefaults: !(p.avoid && p.avoid.length),
  };
}

function checkBlock(block, prof, idx) {
  const findings = [];

  for (const term of prof.avoid) {
    for (const hit of findTerm(block, term)) {
      findings.push({ type: 'banned', severity: 'block', term: hit.surface,
        note: `"${hit.surface}" is on this brand's avoid list` });
    }
  }

  if (prof.checkHedges) {
    for (const h of HEDGES) {
      for (const hit of findTerm(block, h)) {
        findings.push({ type: 'hedge', severity: 'warn', term: hit.surface,
          note: `hedge "${hit.surface}" weakens the claim` });
      }
    }
  }

  const grade = gradeLevel(block);
  if (grade > prof.maxGrade + 0.5) {
    findings.push({ type: 'reading-level', severity: 'warn', term: null,
      note: `reads at grade ${grade.toFixed(1)}, ceiling is ${prof.maxGrade}` });
  }

  // longest sentence — a proxy the reading grade can miss on short blocks
  const longest = Math.max(0, ...sentences(block).map((s) => words(s).length));
  if (longest > 30) {
    findings.push({ type: 'long-sentence', severity: 'warn', term: null,
      note: `${longest}-word sentence; consider splitting` });
  }

  const blockingCount = findings.filter((f) => f.severity === 'block').length;
  return {
    idx,
    excerpt: block.length > 90 ? block.slice(0, 87) + '...' : block,
    grade: Number(grade.toFixed(1)),
    findings,
    verdict: blockingCount > 0 ? 'REVISE' : (findings.length ? 'WARN' : 'PASS'),
  };
}

function check(cfg) {
  const text = cfg.file != null ? cfg.file : cfg.content;
  if (typeof text !== 'string' || !text.trim()) {
    die('check mode needs "content" (the text to check) or "file" (its contents)');
  }
  const prof = resolveProfile(cfg);
  const blocks = splitBlocks(text).map((b, i) => checkBlock(b, prof, i + 1));

  const totalBlocks = blocks.length;
  const revise = blocks.filter((b) => b.verdict === 'REVISE').length;
  const warn = blocks.filter((b) => b.verdict === 'WARN').length;
  const pass = totalBlocks - revise - warn;
  const conformance = totalBlocks ? pass / totalBlocks : 1;

  const allFindings = blocks.flatMap((b) => b.findings.map((f) => ({ ...f, block: b.idx })));
  const bannedHits = allFindings.filter((f) => f.type === 'banned');
  const bannedByTerm = {};
  for (const f of bannedHits) bannedByTerm[f.term.toLowerCase()] = (bannedByTerm[f.term.toLowerCase()] || 0) + 1;

  return {
    __check: {
      brand: prof.brand,
      profileUsed: prof.usedHouseDefaults ? 'HOUSE DEFAULTS (no brand avoid-list found)' : 'brand profile',
      maxGrade: prof.maxGrade,
      totalBlocks, pass, warn, revise,
      conformance,
      verdict: revise > 0 ? 'REVISE' : (warn > 0 ? 'PASS WITH NOTES' : 'PASS'),
      blocks,
      bannedByTerm,
      allFindings,
    },
  };
}

/* ─────────────────────────────  rendering  ───────────────────────────── */

const pad = (s, n) => { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); };
const padL = (s, n) => { s = String(s); return ' '.repeat(Math.max(0, n - s.length)) + s; };
function bar(v, w = 22) { const f = Math.round(Math.max(0, Math.min(1, v)) * w); return '█'.repeat(f) + '·'.repeat(w - f); }

function die(msg) {
  console.error(`error: ${msg}\n\nRun --help for usage, or --demo for a worked example.`);
  process.exit(1);
}

function renderProfile(p) {
  const out = [];
  out.push('VOICE PROFILE' + (p.brand ? ` — ${p.brand}` : ''));
  out.push('═'.repeat(56));
  out.push('');
  out.push(`Words to avoid   ${p.avoid.length ? p.avoid.join(', ') : '(none found — check will use house defaults)'}`);
  if (p.prefer.length) out.push(`Words to prefer  ${p.prefer.join(', ')}`);
  if (p.dos.length) out.push(`Do               ${p.dos.join('; ')}`);
  if (p.donts.length) out.push(`Don't            ${p.donts.join('; ')}`);
  out.push(`Grade ceiling    ${p.maxGrade != null ? p.maxGrade : '(not stated — check defaults to 10)'}`);
  out.push('');
  if (p.avoidEmpty) {
    out.push('⚠  No avoid-list parsed from the brief. Either the Voice & tone section');
    out.push('   has no "words to avoid" line, or it is phrased differently. Add one, or');
    out.push('   the check will fall back to AAJ house defaults.');
  } else {
    out.push('Ready to check against. Pass this object as "profile" to check mode,');
    out.push('or pass the same brief and it will be re-parsed.');
  }
  return out.join('\n');
}

function renderCheck(r) {
  const out = [];
  out.push(`BRAND VOICE GOVERNANCE — ${r.brand}`);
  out.push('═'.repeat(56));
  out.push('');
  out.push(`VERDICT   ${r.verdict}`);
  out.push('');
  out.push(`  Conformance   ${padL((r.conformance * 100).toFixed(0) + '%', 5)}  ${bar(r.conformance)}   ${r.pass}/${r.totalBlocks} blocks clean`);
  out.push(`  Profile       ${r.profileUsed}`);
  out.push(`  Grade ceiling ${r.maxGrade}`);
  out.push('');
  out.push(`  ${r.revise} to revise · ${r.warn} with notes · ${r.pass} pass`);
  out.push('');

  if (Object.keys(r.bannedByTerm).length) {
    out.push('BANNED TERMS FOUND');
    for (const [term, n] of Object.entries(r.bannedByTerm).sort((a, b) => b[1] - a[1])) {
      out.push(`  ${pad('"' + term + '"', 22)}${n}×`);
    }
    out.push('');
  }

  out.push('BY BLOCK');
  for (const b of r.blocks) {
    const tag = b.verdict === 'REVISE' ? '✗ REVISE' : b.verdict === 'WARN' ? '! NOTES ' : '✓ PASS  ';
    out.push(`  ${tag}  #${pad(b.idx, 3)} ${b.excerpt}`);
    for (const f of b.findings) {
      const mark = f.severity === 'block' ? '        ✗' : '        ·';
      out.push(`${mark} ${f.note}`);
    }
  }
  out.push('');

  out.push('AUDIT TRAIL');
  out.push(`  ${r.allFindings.length} finding(s) across ${r.totalBlocks} block(s). Each is quoted above with its`);
  out.push('  block number, so an editor or a compliance log can trace every flag to its');
  out.push('  source. Blocking findings (✗) violate a stated brand rule; notes (·) are');
  out.push('  advisory and do not fail the check.');
  out.push('');

  out.push('WHAT THIS MEANS');
  if (r.revise > 0) {
    out.push('  Content violates the brand\'s own stated voice rules. These are not style');
    out.push('  opinions — they are the do/don\'t list the brand wrote for itself. Fix the');
    out.push('  ✗ blocks before publishing; the notes can wait.');
  } else if (r.warn > 0) {
    out.push('  No hard violations. The notes are advisory — hedges, long sentences, or');
    out.push('  a block reading above the grade ceiling. Clear them if it\'s a flagship');
    out.push('  page; leave them if the schedule is tight.');
  } else {
    out.push('  Conforms to the brand\'s stated voice. This checks conformance, not quality —');
    out.push('  run copywriting/copy-scorer for clarity and claim-defensibility.');
  }
  if (r.profileUsed.startsWith('HOUSE')) {
    out.push('');
    out.push('  Note: no brand avoid-list was supplied, so this ran against AAJ house');
    out.push('  defaults. Capture the brand\'s real words-to-avoid in brand-product-context');
    out.push('  for a check that reflects THIS brand rather than a generic one.');
  }
  return out.join('\n');
}

/* ─────────────────────────────  CLI  ───────────────────────────── */

const HELP = `
AAJ — brand-voice-governance engine

  node voice-check.js check   '<json>'
  node voice-check.js profile '<json>'
  node voice-check.js --demo
  node voice-check.js --help

This checks whether content conforms to a brand's OWN stated voice rules. It is
not a general copy-quality scorer — for clarity and claim-defensibility use
copywriting/copy-scorer.js. The two are complementary: one asks "is this good
copy", this one asks "does this sound like THIS brand".

CHECK — score content against a voice profile
  {
    "brand": "Northwind",
    "content": "the text to check, in markdown or plain paragraphs",
    "profile": {                     // optional — omit to parse from "brief"
      "avoid": ["synergy","leverage","robust"],
      "prefer": ["plain","concrete"],
      "maxGrade": 9
    },
    "brief": "...full brand-context markdown...",   // alt. to profile
    "maxGrade": 9,                   // reading-grade ceiling (default 10)
    "checkHedges": true,             // flag very/really/just/etc (default true)
    "useHouseDefaults": true         // if no avoid-list, use AAJ defaults (default true)
  }

PROFILE — extract a checkable profile from a brand-context brief
  {
    "brand": "Northwind",
    "brief": "...markdown containing a 'Voice & tone' section...",
    "maxGrade": 9                    // optional override
  }

  Feed profile output back into check as "profile", or just pass "brief" to
  check directly and it re-parses.

Severities:  ✗ block  = violates a stated brand rule (fails the check)
             ·  note   = advisory (hedge, long sentence, over grade ceiling)
`;

const DEMO_BRIEF = `# Brand & Product Context — Northwind Analytics

## Voice & tone
- Defining adjectives: plain-spoken, practical, a little irreverent.
- Do: short sentences, concrete examples.
- Don't: enterprise jargon, "synergy," "leverage."
- Words to avoid: synergy, leverage, robust, seamless, best-in-class.
- Grade ceiling: 9
`;

const DEMO_CONTENT = `Northwind is a robust, best-in-class analytics platform.

We help you leverage seamless data synergy across your entire organization, unlocking actionable insights that drive real, measurable outcomes for teams who are serious about growth and want to move fast without the overhead.

Set up in an afternoon. No SQL, no data hire.

Our platform is basically just the easiest way to actually see what your users really do.`;

function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP.trim());
    return;
  }

  if (argv.includes('--demo')) {
    console.log('▸ DEMO 1 — profile mode (extract rules from a brief)\n');
    const p = profile({ brief: DEMO_BRIEF, brand: 'Northwind Analytics' }).__profile;
    console.log(renderProfile(p));
    console.log('\n\n▸ DEMO 2 — check mode (content against those rules)\n');
    const r = check({ brand: 'Northwind Analytics', content: DEMO_CONTENT, profile: p }).__check;
    console.log(renderCheck(r));
    console.log('\n(Demo data. Replace with a real brief and real content.)');
    return;
  }

  const mode = argv[0];
  const raw = argv[1];
  if (!raw) die(`mode "${mode}" needs a JSON argument. Try --demo to see the shape.`);

  let cfg;
  try { cfg = JSON.parse(raw); }
  catch (e) { die(`could not parse JSON — ${e.message}`); }

  if (mode === 'check') console.log(renderCheck(check(cfg).__check));
  else if (mode === 'profile') console.log(renderProfile(profile(cfg).__profile));
  else die(`unknown mode "${mode}". Use check, profile, --demo, or --help.`);
}

if (require.main === module) main();

module.exports = {
  check, profile, checkBlock, resolveProfile,
  splitBlocks, gradeLevel, findTerm, syllables,
  HOUSE_DEFAULT_AVOID, HEDGES,
};
