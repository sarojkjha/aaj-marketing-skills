#!/usr/bin/env node
/**
 * score-accounts.js — AAJ · target-account-list
 *
 * Scores accounts by ICP fit. Each account carries a set of boolean `signals`;
 * each signal has a weight (how predictive it is of a good deal). Fit score =
 * matched weight / total weight * 100. Tiers: A >= 70, B 40-69, C < 40.
 *
 * Usage:
 *   node score-accounts.js                 # runs the built-in demo
 *   node score-accounts.js --input=accounts.json
 *
 * Input JSON shape:
 *   {
 *     "weights": { "industryMatch": 30, "sizeBand": 25, ... },   // optional; demo weights used if omitted
 *     "accounts": [ { "name": "Acme", "signals": { "industryMatch": true, ... } }, ... ]
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
  { name: "Northwind SaaS",   signals: { industryMatch: true,  sizeBand: true,  usesComplementaryTool: true,  recentFunding: true,  hiringSignal: true } },
  { name: "Globex Software",  signals: { industryMatch: true,  sizeBand: true,  usesComplementaryTool: true,  recentFunding: false, hiringSignal: true } },
  { name: "Initech",          signals: { industryMatch: true,  sizeBand: true,  usesComplementaryTool: false, recentFunding: false, hiringSignal: false } },
  { name: "Umbrella Retail",  signals: { industryMatch: false, sizeBand: true,  usesComplementaryTool: false, recentFunding: true,  hiringSignal: false } },
  { name: "Hooli Enterprise", signals: { industryMatch: true,  sizeBand: false, usesComplementaryTool: true,  recentFunding: false, hiringSignal: false } },
  { name: "Stark SMB",        signals: { industryMatch: false, sizeBand: false, usesComplementaryTool: false, recentFunding: false, hiringSignal: true } },
];

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function tierFor(score) {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

function scoreAccount(account, weights, totalWeight) {
  const matched = [];
  let earned = 0;
  for (const [signal, weight] of Object.entries(weights)) {
    if (account.signals && account.signals[signal]) {
      earned += weight;
      matched.push(signal);
    }
  }
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;
  return { name: account.name, score, tier: tierFor(score), matched };
}

// Input without "accounts" used to score the demo accounts under your file's name, and a
// misspelled signal was ignored. Both now stop the run and say which field is wrong.
function validate(data, weights) {
  const errs = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["The input must be a JSON object."];
  const extra = Object.keys(data).filter((k) => k !== "accounts" && k !== "weights");
  if (extra.length) errs.push("Unrecognised field" + (extra.length > 1 ? "s" : "") + ": " + extra.map((k) => '"' + k + '"').join(", ") + '. Expected: "accounts" and, optionally, "weights".');
  if (!Array.isArray(data.accounts) || !data.accounts.length) errs.push('"accounts" is required: a list of {"name", "signals": {signal: true/false}}.');
  if (data.weights !== undefined) {
    const w = data.weights;
    if (!w || typeof w !== "object" || Array.isArray(w) || !Object.keys(w).length) errs.push('"weights" is an object of signal name to a number above 0.');
    else {
      for (const [k, v] of Object.entries(w)) if (typeof v !== "number" || !(v > 0)) errs.push('weights.' + k + " must be a number above 0.");
    }
  }
  if (Array.isArray(data.accounts)) {
    const known = Object.keys(weights);
    data.accounts.forEach((a, i) => {
      const label = a && typeof a.name === "string" && a.name ? '"' + a.name + '"' : "account " + (i + 1);
      if (!a || typeof a !== "object" || Array.isArray(a)) { errs.push(label + ' must be {"name", "signals"}.'); return; }
      const bad = Object.keys(a).filter((k) => k !== "name" && k !== "signals");
      if (bad.length) errs.push(label + ": unrecognised field " + bad.map((k) => '"' + k + '"').join(", ") + '. Put signals inside "signals": {...}.');
      if (typeof a.name !== "string" || !a.name) errs.push(label + ': "name" is required.');
      if (!a.signals || typeof a.signals !== "object" || Array.isArray(a.signals)) { errs.push(label + ': "signals" is required: {signal: true/false}.'); return; }
      const unknownSig = Object.keys(a.signals).filter((k) => !known.includes(k));
      if (unknownSig.length) errs.push(label + ": signal " + unknownSig.map((k) => '"' + k + '"').join(", ") + " has no weight. Known signals: " + known.join(", ") + ".");
      const nonBool = Object.entries(a.signals).filter(([, v]) => typeof v !== "boolean").map(([k]) => k);
      if (nonBool.length) errs.push(label + ": " + nonBool.join(", ") + " must be true or false.");
    });
  }
  return errs;
}

function main() {
  const args = parseArgs(process.argv);
  let weights = DEMO_WEIGHTS;
  let accounts = DEMO_ACCOUNTS;
  let source = "built-in demo data";

  if (args.input) {
    const fs = require("fs");
    let data;
    try { data = JSON.parse(fs.readFileSync(args.input, "utf8")); } catch (e) { console.error("Could not read " + args.input + ": " + e.message); process.exit(1); }
    const problems = validate(data, data && data.weights ? data.weights : weights);
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    if (data.weights) weights = data.weights;
    accounts = data.accounts;
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
    source = "your input";
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const scored = accounts
    .map((a) => scoreAccount(a, weights, totalWeight))
    .sort((a, b) => b.score - a.score);

  const tally = { A: 0, B: 0, C: 0 };
  scored.forEach((s) => (tally[s.tier] += 1));

  console.log("AAJ — Target Account List (ICP fit scoring)");
  console.log("Source: " + source);
  console.log("Weights: " + Object.entries(weights).map(([k, v]) => `${k}=${v}`).join(", "));
  console.log("");
  console.log("Rank  Tier  Score  Account                 Matched signals");
  console.log("----  ----  -----  ----------------------  ----------------------------------");
  scored.forEach((s, i) => {
    const rank = String(i + 1).padEnd(4);
    const tier = s.tier.padEnd(4);
    const score = String(s.score).padStart(3).padEnd(5);
    const name = s.name.padEnd(22).slice(0, 22);
    console.log(`${rank}  ${tier}  ${score}  ${name}  ${s.matched.join(", ") || "(none)"}`);
  });
  console.log("");
  console.log(`Tiers: A=${tally.A}  B=${tally.B}  C=${tally.C}  (A>=70, B 40-69, C<40)`);
  console.log("Work A-tier first. For B-tier, the missing signal is usually the one to verify next.");
}

main();
