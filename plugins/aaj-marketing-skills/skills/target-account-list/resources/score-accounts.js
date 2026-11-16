#!/usr/bin/env node
/**
 * score-accounts.js — AAJ · target-account-list
 *
 * Scores accounts by ICP fit. Each signal has a weight (how predictive it is of a
 * good deal). An account gives each signal a value: true/false, or a rating from
 * 0 to 10 for a signal that is a matter of degree.
 *
 *   value      = 1 for true, 0 for false, rating / 10 for a rating
 *   fit score  = max(0, sum of weight x value) / sum of the positive weights x 100
 *
 * A negative weight lowers the score when the signal holds (a competitor's
 * customer, say); the score never drops below 0. A disqualifier rules the account
 * out whatever its score (tier "Out"). With only true/false signals and positive
 * weights this is matched weight / total weight x 100, as before.
 * Tiers: A >= 70, B 40-69, C < 40 (AAJ's cut-offs, not a published standard).
 *
 * Usage:
 *   node score-accounts.js                 # runs the built-in demo
 *   node score-accounts.js --input=accounts.json
 *
 * Input JSON shape:
 *   {
 *     "weights": { "industryMatch": 30, "sizeBand": 25, "competitorCustomer": -20 },
 *                                     // optional; demo weights used if omitted
 *     "disqualifiers": [ "outsideRegion" ],   // optional; signals that rule an account out
 *     "accounts": [ { "name": "Prospect A", "domain": "example.com",   // domain optional
 *                     "signals": { "industryMatch": true, "sizeBand": 7,
 *                                  "competitorCustomer": false, "outsideRegion": false } } ]
 *   }
 *
 * Deterministic. No external dependencies.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// Windows shells (PowerShell, cmd) can pass a JSON payload with its quotes
// backslash-escaped, i.e. {\"a\":1}. Undo that only when the payload opens that
// way, so JSON with legitimately escaped quotes inside strings is left alone.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^\s*[\[{]\s*\\"/.test(a) ? a.replace(/\\"/g, '"') : a
);
// -----------------------------------------------------------------------------


"use strict";

const DEMO_WEIGHTS = {
  industryMatch: 30,        // in a target industry
  sizeBand: 25,             // employee count in the ICP band
  usesComplementaryTool: 15,// runs a tool that pairs with ours
  recentFunding: 15,        // raised in the last ~12 months
  hiringSignal: 15,         // hiring for a relevant role
};

const DEMO_ACCOUNTS = [
  { name: "Prospect A (SaaS)", signals: { industryMatch: true,  sizeBand: true,  usesComplementaryTool: true,  recentFunding: true,  hiringSignal: true } },
  { name: "Prospect B (software)", signals: { industryMatch: true,  sizeBand: true,  usesComplementaryTool: true,  recentFunding: false, hiringSignal: true } },
  { name: "Prospect C",      signals: { industryMatch: true,  sizeBand: true,  usesComplementaryTool: false, recentFunding: false, hiringSignal: false } },
  { name: "Prospect D (retail)", signals: { industryMatch: false, sizeBand: true,  usesComplementaryTool: false, recentFunding: true,  hiringSignal: false } },
  { name: "Prospect E (enterprise)", signals: { industryMatch: true,  sizeBand: false, usesComplementaryTool: true,  recentFunding: false, hiringSignal: false } },
  { name: "Prospect F (SMB)", signals: { industryMatch: false, sizeBand: false, usesComplementaryTool: false, recentFunding: false, hiringSignal: true } },
];

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// A signal's value: 1 for true, 0 for false, rating / 10 for a 0-10 rating.
function valueOf(v) { return v === true ? 1 : v === false || v === undefined ? 0 : v / 10; }
function shown(signal, v) { return typeof v === "number" ? `${signal} ${v}/10` : signal; }

function tierFor(score) {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

function scoreAccount(account, weights, positiveWeight, disqualifiers) {
  const matched = [], lowered = [];
  let earned = 0;
  for (const [signal, weight] of Object.entries(weights)) {
    const v = account.signals ? account.signals[signal] : undefined;
    const x = valueOf(v);
    if (x > 0) {
      earned += weight * x;
      (weight > 0 ? matched : lowered).push(shown(signal, v));
    }
  }
  const score = positiveWeight > 0 ? Math.round((Math.max(0, earned) / positiveWeight) * 100) : 0;
  const ruledOutBy = (disqualifiers || []).filter((d) => account.signals && account.signals[d] === true);
  return { name: account.name, domain: account.domain, score, tier: ruledOutBy.length ? "Out" : tierFor(score), matched, lowered, ruledOutBy };
}

// Input without "accounts" used to score the demo accounts under your file's name, and a
// misspelled signal was ignored. Both now stop the run and say which field is wrong.
function validate(data, weights) {
  const errs = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["The input must be a JSON object."];
  const extra = Object.keys(data).filter((k) => k !== "accounts" && k !== "weights" && k !== "disqualifiers");
  if (extra.length) errs.push("Unrecognised field" + (extra.length > 1 ? "s" : "") + ": " + extra.map((k) => '"' + k + '"').join(", ") + '. Expected: "accounts" and, optionally, "weights" and "disqualifiers".');
  if (!Array.isArray(data.accounts) || !data.accounts.length) errs.push('"accounts" is required: a list of {"name", "signals": {signal: true/false}}.');
  if (data.weights !== undefined) {
    const w = data.weights;
    if (!w || typeof w !== "object" || Array.isArray(w) || !Object.keys(w).length) errs.push('"weights" is an object of signal name to a number (negative to lower the score).');
    else {
      for (const [k, v] of Object.entries(w)) if (typeof v !== "number" || !Number.isFinite(v) || v === 0) errs.push('weights.' + k + " must be a number other than 0 (negative lowers the score).");
      if (!Object.values(w).some((v) => typeof v === "number" && v > 0)) errs.push('"weights" needs at least one positive weight: the score is out of the positive weights.');
    }
  }
  const dq = data.disqualifiers;
  if (dq !== undefined) {
    if (!Array.isArray(dq) || dq.some((d) => typeof d !== "string" || !d)) errs.push('"disqualifiers" is a list of signal names that rule an account out.');
    else {
      const both = dq.filter((d) => Object.prototype.hasOwnProperty.call(weights, d));
      if (both.length) errs.push("Signal " + both.map((d) => '"' + d + '"').join(", ") + " is both weighted and a disqualifier; pick one.");
      if (new Set(dq).size !== dq.length) errs.push('"disqualifiers" lists a signal twice.');
    }
  }
  if (Array.isArray(data.accounts)) {
    const known = Object.keys(weights);
    data.accounts.forEach((a, i) => {
      const label = a && typeof a.name === "string" && a.name ? '"' + a.name + '"' : "account " + (i + 1);
      if (!a || typeof a !== "object" || Array.isArray(a)) { errs.push(label + ' must be {"name", "signals"}.'); return; }
      const bad = Object.keys(a).filter((k) => k !== "name" && k !== "signals" && k !== "domain");
      if (bad.length) errs.push(label + ": unrecognised field " + bad.map((k) => '"' + k + '"').join(", ") + '. Put signals inside "signals": {...}.');
      if (typeof a.name !== "string" || !a.name) errs.push(label + ': "name" is required.');
      if (a.domain !== undefined && (typeof a.domain !== "string" || !a.domain.trim())) errs.push(label + ': "domain" is text such as example.com.');
      if (!a.signals || typeof a.signals !== "object" || Array.isArray(a.signals)) { errs.push(label + ': "signals" is required: {signal: true/false}.'); return; }
      const dqs = Array.isArray(dq) ? dq : [];
      const unknownSig = Object.keys(a.signals).filter((k) => !known.includes(k) && !dqs.includes(k));
      if (unknownSig.length) errs.push(label + ": signal " + unknownSig.map((k) => '"' + k + '"').join(", ") + " has no weight. Known signals: " + known.concat(dqs).join(", ") + ".");
      const badVal = Object.entries(a.signals).filter(([k, v]) => dqs.includes(k)
        ? typeof v !== "boolean"
        : !(typeof v === "boolean" || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10))).map(([k]) => k);
      if (badVal.length) errs.push(label + ": " + badVal.join(", ") + " must be true or false" + (badVal.some((k) => !dqs.includes(k)) ? ", or a whole-number rating from 0 to 10" : "") + ".");
    });
  }
  return errs;
}

function main() {
  const args = parseArgs(process.argv);
  let weights = DEMO_WEIGHTS;
  let accounts = DEMO_ACCOUNTS;
  let disqualifiers = [];
  let source = "built-in demo data";

  if (args.input) {
    const fs = require("fs");
    let data;
    try { data = JSON.parse(fs.readFileSync(args.input, "utf8")); } catch (e) { console.error("Could not read " + args.input + ": " + e.message); process.exit(1); }
    const problems = validate(data, data && data.weights ? data.weights : weights);
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    if (data.weights) weights = data.weights;
    accounts = data.accounts;
    disqualifiers = data.disqualifiers || [];
    source = args.input;
  }
  // A JSON argument works too (agents and the MCP server pass input this way; Oct 10).
  const inline = process.argv.slice(2).find((a) => a.trim().startsWith("{"));
  if (inline) {
    let data;
    try { data = JSON.parse(inline); } catch (e) { console.error("Invalid JSON: " + e.message); process.exit(1); }
    const problems = validate(data, data && data.weights ? data.weights : weights);
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    if (data.weights) weights = data.weights;
    accounts = data.accounts;
    disqualifiers = data.disqualifiers || [];
    source = "your input";
  }

  const positiveWeight = Object.values(weights).filter((w) => w > 0).reduce((a, b) => a + b, 0);
  // Ruled-out accounts go last; otherwise by score.
  const scored = accounts
    .map((a) => scoreAccount(a, weights, positiveWeight, disqualifiers))
    .sort((a, b) => (a.tier === "Out") - (b.tier === "Out") || b.score - a.score);

  const tally = { A: 0, B: 0, C: 0, Out: 0 };
  scored.forEach((s) => (tally[s.tier] += 1));

  console.log("AAJ — Target Account List (ICP fit scoring)");
  console.log("Source: " + source);
  console.log("Weights: " + Object.entries(weights).map(([k, v]) => `${k}=${v}`).join(", ") + (disqualifiers.length ? "; rules out: " + disqualifiers.join(", ") : ""));
  console.log("");
  console.log("Rank  Tier  Score  Account                 Matched signals");
  console.log("----  ----  -----  ----------------------  ----------------------------------");
  scored.forEach((s, i) => {
    const rank = String(i + 1).padEnd(4);
    const tier = s.tier.padEnd(4);
    const score = String(s.score).padStart(3).padEnd(5);
    const name = s.name.padEnd(22).slice(0, 22);
    const parts = [s.matched.join(", ") || "(none)"];
    if (s.lowered.length) parts.push("lowered by " + s.lowered.join(", "));
    if (s.ruledOutBy.length) parts.push("ruled out by " + s.ruledOutBy.join(", "));
    console.log(`${rank}  ${tier}  ${score}  ${name}  ${parts.join("; ")}`);
  });
  console.log("");
  console.log(`Tiers: A=${tally.A}  B=${tally.B}  C=${tally.C}${tally.Out ? `  Out=${tally.Out}` : ""}  (A>=70, B 40-69, C<40; Out = ruled out)`);
  console.log("Score = max(0, sum of weight x value) / sum of the positive weights x 100; value 1 for yes, rating/10 for a 0-10 rating.");
  console.log("In AAJ's view, work A-tier first, and for B-tier verify the missing signal next.");
  console.log("");
  console.log("--- JSON ---");
  console.log(JSON.stringify({
    weights, disqualifiers, positiveWeight,
    accounts: scored.map((s, i) => Object.assign({ rank: i + 1, name: s.name }, s.domain ? { domain: s.domain } : {},
      { score: s.score, tier: s.tier, matched: s.matched, lowered: s.lowered, ruledOutBy: s.ruledOutBy })),
    tiers: tally,
    method: "score = max(0, sum of weight x value) / sum of positive weights x 100; value 1 for true, rating/10 for a 0-10 rating; a disqualifier sets tier Out. Tier cut-offs A>=70, B 40-69, C<40 are AAJ's."
  }, null, 2));
}

main();
