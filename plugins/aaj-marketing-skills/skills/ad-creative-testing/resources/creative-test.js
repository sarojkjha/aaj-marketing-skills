#!/usr/bin/env node
/*
 * AAJ Ad Creative Testing — engine
 * Part of the "ad-creative-testing" Agent Skill.
 *
 * Two jobs: size a creative test before it runs, and read it honestly after.
 * AAJ's position: most creative "winners" are noise, picked early from uneven
 * delivery on a metric that is not the one that pays. The engine sizes the test
 * so it can answer the question, then refuses to name a winner it cannot back.
 *
 * USAGE
 *   node creative-test.js                    # demo (plan + read)
 *   node creative-test.js '<json-config>'    # your own
 *   node creative-test.js --help
 *
 * CONFIG (JSON) - include "plan", "read", or both
 *
 *   {
 *     "metric": "cpi" | "ctr" | "cvr",
 *        // cpi = conversions per impression (closest to cost per result; the default)
 *        // ctr = clicks per impression; cvr = conversions per click
 *     "alpha": 0.05, "power": 0.8,           // optional
 *     "plan": {
 *       "baselineRate": 0.002,                // the control's current rate on the metric
 *       "minDetectableLift": 0.3,             // relative: 0.3 = detect a 30% improvement
 *       "variants": 3,                        // including the control
 *       "dailyUnitsPerVariant": 20000,        // impressions a day per variant (clicks for cvr)
 *       "maxDays": 28                         // how long you are willing to run it
 *     },
 *     "read": {
 *       "variants": [                          // first one is the control
 *         { "name": "Control - product shot", "change": "", "impressions": 60000,
 *           "clicks": 540, "conversions": 118, "spend": 1800 }
 *       ],
 *       "plannedUnitsPerVariant": 60000        // optional: from the plan
 *     }
 *   }
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var MAX_DAYS_DEFAULT = 28;   // a test that needs longer than this rarely stays clean
var UNEVEN_DELIVERY = 2;     // one variant got more than 2x another's units
var MIN_EVENTS = 10;         // below this many events in any arm, nothing is readable
var METRICS = {
  cpi: { label: 'conversions per impression', num: 'conversions', den: 'impressions', unit: 'impressions' },
  ctr: { label: 'click-through rate', num: 'clicks', den: 'impressions', unit: 'impressions' },
  cvr: { label: 'conversion rate from click', num: 'conversions', den: 'clicks', unit: 'clicks' },
};

function inputError(msg, hint) { var e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function fmtP(p) { return p < 0.0001 ? '< 0.0001' : '= ' + p.toFixed(4); }

// Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf) and its inverse (Acklam).
function normCdf(z) {
  var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
function normInv(p) {
  var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  var q, r;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
function wilson(k, n, z) {
  if (!n) return null;
  var p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { low: Math.max(0, (c - h) / d), high: Math.min(1, (c + h) / d) };
}

// Units per variant for a two-sided two-proportion test, with Bonferroni across
// the (variants - 1) comparisons against the control.
function sampleSize(p1, lift, alpha, power, comparisons) {
  var p2 = p1 * (1 + lift);
  var a = alpha / Math.max(1, comparisons);
  var za = normInv(1 - a / 2), zb = normInv(power), pbar = (p1 + p2) / 2;
  var num = za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil(num * num / ((p2 - p1) * (p2 - p1)));
}

function plan(cfg, metric, alpha, power) {
  var p = cfg || {};
  if (!isNum(p.baselineRate) || p.baselineRate <= 0 || p.baselineRate >= 1) throw inputError('"plan.baselineRate" must be a rate between 0 and 1, e.g. 0.002 for 0.2%.');
  if (!isNum(p.minDetectableLift) || p.minDetectableLift <= 0) throw inputError('"plan.minDetectableLift" must be a positive relative lift, e.g. 0.3 for 30%.');
  if (p.baselineRate * (1 + p.minDetectableLift) >= 1) throw inputError('baselineRate x (1 + minDetectableLift) must stay below 1.');
  var variants = isNum(p.variants) ? Math.round(p.variants) : 2;
  if (variants < 2) throw inputError('"plan.variants" counts the control too, so it must be at least 2.');
  var daily = p.dailyUnitsPerVariant;
  if (!isNum(daily) || daily <= 0) throw inputError('"plan.dailyUnitsPerVariant" must be the ' + METRICS[metric].unit + ' each variant gets per day.');
  var maxDays = isNum(p.maxDays) && p.maxDays > 0 ? p.maxDays : MAX_DAYS_DEFAULT;
  var comps = variants - 1;
  var n = sampleSize(p.baselineRate, p.minDetectableLift, alpha, power, comps);
  var days = Math.ceil(n / daily);
  var out = { metric: metric, variants: variants, comparisons: comps, perVariant: n, total: n * variants, days: days, maxDays: maxDays,
    alphaPerComparison: alpha / comps, feasible: days <= maxDays, options: [] };
  if (!out.feasible) {
    // What CAN this budget detect in maxDays? Search the smallest detectable lift.
    var lo = p.minDetectableLift, hi = Math.max(lo, 1), cap = maxDays * daily;
    while (sampleSize(p.baselineRate, hi, alpha, power, comps) > cap && hi < 50 && p.baselineRate * (1 + hi * 2) < 1) hi *= 2;
    for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (sampleSize(p.baselineRate, mid, alpha, power, comps) > cap) lo = mid; else hi = mid; }
    out.detectableLiftInMaxDays = sampleSize(p.baselineRate, hi, alpha, power, comps) <= cap ? hi : null;
    if (variants > 2) {
      var n2 = sampleSize(p.baselineRate, p.minDetectableLift, alpha, power, 1);
      out.options.push({ id: 'fewer-variants', text: 'Test one challenger against the control instead of ' + comps + ': ' + Math.ceil(n2 / daily) + ' days.' });
    }
    if (out.detectableLiftInMaxDays) out.options.push({ id: 'bigger-swing', text: 'In ' + maxDays + ' days this traffic can only detect a lift of about ' + Math.round(out.detectableLiftInMaxDays * 100) + '%. Test a bigger idea, not a smaller tweak.' });
    if (metric === 'cpi') out.options.push({ id: 'upper-funnel', text: 'Judge on click-through rate first, then confirm the winner on cost per result in a second, smaller test. Clicks arrive faster than conversions, but a click winner is not always a cost winner.' });
  }
  return out;
}

function read(cfg, metric, alpha) {
  var r = cfg || {};
  var m = METRICS[metric];
  var vs = Array.isArray(r.variants) ? r.variants : [];
  if (vs.length < 2) throw inputError('"read.variants" needs the control first and at least one challenger.');
  vs = vs.map(function (v, i) {
    var den = v[m.den], num = v[m.num];
    if (!isNum(den) || den <= 0 || !isNum(num) || num < 0 || num > den) throw inputError('Variant ' + (i + 1) + ' ("' + (v.name || '') + '") needs ' + m.den + ' > 0 and ' + m.num + ' between 0 and ' + m.den + '.');
    return { name: String(v.name || ('Variant ' + (i + 1))), change: String(v.change || '').trim(), units: den, events: num,
      rate: num / den, spend: isNum(v.spend) ? v.spend : null, conversions: isNum(v.conversions) ? v.conversions : null,
      clicks: isNum(v.clicks) ? v.clicks : null, impressions: isNum(v.impressions) ? v.impressions : null };
  });
  var comps = vs.length - 1, aAdj = alpha / comps, z = normInv(1 - alpha / 2);
  var ctl = vs[0];
  vs.forEach(function (v, i) {
    v.interval = wilson(v.events, v.units, z);
    v.costPerResult = v.spend !== null && v.conversions ? v.spend / v.conversions : null;
    if (i === 0) return;
    var pool = (ctl.events + v.events) / (ctl.units + v.units);
    var se = Math.sqrt(pool * (1 - pool) * (1 / ctl.units + 1 / v.units));
    v.lift = ctl.rate > 0 ? v.rate / ctl.rate - 1 : null;
    v.z = se > 0 ? (v.rate - ctl.rate) / se : 0;
    v.p = 2 * (1 - normCdf(Math.abs(v.z)));
    v.significant = v.p < aAdj;
  });

  var findings = [];
  var add = function (level, id, text) { findings.push({ level: level, id: id, text: text }); };
  var units = vs.map(function (v) { return v.units; });
  var maxU = Math.max.apply(null, units), minU = Math.min.apply(null, units);
  var uneven = minU > 0 && maxU / minU > UNEVEN_DELIVERY;
  if (uneven) add('fix', 'uneven-delivery', 'Delivery was not split evenly: one variant got ' + (maxU / minU).toFixed(1) + 'x the ' + m.unit + ' of another. When the platform chooses who sees what, the variants reached different people at different times, so the comparison is biased. Re-run with your ad platform\'s experiment or A/B test feature where it has one, which is designed to split the audience.');
  var thin = vs.filter(function (v) { return v.events < MIN_EVENTS; });
  if (thin.length) add('fix', 'too-few-events', thin.map(function (v) { return '"' + v.name + '"'; }).join(', ') + ' ha' + (thin.length > 1 ? 've' : 's') + ' fewer than ' + MIN_EVENTS + ' ' + m.num + '. Nothing can be read from that yet; this engine treats ' + MIN_EVENTS + ' as the floor.');
  if (isNum(r.plannedUnitsPerVariant) && minU < r.plannedUnitsPerVariant) add('fix', 'stopped-early', 'The smallest arm has ' + minU + ' of the ' + r.plannedUnitsPerVariant + ' ' + m.unit + ' the plan called for. Reading a test before it reaches its planned size inflates false winners; finish it, or treat this as a hint.');
  var noChange = vs.slice(1).filter(function (v) { return !v.change; });
  if (noChange.length) add('improve', 'no-hypothesis', noChange.length + ' challenger' + (noChange.length > 1 ? 's do' : ' does') + ' not say what changed. Name the one thing each variant changes, or a win teaches you nothing you can reuse.');
  var multi = vs.slice(1).filter(function (v) { return / and |\+|,|&/.test(v.change); });
  if (multi.length) add('improve', 'multi-change', '"' + multi[0].name + '" changes more than one thing (' + multi[0].change + '). If it wins, you will not know which change did it.');
  if (comps > 1) add('info', 'multiple-comparisons', comps + ' challengers were compared with the control, so each one had to clear p < ' + aAdj.toFixed(4) + ' (Bonferroni) rather than ' + alpha + ', to keep the chance of a false winner at ' + alpha + ' overall.');
  // A click winner that loses on cost per result.
  if (metric === 'ctr') {
    vs.slice(1).forEach(function (v) {
      if (v.significant && v.lift > 0 && v.costPerResult !== null && ctl.costPerResult !== null && v.costPerResult > ctl.costPerResult) {
        add('fix', 'metric-conflict', '"' + v.name + '" wins on click-through rate but costs more per conversion than the control. Clicks are not the result you pay for; do not scale it on CTR alone.');
      }
    });
  }

  var winners = vs.slice(1).filter(function (v) { return v.significant && v.lift > 0; });
  var losers = vs.slice(1).filter(function (v) { return v.significant && v.lift < 0; });
  var blocking = findings.some(function (f) { return f.level === 'fix'; });
  var verdict;
  if (blocking) verdict = { level: 'unreadable', headline: 'Not a clean read', body: 'Fix the issues flagged below before naming a winner.' };
  else if (winners.length) {
    var best = winners.slice().sort(function (a, b) { return b.lift - a.lift; })[0];
    verdict = { level: 'winner', headline: best.name + ' beats the control', body: 'A ' + Math.round(best.lift * 100) + '% lift on ' + m.label + ' (p ' + fmtP(best.p) + ', threshold ' + aAdj.toFixed(4) + '). Roll it out, and keep the control running on a small share to watch for decay.', winner: best.name };
  } else if (losers.length === comps) verdict = { level: 'control', headline: 'The control wins', body: 'Every challenger did significantly worse. Keep the control and test a different idea.' };
  else verdict = { level: 'no-difference', headline: 'No winner yet', body: 'No challenger differs from the control by more than chance would explain at this sample size. That is a result: the change did not matter enough to detect. Test a bigger idea.' };

  return { metric: metric, metricLabel: m.label, alpha: alpha, alphaPerComparison: aAdj, variants: vs, findings: findings, verdict: verdict };
}

function run(cfg) {
  cfg = cfg || {};
  var metric = cfg.metric || 'cpi';
  if (!METRICS[metric]) throw inputError('"metric" must be "cpi", "ctr" or "cvr".');
  var alpha = isNum(cfg.alpha) && cfg.alpha > 0 && cfg.alpha < 0.5 ? cfg.alpha : 0.05;
  var power = isNum(cfg.power) && cfg.power > 0.5 && cfg.power < 1 ? cfg.power : 0.8;
  if (!cfg.plan && !cfg.read) throw inputError('Give a "plan", a "read", or both.');
  return { metric: metric, alpha: alpha, power: power,
    plan: cfg.plan ? plan(cfg.plan, metric, alpha, power) : null,
    read: cfg.read ? read(cfg.read, metric, alpha) : null,
    rules: { MAX_DAYS_DEFAULT: MAX_DAYS_DEFAULT, UNEVEN_DELIVERY: UNEVEN_DELIVERY, MIN_EVENTS: MIN_EVENTS } };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
function render(r) {
  const L = [];
  if (r.plan) {
    const p = r.plan;
    L.push('PLAN - ' + METRICS[p.metric].label);
    L.push(`  ${p.variants} variants (${p.comparisons} comparison${p.comparisons > 1 ? 's' : ''} with the control), alpha per comparison ${p.alphaPerComparison.toFixed(4)}`);
    L.push(`  Needs ${p.perVariant.toLocaleString('en-US')} ${METRICS[p.metric].unit} per variant, ${p.total.toLocaleString('en-US')} in all: about ${p.days} days.`);
    L.push(p.feasible ? `  Fits inside ${p.maxDays} days. Run it to the planned size before reading it.` : `  Longer than the ${p.maxDays} days you allowed. Options:`);
    p.options.forEach((o) => L.push('   - ' + o.text));
    L.push('');
  }
  if (r.read) {
    const x = r.read;
    L.push('READ - ' + x.metricLabel);
    L.push(`  ${x.verdict.headline.toUpperCase()}: ${x.verdict.body}`);
    L.push('');
    x.variants.forEach((v, i) => {
      const ci = v.interval ? `${pct(v.interval.low, 2)} to ${pct(v.interval.high, 2)}` : '-';
      const tail = i === 0 ? 'control' : `lift ${v.lift == null ? '-' : (v.lift >= 0 ? '+' : '') + Math.round(v.lift * 100) + '%'}, p ${fmtP(v.p)}${v.significant ? ' *' : ''}`;
      const cpr = v.costPerResult != null ? `, ${v.costPerResult.toFixed(2)} per conversion` : '';
      L.push(`  ${v.name}: ${pct(v.rate, 3)} (${ci}) on ${v.units.toLocaleString('en-US')} - ${tail}${cpr}`);
    });
    if (x.findings.length) {
      L.push('');
      L.push('FINDINGS');
      x.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : f.level === 'improve' ? '-' : 'i'}  ${f.text}`));
    }
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented numbers, not a real account.
const DEMO = {
  metric: 'cpi',
  plan: { baselineRate: 0.002, minDetectableLift: 0.3, variants: 3, dailyUnitsPerVariant: 20000, maxDays: 28 },
  read: {
    plannedUnitsPerVariant: 121173,
    variants: [
      { name: 'Control - product screenshot', impressions: 124000, clicks: 1110, conversions: 246, spend: 3720 },
      { name: 'Customer quote', change: 'headline is a customer quote', impressions: 123500, clicks: 1195, conversions: 345, spend: 3705 },
      { name: 'Price in the headline', change: 'price shown in the headline', impressions: 124500, clicks: 915, conversions: 269, spend: 3735 },
    ],
  },
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); } catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: an invented three-variant ad test, planned and then read)\n');
  }
  try { console.log(render(run(cfg))); }
  catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { fmtP, run, plan, read, sampleSize, normCdf, normInv, wilson, MAX_DAYS_DEFAULT, UNEVEN_DELIVERY, MIN_EVENTS };
