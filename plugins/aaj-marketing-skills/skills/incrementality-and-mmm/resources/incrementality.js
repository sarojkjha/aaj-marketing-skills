#!/usr/bin/env node
/**
 * AAJ — incrementality
 * Designs holdout/geo tests (how big, how long) and reads them out
 * (incremental conversions, iROAS, significance, and whether the test was
 * ever powerful enough to detect the effect it was looking for).
 * No dependencies. Node 14+.
 *
 *   node resources/incrementality.js                                    # demo
 *   node resources/incrementality.js --baseline 2.5 --mde 15 --daily 4000
 *   node resources/incrementality.js --control-n 50000 --control-conv 1200 \
 *        --treat-n 50000 --treat-conv 1380 --spend 15000 --value 400
 *   node resources/incrementality.js --help
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


// Standard normal quantiles for the values anyone actually uses. Hardcoded
// rather than approximated — fewer moving parts, no silent precision loss.
const Z_ALPHA = { 0.10: 1.6449, 0.05: 1.9600, 0.01: 2.5758 };   // two-tailed
const Z_POWER = { 0.80: 0.8416, 0.90: 1.2816, 0.95: 1.6449 };

const DEFAULTS = {
  baseline: 2.5,    // baseline conversion rate, %
  mde: 15,          // minimum detectable effect, % relative lift
  alpha: 0.05,
  power: 0.80,
  daily: 4000,      // total daily traffic available to split across both groups
  split: 50,        // % of traffic held out as control
  value: 400,       // value per conversion, $
  spend: null,      // channel spend over the test window, $
  controlN: null, controlConv: null, treatN: null, treatConv: null
};

const num = v => (typeof v === "number" ? v : parseFloat(v));

/** Abramowitz & Stegun 7.1.26 — plenty accurate for p-values. */
function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const p = 0.3275911, t = 1 / (1 + p * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
                 - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const normalCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

// ── DESIGN ──────────────────────────────────────────────────────────────
function design(o) {
  const p1 = num(o.baseline) / 100;
  const p2 = p1 * (1 + num(o.mde) / 100);
  const za = Z_ALPHA[num(o.alpha)];
  const zb = Z_POWER[num(o.power)];

  // Two-proportion sample size, per group.
  const nPerGroup = Math.ceil(
    Math.pow(za + zb, 2) * (p1 * (1 - p1) + p2 * (1 - p2)) / Math.pow(p2 - p1, 2)
  );

  // Unequal splits cost you: the smaller group gates the test.
  const share = num(o.split) / 100;
  const controlDaily = num(o.daily) * share;
  const treatDaily = num(o.daily) * (1 - share);
  const limitingDaily = Math.min(controlDaily, treatDaily);
  const days = limitingDaily > 0 ? Math.ceil(nPerGroup / limitingDaily) : Infinity;

  // Only the lift held back is lost. The control group still converts at the
  // baseline rate through other routes; what the holdout forgoes is the extra
  // conversions the treatment would have added.
  const withheld = controlDaily * days * (p2 - p1);
  const holdoutCost = withheld * num(o.value);

  return { p1, p2, nPerGroup, totalN: nPerGroup * 2, controlDaily, treatDaily, days, holdoutCost, withheld };
}

// ── READOUT ─────────────────────────────────────────────────────────────
function readout(o) {
  const n1 = num(o.controlN), c1 = num(o.controlConv);
  const n2 = num(o.treatN),   c2 = num(o.treatConv);
  const p1 = c1 / n1, p2 = c2 / n2;

  const lift = p1 > 0 ? (p2 - p1) / p1 : Infinity;

  // Two-proportion z-test.
  const pPool = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  const z = se > 0 ? (p2 - p1) / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  // Confidence interval on the absolute difference.
  const seDiff = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
  const za = Z_ALPHA[num(o.alpha)];
  const ciLow = (p2 - p1) - za * seDiff;
  const ciHigh = (p2 - p1) + za * seDiff;

  // Incremental conversions: what the treatment group would have produced at
  // the control rate, subtracted from what it actually produced.
  const counterfactual = n2 * p1;
  const incremental = c2 - counterfactual;
  const incrementalValue = incremental * num(o.value);
  const iRoas = o.spend != null && num(o.spend) > 0 ? incrementalValue / num(o.spend) : null;
  const iCac = incremental > 0 && o.spend != null ? num(o.spend) / incremental : null;

  // Was the test ever able to answer the question? The smallest relative lift
  // this sample could reliably find, compared against the lift you'd care
  // about (--mde). Comparing against the *observed* lift would be wrong: a
  // huge test that finds a tiny effect is well powered, not underpowered.
  const zb = Z_POWER[num(o.power)];
  const detectableAbs = (za + zb) * Math.sqrt(2 * p1 * (1 - p1) / Math.min(n1, n2));
  const detectableRel = p1 > 0 ? detectableAbs / p1 : Infinity;
  // No --mde given: there is no target to compare against, so no inconclusive
  // verdict is made. The smallest detectable lift is still reported.
  const careAbout = o.mde == null ? null : num(o.mde) / 100;
  const underpowered = careAbout != null && detectableRel > careAbout && pValue >= num(o.alpha);

  return {
    p1, p2, lift, z, pValue, ciLow, ciHigh,
    counterfactual, incremental, incrementalValue, iRoas, iCac,
    detectableRel, careAbout, underpowered
  };
}

const pct = (n, d = 2) => (n * 100).toFixed(d) + "%";
const money = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const int = n => Math.round(n).toLocaleString("en-US");

function reportDesign(o, r) {
  const L = [];
  L.push("");
  L.push("AAJ · INCREMENTALITY TEST DESIGN");
  L.push("─".repeat(64));
  L.push(`  Baseline rate           ${pct(r.p1)}`);
  L.push(`  Detecting a lift of     ${o.mde}% relative  (${pct(r.p1)} → ${pct(r.p2)})`);
  for (const k of (o._assumed || [])) L.push(`  NOTE: ${k} was not given; the default of ${DEFAULTS[k]} is assumed. Pass --${k} to use your own.`);
  L.push(`  Confidence / power      ${(1 - num(o.alpha)) * 100}% / ${num(o.power) * 100}%`);
  L.push("");
  L.push("REQUIRED");
  L.push(`  Sample per group        ${int(r.nPerGroup)}`);
  L.push(`  Total sample            ${int(r.totalN)}`);
  L.push(`  Daily traffic           ${int(num(o.daily))}  (${o.split}% control / ${100 - num(o.split)}% treatment)`);
  L.push(`  Test duration           ${r.days === Infinity ? "never — no traffic in one group" : r.days + " days"}`);
  L.push("");
  L.push("COST OF THE HOLDOUT");
  L.push(`  Lift withheld           ~${int(r.withheld)} conversions (the extra ones the treatment would add)`);
  L.push(`  Value forgone          ~${money(r.holdoutCost)}`);
  L.push("");
  if (r.days > 42) {
    L.push(`  ${r.days} days is long. Seasonality and competing changes will contaminate it.`);
    L.push("  Either accept a larger detectable lift, or run a geo test where whole");
    L.push("  markets are held out rather than a share of traffic.");
  } else if (r.days < 7) {
    L.push("  Under a week means you won't cover a full weekly cycle. Run at least 7 days");
    L.push("  regardless of what the sample size says — weekday and weekend behave differently.");
  } else {
    L.push("  Duration is workable. Hold everything else constant for the whole window.");
  }
  L.push("");
  L.push("─".repeat(64));
  L.push("JSON");
  L.push(JSON.stringify({
    mode: "design",
    baselineRate: +r.p1.toFixed(5), targetRate: +r.p2.toFixed(5),
    samplePerGroup: r.nPerGroup, totalSample: r.totalN,
    durationDays: r.days === Infinity ? null : r.days,
    holdoutValueForgone: Math.round(r.holdoutCost)
  }, null, 2));
  L.push("");
  return L.join("\n");
}

function reportReadout(o, r) {
  const sig = r.pValue < num(o.alpha);
  const L = [];
  L.push("");
  L.push("AAJ · INCREMENTALITY READOUT");
  L.push("─".repeat(64));
  if (r.underpowered) {
    L.push("  INCONCLUSIVE — the test was never large enough to detect this effect.");
  } else if (sig && r.incremental > 0) {
    L.push("  INCREMENTAL — the lift is real at the chosen confidence level.");
  } else if (sig && r.incremental < 0) {
    L.push("  NEGATIVE — the treatment performed worse, significantly.");
  } else {
    L.push("  NOT SIGNIFICANT — no detectable difference. The spend may be replacing");
    L.push("  conversions you would have got anyway.");
  }
  L.push("");
  L.push("RATES");
  L.push(`  Control                 ${pct(r.p1)}   (${int(num(o.controlConv))} / ${int(num(o.controlN))})`);
  L.push(`  Treatment               ${pct(r.p2)}   (${int(num(o.treatConv))} / ${int(num(o.treatN))})`);
  L.push(`  Relative lift           ${(r.lift * 100).toFixed(1)}%`);
  L.push("");
  L.push("SIGNIFICANCE");
  L.push(`  p-value                 ${r.pValue < 0.0001 ? "<0.0001" : r.pValue.toFixed(4)}   ${sig ? "significant" : "not significant"}`);
  L.push(`  ${(1 - num(o.alpha)) * 100}% CI on difference  ${pct(r.ciLow)} to ${pct(r.ciHigh)}`);
  L.push(`  Smallest lift this test could detect: ${(r.detectableRel * 100).toFixed(1)}%`);
  L.push("");
  L.push("INCREMENTALITY");
  L.push(`  Expected at control rate ${int(r.counterfactual)} conversions`);
  L.push(`  Actually observed        ${int(num(o.treatConv))}`);
  L.push(`  Incremental              ${int(r.incremental)}`);
  L.push(`  Incremental value        ${money(r.incrementalValue)}`);
  if (r.iRoas != null) {
    L.push(`  iROAS                    ${r.iRoas.toFixed(2)}x   (spend ${money(num(o.spend))})`);
    L.push(`  Incremental CAC          ${r.iCac != null && r.iCac > 0 ? money(r.iCac) : "n/a"}`);
  }
  L.push("");
  if (r.underpowered) {
    L.push(`  Read this carefully: this sample could only reliably detect a lift of`);
    L.push(`  ${(r.detectableRel * 100).toFixed(1)}% or more, but you said you'd care about ${(r.careAbout * 100).toFixed(0)}% (--mde).`);
    L.push(`  "Not significant" here means the test was too small — not that the`);
    L.push("  channel doesn't work. Rerun at the sample size the design mode gives you.");
  } else if (r.careAbout == null) {
    L.push("  No --mde was given, so no verdict is made on whether the test was big enough.");
    L.push(`  It could reliably detect a lift of ${(r.detectableRel * 100).toFixed(1)}% or more; pass --mde with the lift you would act on.`);
  } else if (!sig) {
    L.push(`  The test could detect a ${(r.detectableRel * 100).toFixed(1)}% lift and found nothing at that`);
    L.push("  level. That is a real result, not a failed test: treat this channel's");
    L.push("  attributed conversions as suspect until proven otherwise.");
  }
  L.push("");
  L.push("─".repeat(64));
  L.push("JSON");
  L.push(JSON.stringify({
    mode: "readout",
    controlRate: +r.p1.toFixed(5), treatmentRate: +r.p2.toFixed(5),
    relativeLift: +(r.lift * 100).toFixed(2),
    pValue: +r.pValue.toFixed(5), significant: sig, underpowered: r.underpowered,
    smallestDetectableLiftPct: +(r.detectableRel * 100).toFixed(2),
    incrementalConversions: Math.round(r.incremental),
    incrementalValue: Math.round(r.incrementalValue),
    iRoas: r.iRoas != null ? +r.iRoas.toFixed(3) : null,
    incrementalCac: r.iCac != null ? Math.round(r.iCac) : null
  }, null, 2));
  L.push("");
  return L.join("\n");
}

const HELP = `
AAJ incrementality — design a holdout test, then read it honestly.

Two modes. Supply --treat-conv and it reads out; otherwise it designs.

This engine designs and reads out holdout tests. It does not build a
marketing mix model (MMM); that method is guidance in the skill only.
Unknown or misspelled options stop the run with an error. A single JSON
object with the same names (camelCase: controlN, treatConv) also works.

Design
  --baseline    2.5     Baseline conversion rate, %
  --mde         15      Minimum detectable effect, % relative lift
  --alpha       0.05    0.10 | 0.05 | 0.01
  --power       0.80    0.80 | 0.90 | 0.95
  --daily       4000    Total daily traffic to split
  --split       50      % held out as control
  --value       400     Value per conversion, $

Readout
  --control-n           Control group size
  --control-conv        Control conversions
  --treat-n             Treatment group size
  --treat-conv          Treatment conversions
  --spend               Channel spend over the window, $  (enables iROAS)
  --value       400     Value per conversion, $

Why this and not attribution
  Attribution tells you which touchpoint preceded a conversion. It cannot
  tell you whether the conversion would have happened anyway. Only a holdout
  answers that, and the answer is often uncomfortable — particularly for
  retargeting and branded search, where attributed volume is high and
  incremental volume frequently is not.

The most valuable output here is the underpowered warning. A test that finds
"no significant difference" when it could never have detected the effect is
not evidence of no effect, and it is routinely reported as though it were.
`;

const NAMES = {
  "--baseline": "baseline", "--mde": "mde", "--alpha": "alpha", "--power": "power",
  "--daily": "daily", "--split": "split", "--value": "value", "--spend": "spend",
  "--control-n": "controlN", "--control-conv": "controlConv",
  "--treat-n": "treatN", "--treat-conv": "treatConv"
};
const FIELD_NAMES = Object.values(NAMES);

function fail(msg) { console.error(msg + "\nRun --help for the options."); process.exit(1); }

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  const given = new Set();
  const set = (k, v) => {
    const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
    if (!Number.isFinite(n)) fail(`"${k}" must be a number (got ${JSON.stringify(v)}).`);
    o[k] = n; given.add(k);
  };
  const first = argv.find(a => a.trim().startsWith("{"));
  if (first) {
    if (argv.length > 1) fail("Give either one JSON object or --flags, not both.");
    let j;
    try { j = JSON.parse(first); } catch (e) { fail("Invalid JSON: " + e.message); }
    if (!j || typeof j !== "object" || Array.isArray(j)) fail("The input must be a JSON object.");
    const bad = Object.keys(j).filter(k => !FIELD_NAMES.includes(k));
    if (bad.length) fail(`Unrecognised field${bad.length > 1 ? "s" : ""}: ${bad.map(k => '"' + k + '"').join(", ")}. Expected: ${FIELD_NAMES.join(", ")}.`);
    for (const k of Object.keys(j)) set(k, j[k]);
  } else {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--json") continue;
      const k = NAMES[a];
      if (!k) fail(`Unrecognised argument "${a}".`);
      if (argv[i + 1] === undefined || (argv[i + 1].startsWith("--") && !/^-?\d/.test(argv[i + 1]))) fail(`${a} needs a value.`);
      set(k, argv[++i]); 
    }
  }
  o._given = given;
  return o;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const demo = argv.length === 0 || (argv.length === 1 && argv[0] === "--demo");
  const o = demo ? { ...DEFAULTS, _given: new Set() } : parseArgs(argv);
  const g = o._given;
  const has = k => g.has(k);
  const isReadout = ["controlN", "controlConv", "treatN", "treatConv"].some(has);

  if (!Z_ALPHA[num(o.alpha)]) fail(`--alpha must be one of: ${Object.keys(Z_ALPHA).join(", ")}`);
  if (!Z_POWER[num(o.power)]) fail(`--power must be one of: ${Object.keys(Z_POWER).join(", ")}`);
  if (num(o.value) < 0) fail("--value cannot be negative.");

  if (isReadout) {
    const missing = ["controlN", "controlConv", "treatN", "treatConv"].filter(k => !has(k));
    if (missing.length) fail("Readout needs all of: --control-n --control-conv --treat-n --treat-conv");
    for (const k of ["baseline", "daily", "split"]) if (has(k)) fail(`--${k} is a design option and cannot be combined with a readout.`);
    for (const k of ["controlN", "controlConv", "treatN", "treatConv"]) if (!Number.isInteger(num(o[k])) || num(o[k]) < 0) fail(`--${k.replace(/[A-Z]/g, c => "-" + c.toLowerCase())} must be a whole number.`);
    if (num(o.controlConv) > num(o.controlN) || num(o.treatConv) > num(o.treatN)) fail("Conversions cannot exceed group size.");
    if (num(o.controlN) <= 0 || num(o.treatN) <= 0) fail("Group sizes must be greater than zero.");
    if (!has("mde")) o.mde = null;
    if (has("spend") && num(o.spend) < 0) fail("--spend cannot be negative.");
    const r = readout(o);
    if (argv.includes("--json")) {
      const sig = r.pValue < num(o.alpha);
      console.log(JSON.stringify({ mode: "readout", relativeLift: +(r.lift * 100).toFixed(2), pValue: +r.pValue.toFixed(5), significant: sig, underpowered: r.underpowered, smallestDetectableLiftPct: +(r.detectableRel * 100).toFixed(2), incrementalConversions: Math.round(r.incremental), incrementalValue: Math.round(r.incrementalValue), iRoas: r.iRoas != null ? +r.iRoas.toFixed(3) : null }, null, 2));
      return;
    }
    console.log(reportReadout(o, r));
    return;
  }

  if (has("spend")) fail("--spend is a readout option; give the four group counts as well.");
  if (num(o.baseline) <= 0 || num(o.baseline) >= 100) fail("--baseline is a percentage between 0 and 100.");
  if (num(o.mde) <= 0) fail("--mde must be greater than zero.");
  if (num(o.split) <= 0 || num(o.split) >= 100) fail("--split is a percentage between 0 and 100.");
  if (num(o.daily) <= 0) fail("--daily must be greater than zero.");
  if (num(o.baseline) * (1 + num(o.mde) / 100) >= 100) fail("baseline x (1 + mde) must stay under 100%.");
  o._assumed = demo ? [] : ["mde", "alpha", "power", "daily", "split", "value", "baseline"].filter(k => !has(k) && k !== "alpha" && k !== "power");

  const r = design(o);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ mode: "design", samplePerGroup: r.nPerGroup, totalSample: r.totalN, durationDays: r.days === Infinity ? null : r.days, holdoutValueForgone: Math.round(r.holdoutCost) }, null, 2));
    return;
  }
  if (demo) console.log("\n(demo with built-in numbers — pass options or --help)");
  console.log(reportDesign(o, r));
}

if (require.main === module) main();
module.exports = { design, readout, normalCdf, Z_ALPHA, Z_POWER };
