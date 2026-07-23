#!/usr/bin/env node
/**
 * AAJ — copy-scorer
 * Scores marketing copy on clarity, specificity, and claim-defensibility.
 * No dependencies. Node 14+.
 *
 *   node resources/copy-scorer.js                       # demo
 *   node resources/copy-scorer.js "your copy here"
 *   node resources/copy-scorer.js --file page.md
 *   node resources/copy-scorer.js --help
 */

// ── word lists ──────────────────────────────────────────────────────────────
// Claims that assert superiority or transformation without evidence. These are
// the ones that get ads rejected and erode trust — flagged hardest.
const UNSUBSTANTIATED = [
  "best", "best-in-class", "leading", "industry-leading", "world-class",
  "#1", "number one", "premier", "unparalleled", "unmatched", "unrivaled",
  "revolutionary", "game-changing", "game changer", "groundbreaking",
  "cutting-edge", "state-of-the-art", "next-generation", "next-gen",
  "ultimate", "perfect", "flawless", "guaranteed", "effortless", "seamless",
  "10x", "skyrocket", "explode", "transform your", "supercharge"
];

// Words that soften a claim into meaninglessness.
const HEDGES = [
  "might", "maybe", "perhaps", "possibly", "somewhat", "fairly", "rather",
  "quite", "generally", "typically", "usually", "often", "sometimes",
  "arguably", "relatively", "virtually", "essentially", "basically",
  "helps you", "aims to", "seeks to", "strives to", "designed to",
  "can help", "may help", "could help", "look to", "hope to"
];

// Corporate filler that carries no information.
const JARGON = [
  "leverage", "synergy", "synergies", "holistic", "paradigm", "ecosystem",
  "empower", "unlock", "turnkey", "bespoke", "mission-critical", "end-to-end",
  "best practices", "value-add", "value add", "disrupt", "disruptive",
  "ideate", "bandwidth", "circle back", "low-hanging fruit", "move the needle",
  "north star", "double down", "deep dive", "at scale", "robust", "scalable",
  "innovative", "solutions", "offerings", "capabilities", "streamline",
  "optimize", "utilize", "facilitate", "cohesive", "frictionless"
];

// Abstractions that need a concrete noun behind them.
const VAGUE_NOUNS = [
  "solutions", "offerings", "capabilities", "experiences", "journeys",
  "outcomes", "results", "value", "impact", "growth", "success", "efficiency",
  "productivity", "engagement", "insights", "opportunities"
];

const IRREGULAR_PARTICIPLES = [
  "built", "done", "made", "seen", "known", "given", "taken", "found",
  "held", "kept", "sent", "told", "brought", "bought", "driven", "written",
  "chosen", "shown", "grown", "led", "put", "set", "run", "begun"
];

// ── text utilities ──────────────────────────────────────────────────────────
function sentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function words(text) {
  return (text.toLowerCase().match(/\b[a-z0-9][a-z0-9'’-]*\b/g) || []);
}

/** Heuristic English syllable count. Good enough for readability indices. */
function syllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return word.length ? 1 : 0;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

function countPhrases(text, list) {
  const lower = " " + text.toLowerCase().replace(/\s+/g, " ") + " ";
  const hits = [];
  for (const term of list) {
    // Word-boundary match that tolerates multi-word phrases and hyphens.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![a-z0-9-])${escaped}(?![a-z0-9-])`, "g");
    const found = lower.match(re);
    if (found) hits.push({ term, count: found.length });
  }
  return hits.sort((a, b) => b.count - a.count);
}

function totalHits(hits) {
  return hits.reduce((s, h) => s + h.count, 0);
}

// ── metrics ─────────────────────────────────────────────────────────────────
function readability(text) {
  const sents = sentences(text);
  const wds = words(text);
  if (!sents.length || !wds.length) return null;
  const syl = wds.reduce((s, w) => s + syllables(w), 0);
  const wps = wds.length / sents.length;
  const spw = syl / wds.length;
  const flesch = 206.835 - 1.015 * wps - 84.6 * spw;
  const grade = 0.39 * wps + 11.8 * spw - 15.59;
  const longest = sents.reduce((a, s) => (words(s).length > words(a).length ? s : a), sents[0]);
  return {
    sentences: sents.length,
    words: wds.length,
    avgSentenceLength: round(wps, 1),
    fleschReadingEase: round(flesch, 1),
    gradeLevel: round(Math.max(0, grade), 1),
    longestSentenceWords: words(longest).length,
    longestSentence: longest.length > 140 ? longest.slice(0, 140) + "…" : longest
  };
}

/** Concrete evidence: numbers, currency, percentages, proper nouns. */
function specificity(text) {
  const numbers = (text.match(/(?<![a-zA-Z])\$?\d[\d,.]*\s?(%|x|×)?/g) || []).length;
  // Capitalised words that aren't sentence-initial → likely proper nouns.
  const sents = sentences(text);
  let proper = 0;
  for (const s of sents) {
    const toks = s.split(/\s+/).slice(1);
    proper += toks.filter(t => /^[A-Z][a-z]{2,}/.test(t)).length;
  }
  const wordCount = words(text).length || 1;
  const per100 = ((numbers + proper) / wordCount) * 100;
  return {
    numbers,
    properNouns: proper,
    concretePer100Words: round(per100, 1)
  };
}

function passiveVoice(text) {
  const be = /\b(is|are|was|were|be|been being|been|being|get|gets|got)\b/gi;
  const sents = sentences(text);
  let count = 0;
  const examples = [];
  for (const s of sents) {
    const toks = s.split(/\s+/);
    for (let i = 0; i < toks.length - 1; i++) {
      const w = toks[i].toLowerCase().replace(/[^a-z]/g, "");
      if (!be.test(" " + w + " ")) { be.lastIndex = 0; continue; }
      be.lastIndex = 0;
      const next = toks[i + 1].toLowerCase().replace(/[^a-z]/g, "");
      if (/ed$/.test(next) || IRREGULAR_PARTICIPLES.includes(next)) {
        count++;
        if (examples.length < 3) examples.push(`${toks[i]} ${toks[i + 1]}`);
        break;
      }
    }
  }
  return { sentencesWithPassive: count, share: round((count / (sents.length || 1)) * 100, 0), examples };
}

function round(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

// ── scoring ─────────────────────────────────────────────────────────────────
function score(text) {
  const read = readability(text);
  if (!read) return null;
  const spec = specificity(text);
  const passive = passiveVoice(text);
  const unsub = countPhrases(text, UNSUBSTANTIATED);
  const hedge = countPhrases(text, HEDGES);
  const jargon = countPhrases(text, JARGON);
  const vague = countPhrases(text, VAGUE_NOUNS);

  const per100 = n => (n / read.words) * 100;

  // Each dimension scored 0–100. Deductions are capped so one bad dimension
  // can't zero out the whole score.
  const clarity = clamp(100
    - Math.max(0, read.avgSentenceLength - 18) * 3.5
    - Math.max(0, read.gradeLevel - 10) * 4
    - Math.max(0, passive.share - 15) * 1.2);

  const claims = clamp(100
    - per100(totalHits(unsub)) * 26
    - per100(totalHits(hedge)) * 13);

  const concreteness = clamp(
    Math.min(100, spec.concretePer100Words * 14)
    - per100(totalHits(vague)) * 9
    - per100(totalHits(jargon)) * 11);

  const overall = Math.round(clarity * 0.3 + claims * 0.4 + concreteness * 0.3);

  // Below ~25 words the ratios are too noisy to mean anything. Say so rather
  // than returning a confident number on a headline-length sample.
  const tooShort = read.words < 25;

  return {
    overall,
    tooShort,
    verdict: tooShort
      ? `INDICATIVE ONLY — ${read.words} words is too short to score reliably (need ~25+)`
      : verdictFor(overall),
    dimensions: {
      clarity: Math.round(clarity),
      claimDefensibility: Math.round(claims),
      concreteness: Math.round(concreteness)
    },
    readability: read,
    specificity: spec,
    passive,
    flags: {
      unsubstantiated: unsub,
      hedges: hedge,
      jargon: jargon,
      vagueNouns: vague
    }
  };
}

function clamp(n) { return Math.max(0, Math.min(100, n)); }

function verdictFor(n) {
  if (n >= 80) return "SHIP — clear, concrete, and defensible";
  if (n >= 65) return "CLOSE — tighten the flagged items and ship";
  if (n >= 45) return "REWORK — specific problems to fix below";
  return "REWRITE — the copy is mostly abstraction or unbacked claims";
}

// ── fixes ───────────────────────────────────────────────────────────────────
function fixes(r) {
  const out = [];
  if (r.tooShort) out.push(`Sample is only ${r.readability.words} words — scores below are indicative. Paste the full asset for a reliable read.`);
  const u = totalHits(r.flags.unsubstantiated);
  if (u) out.push(`Replace ${u} unsubstantiated claim${u > 1 ? "s" : ""} (${r.flags.unsubstantiated.slice(0, 3).map(h => `"${h.term}"`).join(", ")}) with a fact you can prove on request.`);
  const h = totalHits(r.flags.hedges);
  if (h >= 2) out.push(`Cut ${h} hedge${h > 1 ? "s" : ""} (${r.flags.hedges.slice(0, 3).map(x => `"${x.term}"`).join(", ")}). "Helps you do X" is weaker than "does X".`);
  const j = totalHits(r.flags.jargon);
  if (j >= 2) out.push(`Remove ${j} jargon term${j > 1 ? "s" : ""} (${r.flags.jargon.slice(0, 3).map(x => `"${x.term}"`).join(", ")}). Say the plain thing instead.`);
  if (r.specificity.concretePer100Words < 3) out.push(`Add evidence — only ${r.specificity.concretePer100Words} concrete items (numbers, names) per 100 words. Specifics are what make copy believable.`);
  if (r.readability.avgSentenceLength > 20) out.push(`Shorten sentences — averaging ${r.readability.avgSentenceLength} words. Longest runs ${r.readability.longestSentenceWords}.`);
  if (r.readability.gradeLevel > 12) out.push(`Simplify vocabulary — reading level is grade ${r.readability.gradeLevel}. Aim for 8–10 on marketing pages.`);
  if (r.passive.share > 25) out.push(`Convert passive to active — ${r.passive.share}% of sentences are passive (${r.passive.examples.slice(0, 2).join(", ")}).`);
  const v = totalHits(r.flags.vagueNouns);
  if (v >= 3) out.push(`Ground ${v} abstract noun${v > 1 ? "s" : ""} (${r.flags.vagueNouns.slice(0, 3).map(x => `"${x.term}"`).join(", ")}) in something the reader can picture.`);
  if (!out.length) out.push("No structural problems found. Check message-match against the positioning before shipping.");
  return out;
}

// ── output ──────────────────────────────────────────────────────────────────
function bar(n) {
  const filled = Math.round(n / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function report(text, r) {
  const L = [];
  L.push("");
  L.push("AAJ · COPY SCORE");
  L.push("─".repeat(58));
  L.push(`  Overall            ${bar(r.overall)}  ${r.overall}/100`);
  L.push(`  ${r.verdict}`);
  L.push("");
  L.push(`  Clarity            ${bar(r.dimensions.clarity)}  ${r.dimensions.clarity}`);
  L.push(`  Claim defensibility${bar(r.dimensions.claimDefensibility)}  ${r.dimensions.claimDefensibility}`);
  L.push(`  Concreteness       ${bar(r.dimensions.concreteness)}  ${r.dimensions.concreteness}`);
  L.push("");
  L.push("─".repeat(58));
  L.push(`  ${r.readability.words} words · ${r.readability.sentences} sentences · avg ${r.readability.avgSentenceLength} words/sentence`);
  L.push(`  Reading level grade ${r.readability.gradeLevel} · Flesch ${r.readability.fleschReadingEase}`);
  L.push(`  Concrete items per 100 words: ${r.specificity.concretePer100Words} (${r.specificity.numbers} numbers, ${r.specificity.properNouns} names)`);
  L.push(`  Passive sentences: ${r.passive.share}%`);
  L.push("");

  const groups = [
    ["Unsubstantiated claims", r.flags.unsubstantiated],
    ["Hedges", r.flags.hedges],
    ["Jargon", r.flags.jargon],
    ["Vague nouns", r.flags.vagueNouns]
  ];
  const any = groups.some(([, g]) => g.length);
  if (any) {
    L.push("FLAGGED");
    for (const [label, g] of groups) {
      if (!g.length) continue;
      L.push(`  ${label}: ${g.map(h => `${h.term}${h.count > 1 ? ` ×${h.count}` : ""}`).join(", ")}`);
    }
    L.push("");
  }

  L.push("FIX FIRST");
  fixes(r).forEach((f, i) => L.push(`  ${i + 1}. ${f}`));
  L.push("");
  L.push("─".repeat(58));
  L.push("JSON");
  L.push(JSON.stringify({
    overall: r.overall,
    verdict: r.verdict,
    dimensions: r.dimensions,
    readability: r.readability,
    specificity: r.specificity,
    passiveShare: r.passive.share,
    flags: {
      unsubstantiated: r.flags.unsubstantiated,
      hedges: r.flags.hedges,
      jargon: r.flags.jargon,
      vagueNouns: r.flags.vagueNouns
    },
    fixes: fixes(r)
  }, null, 2));
  L.push("");
  return L.join("\n");
}

const HELP = `
AAJ copy-scorer — score marketing copy on clarity, specificity and claim-defensibility.

Usage
  node resources/copy-scorer.js                     Run the built-in demo
  node resources/copy-scorer.js "your copy here"    Score a string
  node resources/copy-scorer.js --file page.md      Score a file
  node resources/copy-scorer.js --json "copy"       JSON only
  node resources/copy-scorer.js --help              This message

Dimensions
  Clarity              sentence length, reading level, passive voice
  Claim defensibility  unsubstantiated superlatives and hedges  (weighted highest)
  Concreteness         numbers and names vs jargon and abstraction

Scoring is directional, not a verdict on whether the copy is persuasive.
It cannot tell you whether the message is right — only whether it is
clear, concrete, and defensible. Judge message-match separately.
`;

const DEMO = `Acme is the leading platform for modern teams. Our innovative, best-in-class
solutions empower organizations to unlock growth and streamline their workflows
end-to-end. Designed to help you leverage cutting-edge capabilities, Acme's
robust ecosystem might be the game-changing partner your business needs to
transform your outcomes and drive seamless, frictionless experiences at scale.`;

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const jsonOnly = argv.includes("--json");
  let text = null;
  const fileIdx = argv.indexOf("--file");
  if (fileIdx !== -1 && argv[fileIdx + 1]) {
    try {
      text = require("fs").readFileSync(argv[fileIdx + 1], "utf8");
    } catch (e) {
      console.error(`Could not read file: ${argv[fileIdx + 1]}`);
      process.exit(1);
    }
  } else {
    text = argv.filter(a => !a.startsWith("--"))[0] || null;
  }

  let demo = false;
  if (!text) { text = DEMO; demo = true; }

  const r = score(text);
  if (!r) { console.error("No scoreable text found."); process.exit(1); }

  if (jsonOnly) {
    console.log(JSON.stringify({ overall: r.overall, verdict: r.verdict, dimensions: r.dimensions, flags: r.flags, fixes: fixes(r) }, null, 2));
    return;
  }
  if (demo) console.log("\n(demo copy — pass a string or --file to score your own)");
  console.log(report(text, r));
}

if (require.main === module) main();
module.exports = { score, fixes, readability, specificity };
