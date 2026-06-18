#!/usr/bin/env node
/*
 * AAJ Unit Economics Calculator — engine
 * Part of the "unit-economics" Agent Skill.
 *
 * Computes LTV, LTV:CAC, CAC payback, and a verdict against healthy benchmarks
 * for subscription, ecommerce, and services/contract models.
 *
 * USAGE
 *   node unit-economics.js                  # demo (subscription)
 *   node unit-economics.js '<json-config>'  # custom
 *   node unit-economics.js --help
 *
 * CONFIG (JSON) — provide the fields for your model:
 *   Subscription:
 *     { "model":"subscription", "arpaMonthly":500, "grossMargin":80,
 *       "churnMonthly":3, "cac":3000 }
 *     (alt: "lifetimeMonths":33 instead of churnMonthly; "cac" can be replaced
 *      by "adSpend"+"customers" to derive blended CAC)
 *   Ecommerce:
 *     { "model":"ecommerce", "aov":80, "grossMargin":60,
 *       "ordersPerYear":3, "retentionYears":2, "cac":40 }
 *   Services / contract:
 *     { "model":"services", "acv":12000, "grossMargin":55,
 *       "retentionYears":3, "cac":4000 }
 */

'use strict';

function money(n){ return '$' + Math.round(n).toLocaleString(); }
function one(n){ return (Math.round(n*10)/10).toLocaleString(); }

function deriveCAC(c){
  if (c.cac != null) return c.cac;
  if (c.adSpend != null && c.customers) return c.adSpend / c.customers;
  return null;
}

function compute(c){
  const gm = (c.grossMargin != null ? c.grossMargin : 100) / 100;
  const cac = deriveCAC(c);
  let ltv, monthlyGP, lifetimeLabel;

  if (c.model === 'ecommerce') {
    const freq = c.ordersPerYear != null ? c.ordersPerYear : 1;
    const years = c.retentionYears != null ? c.retentionYears : 1;
    ltv = c.aov * gm * freq * years;
    monthlyGP = (c.aov * gm * freq) / 12;            // gross profit per month
    lifetimeLabel = `${one(freq)} orders/yr × ${one(years)} yr`;
  } else if (c.model === 'services') {
    const years = c.retentionYears != null ? c.retentionYears : 1;
    ltv = c.acv * gm * years;
    monthlyGP = (c.acv * gm) / 12;
    lifetimeLabel = `${one(years)} yr retention`;
  } else { // subscription
    const churn = c.churnMonthly != null ? c.churnMonthly / 100 : (c.lifetimeMonths ? 1 / c.lifetimeMonths : null);
    const lifeMonths = c.lifetimeMonths != null ? c.lifetimeMonths : (churn ? 1 / churn : null);
    monthlyGP = c.arpaMonthly * gm;
    ltv = churn ? monthlyGP / churn : monthlyGP * (lifeMonths || 0);
    lifetimeLabel = churn ? `${(churn*100).toFixed(1)}% monthly churn (~${one(lifeMonths)} mo lifetime)` : `${one(lifeMonths)} mo lifetime`;
  }

  const ltvCac = cac ? ltv / cac : null;
  const paybackMonths = (cac && monthlyGP > 0) ? cac / monthlyGP : null;
  return { ltv, cac, ltvCac, paybackMonths, monthlyGP, lifetimeLabel, gm };
}

function verdict(r, model){
  const lines = [];
  if (r.ltvCac == null) { lines.push('• No CAC supplied — provide cac, or adSpend + customers, to assess efficiency.'); return lines; }
  if (r.ltvCac >= 3) lines.push(`✓ LTV:CAC ${one(r.ltvCac)}:1 is at or above the 3:1 floor.`);
  else if (r.ltvCac >= 1) lines.push(`▼ LTV:CAC ${one(r.ltvCac)}:1 is below the 3:1 floor — acquisition is inefficient; lift LTV (retention, margin, ARPA) or cut CAC before scaling.`);
  else lines.push(`✗ LTV:CAC ${one(r.ltvCac)}:1 is below 1:1 — you lose money on every customer. Fix unit economics before any spend increase.`);
  if (r.ltvCac >= 5) lines.push(`• A ${one(r.ltvCac)}:1 ratio often signals UNDER-investment — if demand exists, you can likely spend more to grow faster.`);

  const paybackBar = model === 'ecommerce' ? 6 : 12;
  if (r.paybackMonths != null){
    if (r.paybackMonths <= paybackBar) lines.push(`✓ CAC payback ${one(r.paybackMonths)} mo is within the ~${paybackBar}-month guideline for ${model}.`);
    else lines.push(`▼ CAC payback ${one(r.paybackMonths)} mo exceeds the ~${paybackBar}-month guideline — cash is tied up longer; watch burn.`);
  }
  return lines;
}

function render(c){
  const r = compute(c);
  const out = [];
  out.push('');
  out.push(`AAJ Unit Economics — ${c.model || 'subscription'}`);
  out.push('-'.repeat(54));
  out.push(`Gross-margin LTV        ${money(r.ltv)}   (${r.lifetimeLabel})`);
  out.push(`Monthly gross profit    ${money(r.monthlyGP)}/customer`);
  out.push(`CAC                     ${r.cac != null ? money(r.cac) : '—'}`);
  out.push(`LTV : CAC               ${r.ltvCac != null ? one(r.ltvCac)+':1' : '—'}`);
  out.push(`CAC payback             ${r.paybackMonths != null ? one(r.paybackMonths)+' mo' : '—'}`);
  out.push('');
  verdict(r, c.model || 'subscription').forEach(l => out.push(l));
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify({
    model: c.model || 'subscription',
    ltv: Math.round(r.ltv), cac: r.cac != null ? Math.round(r.cac) : null,
    ltvCac: r.ltvCac != null ? Math.round(r.ltvCac*100)/100 : null,
    cacPaybackMonths: r.paybackMonths != null ? Math.round(r.paybackMonths*10)/10 : null,
    monthlyGrossProfit: Math.round(r.monthlyGP)
  }, null, 2));
  return out.join('\n');
}

const arg = process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help for the schema.\n'+e.message); process.exit(1);} }
else { cfg = { model:'subscription', arpaMonthly:500, grossMargin:80, churnMonthly:3, cac:3000 }; console.log('(no config — demo: subscription, $500 ARPA, 80% margin, 3% monthly churn, $3,000 CAC)'); }
console.log(render(cfg));
