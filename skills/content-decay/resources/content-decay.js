#!/usr/bin/env node
/*
 * AAJ Content Decay Finder - engine
 * Part of the "content-decay" Agent Skill.
 *
 * AAJ's position: a content programme's cheapest wins are the pages that
 * already ranked and are quietly losing clicks. Nobody notices because the
 * total still grows. This engine takes a Search Console page export that
 * compares two periods and sorts every page into decaying (clicks down with
 * demand flat), demand drop (impressions down, not your fault), snippet loss
 * (impressions up, clicks down), rising or stable, then ranks the refresh
 * candidates by the clicks they lost. It uses your own site's numbers for
 * every comparison and no external click-through curve.
 *
 * USAGE
 *   node content-decay.js                    # demo
 *   node content-decay.js '<json-config>'    # your own
 *   node content-decay.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "periodDays": 90,                      // optional: length of each compared period
 *     "pages": [                             // one row per page, from Search Console > Pages > Compare
 *       { "page": "/blog/unit-economics",
 *         "clicks": 410, "clicksPrev": 620,
 *         "impressions": 18000, "impressionsPrev": 17500,
 *         "position": 6.8, "positionPrev": 4.1 }   // average position; optional
 *     ]
 *   }
 *
 * Rules of this engine (stated so you can argue with them): a page needs 20
 * clicks in the previous period to be judged; a change of 20% or more is a
 * change, and anything smaller counts as flat; a position that worsened by 1.0 or more is a ranking loss; a page-one page
 * whose CTR is below your own site's median for its position band, with at
 * least 500 impressions, is a title-and-snippet test candidate.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var MIN_PREV_CLICKS = 20;   // a page needs this many clicks in the previous period to be judged (engine rule)
var CHANGE = 0.20;          // a move of this share or more is a change (engine rule)
var RANK_LOSS = 1.0;        // average position worsening by this much or more is a ranking loss (engine rule)
var MIN_IMPR_CTR = 500;     // impressions needed before CTR is compared with the site median (engine rule)

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function num(v) { if (isNum(v)) return v; if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v.replace(/[,%]/g, '')))) return Number(v.replace(/[,%]/g, '')); return null; }
function pctChange(now, prev) { return prev > 0 ? (now - prev) / prev : (now > 0 ? null : 0); }
function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function band(pos) { return pos === null ? null : pos <= 3 ? '1-3' : pos <= 10 ? '4-10' : pos <= 20 ? '11-20' : '21+'; }

function analyse(cfg) {
  cfg = cfg || {};
  var raw = Array.isArray(cfg.pages) ? cfg.pages : [];
  if (!raw.length) throw inputError('"pages" needs at least one row with "page", "clicks" and "clicksPrev".');
  var pages = raw.map(function (p, i) {
    var row = { page: String(p && p.page || ('row ' + (i + 1))).trim(), clicks: num(p.clicks), clicksPrev: num(p.clicksPrev), impressions: num(p.impressions), impressionsPrev: num(p.impressionsPrev), position: num(p.position), positionPrev: num(p.positionPrev) };
    if (row.clicks === null || row.clicksPrev === null) throw inputError('Row ' + (i + 1) + ' (' + row.page + ') needs numeric "clicks" and "clicksPrev".');
    if (row.clicks < 0 || row.clicksPrev < 0) throw inputError('Row ' + (i + 1) + ' (' + row.page + ') has a negative click count.');
    row.ctr = row.impressions > 0 ? row.clicks / row.impressions : null;
    row.ctrPrev = row.impressionsPrev > 0 ? row.clicksPrev / row.impressionsPrev : null;
    row.clickChange = pctChange(row.clicks, row.clicksPrev);
    row.imprChange = row.impressions !== null && row.impressionsPrev !== null ? pctChange(row.impressions, row.impressionsPrev) : null;
    row.positionChange = row.position !== null && row.positionPrev !== null ? row.position - row.positionPrev : null;
    row.clicksLost = Math.max(0, row.clicksPrev - row.clicks);
    return row;
  });

  // site medians of CTR by position band (page one only), from pages with enough impressions
  var bands = {};
  pages.forEach(function (p) { if (p.ctr !== null && p.impressions >= MIN_IMPR_CTR && p.position !== null) { var b = band(p.position); (bands[b] = bands[b] || []).push(p.ctr); } });
  var medianCtr = {}; Object.keys(bands).forEach(function (b) { medianCtr[b] = median(bands[b]); });

  pages.forEach(function (p) {
    var status, why;
    if (p.clicksPrev < MIN_PREV_CLICKS && p.clicks < MIN_PREV_CLICKS) { status = 'too-small'; why = 'Under ' + MIN_PREV_CLICKS + ' clicks in both periods; too few to judge.'; }
    else if (p.clickChange !== null && p.clickChange <= -CHANGE) {
      if (p.imprChange !== null && p.imprChange <= -CHANGE) { status = 'demand-drop'; why = 'Impressions fell ' + Math.round(-p.imprChange * 100) + '% with clicks. Fewer people searched; check seasonality before touching the page.'; }
      else if (p.imprChange !== null && p.imprChange >= CHANGE) { status = 'snippet-loss'; why = 'Impressions rose ' + Math.round(p.imprChange * 100) + '% while clicks fell: the page shows more and gets chosen less. A SERP feature or a rival title is taking the click.'; }
      else if (p.positionChange !== null && p.positionChange >= RANK_LOSS) { status = 'decaying'; why = 'Average position slipped from ' + p.positionPrev.toFixed(1) + ' to ' + p.position.toFixed(1) + ' with demand flat. Refresh the content and check what now outranks it.'; }
      else { status = 'decaying'; why = 'Clicks fell ' + Math.round(-p.clickChange * 100) + '% with demand flat' + (p.positionChange !== null ? ' and position roughly unchanged' : '') + '. Check the title and snippet first, then the content.'; }
    }
    else if (p.clickChange !== null && p.clickChange >= CHANGE) { status = 'rising'; why = 'Clicks up ' + Math.round(p.clickChange * 100) + '%.' + (p.imprChange !== null && p.imprChange >= CHANGE ? ' Demand rose with it.' : ' Demand flat, so the page is winning more of the same searches.'); }
    else if (p.clickChange === null) { status = 'new'; why = 'No clicks in the previous period.'; }
    else { status = 'stable'; why = 'Within ' + Math.round(CHANGE * 100) + '% of the previous period.'; }
    p.status = status; p.why = why;
    var b = band(p.position);
    p.ctrOpportunity = (p.position !== null && p.position <= 10 && p.impressions >= MIN_IMPR_CTR && medianCtr[b] !== undefined && p.ctr !== null && p.ctr < medianCtr[b])
      ? { band: b, ctr: p.ctr, siteMedian: medianCtr[b], extraClicksAtMedian: Math.round((medianCtr[b] - p.ctr) * p.impressions) } : null;
  });

  var totals = pages.reduce(function (a, p) { a.clicks += p.clicks; a.clicksPrev += p.clicksPrev; a.impressions += p.impressions || 0; a.impressionsPrev += p.impressionsPrev || 0; return a; }, { clicks: 0, clicksPrev: 0, impressions: 0, impressionsPrev: 0 });
  var counts = {}; pages.forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });
  var refresh = pages.filter(function (p) { return p.status === 'decaying' || p.status === 'snippet-loss'; }).sort(function (a, b) { return b.clicksLost - a.clicksLost || a.page.localeCompare(b.page); });
  var ctrTests = pages.filter(function (p) { return p.ctrOpportunity; }).sort(function (a, b) { return b.ctrOpportunity.extraClicksAtMedian - a.ctrOpportunity.extraClicksAtMedian; });
  var lostToDecay = refresh.reduce(function (a, p) { return a + p.clicksLost; }, 0);
  var sorted = pages.slice().sort(function (a, b) { return b.clicks - a.clicks; });
  var topN = Math.max(1, Math.ceil(pages.length * 0.1));
  var topShare = totals.clicks ? sorted.slice(0, topN).reduce(function (a, p) { return a + p.clicks; }, 0) / totals.clicks : null;

  var findings = [];
  var noImpr = pages.filter(function (p) { return p.impressions === null || p.impressionsPrev === null; }).length;
  if (noImpr) findings.push({ level: 'improve', id: 'no-impressions', text: noImpr + ' row' + (noImpr > 1 ? 's have' : ' has') + ' no impressions, so demand drops and snippet losses cannot be told from decay there.' });
  var noPos = pages.filter(function (p) { return p.position === null || p.positionPrev === null; }).length;
  if (noPos) findings.push({ level: 'improve', id: 'no-position', text: noPos + ' row' + (noPos > 1 ? 's have' : ' has') + ' no average position; ranking loss cannot be separated from snippet loss there.' });
  if (pages.length < 10) findings.push({ level: 'improve', id: 'few-pages', text: pages.length + ' page' + (pages.length === 1 ? '' : 's') + '. The site CTR medians need more pages to mean much; export every page, not a filtered view.' });
  if (!Object.keys(medianCtr).length) findings.push({ level: 'improve', id: 'no-ctr-median', text: 'No page has ' + MIN_IMPR_CTR + '+ impressions with a position, so there is no site CTR median and no title-test candidates.' });
  if (totals.clicksPrev && pctChange(totals.clicks, totals.clicksPrev) >= CHANGE && refresh.length) findings.push({ level: 'improve', id: 'masked', text: 'Total clicks are up ' + Math.round(pctChange(totals.clicks, totals.clicksPrev) * 100) + '%, which hides the ' + lostToDecay + ' clicks lost on decaying pages. Growth on new pages is paying for neglect on old ones.' });

  var verdict;
  if (!refresh.length && !ctrTests.length) verdict = { level: 'healthy', text: 'No page lost ' + Math.round(CHANGE * 100) + '% of its clicks with demand flat, and no page-one page sits below your own CTR median. Nothing to refresh this period.' };
  else if (refresh.length) verdict = { level: 'refresh', text: refresh.length + ' page' + (refresh.length > 1 ? 's' : '') + ' losing clicks (' + (counts.decaying || 0) + ' decaying, ' + (counts['snippet-loss'] || 0) + ' snippet loss), ' + lostToDecay + ' clicks lost against the previous period. Start with ' + refresh[0].page + ' (' + refresh[0].clicksLost + ' lost): ' + refresh[0].why };
  else verdict = { level: 'test-titles', text: 'No decay, but ' + ctrTests.length + ' page-one page' + (ctrTests.length > 1 ? 's sit' : ' sits') + ' below your site\'s own CTR median. Start with ' + ctrTests[0].page + ' (about ' + ctrTests[0].ctrOpportunity.extraClicksAtMedian + ' more clicks a period at the median).' };

  return { periodDays: num(cfg.periodDays), pages: pages, totals: { clicks: totals.clicks, clicksPrev: totals.clicksPrev, clickChange: pctChange(totals.clicks, totals.clicksPrev), impressions: totals.impressions, impressionsPrev: totals.impressionsPrev, topTenPercentShare: topShare, topN: topN },
    counts: counts, refresh: refresh.slice(0, 25), lostToDecay: lostToDecay, ctrTests: ctrTests.slice(0, 15), medianCtr: medianCtr, findings: findings, verdict: verdict,
    rules: { MIN_PREV_CLICKS: MIN_PREV_CLICKS, CHANGE: CHANGE, RANK_LOSS: RANK_LOSS, MIN_IMPR_CTR: MIN_IMPR_CTR } };
}

function run(cfg) { return analyse(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
var pct = function (v) { return v == null ? '-' : (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; };
var pc = function (v) { return v == null ? '-' : (v * 100).toFixed(1) + '%'; };
function render(r) {
  var L = [];
  L.push('');
  L.push('AAJ - CONTENT DECAY FINDER' + (r.periodDays ? ' (' + r.periodDays + '-day periods)' : ''));
  L.push('-'.repeat(66));
  L.push('  ' + r.pages.length + ' pages. Clicks ' + r.totals.clicksPrev + ' -> ' + r.totals.clicks + ' (' + pct(r.totals.clickChange) + ')' + (r.totals.topTenPercentShare != null ? '; top ' + r.totals.topN + ' page' + (r.totals.topN > 1 ? 's' : '') + ' carry ' + Math.round(r.totals.topTenPercentShare * 100) + '% of clicks' : ''));
  L.push('  ' + Object.keys(r.counts).map(function (k) { return k + ' ' + r.counts[k]; }).join(', '));
  L.push('  ' + r.verdict.level.toUpperCase() + ': ' + r.verdict.text);
  if (r.refresh.length) {
    L.push(''); L.push('REFRESH, IN ORDER OF CLICKS LOST');
    r.refresh.forEach(function (p) { L.push('  ' + String(p.clicksLost).padStart(6) + '  ' + p.page + '  [' + p.status + '] clicks ' + p.clicksPrev + ' -> ' + p.clicks + (p.positionChange != null ? ', position ' + p.positionPrev.toFixed(1) + ' -> ' + p.position.toFixed(1) : '')); L.push('          ' + p.why); });
  }
  if (r.ctrTests.length) {
    L.push(''); L.push('TITLE AND SNIPPET TESTS (page one, below your site median CTR for the band)');
    r.ctrTests.forEach(function (p) { L.push('  ' + p.page + ': CTR ' + pc(p.ctrOpportunity.ctr) + ' vs site median ' + pc(p.ctrOpportunity.siteMedian) + ' at positions ' + p.ctrOpportunity.band + '; about ' + p.ctrOpportunity.extraClicksAtMedian + ' more clicks a period at the median'); });
  }
  var rising = r.pages.filter(function (p) { return p.status === 'rising'; }).sort(function (a, b) { return (b.clicks - b.clicksPrev) - (a.clicks - a.clicksPrev); }).slice(0, 5);
  if (rising.length) { L.push(''); L.push('RISING: ' + rising.map(function (p) { return p.page + ' (' + pct(p.clickChange) + ')'; }).join(', ')); }
  var demand = r.pages.filter(function (p) { return p.status === 'demand-drop'; });
  if (demand.length) { L.push(''); L.push('DEMAND DROPS (not the page\'s fault; check seasonality): ' + demand.map(function (p) { return p.page; }).join(', ')); }
  if (r.findings.length) { L.push(''); L.push('CHECK'); r.findings.forEach(function (f) { L.push('  - ' + f.text); }); }
  L.push('');
  L.push('  Your own Search Console numbers, compared with themselves. No external click-through curve, no benchmark.');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented pages and counts.
var DEMO = { periodDays: 90, pages: [
  { page: '/blog/unit-economics-explained', clicks: 410, clicksPrev: 620, impressions: 18000, impressionsPrev: 17500, position: 6.8, positionPrev: 4.1 },
  { page: '/blog/ltv-cac-benchmarks', clicks: 300, clicksPrev: 310, impressions: 26000, impressionsPrev: 25000, position: 5.2, positionPrev: 5.4 },
  { page: '/tools/budget-calculator', clicks: 950, clicksPrev: 400, impressions: 21000, impressionsPrev: 12000, position: 3.1, positionPrev: 6.0 },
  { page: '/blog/how-to-pitch-journalists', clicks: 140, clicksPrev: 260, impressions: 9000, impressionsPrev: 9200, position: 7.0, positionPrev: 6.9 },
  { page: '/blog/holiday-marketing-ideas', clicks: 40, clicksPrev: 180, impressions: 1200, impressionsPrev: 6000, position: 4.0, positionPrev: 4.2 },
  { page: '/blog/pricing-page-teardown', clicks: 220, clicksPrev: 290, impressions: 15000, impressionsPrev: 10000, position: 2.4, positionPrev: 2.6 },
  { page: '/playbooks/abm', clicks: 180, clicksPrev: 170, impressions: 8000, impressionsPrev: 7900, position: 8.8, positionPrev: 9.0 },
  { page: '/blog/nrr-vs-grr', clicks: 95, clicksPrev: 90, impressions: 7000, impressionsPrev: 6500, position: 9.5, positionPrev: 9.9 },
  { page: '/blog/first-marketing-hire', clicks: 12, clicksPrev: 15, impressions: 900, impressionsPrev: 1000, position: 14, positionPrev: 13 },
  { page: '/blog/agent-readiness', clicks: 60, clicksPrev: 0, impressions: 3000, impressionsPrev: 0, position: 11, positionPrev: null },
  { page: '/blog/content-calendar', clicks: 130, clicksPrev: 125, impressions: 20000, impressionsPrev: 19000, position: 7.5, positionPrev: 7.7 },
  { page: '/blog/competitive-analysis', clicks: 75, clicksPrev: 78, impressions: 3000, impressionsPrev: 2900, position: 2.9, positionPrev: 3.0 },
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
    console.log('(no config - demo: twelve invented pages over two 90-day periods, one decaying, one losing its snippet, one seasonal)');
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

module.exports = { run, analyse, median, band, MIN_PREV_CLICKS, CHANGE, RANK_LOSS, MIN_IMPR_CTR };
