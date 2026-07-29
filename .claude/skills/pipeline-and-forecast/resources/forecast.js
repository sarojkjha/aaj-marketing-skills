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
 * Deterministic. No external dependencies.
 */

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
  for (const d of deals) {
    const p = stageProbabilities[d.stage];
    if (p === undefined) {
      console.error(`Warning: stage "${d.stage}" has no probability mapping; treating as 0.`);
    }
    const prob = p || 0;
    openPipeline += d.amount;
    weighted += d.amount * prob;
    if (prob >= 0.75) commit += d.amount;
  }

  const bestCase = openPipeline;
  const coverage = target > 0 ? openPipeline / target : 0;
  const requiredCoverage = winRate > 0 ? 1 / winRate : 0;
  const gap = target - weighted;
  const newPipelineNeeded = gap > 0 && winRate > 0 ? gap / winRate : 0;
  const coverageHealthy = coverage >= requiredCoverage;

  let lever;
  if (!coverageHealthy) {
    lever = "BUILD PIPELINE — coverage is below what your win rate requires; add qualified pipeline.";
  } else if (weighted < target) {
    lever = "IMPROVE CONVERSION — coverage is fine but the weighted forecast is short; push late-stage deals and lift win rate.";
  } else {
    lever = "ON TRACK — coverage and weighted forecast both clear the target.";
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
