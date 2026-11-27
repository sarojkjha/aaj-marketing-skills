#!/usr/bin/env node
/**
 * forecast.js — AAJ · pipeline-and-forecast
 *
 * Weighted sales forecast + pipeline health.
 *   weighted forecast = closed won + Σ amount × stageProbability
 *   coverage          = open pipeline ÷ what is left to close (target − closed won)
 *   required coverage ≈ 1 / winRate   (how much pipeline you need given your win rate)
 *   gap               = target − weighted forecast
 *   new pipeline need = gap ÷ winRate  (more pipeline required to close the gap)
 *   commit            = closed won + Σ amount for deals at prob ≥ 0.75 (near-certain)
 *   early-stage share = share of open pipeline in stages below 0.25 probability
 *   best case         = closed won + Σ amount for all open deals (everything could close)
 *   wins needed       = gap ÷ average deal size, rounded up
 *   chance of target  = P(closed won + Σ amount × [deal closes] ≥ target), each deal
 *                       closing on its own at its stage probability. Worked out
 *                       exactly, not simulated, so it is the same on every run.
 *
 * Usage:
 *   node forecast.js                  # built-in demo
 *   node forecast.js --input=pipeline.json
 *   node forecast.js '<json>'
 *
 * Input JSON shape:
 *   {
 *     "target": 500000,
 *     "winRate": 0.25,
 *     "stageProbabilities": { "Discovery": 0.1, "Qualified": 0.25, "Proposal": 0.5, "Negotiation": 0.75, "Verbal": 0.9 },
 *     "deals": [ { "name": "Prospect A", "amount": 60000, "stage": "Proposal", "closeDate": "2026-12-18" }, ... ]
 *   }
 *   A deal can carry its own "probability" (0-1), as CRMs store one per deal. It takes the
 *   place of its stage's, and "stageProbabilities" can be left out when every deal has one.
 *
 *   In place of "winRate", give the counts it comes from: "wonDeals" and "lostDeals",
 *   the deals closed won and closed lost over the same past period. The engine
 *   works out winRate = wonDeals / (wonDeals + lostDeals), so an agent reading a
 *   CRM passes the CRM's counts and never divides them itself.
 *
 *   Optional (added in 1.1.0):
 *     "stageTotals": { "Discovery": 120000, ... }   in place of "deals", when you have a
 *                    total per stage and not one row per deal. The outputs that need
 *                    deals (close dates, the chance, the largest deals) are left out.
 *     "closedWon": 95000          revenue already closed won this period, or
 *     "closedWonDeals": [ { "name": "Example Co.", "amount": 40000 }, ... ]
 *                    the deals themselves; the engine adds them up.
 *     "periodEnd": "2026-12-31"   deals with a "closeDate" after this are left out and
 *                    reported on their own line. Deals with no close date are counted.
 *     "asOf": "2026-11-25"        today's date. Deals whose close date has passed are
 *                    still counted, and flagged. The engine never reads the clock.
 *     "slipRate": 0.2             your own estimate of the share of the open forecast
 *                    that slips past the period. Printed as a what-if; nothing else moves.
 *     "averageDealSize": 55000    for wins and deals needed. With deals and no value
 *                    here, the engine uses the average of the open deals and says so.
 *   Dates are YYYY-MM-DD. A longer ISO timestamp is read by its first ten characters.
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
// Windows shells (PowerShell, cmd) can pass a JSON payload with its quotes
// backslash-escaped, i.e. {\"a\":1}. Undo that only when the payload opens that
// way, so JSON with legitimately escaped quotes inside strings is left alone.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^\s*[\[{]\s*\\"/.test(a) ? a.replace(/\\"/g, '"') : a
);
// -----------------------------------------------------------------------------


"use strict";

const DEMO = {
  target: 500000,
  winRate: 0.25,
  stageProbabilities: { Discovery: 0.1, Qualified: 0.25, Proposal: 0.5, Negotiation: 0.75, Verbal: 0.9 },
  deals: [
    { name: "Prospect A",  amount: 80000, stage: "Negotiation" },
    { name: "Prospect B",  amount: 60000, stage: "Proposal" },
    { name: "Prospect C",  amount: 45000, stage: "Proposal" },
    { name: "Prospect D",  amount: 90000, stage: "Qualified" },
    { name: "Prospect E",  amount: 120000, stage: "Discovery" },
    { name: "Prospect F",  amount: 70000, stage: "Verbal" },
    { name: "Prospect G",  amount: 55000, stage: "Qualified" },
  ],
};

/** Deals at or above this probability are commit; below EARLY_PROB they are early stage. */
const COMMIT_PROB = 0.75;
const EARLY_PROB = 0.25;
/** At this share of early-stage pipeline, advancing deals comes before building pipeline. */
const EARLY_SHARE_ADVANCE = 0.5;
/** How many of the largest deals are listed. */
const TOP_DEALS = 3;
/** How many deals are named under each flag (after the period, no close date, close date passed). */
const FLAG_DEALS = 10;
/** Up to this many uncertain deals, the chance walks every combination. */
const CHANCE_EXACT_DEALS = 20;
/** Past that, the chance is a table of at most this many steps: exact when the amounts fit, a range when they do not. */
const CHANCE_STEPS = 100000;

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
const pct = (x) => Math.round(x * 100) + "%";
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
/**
 * a ≥ b, within one part in a trillion. Sums of amounts with cents pick up noise in the last
 * digit, and without this a figure that equals its threshold on paper could be marked short of
 * it. The allowance is far below a cent on any pipeline, so it never hides a real shortfall.
 */
const atLeast = (a, b) => a >= b - 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

/** "2026-12-18" or a longer ISO timestamp -> "2026-12-18"; anything else, or a date that does not exist, -> null. */
function dateOf(v) {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(v.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return m[1] + "-" + m[2] + "-" + m[3];
}
const dayNumber = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

function gcd(a, b) {
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

/**
 * The chance that deals worth `needed` or more close, each deal closing on its own with
 * probability p. Amounts are counted in whole cents, so sums are exact.
 *  - Up to CHANCE_EXACT_DEALS uncertain deals: every combination is walked, so the answer
 *    is exact whatever the amounts.
 *  - More deals: a table over the amounts divided by their common factor. It is exact
 *    while the table fits in CHANCE_STEPS steps (low = high). With too many distinct
 *    amounts for that, amounts are rounded down for `low` and up for `high` on a coarser
 *    grid, so the true chance lies between the two.
 */
function chanceOfReaching(items, needed) {
  if (!(needed > 0)) return { low: 1, high: 1, exact: true };
  let sure = 0;
  const open = [];
  for (const it of items) {
    const cents = Math.round(it.amount * 100);
    if (!(cents > 0) || !(it.p > 0)) continue;
    if (it.p >= 1) sure += cents; else open.push({ cents, p: it.p });
  }
  const need = Math.ceil(needed * 100 - 1e-6) - sure;
  if (need <= 0) return { low: 1, high: 1, exact: true };
  const total = open.reduce((a, d) => a + d.cents, 0);
  if (total < need) return { low: 0, high: 0, exact: true };

  if (open.length <= CHANCE_EXACT_DEALS) {
    // Largest first, so a branch is settled early: once the sum is there every later outcome
    // counts, and once the rest cannot get there none does.
    const d = open.slice().sort((a, b) => b.cents - a.cents);
    const rest = new Array(d.length + 1).fill(0);
    for (let i = d.length - 1; i >= 0; i--) rest[i] = rest[i + 1] + d[i].cents;
    const walk = (i, sum, prob) => {
      if (sum >= need) return prob;
      if (sum + rest[i] < need) return 0;
      return walk(i + 1, sum + d[i].cents, prob * d[i].p) + walk(i + 1, sum, prob * (1 - d[i].p));
    };
    const p = walk(0, 0, 1);
    return { low: p, high: p, exact: true };
  }

  // States at or past the threshold are pooled, so the table is never longer than the threshold.
  const tail = (units, threshold) => {
    const dp = new Float64Array(threshold + 1);
    dp[0] = 1;
    let top = 0;
    for (let i = 0; i < open.length; i++) {
      const u = units[i], p = open[i].p;
      if (u === 0) continue; // on the coarse grid a small deal can round down to nothing
      for (let s = top; s >= 0; s--) {
        const v = dp[s];
        if (v === 0) continue;
        dp[s] = v * (1 - p);
        dp[Math.min(threshold, s + u)] += v * p;
      }
      top = Math.min(threshold, top + u);
    }
    return dp[threshold];
  };
  const g = open.reduce((a, d) => gcd(a, d.cents), 0);
  if (Math.ceil(need / g) <= CHANCE_STEPS) {
    const p = tail(open.map((d) => d.cents / g), Math.ceil(need / g));
    return { low: p, high: p, exact: true };
  }
  const step = Math.ceil(need / CHANCE_STEPS);
  const low = tail(open.map((d) => Math.floor(d.cents / step)), Math.ceil(need / step));
  const high = tail(open.map((d) => Math.ceil(d.cents / step)), Math.max(1, Math.floor(need / step)));
  return { low: Math.min(low, high), high: Math.max(low, high), exact: false };
}

const KNOWN = ["target", "winRate", "wonDeals", "lostDeals", "stageProbabilities", "deals", "stageTotals",
  "closedWon", "closedWonDeals", "periodEnd", "asOf", "slipRate", "averageDealSize"];

/**
 * Checks the input in a fixed order and returns { error: [lines] } on the first problem, or
 * { input } with the win rate worked out, stage names matched and amounts as numbers.
 */
function prepare(cfg) {
  const fail = (...lines) => ({ error: lines });
  const blank = (v) => v === undefined || v === null || v === "";
  // CRM APIs (HubSpot among them) return amounts as text: "60000" is accepted.
  const asNumber = (v) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v);
  const hasCounts = cfg && (cfg.wonDeals !== undefined || cfg.lostDeals !== undefined);
  const hasDeals = cfg && Array.isArray(cfg.deals);
  const hasTotals = cfg && cfg.stageTotals && typeof cfg.stageTotals === "object" && !Array.isArray(cfg.stageTotals);
  // Stage probabilities can be left out only when every deal carries its own.
  const allOwn = hasDeals && cfg.deals.length > 0 && cfg.deals.every((d) => d && typeof d === "object" && !blank(d.probability));
  if (hasDeals && !cfg.stageProbabilities && !allOwn && cfg.deals.some((d) => d && typeof d === "object" && !blank(d.probability))) {
    const without = cfg.deals.filter((d) => !(d && typeof d === "object" && !blank(d.probability)));
    return fail(
      `${without.length} deal(s) have no "probability" of their own: ${without.slice(0, 10).map((d) => JSON.stringify((d && d.name) || "(unnamed)")).join(", ")}${without.length > 10 ? ", …" : ""}.`,
      'Give each one a "probability" (0-1), or give "stageProbabilities" for their stages.');
  }
  if (!cfg || (!hasDeals && !hasTotals) || (!cfg.stageProbabilities && !allOwn) || typeof cfg.target !== "number" || (typeof cfg.winRate !== "number" && !hasCounts)) {
    return fail('Give "target" (number), "winRate" (0-1) or "wonDeals" and "lostDeals" (counts), "stageProbabilities" ({stage: 0-1}) and "deals" ([{name, amount, stage}]) or "stageTotals" ({stage: amount}).');
  }
  const unknownKeys = Object.keys(cfg).filter((k) => !KNOWN.includes(k));
  if (unknownKeys.length) {
    return fail("Unrecognised field" + (unknownKeys.length > 1 ? "s" : "") + ": " + unknownKeys.map((k) => '"' + k + '"').join(", ") + ". Expected: " + KNOWN.join(", ") + ".");
  }
  if (cfg.deals !== undefined && cfg.stageTotals !== undefined) {
    return fail('Give "deals" (one row per deal) or "stageTotals" (one total per stage), not both.');
  }
  // Win rate from closed-deal counts: the engine divides, so the caller never has to.
  let winRate = cfg.winRate, winFrom = null;
  if (hasCounts) {
    if (cfg.winRate !== undefined) return fail('Give "winRate" or "wonDeals" and "lostDeals", not both.');
    const isCount = (n) => Number.isInteger(n) && n >= 0;
    if (!isCount(cfg.wonDeals) || !isCount(cfg.lostDeals)) {
      return fail('"wonDeals" and "lostDeals" are whole numbers, 0 or more: the deals closed won and closed lost over the same past period.');
    }
    if (cfg.wonDeals === 0) return fail("No deals were won in that period, so there is no win rate to plan with. Use a longer period.");
    winRate = cfg.wonDeals / (cfg.wonDeals + cfg.lostDeals);
    winFrom = { won: cfg.wonDeals, closed: cfg.wonDeals + cfg.lostDeals };
  }
  const target = cfg.target;
  const stageProbabilities = cfg.stageProbabilities || {};
  // Match stage names ignoring case and surrounding spaces; stop on any that still
  // don't match rather than counting those deals at 0%.
  const stageKey = {};
  for (const k of Object.keys(stageProbabilities)) stageKey[String(k).trim().toLowerCase()] = k;
  // One row per deal, or one row per stage total: the arithmetic below is the same.
  const deals = hasDeals
    ? cfg.deals.map((d) => Object.assign({}, d))
    : Object.keys(cfg.stageTotals).map((k) => ({ name: k, amount: cfg.stageTotals[k], stage: k }));
  const rows = hasDeals ? "deal(s)" : "stage total(s)";
  // A deal's own probability takes the place of its stage's, so its stage need not be a known one.
  for (const d of deals) d.probability = hasDeals && !blank(d.probability) ? asNumber(d.probability) : null;
  const unmatched = new Set();
  for (const d of deals) {
    const k = stageKey[String(d.stage).trim().toLowerCase()];
    if (k !== undefined) d.stage = k; else if (d.probability === null) unmatched.add(String(d.stage));
  }
  if (unmatched.size) {
    return fail(
      (hasDeals ? "These deal stages are not in stageProbabilities: " : "These stages in stageTotals are not in stageProbabilities: ") + [...unmatched].map((s) => JSON.stringify(s)).join(", ") + ".",
      "Known stages: " + Object.keys(stageProbabilities).map((s) => JSON.stringify(s)).join(", ") + ". Add a probability for each stage, or fix the spelling.");
  }
  // A deal without a numeric amount would turn every total into NaN (CRM
  // exports often have them). Stop and name them rather than print $NaN.
  for (const d of deals) d.amount = asNumber(d.amount);
  const noAmount = deals.filter((d) => typeof d.amount !== "number" || !Number.isFinite(d.amount));
  if (noAmount.length) {
    return fail(
      `${noAmount.length} ${rows} have no numeric amount: ${noAmount.slice(0, 10).map((d) => JSON.stringify(d.name || "(unnamed)")).join(", ")}${noAmount.length > 10 ? ", …" : ""}.`,
      hasDeals ? "Give each one an amount, or leave them out and report them separately." : "Give each stage a total, or leave the stage out.");
  }
  // A negative amount would shrink the pipeline instead of being a typo to fix.
  const negative = deals.filter((d) => d.amount < 0);
  if (negative.length) {
    return fail(`${negative.length} ${rows} have a negative amount: ${negative.slice(0, 10).map((d) => JSON.stringify(d.name || "(unnamed)")).join(", ")}${negative.length > 10 ? ", …" : ""}. Amounts are 0 or more.`);
  }
  if (!(winRate > 0 && winRate <= 1)) return fail('"winRate" is a fraction between 0 and 1 (for example 0.25, not 25).');
  if (!(Number.isFinite(target) && target > 0)) return fail('"target" is the revenue to close this period, a number above 0.');
  // Each stage's probability multiplies amounts, so a word or a value outside 0 to 1 would print $NaN
  // or a forecast larger than the pipeline.
  const badStages = Object.keys(stageProbabilities).filter((k) => {
    const v = stageProbabilities[k];
    return typeof v !== "number" || !(v >= 0 && v <= 1);
  });
  if (badStages.length) {
    return fail("Each stage probability is a fraction from 0 to 1 (for example 0.25, not 25). Check: " + badStages.map((k) => JSON.stringify(k) + " = " + JSON.stringify(stageProbabilities[k])).join(", ") + ".");
  }

  // ---- added in 1.1.0 ----
  const badProb = deals.filter((d) => d.probability !== null && (typeof d.probability !== "number" || !(d.probability >= 0 && d.probability <= 1)));
  if (badProb.length) {
    return fail(`${badProb.length} deal(s) have a probability that is not a fraction from 0 to 1 (for example 0.25, not 25): ${badProb.slice(0, 10).map((d) => JSON.stringify(d.name || "(unnamed)") + " = " + JSON.stringify(d.probability)).join(", ")}${badProb.length > 10 ? ", …" : ""}.`);
  }
  // Closed won so far: a figure, or the deals themselves (the engine adds, the caller never has to).
  let closedWon = 0, closedWonCount = null;
  const closedGiven = cfg.closedWon !== undefined || cfg.closedWonDeals !== undefined;
  if (cfg.closedWon !== undefined && cfg.closedWonDeals !== undefined) return fail('Give "closedWon" (a figure) or "closedWonDeals" (the deals), not both.');
  if (cfg.closedWon !== undefined) {
    if (typeof cfg.closedWon !== "number" || !Number.isFinite(cfg.closedWon) || cfg.closedWon < 0) return fail('"closedWon" is the revenue already closed won this period, a number 0 or more.');
    closedWon = cfg.closedWon;
  }
  if (cfg.closedWonDeals !== undefined) {
    if (!Array.isArray(cfg.closedWonDeals)) return fail('"closedWonDeals" is a list of the deals closed won this period: [{name, amount}].');
    const amounts = cfg.closedWonDeals.map((d) => asNumber(d && typeof d === "object" ? d.amount : d));
    const bad = cfg.closedWonDeals.filter((d, i) => typeof amounts[i] !== "number" || !Number.isFinite(amounts[i]) || amounts[i] < 0);
    if (bad.length) {
      return fail(`${bad.length} closed-won deal(s) have no amount of 0 or more: ${bad.slice(0, 10).map((d) => JSON.stringify((d && d.name) || "(unnamed)")).join(", ")}${bad.length > 10 ? ", …" : ""}.`);
    }
    closedWon = amounts.reduce((a, b) => a + b, 0);
    closedWonCount = amounts.length;
  }
  // Dates. The engine is given today's date; it never reads the clock.
  let periodEnd = null, asOf = null;
  if (cfg.periodEnd !== undefined) {
    periodEnd = dateOf(cfg.periodEnd);
    if (!periodEnd) return fail('"periodEnd" is the last day of the period as YYYY-MM-DD, for example "2026-12-31".');
  }
  if (cfg.asOf !== undefined) {
    asOf = dateOf(cfg.asOf);
    if (!asOf) return fail('"asOf" is today\'s date as YYYY-MM-DD, for example "2026-11-25".');
  }
  if (periodEnd && asOf && asOf > periodEnd) return fail(`The period ended on ${periodEnd}, before the as-of date ${asOf}. Give the period you are forecasting.`);
  if (!hasDeals && (periodEnd || asOf)) return fail('"periodEnd" and "asOf" work on close dates, and stage totals have none. Give "deals" with a "closeDate" each.');
  if (hasDeals) {
    const badDates = [];
    for (const d of deals) {
      if (d.closeDate === undefined || d.closeDate === null || d.closeDate === "") { d.closeDate = null; continue; }
      const iso = dateOf(d.closeDate);
      if (!iso) badDates.push(d); else d.closeDate = iso;
    }
    if (badDates.length) {
      return fail(`${badDates.length} deal(s) have a close date that is not YYYY-MM-DD: ${badDates.slice(0, 10).map((d) => JSON.stringify(d.name || "(unnamed)") + " = " + JSON.stringify(d.closeDate)).join(", ")}${badDates.length > 10 ? ", …" : ""}.`);
    }
  }
  if (cfg.slipRate !== undefined && (typeof cfg.slipRate !== "number" || !(cfg.slipRate >= 0 && cfg.slipRate <= 1))) {
    return fail('"slipRate" is the share of the open forecast you expect to slip past the period, a fraction from 0 to 1 (for example 0.2, not 20).');
  }
  if (cfg.averageDealSize !== undefined && (typeof cfg.averageDealSize !== "number" || !Number.isFinite(cfg.averageDealSize) || !(cfg.averageDealSize > 0))) {
    return fail('"averageDealSize" is the size of a typical won deal, a number above 0.');
  }
  return {
    input: {
      mode: hasDeals ? "deals" : "stageTotals", target, winRate, winFrom, stageProbabilities, deals,
      closedWon, closedGiven, closedWonCount, periodEnd, asOf,
      slipRate: cfg.slipRate === undefined ? null : cfg.slipRate,
      averageDealSize: cfg.averageDealSize === undefined ? null : cfg.averageDealSize,
    },
  };
}

/** The forecast for a prepared input. Every figure the engine prints comes from here. */
function compute(inp) {
  const { mode, target, winRate, stageProbabilities, deals, closedWon, periodEnd, asOf } = inp;
  const byDeal = mode === "deals";
  const prob = (d) => (d.probability !== null && d.probability !== undefined ? d.probability : stageProbabilities[d.stage] || 0);
  // With a period end, a deal dated after it is not this period's: it is reported and left out.
  const later = byDeal && periodEnd ? deals.filter((d) => d.closeDate && d.closeDate > periodEnd) : [];
  const open = later.length ? deals.filter((d) => !(d.closeDate && d.closeDate > periodEnd)) : deals;
  const sum = (list, f) => list.reduce((a, d) => a + f(d), 0);

  let openPipeline = 0, weightedOpen = 0, commitOpen = 0, early = 0;
  for (const d of open) {
    const p = prob(d);
    openPipeline += d.amount;
    weightedOpen += d.amount * p;
    if (p >= COMMIT_PROB) commitOpen += d.amount;
    if (p < EARLY_PROB) early += d.amount;
  }
  const earlyShare = openPipeline > 0 ? early / openPipeline : 0;
  const forecast = closedWon + weightedOpen;
  const commit = closedWon + commitOpen;
  const bestCase = closedWon + openPipeline;
  const leftToClose = target - closedWon;
  const closedCovers = atLeast(closedWon, target);
  const coverage = closedCovers ? null : openPipeline / leftToClose;
  const requiredCoverage = winRate > 0 ? 1 / winRate : 0;
  const gap = target - forecast;
  const onTarget = atLeast(forecast, target);
  const newPipelineNeeded = !onTarget && winRate > 0 ? gap / winRate : 0;
  const coverageHealthy = coverage === null ? true : atLeast(coverage, requiredCoverage);

  let lever, leverText;
  if (onTarget && atLeast(commit, target)) {
    lever = "on-track";
    leverText = "ON TRACK — commit and the weighted forecast both clear the target.";
  } else if (onTarget) {
    lever = "not-committed";
    leverText = "ON TRACK ON AVERAGE, NOT COMMITTED — the weighted forecast clears the target, but commit is " + money(commit) +
      " (" + pct(target > 0 ? commit / target : 0) + " of target). Move late-stage deals to near-certain stages before relying on this quarter.";
  } else if (atLeast(earlyShare, EARLY_SHARE_ADVANCE)) {
    lever = "advance";
    leverText = "ADVANCE DEALS — " + pct(earlyShare) + " of open pipeline sits in early stages (below 25% probability). " +
      "Moving existing deals forward raises this quarter's forecast faster than new pipeline, which enters at the first stage." +
      (coverageHealthy ? "" : " Coverage is also thin, so build pipeline in parallel; most of it will close next quarter.");
  } else if (!coverageHealthy) {
    lever = "build";
    leverText = "BUILD PIPELINE — coverage is below what your win rate requires; add qualified pipeline. New pipeline closes on your full sales cycle, so most of it lands after this quarter.";
  } else {
    lever = "improve";
    leverText = "IMPROVE CONVERSION — coverage is fine but the weighted forecast is short; push late-stage deals and lift win rate.";
  }

  // A flagged group: its count and totals, and its largest deals by name so nobody has to
  // work out from the dates which deals are meant.
  const group = (list) => {
    if (!list.length) return null;
    const named = list.map((d, i) => ({ d, i })).sort((a, b) => b.d.amount - a.d.amount || a.i - b.i).slice(0, FLAG_DEALS)
      .map((x) => ({ name: x.d.name || "(unnamed)", amount: x.d.amount, closeDate: x.d.closeDate || null }));
    return { deals: list.length, amount: sum(list, (d) => d.amount), weighted: sum(list, (d) => d.amount * prob(d)), list: named, more: list.length - named.length };
  };
  const anyDate = byDeal && deals.some((d) => d.closeDate);
  const undated = byDeal && (periodEnd || anyDate) ? open.filter((d) => !d.closeDate) : [];
  const pastDue = byDeal && asOf ? open.filter((d) => d.closeDate && d.closeDate < asOf) : [];

  // By close month, when any deal carries a date. A month can hold deals on both sides of the period end.
  let byMonth = null;
  if (anyDate) {
    const rows = new Map();
    for (const d of deals) {
      const after = !!(periodEnd && d.closeDate && d.closeDate > periodEnd);
      const month = d.closeDate ? d.closeDate.slice(0, 7) : null;
      const key = (month || "~") + (after ? "+" : "");
      if (!rows.has(key)) rows.set(key, { month, afterPeriod: after, deals: 0, amount: 0, weighted: 0 });
      const r = rows.get(key);
      r.deals++; r.amount += d.amount; r.weighted += d.amount * prob(d);
    }
    byMonth = [...rows.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((e) => e[1]);
  }

  // Wins and deals needed, at a given average deal size or the average of the open deals.
  let needed = null;
  const sized = byDeal ? deals.filter((d) => d.amount > 0) : [];
  const avg = inp.averageDealSize !== null ? inp.averageDealSize : sized.length ? sum(sized, (d) => d.amount) / sized.length : null;
  if (!onTarget && avg) {
    needed = {
      averageDealSize: avg,
      from: inp.averageDealSize !== null ? "given" : "open deals",
      sample: inp.averageDealSize !== null ? null : sized.length,
      sampleOf: deals.length,
      wins: Math.ceil(gap / avg - 1e-9),
      dealsToAdd: Math.ceil(newPipelineNeeded / avg - 1e-9),
    };
  }

  // Deal-level only: the chance, and the deals the forecast leans on.
  let chance = null, topDeals = null;
  if (byDeal && !closedCovers) {
    chance = chanceOfReaching(open.map((d) => ({ amount: d.amount, p: prob(d) })), leftToClose);
  }
  if (byDeal && weightedOpen > 0) {
    topDeals = open
      .map((d, i) => ({ d, i, w: d.amount * prob(d) }))
      .filter((x) => x.w > 0)
      .sort((a, b) => b.w - a.w || a.i - b.i)
      .slice(0, TOP_DEALS)
      .map((x) => ({
        name: x.d.name || "(unnamed)", amount: x.d.amount, probability: prob(x.d), weighted: x.w,
        shareOfOpenForecast: x.w / weightedOpen, forecastWithout: forecast - x.w,
        dropsBelowTarget: onTarget && !atLeast(forecast - x.w, target),
      }));
  }

  const slip = inp.slipRate === null ? null : (() => {
    const f = closedWon + weightedOpen * (1 - inp.slipRate);
    return { rate: inp.slipRate, forecast: f, gap: target - f, short: !atLeast(f, target) };
  })();

  return {
    mode, target, closedWon, closedGiven: inp.closedGiven, closedWonCount: inp.closedWonCount, leftToClose, closedCovers, onTarget,
    winRate, winFrom: inp.winFrom, openPipeline, openCount: open.length,
    dealCount: deals.length, ownProbability: byDeal ? deals.filter((d) => d.probability !== null && d.probability !== undefined).length : 0,
    weightedOpen, forecast, commit, bestCase, earlyShare, coverage, requiredCoverage, coverageHealthy,
    gap, newPipelineNeeded, lever, leverText,
    period: periodEnd ? { end: periodEnd, asOf, daysLeft: asOf ? dayNumber(periodEnd) - dayNumber(asOf) : null } : null,
    asOf,
    afterPeriod: group(later),
    noCloseDate: group(undated),
    pastDue: group(pastDue),
    byMonth, needed, chance, topDeals, slip,
  };
}

/** The chance as people read it: a whole percent, never "0%" or "100%" unless it is exactly that. */
function chanceText(c) {
  const one = (p) => (p <= 0 ? "0%" : p >= 1 ? "100%" : p < 0.005 ? "under 1%" : p >= 0.995 ? "over 99%" : Math.round(p * 100) + "%");
  const lo = one(c.low), hi = one(c.high);
  return lo === hi ? lo : lo + " to " + hi;
}

function render(r, source) {
  const out = [];
  const wr = (r.winRate * 100).toFixed(0) + "%";
  out.push("AAJ — Pipeline & Forecast");
  out.push("Source: " + source);
  out.push("");
  out.push("Target (quota):        " + money(r.target));
  if (r.closedGiven) {
    out.push("Closed won so far:     " + money(r.closedWon) + (r.closedWonCount !== null ? "   (" + plural(r.closedWonCount, "deal") + " added up)" : ""));
    out.push("Left to close:         " + (r.closedCovers ? "none (closed won covers the target)" : money(r.leftToClose)));
  }
  if (r.period) {
    out.push("Period ends:           " + r.period.end + (r.period.asOf ? (r.period.daysLeft === 0 ? "   (the as-of date)" : "   (" + plural(r.period.daysLeft, "day") + " after " + r.period.asOf + ")") : ""));
  }
  out.push("Win rate:              " + wr + (r.winFrom ? `   (${r.winFrom.won} won of ${r.winFrom.closed} closed)` : ""));
  out.push("Open pipeline:         " + money(r.openPipeline) + "  (" + plural(r.openCount, r.mode === "deals" ? "deal" : "stage total") + ")");
  const named = (g) => {
    for (const d of g.list) out.push("    " + d.name + "  " + money(d.amount) + (d.closeDate ? "  " + d.closeDate : ""));
    if (g.more) out.push("    … and " + g.more.toLocaleString("en-US") + " more");
  };
  if (r.afterPeriod) { out.push("  After the period:    " + money(r.afterPeriod.amount) + " in " + plural(r.afterPeriod.deals, "deal") + ", left out of everything below"); named(r.afterPeriod); }
  if (r.noCloseDate) { out.push("  No close date:       " + money(r.noCloseDate.amount) + " in " + plural(r.noCloseDate.deals, "deal") + (r.period ? ", counted in the period" : ", counted")); named(r.noCloseDate); }
  if (r.pastDue) { out.push("  Close date passed:   " + money(r.pastDue.amount) + " in " + plural(r.pastDue.deals, "deal") + ", still counted. Check each is still closing this period."); named(r.pastDue); }
  if (r.ownProbability) {
    out.push("  Probabilities:       " + (r.ownProbability === r.dealCount
      ? (r.dealCount === 1 ? "the deal carries its own" : "every deal carries its own")
      : r.ownProbability + " of " + plural(r.dealCount, "deal") + (r.ownProbability === 1 ? " carries its own" : " carry their own") + "; the rest use their stage's"));
  }
  out.push("");
  const each = r.ownProbability ? "Σ amount × probability" : "Σ amount × stage probability";
  out.push("Weighted forecast:     " + money(r.forecast) + "   <- expected (" + (r.closedWon > 0 ? "closed won + " : "") + each + ")");
  out.push("  Commit (>=75%):      " + money(r.commit));
  out.push("  Best case (all open):" + money(r.bestCase));
  out.push("Early-stage share:     " + pct(r.earlyShare) + " of open pipeline below 25% probability");
  out.push("");
  if (r.coverage === null) {
    out.push("Coverage:              not needed (closed won covers the target)");
  } else {
    out.push("Coverage:              " + r.coverage.toFixed(1) + "x   (need ~" + r.requiredCoverage.toFixed(1) + "x at a " + wr + " win rate)  ->  " + (r.coverageHealthy ? "HEALTHY" : "THIN") +
      (r.closedWon > 0 ? "   (open pipeline ÷ what is left to close)" : ""));
  }
  if (!r.onTarget) {
    out.push("Gap to target:         " + money(r.gap));
    out.push("New pipeline needed:   " + money(r.newPipelineNeeded) + "   (gap ÷ win rate)");
    if (r.needed) {
      out.push("Wins needed:           " + r.needed.wins.toLocaleString("en-US") + " more at an average deal of " + money(r.needed.averageDealSize) +
        (r.needed.from === "given" ? "" : "   (the average of " + (r.needed.sample < r.needed.sampleOf
          ? "the " + plural(r.needed.sample, "open deal") + " that " + (r.needed.sample === 1 ? "has" : "have") + " an amount"
          : (r.afterPeriod ? "all " : "your ") + plural(r.needed.sample, "open deal")) + (r.afterPeriod ? ", later ones included" : "") + ")"));
      out.push("Deals to add:          " + r.needed.dealsToAdd.toLocaleString("en-US") + "   (new pipeline ÷ average deal)");
    }
  } else {
    out.push("Gap to target:         none — weighted forecast covers the target");
  }
  if (r.chance) {
    out.push("");
    out.push("Chance of reaching the target: " + chanceText(r.chance));
    if (r.chance.high <= 0) {
      out.push("  Even with every open deal won, the total is " + money(r.target - r.bestCase) + " short of the target.");
    } else {
      const how = r.chance.exact ? "Worked out exactly, not simulated"
        : chanceText({ low: r.chance.low, high: r.chance.low }) === chanceText({ low: r.chance.high, high: r.chance.high })
          ? "Worked out on a fine grid, not simulated"
          : "A range, because the amounts are too varied for one exact figure";
      out.push("  " + how + ": each deal is taken to close on its own, at its probability. Deals that move together make the real spread wider.");
    }
  }
  if (r.topDeals) {
    out.push("");
    out.push("Largest deals by weight (share of the open forecast):");
    for (const t of r.topDeals) {
      out.push(`  ${t.name}: ${money(t.amount)} at ${pct(t.probability)} = ${money(t.weighted)}, ${pct(t.shareOfOpenForecast)}. Without it the forecast is ${money(t.forecastWithout)}` +
        (t.dropsBelowTarget ? ", below the target." : "."));
    }
  }
  if (r.slip) {
    out.push("");
    out.push(`If ${pct(r.slip.rate)} of the open forecast slips past the period (your estimate):`);
    out.push("  Forecast " + money(r.slip.forecast) + (r.slip.short ? ", " + money(r.slip.gap) + " short of the target." : ", which still covers the target."));
  }
  if (r.byMonth) {
    out.push("");
    out.push("By close month:");
    for (const m of r.byMonth) {
      out.push("  " + (m.month || "No date").padEnd(9) + plural(m.deals, "deal").padEnd(10) + money(m.amount).padStart(12) + "   weighted " + money(m.weighted) + (m.afterPeriod ? "   (after the period)" : ""));
    }
  }
  out.push("");
  out.push("Recommended lever: " + r.leverText);
  out.push("");
  out.push("--- JSON ---");
  const g = (x, f) => (x ? f(x) : null);
  const flag = (x) => ({ deals: x.deals, amount: r2(x.amount), weighted: r2(x.weighted), list: x.list.map((d) => ({ name: d.name, amount: r2(d.amount), closeDate: d.closeDate })), more: x.more });
  out.push(JSON.stringify({
    mode: r.mode,
    target: r2(r.target), closedWon: r2(r.closedWon), leftToClose: r.closedCovers ? 0 : r2(r.leftToClose), winRate: r4(r.winRate),
    openPipeline: r2(r.openPipeline), openDeals: r.mode === "deals" ? r.openCount : null, ownProbabilityDeals: r.ownProbability,
    weightedOpen: r2(r.weightedOpen), forecast: r2(r.forecast), commit: r2(r.commit), bestCase: r2(r.bestCase),
    earlyStageShare: r4(r.earlyShare),
    coverage: r.coverage === null ? null : r4(r.coverage), requiredCoverage: r4(r.requiredCoverage), coverageHealthy: r.coverageHealthy,
    gap: r.onTarget ? Math.min(0, r2(r.gap)) : r2(r.gap), newPipelineNeeded: r2(r.newPipelineNeeded),
    lever: r.lever, leverText: r.leverText,
    period: r.period,
    afterPeriod: g(r.afterPeriod, flag),
    noCloseDate: g(r.noCloseDate, flag),
    pastDue: g(r.pastDue, flag),
    byMonth: g(r.byMonth, (rows) => rows.map((m) => ({ month: m.month, afterPeriod: m.afterPeriod, deals: m.deals, amount: r2(m.amount), weighted: r2(m.weighted) }))),
    needed: g(r.needed, (x) => ({ averageDealSize: r2(x.averageDealSize), from: x.from, wins: x.wins, dealsToAdd: x.dealsToAdd })),
    chance: g(r.chance, (x) => ({ low: r4(x.low), high: r4(x.high), exact: x.exact })),
    topDeals: g(r.topDeals, (rows) => rows.map((t) => ({ name: t.name, amount: r2(t.amount), probability: r4(t.probability), weighted: r2(t.weighted), shareOfOpenForecast: r4(t.shareOfOpenForecast), forecastWithout: r2(t.forecastWithout) }))),
    slip: g(r.slip, (x) => ({ rate: x.rate, forecast: r2(x.forecast), gap: r2(x.gap) })),
  }, null, 2));
  return out.join("\n");
}

/** A raw input in, { error: [lines] } or { result, text } out. For callers that load this file as a module. */
function run(cfg, source) {
  const p = prepare(cfg);
  if (p.error) return { error: p.error };
  const result = compute(p.input);
  return { result, text: render(result, source || "your input") };
}

module.exports = { run, prepare, compute, render, chanceOfReaching, chanceText, dateOf, atLeast, COMMIT_PROB, EARLY_PROB, EARLY_SHARE_ADVANCE, TOP_DEALS, FLAG_DEALS, CHANCE_EXACT_DEALS, CHANCE_STEPS };

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
  const r = run(cfg, source);
  if (r.error) {
    r.error.forEach((l) => console.error(l));
    process.exit(1);
  }
  console.log(r.text);
}

main();
