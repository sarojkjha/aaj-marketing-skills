#!/usr/bin/env node
/*
 * AAJ Creator Partnerships — engine
 * Part of the "creator-partnerships" Agent Skill.
 *
 * AAJ's position: pay for the buyers a creator actually reaches, not for their
 * follower count, and judge the result on what it sold - tracked and
 * self-reported - rather than on views. The engine compares creators on your
 * own shortlist against each other, so it needs no outside benchmark.
 *
 * USAGE
 *   node creator-fit.js                    # demo
 *   node creator-fit.js '<json-config>'    # your own
 *   node creator-fit.js --help
 *
 * CONFIG (JSON) - "shortlist", "contract", "results": any or all
 *
 *   {
 *     "shortlist": [
 *       { "name": "Creator A", "platform": "YouTube", "followers": 180000,
 *         "avgViews": 42000,                 // median views on recent posts (not followers)
 *         "avgEngagements": 1900,            // likes + comments + shares on those posts
 *         "audienceMatchShare": 0.35,        // share of their audience that fits your buyer
 *         "audienceMatchSource": "creator's analytics screenshot, Sep 2026",
 *         "recentPosts": 20, "sponsoredPosts": 6,
 *         "disclosesSponsorships": true | false | "unknown",
 *         "fee": 4000 }
 *     ],
 *     "contract": { "deliverables": true, "disclosure": true, "approval": true, "usageRights": false,
 *                   "exclusivity": false, "tracking": true, "payment": true, "underperformance": false },
 *     "results": {
 *       "targetCpa": 250,
 *       "creators": [ { "name": "Creator A", "fee": 4000, "trackedConversions": 11, "surveyMentions": 6 } ]
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
var SPONSORED_SHARE_MAX = 0.5;  // above this share of recent posts sponsored, the feed is an ad feed
var MIN_CONVERSIONS = 5;        // below this many attributed conversions, a creator's result is too early to judge
var CONTRACT_TERMS = [
  { id: 'deliverables', label: 'Deliverables and dates', why: 'What is posted, on which channel, in what format, and when.' },
  { id: 'disclosure', label: 'Disclosure wording and placement', why: 'The FTC expects the connection to be disclosed clearly, placed with the endorsement itself and not only in a bio or behind "more"; in video, in the video. Brands are expected to train and monitor the people who promote them.' },
  { id: 'approval', label: 'Review before posting', why: 'You see the post before it goes live, for accuracy of claims and for the disclosure.' },
  { id: 'usageRights', label: 'Usage rights', why: 'Whether you may reuse the content in ads or on your site, where, and for how long.' },
  { id: 'exclusivity', label: 'Exclusivity window', why: 'Whether they can promote a direct competitor, and for how long.' },
  { id: 'tracking', label: 'Tracking', why: 'A unique discount code and a tagged link per creator, so results can be attributed.' },
  { id: 'payment', label: 'Payment terms', why: 'Amount, schedule, and what triggers payment.' },
  { id: 'underperformance', label: 'If a post is removed or underdelivers', why: 'What happens if the post comes down early or a deliverable is missed.' },
];

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

function scoreShortlist(list) {
  if (!Array.isArray(list) || !list.length) throw inputError('"shortlist" needs at least one creator.');
  var rows = list.map(function (c, i) {
    var name = String(c.name || ('Creator ' + (i + 1)));
    if (!isNum(c.fee) || c.fee <= 0) throw inputError('"' + name + '" needs a fee greater than 0.');
    var findings = [];
    var add = function (level, id, text) { findings.push({ level: level, id: id, text: text }); };
    var reach = null, reachBasis = null;
    if (isNum(c.avgViews) && c.avgViews > 0) { reach = c.avgViews; reachBasis = 'views'; }
    else if (isNum(c.followers) && c.followers > 0) {
      reach = c.followers; reachBasis = 'followers';
      add('fix', 'followers-only', 'Only a follower count was given. A follower count is not how many people see a post; ask for median views on their last ten posts.');
    } else throw inputError('"' + name + '" needs avgViews (preferred) or followers.');
    var match = isNum(c.audienceMatchShare) && c.audienceMatchShare >= 0 && c.audienceMatchShare <= 1 ? c.audienceMatchShare : null;
    if (match === null) add('fix', 'no-audience-data', 'No audience match share. Ask for the audience breakdown from their platform analytics - location, age, job or industry where available - and count the share that fits your buyer.');
    else if (!String(c.audienceMatchSource || '').trim()) add('improve', 'audience-unsourced', 'The audience match share has no source. A media-kit claim is not the same as a screenshot of their analytics.');
    var sponsoredShare = isNum(c.recentPosts) && c.recentPosts > 0 && isNum(c.sponsoredPosts) ? c.sponsoredPosts / c.recentPosts : null;
    if (sponsoredShare !== null && sponsoredShare > SPONSORED_SHARE_MAX) add('improve', 'ad-feed', Math.round(sponsoredShare * 100) + '% of their recent posts are sponsored. Before paying for one, compare how their sponsored posts perform against their own; this engine flags anything above ' + Math.round(SPONSORED_SHARE_MAX * 100) + '%.');
    if (c.disclosesSponsorships === false) add('fix', 'no-disclosure', 'Their past sponsored posts do not disclose the paid relationship. The FTC expects clear disclosure, and expects brands to monitor the people promoting them - make disclosure a written term or pass.');
    else if (c.disclosesSponsorships !== true) add('improve', 'disclosure-unknown', 'Check three of their past sponsored posts for a clear disclosure placed with the endorsement, not only in a bio or behind "more".');
    var engagementPerView = isNum(c.avgEngagements) && reach ? c.avgEngagements / reach : null;
    var matched = match !== null ? reach * match : null;
    var costPerThousandMatched = matched ? c.fee / matched * 1000 : null;
    return { name: name, platform: String(c.platform || ''), fee: c.fee, reach: reach, reachBasis: reachBasis, audienceMatchShare: match,
      matchedReach: matched, costPerThousandMatched: costPerThousandMatched, engagementPerView: engagementPerView,
      sponsoredShare: sponsoredShare, findings: findings };
  });
  var comparable = rows.filter(function (r) { return r.costPerThousandMatched !== null && r.reachBasis === 'views'; });
  var best = comparable.slice().sort(function (a, b) { return a.costPerThousandMatched - b.costPerThousandMatched; })[0] || null;
  var engs = comparable.map(function (r) { return r.engagementPerView; }).filter(isNum).sort(function (a, b) { return a - b; });
  var medianEng = engs.length ? (engs.length % 2 ? engs[(engs.length - 1) / 2] : (engs[engs.length / 2 - 1] + engs[engs.length / 2]) / 2) : null;
  rows.forEach(function (r) {
    r.vsBest = best && r.costPerThousandMatched !== null && r.reachBasis === 'views' ? r.costPerThousandMatched / best.costPerThousandMatched : null;
    r.engagementVsShortlist = medianEng && isNum(r.engagementPerView) && comparable.length >= 3 ? r.engagementPerView / medianEng : null;
    var blocking = r.findings.some(function (f) { return f.level === 'fix'; });
    r.status = blocking ? 'needs-data' : 'comparable';
  });
  rows.sort(function (a, b) {
    if (a.status !== b.status) return a.status === 'comparable' ? -1 : 1;
    return (a.costPerThousandMatched == null ? Infinity : a.costPerThousandMatched) - (b.costPerThousandMatched == null ? Infinity : b.costPerThousandMatched);
  });
  return { creators: rows, bestValue: best ? best.name : null };
}

function checkContract(c) {
  c = c || {};
  var missing = CONTRACT_TERMS.filter(function (t) { return c[t.id] !== true; });
  return { terms: CONTRACT_TERMS.map(function (t) { return { id: t.id, label: t.label, why: t.why, agreed: c[t.id] === true }; }),
    missing: missing.map(function (t) { return t.id; }), ready: missing.length === 0 };
}

function readResults(res) {
  res = res || {};
  var list = Array.isArray(res.creators) ? res.creators : [];
  if (!list.length) throw inputError('"results.creators" needs at least one creator.');
  var target = isNum(res.targetCpa) && res.targetCpa > 0 ? res.targetCpa : null;
  var rows = list.map(function (c, i) {
    var name = String(c.name || ('Creator ' + (i + 1)));
    if (!isNum(c.fee) || c.fee < 0) throw inputError('"' + name + '" needs a fee.');
    var tracked = isNum(c.trackedConversions) && c.trackedConversions >= 0 ? c.trackedConversions : 0;
    var survey = isNum(c.surveyMentions) && c.surveyMentions >= 0 ? c.surveyMentions : 0;
    var cpaTracked = tracked ? c.fee / tracked : null;
    // Survey mentions can overlap with tracked conversions (someone used the code AND named the
    // creator), so tracked + survey is an upper bound on conversions and gives a floor on cost.
    var cpaFloor = tracked + survey ? c.fee / (tracked + survey) : null;
    var verdict;
    if (tracked + survey < MIN_CONVERSIONS) verdict = { level: 'too-early', text: 'Fewer than ' + MIN_CONVERSIONS + ' conversions from tracking and survey combined - too few to judge. This engine treats ' + MIN_CONVERSIONS + ' as the floor.' };
    else if (!target) verdict = { level: 'no-target', text: 'Set a target cost per acquisition to get a keep, renegotiate or drop call.' };
    else if (cpaTracked !== null && cpaTracked <= target) verdict = { level: 'keep', text: 'Tracked conversions alone come in at or under target. Keep, and consider a longer arrangement.' };
    else if (cpaFloor !== null && cpaFloor <= target) verdict = { level: 'renegotiate', text: 'Only hits target if every survey mention is counted as extra. Renegotiate toward a lower fixed fee plus a per-conversion payment, or run once more with a stronger offer.' };
    else verdict = { level: 'drop', text: 'Over target even counting every survey mention. Drop, or change the offer before trying again.' };
    return { name: name, fee: c.fee, tracked: tracked, survey: survey, cpaTracked: cpaTracked, cpaFloor: cpaFloor, verdict: verdict };
  });
  var totalFee = rows.reduce(function (a, r) { return a + r.fee; }, 0);
  var totalTracked = rows.reduce(function (a, r) { return a + r.tracked; }, 0);
  return { targetCpa: target, creators: rows, totalFee: totalFee, totalTracked: totalTracked,
    blendedCpaTracked: totalTracked ? totalFee / totalTracked : null };
}

function run(cfg) {
  cfg = cfg || {};
  if (!cfg.shortlist && !cfg.contract && !cfg.results) throw inputError('Give a "shortlist", a "contract", "results", or any combination.');
  return {
    shortlist: cfg.shortlist ? scoreShortlist(cfg.shortlist) : null,
    contract: cfg.contract ? checkContract(cfg.contract) : null,
    results: cfg.results ? readResults(cfg.results) : null,
    rules: { SPONSORED_SHARE_MAX: SPONSORED_SHARE_MAX, MIN_CONVERSIONS: MIN_CONVERSIONS },
  };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const money = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
function render(r) {
  const L = [];
  if (r.shortlist) {
    L.push('SHORTLIST - cost per thousand people who fit your buyer');
    r.shortlist.creators.forEach((c) => {
      const cost = c.costPerThousandMatched == null ? 'needs data' : money(c.costPerThousandMatched) + ' per 1,000 matched' + (c.vsBest && c.vsBest > 1.05 ? ` (${c.vsBest.toFixed(1)}x the best on this list)` : c.vsBest ? ' (best on this list)' : '');
      L.push(`  ${c.name}${c.platform ? ' (' + c.platform + ')' : ''}: fee ${money(c.fee)}, reach ${money(c.reach)} ${c.reachBasis}, match ${c.audienceMatchShare == null ? '-' : Math.round(c.audienceMatchShare * 100) + '%'} - ${cost}`);
      c.findings.forEach((f) => L.push(`     ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
    });
    L.push('');
  }
  if (r.contract) {
    L.push(r.contract.ready ? 'CONTRACT - all eight terms agreed' : 'CONTRACT - missing terms');
    r.contract.terms.filter((t) => !t.agreed).forEach((t) => L.push(`  ! ${t.label}: ${t.why}`));
    L.push('');
  }
  if (r.results) {
    const x = r.results;
    L.push('RESULTS' + (x.targetCpa ? ' - target cost per acquisition ' + money(x.targetCpa) : ''));
    x.creators.forEach((c) => {
      L.push(`  ${c.name}: ${c.tracked} tracked + ${c.survey} survey mentions; ${c.cpaTracked == null ? '-' : money(c.cpaTracked)} per tracked conversion (${c.cpaFloor == null ? '-' : money(c.cpaFloor)} counting survey mentions)`);
      L.push(`     ${c.verdict.level.toUpperCase()}: ${c.verdict.text}`);
    });
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented creators and numbers.
const DEMO = {
  shortlist: [
    { name: 'Ops Weekly (newsletter + YouTube)', platform: 'YouTube', followers: 95000, avgViews: 21000, avgEngagements: 900,
      audienceMatchShare: 0.45, audienceMatchSource: "creator's YouTube analytics screenshot", recentPosts: 20, sponsoredPosts: 5, disclosesSponsorships: true, fee: 3000 },
    { name: 'Startup Finance Daily', platform: 'LinkedIn', followers: 240000, avgViews: 38000, avgEngagements: 700,
      audienceMatchShare: 0.2, audienceMatchSource: 'LinkedIn creator analytics export', recentPosts: 30, sponsoredPosts: 19, disclosesSponsorships: 'unknown', fee: 4500 },
    { name: 'The Bootstrapped CFO', platform: 'Podcast', followers: 60000, fee: 2500, disclosesSponsorships: true },
  ],
  contract: { deliverables: true, disclosure: true, approval: true, usageRights: false, exclusivity: false, tracking: true, payment: true, underperformance: false },
  results: {
    targetCpa: 250,
    creators: [
      { name: 'Ops Weekly (newsletter + YouTube)', fee: 3000, trackedConversions: 14, surveyMentions: 5 },
      { name: 'Startup Finance Daily', fee: 4500, trackedConversions: 9, surveyMentions: 12 },
      { name: 'The Bootstrapped CFO', fee: 2500, trackedConversions: 1, surveyMentions: 2 },
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
    console.log('(no config - demo: three invented creators, a draft contract, and the results after one round)\n');
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

module.exports = { run, scoreShortlist, checkContract, readResults, CONTRACT_TERMS, SPONSORED_SHARE_MAX, MIN_CONVERSIONS };
