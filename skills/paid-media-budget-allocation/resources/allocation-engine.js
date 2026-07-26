#!/usr/bin/env node
/*
 * AAJ Paid Media Budget Allocator — allocation engine
 * Part of the "paid-media-budget-allocation" Agent Skill.
 *
 * Splits a paid budget across channels so the cost of the NEXT customer is
 * roughly equal everywhere (marginal-CAC equalization under diminishing
 * returns). Same verified math as the AAJ Paid Media Budget Allocator tool.
 *
 * USAGE
 *   node allocation-engine.js                 # demo: B2B SaaS, $30k budget
 *   node allocation-engine.js '<json-config>' # custom (schema below)
 *   node allocation-engine.js --help
 *
 * CONFIG (JSON)
 *   {
 *     "model": "saas",                 // saas | ecom | local | market (picks default channels + benchmarks)
 *     "mode": "budget",                // budget | cac | goal
 *     "budget": 30000,                 // mode=budget
 *     "cacTarget": 700,                // mode=cac
 *     "customerGoal": 50,              // mode=goal
 *     "diminishingReturns": "moderate",// gentle | moderate | aggressive
 *     "ltv": 15000, "acv": 6000, "margin": 80,   // optional overrides of model defaults
 *     "channels": [                    // optional: override defaults or add channels
 *       { "key": "google",   "cpc": 6,  "cvr": 8,  "l2c": 12, "cap": 30000 },
 *       { "key": "capterra", "model": "cpl", "cpl": 90, "l2c": 22, "cap": 8000 }
 *     ]
 *   }
 *
 * Channel model:
 *   funnel (default): baseCAC = (cpc / (cvr/100)) / (l2c/100)
 *   cpl  (Capterra/G2, pay-per-lead): baseCAC = cpl / (l2c/100)
 *
 * Output is a per-channel table plus a machine-readable JSON block.
 */

'use strict';

const DR_MAP = { gentle: 0.4, moderate: 0.8, aggressive: 1.5 };

const LABEL = {
  google: 'Google', microsoft: 'Microsoft', linkedin: 'LinkedIn', meta: 'Meta',
  youtube: 'YouTube', tiktok: 'TikTok', amazon: 'Amazon', capterra: 'Capterra/G2',
  reddit: 'Reddit', quora: 'Quora', x: 'X', pinterest: 'Pinterest',
  snapchat: 'Snapchat', nextdoor: 'Nextdoor', yelp: 'Yelp', applesearch: 'Apple Search'
};

// Benchmark starting points by business model. Replace with the client's own
// data whenever available — these are calibration, not truth.
const PRESETS = {
  saas: {
    label: 'B2B SaaS', acv: 6000, margin: 80, ltv: 15000,
    defaults: ['google', 'linkedin', 'microsoft', 'meta', 'youtube'],
    ch: {
      google:    { cpc: 6,   cvr: 8,  l2c: 12, cap: 30000 },
      linkedin:  { cpc: 11,  cvr: 11, l2c: 20, cap: 15000 },
      microsoft: { cpc: 4.5, cvr: 8,  l2c: 12, cap: 12000 },
      meta:      { cpc: 2.5, cvr: 5,  l2c: 9,  cap: 45000 },
      youtube:   { cpc: 3,   cvr: 4,  l2c: 8,  cap: 25000 },
      capterra:  { model: 'cpl', cpl: 90, l2c: 22, cap: 8000 },
      reddit:    { cpc: 1.8, cvr: 4,  l2c: 8,  cap: 10000 },
      quora:     { cpc: 2.2, cvr: 5,  l2c: 10, cap: 6000 },
      x:         { cpc: 1.5, cvr: 3,  l2c: 6,  cap: 12000 }
    }
  },
  ecom: {
    label: 'Ecommerce', acv: 80, margin: 60, ltv: 160,
    defaults: ['meta', 'google', 'tiktok', 'amazon', 'microsoft'],
    ch: {
      meta:      { cpc: 0.9, cvr: 6,   l2c: 30, cap: 120000 },
      google:    { cpc: 1.0, cvr: 8,   l2c: 35, cap: 60000 },
      tiktok:    { cpc: 0.8, cvr: 5,   l2c: 25, cap: 80000 },
      amazon:    { cpc: 0.9, cvr: 12,  l2c: 40, cap: 50000 },
      microsoft: { cpc: 0.7, cvr: 7,   l2c: 32, cap: 30000 },
      pinterest: { cpc: 0.6, cvr: 4,   l2c: 20, cap: 40000 },
      youtube:   { cpc: 0.5, cvr: 3,   l2c: 18, cap: 50000 },
      snapchat:  { cpc: 0.5, cvr: 3.5, l2c: 16, cap: 30000 }
    }
  },
  local: {
    label: 'Local / services', acv: 800, margin: 50, ltv: 2000,
    defaults: ['google', 'meta', 'microsoft', 'youtube', 'tiktok'],
    ch: {
      google:    { cpc: 4,   cvr: 10, l2c: 25, cap: 20000 },
      meta:      { cpc: 1.5, cvr: 7,  l2c: 15, cap: 25000 },
      microsoft: { cpc: 3,   cvr: 9,  l2c: 24, cap: 12000 },
      youtube:   { cpc: 1.2, cvr: 4,  l2c: 12, cap: 15000 },
      tiktok:    { cpc: 1.0, cvr: 5,  l2c: 12, cap: 18000 },
      nextdoor:  { cpc: 1.8, cvr: 6,  l2c: 18, cap: 8000 },
      yelp:      { cpc: 5,   cvr: 12, l2c: 22, cap: 10000 },
      linkedin:  { cpc: 8,   cvr: 4,  l2c: 10, cap: 4000 }
    }
  },
  market: {
    label: 'Marketplace', acv: 120, margin: 70, ltv: 360,
    defaults: ['google', 'meta', 'tiktok', 'microsoft', 'youtube'],
    ch: {
      google:     { cpc: 1.5, cvr: 6,   l2c: 25, cap: 50000 },
      meta:       { cpc: 1.0, cvr: 5,   l2c: 20, cap: 80000 },
      tiktok:     { cpc: 0.8, cvr: 4.5, l2c: 18, cap: 80000 },
      microsoft:  { cpc: 1.1, cvr: 6,   l2c: 23, cap: 30000 },
      youtube:    { cpc: 0.6, cvr: 3.5, l2c: 15, cap: 50000 },
      reddit:     { cpc: 0.9, cvr: 4,   l2c: 14, cap: 20000 },
      applesearch:{ cpc: 2.0, cvr: 50,  l2c: 8,  cap: 25000 },
      pinterest:  { cpc: 0.7, cvr: 4,   l2c: 16, cap: 40000 }
    }
  }
};

// ---------------------------------------------------------------------------
// Engine (verified — do not "optimize" the math)
// ---------------------------------------------------------------------------
function econ(c) {
  const cpl = c.model === 'cpl' ? c.cpl : c.cpc / (c.cvr / 100);
  return Object.assign({}, c, { baseCAC: cpl / (c.l2c / 100), cplValue: cpl });
}
const custFromSpend  = (S, b, cap, DR) => (S <= 0 ? 0 : (cap / (b * DR)) * Math.log(1 + (DR * S) / cap));
const spendForMarginal = (lam, b, cap, DR) => (lam <= b ? 0 : (cap / DR) * (lam / b - 1));
const marginalCAC    = (S, b, cap, DR) => b * (1 + (DR * S) / cap);

function allocateBudget(chs, B, DR) {
  if (!chs.length || B <= 0) return chs.map(() => 0);
  let lo = Math.min(...chs.map(c => c.baseCAC));
  let hi = Math.max(...chs.map(c => c.baseCAC)) * 60;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const tot = chs.reduce((s, c) => s + spendForMarginal(mid, c.baseCAC, c.cap, DR), 0);
    if (tot > B) hi = mid; else lo = mid;
  }
  const lam = (lo + hi) / 2;
  return chs.map(c => spendForMarginal(lam, c.baseCAC, c.cap, DR));
}
const allocateCAC = (chs, T, DR) => chs.map(c => spendForMarginal(T, c.baseCAC, c.cap, DR));

function allocateGoal(chs, G, DR) {
  if (!chs.length || G <= 0) return chs.map(() => 0);
  let lo = Math.min(...chs.map(c => c.baseCAC));
  let hi = Math.max(...chs.map(c => c.baseCAC)) * 90;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const cust = chs.reduce((s, c) => s + custFromSpend(spendForMarginal(mid, c.baseCAC, c.cap, DR), c.baseCAC, c.cap, DR), 0);
    if (cust > G) hi = mid; else lo = mid;
  }
  const lam = (lo + hi) / 2;
  return chs.map(c => spendForMarginal(lam, c.baseCAC, c.cap, DR));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function buildChannels(cfg) {
  const preset = PRESETS[cfg.model] || PRESETS.saas;
  const map = {};
  // Seed defaults from the preset.
  preset.defaults.forEach(k => { map[k] = Object.assign({ key: k, model: 'funnel' }, preset.ch[k]); });
  // Apply overrides / additions from cfg.channels.
  (cfg.channels || []).forEach(o => {
    const base = preset.ch[o.key] || {};
    map[o.key] = Object.assign({ key: o.key, model: 'funnel' }, base, o);
  });
  return Object.keys(map).map(k => econ(map[k]));
}

function money(n) { return '$' + Math.round(n).toLocaleString(); }
function one(n) { return (Math.round(n * 10) / 10).toLocaleString(); }

function run(cfg) {
  const preset = PRESETS[cfg.model] || PRESETS.saas;
  const DR = DR_MAP[cfg.diminishingReturns || 'moderate'];
  const ltv = cfg.ltv != null ? cfg.ltv : preset.ltv;
  const acv = cfg.acv != null ? cfg.acv : preset.acv;
  const margin = cfg.margin != null ? cfg.margin : preset.margin;
  const mode = cfg.mode || 'budget';
  const chs = buildChannels(cfg);

  let spends, note = '';
  if (mode === 'cac') {
    spends = allocateCAC(chs, cfg.cacTarget, DR);
    if (spends.reduce((a, b) => a + b, 0) < 1) {
      note = `CAC target ${money(cfg.cacTarget)} is below every channel's base CAC (cheapest is ${money(Math.min(...chs.map(c => c.baseCAC)))}). Raise the target or improve the funnels.`;
    }
  } else if (mode === 'goal') {
    spends = allocateGoal(chs, cfg.customerGoal, DR);
  } else {
    spends = allocateBudget(chs, cfg.budget, DR);
  }

  let totSpend = 0, totCust = 0;
  const rows = chs.map((c, i) => {
    const spend = spends[i];
    const customers = custFromSpend(spend, c.baseCAC, c.cap, DR);
    const leads = c.model === 'cpl' ? (c.cpl > 0 ? spend / c.cpl : 0) : (spend / c.cpc) * (c.cvr / 100);
    totSpend += spend; totCust += customers;
    return {
      channel: LABEL[c.key] || c.key,
      spend: Math.round(spend),
      customers: Math.round(customers * 10) / 10,
      cac: customers > 0 ? Math.round(spend / customers) : null,
      marginalCAC: Math.round(marginalCAC(spend, c.baseCAC, c.cap, DR)),
      baseCAC: Math.round(c.baseCAC),
      leads: Math.round(leads)
    };
  });
  const blendedCAC = totCust > 0 ? totSpend / totCust : 0;
  const ltvcac = blendedCAC > 0 ? ltv / blendedCAC : 0;
  const roas = totSpend > 0 ? (totCust * acv) / totSpend : 0;
  const payback = (acv * margin / 100 / 12) > 0 ? blendedCAC / (acv * margin / 100 / 12) : 0;

  // ---- print ----
  const out = [];
  out.push('');
  out.push(`AAJ Paid Media Budget Allocator — ${preset.label}`);
  out.push(`Mode: ${mode}  ·  Diminishing returns: ${cfg.diminishingReturns || 'moderate'} (${DR})`);
  if (note) out.push('\n⚠ ' + note + '\n');
  out.push('');
  const pad = (s, n) => String(s).padEnd(n);
  const padl = (s, n) => String(s).padStart(n);
  out.push(pad('Channel', 14) + padl('Spend', 10) + padl('%', 6) + padl('Customers', 11) + padl('CAC', 9) + padl('Marg.CAC', 10) + padl('BaseCAC', 9));
  out.push('-'.repeat(69));
  rows.forEach(r => {
    const pc = totSpend > 0 ? Math.round(100 * r.spend / totSpend) : 0;
    out.push(pad(r.channel, 14) + padl(money(r.spend), 10) + padl(pc + '%', 6) + padl(one(r.customers), 11) + padl(r.cac != null ? money(r.cac) : '—', 9) + padl(money(r.marginalCAC), 10) + padl(money(r.baseCAC), 9));
  });
  out.push('-'.repeat(69));
  out.push(pad('BLENDED', 14) + padl(money(totSpend), 10) + padl('100%', 6) + padl(one(totCust), 11) + padl(money(blendedCAC), 9));
  out.push('');
  out.push(`LTV:CAC ${one(ltvcac)}:1   ·   ROAS ${one(roas)}x   ·   CAC payback ${one(payback)} mo`);
  out.push(ltvcac >= 3 ? '✓ LTV:CAC is at or above the 3:1 floor.' : '▼ LTV:CAC is below the 3:1 floor — lift LTV or cut CAC before scaling.');
  const thin = rows.filter(r => r.spend > 0 && r.spend < 1500);
  if (thin.length >= 2) out.push(`⚠ ${thin.length} channels are funded under ~$1,500/mo (${thin.map(t => t.channel).join(', ')}) — below most platforms' learning minimums. Consider consolidating.`);
  const zero = rows.filter(r => r.spend === 0);
  if (zero.length) out.push(`• Excluded at this budget (base CAC too high to compete): ${zero.map(z => z.channel).join(', ')}.`);
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify({
    model: cfg.model || 'saas', mode, diminishingReturns: cfg.diminishingReturns || 'moderate',
    totalSpend: Math.round(totSpend), customers: Math.round(totCust * 10) / 10,
    blendedCAC: Math.round(blendedCAC), ltvCac: Math.round(ltvcac * 100) / 100,
    roas: Math.round(roas * 100) / 100, cacPaybackMonths: Math.round(payback * 10) / 10,
    allocation: rows
  }, null, 2));
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h') {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*/, ''));
  process.exit(0);
}
let cfg;
if (arg) {
  try { cfg = JSON.parse(arg); }
  catch (e) { console.error('Invalid JSON config. Run with --help for the schema.\n' + e.message); process.exit(1); }
} else {
  // Demo: B2B SaaS, $30k budget, moderate diminishing returns.
  cfg = { model: 'saas', mode: 'budget', budget: 30000, diminishingReturns: 'moderate' };
  console.log('(no config supplied — running demo: B2B SaaS, $30,000 budget)');
}
console.log(run(cfg));
