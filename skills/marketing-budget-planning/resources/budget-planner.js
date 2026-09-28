#!/usr/bin/env node
/*
 * AAJ Marketing Budget Planner — engine
 * Part of the "marketing-budget-planning" Agent Skill.
 *
 * Sizes a total marketing budget, then splits it across functions.
 *
 * WHERE THE NUMBERS COME FROM
 *   B2B SaaS stage bands are AAJ's own estimates from client engagements
 *   (2023-2026), not third-party research:
 *     pre-seed   30-60% of quarterly burn (revenue is not yet a useful base)
 *     seed       10-20% of funding raised
 *     series A   20-30% of ARR
 *     series B   12-20% of revenue
 *     growth     15-25% of revenue (scaling, post-Series B)
 *     mature     5-7% of revenue, marketing only
 *   Published reference points, printed with every run:
 *     Gartner 2026 CMO Spend Survey — marketing budgets averaged 7.8% of
 *       company revenue (401 CMOs, mostly companies above $1B revenue).
 *     SaaS Capital 2026 — median marketing spend at private B2B SaaS
 *       companies is 8% of ARR (1,000+ companies).
 *     Gartner 2026 — paid media 31.4% and martech 19.4% of the average
 *       marketing budget (martech figure via trade coverage of the survey).
 *   There is no sourced stage band for ecommerce, services or marketplaces.
 *   For those models, pass your own "pctOfRevenue"; without it the engine
 *   sizes the budget at Gartner's 7.8% and says so.
 *   The function split is an AAJ default to edit, not a benchmark. Pass your
 *   own "split" to replace it.
 *
 * USAGE
 *   node budget-planner.js                 # demo
 *   node budget-planner.js '<json>'        # custom
 *   node budget-planner.js --help
 *
 * CONFIG (JSON)
 *   { "model":"b2b_saas",          // b2b_saas | ecommerce | services | marketplace
 *     "stage":"series_a",          // pre_seed | seed | series_a | series_b | growth | mature
 *     "annualRevenue": 3000000,    // ARR or annual revenue ($) — series_a and later
 *     "quarterlyBurn": 400000,     // pre_seed only ($)
 *     "fundingRaised": 3000000,    // seed only ($)
 *     "runwayMonths": 18,          // seed only, optional: spreads the seed budget per month
 *     "growthTarget":"balanced",   // conservative | balanced | aggressive (picks low / mid / high of the band)
 *     "pctOfRevenue": 9,           // optional: your own % — overrides the band
 *     "split": { "Paid acquisition": 50, "Content": 30, "Tooling": 20 } }  // optional, must sum to 100
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


'use strict';

// AAJ stage bands for B2B SaaS (AAJ's own estimates — see header).
const SAAS_BANDS = {
  pre_seed: { lo: 30, hi: 60, base: 'quarterlyBurn', baseLabel: 'of quarterly burn' },
  seed:     { lo: 10, hi: 20, base: 'fundingRaised', baseLabel: 'of funding raised' },
  series_a: { lo: 20, hi: 30, base: 'annualRevenue', baseLabel: 'of ARR' },
  series_b: { lo: 12, hi: 20, base: 'annualRevenue', baseLabel: 'of revenue' },
  growth:   { lo: 15, hi: 25, base: 'annualRevenue', baseLabel: 'of revenue' },
  mature:   { lo: 5,  hi: 7,  base: 'annualRevenue', baseLabel: 'of revenue' }
};
const POSITION = { conservative: 0, balanced: 0.5, aggressive: 1 };
const LABEL = { b2b_saas:'B2B SaaS', ecommerce:'Ecommerce', services:'Services', marketplace:'Marketplace' };
const STAGE_LABEL = { pre_seed:'Pre-seed', seed:'Seed', series_a:'Series A', series_b:'Series B', growth:'Growth', mature:'Mature' };

const REFERENCES = [
  { id: 'gartner-2026-budget-share', figure: '7.8% of company revenue', statement: 'Marketing budgets averaged 7.8% of company revenue in 2026 (401 CMOs, mostly companies above $1B revenue).', source: 'Gartner, 2026 CMO Spend Survey', url: 'https://www.gartner.com/en/newsroom/press-releases/2026-05-11-gartner-2026-cmo-spend-survey-finds-cmos-allocate-15-point-3-percent-of-marketing-budgets-to-ai-but-only-30-percent-are-ready-to-scale-ai-capabilities' },
  { id: 'saas-capital-2026-marketing-median', figure: '8% of ARR', statement: 'Median marketing spend at private B2B SaaS companies is 8% of ARR (1,000+ companies).', source: 'SaaS Capital, 2026 Spending Benchmarks for Private B2B SaaS Companies', url: 'https://www.saas-capital.com/blog-posts/spending-benchmarks-for-private-b2b-saas-companies/' },
  { id: 'gartner-2026-paid-media-share', figure: '31.4% of marketing budget', statement: 'Paid media reached 31.4% of the average marketing budget in 2026.', source: 'Gartner, CMO Spend 2026', url: 'https://www.gartner.com/en/articles/cmo-spend' },
  { id: 'gartner-2026-martech-share', figure: '19.4% of marketing budget', statement: 'Martech accounted for 19.4% of the average marketing budget in 2026 (trade coverage of the Gartner survey).', source: 'Chief Marketer, reporting Gartner 2026 CMO Spend Survey', url: 'https://www.chiefmarketer.com/gartner-cmo-spend-survey-budgets-reflect-increase-in-consumption-based-martech-paid-media-spend/' }
];
const GARTNER_PCT = 7.8;

// AAJ default split of the marketing budget by function — an assumption to
// edit, not a benchmark.
const SPLIT = {
  b2b_saas:   { 'Demand gen (paid + events)':45, 'Content & SEO/GEO':25, 'Brand & PR':12, 'Product marketing':10, 'Tooling & ops':8 },
  ecommerce:  { 'Paid acquisition':55, 'Content & creative':18, 'Email/SMS & retention':12, 'Brand':8, 'Tooling & ops':7 },
  services:   { 'Demand gen (paid + referrals)':40, 'Content & SEO/GEO':28, 'Brand & PR':14, 'Sales enablement':10, 'Tooling & ops':8 },
  marketplace:{ 'Paid acquisition (both sides)':50, 'Content & SEO':20, 'Brand':14, 'Lifecycle/retention':9, 'Tooling & ops':7 }
};

function money(n){ return '$' + Math.round(n).toLocaleString(); }
function r1(n){ return Math.round(n * 10) / 10; }

function die(msg, hint){
  console.error('error: ' + msg + (hint ? '\n       ' + hint : '') + '\n\nRun --help for the schema, or --demo for a worked example.');
  process.exit(1);
}

const KNOWN = ['model','stage','annualRevenue','quarterlyBurn','fundingRaised','runwayMonths','growthTarget','pctOfRevenue','split'];

function validate(c){
  if (c === null || typeof c !== 'object' || Array.isArray(c)) die('config must be a JSON object.');
  const unknown = Object.keys(c).filter(k => !KNOWN.includes(k));
  if (unknown.length) die(`unrecognised field(s): ${unknown.join(', ')}.`, `valid fields: ${KNOWN.join(', ')}.`);
  const model = c.model || 'b2b_saas';
  if (!LABEL[model]) die(`unknown model "${model}".`, 'Use: b2b_saas, ecommerce, services, or marketplace.');
  const stage = c.stage || 'series_a';
  if (!STAGE_LABEL[stage]) die(`unknown stage "${stage}".`, 'Use: pre_seed, seed, series_a, series_b, growth, or mature.');
  if (c.growthTarget !== undefined && POSITION[c.growthTarget] === undefined) die(`unknown growthTarget "${c.growthTarget}".`, 'Use: conservative, balanced, or aggressive.');
  for (const k of ['annualRevenue','quarterlyBurn','fundingRaised','runwayMonths','pctOfRevenue']) {
    if (c[k] !== undefined && (typeof c[k] !== 'number' || !isFinite(c[k]) || c[k] < 0)) die(`"${k}" must be a non-negative number.`);
  }
  if (c.pctOfRevenue !== undefined && c.pctOfRevenue > 0 && c.pctOfRevenue < 1) die(`"pctOfRevenue" looks like a proportion (${c.pctOfRevenue}).`, `Pass ${Math.round(c.pctOfRevenue*100)} for ${Math.round(c.pctOfRevenue*100)}%.`);
  if (c.split !== undefined) {
    if (typeof c.split !== 'object' || Array.isArray(c.split) || !Object.keys(c.split).length) die('"split" must be an object of bucket: percent.');
    const vals = Object.values(c.split);
    if (vals.some(v => typeof v !== 'number' || v < 0)) die('"split" values must be non-negative numbers.');
    const sum = vals.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5) die(`"split" must sum to 100 (got ${r1(sum)}).`);
  }
  // Which base does this run need?
  const saasBand = model === 'b2b_saas' && c.pctOfRevenue === undefined ? SAAS_BANDS[stage] : null;
  const base = saasBand ? saasBand.base : 'annualRevenue';
  if (c[base] === undefined) {
    const why = base === 'quarterlyBurn' ? 'Pre-seed budgets are sized against burn, because revenue is not yet a meaningful base.'
              : base === 'fundingRaised' ? 'Seed budgets are sized against the round raised.'
              : 'This run sizes the budget as a share of revenue.';
    die(`missing "${base}".`, why);
  }
}

function run(c){
  const model = c.model || 'b2b_saas';
  const stage = c.stage || 'series_a';
  const pos = POSITION[c.growthTarget || 'balanced'];
  const out = [];
  let pct, lo = null, hi = null, basis, baseKey, baseLabel, periodLabel, basisNote;

  if (c.pctOfRevenue !== undefined) {
    pct = c.pctOfRevenue; baseKey = 'annualRevenue'; baseLabel = 'of revenue'; periodLabel = 'yr';
    basis = 'your own pctOfRevenue';
  } else if (model === 'b2b_saas') {
    const b = SAAS_BANDS[stage];
    lo = b.lo; hi = b.hi; pct = r1(lo + (hi - lo) * pos);
    baseKey = b.base; baseLabel = b.baseLabel;
    periodLabel = baseKey === 'quarterlyBurn' ? 'qtr' : baseKey === 'fundingRaised' ? 'round' : 'yr';
    basis = `AAJ stage band ${lo}–${hi}% ${b.baseLabel} (AAJ's own estimate from client work, not third-party research)`;
  } else {
    pct = GARTNER_PCT; baseKey = 'annualRevenue'; baseLabel = 'of revenue'; periodLabel = 'yr';
    basis = `Gartner 2026 cross-industry average (${GARTNER_PCT}% of revenue)`;
    basisNote = `No sourced stage band exists for ${LABEL[model].toLowerCase()} — this is a large-company average, not a target for your stage. Pass "pctOfRevenue" to plan at your own level.`;
  }

  const baseAmount = c[baseKey];
  const budget = baseAmount * pct / 100;
  let monthly = null;
  if (periodLabel === 'yr') monthly = budget / 12;
  else if (periodLabel === 'qtr') monthly = budget / 3;
  else if (c.runwayMonths) monthly = budget / c.runwayMonths;

  const split = c.split || SPLIT[model];
  const rows = Object.entries(split).map(([k, w]) => ({ bucket: k, pct: w, amount: budget * w / 100, monthly: monthly != null ? monthly * w / 100 : null }));

  const perWord = { yr: '/ yr', qtr: '/ quarter', round: 'over the round' }[periodLabel];
  out.push(`\nAAJ Marketing Budget Plan — ${LABEL[model]} · ${STAGE_LABEL[stage]}`);
  out.push('-'.repeat(62));
  out.push(`Planned spend:      ${pct}% ${baseLabel}${lo != null ? `  (band ${lo}–${hi}%, ${c.growthTarget || 'balanced'} → ${pos === 0 ? 'low end' : pos === 1 ? 'high end' : 'midpoint'})` : ''}`);
  out.push(`Basis:              ${basis}`);
  if (basisNote) out.push(`                    ${basisNote}`);
  const baseName = { annualRevenue: 'Annual revenue', quarterlyBurn: 'Quarterly burn', fundingRaised: 'Funding raised' }[baseKey];
  out.push(`${(baseName + ':').padEnd(20)}${money(baseAmount)}`);
  out.push(`Marketing budget:   ${money(budget)} ${perWord}${monthly != null ? `   ·   ${money(monthly)} / mo` : ''}`);
  if (periodLabel === 'round' && monthly == null) out.push('                    Pass "runwayMonths" to see it per month.');
  out.push('');
  out.push(`Allocation — ${c.split ? 'your split' : "AAJ default split (an assumption to edit, not a benchmark)"}`);
  out.push('-'.repeat(62));
  rows.forEach(r => out.push(`${r.bucket.padEnd(34)} ${String(r.pct + '%').padStart(4)}  ${money(r.amount).padStart(11)}${r.monthly != null ? '  ' + money(r.monthly).padStart(9) + '/mo' : ''}`));
  out.push('');
  out.push('Published reference points (compare, don\'t copy):');
  out.push(`• Gartner 2026: marketing budgets averaged 7.8% of company revenue — mostly companies above $1B revenue.`);
  out.push(`• SaaS Capital 2026: median private B2B SaaS marketing spend is 8% of ARR.`);
  out.push(`• Gartner 2026: paid media 31.4% and martech 19.4% of the average marketing budget.`);
  if (model === 'b2b_saas' && ['pre_seed','seed','series_a','series_b','growth'].includes(stage) && c.pctOfRevenue === undefined)
    out.push(`• Early-stage bands read high against those averages because a startup is buying growth and learning, not maintaining share (AAJ's read).`);
  out.push('');
  out.push('Notes:');
  out.push('• Runway caps any band. Pair with the unit-economics skill to confirm you can afford the implied CAC.');
  out.push('• The demand-gen / paid slice feeds the paid-media-budget-allocation skill for the channel split.');
  out.push('\n--- JSON ---');
  out.push(JSON.stringify({
    model, stage, pct, basis: c.pctOfRevenue !== undefined ? 'user' : model === 'b2b_saas' ? 'aaj-stage-band' : 'gartner-2026-average',
    band: lo != null ? { lo, hi, of: baseLabel, source: 'AAJ estimate from client engagements, 2023-2026 (not third-party research)' } : null,
    base: { field: baseKey, amount: baseAmount }, budget: Math.round(budget), period: periodLabel,
    monthlyBudget: monthly != null ? Math.round(monthly) : null,
    splitSource: c.split ? 'user' : 'aaj-default-assumption',
    allocation: rows.map(r => ({ bucket: r.bucket, pct: r.pct, amount: Math.round(r.amount), monthly: r.monthly != null ? Math.round(r.monthly) : null })),
    references: REFERENCES
  }, null, 2));
  return out.join('\n');
}

const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help.\n'+e.message); process.exit(1);} }
else { cfg = { model:'b2b_saas', stage:'series_a', annualRevenue:3000000, growthTarget:'balanced' }; console.log('(no config — demo: B2B SaaS, Series A, $3M ARR)'); }
validate(cfg);
console.log(run(cfg));
