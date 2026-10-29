#!/usr/bin/env node
/*
 * AAJ SaaS Growth Efficiency - engine
 * Part of the "saas-growth-efficiency" Agent Skill.
 *
 * The four efficiency numbers investors and boards ask about - magic number,
 * burn multiple, Rule of 40 and CAC payback - from figures a founder already
 * has, each read against what its own source wrote, with the source
 * linked. AAJ adds no thresholds of its own; where the popular version of a
 * rule differs from the original (the 0.75 magic number, the five-band burn
 * multiple table), the engine uses the original's text.
 *
 * USAGE
 *   node growth-efficiency.js                    # demo (Example Co., invented numbers)
 *   node growth-efficiency.js '<json-config>'    # your own
 *   node growth-efficiency.js --help
 *
 * CONFIG (JSON) - one quarter's figures, plus the annual growth and margin.
 * Money in one currency; rates as fractions (0.75 = 75%). Give what you have:
 * each metric is computed when its inputs are present.
 *
 *   {
 *     "revenue": 1200000,          // recurring revenue this quarter
 *     "revenuePrior": 1050000,     // recurring revenue last quarter
 *     "smPrior": 700000,           // sales and marketing expense last quarter
 *     "netNewArr": 560000,         // optional: net new ARR this quarter (default: revenue change x 4)
 *     "netBurn": 900000,           // net cash burned this quarter (0 or less = not burning)
 *     "grossMargin": 0.75,         // gross margin on recurring revenue
 *     "growthYoY": 0.6,            // revenue growth over the last 12 months
 *     "profitMargin": -0.25,       // profit margin over the last 12 months (negative = loss)
 *     "marginBasis": "ebitda",     // optional: ebitda (Feld's preference) | fcf | operating
 *     "stage": "series-a",         // optional: seed | series-a | series-b-plus (burn multiple reading)
 *     "segment": "smb",            // optional: smb | mid-market | enterprise (CAC payback reading)
 *     "currency": "$"              // optional
 *   }
 *
 * FORMULAS
 *   Magic number   (revenue - revenuePrior) x 4 / smPrior
 *   Burn multiple  netBurn / netNewArr
 *   Rule of 40     growthYoY + profitMargin, in percentage points
 *   CAC payback    smPrior x 12 / (netNewArr x grossMargin), in months. Bessemer
 *                  defines payback only in words (months to repay S&M spend on a
 *                  gross-margin basis); this construction is AAJ's.
 *
 * SOURCES (each metric is read against its source's own words)
 *   Magic number   Rory O'Driscoll, Scale Venture Partners, "Magic Number Math", Apr 20, 2010
 *   Burn multiple  David Sacks, "The Burn Multiple", Apr 23, 2020
 *   Rule of 40     Brad Feld, "The Rule of 40% For a Healthy SaaS Company", Feb 3, 2015
 *                  (Feld popularised it; he credits an unnamed late-stage investor)
 *   CAC payback    Bessemer Venture Partners, "10 Laws of Cloud", Jun 19, 2019
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`.
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

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
// Every reading below comes from the source named beside it. AAJ adds no thresholds of its own;
// the CAC payback formula and the fix-first order are AAJ's and are labelled so.
var SOURCES = {
  magicNumber: { who: 'Scale Venture Partners (Rory O\'Driscoll)', title: 'Magic Number Math', date: '2010-04-20', url: 'https://www.scalevp.com/blog/magic-number-math' },
  burnMultiple: { who: 'David Sacks', title: 'The Burn Multiple', date: '2020-04-23', url: 'https://sacks.substack.com/p/the-burn-multiple-51a7e43cb200' },
  ruleOf40: { who: 'Brad Feld', title: 'The Rule of 40% For a Healthy SaaS Company', date: '2015-02-03', url: 'https://feld.com/archives/2015/02/rule-40-healthy-saas-company/' },
  cacPayback: { who: 'Bessemer Venture Partners', title: '10 Laws of Cloud', date: '2019-06-19', url: 'https://www.bvp.com/atlas/10-laws-of-cloud' }
};
// Scale VP: above 1x compelling; below 0.5x the model is not figured out.
var MAGIC_HIGH = 1, MAGIC_LOW = 0.5;
// Sacks, in the post's text: his worked examples are 2x for an early-stage startup,
// 3x at seed and 2x after a Series A (examples, not cut-offs); 3x or more needs
// extraordinary investment; 5x is terrible.
var BURN_REF = { seed: 3, 'series-a': 2 }, BURN_EARLY = 2, BURN_HIGH = 3, BURN_TERRIBLE = 5;
// Feld: growth plus profit of at least 40%.
var RULE_OF_40 = 40;
// Bessemer: SMB about 6-18 months; enterprise as long as 24-36; beyond 36 hard to fund.
var PAYBACK = { smb: [6, 18], enterprise: [24, 36] }, PAYBACK_MAX = 36;
var ARR_MISMATCH = 0.25;   // AAJ's rule: flag when the ARR you entered and revenue change x 4 differ by more than 25%

var FIELDS = ['revenue', 'revenuePrior', 'smPrior', 'netNewArr', 'netBurn', 'grossMargin', 'growthYoY', 'profitMargin',
  'marginBasis', 'stage', 'segment', 'currency'];
var STAGES = ['seed', 'series-a', 'series-b-plus'], SEGMENTS = ['smb', 'mid-market', 'enterprise'], BASES = ['ebitda', 'fcf', 'operating'];

function inputError(msg, hint) { var e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }
// Round off floating-point noise (39.99999999 -> 40) before any comparison with a source's threshold.
function tidy(v) { return Math.round(v * 1e9) / 1e9; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function num(cfg, k, lo, hi, label) {
  var v = cfg[k];
  if (v == null) return null;
  if (!isNum(v) || v < lo || v > hi) throw inputError('"' + k + '" must be a number from ' + lo + ' to ' + hi + ' (got ' + JSON.stringify(v) + ').', label);
  return v;
}

function normalise(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw inputError('The config must be a JSON object.');
  Object.keys(cfg).forEach(function (k) {
    if (FIELDS.indexOf(k) < 0) throw inputError('Unknown field "' + k + '".', 'Allowed: ' + FIELDS.join(', ') + '.');
  });
  var BIG = 1e13;
  var s = {
    revenue: num(cfg, 'revenue', 0, BIG), revenuePrior: num(cfg, 'revenuePrior', 0, BIG), smPrior: num(cfg, 'smPrior', 0, BIG),
    netNewArr: num(cfg, 'netNewArr', -BIG, BIG), netBurn: num(cfg, 'netBurn', -BIG, BIG),
    grossMargin: num(cfg, 'grossMargin', 0, 1, 'Write 75% as 0.75.'), growthYoY: num(cfg, 'growthYoY', -1, 5, 'Write 60% growth as 0.6. Above 5 (500%) is read as a percentage typed in by mistake.'),
    profitMargin: num(cfg, 'profitMargin', -5, 1, 'Write a 25% loss as -0.25.'),
    marginBasis: cfg.marginBasis == null ? 'ebitda' : cfg.marginBasis,
    marginBasisGiven: cfg.marginBasis != null,
    stage: cfg.stage == null ? null : cfg.stage, segment: cfg.segment == null ? null : cfg.segment,
    currency: cfg.currency == null ? '$' : String(cfg.currency).slice(0, 4)
  };
  if (BASES.indexOf(s.marginBasis) < 0) throw inputError('"marginBasis" must be one of ' + BASES.join(', ') + '.');
  if (s.stage !== null && STAGES.indexOf(s.stage) < 0) throw inputError('"stage" must be one of ' + STAGES.join(', ') + '.');
  if (s.segment !== null && SEGMENTS.indexOf(s.segment) < 0) throw inputError('"segment" must be one of ' + SEGMENTS.join(', ') + '.');
  if (s.smPrior === 0) throw inputError('"smPrior" must be above 0: the magic number and CAC payback divide by it.');
  if (s.grossMargin === 0) throw inputError('"grossMargin" must be above 0: CAC payback divides by it.');
  return s;
}

function run(cfg) {
  var s = normalise(cfg);
  var cur = s.currency, money = function (v) { return (v < 0 ? '-' : '') + cur + Math.round(Math.abs(v)).toLocaleString('en-US'); };
  var out = { inputs: s, metrics: {}, missing: [], notes: [], sources: SOURCES,
    rules: { MAGIC_HIGH: MAGIC_HIGH, MAGIC_LOW: MAGIC_LOW, BURN_REF: BURN_REF, BURN_EARLY: BURN_EARLY, BURN_HIGH: BURN_HIGH, BURN_TERRIBLE: BURN_TERRIBLE,
      RULE_OF_40: RULE_OF_40, PAYBACK: PAYBACK, PAYBACK_MAX: PAYBACK_MAX, ARR_MISMATCH: ARR_MISMATCH } };

  // Net new ARR: as entered, else this quarter's revenue change annualised.
  var derivedArr = s.revenue !== null && s.revenuePrior !== null ? (s.revenue - s.revenuePrior) * 4 : null;
  var arr = s.netNewArr !== null ? s.netNewArr : derivedArr;
  out.netNewArr = arr; out.netNewArrSource = s.netNewArr !== null ? 'entered' : derivedArr !== null ? 'revenue change x 4' : null;
  if (s.netNewArr !== null && derivedArr !== null && Math.abs(derivedArr) > 0 &&
      Math.abs(s.netNewArr - derivedArr) / Math.abs(derivedArr) > ARR_MISMATCH) {
    out.notes.push('The net new ARR you entered (' + money(s.netNewArr) + ') differs from this quarter\'s revenue change x 4 (' + money(derivedArr) +
      ') by more than ' + Math.round(ARR_MISMATCH * 100) + '%. The magic number uses revenue; burn multiple and CAC payback use your ARR. Check which is right.');
  }

  // Magic number
  if (s.revenue !== null && s.revenuePrior !== null && s.smPrior !== null) {
    var mn = tidy((s.revenue - s.revenuePrior) * 4 / s.smPrior);
    var mlevel = mn > MAGIC_HIGH ? 'strong' : mn < MAGIC_LOW ? 'weak' : 'middle';
    out.metrics.magicNumber = { value: mn, level: mlevel, source: 'magicNumber',
      reading: mlevel === 'strong' ? 'Above 1x: Scale Venture Partners calls this a compelling business investment.'
        : mlevel === 'weak' ? 'Below 0.5x: Scale Venture Partners says a company here has not yet figured out its model.'
        : 'Between 0.5x and 1x: Scale Venture Partners says a company here will probably reach success and cash-flow break-even, but in a relatively capital-inefficient way.' };
  } else out.missing.push({ metric: 'magicNumber', needs: ['revenue', 'revenuePrior', 'smPrior'] });

  // Burn multiple
  if (s.netBurn !== null && arr !== null) {
    var ref = s.stage && BURN_REF[s.stage] != null ? BURN_REF[s.stage] : BURN_EARLY;
    var bm = { source: 'burnMultiple', reference: s.stage === 'series-b-plus' ? null : ref };
    if (s.netBurn <= 0 && arr > 0) { bm.value = null; bm.level = 'not-burning'; bm.reading = 'Not burning cash this quarter while adding net new ARR: the burn multiple is at or below 0, the direction Sacks says it should move over time.'; }
    else if (s.netBurn <= 0) { bm.value = null; bm.level = 'not-burning-no-growth'; bm.reading = 'Not burning cash, but net new ARR is ' + (arr === 0 ? 'zero' : 'negative') + ': the burn multiple has no meaningful value, and not burning while revenue is flat or falling is not the efficiency Sacks describes.'; }
    else if (arr <= 0) { bm.value = null; bm.level = 'no-growth'; bm.reading = 'Burning cash while net new ARR is ' + (arr === 0 ? 'zero' : 'negative') + ': the burn multiple has no meaningful value, and it is the worst case it measures.'; }
    else {
      bm.value = tidy(s.netBurn / arr);
      bm.level = bm.value >= BURN_TERRIBLE ? 'terrible' : bm.value >= BURN_HIGH ? 'high' : (bm.reference != null && bm.value > bm.reference) ? 'above-example' : 'within-example';
      var stageTxt = s.stage === 'seed' ? '3x for a seed-stage company' : s.stage === 'series-a' ? '2x after a Series A' : '2x for an early-stage startup (stage not stated, so read as early stage)';
      bm.reading = bm.level === 'terrible' ? '5x or more: Sacks calls this a terrible burn multiple.'
        : bm.level === 'high' ? '3x or more: Sacks says this needs extraordinary investment and may mean product-market fit is not what it appears to be, or there is some other problem in the business.'
        : bm.level === 'above-example' ? 'Below 3x, but above the ' + stageTxt + ' that Sacks uses as a worked example. His example is not a cut-off.'
        : (s.stage === 'series-b-plus' ? 'Below 3x. Sacks expects efficiency to keep improving after a Series B, toward 0 over time; he gives no Series B number.' : 'Below 3x and at or under the ' + stageTxt + ' that Sacks uses as a worked example.');
    }
    out.metrics.burnMultiple = bm;
  } else out.missing.push({ metric: 'burnMultiple', needs: s.netBurn === null ? ['netBurn', 'netNewArr (or revenue and revenuePrior)'] : ['netNewArr (or revenue and revenuePrior)'] });

  // Rule of 40
  if (s.growthYoY !== null && s.profitMargin !== null) {
    var r40 = tidy((s.growthYoY + s.profitMargin) * 100);
    out.metrics.ruleOf40 = { value: r40, growth: s.growthYoY * 100, margin: s.profitMargin * 100, basis: s.marginBasis, basisGiven: s.marginBasisGiven, source: 'ruleOf40',
      level: r40 >= RULE_OF_40 ? 'meets' : 'below', shortfall: tidy(Math.max(0, RULE_OF_40 - r40)),
      reading: r40 >= RULE_OF_40 ? 'At or above 40: meets Feld\'s Rule of 40.' : (Math.round((RULE_OF_40 - r40) * 10) / 10) + ' points short of Feld\'s Rule of 40.' +
        (s.marginBasis !== 'ebitda' ? ' Feld prefers EBITDA as the profit measure; you used ' + (s.marginBasis === 'fcf' ? 'free cash flow' : 'operating') + ' margin.' : '') };
  } else out.missing.push({ metric: 'ruleOf40', needs: ['growthYoY', 'profitMargin'] });

  // CAC payback
  if (s.smPrior !== null && s.grossMargin !== null && arr !== null) {
    var cp = { source: 'cacPayback', segment: s.segment };
    if (arr <= 0) { cp.value = null; cp.level = 'never'; cp.reading = 'Net new ARR is not positive, so sales and marketing spend is not being paid back.'; }
    else {
      cp.value = tidy(s.smPrior * 12 / (arr * s.grossMargin));
      var band = s.segment ? PAYBACK[s.segment === 'mid-market' ? null : s.segment] : null;
      if (cp.value > PAYBACK_MAX) { cp.level = 'too-long'; cp.reading = 'Over 36 months: Bessemer says growth is often hard to fund here unless customer lifetime value is exceptionally high.'; }
      else if (band && cp.value > band[1]) { cp.level = 'above-range'; cp.reading = 'Longer than Bessemer\'s ' + band[0] + '-' + band[1] + ' month range for ' + (s.segment === 'smb' ? 'SMB' : 'enterprise') + ' customers.'; }
      else if (band) { cp.level = 'in-range'; cp.reading = 'Within or under Bessemer\'s ' + band[0] + '-' + band[1] + ' month range for ' + (s.segment === 'smb' ? 'SMB' : 'enterprise') + ' customers.'; }
      else { cp.level = 'under-max'; cp.reading = '36 months or under. Bessemer gives about 6-18 months for SMB customers and as long as 24-36 for enterprise' + (s.segment === 'mid-market' ? '; it gives no range for mid-market.' : '.'); }
    }
    out.metrics.cacPayback = cp;
  } else out.missing.push({ metric: 'cacPayback', needs: ['smPrior', 'grossMargin', 'netNewArr (or revenue and revenuePrior)'] });

  if (!Object.keys(out.metrics).length) throw inputError('Not enough to compute any metric.', 'Give revenue, revenuePrior and smPrior for the magic number, or growthYoY and profitMargin for the Rule of 40. See --help.');

  // AAJ's view of what to fix first: go-to-market efficiency before burn, burn before the Rule of 40,
  // because spending more on a go-to-market that does not pay back only raises the burn.
  var M = out.metrics, first = null;
  if (M.burnMultiple && M.burnMultiple.level === 'not-burning-no-growth') {
    first = { area: 'growth', text: 'Find out why net new ARR is not positive first: with revenue flat or falling, the efficiency numbers say little until growth returns.' };
  } else if ((M.magicNumber && M.magicNumber.level === 'weak') || (M.cacPayback && (M.cacPayback.level === 'too-long' || M.cacPayback.level === 'never'))) {
    first = { area: 'go-to-market', text: 'Fix go-to-market efficiency first: new revenue is not yet paying back sales and marketing spend, so spending more would raise the burn without fixing it.' };
  } else if (M.burnMultiple && (M.burnMultiple.level === 'high' || M.burnMultiple.level === 'terrible' || M.burnMultiple.level === 'no-growth')) {
    first = { area: 'burn', text: 'Bring the burn down relative to new ARR first: ' + (M.magicNumber || M.cacPayback
      ? 'the go-to-market numbers are workable, but spending outside it is outrunning growth.'
      : 'add revenue, revenuePrior, smPrior and grossMargin to check whether go-to-market or other spending is the cause.') };
  } else if (M.ruleOf40 && M.ruleOf40.level === 'below') {
    first = { area: 'balance', text: 'Close the Rule of 40 gap: ' + (M.ruleOf40.margin < 0 && M.ruleOf40.growth >= RULE_OF_40 ? 'growth alone clears 40, so the gap is the loss margin.' : 'look at growth and margin together.') };
  } else if ((M.cacPayback && M.cacPayback.level === 'above-range') || (M.burnMultiple && M.burnMultiple.level === 'above-example')) {
    first = { area: 'watch', text: 'Nothing crosses a source\'s hard line, but ' + (M.cacPayback && M.cacPayback.level === 'above-range'
      ? 'CAC payback is longer than Bessemer\'s range for your segment' : 'the burn multiple is above Sacks\'s worked example for your stage') + '. Watch it over the next quarters.' };
  } else {
    first = { area: 'none', text: 'Nothing stands out against the sources\' own readings. Keep tracking these numbers each quarter; a single quarter can mislead.' };
  }
  first.view = 'AAJ\'s view';
  out.fixFirst = first;
  return out;
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const cur = r.inputs.currency;
  const money = (v) => (v < 0 ? '-' : '') + cur + Math.round(Math.abs(v)).toLocaleString('en-US');
  const L = [];
  L.push('SAAS GROWTH EFFICIENCY');
  L.push('═'.repeat(58));
  const M = r.metrics;
  if (M.magicNumber) {
    L.push(`Magic number    ${M.magicNumber.value.toFixed(2)}x`);
    L.push(`  ${M.magicNumber.reading}`);
  }
  if (M.burnMultiple) {
    L.push(`Burn multiple   ${/^not-burning/.test(M.burnMultiple.level) ? 'not burning' : M.burnMultiple.value == null ? 'n/a' : M.burnMultiple.value.toFixed(2) + 'x'}`);
    L.push(`  ${M.burnMultiple.reading}`);
  }
  if (M.ruleOf40) {
    L.push(`Rule of 40      ${M.ruleOf40.value.toFixed(0)}  (growth ${M.ruleOf40.growth.toFixed(0)}% + ${M.ruleOf40.basisGiven === false ? 'profit' : M.ruleOf40.basis === 'fcf' ? 'FCF' : M.ruleOf40.basis === 'operating' ? 'operating' : 'EBITDA'} margin ${M.ruleOf40.margin.toFixed(0)}%)`);
  if (M.ruleOf40.basisGiven === false) L.push("  Margin basis not stated; read as EBITDA, Feld's preferred measure.");
    L.push(`  ${M.ruleOf40.reading}`);
  }
  if (M.cacPayback) {
    L.push(`CAC payback     ${M.cacPayback.value == null ? 'never' : M.cacPayback.value.toFixed(1) + ' months'}`);
    L.push(`  ${M.cacPayback.reading}`);
  }
  if (r.netNewArr != null) L.push(`\nNet new ARR this quarter: ${money(r.netNewArr)} (${r.netNewArrSource})`);
  L.push('');
  L.push('FIX FIRST (' + r.fixFirst.view + ')');
  L.push('  ' + r.fixFirst.text);
  if (r.notes.length) { L.push(''); L.push('CHECK'); r.notes.forEach((n) => L.push('  ! ' + n)); }
  if (r.missing.length) {
    L.push('');
    L.push('NOT COMPUTED');
    const NAMES = { magicNumber: 'Magic number', burnMultiple: 'Burn multiple', ruleOf40: 'Rule of 40', cacPayback: 'CAC payback' };
    r.missing.forEach((m) => L.push(`  ${NAMES[m.metric]}: add ${m.needs.join(', ')}`));
  }
  L.push('');
  L.push('SOURCES');
  Object.keys(M).forEach((k) => { const s = r.sources[M[k].source]; L.push(`  ${s.who}, "${s.title}", ${s.date}: ${s.url}`); });
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Example Co. is fictional; every number here is invented for the demo.
const DEMO = {
  revenue: 1200000, revenuePrior: 1050000, smPrior: 700000, netBurn: 900000, grossMargin: 0.75,
  growthYoY: 0.6, profitMargin: -0.3, stage: 'series-a', segment: 'smb',
};

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    return;
  }
  let cfg;
  if (argv.length === 0 || argv.includes('--demo')) {
    cfg = DEMO;
    console.log('(no config - demo: Example Co., a fictional company, with invented numbers)\n');
  } else {
    try { cfg = JSON.parse(argv[0]); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
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

module.exports = { run, render, normalise, SOURCES };
