#!/usr/bin/env node
/*
 * AAJ Buying Committee Map - engine
 * Part of the "buying-committee-map" Agent Skill.
 *
 * AAJ's position: a B2B deal is won by a group, and most startups market and
 * sell to the one person who answered the email. This engine takes the people
 * involved in a deal (or a typical deal for a segment), what each must come to
 * believe, whether you can reach them, where they stand, and which asset
 * answers them, and reports the holes: roles nobody has identified, people you
 * cannot reach, beliefs with no proof, blockers with no plan. It ranks the
 * next conversations and the assets to build, and it does not score the deal.
 *
 * USAGE
 *   node buying-committee.js                    # demo
 *   node buying-committee.js '<json-config>'    # your own
 *   node buying-committee.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "deal": "Northside Dental, 12 clinics",       // or a segment: "mid-market clinic groups"
 *     "roles": [
 *       { "role": "champion",                       // champion | economic-buyer | end-user | technical | security-legal | procurement | executive | influencer | blocker
 *         "title": "Practice manager", "name": "R. Ortiz",   // a person is identified only when "name" is given
 *         "access": "direct",                       // direct | via-champion | none
 *         "stance": "for",                          // for | neutral | against | unknown
 *         "mustBelieve": "Scheduling will cut front-desk calls",
 *         "asset": "Fieldnote ROI sheet",           // the proof that answers it; omit if none
 *         "plan": "Reference call with Lakeside" }  // optional: what you will do next with this person
 *     ]
 *   }
 *
 * Rules of this engine (stated so you can argue with them): a deal with no
 * identified economic buyer is exposed whatever else is true; a role marked
 * against with no plan is a blocker; a belief with no asset is a gap for
 * sales enablement; a person you cannot reach directly or through the champion
 * is a conversation to engineer; coverage is the share of roles that are
 * identified, reachable and answered.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var ROLES = ['champion', 'economic-buyer', 'end-user', 'technical', 'security-legal', 'procurement', 'executive', 'influencer', 'blocker'];
var CORE = ['champion', 'economic-buyer', 'end-user'];   // a map without these is incomplete (engine rule)
var ACCESS = ['direct', 'via-champion', 'none'];
var STANCE = ['for', 'neutral', 'against', 'unknown'];

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function norm(s) { return String(s || '').toLowerCase().replace(/[\s_]+/g, '-').trim(); }
function str(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function map(cfg) {
  cfg = cfg || {};
  if (typeof cfg !== 'object' || Array.isArray(cfg)) throw inputError('The input must be a JSON object.');
  var topBad = Object.keys(cfg).filter(function (k) { return k !== 'deal' && k !== 'roles'; });
  if (topBad.length) throw inputError('Unrecognised field' + (topBad.length > 1 ? 's' : '') + ': ' + topBad.map(function (k) { return '"' + k + '"'; }).join(', ') + '. Expected: deal, roles.');
  var raw = Array.isArray(cfg.roles) ? cfg.roles : [];
  if (!raw.length) throw inputError('"roles" needs at least one person with a "role".');
  var roles = raw.map(function (r, i) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw inputError('Row ' + (i + 1) + ' must be an object.');
    var rowBad = Object.keys(r).filter(function (k) { return ['role', 'title', 'name', 'access', 'stance', 'mustBelieve', 'asset', 'plan'].indexOf(k) < 0; });
    if (rowBad.length) throw inputError('Row ' + (i + 1) + ': unrecognised field' + (rowBad.length > 1 ? 's' : '') + ' ' + rowBad.map(function (k) { return '"' + k + '"'; }).join(', ') + '. Expected: role, title, name, access, stance, mustBelieve, asset, plan.');
    var role = norm(r && r.role);
    if (ROLES.indexOf(role) < 0) throw inputError('Row ' + (i + 1) + ': "role" must be one of ' + ROLES.join(', ') + '.');
    var access = norm(r.access) || 'none', stance = norm(r.stance) || 'unknown';
    if (ACCESS.indexOf(access) < 0) throw inputError('Row ' + (i + 1) + ' (' + role + '): "access" must be direct, via-champion or none.');
    if (STANCE.indexOf(stance) < 0) throw inputError('Row ' + (i + 1) + ' (' + role + '): "stance" must be for, neutral, against or unknown.');
    var name = str(r.name), title = str(r.title);
    var identified = !!(name && !/^unknown$/i.test(name));   // a title is a role, not a person
    return { role: role, title: title || null, name: name || null, identified: identified, access: access, stance: stance,
      mustBelieve: str(r.mustBelieve) || null, asset: str(r.asset) || null, plan: str(r.plan) || null };
  });
  var hasChampion = roles.some(function (r) { return r.role === 'champion' && r.identified; });
  var findings = [], next = [], build = [];
  var add = function (level, id, text) { findings.push({ level: level, id: id, text: text }); };

  CORE.forEach(function (c) {
    if (!roles.some(function (r) { return r.role === c; })) add('fix', 'missing-' + c, 'No ' + c.replace('-', ' ') + ' on the map. ' + (c === 'economic-buyer' ? 'Until someone who owns the budget is identified, the deal has no close date.' : c === 'champion' ? 'Without a champion nobody carries the case when you are not in the room.' : 'The people who will use it decide whether it sticks; find one.'));
  });
  if (!roles.some(function (r) { return r.role === 'security-legal' || r.role === 'procurement'; })) add('improve', 'no-review-roles', 'No security, legal or procurement role. If the buyer runs a review, it appears late and adds weeks; ask the champion whether one exists.');

  roles.forEach(function (r) {
    var who = r.role + (r.title ? ' (' + r.title + ')' : '');
    if (!r.identified) { add('fix', 'unidentified', who + ': nobody identified. Ask the champion who holds this role.'); next.push({ priority: r.role === 'economic-buyer' ? 1 : 2, who: who, action: 'Identify the person; ask the champion "who signs, and who else has to say yes?"' }); }
    if (r.identified && r.access === 'none') { add('fix', 'no-access', who + ': no way to reach them' + (hasChampion ? '; brief the champion to carry the case, or ask for an introduction' : ', and there is no champion to carry it') + '.'); next.push({ priority: r.role === 'economic-buyer' ? 1 : 3, who: who, action: hasChampion ? 'Equip the champion with the one-page case for this person, then ask for 20 minutes with them' : 'Find a champion first' }); }
    if (r.stance === 'against') { if (!r.plan) { add('fix', 'blocker', who + ' is against with no plan. An unaddressed blocker beats a happy champion.'); next.push({ priority: 1, who: who, action: 'Learn the objection first-hand (not relayed), then answer it or route around it; see objection-handling' }); } else add('improve', 'blocker-planned', who + ' is against; plan in place: ' + r.plan + '.'); }
    if (r.stance === 'unknown' && r.identified) next.push({ priority: 3, who: who, action: 'Find out where they stand before the next meeting; a silent role is a no you have not heard yet' });
    if (!r.mustBelieve) add('improve', 'no-belief', who + ': what must they believe to say yes? Write it as one sentence.');
    else if (!r.asset) { add('improve', 'no-asset', who + ' must believe "' + r.mustBelieve + '" and no asset answers it.'); build.push({ forRole: r.role, belief: r.mustBelieve, suggest: suggestAsset(r.role) }); }
  });

  var covered = roles.filter(function (r) { return r.identified && r.access !== 'none' && r.mustBelieve && r.asset; }).length;
  // A core role nobody has put on the map counts as uncovered, so one well-documented champion is not 100%.
  var missingCore = CORE.filter(function (c) { return !roles.some(function (r) { return r.role === c; }); }).length;
  var total = roles.length + missingCore;
  var coverage = covered / total;
  var ebRows = roles.filter(function (r) { return r.role === 'economic-buyer'; });
  var ebReached = ebRows.some(function (r) { return r.identified && r.access !== 'none'; });
  var blockers = roles.filter(function (r) { return r.stance === 'against' && !r.plan; }).length;
  next.sort(function (a, b) { return a.priority - b.priority; });

  var verdict;
  if (blockers) verdict = { level: 'blocked', text: blockers + ' person' + (blockers > 1 ? 's are' : ' is') + ' against with no plan. Deal with the objection before another demo; nothing else on this map matters until it is answered.' };
  else if (!ebRows.length || !ebReached) verdict = { level: 'exposed', text: (!ebRows.length ? 'No economic buyer on the map' : ebRows.some(function (r) { return r.identified; }) ? 'The economic buyer is identified but you cannot reach them' : 'The economic buyer role is on the map but nobody is named in it') + '. Everything else can be perfect and the deal still stalls at the signature. First conversation: ' + (next[0] ? next[0].who + ' - ' + next[0].action : 'find the budget owner') + '.' };
  else if (coverage < 1) verdict = { level: 'gaps', text: Math.round(coverage * 100) + '% of roles are identified, reachable and answered. ' + (build.length ? build.length + ' belief' + (build.length > 1 ? 's have' : ' has') + ' no asset; ' : '') + (next.length ? 'next: ' + next[0].who + ' - ' + next[0].action : 'close the remaining gaps in the findings') + '.' };
  else verdict = { level: 'covered', text: 'Every role is identified, reachable and has an asset for what they must believe. Confirm the stances are current, then ask for the decision date.' };

  return { deal: str(cfg.deal) || null, roles: roles, coverage: coverage, covered: covered, total: total, missingCore: missingCore, economicBuyerReached: ebReached, blockers: blockers, nextConversations: next.slice(0, 8), assetsToBuild: build, findings: findings, verdict: verdict, rules: { CORE: CORE } };
}

function suggestAsset(role) {
  return { 'economic-buyer': 'a one-page business case with the number they own and the cost of waiting', 'end-user': 'a 10-minute demo of their day with the product, or a trial', 'technical': 'architecture and integration notes, API docs', 'security-legal': 'the security questionnaire answers and the data-processing terms', 'procurement': 'standard terms, pricing sheet, a reference customer', 'executive': 'a half-page summary with the outcome and the risk of the status quo', 'champion': 'the internal deck they can present without you', 'influencer': 'the comparison page or a peer reference', 'blocker': 'a direct conversation and the objection answer' }[role] || 'a proof point for the belief';
}

function run(cfg) { return map(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  var L = [];
  L.push('');
  L.push('AAJ - BUYING COMMITTEE MAP' + (r.deal ? ': ' + r.deal : ''));
  L.push('-'.repeat(66));
  L.push('  ' + r.verdict.level.toUpperCase() + ': ' + r.verdict.text);
  L.push('  Coverage ' + r.covered + ' of ' + r.total + ' roles identified, reachable and answered (' + Math.round(r.coverage * 100) + '%)' + (r.missingCore ? '; ' + r.missingCore + ' core role' + (r.missingCore > 1 ? 's' : '') + ' (champion, economic buyer, end user) not on the map counted as uncovered' : ''));
  L.push('');
  L.push('THE MAP');
  r.roles.forEach(function (x) {
    L.push('  ' + x.role.padEnd(15) + (x.name || x.title || 'UNKNOWN').padEnd(22) + ' access ' + x.access.padEnd(12) + ' stance ' + x.stance.padEnd(8) + (x.mustBelieve ? ' must believe: ' + x.mustBelieve : ' must believe: ?'));
    L.push('  ' + ''.padEnd(15) + (x.asset ? 'asset: ' + x.asset : 'asset: NONE') + (x.plan ? ' | plan: ' + x.plan : ''));
  });
  if (r.nextConversations.length) { L.push(''); L.push('NEXT CONVERSATIONS'); r.nextConversations.forEach(function (n, i) { L.push('  ' + (i + 1) + '. ' + n.who + ': ' + n.action); }); }
  if (r.assetsToBuild.length) { L.push(''); L.push('ASSETS TO BUILD'); r.assetsToBuild.forEach(function (b) { L.push('  ' + b.forRole + ' must believe "' + b.belief + '" -> ' + b.suggest); }); }
  if (r.findings.length) { L.push(''); L.push('FINDINGS'); r.findings.forEach(function (f) { L.push('  ' + (f.level === 'fix' ? '!' : '-') + ' ' + f.text); }); }
  L.push('');
  L.push('  A map of who must say yes and what each needs to believe. It does not score the deal or predict the close; pipeline-and-forecast does that from stages.');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: an invented deal.
var DEMO = { deal: 'Northside Dental, 12 clinics', roles: [
  { role: 'champion', title: 'Practice manager', name: 'R. Ortiz', access: 'direct', stance: 'for', mustBelieve: 'Scheduling will cut front-desk calls by a third', asset: 'Fieldnote ROI sheet', plan: 'Reference call with Lakeside Dental next week' },
  { role: 'economic-buyer', title: 'COO', name: 'unknown', access: 'none', stance: 'unknown', mustBelieve: 'Payback inside two quarters' },
  { role: 'end-user', title: 'Front-desk lead', name: 'Four front-desk leads', access: 'via-champion', stance: 'neutral', mustBelieve: 'It is faster than the whiteboard', asset: '10-minute day-in-the-life demo' },
  { role: 'technical', title: 'IT contractor', name: 'D. Shah', access: 'direct', stance: 'against', mustBelieve: 'It will not break the Dentrix sync' },
  { role: 'security-legal', title: 'Compliance officer', name: 'M. Chen', access: 'via-champion', stance: 'unknown', mustBelieve: 'Patient data stays HIPAA-safe', asset: 'Security questionnaire answers' },
] };

function main() {
  var arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  var cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); } catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    console.log('(no config - demo: an invented five-person deal with an unreached budget owner and one blocker)');
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

module.exports = { run, map, suggestAsset, ROLES, CORE };
