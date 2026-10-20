#!/usr/bin/env node
/*
 * AAJ Lead Magnet & Free Tool Design — engine
 * Part of the "lead-magnet-and-free-tool-design" Agent Skill.
 *
 * AAJ's position: ungate ideas, gate tools. A lead magnet earns an email
 * when it does a job for the buyer in minutes, only appeals to the buyer
 * you want, and leads somewhere. The engine scores candidate ideas on
 * those rules against the effort to build them, and reads a live magnet on
 * the qualified leads it produces rather than the downloads it counts.
 * The scoring rules are AAJ's own; no outside benchmark is used.
 *
 * USAGE
 *   node lead-magnet-fit.js                    # demo
 *   node lead-magnet-fit.js '<json-config>'    # your own
 *   node lead-magnet-fit.js --help
 *
 * CONFIG (JSON) - "ideas", "results": either or both
 *
 *   {
 *     "ideas": [
 *       { "name": "Churn & NRR calculator", "kind": "tool",      // tool | template | assessment | checklist | guide | report | course
 *         "problem": "Founders cannot tell whether their retention is good",   // the buyer problem it solves, in one sentence
 *         "minutesToValue": 5,                // minutes from arrival to a useful answer
 *         "reusable": true,                   // would the same person come back to it
 *         "icpOnly": true,                    // does it appeal only to the buyer you want
 *         "qualifyingInputs": true,           // do its inputs reveal fit (stage, size, spend)
 *         "nextStep": "Retention audit call",  // where it leads
 *         "gated": false,                     // email required before use
 *         "buildHours": 30 }
 *     ],
 *     "results": {
 *       "targetCostPerQualified": 60,         // optional
 *       "magnets": [
 *         { "name": "Churn & NRR calculator", "visitors": 1400, "starts": 610, "completions": 480,
 *           "emails": 130, "qualified": 61, "meetings": 7, "cost": 2400 }
 *       ]
 *     }
 *   }
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var IDEA_KINDS = ['tool', 'template', 'assessment', 'checklist', 'guide', 'report', 'course'];
var GATEABLE = ['tool', 'template', 'assessment', 'course'];   // "ungate ideas, gate tools": these do a job and may fairly ask for an email
var QUICK_MINUTES = 10;         // a useful answer within this many minutes scores full marks for time-to-value (engine rule)
var SLOW_MINUTES = 30;          // ... within this many, half marks (engine rule)
var BIG_BUILD_HOURS = 80;       // above this, ship a smaller version first (engine rule)
var MIN_EMAILS = 20;            // below this many emails a magnet is too early to judge (engine rule)
var QUALIFIED_KEEP = 0.4;       // qualified share of emails at or above this: keep (engine rule)
var QUALIFIED_RETIRE = 0.2;     // ... below this: retire or re-aim (engine rule)
var COMPLETION_MIN = 0.5;       // completions / starts below this: the flow is the problem (engine rule)
var START_MIN = 0.1;            // starts / visitors below this: the page is the problem (engine rule)
var MAX_SCORE = 10;

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

function scoreIdeas(list) {
  if (!Array.isArray(list) || !list.length) throw inputError('"ideas" needs at least one idea.');
  var rows = list.map(function (x, i) {
    var name = String(x.name || ('Idea ' + (i + 1)));
    var kind = String(x.kind || '').toLowerCase().trim();
    var findings = [];
    var add = function (level, id, text) { findings.push({ level: level, id: id, text: text }); };
    var parts = [];
    var score = 0;
    if (IDEA_KINDS.indexOf(kind) === -1) add('improve', 'kind', 'Kind "' + kind + '" is not one of ' + IDEA_KINDS.join(', ') + '.');
    var problem = String(x.problem || '').trim();
    if (problem) { score += 2; parts.push('specific problem +2'); } else add('fix', 'no-problem', 'No buyer problem stated. A magnet that is "about" a topic collects readers, not buyers.');
    if (x.icpOnly === true) { score += 2; parts.push('appeals only to your buyer +2'); } else add('improve', 'broad', 'It appeals beyond the buyer you want, so the list it builds will need qualifying and most of it will never buy.');
    var mins = isNum(x.minutesToValue) ? x.minutesToValue : null;
    if (mins !== null && mins <= QUICK_MINUTES) { score += 2; parts.push('answer in <=' + QUICK_MINUTES + ' min +2'); }
    else if (mins !== null && mins <= SLOW_MINUTES) { score += 1; parts.push('answer in <=' + SLOW_MINUTES + ' min +1'); }
    else if (mins === null) add('improve', 'no-time', 'Say how many minutes it takes to get a useful answer.');
    else add('improve', 'slow', mins + ' minutes to a useful answer. Above ' + SLOW_MINUTES + ' most people stop before they get it.');
    if (x.reusable === true) { score += 2; parts.push('reusable +2'); } else add('info', 'one-off', 'A one-off: once read, never returned to. Fine, but it earns no second visit.');
    if (x.qualifyingInputs === true) { score += 1; parts.push('inputs reveal fit +1'); }
    var next = String(x.nextStep || '').trim();
    if (next) { score += 1; parts.push('leads somewhere +1'); } else add('improve', 'no-next-step', 'No next step. Say what the person is offered once they have their answer.');
    if (x.gated === true && GATEABLE.indexOf(kind) === -1) add('fix', 'gated-ideas', 'A ' + kind + ' is ideas, and ideas should travel. Gate tools and templates; publish the thinking so it can be forwarded.');
    if (x.gated === false && GATEABLE.indexOf(kind) !== -1 && !next) add('info', 'ungated-tool', 'An ungated ' + kind + ' with no next step gives value and asks nothing. Add the next step, or ask for the email at the result.');
    var hours = isNum(x.buildHours) && x.buildHours > 0 ? x.buildHours : null;
    if (hours === null) add('improve', 'no-effort', 'No build estimate, so it cannot be ranked against the others.');
    else if (hours > BIG_BUILD_HOURS) add('info', 'big-build', hours + ' hours to build. Above ' + BIG_BUILD_HOURS + ' (this engine\'s rule) ship a smaller version first and see whether anyone uses it.');
    var perTenHours = hours ? score / (hours / 10) : null;
    var status = findings.some(function (f) { return f.level === 'fix'; }) ? 'fix' : hours === null ? 'unranked' : 'ranked';
    return { name: name, kind: kind, score: score, maxScore: MAX_SCORE, scoreParts: parts, buildHours: hours, scorePerTenHours: perTenHours, gated: x.gated === true, status: status, findings: findings };
  });
  rows.sort(function (a, b) {
    var ra = a.scorePerTenHours == null ? -1 : a.scorePerTenHours, rb = b.scorePerTenHours == null ? -1 : b.scorePerTenHours;
    return rb - ra || b.score - a.score;
  });
  var first = rows.filter(function (r) { return r.status === 'ranked'; })[0] || null;
  return { ideas: rows, buildFirst: first ? first.name : null };
}

function readResults(res) {
  res = res || {};
  var list = Array.isArray(res.magnets) ? res.magnets : [];
  if (!list.length) throw inputError('"results.magnets" needs at least one magnet.');
  var target = isNum(res.targetCostPerQualified) && res.targetCostPerQualified > 0 ? res.targetCostPerQualified : null;
  var rows = list.map(function (m, i) {
    var name = String(m.name || ('Magnet ' + (i + 1)));
    var visitors = isNum(m.visitors) ? m.visitors : null, starts = isNum(m.starts) ? m.starts : null, completions = isNum(m.completions) ? m.completions : null;
    var emails = isNum(m.emails) ? m.emails : 0, qualified = isNum(m.qualified) ? m.qualified : null, meetings = isNum(m.meetings) ? m.meetings : null;
    var cost = isNum(m.cost) && m.cost >= 0 ? m.cost : null;
    var startRate = visitors && starts !== null ? starts / visitors : null;
    var completionRate = starts && completions !== null ? completions / starts : null;
    var captureRate = visitors ? emails / visitors : null;
    var qualifiedShare = emails && qualified !== null ? qualified / emails : null;
    var costPerEmail = cost !== null && emails ? cost / emails : null;
    var costPerQualified = cost !== null && qualified ? cost / qualified : null;
    var findings = [];
    var add = function (level, id, text) { findings.push({ level: level, id: id, text: text }); };
    if (qualified === null) add('fix', 'no-qualified', 'No qualified count. Score the emails against your ICP (the inputs they gave, or their domain) before judging anything; downloads are not leads.');
    if (startRate !== null && startRate < START_MIN) add('improve', 'page', Math.round(startRate * 100) + '% of visitors start it. Below ' + Math.round(START_MIN * 100) + '% (this engine\'s rule) the page is the problem: the promise, the first field, or the traffic source.');
    if (completionRate !== null && completionRate < COMPLETION_MIN) add('improve', 'flow', Math.round(completionRate * 100) + '% of starters finish. Below ' + Math.round(COMPLETION_MIN * 100) + '% (this engine\'s rule) the flow is the problem: too many inputs, or the email asked too early.');
    var verdict;
    if (emails < MIN_EMAILS) verdict = { level: 'too-early', text: emails + ' emails so far. Below ' + MIN_EMAILS + ' this engine does not judge; send more of the right traffic and read again.' };
    else if (qualifiedShare === null) verdict = { level: 'unjudged', text: 'Cannot judge without a qualified count.' };
    else if (qualifiedShare >= QUALIFIED_KEEP && (target === null || costPerQualified === null || costPerQualified <= target)) verdict = { level: 'keep', text: Math.round(qualifiedShare * 100) + '% of emails fit your buyer' + (costPerQualified !== null ? ' at ' + Math.round(costPerQualified).toLocaleString('en-US') + ' per qualified lead' : '') + '. Keep it, and point more of the same traffic at it.' };
    else if (qualifiedShare >= QUALIFIED_KEEP) verdict = { level: 'fix-cost', text: 'The leads fit (' + Math.round(qualifiedShare * 100) + '%) but cost ' + Math.round(costPerQualified).toLocaleString('en-US') + ' each against a target of ' + target.toLocaleString('en-US') + '. Cheaper traffic or a lighter build, not a different magnet.' };
    else if (qualifiedShare >= QUALIFIED_RETIRE) verdict = { level: 'fix-fit', text: Math.round(qualifiedShare * 100) + '% of emails fit your buyer. Re-aim it: narrow the promise to your buyer\'s problem, or add an input that puts off everyone else.' };
    else if (target !== null && costPerQualified !== null && costPerQualified <= target) verdict = { level: 'fix-fit', text: 'Qualified leads are cheap (' + Math.round(costPerQualified).toLocaleString('en-US') + ' each) but only ' + Math.round(qualifiedShare * 100) + '% of the list fits your buyer. Segment the list before you email it, and re-aim the promise so the other ' + Math.round((1 - qualifiedShare) * 100) + '% stop signing up.' };
    else verdict = { level: 'retire', text: 'Only ' + Math.round(qualifiedShare * 100) + '% of emails fit your buyer. Below ' + Math.round(QUALIFIED_RETIRE * 100) + '% (this engine\'s rule) it is building the wrong list; retire it or rebuild it for the buyer.' };
    return { name: name, visitors: visitors, starts: starts, completions: completions, emails: emails, qualified: qualified, meetings: meetings, cost: cost,
      startRate: startRate, completionRate: completionRate, captureRate: captureRate, qualifiedShare: qualifiedShare, costPerEmail: costPerEmail, costPerQualified: costPerQualified,
      verdict: verdict, findings: findings };
  });
  return { targetCostPerQualified: target, magnets: rows };
}

function run(cfg) {
  cfg = cfg || {};
  if (!cfg.ideas && !cfg.results) throw inputError('Give "ideas" to score, "results" to read, or both.');
  return {
    ideas: cfg.ideas ? scoreIdeas(cfg.ideas) : null,
    results: cfg.results ? readResults(cfg.results) : null,
    rules: { GATEABLE: GATEABLE, QUICK_MINUTES: QUICK_MINUTES, SLOW_MINUTES: SLOW_MINUTES, BIG_BUILD_HOURS: BIG_BUILD_HOURS, MIN_EMAILS: MIN_EMAILS,
      QUALIFIED_KEEP: QUALIFIED_KEEP, QUALIFIED_RETIRE: QUALIFIED_RETIRE, COMPLETION_MIN: COMPLETION_MIN, START_MIN: START_MIN },
  };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const pct = (v) => v == null ? '-' : Math.round(v * 100) + '%';
const num = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
function render(r) {
  const L = [];
  if (r.ideas) {
    L.push('IDEAS - scored on AAJ\'s rules, ranked by score per ten build hours');
    r.ideas.ideas.forEach((x) => {
      L.push(`  ${x.name} (${x.kind}${x.gated ? ', gated' : ''}): ${x.score}/${x.maxScore}${x.buildHours ? ', ' + x.buildHours + ' h to build, ' + x.scorePerTenHours.toFixed(1) + ' per 10 h' : ''} [${x.status}]${x.scoreParts.length ? ' - ' + x.scoreParts.join(', ') : ''}`);
      x.findings.forEach((f) => L.push(`     ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
    });
    if (r.ideas.buildFirst) L.push(`  Build first: ${r.ideas.buildFirst}`);
    L.push('');
  }
  if (r.results) {
    const x = r.results;
    L.push('RESULTS - on qualified leads, not downloads' + (x.targetCostPerQualified ? ' (target ' + num(x.targetCostPerQualified) + ' per qualified lead)' : ''));
    x.magnets.forEach((m) => {
      L.push(`  ${m.name}: ${num(m.visitors)} visitors -> ${num(m.starts)} starts (${pct(m.startRate)}) -> ${num(m.completions)} completions (${pct(m.completionRate)}) -> ${m.emails} emails (${pct(m.captureRate)} of visitors) -> ${m.qualified == null ? '?' : m.qualified} qualified (${pct(m.qualifiedShare)})${m.meetings != null ? ' -> ' + m.meetings + ' meetings' : ''}${m.costPerQualified != null ? '; ' + num(m.costPerQualified) + ' per qualified lead' : ''}`);
      m.findings.forEach((f) => L.push(`     ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
      L.push(`     ${m.verdict.level.toUpperCase()}: ${m.verdict.text}`);
    });
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented ideas and numbers.
const DEMO = {
  ideas: [
    { name: 'Churn & NRR calculator', kind: 'tool', problem: 'Founders cannot tell whether their retention is good enough to raise on', minutesToValue: 5, reusable: true, icpOnly: true, qualifyingInputs: true, nextStep: 'Retention audit call', gated: false, buildHours: 30 },
    { name: 'The Ultimate Guide to SaaS Marketing', kind: 'guide', problem: '', minutesToValue: 45, reusable: false, icpOnly: false, gated: true, buildHours: 25 },
    { name: 'Board marketing slide template', kind: 'template', problem: 'Marketing leads rebuild the board slide every quarter from scratch', minutesToValue: 20, reusable: true, icpOnly: true, qualifyingInputs: false, nextStep: 'KPI report tool', gated: true, buildHours: 12 },
    { name: 'Marketing maturity assessment', kind: 'assessment', problem: 'Seed founders do not know which marketing gap to fix first', minutesToValue: 8, reusable: false, icpOnly: true, qualifyingInputs: true, nextStep: 'Growth audit', gated: true, buildHours: 120 },
  ],
  results: {
    targetCostPerQualified: 60,
    magnets: [
      { name: 'Churn & NRR calculator', visitors: 1400, starts: 610, completions: 480, emails: 130, qualified: 61, meetings: 7, cost: 2400 },
      { name: 'The Ultimate Guide to SaaS Marketing', visitors: 3900, starts: 700, completions: 700, emails: 700, qualified: 90, meetings: 2, cost: 3100 },
      { name: 'Board marketing slide template', visitors: 260, starts: 40, completions: 15, emails: 15, qualified: 12, cost: 400 },
    ],
  },
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
    console.log('(no config - demo: four invented magnet ideas, and the results of three live ones)\n');
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

module.exports = { run, scoreIdeas, readResults, IDEA_KINDS, GATEABLE, QUICK_MINUTES, SLOW_MINUTES, BIG_BUILD_HOURS, MIN_EMAILS, QUALIFIED_KEEP, QUALIFIED_RETIRE, COMPLETION_MIN, START_MIN, MAX_SCORE };
