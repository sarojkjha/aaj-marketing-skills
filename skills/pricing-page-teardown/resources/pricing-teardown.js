#!/usr/bin/env node
/*
 * AAJ Pricing Page Teardown — engine
 * Part of the "pricing-page-teardown" Agent Skill.
 *
 * AAJ's position: a pricing page is judged on what a buyer can tell from it
 * (who each plan is for, what they would pay, what happens at the limits,
 * how to leave), not on layout. And a price change is tested only when a
 * test can actually answer the question: with a few thousand visitors a
 * week, most cannot, and the honest move is to know that before launch.
 * The 21 checks and their weights are AAJ's own; the test maths is the
 * standard two-sided z-test on revenue per visitor.
 *
 * USAGE
 *   node pricing-teardown.js                    # demo
 *   node pricing-teardown.js '<json-config>'    # your own
 *   node pricing-teardown.js --help
 *
 * CONFIG (JSON) - "teardown", "testPlan", "testRead": any or all
 *
 *   {
 *     "teardown": {
 *       "pages": {                                 // answers per check id 1..21: "yes" | "partly" | "no" | "unsure"
 *         "You":          { "1": "yes", "2": "partly", "3": "no", ... },
 *         "Competitor A": { "1": "yes", ... }
 *       },
 *       "yours": "You"                             // which page is yours (default: the first)
 *     },
 *     "testPlan": {
 *       "currentPrice": 49, "testPrice": 59,       // per conversion, same basis (first month, first year, first invoice)
 *       "conversion": 0.02,                        // visitor -> paid, today
 *       "guessConversion": 0.018,                  // your honest guess at the test price
 *       "visitorsPerWeek": 3000, "shareInTest": 1,
 *       "alpha": 0.05, "power": 0.8,
 *       "weeksAvailable": 8                        // AAJ's rule of thumb for the longest a price test stays clean
 *     },
 *     "testRead": {
 *       "design": "Live A/B",                      // "Live A/B" | "Before-after" | "Sales quotes"
 *       "priceA": 49, "priceB": 59,
 *       "visitorsA": 9000, "conversionsA": 180, "revenueA": 8820,
 *       "visitorsB": 9000, "conversionsB": 171, "revenueB": 10089,
 *       "plannedPerArm": 126757, "alpha": 0.05,
 *       "retainedA": 0.9, "retainedB": 0.86        // optional: 90-day retention of each arm's customers
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
var WEEKS_RULE = 8;   // AAJ's rule of thumb for the longest a price test stays clean
var CHECKS = [
  { id: 1, area: 'Clarity', w: 3, text: 'Each plan says who it is for, in words that buyer would use.' },
  { id: 2, area: 'Clarity', w: 3, text: 'A buyer can tell roughly what they would pay: a price, or for "Contact sales", what drives the price and where it starts.' },
  { id: 3, area: 'Clarity', w: 3, text: 'The value metric (per seat, per job, per account) is named, and it grows with the value the customer gets.' },
  { id: 4, area: 'Clarity', w: 2, text: 'Billing is plain: monthly or annual, what is charged today, the currency, and whether tax is extra.' },
  { id: 5, area: 'Clarity', w: 2, text: 'Plan differences are shown as limits and outcomes a buyer cares about, not a wall of ticks.' },
  { id: 6, area: 'Choice', w: 2, text: 'Every plan exists for a distinct buyer; there are no two plans a buyer cannot tell apart.' },
  { id: 7, area: 'Choice', w: 1, text: 'One plan is marked as the usual choice, and the page says why.' },
  { id: 8, area: 'Choice', w: 2, text: 'It is clear what happens at each limit: an overage charge, an upgrade, or a hard stop.' },
  { id: 9, area: 'Choice', w: 2, text: 'The way in matches how people buy (free plan, trial, demo or pilot), and the page says which.' },
  { id: 10, area: 'Proof & risk', w: 2, text: 'Proof sits near the price and speaks to that plan\'s buyer: a result or quote used with written permission.' },
  { id: 11, area: 'Proof & risk', w: 2, text: 'Risk reducers are stated as actually offered: trial length, what happens when it ends, refunds, cancellation.' },
  { id: 12, area: 'Proof & risk', w: 2, text: 'The FAQ answers the price questions sales hears most often.' },
  { id: 13, area: 'Proof & risk', w: 1, text: 'Security, compliance and procurement details are one click away for plans sold to companies.' },
  { id: 14, area: 'Friction', w: 2, text: 'Each plan has one next step that fits it (start now, or talk to sales), with no competing buttons.' },
  { id: 15, area: 'Friction', w: 2, text: 'The monthly/annual switch compares like with like and shows the saving honestly.' },
  { id: 16, area: 'Friction', w: 1, text: 'On a phone, every plan and price can be read without sideways scrolling.' },
  { id: 17, area: 'Friction', w: 3, text: 'The price and terms at checkout match the pricing page exactly.' },
  { id: 18, area: 'Honesty & terms', w: 3, text: 'For subscriptions: price, billing frequency, renewal and how to cancel are disclosed before billing details are asked for (ROSCA).' },
  { id: 19, area: 'Honesty & terms', w: 3, text: 'Cancelling is as simple as signing up; someone who signed up online can cancel online (ROSCA; California ARL).' },
  { id: 20, area: 'Honesty & terms', w: 2, text: 'Any "was/now" or crossed-out price is one you actually charged, regularly, for a reasonably substantial period (FTC Guides Against Deceptive Pricing).' },
  { id: 21, area: 'Honesty & terms', w: 2, text: 'Every figure, logo and customer quote on the page has a source or written permission.' },
];
var AREAS = ['Clarity', 'Choice', 'Proof & risk', 'Friction', 'Honesty & terms'];
var POINTS = { yes: 2, partly: 1, no: 0, unsure: 0 };

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
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

function scorePage(answers) {
  answers = answers || {};
  var byArea = {}, total = 0, avail = 0, answered = 0, unsure = 0, fails = [];
  AREAS.forEach(function (a) { byArea[a] = { points: 0, available: 0 }; });
  CHECKS.forEach(function (c) {
    var raw = answers[c.id] != null ? answers[c.id] : answers[String(c.id)];
    if (raw == null || raw === '') return;
    var ans = String(raw).toLowerCase().trim();
    if (!(ans in POINTS)) throw inputError('Check ' + c.id + ': answer "' + raw + '" is not yes, partly, no or unsure.');
    answered++;
    if (ans === 'unsure') unsure++;
    var pts = POINTS[ans] * c.w, max = 2 * c.w;
    byArea[c.area].points += pts; byArea[c.area].available += max; total += pts; avail += max;
    if (ans !== 'yes') fails.push({ id: c.id, area: c.area, weight: c.w, answer: ans, lost: max - pts, text: c.text });
  });
  var areas = AREAS.map(function (a) { return { area: a, share: byArea[a].available ? byArea[a].points / byArea[a].available : null }; });
  return { share: avail ? total / avail : null, points: total, available: avail, answered: answered, unsure: unsure, areas: areas, fails: fails };
}

function teardown(t) {
  t = t || {};
  var pages = t.pages || {};
  var names = Object.keys(pages);
  if (!names.length) throw inputError('"teardown.pages" needs at least one page with answers per check id.');
  var yours = t.yours && pages[t.yours] ? t.yours : names[0];
  var scored = {};
  names.forEach(function (n) { scored[n] = scorePage(pages[n]); });
  var mine = scored[yours];
  var rivals = names.filter(function (n) { return n !== yours; });
  var fixes = mine.fails.map(function (f) {
    var pass = rivals.filter(function (r) { var a = pages[r][f.id] != null ? pages[r][f.id] : pages[r][String(f.id)]; return String(a || '').toLowerCase() === 'yes'; }).length;
    return { id: f.id, area: f.area, weight: f.weight, answer: f.answer, lost: f.lost, competitorsPassing: pass, ofCompetitors: rivals.length, text: f.text };
  });
  fixes.sort(function (a, b) { return b.lost - a.lost || b.competitorsPassing - a.competitorsPassing || a.id - b.id; });
  var ranking = names.map(function (n) { return { page: n, share: scored[n].share, answered: scored[n].answered }; })
    .sort(function (a, b) { return (b.share == null ? -1 : b.share) - (a.share == null ? -1 : a.share); });
  var notes = [];
  if (mine.unsure > 0) notes.push(mine.unsure + ' "not sure" answer' + (mine.unsure > 1 ? 's' : '') + ' on your own page. Those score zero; go and look, then re-run.');
  if (mine.answered < CHECKS.length) notes.push((CHECKS.length - mine.answered) + ' check' + (CHECKS.length - mine.answered > 1 ? 's' : '') + ' unanswered; they are left out of the score.');
  var legal = fixes.filter(function (f) { return f.area === 'Honesty & terms' && f.id !== 21; });
  if (legal.length) notes.push((legal.length > 1 ? 'Checks ' : 'Check ') + legal.map(function (f) { return f.id; }).join(', ') + (legal.length > 1 ? ' touch' : ' touches') + ' ROSCA, California\'s automatic renewal law or the FTC pricing guides. Fix those first, whatever they score.');
  return { yours: yours, pages: scored, ranking: ranking, topFixes: fixes.slice(0, 5), allFixes: fixes, notes: notes };
}

function testPlan(p) {
  p = p || {};
  ['currentPrice', 'testPrice', 'conversion', 'visitorsPerWeek'].forEach(function (k) { if (!isNum(p[k]) || p[k] <= 0) throw inputError('"testPlan.' + k + '" must be greater than 0.'); });
  var c1 = p.conversion, c2 = isNum(p.guessConversion) ? p.guessConversion : null;
  if (c2 === null || c2 < 0 || c2 > 1) throw inputError('"testPlan.guessConversion" is your honest guess at conversion at the test price, between 0 and 1.');
  var p1 = p.currentPrice, p2 = p.testPrice;
  var alpha = isNum(p.alpha) && p.alpha > 0 && p.alpha < 1 ? p.alpha : 0.05;
  var power = isNum(p.power) && p.power > 0 && p.power < 1 ? p.power : 0.8;
  var share = isNum(p.shareInTest) && p.shareInTest > 0 && p.shareInTest <= 1 ? p.shareInTest : 1;
  var weeks = isNum(p.weeksAvailable) && p.weeksAvailable > 0 ? p.weeksAvailable : WEEKS_RULE;
  var rpv1 = p1 * c1, rpv2 = p2 * c2;
  var breakEven = c1 * p1 / p2;
  var zsum = normInv(1 - alpha / 2) + normInv(power);
  var perArm = null, weeksNeeded = null;
  if (Math.abs(rpv2 - rpv1) >= 1e-9) {
    perArm = Math.ceil(zsum * zsum * ((p1 * p1 * c1 * (1 - c1)) + (p2 * p2 * c2 * (1 - c2))) / ((rpv2 - rpv1) * (rpv2 - rpv1)));
    weeksNeeded = Math.ceil(2 * perArm / (p.visitorsPerWeek * share));
  }
  var mdc = zsum * Math.sqrt(2 * (p1 * p1 * c1 * (1 - c1)) / (p.visitorsPerWeek * share * weeks / 2)) / rpv1;
  var verdict;
  if (perArm === null) verdict = { level: 'nothing-to-detect', text: 'Your two guesses give the same revenue per visitor, so there is nothing for a test to detect. Revisit the guess.' };
  else if (rpv2 < rpv1) verdict = { level: 'guess-says-no', text: 'Your own guess says the test price earns less per visitor (' + (rpv2 / rpv1 * 100 - 100).toFixed(1) + '%). Test only if you doubt the guess; otherwise the answer is already in front of you.' };
  else if (weeksNeeded <= weeks) verdict = { level: 'testable', text: 'A live test can answer this in about ' + weeksNeeded + ' weeks. Run it to the full planned size, and do not stop early because it looks good.' };
  else verdict = { level: 'not-testable', text: 'A live test cannot answer this in ' + weeks + ' weeks: it would need about ' + weeksNeeded.toLocaleString('en-US') + '. In ' + weeks + ' weeks you could only detect a change of about ' + Math.round(mdc * 100) + '% in revenue per visitor. Use an alternative: ask before you charge (price sensitivity), change it for new customers and compare periods, quote it in sales-led deals, or test a bigger change.' };
  return { priceChange: p2 / p1 - 1, breakEvenConversion: breakEven, breakEvenConversionChange: p1 / p2 - 1,
    revenuePerVisitorNow: rpv1, revenuePerVisitorGuess: rpv2, expectedChange: rpv2 / rpv1 - 1,
    perArm: perArm, weeksNeeded: weeksNeeded, weeksAvailable: weeks, minDetectableChange: mdc, alpha: alpha, power: power, verdict: verdict };
}

function testRead(r) {
  r = r || {};
  ['visitorsA', 'conversionsA', 'revenueA', 'visitorsB', 'conversionsB', 'revenueB'].forEach(function (k) { if (!isNum(r[k]) || r[k] < 0) throw inputError('"testRead.' + k + '" is required.'); });
  if (!r.visitorsA || !r.visitorsB) throw inputError('Both arms need visitors.');
  var alpha = isNum(r.alpha) && r.alpha > 0 && r.alpha < 1 ? r.alpha : 0.05;
  var design = String(r.design || 'Live A/B');
  var randomised = !/before|quote/i.test(design);
  var qA = r.conversionsA / r.visitorsA, qB = r.conversionsB / r.visitorsB;
  var sA = r.revenueA / r.visitorsA, sB = r.revenueB / r.visitorsB;
  var pValue = null;
  if (r.conversionsA > 0 && r.conversionsB > 0) {
    var vA = Math.pow(r.revenueA / r.conversionsA, 2) * qA * (1 - qA) / r.visitorsA;
    var vB = Math.pow(r.revenueB / r.conversionsB, 2) * qB * (1 - qB) / r.visitorsB;
    pValue = vA + vB > 0 ? 2 * (1 - normCdf(Math.abs(sB - sA) / Math.sqrt(vA + vB))) : null;
  }
  var planned = isNum(r.plannedPerArm) && r.plannedPerArm > 0 ? r.plannedPerArm : null;
  var progress = planned ? Math.min(r.visitorsA, r.visitorsB) / planned : null;
  var verdict;
  if (!planned) verdict = { level: 'no-plan', text: 'Write the plan first: planned visitors per arm. A result read without a planned size is a result read whenever it looks good.' };
  else if (progress < 1) verdict = { level: 'too-early', text: 'Too early: ' + Math.round(progress * 100) + '% of the planned size. Keep going unless a guardrail is breached.' };
  else if (pValue === null) verdict = { level: 'check-inputs', text: 'Could not compute a p-value; check the inputs.' };
  else if (pValue < alpha) verdict = { level: sB > sA ? 'b-wins' : 'a-wins', text: (sB > sA ? 'B' : 'A') + ' earns more per visitor (p = ' + pValue.toFixed(3) + ' at the planned size).' };
  else verdict = { level: 'no-difference', text: 'No clear difference at the planned size (p = ' + pValue.toFixed(3) + '). Keep the current price.' };
  if (!randomised) verdict.text += ' Not randomised (' + design + '): anything else that changed is mixed in. Read as direction, not proof.';
  var retention = null;
  if (isNum(r.retainedA) && isNum(r.retainedB)) {
    retention = { retainedA: r.retainedA, retainedB: r.retainedB, note: r.retainedB < r.retainedA - 0.02 ? 'The test price\'s customers retain worse at 90 days. A price that converts well but churns faster has not won yet.' : 'Retention holds up at 90 days.' };
  } else retention = { note: 'Add 90-day retention for each arm before making the price permanent.' };
  return { design: design, randomised: randomised, conversionA: qA, conversionB: qB, revenuePerVisitorA: sA, revenuePerVisitorB: sB,
    change: sA ? sB / sA - 1 : null, pValue: pValue, alpha: alpha, plannedPerArm: planned, progress: progress, verdict: verdict, retention: retention };
}

function run(cfg) {
  cfg = cfg || {};
  if (!cfg.teardown && !cfg.testPlan && !cfg.testRead) throw inputError('Give a "teardown", a "testPlan", a "testRead", or any combination.');
  return {
    teardown: cfg.teardown ? teardown(cfg.teardown) : null,
    testPlan: cfg.testPlan ? testPlan(cfg.testPlan) : null,
    testRead: cfg.testRead ? testRead(cfg.testRead) : null,
    rules: { WEEKS_RULE: WEEKS_RULE, POINTS: POINTS, checks: CHECKS.length },
  };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const pct = (v, d) => v == null ? '-' : (v * 100).toFixed(d == null ? 0 : d) + '%';
const num = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
function render(r) {
  const L = [];
  if (r.teardown) {
    const t = r.teardown;
    L.push('TEARDOWN - share of weighted points on the checks answered');
    t.ranking.forEach((x) => L.push(`  ${x.page}${x.page === t.yours ? ' (you)' : ''}: ${pct(x.share)} (${x.answered} of ${CHECKS.length} checks answered)`));
    const mine = t.pages[t.yours];
    L.push('  Your areas: ' + mine.areas.map((a) => `${a.area} ${pct(a.share)}`).join(' · '));
    L.push('  Top fixes on your page:');
    t.topFixes.forEach((f) => L.push(`    #${f.id} [${f.area}, weight ${f.weight}, you: ${f.answer}] ${f.text}${f.ofCompetitors ? ' - ' + f.competitorsPassing + ' of ' + f.ofCompetitors + ' competitors pass' : ''}`));
    t.notes.forEach((n) => L.push(`  - ${n}`));
    L.push('');
  }
  if (r.testPlan) {
    const p = r.testPlan;
    L.push('PRICE-TEST PLAN');
    L.push(`  Price change ${pct(p.priceChange, 1)}; break-even conversion ${pct(p.breakEvenConversion, 2)} (${pct(p.breakEvenConversionChange, 1)} on conversion); revenue per visitor ${p.revenuePerVisitorNow.toFixed(3)} now vs ${p.revenuePerVisitorGuess.toFixed(3)} on your guess (${pct(p.expectedChange, 1)})`);
    if (p.perArm) L.push(`  Needs ${num(p.perArm)} visitors per arm = about ${p.weeksNeeded} weeks at your traffic (alpha ${p.alpha}, power ${p.power}). In ${p.weeksAvailable} weeks you could detect a change of about ${pct(p.minDetectableChange)}.`);
    L.push(`  ${p.verdict.level.toUpperCase()}: ${p.verdict.text}`);
    L.push('');
  }
  if (r.testRead) {
    const x = r.testRead;
    L.push(`TEST READ-OUT (${x.design})`);
    L.push(`  A: conversion ${pct(x.conversionA, 2)}, revenue/visitor ${x.revenuePerVisitorA.toFixed(3)}; B: conversion ${pct(x.conversionB, 2)}, revenue/visitor ${x.revenuePerVisitorB.toFixed(3)}; change ${pct(x.change, 1)}; p ${x.pValue == null ? '-' : x.pValue.toFixed(3)}${x.progress != null ? '; ' + pct(x.progress) + ' of planned size' : ''}`);
    L.push(`  ${x.verdict.level.toUpperCase()}: ${x.verdict.text}`);
    L.push(`  Retention: ${x.retention.note}`);
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: Fieldnote is an invented scheduling app; competitors are invented.
function ans(list) { const o = {}; list.forEach((v, i) => { o[i + 1] = v; }); return o; }
const DEMO = {
  teardown: {
    yours: 'Fieldnote',
    pages: {
      'Fieldnote': ans(['partly', 'yes', 'yes', 'yes', 'no', 'partly', 'no', 'no', 'yes', 'no', 'partly', 'no', 'unsure', 'yes', 'partly', 'yes', 'yes', 'partly', 'yes', 'yes', 'partly']),
      'Competitor A': ans(['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'partly', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'partly']),
      'Competitor B': ans(['partly', 'no', 'partly', 'yes', 'no', 'no', 'yes', 'no', 'partly', 'no', 'no', 'partly', 'no', 'no', 'yes', 'yes', 'yes', 'partly', 'no', 'yes', 'no']),
    },
  },
  testPlan: { currentPrice: 49, testPrice: 59, conversion: 0.02, guessConversion: 0.018, visitorsPerWeek: 3000, shareInTest: 1, alpha: 0.05, power: 0.8, weeksAvailable: 8 },
  testRead: { design: 'Live A/B', priceA: 49, priceB: 59, visitorsA: 9000, conversionsA: 180, revenueA: 8820, visitorsB: 9000, conversionsB: 171, revenueB: 10089, plannedPerArm: 126757 },
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
    console.log('(no config - demo: Fieldnote, an invented scheduling app, against two invented competitors; a $49 to $59 test planned and read)\n');
  }
  try { console.log(render(run(cfg))); }
  catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, teardown, scorePage, testPlan, testRead, normCdf, normInv, CHECKS, AREAS, POINTS, WEEKS_RULE };
