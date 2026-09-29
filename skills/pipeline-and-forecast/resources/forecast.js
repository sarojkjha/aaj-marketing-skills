#!/usr/bin/env node
/**
 * forecast.js — AAJ · pipeline-and-forecast
 *
 * Weighted sales forecast + pipeline health.
 *   weighted forecast = Σ amount × stageProbability
 *   coverage          = open pipeline ÷ target
 *   required coverage ≈ 1 / winRate   (how much pipeline you need given your win rate)
 *   gap               = target − weighted forecast
 *   new pipeline need = gap ÷ winRate  (more pipeline required to close the gap)
 *   commit            = Σ amount for deals at prob ≥ 0.75 (near-certain)
 *   early-stage share = share of open pipeline in stages below 0.25 probability
 *   best case         = Σ amount for all open deals (everything could close)
 *
 * Usage:
 *   node forecast.js                  # built-in demo
 *   node forecast.js --input=pipeline.json
 *
 * Input JSON shape:
 *   {
 *     "target": 500000,
 *     "winRate": 0.25,
 *     "stageProbabilities": { "Discovery": 0.1, "Qualified": 0.25, "Proposal": 0.5, "Negotiation": 0.75, "Verbal": 0.9 },
 *     "deals": [ { "name": "Acme", "amount": 60000, "stage": "Proposal" }, ... ]
 *   }
 *
 * Recommended lever (first match wins):
 *   weighted ≥ target, commit ≥ target  -> ON TRACK
 *   weighted ≥ target, commit < target  -> ON TRACK ON AVERAGE, NOT COMMITTED
 *   gap, early-stage share ≥ 50%        -> ADVANCE DEALS (new pipeline enters at
 *                                          the first stage, so it mostly lands
 *                                          next quarter; moving existing deals
 *                                          raises this quarter's forecast faster)
 *   gap, coverage below 1 / winRate     -> BUILD PIPELINE
 *   gap, coverage healthy               -> IMPROVE CONVERSION
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

const DEMO = {
  target: 500000,
  winRate: 0.25,
  stageProbabilities: { Discovery: 0.1, Qualified: 0.25, Proposal: 0.5, Negotiation: 0.75, Verbal: 0.9 },
  deals: [
    { name: "Acme",        amount: 80000, stage: "Negotiation" },
    { name: "Globex",      amount: 60000, stage: "Proposal" },
    { name: "Initech",     amount: 45000, stage: "Proposal" },
    { name: "Umbrella",    amount: 90000, stage: "Qualified" },
    { name: "Hooli",       amount: 120000, stage: "Discovery" },
    { name: "Stark",       amount: 70000, stage: "Verbal" },
    { name: "Wayne",       amount: 55000, stage: "Qualified" },
  ],
};

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function money(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function main() {
  const args = parseArgs(process.argv);
  let cfg = DEMO;
  let source = "built-in demo data";
  if (args.input) {
    const fs = require("fs");
    cfg = JSON.parse(fs.readFileSync(args.input, "utf8"));
    source = args.input;
  }

  const { target, winRate, stageProbabilities, deals } = cfg;

  let openPipeline = 0;
  let weighted = 0;
  let commit = 0;
  let early = 0;
  for (const d of deals) {
    const p = stageProbabilities[d.stage];
    if (p === undefined) {
      console.error(`Warning: stage "${d.stage}" has no probability mapping; treating as 0.`);
    }
    const prob = p || 0;
    openPipeline += d.amount;
    weighted += d.amount * prob;
    if (prob >= 0.75) commit += d.amount;
    if (prob < 0.25) early += d.amount;
  }
  const earlyShare = openPipeline > 0 ? early / openPipeline : 0;

  const bestCase = openPipeline;
  const coverage = target > 0 ? openPipeline / target : 0;
  const requiredCoverage = winRate > 0 ? 1 / winRate : 0;
  const gap = target - weighted;
  const newPipelineNeeded = gap > 0 && winRate > 0 ? gap / winRate : 0;
  const coverageHealthy = coverage >= requiredCoverage;

  const pct = (x) => Math.round(x * 100) + "%";
  let lever;
  if (weighted >= target && commit >= target) {
    lever = "ON TRACK — commit and the weighted forecast both clear the target.";
  } else if (weighted >= target) {
    lever = "ON TRACK ON AVERAGE, NOT COMMITTED — the weighted forecast clears the target, but commit is " + money(commit) +
      " (" + pct(target > 0 ? commit / target : 0) + " of target). Move late-stage deals to near-certain stages before relying on this quarter.";
  } else if (earlyShare >= 0.5) {
    lever = "ADVANCE DEALS — " + pct(earlyShare) + " of open pipeline sits in early stages (below 25% probability). " +
      "Moving existing deals forward raises this quarter's forecast faster than new pipeline, which enters at the first stage." +
      (coverageHealthy ? "" : " Coverage is also thin, so build pipeline in parallel; most of it will close next quarter.");
  } else if (!coverageHealthy) {
    lever = "BUILD PIPELINE — coverage is below what your win rate requires; add qualified pipeline. New pipeline closes on your full sales cycle, so most of it lands after this quarter.";
  } else {
    lever = "IMPROVE CONVERSION — coverage is fine but the weighted forecast is short; push late-stage deals and lift win rate.";
  }

  console.log("AAJ — Pipeline & Forecast");
  console.log("Source: " + source);
  console.log("");
  console.log("Target (quota):        " + money(target));
  console.log("Win rate:              " + (winRate * 100).toFixed(0) + "%");
  console.log("Open pipeline:         " + money(openPipeline) + `  (${deals.length} deals)`);
  console.log("");
  console.log("Weighted forecast:     " + money(weighted) + "   <- expected (Σ amount × stage probability)");
  console.log("  Commit (>=75%):      " + money(commit));
  console.log("  Best case (all open):" + money(bestCase));
  console.log("Early-stage share:     " + pct(earlyShare) + " of open pipeline below 25% probability");
  console.log("");
  console.log("Coverage:              " + coverage.toFixed(1) + "x   (need ~" + requiredCoverage.toFixed(1) + "x at a " + (winRate * 100).toFixed(0) + "% win rate)  ->  " + (coverageHealthy ? "HEALTHY" : "THIN"));
  if (gap > 0) {
    console.log("Gap to target:         " + money(gap));
    console.log("New pipeline needed:   " + money(newPipelineNeeded) + "   (gap ÷ win rate)");
  } else {
    console.log("Gap to target:         none — weighted forecast covers the target");
  }
  console.log("");
  console.log("Recommended lever: " + lever);
}

main();
