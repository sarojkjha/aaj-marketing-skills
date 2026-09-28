#!/usr/bin/env node
/*
 * AAJ Marketing Maturity Assessment — engine
 * Part of the "marketing-maturity-assessment" Agent Skill.
 *
 * AAJ's position: marketing maturity is how well the function works as a
 * connected system - position, demand, conversion, pipeline, retention,
 * measurement - not how many tactics are running. The engine scores the
 * same 18 statements as AAJ's Marketing Maturity Scorecard (0-3 each, six
 * dimensions normalised to 0-100, equal weights, four qualitative bands),
 * names the weak links to fix first for your stage, asks for the evidence
 * behind any high self-score, and compares with a previous run. The bands
 * are AAJ's thresholds, not percentiles: nothing here is a benchmark
 * against other companies.
 *
 * USAGE
 *   node maturity-assessment.js                    # demo
 *   node maturity-assessment.js '<json-config>'    # your own
 *   node maturity-assessment.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "stage": "seed",                       // pre-seed | seed | series-a | series-b (optional; tailors the focus)
 *     "answers": {                           // 0 Not yet, 1 Partly, 2 Mostly, 3 Fully - three per dimension, in question order
 *       "positioning": [3, 2, 2],
 *       "audience":    [2, 1, 1],
 *       "conversion":  [2, 2, 0],
 *       "pipeline":    [1, 1, 0],
 *       "retention":   [1, 0, 0],
 *       "measurement": [1, 0, 1]
 *     },
 *     "evidence": {                          // optional: true if the artefact exists and was checked
 *       "positioning": true,                 // a written positioning statement the team uses
 *       "audience": false,                   // a written ICP and CAC by channel
 *       "measurement": false                 // CAC, LTV and payback figures from the last quarter
 *     },
 *     "previous": { "answers": { ... } }     // optional: an earlier run, for the change per dimension
 *   }
 *
 * Run --help and read the DIMENSIONS section of the output for the 18 statements.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var SCALE = ['Not yet', 'Partly', 'Mostly', 'Fully'];
var BANDS = [
  { min: 85, label: 'Compounding', read: 'A mature system where the math compounds. The work now is finding the next leverage point, not fixing fundamentals.' },
  { min: 65, label: 'Established', read: 'A working growth system. The biggest opportunity is sharpening the weak links so the whole thing pulls together.' },
  { min: 40, label: 'Emerging', read: 'A system taking shape, with a few clear gaps holding the rest back. Close those and the pieces start compounding.' },
  { min: 0, label: 'Scattered', read: 'Capable tactics that are not yet a system. The fastest gains come from connecting them, not adding more.' },
];
var WEAK_THIRD_BELOW = 50;      // a third weak link is named only if it scores under this (the scorecard's rule)
var EVIDENCE_GATE = 67;         // a dimension scoring at or above this with no evidence is flagged (engine rule: "Mostly" across the board)
var DIMS = [
  { id: 'positioning', name: 'Positioning & Messaging', qs: [
      'We can say in one sentence who we are for and why we are different, and the team says it the same way.',
      'Our difference is real and defensible, not a list of features or adjectives anyone could claim.',
      'Our site and pitch lead with the customer\'s problem and proof, not our product\'s specs.'],
    evidence: 'a written positioning statement the team actually uses',
    weak: 'The core story is not locked, and everything downstream gets harder and pricier without it.',
    strong: 'A clear, consistent story the whole team can repeat.',
    move: 'Lock the story before you spend on demand.', skills: ['positioning-statement', 'messaging-framework', 'brand-product-context'] },
  { id: 'audience', name: 'Audience & Demand', qs: [
      'We have a written, specific ICP, and an anti-ICP, that both marketing and sales actually use.',
      'We know our two or three best channels by CAC and payback, not just by traffic or volume.',
      'We run a repeatable demand engine, not a series of one-off campaigns.'],
    evidence: 'a written ICP, and CAC by channel for the last quarter',
    weak: 'Spend is spread thin. Without a sharp ICP and proven channels, budget quietly leaks.',
    strong: 'A focused ICP and a channel mix you can point to with numbers.',
    move: 'Concentrate spend on what pays back.', skills: ['target-account-list', 'paid-media-budget-allocation', 'marketing-loops'] },
  { id: 'conversion', name: 'Website & Conversion', qs: [
      'A first-time visitor understands what we do, and what to do next, within about five seconds.',
      'We have clear conversion paths (demo, trial or call) with lead capture that works.',
      'We test and improve our key pages instead of guessing.'],
    evidence: 'a conversion rate per key page and at least one test run in the last quarter',
    weak: 'Traffic is landing on a site that does not convert; you are paying to fill a leaky funnel.',
    strong: 'A site that makes the next step obvious, and gets tested rather than guessed.',
    move: 'Fix the leaks before buying more traffic.', skills: ['website-conversion-audit', 'landing-page-brief', 'ab-test-significance'] },
  { id: 'pipeline', name: 'Sales & Pipeline', qs: [
      'We have a documented sales process with clear qualification, not deal-by-deal improvisation.',
      'Pipeline is visible, and we can forecast the quarter with reasonable confidence.',
      'We capture why we win and lose, and feed it back into the message.'],
    evidence: 'a written stage definition and last quarter\'s forecast against actual',
    weak: 'Without a visible, qualified pipeline, the forecast is a guess and the message flies blind.',
    strong: 'A pipeline you can see and a forecast you can stand behind.',
    move: 'Make the number defensible.', skills: ['sales-process-design', 'pipeline-and-forecast', 'win-loss-analysis'] },
  { id: 'retention', name: 'Retention & Expansion', qs: [
      'New customers reach first value quickly through a deliberate onboarding, not by luck.',
      'We track churn and net revenue retention, and we know our top churn reasons.',
      'We have a motion to expand existing accounts: upsell, cross-sell or usage growth.'],
    evidence: 'NRR and GRR for the last twelve months and a coded list of churn reasons',
    weak: 'Growth leaks out the back. Without retention and expansion, every new customer costs more than it should.',
    strong: 'Customers reach value, stick and grow; the engine compounds.',
    move: 'This is where the math compounds: map onboarding and the top churn drivers.', skills: ['onboarding-activation', 'lifecycle-and-retention', 'email-lifecycle-sequence'] },
  { id: 'measurement', name: 'Measurement & Economics', qs: [
      'We know our CAC, LTV and payback, and they actually inform what we spend.',
      'We can attribute results to channels well enough to move budget with confidence.',
      'We review the same core marketing metrics on a regular cadence.'],
    evidence: 'CAC, LTV and payback figures from the last quarter, and the date of the last metrics review',
    weak: 'Decisions are running on opinion, not evidence: hard to defend and easy to waste.',
    strong: 'The numbers are known, watched and tied to decisions.',
    move: 'Instrument before you scale.', skills: ['unit-economics', 'marketing-report', 'incrementality-and-mmm'] },
];
var STAGES = {
  'pre-seed': { label: 'Pre-seed', focus: ['positioning', 'audience'], note: 'At pre-seed, a sharp story and one repeatable channel matter far more than scale.' },
  'seed': { label: 'Seed', focus: ['audience', 'conversion'], note: 'At seed, a repeatable demand engine and a site that converts are where focus pays back fastest.' },
  'series-a': { label: 'Series A', focus: ['conversion', 'pipeline', 'measurement'], note: 'At Series A, the job is making growth efficient and the numbers defensible.' },
  'series-b': { label: 'Series B', focus: ['retention', 'measurement'], note: 'At Series B, retention and measurement are what protect and prove the growth you have built.' },
};

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function bandOf(score) { for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i].min) return BANDS[i]; return BANDS[BANDS.length - 1]; }

function scoreDim(d, ans) {
  if (!Array.isArray(ans) || ans.length !== 3) throw inputError('"answers.' + d.id + '" needs three values, 0 to 3, in question order.');
  var sum = 0;
  ans.forEach(function (v, i) {
    if (!isNum(v) || v < 0 || v > 3 || Math.round(v) !== v) throw inputError('"answers.' + d.id + '[' + i + ']" must be a whole number from 0 (Not yet) to 3 (Fully).');
    sum += v;
  });
  return Math.round(sum / 9 * 100);
}

function scoreAll(answers) {
  answers = answers || {};
  var rows = DIMS.map(function (d) { var s = scoreDim(d, answers[d.id]); return { id: d.id, name: d.name, score: s, band: bandOf(s).label, answers: answers[d.id].slice() }; });
  var overall = Math.round(rows.reduce(function (a, r) { return a + r.score; }, 0) / rows.length);
  return { rows: rows, overall: overall };
}

function assess(cfg) {
  cfg = cfg || {};
  if (!cfg.answers) throw inputError('"answers" is required: three values (0-3) for each of the six dimensions.');
  var stage = cfg.stage && STAGES[cfg.stage] ? cfg.stage : null;
  if (cfg.stage && !stage) throw inputError('"stage" must be one of pre-seed, seed, series-a, series-b.');
  var cur = scoreAll(cfg.answers);
  var focus = stage ? STAGES[stage].focus : [];
  var sorted = cur.rows.slice().sort(function (a, b) { if (a.score !== b.score) return a.score - b.score; return (focus.indexOf(a.id) > -1 ? 0 : 1) - (focus.indexOf(b.id) > -1 ? 0 : 1); });
  var weak = sorted.slice(0, 2);
  if (sorted[2] && sorted[2].score < WEAK_THIRD_BELOW) weak.push(sorted[2]);
  var byId = {}; DIMS.forEach(function (d) { byId[d.id] = d; });
  var weakLinks = weak.map(function (r) { var d = byId[r.id]; return { id: r.id, name: r.name, score: r.score, inStageFocus: focus.indexOf(r.id) > -1, read: d.weak, move: d.move, skills: d.skills, evidence: d.evidence }; });
  var findings = [];
  var ev = cfg.evidence || {};
  cur.rows.forEach(function (r) {
    if (r.score >= EVIDENCE_GATE && ev[r.id] !== true) findings.push({ level: 'improve', id: 'unevidenced', dimension: r.id, text: r.name + ' scores ' + r.score + ' on self-report with no evidence marked. Before trusting it, check for ' + byId[r.id].evidence + '.' });
    var spread = Math.max.apply(null, r.answers) - Math.min.apply(null, r.answers);
    if (spread === 3) findings.push({ level: 'info', id: 'uneven', dimension: r.id, text: r.name + ': one statement is Fully and another Not yet. The dimension score hides that; read the three answers, not the average.' });
  });
  var delta = null;
  if (cfg.previous && cfg.previous.answers) {
    var prev = scoreAll(cfg.previous.answers);
    delta = { overall: cur.overall - prev.overall, dimensions: cur.rows.map(function (r, i) { return { id: r.id, name: r.name, from: prev.rows[i].score, to: r.score, change: r.score - prev.rows[i].score }; }) };
    var moved = delta.dimensions.filter(function (x) { return x.change !== 0; });
    if (!moved.length) findings.push({ level: 'info', id: 'no-change', text: 'No dimension moved since the previous run. Either nothing was done, or the work did not reach the statements being scored.' });
    var backwards = delta.dimensions.filter(function (x) { return x.change < 0; });
    if (backwards.length) findings.push({ level: 'improve', id: 'regressed', text: backwards.map(function (x) { return x.name + ' ' + x.from + ' -> ' + x.to; }).join('; ') + '. A score can fall because the bar rose (you learned what "Fully" means) or because something lapsed; say which.' });
  }
  var band = bandOf(cur.overall);
  return { stage: stage, stageLabel: stage ? STAGES[stage].label : null, stageNote: stage ? STAGES[stage].note : null, stageFocus: focus,
    overall: cur.overall, band: band.label, bandRead: band.read, dimensions: cur.rows, weakLinks: weakLinks, findings: findings, delta: delta,
    rules: { bands: BANDS.map(function (b) { return b.label + ' ' + b.min + '+'; }), WEAK_THIRD_BELOW: WEAK_THIRD_BELOW, EVIDENCE_GATE: EVIDENCE_GATE, benchmark: 'none: the bands are AAJ\'s qualitative thresholds, not percentiles' } };
}

function run(cfg) { return assess(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const L = [];
  L.push(`MATURITY ${r.overall}/100 - ${r.band.toUpperCase()}${r.stageLabel ? ' (' + r.stageLabel + ')' : ''}`);
  L.push(`  ${r.bandRead}`);
  if (r.stageNote) L.push(`  ${r.stageNote}`);
  L.push('');
  L.push('DIMENSIONS');
  r.dimensions.forEach((d) => {
    const dl = r.delta ? r.delta.dimensions.find((x) => x.id === d.id) : null;
    L.push(`  ${d.name.padEnd(26)} ${String(d.score).padStart(3)}  ${d.band.padEnd(12)} answers ${d.answers.map((a) => SCALE[a]).join(' / ')}${dl && dl.change ? '  (' + (dl.change > 0 ? '+' : '') + dl.change + ' since last run)' : ''}${r.stageFocus.indexOf(d.id) > -1 ? '  [stage focus]' : ''}`);
  });
  L.push('');
  L.push('WEAK LINKS - fix in this order');
  r.weakLinks.forEach((w, i) => {
    L.push(`  ${i + 1}. ${w.name} (${w.score})${w.inStageFocus ? ' - in your stage focus' : ''}: ${w.read}`);
    L.push(`     Move: ${w.move} Skills: ${w.skills.join(', ')}. Evidence to check: ${w.evidence}.`);
  });
  if (r.delta) L.push(`\nCHANGE since previous run: overall ${r.delta.overall > 0 ? '+' : ''}${r.delta.overall}`);
  if (r.findings.length) { L.push(''); r.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : '-'} ${f.text}`)); }
  L.push('');
  L.push('Not a benchmark: the bands are AAJ\'s thresholds, and the score is only as honest as the answers.');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: an invented seed-stage company.
const DEMO = {
  stage: 'seed',
  answers: { positioning: [3, 2, 2], audience: [2, 1, 1], conversion: [2, 2, 0], pipeline: [1, 1, 0], retention: [1, 0, 0], measurement: [1, 0, 1] },
  evidence: { positioning: true, audience: false },
  previous: { answers: { positioning: [2, 2, 1], audience: [2, 1, 0], conversion: [2, 1, 0], pipeline: [1, 1, 0], retention: [1, 0, 0], measurement: [1, 1, 1] } },
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    console.log('DIMENSIONS AND STATEMENTS (answer 0 Not yet, 1 Partly, 2 Mostly, 3 Fully)\n');
    DIMS.forEach((d) => { console.log(d.id + ' - ' + d.name); d.qs.forEach((q, i) => console.log('  ' + (i + 1) + '. ' + q)); console.log(''); });
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); } catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: an invented seed-stage company, with a previous run for comparison)\n');
  }
  try { console.log(render(run(cfg))); }
  catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    console.error('\nRun --help for the schema and the 18 statements, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, assess, scoreAll, scoreDim, bandOf, DIMS, BANDS, STAGES, SCALE, WEAK_THIRD_BELOW, EVIDENCE_GATE };
