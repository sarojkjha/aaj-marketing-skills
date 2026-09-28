#!/usr/bin/env node
/*
 * AAJ Unit Economics Calculator — engine
 * Part of the "unit-economics" Agent Skill.
 *
 * Computes LTV, LTV:CAC, CAC payback, and a verdict against named reference
 * points for subscription, ecommerce, and services/contract models:
 *   LTV:CAC above 3:1 and CAC payback within 12 months — David Skok,
 *     "SaaS Metrics 2.0" (forentrepreneurs.com/saas-metrics-2/). SaaS guidance.
 *   CAC payback under 12 / 18 / 24 months for SMB / mid-market / enterprise —
 *     Bessemer Venture Partners, "Scaling to $100 Million" (2021).
 * There is no sourced payback guideline here for ecommerce or services, so the
 * engine compares those to your own paybackTargetMonths, if you give one.
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
 *   Optional, any model:
 *     "paybackTargetMonths": 9      your own payback bar (overrides the default)
 *     "segment": "smb"              subscription only: smb | midmarket | enterprise
 *                                   (uses Bessemer's 12 / 18 / 24-month bar)
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

const BESSEMER_PAYBACK = { smb: 12, midmarket: 18, enterprise: 24 };
const SEGMENT_LABEL = { smb: 'SMB', midmarket: 'mid-market', enterprise: 'enterprise' };

// Which payback bar applies, and where it comes from. null = no sourced bar.
function paybackBar(c, model){
  if (c.paybackTargetMonths != null) return { months: c.paybackTargetMonths, source: 'your own target' };
  if (model !== 'subscription') return null;
  if (c.segment) return { months: BESSEMER_PAYBACK[c.segment], source: `Bessemer's ${SEGMENT_LABEL[c.segment]} guideline` };
  return { months: 12, source: "David Skok's SaaS guidance" };
}

function verdict(r, c, model){
  const lines = [];
  if (r.ltvCac == null) { lines.push('• No CAC supplied — provide cac, or adSpend + customers, to assess efficiency.'); return lines; }
  const scope = model === 'subscription' ? '' : ` (SaaS guidance — a reference point for ${model}, not a benchmark for it)`;
  if (r.ltvCac >= 3) lines.push(`✓ LTV:CAC ${one(r.ltvCac)}:1 is above 3:1, David Skok's reference point${scope}.`);
  else if (r.ltvCac >= 1) lines.push(`▼ LTV:CAC ${one(r.ltvCac)}:1 is below 3:1, David Skok's reference point${scope} — lift LTV (retention, margin, ARPA) or cut CAC before scaling.`);
  else lines.push(`✗ LTV:CAC ${one(r.ltvCac)}:1 is below 1:1 — you lose money on every customer (arithmetic, not a benchmark). Fix unit economics before any spend increase.`);
  if (r.ltvCac >= 5) lines.push(`• At ${one(r.ltvCac)}:1, check whether you are under-investing: if demand exists, more spend may still pay back. (AAJ's read, not a benchmark.)`);

  if (r.paybackMonths != null){
    const bar = paybackBar(c, model);
    if (!bar) lines.push(`• CAC payback ${one(r.paybackMonths)} mo. No sourced payback guideline for ${model} — set "paybackTargetMonths" from your cash runway to get a verdict.`);
    else if (r.paybackMonths <= bar.months) lines.push(`✓ CAC payback ${one(r.paybackMonths)} mo is within ${bar.months} months (${bar.source}).`);
    else lines.push(`▼ CAC payback ${one(r.paybackMonths)} mo exceeds ${bar.months} months (${bar.source}) — cash is tied up longer; watch burn.`);
  }
  return lines;
}

const REFERENCES = [
  { figure: 'LTV:CAC above 3:1; CAC payback within 12 months', source: 'David Skok, SaaS Metrics 2.0', url: 'https://www.forentrepreneurs.com/saas-metrics-2/' },
  { figure: 'CAC payback under 12 / 18 / 24 months (SMB / mid-market / enterprise)', source: 'Bessemer Venture Partners, Scaling to $100 Million (2021)', url: 'https://www.bvp.com/atlas/scaling-to-100-million' }
];

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
  verdict(r, c, c.model || 'subscription').forEach(l => out.push(l));
  out.push('');
  out.push('Reference points: ' + REFERENCES.map(x => `${x.source} (${x.url})`).join('; '));
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify({
    model: c.model || 'subscription',
    ltv: Math.round(r.ltv), cac: r.cac != null ? Math.round(r.cac) : null,
    ltvCac: r.ltvCac != null ? Math.round(r.ltvCac*100)/100 : null,
    cacPaybackMonths: r.paybackMonths != null ? Math.round(r.paybackMonths*10)/10 : null,
    monthlyGrossProfit: Math.round(r.monthlyGP),
    paybackBar: (b => b ? { months: b.months, source: b.source } : null)(paybackBar(c, c.model || 'subscription')),
    references: REFERENCES
  }, null, 2));
  return out.join('\n');
}

// --- AAJ input validation ----------------------------------------------------
// Fail loudly on bad input. Without this, an unrecognised key name yields
// "LTV $NaN" and a wrong-but-confident verdict, which reads as a broken tool.
const SCHEMA = {
  subscription: { required: ['arpaMonthly', 'grossMargin'],
                  oneOf: [['churnMonthly', 'lifetimeMonths']],
                  optional: ['churnMonthly', 'lifetimeMonths'] },
  ecommerce:    { required: ['aov', 'grossMargin', 'ordersPerYear', 'retentionYears'],
                  oneOf: [], optional: [] },
  services:     { required: ['acv', 'grossMargin', 'retentionYears'],
                  oneOf: [], optional: [] }
};
const COMMON = ['model', 'cac', 'adSpend', 'customers', 'paybackTargetMonths', 'segment'];

function udie(msg, hint) {
  console.error('error: ' + msg + (hint ? '\n       ' + hint : '') +
                '\n\nRun --help for the schema, or --demo for a worked example.');
  process.exit(1);
}

function validate(c) {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) {
    udie('config must be a JSON object.');
  }
  const model = c.model || 'subscription';
  const s = SCHEMA[model];
  if (!s) udie(`unknown model "${model}".`, 'Use: subscription, ecommerce, or services.');

  const allowed = new Set([...COMMON, ...s.required, ...s.optional]);
  const unknown = Object.keys(c).filter(k => !allowed.has(k));
  if (unknown.length) {
    const near = k => [...allowed].find(a => a.toLowerCase().startsWith(k.toLowerCase().slice(0, 3)));
    udie(`unrecognised field(s) for model "${model}": ${unknown.join(', ')}.`,
         unknown.map(k => near(k) ? `did you mean "${near(k)}" instead of "${k}"?` : '')
                .filter(Boolean).join(' ') ||
         `valid fields: ${[...allowed].join(', ')}.`);
  }

  const missing = s.required.filter(k => c[k] === undefined);
  if (missing.length) udie(`missing required field(s) for model "${model}": ${missing.join(', ')}.`);

  for (const group of s.oneOf) {
    if (!group.some(k => c[k] !== undefined)) {
      udie(`model "${model}" needs one of: ${group.join(' or ')}.`);
    }
  }

  const hasCac = c.cac !== undefined;
  const hasDerived = c.adSpend !== undefined && c.customers !== undefined;
  if (!hasCac && !hasDerived) {
    udie('missing CAC.', 'Provide "cac", or "adSpend" + "customers" to derive it.');
  }

  if (c.segment !== undefined) {
    if (model !== 'subscription') udie('"segment" applies to the subscription model only.');
    if (!BESSEMER_PAYBACK[c.segment]) udie(`unknown segment "${c.segment}".`, 'Use: smb, midmarket, or enterprise.');
  }
  for (const [k, v] of Object.entries(c)) {
    if (k === 'model' || k === 'segment') continue;
    if (typeof v !== 'number' || !isFinite(v)) {
      udie(`field "${k}" must be a finite number (got ${JSON.stringify(v)}).`);
    }
    if (v < 0) udie(`field "${k}" cannot be negative (got ${v}).`);
  }

  // The silent-wrong-answer case: percentages passed as proportions.
  for (const k of ['grossMargin', 'churnMonthly']) {
    if (c[k] !== undefined && c[k] > 0 && c[k] < 1) {
      udie(`"${k}" looks like a proportion (${c[k]}), but this engine expects a percentage.`,
           `Pass ${Math.round(c[k] * 100)} for ${Math.round(c[k] * 100)}%, not ${c[k]}.`);
    }
  }
  if (c.grossMargin > 100) udie(`"grossMargin" cannot exceed 100 (got ${c.grossMargin}).`);
  if (c.churnMonthly !== undefined && c.churnMonthly > 100) {
    udie(`"churnMonthly" cannot exceed 100 (got ${c.churnMonthly}).`);
  }
}
// -----------------------------------------------------------------------------

const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help for the schema.\n'+e.message); process.exit(1);} }
else { cfg = { model:'subscription', arpaMonthly:500, grossMargin:80, churnMonthly:3, cac:3000 }; console.log('(no config — demo: subscription, $500 ARPA, 80% margin, 3% monthly churn, $3,000 CAC)'); }
validate(cfg);
console.log(render(cfg));
