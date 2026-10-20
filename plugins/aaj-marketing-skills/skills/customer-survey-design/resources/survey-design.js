#!/usr/bin/env node
/*
 * AAJ Customer Survey Design — sampling engine
 * Part of the "customer-survey-design" Agent Skill.
 *
 * Answers the two questions every survey plan gets wrong: how many completes
 * do you actually need, and which segment cuts will be readable afterwards.
 *
 * USAGE
 *   node survey-design.js --demo                 # both modes, worked examples
 *   node survey-design.js sample '<json>'        # required completes + invites
 *   node survey-design.js segments '<json>'      # per-cut margin of error
 *   node survey-design.js --help
 *
 * CONFIG (JSON)
 *   sample:
 *     { "marginOfError": 5,          // ± percentage points you can accept
 *       "confidence": 95,            // 90 | 95 | 99
 *       "expectedProportion": 50,    // % — use 50 if unsure (worst case)
 *       "population": 2000,          // optional — total reachable audience
 *       "responseRate": 20 }         // optional % — turns completes into invites
 *   segments:
 *     { "completes": 400, "confidence": 95,
 *       "segments": [ { "name": "SMB", "share": 55 },
 *                     { "name": "Mid-Market", "share": 30 },
 *                     { "name": "Enterprise", "share": 15 } ] }
 *
 * Readability thresholds are working labels, not laws: ±5pp or tighter reads
 * clean, ±5–8pp directional, wider than ±8pp is noise for most decisions.
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

const Z = { 90: 1.645, 95: 1.960, 99: 2.576 };

function pct(v) {
  // Accept 20 or 0.2 for "20%".
  if (v == null || isNaN(v)) return null;
  return v > 1 ? v / 100 : v;
}

function sampleSize(cfg) {
  const conf = cfg.confidence || 95;
  const z = Z[conf];
  if (!z) throw new Error(`confidence must be 90, 95 or 99 (got ${cfg.confidence})`);
  const e = pct(cfg.marginOfError);
  if (!e || e <= 0 || e >= 0.5) throw new Error('marginOfError must be a positive ± in points, e.g. 5');
  const p = pct(cfg.expectedProportion != null ? cfg.expectedProportion : 50);
  if (p <= 0 || p >= 1) throw new Error('expectedProportion must be between 0 and 100 (exclusive)');

  const n0 = (z * z * p * (1 - p)) / (e * e);
  let n = n0, fpcApplied = false;
  const N = cfg.population;
  if (N && N > 0) { n = n0 / (1 + (n0 - 1) / N); fpcApplied = true; }
  n = Math.ceil(n);

  let invites = null, feasible = null;
  const rr = pct(cfg.responseRate);
  if (rr) {
    if (rr <= 0 || rr > 1) throw new Error('responseRate must be between 0 and 100');
    invites = Math.ceil(n / rr);
    if (N) feasible = invites <= N;
  }
  return { z, conf, e, p, n0: Math.ceil(n0), n, N: N || null, fpcApplied, rr: rr || null, invites, feasible };
}

function segmentMoE(nSeg, z) {
  // Worst-case p = 0.5 for a proportion read within the cell.
  return z * Math.sqrt(0.25 / nSeg);
}

function readLabel(moePP) {
  if (moePP <= 5) return ['READ', 'clean read'];
  if (moePP <= 8) return ['CAUTION', 'directional only'];
  return ['DON\u2019T READ', 'noise at this size'];
}

function segments(cfg) {
  const conf = cfg.confidence || 95;
  const z = Z[conf];
  if (!z) throw new Error(`confidence must be 90, 95 or 99 (got ${cfg.confidence})`);
  const n = cfg.completes;
  if (!n || n < 1) throw new Error('completes must be a positive number');
  if (!Array.isArray(cfg.segments) || !cfg.segments.length) throw new Error('segments must be a non-empty array of {name, share}');
  const shareSum = cfg.segments.reduce((a, s) => a + (pct(s.share) || 0), 0);
  const rows = cfg.segments.map(s => {
    const share = pct(s.share);
    if (share == null || share <= 0) throw new Error(`segment "${s.name}" needs a positive share`);
    const nSeg = Math.round(n * share);
    const moe = nSeg > 0 ? segmentMoE(nSeg, z) * 100 : Infinity;
    const [flag, note] = readLabel(moe);
    return { name: s.name, share, nSeg, moe, flag, note };
  });
  return { conf, z, n, rows, shareSum };
}

/* ---------- rendering ---------- */

function bar(v, max, width) {
  const w = Math.max(0, Math.round((v / max) * width));
  return '\u2588'.repeat(w) + '\u2591'.repeat(width - w);
}

function renderSample(r) {
  const L = [];
  L.push('AAJ \u00b7 SURVEY SAMPLE SIZE');
  L.push('\u2500'.repeat(56));
  L.push(`Target read        \u00b1${(r.e * 100).toFixed(1)}pp at ${r.conf}% confidence (z=${r.z})`);
  L.push(`Assumed proportion ${(r.p * 100).toFixed(0)}%${r.p === 0.5 ? ' (worst case \u2014 safest)' : ''}`);
  L.push('');
  L.push(`Completes needed   ${r.n}${r.fpcApplied ? `   (infinite-population n=${r.n0}, corrected for N=${r.N})` : ''}`);
  if (r.invites != null) {
    L.push(`Invites needed     ${r.invites}   (at ${(r.rr * 100).toFixed(0)}% response rate)`);
  }
  L.push('');
  if (r.feasible === false) {
    L.push(`\u25bc NOT FEASIBLE \u2014 you need ${r.invites} invites but only have ${r.N} people.`);
    L.push('  Loosen the margin, lift the response rate (incentive, reminders),');
    L.push('  or accept a census of everyone you can reach and report the achieved \u00b1.');
  } else if (r.feasible === true) {
    L.push(`\u25b2 FEASIBLE \u2014 ${r.invites} invites fits inside your ${r.N}-person audience.`);
  } else {
    L.push('\u25b8 Add "responseRate" (and "population" if finite) to turn completes into a send plan.');
  }
  return L.join('\n');
}

function renderSegments(r) {
  const L = [];
  L.push('AAJ \u00b7 SEGMENT READABILITY');
  L.push('\u2500'.repeat(64));
  L.push(`Total completes ${r.n} \u00b7 ${r.conf}% confidence \u00b7 worst-case p=50%`);
  if (Math.abs(r.shareSum - 1) > 0.02) L.push(`\u26a0 segment shares sum to ${(r.shareSum * 100).toFixed(0)}% \u2014 check the mix`);
  L.push('');
  L.push('Segment          n     \u00b1MoE    ' + ' '.repeat(12) + 'Verdict');
  for (const s of r.rows) {
    L.push(
      s.name.padEnd(14) +
      String(s.nSeg).padStart(5) +
      `  \u00b1${s.moe.toFixed(1)}pp  `.padEnd(11) +
      bar(Math.min(s.moe, 15), 15, 12) + '  ' +
      `${s.flag} (${s.note})`
    );
  }
  L.push('');
  const bad = r.rows.filter(s => s.flag !== 'READ');
  if (!bad.length) L.push('\u25b2 Every planned cut is readable at this sample size.');
  else {
    const worst = bad.reduce((a, s) => (s.nSeg < a.nSeg ? s : a), bad[0]);
    const needed = Math.ceil(0.25 * r.z * r.z / Math.pow(0.05, 2)); // n per cell for ±5pp
    L.push(`\u25bc ${bad.length} cut(s) below a clean read. Smallest cell "${worst.name}" (n=${worst.nSeg}) is \u00b1${worst.moe.toFixed(1)}pp.`);
    L.push(`  A \u00b15pp read needs ~${needed} completes per cell at ${r.conf}% \u2014 either boost total n,`);
    L.push('  oversample the small segment, or merge it into a wider cut before fielding.');
  }
  return L.join('\n');
}

/* ---------- CLI ---------- */

const HELP = `AAJ Customer Survey Design \u2014 sampling engine

MODES
  sample '<json>'     completes + invites needed for a target margin of error
  segments '<json>'   per-segment margin of error for your planned cuts
  --demo              run both worked examples (no arguments needed)

SCHEMA
  sample:   { "marginOfError": 5, "confidence": 95, "expectedProportion": 50,
              "population": 2000, "responseRate": 20 }
            population and responseRate optional; percents accept 20 or 0.2.
  segments: { "completes": 400, "confidence": 95,
              "segments": [ { "name": "SMB", "share": 55 }, ... ] }

Confidence must be 90, 95 or 99. Margin thresholds: \u00b15pp clean, \u00b15\u20138pp
directional, wider is noise \u2014 working labels, not laws.`;

function demo() {
  console.log('\u25b8 DEMO 1 \u2014 sample mode (Brightlane onboarding NPS-driver survey)');
  console.log(renderSample(sampleSize({ marginOfError: 5, confidence: 95, expectedProportion: 50, population: 2000, responseRate: 20 })));
  console.log('');
  console.log('\u25b8 DEMO 2 \u2014 segments mode (can we read Enterprise separately?)');
  console.log(renderSegments(segments({
    completes: 323, confidence: 95,
    segments: [
      { name: 'SMB', share: 55 },
      { name: 'Mid-Market', share: 30 },
      { name: 'Enterprise', share: 15 }
    ]
  })));
}

function main() {
  const [mode, arg] = process.argv.slice(2);
  try {
    if (!mode || mode === '--demo') return demo();
    if (mode === '--help' || mode === '-h') return console.log(HELP);
    if (mode === 'sample' || mode === 'segments') {
      if (!arg) throw new Error(`${mode} mode needs a JSON config \u2014 run --demo to see one`);
      let cfg;
      try { cfg = JSON.parse(arg); }
      catch (e) { throw new Error('Invalid JSON. Run --demo for a worked example, --help for the schema.'); }
      const out = mode === 'sample' ? renderSample(sampleSize(cfg)) : renderSegments(segments(cfg));
      return console.log(out);
    }
    throw new Error(`Unknown mode "${mode}". Modes: sample, segments, --demo, --help`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { sampleSize, segments, segmentMoE, readLabel, pct, renderSample, renderSegments };
