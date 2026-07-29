#!/usr/bin/env node
/**
 * AAJ — geo-citation-tracker engine
 *
 * Measures whether a brand is actually being cited by AI answer engines, and
 * whether a change between two tracking runs is signal or noise.
 *
 * Modes:
 *   design   — how many prompts you need before a change is detectable
 *   readout  — score a completed run; compare against the prior run
 *   --demo   — run both modes on sample data, no arguments needed
 *   --help   — usage
 *
 * No dependencies. Node 18+.
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

/* ─────────────────────────────  statistics  ───────────────────────────── */

// Abramowitz & Stegun 7.1.26 — max abs error ~1.5e-7
function erf(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return s * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Acklam's inverse normal CDF approximation — abs error < 1.15e-9
function normalQuantile(p) {
  if (p <= 0 || p >= 1) throw new RangeError('normalQuantile: p must be in (0,1)');
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > ph) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
         (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Two-proportion z-test (two-sided). Returns z and p-value. */
function twoProportionTest(x1, n1, x2, n2) {
  if (n1 <= 0 || n2 <= 0) return { z: 0, p: 1, valid: false };
  const p1 = x1 / n1, p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p: 1, valid: false };
  const z = (p2 - p1) / se;
  return { z, p: 2 * (1 - normalCdf(Math.abs(z))), valid: true };
}

/** Prompts per arm needed to detect p1 → p2 at given alpha/power. */
function sampleSizePerArm(p1, p2, alpha, power) {
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const num = Math.pow(za + zb, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
  const den = Math.pow(p2 - p1, 2);
  return Math.ceil(num / den);
}

/** Smallest absolute change detectable at a given n, alpha, power. */
function minDetectableEffect(p, n, alpha, power) {
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  return (za + zb) * Math.sqrt(2 * p * (1 - p) / n);
}

/* ─────────────────────────────  helpers  ───────────────────────────── */

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const pts = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pts`;

function bar(value, width = 24) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }
function padL(s, n) { s = String(s); return ' '.repeat(Math.max(0, n - s.length)) + s; }

function die(msg) {
  console.error(`error: ${msg}\n\nRun with --help for usage, or --demo for a worked example.`);
  process.exit(1);
}

/* ─────────────────────────────  design mode  ───────────────────────────── */

function design(cfg) {
  const p1 = cfg.baselinePresence;
  const lift = cfg.detectAbsoluteLift;
  const alpha = cfg.alpha ?? 0.05;
  const power = cfg.power ?? 0.8;
  const engines = cfg.engines ?? 4;
  const cadence = cfg.cadence ?? 'monthly';

  if (typeof p1 !== 'number' || p1 <= 0 || p1 >= 1) die('baselinePresence must be a proportion between 0 and 1');
  if (typeof lift !== 'number' || lift <= 0) die('detectAbsoluteLift must be a positive proportion (e.g. 0.15 for 15 points)');
  const p2 = Math.min(0.999, p1 + lift);

  const perArm = sampleSizePerArm(p1, p2, alpha, power);
  const perRun = perArm * engines;

  const out = [];
  out.push('GEO CITATION TRACKER — PROMPT SET DESIGN');
  out.push('═'.repeat(60));
  out.push('');
  out.push(`Baseline presence rate      ${pct(p1)}`);
  out.push(`Change worth detecting      ${pts(lift)}  (→ ${pct(p2)})`);
  out.push(`Confidence / power          ${pct(1 - alpha)} / ${pct(power)}`);
  out.push(`Engines tracked             ${engines}`);
  out.push('');
  out.push('─'.repeat(60));
  out.push(`PROMPTS PER ENGINE, PER RUN    ${perArm}`);
  out.push(`TOTAL QUERIES PER RUN          ${perRun}   (${perArm} × ${engines} engines)`);
  out.push('─'.repeat(60));
  out.push('');

  const commonSizes = [20, 30, 50, 75, 100];
  out.push('What you could detect at other prompt-set sizes:');
  out.push('');
  out.push(`  ${pad('prompts', 10)}${pad('smallest detectable change', 30)}`);
  for (const n of commonSizes) {
    const mde = minDetectableEffect(p1, n, alpha, power);
    const flag = n >= perArm ? '  ← sufficient' : '';
    out.push(`  ${pad(n, 10)}${pad(pts(mde).replace('+', ''), 30)}${flag}`);
  }
  out.push('');

  if (perArm > 100) {
    out.push('⚠  VIABILITY WARNING');
    out.push(`   ${perArm} prompts per engine is a heavy manual run. Either accept a`);
    out.push('   larger detectable change, track fewer engines, or treat this as');
    out.push('   directional monitoring rather than measurement — and say so in the report.');
    out.push('');
  }

  out.push(`Cadence: ${cadence}. Hold the prompt set FIXED between runs — changing`);
  out.push('prompts changes the measurement, and the delta becomes uninterpretable.');
  return out.join('\n');
}

/* ─────────────────────────────  readout mode  ───────────────────────────── */

function scoreEngine(rows) {
  const n = rows.length;
  let mentioned = 0, cited = 0, visibility = 0;
  const framing = { recommended: 0, neutral: 0, negative: 0 };
  const competitorCounts = {};

  for (const r of rows) {
    if (r.mentioned) {
      mentioned++;
      const rank = Math.max(1, r.rank || 1);
      visibility += 1 / rank;
      const f = (r.framing || 'neutral').toLowerCase();
      if (framing[f] !== undefined) framing[f]++; else framing.neutral++;
    }
    if (r.cited) cited++;
    for (const c of (r.competitors || [])) {
      competitorCounts[c] = (competitorCounts[c] || 0) + 1;
    }
  }
  return {
    n, mentioned, cited,
    presenceRate: n ? mentioned / n : 0,
    citationRate: n ? cited / n : 0,
    visibility: n ? visibility / n : 0,
    framing, competitorCounts,
  };
}

function verdictFor(presence) {
  if (presence < 0.10) return 'INVISIBLE';
  if (presence < 0.30) return 'EMERGING';
  if (presence < 0.60) return 'ESTABLISHED';
  return 'DOMINANT';
}

function readout(cfg) {
  const brand = cfg.brand || 'Brand';
  const enginesIn = cfg.engines;
  if (!enginesIn || typeof enginesIn !== 'object') die('readout needs an "engines" object mapping engine name → array of prompt results');

  const alpha = cfg.alpha ?? 0.05;
  const power = cfg.power ?? 0.8;
  const perEngine = {};
  let totalN = 0, totalMentioned = 0, totalCited = 0, totalVis = 0;
  const allCompetitors = {};
  const framingTotal = { recommended: 0, neutral: 0, negative: 0 };

  for (const [name, rows] of Object.entries(enginesIn)) {
    if (!Array.isArray(rows)) die(`engines.${name} must be an array of prompt results`);
    const s = scoreEngine(rows);
    perEngine[name] = s;
    totalN += s.n; totalMentioned += s.mentioned; totalCited += s.cited;
    totalVis += s.visibility * s.n;
    for (const k of Object.keys(framingTotal)) framingTotal[k] += s.framing[k];
    for (const [c, v] of Object.entries(s.competitorCounts)) {
      allCompetitors[c] = (allCompetitors[c] || 0) + v;
    }
  }

  const presence = totalN ? totalMentioned / totalN : 0;
  const citation = totalN ? totalCited / totalN : 0;
  const visibility = totalN ? totalVis / totalN : 0;
  const compTotal = Object.values(allCompetitors).reduce((a, b) => a + b, 0);
  const sov = (totalMentioned + compTotal) ? totalMentioned / (totalMentioned + compTotal) : 0;

  const out = [];
  out.push(`GEO CITATION TRACKER — READOUT · ${brand}${cfg.runDate ? ` · ${cfg.runDate}` : ''}`);
  out.push('═'.repeat(60));
  out.push('');
  out.push(`VERDICT   ${verdictFor(presence)}`);
  out.push('');
  out.push(`  Presence rate     ${padL(pct(presence), 7)}  ${bar(presence)}   named in ${totalMentioned}/${totalN} answers`);
  out.push(`  Citation rate     ${padL(pct(citation), 7)}  ${bar(citation)}   own domain sourced in ${totalCited}/${totalN}`);
  out.push(`  Visibility score  ${padL((visibility * 100).toFixed(1), 7)}  ${bar(visibility)}   rank-weighted`);
  out.push(`  Share of voice    ${padL(pct(sov), 7)}  ${bar(sov)}   vs ${Object.keys(allCompetitors).length} tracked competitors`);
  out.push('');

  // Per-engine table
  out.push('BY ENGINE');
  out.push(`  ${pad('engine', 14)}${padL('n', 5)}${padL('presence', 11)}${padL('citation', 11)}${padL('visibility', 12)}`);
  for (const [name, s] of Object.entries(perEngine)) {
    out.push(`  ${pad(name, 14)}${padL(s.n, 5)}${padL(pct(s.presenceRate), 11)}${padL(pct(s.citationRate), 11)}${padL((s.visibility * 100).toFixed(1), 12)}`);
  }
  out.push('');

  // Competitive leaderboard
  const board = [[brand, totalMentioned], ...Object.entries(allCompetitors)]
    .sort((a, b) => b[1] - a[1]);
  out.push('SHARE OF VOICE');
  const boardTotal = board.reduce((a, b) => a + b[1], 0) || 1;
  for (const [name, count] of board) {
    const share = count / boardTotal;
    const marker = name === brand ? '▸' : ' ';
    out.push(`  ${marker} ${pad(name, 22)}${padL(pct(share), 8)}  ${bar(share, 18)}`);
  }
  out.push('');

  // Framing
  if (totalMentioned > 0) {
    out.push('FRAMING (of answers where mentioned)');
    out.push(`  recommended ${framingTotal.recommended}   neutral ${framingTotal.neutral}   negative ${framingTotal.negative}`);
    out.push('');
  }

  // Movement vs prior run
  const prior = cfg.prior;
  const mdeRaw = totalN ? minDetectableEffect(presence || 0.01, totalN, alpha, power) : 0;
  const mde = mdeRaw;
  const mdeText = mdeRaw >= 1
    ? 'larger than the entire 0-100% scale — this prompt set cannot detect any change at all'
    : `${(mdeRaw * 100).toFixed(1)} pts`;
  out.push('MOVEMENT');
  if (prior && typeof prior.mentioned === 'number' && typeof prior.prompts === 'number') {
    const priorPresence = prior.prompts ? prior.mentioned / prior.prompts : 0;
    const delta = presence - priorPresence;
    const test = twoProportionTest(prior.mentioned, prior.prompts, totalMentioned, totalN);
    out.push(`  Presence  ${pct(priorPresence)} → ${pct(presence)}   ${pts(delta)}   p = ${test.p.toFixed(3)}`);
    if (test.p < alpha) {
      out.push(`  → REAL MOVEMENT. The change is larger than run-to-run noise (p < ${alpha}).`);
    } else {
      out.push('  → NOT DISTINGUISHABLE FROM NOISE. Do not report this as a result.');
      out.push(`     At n = ${totalN}, the smallest change you could reliably detect is ${mdeText}.`);
    }
    if (typeof prior.cited === 'number') {
      const priorCite = prior.prompts ? prior.cited / prior.prompts : 0;
      const ct = twoProportionTest(prior.cited, prior.prompts, totalCited, totalN);
      out.push(`  Citation  ${pct(priorCite)} → ${pct(citation)}   ${pts(citation - priorCite)}   p = ${ct.p.toFixed(3)}`);
    }
  } else {
    out.push('  No prior run supplied — this run is the baseline.');
    out.push(`  At n = ${totalN}, the smallest change a future run could reliably detect`);
    out.push(mdeRaw >= 1 ? `  is ${mdeText}.` : `  is ${mdeText}. Anything smaller than that is noise.`);
  }
  out.push('');

  // Diagnosis
  out.push('WHAT THIS MEANS');
  if (presence < 0.10) {
    out.push('  Effectively absent from AI answers on your own category prompts.');
    out.push('  → Check rendering first with seo-geo-aeo-audit. On a client-side-rendered');
    out.push('     site, no amount of content work moves this number.');
  } else if (presence >= 0.15 && citation < presence / 3) {
    out.push('  Mentioned but not sourced. Engines know the brand and describe it from');
    out.push('  their own priors — they are not reading and linking your pages. This is a');
    out.push('  content-extractability problem, not an awareness problem.');
    out.push('  → Run geo-content-optimization on the pages that should be the source.');
  } else if (framingTotal.negative > framingTotal.recommended) {
    out.push('  Present, but framed unfavourably more often than favourably. Volume work');
    out.push('  will amplify the wrong message.');
    out.push('  → Positioning problem. Run positioning-statement before more content.');
  } else if (sov < 0.20 && Object.keys(allCompetitors).length > 0) {
    out.push('  Visible, but losing the category. Competitors are cited far more often on');
    out.push('  the same prompts.');
    out.push('  → Look at which specific prompts they win and what those source pages do.');
  } else {
    out.push('  Position is holding. Keep the prompt set fixed and re-run on cadence.');
  }
  return out.join('\n');
}

/* ─────────────────────────────  CLI  ───────────────────────────── */

const HELP = `
AAJ — geo-citation-tracker engine

  node citation-tracker.js design  '<json>'
  node citation-tracker.js readout '<json>'
  node citation-tracker.js --demo
  node citation-tracker.js --help

DESIGN — how many prompts before a change is detectable
  {
    "baselinePresence": 0.30,      // current % of answers naming the brand
    "detectAbsoluteLift": 0.15,    // change worth detecting, in absolute points
    "engines": 4,                  // engines tracked (default 4)
    "alpha": 0.05,                 // default 0.05
    "power": 0.80,                 // default 0.80
    "cadence": "monthly"
  }

READOUT — score a completed run
  {
    "brand": "Acme",
    "runDate": "2026-07-24",
    "engines": {
      "chatgpt": [
        { "prompt": "best X for Y",
          "mentioned": true,       // brand named anywhere in the answer
          "rank": 2,               // order among named brands (1 = first)
          "cited": true,           // brand's OWN domain linked as a source
          "framing": "recommended",// recommended | neutral | negative
          "competitors": ["Rival A", "Rival B"] }
      ],
      "perplexity": [ ... ]
    },
    "prior": { "mentioned": 10, "cited": 4, "prompts": 40 }   // optional
  }

Presence and citation are different metrics and the gap between them is the
finding. Being described from an engine's priors is not the same as having
your page read and sourced.
`;

const DEMO_DESIGN = {
  baselinePresence: 0.30,
  detectAbsoluteLift: 0.15,
  engines: 4,
  cadence: 'monthly',
};

function demoRow(mentioned, rank, cited, framing, competitors) {
  return { mentioned, rank, cited, framing, competitors };
}

const DEMO_READOUT = {
  brand: 'Brightlane',
  runDate: '2026-07-24',
  engines: {
    chatgpt: [
      demoRow(true, 2, false, 'recommended', ['Userflow', 'Appcues']),
      demoRow(true, 4, false, 'neutral', ['Userflow', 'Appcues', 'Chameleon']),
      demoRow(false, 0, false, null, ['Userflow', 'Appcues']),
      demoRow(false, 0, false, null, ['Appcues']),
      demoRow(true, 1, true, 'recommended', ['Chameleon']),
      demoRow(false, 0, false, null, ['Userflow', 'Chameleon']),
      demoRow(false, 0, false, null, ['Userflow']),
      demoRow(true, 3, false, 'neutral', ['Userflow', 'Appcues']),
      demoRow(false, 0, false, null, ['Appcues', 'Chameleon']),
      demoRow(false, 0, false, null, ['Userflow']),
    ],
    perplexity: [
      demoRow(true, 1, true, 'recommended', ['Appcues']),
      demoRow(true, 3, false, 'neutral', ['Userflow', 'Appcues']),
      demoRow(false, 0, false, null, ['Userflow', 'Chameleon']),
      demoRow(true, 2, false, 'neutral', ['Userflow']),
      demoRow(false, 0, false, null, ['Appcues', 'Userflow']),
      demoRow(false, 0, false, null, ['Chameleon']),
      demoRow(true, 4, false, 'negative', ['Userflow', 'Appcues', 'Chameleon']),
      demoRow(false, 0, false, null, ['Userflow']),
      demoRow(false, 0, false, null, ['Appcues']),
      demoRow(false, 0, false, null, ['Userflow', 'Appcues']),
    ],
    claude: [
      demoRow(true, 2, false, 'neutral', ['Userflow']),
      demoRow(false, 0, false, null, ['Appcues', 'Userflow']),
      demoRow(false, 0, false, null, ['Userflow']),
      demoRow(true, 3, false, 'neutral', ['Appcues', 'Chameleon']),
      demoRow(false, 0, false, null, ['Userflow', 'Appcues']),
      demoRow(false, 0, false, null, ['Chameleon']),
      demoRow(false, 0, false, null, ['Userflow']),
      demoRow(true, 1, false, 'recommended', []),
      demoRow(false, 0, false, null, ['Appcues']),
      demoRow(false, 0, false, null, ['Userflow', 'Appcues']),
    ],
    ai_overviews: [
      demoRow(false, 0, false, null, ['Userflow', 'Appcues']),
      demoRow(false, 0, false, null, ['Appcues']),
      demoRow(true, 4, false, 'neutral', ['Userflow', 'Appcues', 'Chameleon']),
      demoRow(false, 0, false, null, ['Userflow']),
      demoRow(false, 0, false, null, ['Chameleon', 'Appcues']),
      demoRow(false, 0, false, null, ['Userflow']),
      demoRow(false, 0, false, null, ['Appcues']),
      demoRow(false, 0, false, null, ['Userflow', 'Chameleon']),
      demoRow(true, 3, false, 'neutral', ['Userflow']),
      demoRow(false, 0, false, null, ['Appcues']),
    ],
  },
  prior: { mentioned: 11, cited: 2, prompts: 40 },
};

function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP.trim());
    return;
  }

  if (argv.includes('--demo')) {
    console.log('▸ DEMO 1 — design mode\n');
    console.log(design(DEMO_DESIGN));
    console.log('\n\n▸ DEMO 2 — readout mode\n');
    console.log(readout(DEMO_READOUT));
    console.log('\n(Demo data. Replace with a real logged run.)');
    return;
  }

  const mode = argv[0];
  const raw = argv[1];
  if (!raw) die(`mode "${mode}" needs a JSON argument. Try --demo to see the shape.`);

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    die(`could not parse JSON — ${e.message}`);
  }

  if (mode === 'design') console.log(design(cfg));
  else if (mode === 'readout') console.log(readout(cfg));
  else die(`unknown mode "${mode}". Use design, readout, --demo, or --help.`);
}

if (require.main === module) main();

module.exports = {
  design, readout, scoreEngine, verdictFor,
  twoProportionTest, sampleSizePerArm, minDetectableEffect,
  normalCdf, normalQuantile,
};
