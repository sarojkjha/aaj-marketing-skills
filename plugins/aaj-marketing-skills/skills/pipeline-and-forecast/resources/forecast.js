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
  // A JSON argument works too (agents and the MCP server pass input this way; Oct 10).
  const inline = process.argv.slice(2).find((a) => a.trim().startsWith("{"));
  if (inline) {
    try { cfg = JSON.parse(inline); } catch (e) { console.error("Invalid JSON: " + e.message); process.exit(1); }
    source = "your input";
  }
  if (!cfg || !Array.isArray(cfg.deals) || !cfg.stageProbabilities || typeof cfg.target !== "number" || typeof cfg.winRate !== "number") {
    console.error('Give "target" (number), "winRate" (0-1), "stageProbabilities" ({stage: 0-1}) and "deals" ([{name, amount, stage}]).');
    process.exit(1);
  }

  const known = ["target", "winRate", "stageProbabilities", "deals"];
  const unknownKeys = Object.keys(cfg).filter((k) => !known.includes(k));
  if (unknownKeys.length) {
    console.error("Unrecognised field" + (unknownKeys.length > 1 ? "s" : "") + ": " + unknownKeys.map((k) => '"' + k + '"').join(", ") + ". Expected: " + known.join(", ") + ".");
    process.exit(1);
  }
  const { target, winRate, stageProbabilities, deals } = cfg;
  // Match stage names ignoring case and surrounding spaces; stop on any that still
  // don't match rather than counting those deals at 0%.
  const stageKey = {};
  for (const k of Object.keys(stageProbabilities)) stageKey[String(k).trim().toLowerCase()] = k;
  const unmatched = new Set();
  for (const d of deals) {
    const k = stageKey[String(d.stage).trim().toLowerCase()];
    if (k === undefined) unmatched.add(String(d.stage)); else d.stage = k;
  }
  if (unmatched.size) {
    console.error("These deal stages are not in stageProbabilities: " + [...unmatched].map((s) => JSON.stringify(s)).join(", ") + ".");
    console.error("Known stages: " + Object.keys(stageProbabilities).map((s) => JSON.stringify(s)).join(", ") + ". Add a probability for each stage, or fix the spelling.");
    process.exit(1);
  }

  // CRM APIs (HubSpot among them) return amounts as text: "60000" is accepted.
  // A deal without a numeric amount would turn every total into NaN (CRM
  // exports often have them). Stop and name them rather than print $NaN.
  for (const d of deals) {
    if (typeof d.amount === "string" && d.amount.trim() !== "" && Number.isFinite(Number(d.amount))) d.amount = Number(d.amount);
  }
  const noAmount = deals.filter((d) => typeof d.amount !== "number" || !Number.isFinite(d.amount));
  if (noAmount.length) {
    console.error(`${noAmount.length} deal(s) have no numeric amount: ${noAmount.slice(0, 10).map((d) => JSON.stringify(d.name || "(unnamed)")).join(", ")}${noAmount.length > 10 ? ", …" : ""}.`);
    console.error("Give each one an amount, or leave them out and report them separately.");
    process.exit(1);
  }
  if (!(winRate > 0 && winRate <= 1)) {
    console.error('"winRate" is a fraction between 0 and 1 (for example 0.25, not 25).');
    process.exit(1);
  }

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
