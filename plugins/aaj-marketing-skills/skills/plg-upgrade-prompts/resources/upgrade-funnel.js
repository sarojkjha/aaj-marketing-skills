#!/usr/bin/env node
/*
 * AAJ PLG Upgrade Prompts - upgrade funnel engine
 * Part of the "plg-upgrade-prompts" Agent Skill.
 *
 * Reads the funnel behind each upgrade prompt or paywall in a product-led
 * product - users who hit the limit, saw the prompt, clicked, and paid - and
 * says which prompt converts, with an honest interval on each rate, which prompt
 * and stage to fix first, and whether the differences between prompts are real
 * or noise. Every comparison is against your own prompts; the engine holds no
 * benchmarks.
 *
 * USAGE
 *   node upgrade-funnel.js                 # demo (fictional example inputs)
 *   node upgrade-funnel.js '<json-config>' # your own
 *   node upgrade-funnel.js --help
 *
 * CONFIG (JSON) - counts are unique users in one period
 *
 *   {
 *     "period": "last 30 days",       // label only
 *     "activeFree": 5000,             // active free users in the period
 *     "confidence": 95,               // 90 | 95 | 99 (default 95)
 *     "prompts": [
 *       { "name": "Seat limit (3 users)",
 *         "kind": "limit",            // optional label: limit | usage | feature-gate | trial-end | nudge
 *         "hitLimit": 600,            // optional: users who hit the limit or trigger
 *         "views": 540,               // users who saw the prompt
 *         "clicks": 130,              // users who clicked its upgrade action
 *         "upgrades": 39 }            // users who paid through that click
 *     ]
 *   }
 *
 * METHOD
 *   - Prompt conversion = upgrades / views, with a Wilson score interval.
 *   - Stages: delivery (views / hitLimit), click (clicks / views), checkout (upgrades / clicks).
 *   - Fix first: for each prompt and stage, the upgrades gained if that stage
 *     matched the LOWER bound of your best prompt at the same stage. Largest gain wins.
 *     Prompts reach different users at different moments, so this ranks where to
 *     look - it is not a causal estimate. Test the fix with an A/B test.
 *   - Prompt vs prompt: two-proportion z-test on upgrades / views (pooled, as in the
 *     ab-test-significance skill), with Holm's correction for testing several pairs.
 *   - Rank prompts only where the pairwise test says they differ; the intervals
 *     show how much each rate could move with more data.
 */

// --- AAJ arg normalisation ---------------------------------------------------
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

/* aaj:core:begin - the upgrade funnel core. If a browser tool ever embeds this
   engine, copy this block verbatim and guard it byte for byte. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

// Standard normal CDF (Abramowitz-Stegun) and inverse (Acklam), as in ab-test-significance.
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function normInv(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// Wilson score interval: an honest range for a rate from a small count.
function wilson(x, n, z) {
  if (n <= 0) return null;
  const p = x / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

// Two-proportion z-test, pooled standard error, two-tailed.
function twoProp(x1, n1, x2, n2) {
  const p1 = x1 / n1, p2 = x2 / n2;
  const pool = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  const z = se > 0 ? (p1 - p2) / se : 0;
  return { z, p: se > 0 ? 2 * (1 - normCdf(Math.abs(z))) : 1 };
}

const isCount = (v) => Number.isInteger(v) && v >= 0;
const STAGES = [
  { key: 'delivery', label: 'delivery (hit limit -> saw prompt)', x: 'views', n: 'hitLimit' },
  { key: 'click', label: 'click (saw -> clicked)', x: 'clicks', n: 'views' },
  { key: 'checkout', label: 'checkout (clicked -> paid)', x: 'upgrades', n: 'clicks' },
];

function analyse(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  const conf = cfg.confidence === undefined ? 95 : Number(cfg.confidence);
  if (![90, 95, 99].includes(conf)) die('"confidence" must be 90, 95 or 99.');
  const alpha = 1 - conf / 100;
  const z = normInv(1 - alpha / 2);
  const activeFree = cfg.activeFree === undefined ? null : Number(cfg.activeFree);
  if (activeFree !== null && !isCount(activeFree)) die('"activeFree" must be a whole number of users.');
  const raw = Array.isArray(cfg.prompts) ? cfg.prompts : [];
  if (!raw.length) die('Give "prompts": one entry per upgrade prompt or paywall.', 'Each: name, views, clicks, upgrades, and hitLimit if you track it.');

  const names = new Set();
  const prompts = raw.map((p, i) => {
    if (!p || typeof p !== 'object') die(`Prompt ${i + 1} is not an object.`);
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Prompt ${i + 1}`;
    if (names.has(name)) die(`Two prompts are called "${name}". Give each a distinct name.`);
    names.add(name);
    const out = { name, kind: typeof p.kind === 'string' ? p.kind : '' };
    ['views', 'clicks', 'upgrades'].forEach((k) => {
      const v = Number(p[k]);
      if (p[k] === undefined || !isCount(v)) die(`"${name}": "${k}" must be a whole number of users.`);
      out[k] = v;
    });
    out.hitLimit = p.hitLimit === undefined || p.hitLimit === null ? null : Number(p.hitLimit);
    if (out.hitLimit !== null && !isCount(out.hitLimit)) die(`"${name}": "hitLimit" must be a whole number of users.`);
    if (out.clicks > out.views) die(`"${name}": more clicks (${out.clicks}) than users who saw the prompt (${out.views}).`, 'Count unique users at each step.');
    if (out.upgrades > out.clicks) die(`"${name}": more upgrades (${out.upgrades}) than clicks (${out.clicks}).`, 'Count only users who paid through this prompt\'s click; view-through upgrades belong in a separate analysis.');
    if (out.hitLimit !== null && out.views > out.hitLimit) die(`"${name}": more users saw the prompt (${out.views}) than hit the limit (${out.hitLimit}).`, 'For prompts shown without a limit (nudges), leave hitLimit out.');
    return out;
  });

  // ---- per prompt
  const totalUpgrades = prompts.reduce((s, p) => s + p.upgrades, 0);
  prompts.forEach((p) => {
    p.conversion = wilson(p.upgrades, p.views, z);          // the prompt's conversion
    p.stages = {};
    STAGES.forEach((s) => { p.stages[s.key] = p[s.n] === null ? null : wilson(p[s.x], p[s.n], z); });
    p.reach = activeFree && p.hitLimit !== null ? p.hitLimit / activeFree : null;
    p.share = totalUpgrades ? p.upgrades / totalUpgrades : 0;
  });

  // ---- best observed (lower bound) per stage, from your own prompts
  const best = {};
  STAGES.forEach((s) => {
    let top = null;
    prompts.forEach((p) => { const w = p.stages[s.key]; if (w && (!top || w.low > top.low)) top = { name: p.name, low: w.low, rate: w.rate }; });
    best[s.key] = top;
  });
  // Pooled checkout rate, for prompts with no clicks yet.
  const allClicks = prompts.reduce((s, p) => s + p.clicks, 0);
  const pooledCheckout = allClicks ? totalUpgrades / allClicks : 0;

  // ---- gains if a stage matched the best prompt's lower bound
  const gains = [];
  prompts.forEach((p) => {
    STAGES.forEach((s) => {
      const w = p.stages[s.key];
      const b = best[s.key];
      if (!w || !b || b.name === p.name || w.rate >= b.low) return;
      let gain = 0;
      if (s.key === 'delivery') {
        const downstream = p.views ? p.upgrades / p.views : (p.clicks ? 0 : 0);
        gain = p.hitLimit * (b.low - w.rate) * downstream;
      } else if (s.key === 'click') {
        const checkout = p.clicks ? p.upgrades / p.clicks : pooledCheckout;
        gain = p.views * (b.low - w.rate) * checkout;
      } else {
        gain = p.clicks * (b.low - w.rate);
      }
      if (gain > 0) gains.push({ prompt: p.name, stage: s.key, label: s.label, rate: w.rate, target: b.low, bestPrompt: b.name, bestRate: b.rate, gain });
    });
  });
  gains.sort((a, b) => b.gain - a.gain);

  // ---- prompt vs prompt on upgrades / views, Holm-corrected
  const pairs = [];
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const a = prompts[i], b = prompts[j];
      if (!a.views || !b.views) continue;
      const t = twoProp(a.upgrades, a.views, b.upgrades, b.views);
      pairs.push({ a: a.name, b: b.name, rateA: a.upgrades / a.views, rateB: b.upgrades / b.views, z: t.z, p: t.p });
    }
  }
  const order = pairs.map((x, i) => i).sort((i, j) => pairs[i].p - pairs[j].p);
  let running = 0;
  order.forEach((idx, rank) => {
    const adj = Math.min(1, (pairs.length - rank) * pairs[idx].p);
    running = Math.max(running, adj);
    pairs[idx].pHolm = running;
    pairs[idx].different = running < alpha;
  });

  // ---- findings
  const findings = [];
  const add = (level, id, text) => findings.push({ level, id, text });
  prompts.forEach((p) => {
    if (!p.views) add('fix', 'never-seen', `"${p.name}" was not seen by anyone this period. Check that it fires.`);
    else if (p.upgrades === 0) add('info', 'no-upgrades', `"${p.name}" has no upgrades yet from ${p.views} views (interval 0% to ${pc(p.conversion.high)}). Judge it only once the interval is narrow enough to matter.`);
    if (p.stages.delivery && p.stages.delivery.rate < 1) {
      const missed = p.hitLimit - p.views;
      add('info', 'missed-delivery', `${missed} user${missed === 1 ? '' : 's'} hit "${p.name}" without seeing the prompt. Check whether that is a deliberate frequency cap or a bug.`);
    }
  });
  if (gains.length) {
    const g = gains[0];
    add('fix', 'fix-first', `Fix first: "${g.prompt}" at ${g.label}. It runs at ${pc(g.rate)}; "${g.bestPrompt}" runs at ${pc(g.bestRate)} at the same stage, and no lower than ${pc(g.target)} at ${conf}% confidence. Matching the lower figure would add about ${g.gain.toFixed(1)} upgrades per period. Prompts reach different users, so test the fix rather than assume it.`);
  }
  const real = pairs.filter((x) => x.different);
  if (pairs.length && !real.length) add('info', 'no-real-difference', `No difference between prompts is significant at ${conf}% after correcting for ${pairs.length} comparison${pairs.length > 1 ? 's' : ''}. Do not rank them on this data.`);
  if (activeFree !== null && activeFree > 0) {
    const sumHit = prompts.reduce((s, p) => s + (p.hitLimit || 0), 0);
    if (sumHit && sumHit < activeFree) add('info', 'unprompted', `At most ${sumHit} of ${activeFree} active free users hit a tracked limit (fewer if users hit several). The rest never met an upgrade moment; check whether the limits sit where value is proven.`);
  }

  const fixes = findings.filter((f) => f.level === 'fix').length;
  const verdict = gains.length
    ? { level: 'fix', headline: 'One prompt to fix first', body: `"${gains[0].prompt}" at the ${gains[0].stage} stage.` }
    : fixes
      ? { level: 'fix', headline: 'Fix the tracking first', body: 'A prompt has no views, so the funnel cannot be read.' }
      : { level: 'ok', headline: 'No clear gap between prompts', body: 'No prompt trails your best at any stage by more than the uncertainty.' };

  return {
    period: cfg.period ? String(cfg.period) : 'period', confidence: conf, activeFree,
    totals: { upgrades: totalUpgrades, freeToPaid: activeFree ? totalUpgrades / activeFree : null },
    prompts, best, gains, pairs, findings, verdict,
  };
}

function pc(v) { return v === null || v === undefined ? '-' : (Math.round(v * 1000) / 10) + '%'; }
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
  const L = [];
  const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
  L.push('');
  L.push(`AAJ - UPGRADE PROMPT FUNNEL (${r.period}, ${r.confidence}% intervals)`);
  L.push('-'.repeat(78));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  if (r.totals.freeToPaid !== null) L.push(`  ${r.totals.upgrades} upgrades through prompts from ${r.activeFree} active free users (${pc(r.totals.freeToPaid)}).`);
  L.push('');
  L.push('  ' + pad('Prompt', 26) + pad('Hit', 7) + pad('Seen', 7) + pad('Click', 7) + pad('Paid', 6) + 'Seen -> paid (interval)');
  r.prompts.forEach((p) => {
    const c = p.conversion;
    L.push('  ' + pad(p.name, 26) + pad(p.hitLimit === null ? '-' : p.hitLimit, 7) + pad(p.views, 7) + pad(p.clicks, 7) + pad(p.upgrades, 6) +
      (c ? `${pc(c.rate)} (${pc(c.low)} to ${pc(c.high)})` : '-'));
  });
  L.push('');
  L.push('STAGES');
  r.prompts.forEach((p) => {
    L.push(`  ${p.name}: ` + ['delivery', 'click', 'checkout'].map((k) => `${k} ${p.stages[k] ? pc(p.stages[k].rate) : '-'}`).join('  |  ') + `  |  ${pc(p.share)} of upgrades`);
  });
  if (r.gains.length) {
    L.push('');
    L.push('WHERE THE UPGRADES ARE (vs your best prompt\'s lower bound at each stage)');
    r.gains.slice(0, 5).forEach((g) => L.push(`  +${g.gain.toFixed(1)}  ${g.prompt} - ${g.label}: ${pc(g.rate)} vs ${pc(g.target)} (${g.bestPrompt})`));
  }
  if (r.pairs.length) {
    L.push('');
    L.push('PROMPT VS PROMPT (seen -> paid, Holm-corrected)');
    r.pairs.forEach((x) => L.push(`  ${x.a} ${pc(x.rateA)} vs ${x.b} ${pc(x.rateB)}: p = ${x.p.toFixed(4)}, adjusted ${x.pHolm.toFixed(4)} -> ${x.different ? 'different' : 'not distinguishable'}`));
  }
  if (r.findings.length) {
    L.push('');
    L.push('FINDINGS');
    r.findings.filter((f) => f.level === 'fix').forEach((f) => L.push(`  !  ${f.text}`));
    r.findings.filter((f) => f.level === 'info').forEach((f) => L.push(`  i  ${f.text}`));
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Fictional example inputs for an invented PLG product. Not benchmarks.
const DEMO = {
  period: 'last 30 days', activeFree: 5000, confidence: 95,
  prompts: [
    { name: 'Seat limit (3 users)', kind: 'limit', hitLimit: 600, views: 540, clicks: 130, upgrades: 39 },
    { name: 'Export to PDF', kind: 'feature-gate', hitLimit: 900, views: 880, clicks: 70, upgrades: 14 },
    { name: 'Project limit (5)', kind: 'usage', hitLimit: 400, views: 250, clicks: 60, upgrades: 18 },
  ],
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: three prompts in a fictional PLG product; every count is an example input)');
  }
  try {
    console.log(render(analyse(cfg)));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { analyse, wilson, twoProp, normCdf, normInv };
