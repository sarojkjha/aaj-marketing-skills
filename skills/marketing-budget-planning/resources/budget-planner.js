#!/usr/bin/env node
/*
 * AAJ Marketing Budget Planner — engine
 * Part of the "marketing-budget-planning" Agent Skill.
 *
 * Recommends a total marketing budget as a % of revenue, by company stage and
 * business model, then splits it across brand / demand-gen / content / tooling.
 * Benchmarks reflect common 2025-26 guidance (Gartner CMO Spend, SaaS Capital,
 * OpenView/peer surveys). Calibrate to the company's growth target and runway.
 *
 * USAGE
 *   node budget-planner.js                 # demo
 *   node budget-planner.js '<json>'        # custom
 *   node budget-planner.js --help
 *
 * CONFIG (JSON)
 *   { "model":"b2b_saas",        // b2b_saas | ecommerce | services | marketplace
 *     "stage":"series_a",        // pre_seed | seed | series_a | series_b | growth | mature
 *     "annualRevenue": 3000000,  // ARR or annual revenue ($)
 *     "growthTarget":"aggressive" } // conservative | balanced | aggressive (optional)
 */

'use strict';

// % of revenue by model × stage (midpoint guidance). Earlier stage & faster
// growth → higher %. These are starting points, not rules.
const PCT = {
  b2b_saas:   { pre_seed:50, seed:40, series_a:30, series_b:22, growth:16, mature:11 },
  ecommerce:  { pre_seed:35, seed:28, series_a:22, series_b:18, growth:14, mature:10 },
  services:   { pre_seed:25, seed:20, series_a:16, series_b:13, growth:10, mature:7 },
  marketplace:{ pre_seed:45, seed:35, series_a:27, series_b:20, growth:15, mature:11 }
};
const GROWTH_MULT = { conservative:0.8, balanced:1.0, aggressive:1.25 };
const LABEL = { b2b_saas:'B2B SaaS', ecommerce:'Ecommerce', services:'Services', marketplace:'Marketplace' };
const STAGE_LABEL = { pre_seed:'Pre-seed', seed:'Seed', series_a:'Series A', series_b:'Series B', growth:'Growth', mature:'Mature' };

// Split of the marketing budget by allocation bucket, by model.
const SPLIT = {
  b2b_saas:   { 'Demand gen (paid + events)':45, 'Content & SEO/GEO':25, 'Brand & PR':12, 'Product marketing':10, 'Tooling & ops':8 },
  ecommerce:  { 'Paid acquisition':55, 'Content & creative':18, 'Email/SMS & retention':12, 'Brand':8, 'Tooling & ops':7 },
  services:   { 'Demand gen (paid + referrals)':40, 'Content & SEO/GEO':28, 'Brand & PR':14, 'Sales enablement':10, 'Tooling & ops':8 },
  marketplace:{ 'Paid acquisition (both sides)':50, 'Content & SEO':20, 'Brand':14, 'Lifecycle/retention':9, 'Tooling & ops':7 }
};

function money(n){ return '$' + Math.round(n).toLocaleString(); }

function run(c){
  const model = PCT[c.model] ? c.model : 'b2b_saas';
  const stage = PCT[model][c.stage] != null ? c.stage : 'series_a';
  const mult = GROWTH_MULT[c.growthTarget] || 1.0;
  const basePct = PCT[model][stage];
  const pct = Math.round(basePct * mult * 10) / 10;
  const annual = c.annualRevenue || 0;
  const annualBudget = annual * pct / 100;
  const monthly = annualBudget / 12;

  const split = SPLIT[model];
  const rows = Object.entries(split).map(([k, w]) => ({ bucket: k, pct: w, annual: annualBudget * w / 100, monthly: monthly * w / 100 }));

  const out = [];
  out.push(`\nAAJ Marketing Budget Plan — ${LABEL[model]} · ${STAGE_LABEL[stage]}`);
  out.push('-'.repeat(58));
  out.push(`Recommended spend:  ${pct}% of revenue${mult!==1?` (${c.growthTarget} growth)`:''}`);
  out.push(`Annual revenue:     ${money(annual)}`);
  out.push(`Marketing budget:   ${money(annualBudget)} / yr   ·   ${money(monthly)} / mo`);
  out.push('');
  out.push('Allocation' + ' '.repeat(28) + '   /yr        /mo');
  out.push('-'.repeat(58));
  rows.forEach(r => out.push(`${r.bucket.padEnd(34)} ${String(r.pct+'%').padStart(4)}  ${money(r.annual).padStart(11)}  ${money(r.monthly).padStart(9)}`));
  out.push('');
  out.push('Notes:');
  out.push(`• Earlier stage and faster growth justify a higher %; cash runway caps it. Pair with the unit-economics skill to confirm you can afford the implied CAC.`);
  out.push(`• The demand-gen / paid slice feeds directly into the paid-media-budget-allocation skill for the channel split.`);
  out.push('\n--- JSON ---');
  out.push(JSON.stringify({ model, stage, pctOfRevenue: pct, annualRevenue: annual,
    annualBudget: Math.round(annualBudget), monthlyBudget: Math.round(monthly),
    allocation: rows.map(r => ({ bucket: r.bucket, pct: r.pct, annual: Math.round(r.annual), monthly: Math.round(r.monthly) })) }, null, 2));
  return out.join('\n');
}

const arg = process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help.\n'+e.message); process.exit(1);} }
else { cfg = { model:'b2b_saas', stage:'series_a', annualRevenue:3000000, growthTarget:'balanced' }; console.log('(no config — demo: B2B SaaS, Series A, $3M ARR)'); }
console.log(run(cfg));
