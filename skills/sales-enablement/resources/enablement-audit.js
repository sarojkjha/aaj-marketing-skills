#!/usr/bin/env node
/*
 * AAJ Sales Enablement — engine
 * Part of the "sales-enablement" Agent Skill.
 *
 * AAJ's position: enablement is not a content library, it is the set of
 * things a rep needs at each stage to move a deal, kept current and
 * actually used. So the engine audits what exists against what each stage
 * needs, checks whether reps use it, and ranks what to build next by the
 * revenue being lost for want of it. No outside benchmark is used.
 *
 * USAGE
 *   node enablement-audit.js                    # demo
 *   node enablement-audit.js '<json-config>'    # your own
 *   node enablement-audit.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "asOf": "2026-09-28",                 // date the audit is run (default: today)
 *     "totalReps": 6,                        // quota-carrying reps, for adoption
 *     "inventory": [                         // every sales asset that exists
 *       { "name": "Competitor X battlecard", "type": "battlecard",
 *         "owner": "PMM", "lastUpdated": "2026-02-10", "usedByReps": 2 }
 *     ],
 *     "losses": [                            // closed-lost reasons, last two quarters
 *       { "reason": "competitor", "count": 7, "value": 140000 },
 *       { "reason": "no-decision", "count": 9, "value": 90000 }
 *     ]
 *   }
 *
 * ASSET TYPES (the "type" field) and the stage each serves
 *   discovery:  one-pager, discovery-guide, email-templates
 *   evaluation: battlecard, case-study, demo-script, objection-guide
 *   decision:   roi-business-case, security-legal-pack, mutual-action-plan
 *
 * LOSS REASONS (the "reason" field)
 *   price, competitor, no-decision, missing-feature, timing, security-legal, champion-left, other
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var STALE_MONTHS = 6;          // an asset not updated in this long is stale (engine rule)
var ADOPTION_MIN = 1 / 3;      // used by fewer than this share of reps counts as unused (engine rule)
var STAGES = ['discovery', 'evaluation', 'decision'];
var NEEDS = [
  { id: 'one-pager', stage: 'discovery', label: 'One-pager', why: 'What you do, for whom, and the proof, on one page a prospect can forward.' },
  { id: 'discovery-guide', stage: 'discovery', label: 'Discovery guide', why: 'The questions that qualify, and the answers that disqualify.' },
  { id: 'email-templates', stage: 'discovery', label: 'Email templates', why: 'First touch, follow-up and re-engagement, in the brand voice.' },
  { id: 'battlecard', stage: 'evaluation', label: 'Battlecard', why: 'Per competitor: where you win, where you lose, and what to say when they come up.' },
  { id: 'case-study', stage: 'evaluation', label: 'Case study', why: 'A customer like this prospect, with a result and permission to name them.' },
  { id: 'demo-script', stage: 'evaluation', label: 'Demo script', why: 'The demo built around the buyer\'s problem, not the feature list.' },
  { id: 'objection-guide', stage: 'evaluation', label: 'Objection guide', why: 'The objections that lose deals, with responses reps have tested.' },
  { id: 'roi-business-case', stage: 'decision', label: 'ROI / business case', why: 'The template the champion uses to sell it internally.' },
  { id: 'security-legal-pack', stage: 'decision', label: 'Security & legal pack', why: 'Questionnaire answers, DPA, terms: the things that stall a signed deal.' },
  { id: 'mutual-action-plan', stage: 'decision', label: 'Mutual action plan', why: 'The dated steps to signature, agreed with the buyer.' },
];
var REASON_TO_ASSETS = {
  'price': ['roi-business-case', 'objection-guide'],
  'competitor': ['battlecard', 'case-study'],
  'no-decision': ['roi-business-case', 'mutual-action-plan'],
  'missing-feature': ['battlecard'],
  'timing': ['mutual-action-plan', 'email-templates'],
  'security-legal': ['security-legal-pack'],
  'champion-left': ['one-pager', 'mutual-action-plan'],
  'other': [],
};
var REASON_NOTES = {
  'missing-feature': 'Losses to a missing feature are mostly a positioning or product question; a battlecard helps reps reframe, it does not close the gap.',
  'other': 'Uncoded loss reasons cannot be turned into enablement. Code them (see the win-loss-analysis skill).',
};

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function monthsBetween(from, to) {
  var a = new Date(from), b = new Date(to);
  if (isNaN(a) || isNaN(b)) return null;
  return (b - a) / (1000 * 60 * 60 * 24 * 30.44);
}

function auditInventory(list, totalReps, asOf) {
  list = Array.isArray(list) ? list : [];
  var byType = {};
  var assets = list.map(function (a, i) {
    var name = String(a.name || ('Asset ' + (i + 1)));
    var type = String(a.type || '').trim();
    var need = NEEDS.filter(function (n) { return n.id === type; })[0] || null;
    var findings = [];
    var add = function (level, id, text) { findings.push({ level: level, id: id, text: text }); };
    if (!need) add('improve', 'unknown-type', 'Type "' + type + '" is not one the audit maps to a stage. Use one of: ' + NEEDS.map(function (n) { return n.id; }).join(', ') + '.');
    if (!String(a.owner || '').trim()) add('fix', 'no-owner', 'No owner. An asset nobody owns is never updated.');
    var age = a.lastUpdated ? monthsBetween(a.lastUpdated, asOf) : null;
    if (age === null) add('improve', 'no-date', 'No lastUpdated date, so staleness cannot be checked.');
    else if (age > STALE_MONTHS) add('fix', 'stale', 'Last updated ' + Math.round(age) + ' months ago. This engine treats anything over ' + STALE_MONTHS + ' months as stale; for a battlecard or pricing objection that is a liability.');
    var adoption = isNum(a.usedByReps) && isNum(totalReps) && totalReps > 0 ? Math.min(1, a.usedByReps / totalReps) : null;
    if (adoption === null) add('improve', 'no-usage', 'No usage figure. Ask each rep which assets they used in their last five deals.');
    else if (adoption < ADOPTION_MIN) add('fix', 'unused', Math.round(adoption * 100) + '% of reps use it. Below ' + Math.round(ADOPTION_MIN * 100) + '% (this engine\'s rule) either reps do not know it exists, or it does not help; ask before rebuilding.');
    var status = findings.some(function (f) { return f.level === 'fix'; }) ? 'fix' : 'ok';
    if (need) (byType[type] = byType[type] || []).push({ name: name, status: status });
    return { name: name, type: type, stage: need ? need.stage : null, owner: String(a.owner || ''), ageMonths: age, adoption: adoption, status: status, findings: findings };
  });
  var coverage = STAGES.map(function (s) {
    var needs = NEEDS.filter(function (n) { return n.stage === s; });
    var have = needs.filter(function (n) { return (byType[n.id] || []).length; });
    var healthy = needs.filter(function (n) { return (byType[n.id] || []).some(function (x) { return x.status === 'ok'; }); });
    return { stage: s, needs: needs.length, covered: have.length, healthy: healthy.length,
      missing: needs.filter(function (n) { return !(byType[n.id] || []).length; }).map(function (n) { return n.id; }) };
  });
  return { assets: assets, coverage: coverage, byType: byType };
}

function prioritise(losses, byType) {
  losses = Array.isArray(losses) ? losses : [];
  var totalValue = losses.reduce(function (a, l) { return a + (isNum(l.value) ? l.value : 0); }, 0);
  var perAsset = {};
  var notes = [];
  var uncoded = 0;
  losses.forEach(function (l) {
    var reason = String(l.reason || 'other').trim();
    var value = isNum(l.value) ? l.value : 0, count = isNum(l.count) ? l.count : 0;
    var types = REASON_TO_ASSETS[reason];
    if (!types) { types = []; reason = 'other'; }
    if (REASON_NOTES[reason]) notes.push(REASON_NOTES[reason] + ' (' + count + ' deals, ' + value.toLocaleString('en-US') + ')');
    if (reason === 'other') uncoded += value;
    types.forEach(function (t) {
      perAsset[t] = perAsset[t] || { type: t, lostValue: 0, lostCount: 0, reasons: [] };
      perAsset[t].lostValue += value; perAsset[t].lostCount += count;
      if (perAsset[t].reasons.indexOf(reason) === -1) perAsset[t].reasons.push(reason);
    });
  });
  var rows = Object.keys(perAsset).map(function (t) {
    var r = perAsset[t];
    var have = byType[t] || [];
    var need = NEEDS.filter(function (n) { return n.id === t; })[0];
    var action = !have.length ? 'build' : have.some(function (x) { return x.status === 'ok'; }) ? 'check' : 'fix';
    return { type: t, label: need.label, stage: need.stage, action: action, lostValue: r.lostValue, lostCount: r.lostCount, reasons: r.reasons,
      existing: have.map(function (x) { return x.name; }),
      text: action === 'build' ? 'Does not exist. ' + need.why
        : action === 'fix' ? 'Exists but is stale, unowned or unused: ' + have.map(function (x) { return x.name; }).join(', ') + '. Fix before building anything new.'
        : 'Exists and is in use, yet deals are still lost for this reason. Ask the reps whether it holds up in the room; the fix may be the message, not the asset.' };
  });
  rows.sort(function (a, b) { return b.lostValue - a.lostValue || b.lostCount - a.lostCount; });
  return { ranked: rows, totalLostValue: totalValue, uncodedValue: uncoded, notes: notes };
}

function run(cfg) {
  cfg = cfg || {};
  if (!Array.isArray(cfg.inventory) && !Array.isArray(cfg.losses)) throw inputError('Give an "inventory" (the assets that exist), "losses" (closed-lost reasons), or both.');
  var asOf = cfg.asOf && !isNaN(new Date(cfg.asOf)) ? cfg.asOf : new Date().toISOString().slice(0, 10);
  var totalReps = isNum(cfg.totalReps) && cfg.totalReps > 0 ? cfg.totalReps : null;
  var inv = auditInventory(cfg.inventory || [], totalReps, asOf);
  var pri = prioritise(cfg.losses || [], inv.byType);
  var fixes = inv.assets.filter(function (a) { return a.status === 'fix'; });
  var totalNeeds = NEEDS.length, coveredNeeds = inv.coverage.reduce(function (a, c) { return a + c.covered; }, 0);
  var builds = pri.ranked.filter(function (r) { return r.action === 'build'; });
  var verdict;
  if (!Array.isArray(cfg.losses) || !cfg.losses.length) verdict = { level: 'no-losses', text: 'No loss reasons given, so the build list cannot be ranked by revenue. Coverage and hygiene are reported; add closed-lost reasons to see what to build first.' };
  else if (builds.length) verdict = { level: 'build', text: 'Build the ' + builds[0].label + ' first: ' + builds[0].lostValue.toLocaleString('en-US') + ' lost across ' + builds[0].lostCount + ' deals for want of it.' };
  else if (pri.ranked.some(function (r) { return r.action === 'fix'; })) verdict = { level: 'fix', text: 'The assets the losses point at exist but are stale, unowned or unused. Fix those before writing anything new.' };
  else if (pri.ranked.length) verdict = { level: 'check', text: 'Everything the losses point at exists and is used. The problem is the message or the deal, not the library; take the top reasons to win-loss.' };
  else verdict = { level: 'covered', text: 'Losses do not map to any enablement gap. Code the "other" reasons and re-run.' };
  return { asOf: asOf, totalReps: totalReps, assets: inv.assets, coverage: inv.coverage, coveredNeeds: coveredNeeds, totalNeeds: totalNeeds,
    fixes: fixes.map(function (a) { return a.name; }), priorities: pri, verdict: verdict,
    rules: { STALE_MONTHS: STALE_MONTHS, ADOPTION_MIN: ADOPTION_MIN } };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const money = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
function render(r) {
  const L = [];
  L.push(`COVERAGE - ${r.coveredNeeds} of ${r.totalNeeds} stage needs have an asset (as of ${r.asOf})`);
  r.coverage.forEach((c) => L.push(`  ${c.stage}: ${c.covered}/${c.needs} covered, ${c.healthy} healthy${c.missing.length ? ' - missing ' + c.missing.join(', ') : ''}`));
  L.push('');
  L.push('INVENTORY');
  r.assets.forEach((a) => {
    L.push(`  ${a.name} [${a.type}${a.stage ? ', ' + a.stage : ''}] owner ${a.owner || '-'}, updated ${a.ageMonths == null ? '?' : Math.round(a.ageMonths) + ' mo ago'}, used by ${a.adoption == null ? '?' : Math.round(a.adoption * 100) + '% of reps'} - ${a.status}`);
    a.findings.forEach((f) => L.push(`     ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
  });
  L.push('');
  const p = r.priorities;
  L.push(`PRIORITIES - ranked by revenue lost (${money(p.totalLostValue)} total${p.uncodedValue ? ', ' + money(p.uncodedValue) + ' uncoded' : ''})`);
  p.ranked.forEach((x, i) => L.push(`  ${i + 1}. ${x.action.toUpperCase()} ${x.label} (${x.stage}): ${money(x.lostValue)} across ${x.lostCount} deals, reasons ${x.reasons.join(', ')}\n     ${x.text}`));
  p.notes.forEach((n) => L.push(`  - ${n}`));
  L.push('');
  L.push(`${r.verdict.level.toUpperCase()}: ${r.verdict.text}`);
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented assets and losses.
const DEMO = {
  asOf: '2026-09-28', totalReps: 6,
  inventory: [
    { name: 'Company one-pager', type: 'one-pager', owner: 'Marketing', lastUpdated: '2026-08-01', usedByReps: 6 },
    { name: 'Discovery question bank', type: 'discovery-guide', owner: 'Head of Sales', lastUpdated: '2026-06-15', usedByReps: 5 },
    { name: 'Competitor X battlecard', type: 'battlecard', owner: 'PMM', lastUpdated: '2026-01-20', usedByReps: 1 },
    { name: 'Acme case study', type: 'case-study', owner: 'Marketing', lastUpdated: '2026-07-10', usedByReps: 4 },
    { name: 'Standard demo flow', type: 'demo-script', owner: '', lastUpdated: '2025-11-02', usedByReps: 6 },
    { name: 'Security questionnaire answers', type: 'security-legal-pack', owner: 'CTO', lastUpdated: '2026-09-01', usedByReps: 3 },
  ],
  losses: [
    { reason: 'no-decision', count: 9, value: 135000 },
    { reason: 'competitor', count: 7, value: 126000 },
    { reason: 'price', count: 5, value: 60000 },
    { reason: 'missing-feature', count: 3, value: 45000 },
    { reason: 'other', count: 4, value: 38000 },
  ],
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); } catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: six invented sales assets for a six-rep team, and two quarters of loss reasons)\n');
  }
  try { console.log(render(run(cfg))); }
  catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, auditInventory, prioritise, NEEDS, STAGES, REASON_TO_ASSETS, STALE_MONTHS, ADOPTION_MIN };
