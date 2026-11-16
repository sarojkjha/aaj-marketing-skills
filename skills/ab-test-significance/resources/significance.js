#!/usr/bin/env node
/*
 * AAJ A/B Test Significance — engine
 * Part of the "ab-test-significance" Agent Skill.
 *
 * Two-proportion z-test for a conversion A/B test: lift, p-value, confidence,
 * significance verdict, and a required-sample-size estimate. Welch's t-test for
 * an average per visitor (revenue per visitor, order value). A sample-ratio check
 * on the visitor split.
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
 *   Compare an average per visitor, such as revenue per visitor (add "metric"):
 *     { "metric": "mean",
 *       "control": {"visitors":4000,"mean":2.31,"sd":11.8},
 *       "variant": {"visitors":4050,"mean":2.87,"sd":13.1},
 *       "confidence": 95, "tail": "two" }
 *     Each arm can give "values" (one number per visitor, zeros included)
 *     instead of visitors + mean + sd. sd is the sample standard deviation.
 *   Optional, conversion or mean test:
 *     "plannedSplit": [50, 50]   the traffic split you set, in percent (default
 *                                equal). Checked against the visitors you got.
 *
 * METHOD AND SOURCES
 *   Averages: Welch's t-test with Welch-Satterthwaite degrees of freedom, as in
 *     NIST/SEMATECH e-Handbook of Statistical Methods, 1.3.5.3 "Two-Sample t-Test
 *     for Equal Means": https://itl.nist.gov/div898/handbook/eda/section3/eda353.htm
 *   Sample ratio: chi-square goodness-of-fit test of the visitor counts against
 *     the planned split (NIST/SEMATECH 1.3.5.15:
 *     https://itl.nist.gov/div898/handbook/eda/section3/eda35f.htm). A mismatch is
 *     flagged below p = 0.0005, the threshold Microsoft's Experimentation Platform
 *     uses: A. Fabijan et al., "Diagnosing Sample Ratio Mismatch in A/B Testing",
 *     Microsoft Research (2020):
 *     https://www.microsoft.com/en-us/research/articles/diagnosing-sample-ratio-mismatch-in-a-b-testing/
 *   t and chi-square tails: the regularized incomplete beta and gamma functions
 *     (Abramowitz & Stegun 26.5.8, 6.5.29 and 6.5.31; log-gamma by Lanczos).
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
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

// Score interval on the difference pB − pA (Miettinen–Nurminen without the n/(n−1)
// factor). At a difference of 0 its statistic is exactly the pooled z above, so the
// interval excludes 0 exactly when the test is significant: the two never disagree,
// which an unpooled Wald interval can (a "win" whose interval touches 0).
function restrictedMle(x1, n1, x2, n2, d){
  // Maximise the likelihood with pB = pA + d over pA in (max(0, −d), min(1, 1 − d)).
  // The log-likelihood is concave in pA, so bisect on its derivative.
  let lo = Math.max(0, -d), hi = Math.min(1, 1 - d);
  const eps = 1e-12;
  const grad = (p) => {
    const q = p + d;
    return (x1 ? x1 / Math.max(p, eps) : 0) - (n1 - x1 ? (n1 - x1) / Math.max(1 - p, eps) : 0)
         + (x2 ? x2 / Math.max(q, eps) : 0) - (n2 - x2 ? (n2 - x2) / Math.max(1 - q, eps) : 0);
  };
  for (let i = 0; i < 200; i++){ const m = (lo + hi) / 2; if (grad(m) > 0) lo = m; else hi = m; }
  const pA = (lo + hi) / 2;
  return [pA, pA + d];
}
function scoreZ(x1, n1, x2, n2, d){
  const [a, b] = restrictedMle(x1, n1, x2, n2, d);
  const v = a * (1 - a) / n1 + b * (1 - b) / n2;
  const diff = x2 / n2 - x1 / n1 - d;
  return v > 0 ? diff / Math.sqrt(v) : (diff > 0 ? Infinity : diff < 0 ? -Infinity : 0);
}
function scoreInterval(x1, n1, x2, n2, zc){
  const dHat = x2 / n2 - x1 / n1;
  // scoreZ falls as d rises; find where it crosses +zc (lower bound) and −zc (upper bound).
  const solve = (target, lo, hi) => { for (let i = 0; i < 200; i++){ const m = (lo + hi) / 2; if (scoreZ(x1, n1, x2, n2, m) > target) lo = m; else hi = m; } return (lo + hi) / 2; };
  return [solve(zc, -1, dHat), solve(-zc, dHat, 1)];
}

// --- t and chi-square tails ---------------------------------------------------
// Log-gamma (Lanczos, g = 7, nine coefficients).
function lgamma(x){
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = g[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
// Regularized incomplete beta I_x(a, b): continued fraction (A&S 26.5.8), modified Lentz.
function betacf(x, a, b){
  const tiny = 1e-300; let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny; d = 1 / d; let h = d;
  for (let m = 1; m <= 500; m++){
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
function ibeta(x, a, b){
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(x, a, b) / a : 1 - bt * betacf(1 - x, b, a) / b;
}
// P(T > t) for Student's t with df degrees of freedom.
function tUpper(t, df){
  const tail = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? tail : 1 - tail;
}
// The t value with P(T > q) = p, by bisection (tUpper falls as q rises).
function tInv(p, df){
  let lo = 0, hi = 1;
  while (tUpper(hi, df) > p && hi < 1e7) hi *= 2;
  for (let i = 0; i < 200; i++){ const m = (lo + hi) / 2; if (tUpper(m, df) > p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// Regularized upper incomplete gamma Q(a, x): series (A&S 6.5.29) below a + 1,
// continued fraction (A&S 6.5.31) above, so a tiny tail keeps its precision.
function gammaQ(a, x){
  if (x <= 0) return 1;
  const lead = Math.exp(-x + a * Math.log(x) - lgamma(a));
  if (x < a + 1){
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 1000; n++){ ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return 1 - sum * lead;
  }
  const tiny = 1e-300; let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i <= 1000; i++){
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny; c = b + an / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
  }
  return lead * h;
}
// P(chi-square with df degrees of freedom > x).
function chiSqUpper(x, df){ return gammaQ(df / 2, x / 2); }

// --- Sample ratio --------------------------------------------------------------
// Chi-square goodness of fit of the visitor counts against the planned split
// (NIST/SEMATECH 1.3.5.15). Microsoft's Experimentation Platform flags a
// mismatch below p = 0.0005 (Fabijan et al., 2020).
const SRM_P = 0.0005;
function sampleRatio(counts, split){
  const total = counts.reduce((a, b) => a + b, 0);
  const sum = split.reduce((a, b) => a + b, 0);
  const expected = split.map((s) => total * s / sum);
  const chi = counts.reduce((acc, o, i) => acc + (o - expected[i]) * (o - expected[i]) / expected[i], 0);
  const df = counts.length - 1;
  const pValue = chiSqUpper(chi, df);
  return { counts, planned: split, expected, chiSquare: chi, df, pValue, mismatch: pValue < SRM_P, threshold: SRM_P };
}

// --- Welch's t-test for an average per visitor --------------------------------
// NIST/SEMATECH 1.3.5.3: T = (mean B - mean A) / sqrt(sA^2/nA + sB^2/nB), with
// Welch-Satterthwaite degrees of freedom.
function armStats(g){
  if (Array.isArray(g.values)){
    const n = g.values.length, mean = g.values.reduce((a, b) => a + b, 0) / n;
    const ss = g.values.reduce((a, v) => a + (v - mean) * (v - mean), 0);
    return { n, mean, sd: Math.sqrt(ss / (n - 1)) };
  }
  return { n: g.visitors, mean: g.mean, sd: g.sd };
}
function welch(c){
  const conf = c.confidence || 95;
  const tail = c.tail || 'two';
  const A = armStats(c.control), B = armStats(c.variant);
  const vA = A.sd * A.sd / A.n, vB = B.sd * B.sd / B.n;
  const se = Math.sqrt(vA + vB);
  const df = (vA + vB) * (vA + vB) / (vA * vA / (A.n - 1) + vB * vB / (B.n - 1));
  const diff = B.mean - A.mean;
  const t = diff / se;
  const pValue = tail === 'one' ? tUpper(t, df) : 2 * tUpper(Math.abs(t), df);
  const alpha = (100 - conf) / 100;
  const tc = tInv(alpha / (tail === 'one' ? 1 : 2), df);
  return { A, B, diff, relLift: A.mean !== 0 ? diff / Math.abs(A.mean) : null, se, df, t, pValue,
    significant: pValue < alpha, conf, tail, ciLow: diff - tc * se, ciHigh: tail === 'one' ? null : diff + tc * se,
    winner: diff > 0 ? 'variant' : diff < 0 ? 'control' : 'tie' };
}

function evaluate(c){
  const conf = c.confidence || 95;
  const tail = c.tail || 'two';
  const a = c.control, b = c.variant;
  const pA = a.conversions / a.visitors, pB = b.conversions / b.visitors;
  const pPool = (a.conversions + b.conversions) / (a.visitors + b.visitors);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.visitors + 1 / b.visitors));
  const z = se > 0 ? (pB - pA) / se : 0;
  // One-tailed asks one question: is the variant better than control? A variant that
  // did worse gets a p-value above 0.5, never a win.
  const pValue = tail === 'one' ? 1 - normCdf(z) : 2 * (1 - normCdf(Math.abs(z)));
  const alpha = (100 - conf) / 100;
  const significant = pValue < alpha;
  const relLift = pA > 0 ? (pB - pA) / pA : 0;
  // Interval on the difference, consistent with the test (scoreInterval). One-tailed asks
  // only whether the variant is better, so it has a lower bound and no upper bound.
  const zc = normInv(1 - alpha / (tail === 'one' ? 1 : 2));
  const [ciLow, ciHigh] = scoreInterval(a.conversions, a.visitors, b.conversions, b.visitors, zc);
  return { pA, pB, relLift, absLift: pB - pA, z, pValue, significant, conf, tail,
    ciLow, ciHigh: tail === 'one' ? null : ciHigh,
    winner: pB > pA ? 'variant' : (pB < pA ? 'control' : 'tie') };
}

// Analytics APIs (GA4's Data API among them) return metric values as text, and
// "168" + 37 is "16837" in JavaScript: a string count once produced z = 6.57
// where the true value was 2.01. Numeric text is converted; anything else, a
// rate passed as a count, or more conversions than visitors stops the run.
function toNum(v){
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}
function validate(cfg){
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return ['The input must be a JSON object.'];
  const errs = [];
  if (cfg.metric !== undefined && cfg.metric !== 'mean' && cfg.metric !== 'conversion') errs.push('"metric" is "conversion" (the default) or "mean".');
  if (cfg.plan && cfg.metric === 'mean') errs.push('Sample-size planning covers conversion rates only; leave out "metric".');
  const known = cfg.plan
    ? ['plan', 'baselineRate', 'mde', 'confidence', 'power', 'metric']
    : ['control', 'variant', 'confidence', 'tail', 'plan', 'metric', 'plannedSplit'];
  const unknown = Object.keys(cfg).filter((k) => !known.includes(k));
  if (unknown.length) errs.push('Unrecognised field' + (unknown.length > 1 ? 's' : '') + ': ' + unknown.map((k) => '"' + k + '"').join(', ') + '. Expected: ' + known.join(', ') + '.');
  if (cfg.confidence !== undefined){
    cfg.confidence = toNum(cfg.confidence);
    if (!(cfg.confidence > 50 && cfg.confidence < 100)) errs.push('"confidence" is a percentage such as 90, 95 or 99.');
  }
  if (cfg.tail !== undefined && cfg.tail !== 'one' && cfg.tail !== 'two') errs.push('"tail" is "one" or "two".');
  if (cfg.plan){
    for (const k of ['baselineRate', 'mde']){
      cfg[k] = toNum(cfg[k]);
      if (!(cfg[k] > 0)) errs.push('"' + k + '" is a positive number in percentage points (5 means 5%).');
    }
    if (cfg.power !== undefined){
      cfg.power = toNum(cfg.power);
      if (!(cfg.power > 0 && cfg.power < 100)) errs.push('"power" is a percentage such as 80.');
    }
    if (cfg.baselineRate + cfg.mde >= 100) errs.push('baselineRate + mde must stay under 100 percentage points.');
    return errs;
  }
  if (cfg.plannedSplit !== undefined){
    const sp = cfg.plannedSplit;
    if (!Array.isArray(sp) || sp.length !== 2) errs.push('"plannedSplit" is two percentages, control first, such as [50, 50].');
    else {
      cfg.plannedSplit = sp.map(toNum);
      if (cfg.plannedSplit.some((v) => !(v > 0 && v < 100))) errs.push('Each "plannedSplit" share is a percentage above 0 and below 100.');
      else if (Math.abs(cfg.plannedSplit[0] + cfg.plannedSplit[1] - 100) > 0.01) errs.push('"plannedSplit" must add up to 100 (got ' + (cfg.plannedSplit[0] + cfg.plannedSplit[1]) + ').');
    }
  }
  if (cfg.metric === 'mean'){
    const sds = [];
    for (const arm of ['control', 'variant']){
      const g = cfg[arm];
      if (!g || typeof g !== 'object' || Array.isArray(g)){ errs.push('"' + arm + '" needs {"visitors": n, "mean": x, "sd": x} or {"values": [...]}.'); continue; }
      const keys = Object.keys(g);
      if (g.values !== undefined){
        const extra = keys.filter((k) => k !== 'values');
        if (extra.length) errs.push(arm + ': give "values" or visitors + mean + sd, not both (' + extra.join(', ') + ').');
        if (!Array.isArray(g.values)) { errs.push(arm + '.values must be a list of numbers, one per visitor.'); continue; }
        g.values = g.values.map(toNum);
        if (g.values.length < 2) errs.push(arm + '.values needs at least 2 visitors.');
        if (g.values.length > 1000000) errs.push(arm + '.values has more than 1,000,000 numbers; give visitors + mean + sd instead.');
        const bad = g.values.findIndex((v) => !Number.isFinite(v));
        if (bad >= 0) errs.push(arm + '.values[' + bad + '] is not a number.');
        else if (g.values.length >= 2) sds.push(armStats(g).sd);
        continue;
      }
      const unknownArm = keys.filter((k) => !['visitors', 'mean', 'sd'].includes(k));
      if (unknownArm.length) errs.push(arm + ': unrecognised field' + (unknownArm.length > 1 ? 's' : '') + ' ' + unknownArm.map((k) => '"' + k + '"').join(', ') + '. Expected visitors, mean, sd (or values).');
      g.visitors = toNum(g.visitors); g.mean = toNum(g.mean); g.sd = toNum(g.sd);
      if (!Number.isInteger(g.visitors) || g.visitors < 2) errs.push(arm + '.visitors must be a whole number of at least 2.');
      if (!Number.isFinite(g.mean)) errs.push(arm + '.mean must be a number: the average per visitor.');
      if (!(Number.isFinite(g.sd) && g.sd >= 0)) errs.push(arm + '.sd must be a number of 0 or more: the standard deviation per visitor.');
      else sds.push(g.sd);
    }
    if (sds.length === 2 && sds[0] === 0 && sds[1] === 0) errs.push('Both standard deviations are 0, so there is no spread to test against.');
    return errs;
  }
  for (const arm of ['control', 'variant']){
    const g = cfg[arm];
    if (!g || typeof g !== 'object'){ errs.push('"' + arm + '" needs {"visitors": n, "conversions": n}.'); continue; }
    for (const k of ['visitors', 'conversions']){
      g[k] = toNum(g[k]);
      if (!Number.isInteger(g[k]) || g[k] < 0) errs.push(arm + '.' + k + ' must be a whole number: a count, not a rate.');
    }
    if (g.visitors === 0) errs.push(arm + '.visitors must be above 0.');
    if (g.conversions > g.visitors) errs.push(arm + '.conversions cannot be more than ' + arm + '.visitors.');
  }
  return errs;
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
function fmtP(p){ return p < 0.0001 ? p.toExponential(1) : p.toFixed(4); }
function num(x){ return (Math.round(x * 100) / 100).toLocaleString(); }

function srmLines(c, counts){
  const split = c.plannedSplit || counts.map(() => 50);
  const s = sampleRatio(counts, split);
  const plan = split.map((v) => +(+v).toFixed(2)).join('/');
  const head = `Sample ratio   ${counts.map((n) => n.toLocaleString()).join(' / ')} visitors, planned ${plan}: chi-square ${s.chiSquare.toFixed(2)}, p = ${fmtP(s.pValue)}`;
  const line = s.mismatch
    ? `⚠ SAMPLE RATIO MISMATCH: p = ${fmtP(s.pValue)} is below ${SRM_P}, Microsoft ExP's threshold. The split is not what was planned; find out why (redirects, bots, tracking) before trusting this result.`
    : `No sample ratio mismatch (Microsoft ExP flags p below ${SRM_P}).`;
  return { s, lines: [head, line] };
}
function srmJson(s){
  return { visitors: s.counts, plannedSplit: s.planned, chiSquare: +s.chiSquare.toFixed(3), pValue: +s.pValue.toPrecision(3), mismatch: s.mismatch,
    threshold: SRM_P, source: 'Fabijan et al., Diagnosing Sample Ratio Mismatch in A/B Testing, Microsoft Research (2020)' };
}

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
  if (c.metric === 'mean'){
    const r = welch(c);
    out.push('\nAAJ A/B Test — difference in averages (Welch\'s t-test)');
    out.push('-'.repeat(46));
    out.push(`Control   ${num(r.A.mean)} per visitor   (sd ${num(r.A.sd)}, ${r.A.n.toLocaleString()} visitors)`);
    out.push(`Variant   ${num(r.B.mean)} per visitor   (sd ${num(r.B.sd)}, ${r.B.n.toLocaleString()} visitors)`);
    out.push(`Difference  ${(r.diff >= 0 ? '+' : '')}${num(r.diff)}${r.relLift === null ? '' : `   (${r.relLift >= 0 ? '+' : ''}${pct(r.relLift)} relative)`}`);
    out.push(`t = ${r.t.toFixed(2)}   df = ${r.df.toFixed(1)}   p = ${fmtP(r.pValue)}   (${r.tail}-tailed${r.tail === 'one' ? ', variant better than control' : ''}, ${r.conf}% threshold)`);
    const srm = srmLines(c, [r.A.n, r.B.n]);
    srm.lines.forEach((l) => out.push(l));
    out.push('');
    out.push(r.significant
      ? `✓ SIGNIFICANT at ${r.conf}% — ${r.winner} wins. ${r.tail === 'one' ? `${r.conf}% one-sided interval on the difference: at least ${num(r.ciLow)}.` : `${r.conf}% interval on the difference: ${num(r.ciLow)} to ${num(r.ciHigh)}.`}`
      : `✗ NOT significant at ${r.conf}% (p ${fmtP(r.pValue)} ≥ ${(100 - r.conf) / 100}). Keep running or treat as no detected difference.`);
    out.push('\n--- JSON ---');
    out.push(JSON.stringify({ metric: 'mean', controlMean: +r.A.mean.toFixed(4), variantMean: +r.B.mean.toFixed(4), difference: +r.diff.toFixed(4),
      relativeLift: r.relLift === null ? null : +r.relLift.toFixed(4), t: +r.t.toFixed(3), df: +r.df.toFixed(2), pValue: +r.pValue.toFixed(4),
      significant: r.significant, confidence: r.conf, winner: r.winner,
      differenceInterval: { low: +r.ciLow.toFixed(4), high: r.ciHigh === null ? null : +r.ciHigh.toFixed(4), method: "Welch's t, Welch-Satterthwaite df (NIST/SEMATECH 1.3.5.3)" },
      sampleRatio: srmJson(srm.s) }, null, 2));
    return out.join('\n');
  }
  const r = evaluate(c);
  out.push('\nAAJ A/B Test — significance');
  out.push('-'.repeat(46));
  out.push(`Control   ${pct(r.pA)}   (${c.control.conversions}/${c.control.visitors})`);
  out.push(`Variant   ${pct(r.pB)}   (${c.variant.conversions}/${c.variant.visitors})`);
  out.push(`Relative lift  ${(r.relLift>=0?'+':'')}${pct(r.relLift)}   (abs ${(r.absLift>=0?'+':'')}${pct(r.absLift)})`);
  out.push(`z = ${r.z.toFixed(2)}   p = ${r.pValue.toFixed(4)}   (${r.tail}-tailed${r.tail === 'one' ? ', variant better than control' : ''}, ${r.conf}% threshold)`);
  const srm = srmLines(c, [c.control.visitors, c.variant.visitors]);
  srm.lines.forEach((l) => out.push(l));
  out.push('');
  out.push(r.significant
    ? `✓ SIGNIFICANT at ${r.conf}% — ${r.winner} wins. ${r.tail === 'one' ? `${r.conf}% one-sided interval on the difference: at least ${pct(r.ciLow)}.` : `${r.conf}% interval on the difference: ${pct(r.ciLow)} to ${pct(r.ciHigh)}.`}`
    : `✗ NOT significant at ${r.conf}% (p ${r.pValue.toFixed(3)} ≥ ${(100-r.conf)/100}). Keep running or treat as no detected difference.`);
  out.push('\n--- JSON ---');
  out.push(JSON.stringify({ controlRate: +r.pA.toFixed(4), variantRate: +r.pB.toFixed(4), relativeLift: +r.relLift.toFixed(4),
    z: +r.z.toFixed(3), pValue: +r.pValue.toFixed(4), significant: r.significant, confidence: r.conf, winner: r.winner,
    differenceInterval: { low: +r.ciLow.toFixed(5), high: r.ciHigh === null ? null : +r.ciHigh.toFixed(5), method: 'score (Miettinen-Nurminen), agrees with the pooled z-test' },
    sampleRatio: srmJson(srm.s) }, null, 2));
  return out.join('\n');
}

const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help.\n'+e.message); process.exit(1);} }
else { cfg = { control:{visitors:4000,conversions:200}, variant:{visitors:4050,conversions:250}, confidence:95 }; console.log('(no config — demo: 5.0% vs 6.2%, n≈4000 each, 95%)'); }
const problems = validate(cfg);
if (problems.length){ console.error(problems.join('\n') + '\nRun --help for the input shape.'); process.exit(1); }
console.log(render(cfg));
