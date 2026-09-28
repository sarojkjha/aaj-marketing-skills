#!/usr/bin/env node
/*
 * AAJ Community & Dark Social — engine
 * Part of the "community-and-dark-social" Agent Skill.
 *
 * AAJ's position: you cannot track the private channels where B2B buyers
 * talk (Slack, WhatsApp, communities, forwarded emails, AI assistants), so
 * you map them by asking, show up in them as a person, and measure the
 * whole by trend rather than by attribution. The engine works only on the
 * user's own map and numbers; no outside benchmark is used.
 *
 * USAGE
 *   node dark-social-read.js                    # demo
 *   node dark-social-read.js '<json-config>'    # your own
 *   node dark-social-read.js --help
 *
 * CONFIG (JSON) - "map", "community", "measure": any or all
 *
 *   {
 *     "map": [                                   // where your buyers already talk
 *       { "name": "RevOps Co-op (Slack)", "kind": "community",   // community | person | newsletter | podcast | event
 *         "namedByBuyers": 6,                    // customers who named it when asked where they get advice
 *         "selfReportedMentions": 4,             // leads who named it in "How did you hear about us?" this period
 *         "present": true,                       // someone from your team is a member / subscriber / listener
 *         "answering": true,                     // answered a question or was quoted there in the last month
 *         "pitched": false,                      // posted a promotion or link unasked
 *         "crossPosted": false }                 // the same post put in more than one room
 *     ],
 *     "community": {                             // go / no-go on opening your own community
 *       "recurringConversation": "Weekly: what broke in your funnel this week",
 *       "host": "Saroj", "hostHoursPerWeek": 3,
 *       "quietPlan": "Month-three plan: bring in two guest practitioners",
 *       "membersAsking": 14,                     // people who have asked for a room that doesn't exist
 *       "roleOrProblem": "heads of marketing at seed-stage SaaS"
 *     },
 *     "measure": {                               // two or more periods, oldest first
 *       "periods": [
 *         { "label": "Jun", "leads": 40,
 *           "selfReported": { "person": 3, "community": 2, "podcast": 1, "newsletter": 0, "brandName": 4, "search": 12, "paid": 9, "other": 5, "unknown": 4 },
 *           "brandedSearchImpressions": 1200,
 *           "directSessions": 900, "directDeepPageSessions": 240,
 *           "pipeline": 60000 }
 *       ]
 *     }
 *   }
 *
 * Dark sources are person, community, podcast, newsletter and brandName
 * (someone typed your name or arrived at a deep page directly). search,
 * paid, other and unknown are not dark.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var DARK_SOURCES = ['person', 'community', 'podcast', 'newsletter', 'brandName'];
var MIN_NAMES_FOR_PRESENCE = 2;   // a place named by this many buyers is one you should be present in (engine rule)
var MIN_HOST_HOURS = 2;           // hours a week a named host must commit before a community opens (engine rule)
var MIN_MEMBERS_ASKING = 10;      // people asking for a room before opening one (engine rule)
var MIN_DARK_ANSWERS = 10;        // below this many dark-source answers in a period, the share is too noisy to read (engine rule)
var TREND_BAND = 0.1;             // +/- 10% against the prior periods counts as flat (engine rule)
var UNKNOWN_SHARE_MAX = 0.3;      // above this share of uncoded answers, fix the coding before reading the trend (engine rule)

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function n0(v) { return isNum(v) && v >= 0 ? v : 0; }

function readMap(list) {
  if (!Array.isArray(list) || !list.length) throw inputError('"map" needs at least one place.');
  var rows = list.map(function (p, i) {
    var name = String(p.name || ('Place ' + (i + 1)));
    var names = n0(p.namedByBuyers), mentions = n0(p.selfReportedMentions);
    var findings = [];
    var add = function (level, id, text) { findings.push({ level: level, id: id, text: text }); };
    var evidence = names + mentions;
    if (names >= MIN_NAMES_FOR_PRESENCE && p.present !== true) add('fix', 'absent', names + ' buyers named this place and nobody from your team is in it. Join as a person, read for two weeks, then answer.');
    if (p.pitched === true) add('fix', 'pitched', 'You posted a promotion or an unasked link here. In other people\'s rooms: answer first, link only when asked.');
    if (p.crossPosted === true) add('improve', 'cross-posted', 'The same post went into more than one room. Members of both notice, and it reads as broadcasting.');
    if (p.present === true && p.answering !== true) add('improve', 'silent', 'You are present but have not answered anything in the last month. Presence without answers is lurking, not showing up.');
    if (evidence === 0 && p.present === true) add('info', 'unproven', 'No buyer named this place and no lead mentioned it. Keep it only if it costs nothing; the map should be built from where buyers say they are.');
    var status = findings.some(function (f) { return f.level === 'fix'; }) ? 'fix' : evidence >= MIN_NAMES_FOR_PRESENCE ? 'covered' : 'watch';
    return { name: name, kind: String(p.kind || ''), namedByBuyers: names, selfReportedMentions: mentions, evidence: evidence,
      present: p.present === true, answering: p.answering === true, status: status, findings: findings };
  });
  rows.sort(function (a, b) { return b.evidence - a.evidence || a.name.localeCompare(b.name); });
  var named = rows.filter(function (r) { return r.namedByBuyers >= MIN_NAMES_FOR_PRESENCE; });
  var coveredCount = named.filter(function (r) { return r.present && r.answering; }).length;
  return { places: rows, buyerNamedPlaces: named.length, presentAndAnswering: coveredCount,
    coverage: named.length ? coveredCount / named.length : null,
    top: rows.slice(0, 3).map(function (r) { return r.name; }) };
}

function checkCommunity(c) {
  c = c || {};
  var missing = [], notes = [];
  var conv = String(c.recurringConversation || '').trim();
  var host = String(c.host || '').trim();
  var hours = isNum(c.hostHoursPerWeek) ? c.hostHoursPerWeek : 0;
  var plan = String(c.quietPlan || '').trim();
  var asking = n0(c.membersAsking);
  var around = String(c.roleOrProblem || '').trim();
  if (!conv) missing.push({ id: 'conversation', text: 'Name the one recurring conversation the community will host every week.' });
  if (!host) missing.push({ id: 'host', text: 'Name the person who will show up every week. If you cannot answer with a name, do not open it yet.' });
  else if (hours < MIN_HOST_HOURS) missing.push({ id: 'host-hours', text: host + ' has ' + hours + ' hour(s) a week committed. This engine treats ' + MIN_HOST_HOURS + ' hours a week as the floor for a host.' });
  if (!plan) missing.push({ id: 'quiet-plan', text: 'Write down what you will do when it goes quiet in month three.' });
  if (!around) notes.push('Say what the community is built around: a role or a problem, not your product.');
  else if (/\b(our|my)\s+(product|platform|app|tool|users|customers)\b/i.test(around)) notes.push('"' + around + '" is built around your product. Communities that last are built around a role or a problem.');
  var verdict;
  if (missing.some(function (m) { return m.id === 'host' || m.id === 'host-hours'; })) verdict = { level: 'no', text: 'Not without a host. A dead community costs more than no community.' };
  else if (missing.length) verdict = { level: 'not-yet', text: 'Fill the gaps below before opening. Meanwhile show up, as a person, in the rooms your buyers already use.' };
  else if (asking < MIN_MEMBERS_ASKING) verdict = { level: 'not-yet', text: asking + ' people have asked for a room. This engine waits for ' + MIN_MEMBERS_ASKING + ': open when members are asking for something that does not exist, not to have one.' };
  else verdict = { level: 'go', text: 'Conversation, host, quiet plan and demand are all there. Open it small, around the role or problem, with the host visible from day one.' };
  return { verdict: verdict, missing: missing, notes: notes, membersAsking: asking, hostHoursPerWeek: hours };
}

function periodRead(p, i) {
  var sr = p.selfReported || {};
  var dark = DARK_SOURCES.reduce(function (a, k) { return a + n0(sr[k]); }, 0);
  var answered = Object.keys(sr).reduce(function (a, k) { return k === 'unknown' ? a : a + n0(sr[k]); }, 0);
  var unknown = n0(sr.unknown);
  var leads = isNum(p.leads) ? p.leads : answered + unknown;
  var direct = n0(p.directSessions), deep = n0(p.directDeepPageSessions);
  return { label: String(p.label || ('Period ' + (i + 1))), leads: leads, dark: dark, answered: answered, unknown: unknown,
    darkShare: answered ? dark / answered : null,
    unknownShare: answered + unknown ? unknown / (answered + unknown) : null,
    brandedSearch: isNum(p.brandedSearchImpressions) ? p.brandedSearchImpressions : null,
    deepDirectShare: direct ? deep / direct : null,
    pipeline: isNum(p.pipeline) ? p.pipeline : null };
}

function trend(latest, priorValues) {
  var prior = priorValues.filter(isNum);
  if (!isNum(latest) || !prior.length) return null;
  var base = prior.reduce(function (a, v) { return a + v; }, 0) / prior.length;
  if (base === 0) return latest > 0 ? { dir: 'up', change: null } : { dir: 'flat', change: 0 };
  var ch = latest / base - 1;
  return { dir: ch > TREND_BAND ? 'up' : ch < -TREND_BAND ? 'down' : 'flat', change: ch };
}

function readMeasure(m) {
  m = m || {};
  var periods = Array.isArray(m.periods) ? m.periods : [];
  if (periods.length < 2) throw inputError('"measure.periods" needs at least two periods, oldest first.');
  var rows = periods.map(periodRead);
  var latest = rows[rows.length - 1], prior = rows.slice(0, -1);
  var pick = function (k) { return prior.map(function (r) { return r[k]; }); };
  var trends = {
    darkShare: trend(latest.darkShare, pick('darkShare')),
    brandedSearch: trend(latest.brandedSearch, pick('brandedSearch')),
    deepDirectShare: trend(latest.deepDirectShare, pick('deepDirectShare')),
    pipeline: trend(latest.pipeline, pick('pipeline')),
  };
  var findings = [];
  if (latest.dark < MIN_DARK_ANSWERS) findings.push({ level: 'info', id: 'too-few', text: latest.dark + ' dark-source answers in the latest period. Below ' + MIN_DARK_ANSWERS + ' the share moves on chance; read the trend over more periods before acting.' });
  if (latest.unknownShare !== null && latest.unknownShare > UNKNOWN_SHARE_MAX) findings.push({ level: 'fix', id: 'uncoded', text: Math.round(latest.unknownShare * 100) + '% of answers are uncoded or blank. Fix the form question and the coding before reading anything else.' });
  var dirs = ['darkShare', 'brandedSearch', 'deepDirectShare'].map(function (k) { return trends[k] ? trends[k].dir : null; }).filter(Boolean);
  var ups = dirs.filter(function (d) { return d === 'up'; }).length, downs = dirs.filter(function (d) { return d === 'down'; }).length;
  var darkDir = ups > downs ? 'up' : downs > ups ? 'down' : 'flat';
  var pipeDir = trends.pipeline ? trends.pipeline.dir : null;
  var verdict;
  if (latest.dark < MIN_DARK_ANSWERS && !dirs.length) verdict = { level: 'unreadable', text: 'Not enough answers or signals yet. Keep the form question live and come back next period.' };
  else if (darkDir === 'up' && pipeDir === 'up') verdict = { level: 'working', text: 'Dark signals and pipeline are rising together. Keep the rhythm; retarget the pieces that travel and brief sales on the conversations to expect.' };
  else if (darkDir === 'up' && pipeDir && pipeDir !== 'up') verdict = { level: 'wrong-people', text: 'People are talking about you where you cannot see, and pipeline is not following. Either your sales cycle is longer than the periods you are reading, or the wrong people are talking. Check the cycle first; if it is not that, go back to the map: whose rooms are these?' };
  else if (darkDir === 'up') verdict = { level: 'growing', text: 'Dark signals are rising. Add pipeline to the next read to see whether the right people are talking.' };
  else if (darkDir === 'down') verdict = { level: 'going-quiet', text: 'Dark signals are falling. Check the presence review: where did you stop answering, and which pieces stopped travelling?' };
  else verdict = { level: 'flat', text: 'No movement against the prior periods. One change next month, written down, then read again.' };
  return { periods: rows, latest: latest.label, trends: trends, verdict: verdict, findings: findings };
}

function run(cfg) {
  cfg = cfg || {};
  if (!cfg.map && !cfg.community && !cfg.measure) throw inputError('Give a "map", a "community", "measure", or any combination.');
  return {
    map: cfg.map ? readMap(cfg.map) : null,
    community: cfg.community ? checkCommunity(cfg.community) : null,
    measure: cfg.measure ? readMeasure(cfg.measure) : null,
    rules: { MIN_NAMES_FOR_PRESENCE: MIN_NAMES_FOR_PRESENCE, MIN_HOST_HOURS: MIN_HOST_HOURS, MIN_MEMBERS_ASKING: MIN_MEMBERS_ASKING,
      MIN_DARK_ANSWERS: MIN_DARK_ANSWERS, TREND_BAND: TREND_BAND, UNKNOWN_SHARE_MAX: UNKNOWN_SHARE_MAX, DARK_SOURCES: DARK_SOURCES },
  };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const pct = (v) => v == null ? '-' : Math.round(v * 100) + '%';
const num = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
const arrow = (t) => !t ? '-' : t.dir === 'up' ? 'up' + (t.change == null ? '' : ' ' + (t.change > 0 ? '+' : '') + Math.round(t.change * 100) + '%') : t.dir === 'down' ? 'down ' + Math.round(t.change * 100) + '%' : 'flat';
function render(r) {
  const L = [];
  if (r.map) {
    const m = r.map;
    L.push('MAP - where your buyers already talk, ranked by evidence');
    m.places.forEach((p) => {
      L.push(`  ${p.name}${p.kind ? ' (' + p.kind + ')' : ''}: named by ${p.namedByBuyers} buyers, ${p.selfReportedMentions} lead mentions - ${p.present ? (p.answering ? 'present, answering' : 'present, silent') : 'not present'} [${p.status}]`);
      p.findings.forEach((f) => L.push(`     ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
    });
    L.push(`  Coverage: present and answering in ${m.presentAndAnswering} of ${m.buyerNamedPlaces} places named by ${MIN_NAMES_FOR_PRESENCE}+ buyers${m.coverage == null ? '' : ' (' + pct(m.coverage) + ')'}.`);
    L.push('');
  }
  if (r.community) {
    const c = r.community;
    L.push(`OWN COMMUNITY - ${c.verdict.level.toUpperCase()}: ${c.verdict.text}`);
    c.missing.forEach((x) => L.push(`  ! ${x.text}`));
    c.notes.forEach((x) => L.push(`  - ${x}`));
    L.push('');
  }
  if (r.measure) {
    const x = r.measure;
    L.push('MEASURE - by asking, not tracking');
    x.periods.forEach((p) => L.push(`  ${p.label}: dark share ${pct(p.darkShare)} (${p.dark} of ${p.answered} coded answers, ${p.unknown} uncoded), branded search ${num(p.brandedSearch)}, deep-page share of direct ${pct(p.deepDirectShare)}, pipeline ${num(p.pipeline)}`));
    L.push(`  Trend of ${x.latest} vs prior: dark share ${arrow(x.trends.darkShare)}; branded search ${arrow(x.trends.brandedSearch)}; deep direct ${arrow(x.trends.deepDirectShare)}; pipeline ${arrow(x.trends.pipeline)}`);
    x.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
    L.push(`  ${x.verdict.level.toUpperCase()}: ${x.verdict.text}`);
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented places and numbers.
const DEMO = {
  map: [
    { name: 'RevOps Co-op (Slack)', kind: 'community', namedByBuyers: 6, selfReportedMentions: 4, present: true, answering: true },
    { name: 'The Bootstrapped CFO', kind: 'podcast', namedByBuyers: 4, selfReportedMentions: 2, present: true, answering: false },
    { name: 'Seed Marketing Leaders (WhatsApp)', kind: 'community', namedByBuyers: 3, selfReportedMentions: 3, present: false },
    { name: 'Priya N. (LinkedIn)', kind: 'person', namedByBuyers: 2, selfReportedMentions: 1, present: true, answering: true, pitched: true },
    { name: 'Growth Tuesdays', kind: 'newsletter', namedByBuyers: 0, selfReportedMentions: 0, present: true, answering: false },
  ],
  community: { recurringConversation: 'Weekly: what broke in your funnel this week', host: 'Saroj', hostHoursPerWeek: 3,
    quietPlan: '', membersAsking: 6, roleOrProblem: 'heads of marketing at seed-stage SaaS' },
  measure: { periods: [
    { label: 'Jun', leads: 38, selfReported: { person: 2, community: 3, podcast: 1, newsletter: 0, brandName: 4, search: 11, paid: 9, other: 4, unknown: 4 }, brandedSearchImpressions: 1150, directSessions: 880, directDeepPageSessions: 210, pipeline: 58000 },
    { label: 'Jul', leads: 41, selfReported: { person: 3, community: 4, podcast: 1, newsletter: 1, brandName: 5, search: 10, paid: 8, other: 5, unknown: 4 }, brandedSearchImpressions: 1320, directSessions: 910, directDeepPageSessions: 260, pipeline: 61000 },
    { label: 'Aug', leads: 44, selfReported: { person: 5, community: 6, podcast: 2, newsletter: 1, brandName: 6, search: 9, paid: 7, other: 4, unknown: 4 }, brandedSearchImpressions: 1610, directSessions: 950, directDeepPageSessions: 330, pipeline: 59000 },
  ] },
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
    console.log('(no config - demo: five invented places, a community that is not ready, and three months of measurement)\n');
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

module.exports = { run, readMap, checkCommunity, readMeasure, DARK_SOURCES, MIN_NAMES_FOR_PRESENCE, MIN_HOST_HOURS, MIN_MEMBERS_ASKING, MIN_DARK_ANSWERS, TREND_BAND, UNKNOWN_SHARE_MAX };
