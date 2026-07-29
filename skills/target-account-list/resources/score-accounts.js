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

function main() {
  const args = parseArgs(process.argv);
  let weights = DEMO_WEIGHTS;
  let accounts = DEMO_ACCOUNTS;
  let source = "built-in demo data";

  if (args.input) {
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(args.input, "utf8"));
    if (data.weights) weights = data.weights;
    if (Array.isArray(data.accounts)) accounts = data.accounts;
    source = args.input;
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
