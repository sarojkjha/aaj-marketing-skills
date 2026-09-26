#!/usr/bin/env node
/*
 * AAJ Market Sizing — engine
 * Part of the "market-sizing" Agent Skill.
 *
 * Bottom-up TAM, SAM and SOM, from the AAJ position that a market size is a
 * chain of counts and assumptions, and it is only as good as the weakest link
 * nobody sourced.
 *
 *   TAM  every account in the segments you named, times what one would pay
 *   SAM  the share of those that fit your ICP and that your channels can reach
 *   SOM  what your capacity can actually win in a year - never "1% of SAM"
 *
 * USAGE
 *   node market-size.js                    # demo
 *   node market-size.js '<json-config>'    # your own
 *   node market-size.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "segments": [
 *       { "name": "US logistics brokers, 20-200 staff",
 *         "accounts": 4200,            "accountsSource": "industry register, 2026 export",
 *         "fitShare": 0.4,             "fitSource": "sample of 50 checked by hand",
 *         "reachableShare": 0.7,       "reachSource": "share with a named ops lead on LinkedIn",
 *         "acv": 9000 }                // annual value of one account, in currency units
 *     ],
 *     "acvBasis": "current-pricing" | "planned-pricing" | "aspirational",
 *     "capacity": { "type": "sales",      "reps": 2, "dealsPerRepPerYear": 20 }
 *               | { "type": "pipeline",   "opportunitiesPerYear": 150, "winRate": 0.2 }
 *               | { "type": "self-serve", "signupsPerYear": 4000, "paidConversion": 0.05 },
 *     "claimedShareOfSam": 0.05,       // optional: a share someone wants to present
 *     "topDown": { "value": 1.2e9, "source": "analyst report, 2025", "scope": "what it counts" },
 *     "currency": "USD"
 *   }
 *
 * fitShare and reachableShare are fractions from 0 to 1. Every segment needs a
 * source for its account count and its fit share; the engine reports any that
 * are missing rather than refusing to run, because an unsourced number is a
 * finding, not an error.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const frac = (v) => num(v) !== null && v >= 0 && v <= 1;
const hasText = (v) => typeof v === 'string' && v.trim().length >= 3;

// Any gap wider than this between the bottom-up TAM and a top-down figure is
// reported as a definition mismatch rather than averaged away. It is a rule of
// this engine, not an industry benchmark.
const TRIANGULATION_TOLERANCE = 3;

/* ─────────────────────────── validation ─────────────────────────── */

function validate(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  if (!Array.isArray(cfg.segments) || cfg.segments.length === 0) {
    die('Give at least one segment in "segments".',
      'A market size with no segments is a top-down number. Bring the count of accounts you could actually sell to.');
  }
  cfg.segments.forEach((s, i) => {
    const at = `segments[${i}]${s && s.name ? ` ("${s.name}")` : ''}`;
    if (!s || typeof s !== 'object') die(`${at} must be an object.`);
    if (!hasText(s.name)) die(`${at} needs a "name".`);
    if (num(s.accounts) === null || s.accounts <= 0) die(`${at}: "accounts" must be a positive number - the count of companies (or buyers) in the segment.`);
    if (num(s.acv) === null || s.acv <= 0) die(`${at}: "acv" must be a positive number - what one account pays per year.`);
    if (s.fitShare !== undefined && !frac(s.fitShare)) die(`${at}: "fitShare" must be a fraction between 0 and 1.`, 'Write 40% as 0.4.');
    if (s.reachableShare !== undefined && !frac(s.reachableShare)) die(`${at}: "reachableShare" must be a fraction between 0 and 1.`, 'Write 70% as 0.7.');
  });
  if (cfg.claimedShareOfSam !== undefined && !frac(cfg.claimedShareOfSam)) {
    die('"claimedShareOfSam" must be a fraction between 0 and 1.', 'Write 5% as 0.05.');
  }
  const c = cfg.capacity;
  if (c !== undefined) {
    if (!c || typeof c !== 'object') die('"capacity" must be an object.');
    if (c.type === 'sales') {
      if (num(c.reps) === null || c.reps < 0 || num(c.dealsPerRepPerYear) === null || c.dealsPerRepPerYear < 0)
        die('Sales capacity needs "reps" and "dealsPerRepPerYear".');
    } else if (c.type === 'pipeline') {
      if (num(c.opportunitiesPerYear) === null || c.opportunitiesPerYear < 0 || !frac(c.winRate))
        die('Pipeline capacity needs "opportunitiesPerYear" and "winRate" (a fraction).');
    } else if (c.type === 'self-serve') {
      if (num(c.signupsPerYear) === null || c.signupsPerYear < 0 || !frac(c.paidConversion))
        die('Self-serve capacity needs "signupsPerYear" and "paidConversion" (a fraction).');
    } else {
      die('"capacity.type" must be "sales", "pipeline" or "self-serve".');
    }
  }
  if (cfg.topDown !== undefined) {
    if (!cfg.topDown || num(cfg.topDown.value) === null || cfg.topDown.value <= 0)
      die('"topDown.value" must be a positive number in the same currency as "acv".');
  }
  if (cfg.acvBasis !== undefined && !['current-pricing', 'planned-pricing', 'aspirational'].includes(cfg.acvBasis)) {
    die('"acvBasis" must be "current-pricing", "planned-pricing" or "aspirational".');
  }
}

/* ─────────────────────────── the model ─────────────────────────── */

function winsPerYear(c) {
  if (!c) return null;
  if (c.type === 'sales') return c.reps * c.dealsPerRepPerYear;
  if (c.type === 'pipeline') return c.opportunitiesPerYear * c.winRate;
  return c.signupsPerYear * c.paidConversion;
}

function size(cfg) {
  validate(cfg);
  const findings = [];

  const segs = cfg.segments.map((s) => {
    const fit = s.fitShare === undefined ? 1 : s.fitShare;
    const reach = s.reachableShare === undefined ? 1 : s.reachableShare;
    const tamAccounts = s.accounts;
    const samAccounts = s.accounts * fit * reach;
    return {
      name: s.name,
      acv: s.acv,
      fit, reach,
      tamAccounts, samAccounts,
      tam: tamAccounts * s.acv,
      sam: samAccounts * s.acv,
      sourced: {
        accounts: hasText(s.accountsSource),
        fit: s.fitShare === undefined ? null : hasText(s.fitSource),
        reach: s.reachableShare === undefined ? null : hasText(s.reachSource),
      },
      assumedFit: s.fitShare === undefined,
      assumedReach: s.reachableShare === undefined,
    };
  });

  const tam = segs.reduce((a, s) => a + s.tam, 0);
  const sam = segs.reduce((a, s) => a + s.sam, 0);
  const samAccounts = segs.reduce((a, s) => a + s.samAccounts, 0);
  const tamAccounts = segs.reduce((a, s) => a + s.tamAccounts, 0);
  const samAcv = samAccounts > 0 ? sam / samAccounts : 0; // SAM-weighted ACV

  // ---- sourcing: every link in the chain
  segs.forEach((s) => {
    if (!s.sourced.accounts) findings.push({ level: 'fix', id: 'unsourced-accounts', segment: s.name,
      text: `The account count for "${s.name}" has no source. It is the base every other number multiplies, so it is the first thing a reader will ask about.` });
    if (s.assumedFit) findings.push({ level: 'fix', id: 'no-fit', segment: s.name,
      text: `No ICP fit share for "${s.name}", so every account counts as a fit. That makes SAM equal to TAM for this segment, which is almost never true.` });
    else if (s.sourced.fit === false) findings.push({ level: 'fix', id: 'unsourced-fit', segment: s.name,
      text: `The fit share for "${s.name}" (${pct(s.fit)}) has no source. Check a sample of real accounts by hand and record how many fit.` });
    if (s.assumedReach) findings.push({ level: 'improve', id: 'no-reach', segment: s.name,
      text: `No reachable share for "${s.name}", so every fitting account is assumed reachable by your channels today.` });
    else if (s.sourced.reach === false) findings.push({ level: 'improve', id: 'unsourced-reach', segment: s.name,
      text: `The reachable share for "${s.name}" (${pct(s.reach)}) has no source. Say which channel reaches them and how you counted.` });
  });

  // ---- ACV basis
  if (cfg.acvBasis === 'aspirational') findings.push({ level: 'fix', id: 'acv-aspirational',
    text: 'The ACV is aspirational. Size the market on the price people pay today, and show the aspirational version separately if you must.' });
  else if (cfg.acvBasis === undefined) findings.push({ level: 'improve', id: 'acv-basis',
    text: 'The ACV basis is not stated. Say whether it is current pricing or planned pricing - a reader will assume the more flattering one.' });

  // ---- SOM from capacity
  const wins = winsPerYear(cfg.capacity);
  let som = null, somAccounts = null, impliedShare = null, claim = null;
  if (wins === null) {
    findings.push({ level: 'fix', id: 'no-capacity',
      text: 'No capacity given, so there is no SOM. The obtainable market is what your team and channels can win in a year, not a share of SAM - add "capacity".' });
  } else {
    somAccounts = Math.min(wins, samAccounts);
    som = somAccounts * samAcv;
    impliedShare = samAccounts > 0 ? somAccounts / samAccounts : 0;
    if (wins > samAccounts) findings.push({ level: 'fix', id: 'capacity-exceeds-sam',
      text: `Capacity (${fmtN(wins)} wins a year) is larger than the whole SAM (${fmtN(samAccounts)} accounts). Either SAM is drawn too tightly or the capacity figure is not real.` });
    if (cfg.claimedShareOfSam !== undefined) {
      const neededWins = Math.ceil(cfg.claimedShareOfSam * samAccounts);
      claim = {
        share: cfg.claimedShareOfSam,
        neededWins,
        capacityWins: wins,
        supported: neededWins <= wins,
      };
      if (!claim.supported) findings.push({ level: 'fix', id: 'claim-outruns-capacity',
        text: `The claimed ${pct(cfg.claimedShareOfSam)} of SAM needs ${fmtN(neededWins)} wins a year; current capacity delivers ${fmtN(wins)}. Present the capacity number, or show the hiring or channel plan that closes the gap.` });
    }
  }

  // ---- triangulation
  let tri = null;
  if (cfg.topDown) {
    const ratio = tam / cfg.topDown.value;
    tri = { value: cfg.topDown.value, source: cfg.topDown.source || null, scope: cfg.topDown.scope || null, ratio };
    if (!hasText(cfg.topDown.source)) findings.push({ level: 'fix', id: 'topdown-unsourced',
      text: 'The top-down figure has no source. An unsourced analyst number is worse than none, because it looks authoritative.' });
    if (ratio > TRIANGULATION_TOLERANCE || ratio < 1 / TRIANGULATION_TOLERANCE) findings.push({ level: 'improve', id: 'triangulation-gap',
      text: `The bottom-up TAM is ${ratio >= 1 ? fmtX(ratio) + ' larger than' : fmtX(1 / ratio) + ' smaller than'} the top-down figure. A gap that wide usually means the two are not counting the same market - compare their definitions before quoting either.` });
  }

  // ---- which assumption to verify first: the unsourced input under the
  // largest share of SAM. Every factor is multiplicative, so a 10% error in
  // any input of a segment moves SAM by 10% of that segment's contribution.
  const ranked = segs.slice().sort((a, b) => b.sam - a.sam).map((s) => ({
    name: s.name,
    samShare: sam > 0 ? s.sam / sam : 0,
    weakest: !s.sourced.accounts ? 'account count'
      : s.assumedFit || s.sourced.fit === false ? 'fit share'
      : s.assumedReach || s.sourced.reach === false ? 'reachable share'
      : null,
  }));
  const verifyFirst = ranked.find((r) => r.weakest) || null;

  const fixes = findings.filter((f) => f.level === 'fix').length;
  let verdict;
  if (fixes === 0) verdict = { level: 'defensible', headline: 'Defensible', body: 'Every count is sourced and SOM comes from capacity. This will survive a sceptical reader.' };
  else if (findings.some((f) => /unsourced|no-fit|acv-aspirational|topdown-unsourced/.test(f.id))) verdict = { level: 'unsourced', headline: 'Needs sources', body: 'The arithmetic holds, but links in the chain have no source. Fix those before the number goes in a deck.' };
  else verdict = { level: 'incomplete', headline: 'Incomplete', body: 'The sized market is sourced, but the obtainable part is not grounded in capacity yet.' };

  return {
    currency: cfg.currency || 'USD',
    tam, sam, som,
    tamAccounts, samAccounts, somAccounts,
    samAcv, wins, impliedShare, claim, triangulation: tri,
    segments: segs, ranked, verifyFirst,
    findings, verdict,
  };
}

/* ─────────────────────────── rendering ─────────────────────────── */

function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }
function fmtN(v) { return v >= 10 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10) / 10); }
function fmtX(v) { return (Math.round(v * 10) / 10) + 'x'; }
function money(v, cur) {
  const sym = cur === 'USD' ? '$' : cur === 'GBP' ? '£' : cur === 'EUR' ? '€' : '';
  const suffix = sym ? '' : ' ' + cur;
  const a = Math.abs(v);
  const s = a >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v));
  return sym + s + suffix;
}

function render(r) {
  const c = r.currency, L = [];
  L.push('');
  L.push('AAJ - MARKET SIZING');
  L.push('-'.repeat(66));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  L.push('');
  L.push(`  TAM  ${money(r.tam, c).padEnd(12)} ${fmtN(r.tamAccounts)} accounts`);
  L.push(`  SAM  ${money(r.sam, c).padEnd(12)} ${fmtN(r.samAccounts)} accounts that fit and can be reached`);
  if (r.som !== null) {
    L.push(`  SOM  ${money(r.som, c).padEnd(12)} ${fmtN(r.somAccounts)} wins a year from current capacity (${pct(r.impliedShare)} of SAM)`);
  } else {
    L.push('  SOM  not computed - no capacity given');
  }
  L.push('');
  L.push('BY SEGMENT');
  r.segments.forEach((s) => {
    L.push(`  ${s.name}`);
    L.push(`    ${fmtN(s.tamAccounts)} accounts x ${pct(s.fit)} fit${s.assumedFit ? ' (assumed)' : ''} x ${pct(s.reach)} reachable${s.assumedReach ? ' (assumed)' : ''} x ${money(s.acv, c)} ACV = SAM ${money(s.sam, c)}`);
  });
  if (r.claim) {
    L.push('');
    L.push('CLAIMED SHARE');
    L.push(`  ${pct(r.claim.share)} of SAM needs ${fmtN(r.claim.neededWins)} wins a year; capacity delivers ${fmtN(r.claim.capacityWins)}. ${r.claim.supported ? 'Supported.' : 'Not supported.'}`);
  }
  if (r.triangulation) {
    L.push('');
    L.push('TRIANGULATION');
    const t = r.triangulation;
    const rel = t.ratio >= 1 ? fmtX(t.ratio) + ' the size of it' : fmtX(1 / t.ratio) + ' smaller';
    L.push(`  Top-down ${money(t.value, c)}${t.source ? ' (' + t.source + ')' : ' (no source)'}; bottom-up TAM is ${rel}.`);
  }
  if (r.verifyFirst) {
    L.push('');
    L.push('VERIFY FIRST');
    L.push(`  The ${r.verifyFirst.weakest} for "${r.verifyFirst.name}" - it sits under ${pct(r.verifyFirst.samShare)} of SAM.`);
  }
  if (r.findings.length) {
    L.push('');
    L.push('FINDINGS');
    r.findings.filter((f) => f.level === 'fix').forEach((f) => L.push(`  !  ${f.text}`));
    r.findings.filter((f) => f.level === 'improve').forEach((f) => L.push(`  -  ${f.text}`));
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Illustrative only: invented segments and numbers, not a real market.
const DEMO = {
  segments: [
    { name: 'US freight brokers, 20-200 staff', accounts: 4200, accountsSource: 'state broker register export',
      fitShare: 0.4, fitSource: 'hand-checked sample of 50', reachableShare: 0.7, reachSource: 'named ops lead findable on LinkedIn',
      acv: 9000 },
    { name: 'US 3PL warehouses, 50-500 staff', accounts: 2600, accountsSource: 'trade association member list',
      fitShare: 0.25, reachableShare: 0.5, acv: 14000 },
  ],
  acvBasis: 'current-pricing',
  capacity: { type: 'sales', reps: 2, dealsPerRepPerYear: 20 },
  claimedShareOfSam: 0.05,
  topDown: { value: 900000000, source: '', scope: 'all logistics software, all sizes' },
  currency: 'USD',
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: two illustrative logistics segments, a two-person sales team, and an unsourced top-down figure)');
  }
  try {
    console.log(render(size(cfg)));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { size, winsPerYear, TRIANGULATION_TOLERANCE };
