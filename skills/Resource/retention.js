#!/usr/bin/env node
/*
 * AAJ Churn & Retention Calculator — engine
 * Part of the "lifecycle-and-retention" Agent Skill.
 *
 * For one period of a subscription business, computes gross/net revenue
 * retention (GRR / NRR), revenue & logo churn, the SaaS quick ratio, average
 * customer lifetime, and the LTV impact of a churn improvement.
 *
 * USAGE
 *   node retention.js                  # demo
 *   node retention.js '<json-config>'  # custom
 *   node retention.js --help
 *
 * CONFIG (JSON) — one period of movement on the EXISTING base (+ new business):
 *   { "period":"monthly",        // "monthly" | "annual" (labels + lifetime unit)
 *     "startMRR":100000,         // recurring revenue at start of period (required)
 *     "newMRR":12000,            // new-business added this period (quick ratio only)
 *     "expansionMRR":8000,       // upgrades / upsell from existing customers
 *     "contractionMRR":3000,     // downgrades from existing customers (positive)
 *     "churnedMRR":6000,         // recurring revenue lost to cancellations (positive)
 *     "startCustomers":200,      // customers at start (optional — enables logo churn)
 *     "churnedCustomers":9,      // customers lost this period (optional)
 *     "targetChurnPct":null }    // optional what-if churn % for the LTV-impact line
 *
 * Notes: NRR and GRR are measured on the EXISTING base only — newMRR is excluded
 * and used solely for the quick ratio. Amounts may be ARR instead of MRR; set
 * period:"annual" so lifetime is expressed correctly.
 *
 * Benchmarks used in the verdict (thresholds, not medians):
 *   NRR >100% grows the base without new logos; ~120%+ is best-in-class (Bessemer
 *   cloud benchmarks). GRR 90%+ is strong. Quick ratio >=4 is efficient growth
 *   (SaaS Quick Ratio, Social Capital). Verify against current benchmarks for your
 *   segment (SMB retention typically runs lower than enterprise).
 */
'use strict';

function pct(n){ return (Math.round(n*10)/10).toLocaleString() + '%'; }
function one(n){ return (Math.round(n*10)/10).toLocaleString(); }
function money(n){ return '$' + Math.round(n).toLocaleString(); }

function compute(c){
  const start = c.startMRR;
  const exp = c.expansionMRR || 0;
  const contr = c.contractionMRR || 0;
  const churned = c.churnedMRR || 0;
  const neu = c.newMRR || 0;
  const period = c.period === 'annual' ? 'annual' : 'monthly';

  const grossRevChurn = start > 0 ? (contr + churned) / start * 100 : null;
  const netRevChurn   = start > 0 ? (contr + churned - exp) / start * 100 : null;
  const grr = grossRevChurn != null ? 100 - grossRevChurn : null;
  const nrr = netRevChurn   != null ? 100 - netRevChurn   : null;
  const endBase = start + exp - contr - churned;

  const denom = contr + churned;
  const quickRatio = denom > 0 ? (neu + exp) / denom : null;

  let logoChurn = null, logoRet = null;
  if (c.startCustomers > 0 && c.churnedCustomers != null){
    logoChurn = c.churnedCustomers / c.startCustomers * 100;
    logoRet = 100 - logoChurn;
  }

  // Average lifetime from the churn we trust most: logo churn if supplied, else
  // gross revenue churn. lifetime(periods) = 1 / churn.
  const churnForLife = (logoChurn != null ? logoChurn : grossRevChurn);
  let lifetimeMonths = null;
  if (churnForLife != null && churnForLife > 0){
    const perPeriod = 1 / (churnForLife / 100);
    lifetimeMonths = period === 'annual' ? perPeriod * 12 : perPeriod;
  }

  // LTV sensitivity: LTV is proportional to 1/churn. Compare current churn to a
  // target (given, else a 1-point or 50%-relative improvement) on the same basis.
  let impact = null;
  if (churnForLife != null && churnForLife > 0){
    const cur = churnForLife;
    const target = (c.targetChurnPct != null) ? c.targetChurnPct : Math.max(cur - 1, cur * 0.5);
    if (target > 0 && target < cur){
      const per = period === 'annual' ? 12 : 1;
      impact = {
        fromPct: cur, toPct: target,
        ltvLiftPct: (cur / target - 1) * 100,
        newLifetimeMonths: (1 / (target / 100)) * per,
        basis: logoChurn != null ? 'logo churn' : 'revenue churn'
      };
    }
  }

  return { period, grossRevChurn, netRevChurn, grr, nrr, endBase, quickRatio,
           logoChurn, logoRet, lifetimeMonths, impact, start };
}

function verdict(r){
  const L = [];
  const unit = r.period === 'annual' ? '/yr' : '/mo';
  if (r.nrr != null){
    if (r.nrr >= 120) L.push(`\u2713 NRR ${pct(r.nrr)} \u2014 best-in-class; the base compounds without new logos.`);
    else if (r.nrr >= 110) L.push(`\u2713 NRR ${pct(r.nrr)} \u2014 strong; expansion clearly outpaces churn.`);
    else if (r.nrr >= 100) L.push(`\u2713 NRR ${pct(r.nrr)} \u2014 healthy; the base grows on its own.`);
    else if (r.nrr >= 90)  L.push(`\u25bc NRR ${pct(r.nrr)} \u2014 under 100%: the base is shrinking; expansion isn't covering churn.`);
    else L.push(`\u2717 NRR ${pct(r.nrr)} \u2014 the base is leaking; fix retention before scaling acquisition.`);
  }
  if (r.grr != null){
    if (r.grr >= 90) L.push(`\u2713 GRR ${pct(r.grr)} \u2014 strong retention of committed revenue.`);
    else if (r.grr >= 80) L.push(`\u2022 GRR ${pct(r.grr)} \u2014 typical; room to tighten churn and downgrades.`);
    else L.push(`\u25bc GRR ${pct(r.grr)} \u2014 leaky: over a fifth of revenue is lost each period before any expansion.`);
  }
  if (r.quickRatio != null){
    if (r.quickRatio >= 4) L.push(`\u2713 Quick ratio ${one(r.quickRatio)} \u2014 efficient growth (\u22654).`);
    else if (r.quickRatio >= 1) L.push(`\u2022 Quick ratio ${one(r.quickRatio)} \u2014 growing, but churn eats much of new + expansion (aim \u22654).`);
    else L.push(`\u2717 Quick ratio ${one(r.quickRatio)} \u2014 losing more than you add; the base is contracting.`);
  }
  if (r.logoChurn != null){
    L.push(`\u2022 Logo churn ${pct(r.logoChurn)}${unit} \u2192 ~${one(r.lifetimeMonths)} mo average lifetime.`);
  } else if (r.lifetimeMonths != null){
    L.push(`\u2022 ~${one(r.lifetimeMonths)} mo average lifetime at current revenue churn.`);
  }
  if (r.impact){
    L.push(`\u2197 Cutting ${r.impact.basis} ${pct(r.impact.fromPct)} \u2192 ${pct(r.impact.toPct)} lifts LTV ~${pct(r.impact.ltvLiftPct)} (lifetime \u2192 ~${one(r.impact.newLifetimeMonths)} mo). Retention is the biggest LTV lever.`);
  }
  return L;
}

function render(c){
  const r = compute(c);
  const per = r.period === 'annual' ? '/yr' : '/mo';
  const out = [];
  out.push('');
  out.push(`AAJ Churn & Retention \u2014 ${r.period} view`);
  out.push('-'.repeat(56));
  out.push(`Net revenue retention (NRR)   ${r.nrr!=null?pct(r.nrr):'\u2014'}`);
  out.push(`Gross revenue retention (GRR) ${r.grr!=null?pct(r.grr):'\u2014'}`);
  out.push(`Gross revenue churn           ${r.grossRevChurn!=null?pct(r.grossRevChurn)+per:'\u2014'}`);
  out.push(`Net revenue churn             ${r.netRevChurn!=null?pct(r.netRevChurn)+per:'\u2014'}`);
  out.push(`Logo churn                    ${r.logoChurn!=null?pct(r.logoChurn)+per:'\u2014'}`);
  out.push(`Quick ratio                   ${r.quickRatio!=null?one(r.quickRatio):'\u2014'}`);
  out.push(`Avg customer lifetime         ${r.lifetimeMonths!=null?one(r.lifetimeMonths)+' mo':'\u2014'}`);
  out.push(`Retained base MRR (end)       ${money(r.endBase)}`);
  out.push('');
  verdict(r).forEach(l => out.push(l));
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify({
    period: r.period,
    nrrPct: r.nrr!=null?Math.round(r.nrr*10)/10:null,
    grrPct: r.grr!=null?Math.round(r.grr*10)/10:null,
    grossRevChurnPct: r.grossRevChurn!=null?Math.round(r.grossRevChurn*10)/10:null,
    netRevChurnPct: r.netRevChurn!=null?Math.round(r.netRevChurn*10)/10:null,
    logoChurnPct: r.logoChurn!=null?Math.round(r.logoChurn*10)/10:null,
    quickRatio: r.quickRatio!=null?Math.round(r.quickRatio*100)/100:null,
    avgLifetimeMonths: r.lifetimeMonths!=null?Math.round(r.lifetimeMonths*10)/10:null,
    retainedBaseMRR: Math.round(r.endBase)
  }, null, 2));
  return out.join('\n');
}

const arg = process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help for the schema.\n'+e.message); process.exit(1); } }
else { cfg = { period:'monthly', startMRR:100000, newMRR:12000, expansionMRR:8000, contractionMRR:3000, churnedMRR:6000, startCustomers:200, churnedCustomers:9 };
  console.log('(no config \u2014 demo: $100k start MRR; +$12k new, +$8k expansion, \u2212$3k contraction, \u2212$6k churned; 200 customers, 9 lost)'); }
console.log(render(cfg));

module.exports = { compute, verdict };
