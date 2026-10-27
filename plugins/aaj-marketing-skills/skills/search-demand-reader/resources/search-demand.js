#!/usr/bin/env node
/*
 * AAJ Search Demand Reader - engine
 * Part of the "search-demand-reader" Agent Skill.
 *
 * AAJ's position: the only search demand data a startup can trust is its own
 * Search Console, because every other source estimates. This engine reads a
 * Queries export, sorts each query by intent (branded, informational,
 * commercial, transactional), groups queries into topics by their most
 * common word, and reports where the demand is: topics people already find
 * you for on page two or worse (the cheapest gaps), queries two of your pages
 * compete for, the branded share of your traffic, and the rival-brand
 * searches you already appear in. It never estimates a volume you cannot see.
 *
 * USAGE
 *   node search-demand.js                    # demo
 *   node search-demand.js '<json-config>'    # your own
 *   node search-demand.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "brand": ["aaj", "aajconsult"],                 // words that mark a branded query
 *     "rivals": ["hubspot", "gong"],                  // optional: rival brand words
 *     "queries": [                                    // Search Console > Queries export
 *       { "query": "marketing budget calculator", "clicks": 30, "impressions": 2000,
 *         "position": 4.2, "page": "/tools/marketing-budget-calculator" }   // page optional
 *     ]
 *   }
 *
 * Rules of this engine (stated so you can argue with them): a topic needs 200
 * impressions to count as demand; a topic whose impression-weighted position
 * is worse than 10 is a gap you already appear for; a query is cannibalised
 * when two or more of your pages each take at least 20% of its impressions;
 * intent is read from modifier words you can see in the source, and a query
 * with no modifier is "unqualified", not guessed.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// Windows shells (PowerShell, cmd) can pass a JSON payload with its quotes
// backslash-escaped, i.e. {\"a\":1}. Undo that only when the payload opens that
// way, so JSON with legitimately escaped quotes inside strings is left alone.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^\s*[\[{]\s*\\"/.test(a) ? a.replace(/\\"/g, '"') : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var MIN_TOPIC_IMPR = 200;   // a topic needs this many impressions to count as demand (engine rule)
var GAP_POSITION = 10;      // a topic ranking worse than this, on average, is a gap you already appear for (engine rule)
var CANNIBAL_SHARE = 0.20;  // two pages each taking this share of a query's impressions is cannibalisation (engine rule)

var INFO = /\b(how|what|why|when|where|which|who|guide|tutorial|example|examples|examples?|meaning|definition|define|explained|learn|tips|ideas|checklist|template|templates|formula|calculate|vs\.?|versus|difference)\b/i;
var COMMERCIAL = /\b(best|top|alternative|alternatives|review|reviews|comparison|compare|vs\.?|versus|cheapest|affordable|pricing|price|cost|costs|tool|tools|software|platform|agency|agencies|consultant|consultants|services?)\b/i;
var TRANSACTIONAL = /\b(buy|demo|trial|free trial|sign up|signup|download|book|hire|quote|order|subscribe|get started|pricing)\b/i;
var STOP = ('a an the and or of to in on for with at by from as is are be it its this that i we you your our my me us do does can how what why when where which who no not ' +
  'best top free vs versus alternative alternatives review reviews comparison compare guide tutorial example examples template templates tool tools software platform ' +
  'calculator calculate pricing price cost costs demo trial buy download near online new 2024 2025 2026').split(' ');
var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = true; });

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function num(v) { if (isNum(v)) return v; if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v.replace(/[,%]/g, '')))) return Number(v.replace(/[,%]/g, '')); return null; }
function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function stem(w) { return w.length > 4 && /(ies)$/.test(w) ? w.slice(0, -3) + 'y' : w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; }
function tokens(q) { return norm(q).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean).map(stem); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function intentOf(q, brandRe, rivalRe) {
  if (brandRe && brandRe.test(q)) return 'branded';
  if (rivalRe && rivalRe.test(q)) return 'rival-brand';
  if (TRANSACTIONAL.test(q)) return 'transactional';
  if (COMMERCIAL.test(q)) return 'commercial';
  if (INFO.test(q)) return 'informational';
  return 'unqualified';
}

function analyse(cfg) {
  cfg = cfg || {};
  var raw = Array.isArray(cfg.queries) ? cfg.queries : [];
  if (!raw.length) throw inputError('"queries" needs at least one row with "query" and "impressions".');
  var brand = (Array.isArray(cfg.brand) ? cfg.brand : []).map(norm).filter(Boolean);
  var rivals = (Array.isArray(cfg.rivals) ? cfg.rivals : []).map(norm).filter(Boolean);
  var brandRe = brand.length ? new RegExp('\\b(' + brand.map(escapeRe).join('|') + ')', 'i') : null;
  var rivalRe = rivals.length ? new RegExp('\\b(' + rivals.map(escapeRe).join('|') + ')', 'i') : null;

  var rows = raw.map(function (r, i) {
    var q = norm(r && r.query);
    if (!q) throw inputError('Row ' + (i + 1) + ' has no "query".');
    var impr = num(r.impressions), clicks = num(r.clicks) || 0, pos = num(r.position);
    if (impr === null) throw inputError('Row ' + (i + 1) + ' ("' + q + '") needs numeric "impressions".');
    return { query: q, clicks: clicks, impressions: impr, position: pos, page: norm(r.page) || null, intent: intentOf(q, brandRe, rivalRe), tokens: tokens(q).filter(function (t) { return !STOPSET[t] && t.length > 1; }) };
  });

  // merge rows that repeat a query across pages, keeping the page split for cannibalisation
  var byQuery = {};
  rows.forEach(function (r) {
    var Q = byQuery[r.query] || (byQuery[r.query] = { query: r.query, clicks: 0, impressions: 0, posW: 0, posN: 0, pages: {}, intent: r.intent, tokens: r.tokens });
    Q.clicks += r.clicks; Q.impressions += r.impressions;
    if (r.position !== null) { Q.posW += r.position * r.impressions; Q.posN += r.impressions; }
    if (r.page) Q.pages[r.page] = (Q.pages[r.page] || 0) + r.impressions;
  });
  var queries = Object.keys(byQuery).map(function (k) { var Q = byQuery[k]; Q.position = Q.posN ? Q.posW / Q.posN : null; return Q; });

  // topic word frequency, by impressions
  var freq = {};
  queries.forEach(function (Q) { Q.tokens.forEach(function (t) { freq[t] = (freq[t] || 0) + Q.impressions; }); });
  var topics = {};
  queries.forEach(function (Q) {
    var key = Q.tokens.slice().sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })[0];
    if (!key) key = Q.intent === 'branded' ? '(brand)' : '(other)';
    if (Q.intent === 'branded') key = '(brand)';
    var T = topics[key] || (topics[key] = { topic: key, queries: 0, clicks: 0, impressions: 0, posW: 0, posN: 0, pages: {}, intents: {}, top: [] });
    T.queries++; T.clicks += Q.clicks; T.impressions += Q.impressions;
    if (Q.position !== null) { T.posW += Q.position * Q.impressions; T.posN += Q.impressions; }
    Object.keys(Q.pages).forEach(function (p) { T.pages[p] = (T.pages[p] || 0) + Q.pages[p]; });
    T.intents[Q.intent] = (T.intents[Q.intent] || 0) + Q.impressions;
    T.top.push({ query: Q.query, impressions: Q.impressions, clicks: Q.clicks, position: Q.position });
  });
  var topicRows = Object.keys(topics).map(function (k) {
    var T = topics[k];
    T.position = T.posN ? T.posW / T.posN : null; T.ctr = T.impressions ? T.clicks / T.impressions : null;
    T.top = T.top.sort(function (a, b) { return b.impressions - a.impressions; }).slice(0, 5);
    T.pageCount = Object.keys(T.pages).length;
    delete T.posW; delete T.posN;
    T.isDemand = T.impressions >= MIN_TOPIC_IMPR;
    T.isGap = T.isDemand && T.position !== null && T.position > GAP_POSITION && k !== '(brand)';
    return T;
  }).sort(function (a, b) { return b.impressions - a.impressions || a.topic.localeCompare(b.topic); });

  var gaps = topicRows.filter(function (t) { return t.isGap; }).sort(function (a, b) { return b.impressions - a.impressions; });
  var cannibal = queries.filter(function (Q) {
    var pages = Object.keys(Q.pages); if (pages.length < 2) return false;
    var big = pages.filter(function (p) { return Q.pages[p] / Q.impressions >= CANNIBAL_SHARE; });
    return big.length >= 2;
  }).map(function (Q) { return { query: Q.query, impressions: Q.impressions, position: Q.position, pages: Object.keys(Q.pages).map(function (p) { return { page: p, share: Q.pages[p] / Q.impressions }; }).sort(function (a, b) { return b.share - a.share; }) }; })
    .sort(function (a, b) { return b.impressions - a.impressions; });

  var totals = { clicks: 0, impressions: 0 }, byIntent = {};
  queries.forEach(function (Q) { totals.clicks += Q.clicks; totals.impressions += Q.impressions; var I = byIntent[Q.intent] || (byIntent[Q.intent] = { intent: Q.intent, queries: 0, clicks: 0, impressions: 0 }); I.queries++; I.clicks += Q.clicks; I.impressions += Q.impressions; });
  var intentRows = Object.keys(byIntent).map(function (k) { var I = byIntent[k]; I.imprShare = totals.impressions ? I.impressions / totals.impressions : 0; I.clickShare = totals.clicks ? I.clicks / totals.clicks : 0; return I; }).sort(function (a, b) { return b.impressions - a.impressions; });
  var brandedClicks = byIntent.branded ? byIntent.branded.clicks : 0;
  var rivalQueries = queries.filter(function (Q) { return Q.intent === 'rival-brand'; }).sort(function (a, b) { return b.impressions - a.impressions; }).slice(0, 15);

  var findings = [];
  if (!brand.length) findings.push({ level: 'improve', id: 'no-brand', text: 'No "brand" words given, so branded searches are mixed into the topics and the branded share cannot be read.' });
  var noPos = queries.filter(function (Q) { return Q.position === null; }).length;
  if (noPos) findings.push({ level: 'improve', id: 'no-position', text: noPos + ' quer' + (noPos > 1 ? 'ies have' : 'y has') + ' no position, so ' + (noPos > 1 ? 'they' : 'it') + ' cannot be placed as a gap.' });
  var noPage = queries.filter(function (Q) { return !Object.keys(Q.pages).length; }).length;
  if (noPage === queries.length) findings.push({ level: 'improve', id: 'no-pages', text: 'No "page" on any row. Export Queries with the page dimension (or two exports joined) to see cannibalisation and which page owns each topic.' });
  var unq = byIntent.unqualified ? byIntent.unqualified.impressions / (totals.impressions || 1) : 0;
  if (unq > 0.5) findings.push({ level: 'improve', id: 'unqualified', text: Math.round(unq * 100) + '% of impressions are on queries with no intent modifier. Read the top ones by hand; the intent read is by word list and says "unqualified" rather than guess.' });
  if (queries.length < 50) findings.push({ level: 'improve', id: 'few-queries', text: queries.length + ' queries. Export at least three months and all rows; topics need more than a handful of queries each.' });

  var verdict;
  if (gaps.length) verdict = { level: 'gaps', text: gaps.length + ' topic' + (gaps.length > 1 ? 's' : '') + ' with ' + MIN_TOPIC_IMPR + '+ impressions where you rank past position ' + GAP_POSITION + '. Largest: "' + gaps[0].topic + '" (' + gaps[0].impressions + ' impressions at position ' + gaps[0].position.toFixed(1) + '; top query "' + gaps[0].top[0].query + '"). You already appear; a dedicated page or a refresh moves it.' };
  else if (cannibal.length) verdict = { level: 'cannibalisation', text: 'No page-two gaps, but ' + cannibal.length + ' quer' + (cannibal.length > 1 ? 'ies are' : 'y is') + ' split across two or more of your pages. Start with "' + cannibal[0].query + '" (' + cannibal[0].impressions + ' impressions): pick one page and point the other at it.' };
  else verdict = { level: 'covered', text: 'Every topic with ' + MIN_TOPIC_IMPR + '+ impressions ranks on page one on average and no query is split across pages. Demand you do not appear for at all is invisible here; that needs interviews, reviews or a keyword tool you trust.' };

  return { totals: totals, brandedShareOfClicks: totals.clicks ? brandedClicks / totals.clicks : null, intents: intentRows, topics: topicRows.slice(0, 60), gaps: gaps.slice(0, 20), cannibalisation: cannibal.slice(0, 20), rivalBrandQueries: rivalQueries,
    findings: findings, verdict: verdict, rules: { MIN_TOPIC_IMPR: MIN_TOPIC_IMPR, GAP_POSITION: GAP_POSITION, CANNIBAL_SHARE: CANNIBAL_SHARE } };
}

function run(cfg) { return analyse(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
var pct = function (v) { return v == null ? '-' : Math.round(v * 100) + '%'; };
function render(r) {
  var L = [];
  L.push('');
  L.push('AAJ - SEARCH DEMAND READER');
  L.push('-'.repeat(66));
  L.push('  ' + r.totals.impressions + ' impressions, ' + r.totals.clicks + ' clicks' + (r.brandedShareOfClicks != null ? '; branded ' + pct(r.brandedShareOfClicks) + ' of clicks' : ''));
  L.push('  ' + r.verdict.level.toUpperCase() + ': ' + r.verdict.text);
  L.push('');
  L.push('BY INTENT');
  r.intents.forEach(function (I) { L.push('  ' + I.intent.padEnd(14) + String(I.queries).padStart(4) + ' queries  ' + String(I.impressions).padStart(7) + ' impr (' + pct(I.imprShare) + ')  ' + String(I.clicks).padStart(6) + ' clicks (' + pct(I.clickShare) + ')'); });
  L.push('');
  L.push('TOPICS (by most common word; impressions, clicks, average position, pages)');
  r.topics.slice(0, 15).forEach(function (T) { L.push('  ' + T.topic.padEnd(18) + String(T.impressions).padStart(7) + '  ' + String(T.clicks).padStart(6) + '  pos ' + (T.position == null ? '-' : T.position.toFixed(1)).padStart(5) + '  ' + T.pageCount + ' page' + (T.pageCount === 1 ? '' : 's') + (T.isGap ? '  <- gap' : '') + '   e.g. "' + T.top[0].query + '"'); });
  if (r.gaps.length) { L.push(''); L.push('GAPS YOU ALREADY APPEAR FOR (page two or worse)'); r.gaps.forEach(function (T) { L.push('  ' + T.topic + ': ' + T.impressions + ' impressions at position ' + T.position.toFixed(1) + '; queries: ' + T.top.map(function (q) { return '"' + q.query + '"'; }).join(', ')); }); }
  if (r.cannibalisation.length) { L.push(''); L.push('SPLIT ACROSS YOUR OWN PAGES'); r.cannibalisation.forEach(function (c) { L.push('  "' + c.query + '" (' + c.impressions + '): ' + c.pages.map(function (p) { return p.page + ' ' + pct(p.share); }).join(' | ')); }); }
  if (r.rivalBrandQueries.length) { L.push(''); L.push('RIVAL-BRAND SEARCHES YOU APPEAR IN: ' + r.rivalBrandQueries.map(function (q) { return '"' + q.query + '" (' + q.impressions + ')'; }).join(', ')); }
  if (r.findings.length) { L.push(''); L.push('CHECK'); r.findings.forEach(function (f) { L.push('  - ' + f.text); }); }
  L.push('');
  L.push('  Only what Search Console showed you. Searches where you never appeared are not in this data and are not estimated.');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented queries and counts.
var q = function (query, clicks, impressions, position, page) { return { query: query, clicks: clicks, impressions: impressions, position: position, page: page }; };
var DEMO = { brand: ['fieldnote'], rivals: ['crewline'], queries: [
  q('fieldnote', 420, 900, 1.1, '/'), q('fieldnote pricing', 60, 150, 1.3, '/pricing'), q('fieldnote login', 200, 260, 1.0, '/login'),
  q('crew scheduling software', 35, 2600, 6.4, '/'), q('best crew scheduling app', 12, 1400, 8.9, '/blog/best-crew-apps'),
  q('how to schedule contractor crews', 25, 1100, 4.2, '/blog/how-to-schedule-crews'), q('contractor scheduling template', 8, 1900, 12.5, '/blog/how-to-schedule-crews'),
  q('scheduling template excel contractors', 2, 700, 14.1, '/blog/how-to-schedule-crews'),
  q('invoice template for contractors', 1, 2200, 18.3, '/blog/invoicing-tips'), q('contractor invoice app', 3, 900, 15.0, '/blog/invoicing-tips'),
  q('no show policy for service business', 9, 650, 7.1, '/blog/no-shows'), q('reduce no shows', 4, 500, 9.8, '/blog/no-shows'), q('reduce no shows', 3, 400, 11.2, '/blog/reminders'),
  q('crewline alternative', 14, 300, 3.5, '/compare/crewline'), q('crewline vs fieldnote', 20, 180, 1.8, '/compare/crewline'),
  q('dispatch software small business', 2, 1300, 22.0, '/'), q('field service dispatch', 1, 800, 25.4, '/'),
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
    console.log('(no config - demo: seventeen invented queries for an invented scheduling app, with a brand word and one rival)');
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

module.exports = { run, analyse, intentOf, tokens, MIN_TOPIC_IMPR, GAP_POSITION, CANNIBAL_SHARE };
