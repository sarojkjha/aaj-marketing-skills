#!/usr/bin/env node
/*
 * AAJ A/B Test Significance — engine
 * Part of the "ab-test-significance" Agent Skill.
 *
 * Two-proportion z-test for a conversion A/B test: lift, p-value, confidence,
 * significance verdict, and a required-sample-size estimate.
 *
 * USAGE
 *   node significance.js                 # demo
 *   node significance.js '<json>'        # custom
 *   node significance.js --help
 *
 * CONFIG (JSON)
 *   Evaluate a result:
 *     { "control":   {"visitors":4000,"conversions":200},
 *       "variant":   {"visitors":4050,"conversions":250},
 *       "confidence": 95,           // 90 | 95 | 99 (default 95)
 *       "tail": "two" }             // "two" | "one" (default two)
 *   Plan a sample size (add "plan"):
 *     { "plan": true, "baselineRate": 5, "mde": 1, "confidence": 95, "power": 80 }
 *       baselineRate & mde are in PERCENTAGE POINTS (5% baseline, +1pt target).
 */

'use strict';

// Standard normal CDF (Abramowitz-Stegun) and inverse (Acklam).
function normCdf(z){
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function normInv(p){
  const a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924];
  const b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857];
  const c=[-0.00778489400243029,-0.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878];
  const d=[0.00778469570904146,0.32246712907004,2.445134137143,3.75440866190742];
  const pl=0.02425, ph=1-pl; let q,r;
  if(p<pl){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p<=ph){q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
  q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

function evaluate(c){
  const conf = c.confidence || 95;
  const tail = c.tail || 'two';
  const a = c.control, b = c.variant;
  const pA = a.conversions / a.visitors, pB = b.conversions / b.visitors;
  const pPool = (a.conversions + b.conversions) / (a.visitors + b.visitors);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.visitors + 1 / b.visitors));
  const z = se > 0 ? (pB - pA) / se : 0;
  const pValue = tail === 'one' ? 1 - normCdf(Math.abs(z)) : 2 * (1 - normCdf(Math.abs(z)));
  const alpha = (100 - conf) / 100;
  const significant = pValue < alpha;
  const relLift = pA > 0 ? (pB - pA) / pA : 0;
  // CI on the difference
  const seUn = Math.sqrt(pA*(1-pA)/a.visitors + pB*(1-pB)/b.visitors);
  const zc = normInv(1 - alpha / (tail === 'one' ? 1 : 2));
  return { pA, pB, relLift, absLift: pB - pA, z, pValue, significant, conf, tail,
    ciLow: (pB - pA) - zc * seUn, ciHigh: (pB - pA) + zc * seUn,
    winner: pB > pA ? 'variant' : (pB < pA ? 'control' : 'tie') };
}

function plan(c){
  const conf = c.confidence || 95, power = c.power || 80;
  const p1 = c.baselineRate / 100, p2 = (c.baselineRate + c.mde) / 100;
  const zA = normInv(1 - (100 - conf) / 100 / 2);
  const zB = normInv(power / 100);
  const pbar = (p1 + p2) / 2;
  const n = Math.pow(zA * Math.sqrt(2 * pbar * (1 - pbar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p2 - p1, 2);
  return { perVariant: Math.ceil(n), total: Math.ceil(n) * 2, conf, power, baselineRate: c.baselineRate, mde: c.mde };
}

function pct(x){ return (Math.round(x * 1000) / 10) + '%'; }

function render(c){
  const out = [];
  if (c.plan){
    const r = plan(c);
    out.push('\nAAJ A/B Test — required sample size');
    out.push('-'.repeat(46));
    out.push(`Baseline ${r.baselineRate}% → detect +${r.mde}pt, ${r.conf}% confidence, ${r.power}% power`);
    out.push(`Per variant: ${r.perVariant.toLocaleString()}   ·   Total: ${r.total.toLocaleString()} visitors`);
    out.push('\n--- JSON ---'); out.push(JSON.stringify(r, null, 2));
    return out.join('\n');
  }
  const r = evaluate(c);
  out.push('\nAAJ A/B Test — significance');
  out.push('-'.repeat(46));
  out.push(`Control   ${pct(r.pA)}   (${c.control.conversions}/${c.control.visitors})`);
  out.push(`Variant   ${pct(r.pB)}   (${c.variant.conversions}/${c.variant.visitors})`);
  out.push(`Relative lift  ${(r.relLift>=0?'+':'')}${pct(r.relLift)}   (abs ${(r.absLift>=0?'+':'')}${pct(r.absLift)})`);
  out.push(`z = ${r.z.toFixed(2)}   p = ${r.pValue.toFixed(4)}   (${r.tail}-tailed, ${r.conf}% threshold)`);
  out.push('');
  out.push(r.significant
    ? `✓ SIGNIFICANT at ${r.conf}% — ${r.winner} wins. ${pct(r.conf<99?0.95:0.99)} CI on the difference: ${pct(r.ciLow)} to ${pct(r.ciHigh)}.`
    : `✗ NOT significant at ${r.conf}% (p ${r.pValue.toFixed(3)} ≥ ${(100-r.conf)/100}). Keep running or treat as no detected difference.`);
  out.push('\n--- JSON ---');
  out.push(JSON.stringify({ controlRate: +r.pA.toFixed(4), variantRate: +r.pB.toFixed(4), relativeLift: +r.relLift.toFixed(4),
    z: +r.z.toFixed(3), pValue: +r.pValue.toFixed(4), significant: r.significant, confidence: r.conf, winner: r.winner }, null, 2));
  return out.join('\n');
}

const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help.\n'+e.message); process.exit(1);} }
else { cfg = { control:{visitors:4000,conversions:200}, variant:{visitors:4050,conversions:250}, confidence:95 }; console.log('(no config — demo: 5.0% vs 6.2%, n≈4000 each, 95%)'); }
console.log(render(cfg));
