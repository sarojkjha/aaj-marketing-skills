#!/usr/bin/env node
/*
 * AAJ Paid Search Account Audit — engine
 * Part of the "paid-search-account-audit" Agent Skill.
 *
 * AAJ's position: a paid search account is audited against its own numbers
 * and its own target, never against a published CPC or CTR "benchmark".
 * The order is fixed: if conversion tracking is not verified, nothing else
 * in the account can be read; then waste (spend that produced nothing);
 * then starved winners (campaigns under target that are losing impression
 * share to budget); then landing pages. Every threshold below is an engine
 * rule and is labelled as such.
 *
 * USAGE
 *   node search-audit.js                    # demo
 *   node search-audit.js '<json-config>'    # your own
 *   node search-audit.js --help
 *
 * CONFIG (JSON) - all figures for the same period, usually the last 30 days
 *
 *   {
 *     "targetCpa": 250,                          // your target cost per conversion (from unit economics)
 *     "setup": {                                 // true if verified in the account
 *       "conversionTrackingVerified": true,      // a test conversion recorded, and the primary action is a real one (signup, demo), not a page view
 *       "offlineConversionsImported": false,     // qualified or closed-won imported from the CRM
 *       "brandSeparated": true,                  // brand terms in their own campaign
 *       "searchPartnersReviewed": true,          // partner network performance checked, or off
 *       "displayExpansionOff": true,             // search campaigns not expanded to display
 *       "geoPresenceOnly": false,                // targeting people IN the location, not "interested in"
 *       "sharedNegativeLists": false,            // account-level negative lists applied to every campaign
 *       "autoApplyOff": true,                    // auto-applied recommendations turned off
 *       "assetsComplete": true                   // sitelinks, callouts and structured snippets on every campaign
 *     },
 *     "campaigns": [
 *       { "name": "Brand", "type": "brand",      // brand | non-brand | competitor | pmax | display | shopping
 *         "spend": 900, "clicks": 1200, "impressions": 4000, "conversions": 60,
 *         "bidStrategy": "manual",               // manual | maximize-clicks | maximize-conversions | target-cpa | target-roas
 *         "lostToBudget": 0.05, "lostToRank": 0.1 }   // search impression share lost, as shares
 *     ],
 *     "searchTerms": [                           // the search terms report, or its top rows by spend
 *       { "term": "field service software", "spend": 640, "clicks": 80, "conversions": 4, "match": "phrase", "isKeyword": true }
 *     ],
 *     "irrelevantPatterns": ["free", "jobs?", "salary", "tutorial"],   // regexes for terms that can never convert for you
 *     "landingPages": [
 *       { "url": "/pricing", "spend": 1500, "clicks": 300, "conversions": 12, "messageMatch": true, "mobileOk": true }
 *     ]
 *   }
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var MIN_CLICKS_TO_JUDGE = 10;        // a search term or page with fewer clicks than this is not judged (engine rule)
var MIN_CONV_FOR_AUTO_BID = 30;      // conversions in the period a target-CPA / target-ROAS campaign should have before its bidding is trusted (AAJ's rule)
var STARVED_LOST_BUDGET = 0.2;       // a campaign under target losing at least this share of impressions to budget is starved (engine rule)
var WASTE_SHARE_FLAG = 0.15;         // spend with zero conversions above this share of account spend is the first problem (engine rule)
var BRAND_SPEND_FLAG = 0.5;          // brand taking at least this share of spend is worth a question (engine rule)
var LOW_PAGE_FACTOR = 0.5;           // a page converting under this multiple of the account's median page rate is checked (engine rule)
var WINNER_MIN_CONV = 2;             // a search term with at least this many conversions and no keyword is a winner to add (engine rule)
var SETUP = [
  { id: 'conversionTrackingVerified', level: 'fix', label: 'Conversion tracking verified', why: 'A test conversion recorded, and the primary conversion is a real action (signup, demo, purchase), not a page view. Nothing else in the account can be read until this is true.' },
  { id: 'offlineConversionsImported', level: 'improve', label: 'CRM outcomes imported', why: 'Without qualified or closed-won imported from the CRM, the account optimises toward form fills, including the junk ones.' },
  { id: 'brandSeparated', level: 'fix', label: 'Brand in its own campaign', why: 'Brand terms convert differently and cost differently; mixed with non-brand they hide what non-brand is really costing.' },
  { id: 'searchPartnersReviewed', level: 'improve', label: 'Search partners reviewed', why: 'Partner-network traffic often converts differently from Google search; check it separately or turn it off.' },
  { id: 'displayExpansionOff', level: 'fix', label: 'Display expansion off on search', why: 'Search campaigns expanded to display spend search budget on display inventory with search-level bids.' },
  { id: 'geoPresenceOnly', level: 'improve', label: 'Geo targeting: presence, not interest', why: 'The default includes people "interested in" your location; for a business that sells in one place, that is spend outside it.' },
  { id: 'sharedNegativeLists', level: 'improve', label: 'Shared negative lists', why: 'A negative added to one campaign does not protect the others; account-level lists do.' },
  { id: 'autoApplyOff', level: 'improve', label: 'Auto-applied recommendations off', why: 'Auto-apply changes keywords, match types and budgets without a person deciding.' },
  { id: 'assetsComplete', level: 'improve', label: 'Assets complete', why: 'Sitelinks, callouts and structured snippets on every campaign; missing assets shrink the ad you are paying for.' },
];

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function n0(v) { return isNum(v) && v >= 0 ? v : 0; }
function median(arr) { var a = arr.filter(isNum).slice().sort(function (x, y) { return x - y; }); if (!a.length) return null; return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; }

function checkSetup(s) {
  s = s || {};
  var items = SETUP.map(function (t) { return { id: t.id, label: t.label, level: t.level, why: t.why, ok: s[t.id] === true, unknown: s[t.id] == null }; });
  var missing = items.filter(function (t) { return !t.ok; });
  return { items: items, missing: missing.map(function (t) { return t.id; }), trackingVerified: s.conversionTrackingVerified === true };
}

function readCampaigns(list, target) {
  list = Array.isArray(list) ? list : [];
  var spend = list.reduce(function (a, c) { return a + n0(c.spend); }, 0);
  var conv = list.reduce(function (a, c) { return a + n0(c.conversions); }, 0);
  var rows = list.map(function (c, i) {
    var name = String(c.name || ('Campaign ' + (i + 1))), type = String(c.type || 'non-brand').toLowerCase();
    var sp = n0(c.spend), cl = n0(c.clicks), im = n0(c.impressions), cv = n0(c.conversions);
    var cpa = cv ? sp / cv : null, ctr = im ? cl / im : null, cvr = cl ? cv / cl : null;
    var findings = [];
    var add = function (level, id, text, affected) { findings.push({ level: level, id: id, text: text, spendAffected: affected == null ? sp : affected }); };
    var lostB = isNum(c.lostToBudget) ? c.lostToBudget : null, lostR = isNum(c.lostToRank) ? c.lostToRank : null;
    var underTarget = target && cpa !== null && cpa <= target;
    if (cv === 0 && cl >= MIN_CLICKS_TO_JUDGE) add('fix', 'no-conversions', name + ': ' + sp.toLocaleString('en-US') + ' spent, ' + cl + ' clicks, no conversions. Pause or rebuild before anything else.');
    if (underTarget && lostB !== null && lostB >= STARVED_LOST_BUDGET) add('fix', 'starved-winner', name + ' converts at ' + Math.round(cpa).toLocaleString('en-US') + ' (under your ' + target.toLocaleString('en-US') + ' target) and loses ' + Math.round(lostB * 100) + '% of impressions to budget. This is the cheapest growth in the account: move budget here.', sp * lostB / (1 - lostB));
    if (target && cpa !== null && cpa > target * 2 && cv >= 3) add('fix', 'far-over-target', name + ' converts at ' + Math.round(cpa).toLocaleString('en-US') + ', more than twice your target. Fix the terms and page, or cut it.');
    if (/target-(cpa|roas)|maximize-conversions/.test(String(c.bidStrategy || '')) && cv < MIN_CONV_FOR_AUTO_BID) add('improve', 'thin-auto-bid', name + ' runs ' + c.bidStrategy + ' on ' + cv + ' conversions in the period. Below ' + MIN_CONV_FOR_AUTO_BID + ' (AAJ\'s rule) the algorithm is guessing; consolidate campaigns or bid manually until it has data.');
    if (type === 'pmax' && !c.brandExcluded) add('improve', 'pmax-brand', name + ' is Performance Max without brand exclusions marked. Its reported conversions may be brand searches it would have won anyway.');
    if (String(c.type || '').toLowerCase() === 'mixed') add('fix', 'mixed-brand', name + ' mixes brand and non-brand terms; split them.');
    return { name: name, type: type, spend: sp, clicks: cl, impressions: im, conversions: cv, cpa: cpa, ctr: ctr, cvr: cvr, lostToBudget: lostB, lostToRank: lostR, bidStrategy: String(c.bidStrategy || ''), findings: findings };
  });
  var brand = rows.filter(function (r) { return r.type === 'brand'; });
  var brandSpend = brand.reduce(function (a, r) { return a + r.spend; }, 0), brandConv = brand.reduce(function (a, r) { return a + r.conversions; }, 0);
  var nonBrand = rows.filter(function (r) { return r.type !== 'brand'; });
  var nbSpend = nonBrand.reduce(function (a, r) { return a + r.spend; }, 0), nbConv = nonBrand.reduce(function (a, r) { return a + r.conversions; }, 0);
  var zeroSpend = rows.filter(function (r) { return r.conversions === 0 && r.clicks >= MIN_CLICKS_TO_JUDGE; }).reduce(function (a, r) { return a + r.spend; }, 0);
  var notes = [];
  if (spend && brandSpend / spend >= BRAND_SPEND_FLAG) notes.push('Brand takes ' + Math.round(brandSpend / spend * 100) + '% of spend. Brand clicks are cheap and convert well, and many of them would have found you anyway; report non-brand CPA separately and ask whether brand spend is defending against competitors or just buying your own traffic.');
  return { campaigns: rows, spend: spend, conversions: conv, cpa: conv ? spend / conv : null,
    brand: { spend: brandSpend, conversions: brandConv, cpa: brandConv ? brandSpend / brandConv : null, spendShare: spend ? brandSpend / spend : null },
    nonBrand: { spend: nbSpend, conversions: nbConv, cpa: nbConv ? nbSpend / nbConv : null },
    zeroConversionSpend: zeroSpend, zeroConversionShare: spend ? zeroSpend / spend : null, notes: notes };
}

function readSearchTerms(list, patterns) {
  list = Array.isArray(list) ? list : [];
  var res = (Array.isArray(patterns) ? patterns : []).map(function (p) { try { return new RegExp(p, 'i'); } catch (e) { return null; } }).filter(Boolean);
  var totalSpend = list.reduce(function (a, t) { return a + n0(t.spend); }, 0);
  var negate = [], add = [], irrelevant = [];
  list.forEach(function (t) {
    var term = String(t.term || ''), sp = n0(t.spend), cl = n0(t.clicks), cv = n0(t.conversions);
    var hit = res.some(function (re) { return re.test(term); });
    if (hit && t.negated !== true) irrelevant.push({ term: term, spend: sp, clicks: cl });
    else if (cv === 0 && cl >= MIN_CLICKS_TO_JUDGE && t.negated !== true) negate.push({ term: term, spend: sp, clicks: cl });
    if (cv >= WINNER_MIN_CONV && t.isKeyword !== true) add.push({ term: term, spend: sp, conversions: cv, cpa: sp / cv });
  });
  negate.sort(function (a, b) { return b.spend - a.spend; }); irrelevant.sort(function (a, b) { return b.spend - a.spend; }); add.sort(function (a, b) { return a.cpa - b.cpa; });
  var waste = negate.reduce(function (a, t) { return a + t.spend; }, 0) + irrelevant.reduce(function (a, t) { return a + t.spend; }, 0);
  return { terms: list.length, spend: totalSpend, negate: negate, irrelevant: irrelevant, addAsKeywords: add, waste: waste, wasteShare: totalSpend ? waste / totalSpend : null };
}

function readLandingPages(list) {
  list = Array.isArray(list) ? list : [];
  var rows = list.map(function (p, i) {
    var url = String(p.url || ('Page ' + (i + 1))), sp = n0(p.spend), cl = n0(p.clicks), cv = n0(p.conversions);
    return { url: url, spend: sp, clicks: cl, conversions: cv, cvr: cl ? cv / cl : null, messageMatch: p.messageMatch, mobileOk: p.mobileOk, findings: [] };
  });
  var med = median(rows.filter(function (r) { return r.clicks >= MIN_CLICKS_TO_JUDGE; }).map(function (r) { return r.cvr; }));
  rows.forEach(function (r) {
    if (r.clicks < MIN_CLICKS_TO_JUDGE) return;
    if (r.conversions === 0) r.findings.push({ level: 'fix', id: 'page-no-conversions', text: r.url + ': ' + r.spend.toLocaleString('en-US') + ' of clicks and no conversions. Check the form works and the page says what the ad promised.', spendAffected: r.spend });
    else if (med && r.cvr < med * LOW_PAGE_FACTOR) r.findings.push({ level: 'improve', id: 'page-low', text: r.url + ' converts at ' + (r.cvr * 100).toFixed(1) + '%, under half the account\'s median page (' + (med * 100).toFixed(1) + '%). Check message match and the first screen.', spendAffected: r.spend });
    if (r.messageMatch === false) r.findings.push({ level: 'fix', id: 'message-mismatch', text: r.url + ': the page does not repeat the ad\'s promise. Message mismatch is the most common reason a good keyword looks bad.', spendAffected: r.spend });
    if (r.mobileOk === false) r.findings.push({ level: 'improve', id: 'mobile', text: r.url + ' is not usable on a phone; check the share of clicks that are mobile before deciding how much this costs.', spendAffected: r.spend });
  });
  return { pages: rows, medianCvr: med };
}

function run(cfg) {
  cfg = cfg || {};
  if (!cfg.setup && !cfg.campaigns && !cfg.searchTerms && !cfg.landingPages) throw inputError('Give "setup", "campaigns", "searchTerms", "landingPages", or any combination.');
  var target = isNum(cfg.targetCpa) && cfg.targetCpa > 0 ? cfg.targetCpa : null;
  var setup = cfg.setup ? checkSetup(cfg.setup) : null;
  var camps = cfg.campaigns ? readCampaigns(cfg.campaigns, target) : null;
  var terms = cfg.searchTerms ? readSearchTerms(cfg.searchTerms, cfg.irrelevantPatterns) : null;
  var pages = cfg.landingPages ? readLandingPages(cfg.landingPages) : null;
  var fixes = [];
  if (setup) setup.items.filter(function (t) { return !t.ok; }).forEach(function (t) { fixes.push({ level: t.level, id: 'setup-' + t.id, text: (t.unknown ? 'Not checked: ' : 'Not in place: ') + t.label + '. ' + t.why, spendAffected: camps ? camps.spend : null, area: 'setup' }); });
  if (camps) { camps.campaigns.forEach(function (c) { c.findings.forEach(function (f) { fixes.push(Object.assign({ area: 'campaigns' }, f)); }); }); }
  if (terms) {
    if (terms.irrelevant.length) fixes.push({ level: 'fix', id: 'irrelevant-terms', area: 'search-terms', spendAffected: terms.irrelevant.reduce(function (a, t) { return a + t.spend; }, 0), text: terms.irrelevant.length + ' search terms match your irrelevant patterns and are not negated: ' + terms.irrelevant.slice(0, 5).map(function (t) { return '"' + t.term + '"'; }).join(', ') + (terms.irrelevant.length > 5 ? '...' : '') + '. Add them to a shared negative list.' });
    if (terms.negate.length) fixes.push({ level: 'fix', id: 'zero-conversion-terms', area: 'search-terms', spendAffected: terms.negate.reduce(function (a, t) { return a + t.spend; }, 0), text: terms.negate.length + ' search terms have ' + MIN_CLICKS_TO_JUDGE + '+ clicks and no conversions: ' + terms.negate.slice(0, 5).map(function (t) { return '"' + t.term + '" (' + Math.round(t.spend).toLocaleString('en-US') + ')'; }).join(', ') + (terms.negate.length > 5 ? '...' : '') + '. Negate, or move to exact match with a lower bid if the intent is right.' });
    if (terms.addAsKeywords.length) fixes.push({ level: 'improve', id: 'winners-not-keywords', area: 'search-terms', spendAffected: 0, text: terms.addAsKeywords.length + ' converting search terms are not keywords: ' + terms.addAsKeywords.slice(0, 5).map(function (t) { return '"' + t.term + '" (' + t.conversions + ' conv)'; }).join(', ') + '. Add them as exact-match keywords so you control the bid and the ad.' });
  }
  if (pages) pages.pages.forEach(function (p) { p.findings.forEach(function (f) { fixes.push(Object.assign({ area: 'landing-pages' }, f)); }); });
  var order = { fix: 0, improve: 1, info: 2 };
  fixes.sort(function (a, b) { return order[a.level] - order[b.level] || (b.spendAffected || 0) - (a.spendAffected || 0); });
  var verdict;
  if (setup && !setup.trackingVerified) verdict = { level: 'foundations', text: 'Conversion tracking is not verified, so every CPA and every search-term read below is unreliable. Verify tracking first; re-run the audit after a week of clean data.' };
  else if (camps && camps.zeroConversionShare !== null && camps.zeroConversionShare >= WASTE_SHARE_FLAG) verdict = { level: 'waste', text: Math.round(camps.zeroConversionShare * 100) + '% of spend is in campaigns with clicks and no conversions. Stop the waste before optimising anything.' };
  else if (terms && terms.wasteShare !== null && terms.wasteShare >= WASTE_SHARE_FLAG) verdict = { level: 'waste', text: Math.round(terms.wasteShare * 100) + '% of search-term spend went to terms that cannot or did not convert. Negatives first.' };
  else if (fixes.some(function (f) { return f.id === 'starved-winner'; })) verdict = { level: 'scale', text: 'The account is clean enough to read, and at least one campaign under target is losing impressions to budget. Move budget to it before adding anything new.' };
  else if (fixes.some(function (f) { return f.level === 'fix'; })) verdict = { level: 'fix', text: fixes.filter(function (f) { return f.level === 'fix'; }).length + ' blocking fixes, ranked by the spend they touch.' };
  else verdict = { level: 'healthy', text: 'No blocking findings. Work the improve list, then test the next keyword theme or landing page.' };
  return { targetCpa: target, setup: setup, campaigns: camps, searchTerms: terms, landingPages: pages, fixes: fixes, verdict: verdict,
    rules: { MIN_CLICKS_TO_JUDGE: MIN_CLICKS_TO_JUDGE, MIN_CONV_FOR_AUTO_BID: MIN_CONV_FOR_AUTO_BID, STARVED_LOST_BUDGET: STARVED_LOST_BUDGET, WASTE_SHARE_FLAG: WASTE_SHARE_FLAG, BRAND_SPEND_FLAG: BRAND_SPEND_FLAG, LOW_PAGE_FACTOR: LOW_PAGE_FACTOR, WINNER_MIN_CONV: WINNER_MIN_CONV, benchmark: 'none: every read is against your own target and your own account' } };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const money = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
const pct = (v, d) => v == null ? '-' : (v * 100).toFixed(d == null ? 0 : d) + '%';
function render(r) {
  const L = [];
  L.push(`PAID SEARCH AUDIT${r.targetCpa ? ' - target CPA ' + money(r.targetCpa) : ' - no target CPA given'}. Nothing here is a benchmark.`);
  if (r.setup) L.push(`  Setup: ${r.setup.items.length - r.setup.missing.length} of ${r.setup.items.length} in place${r.setup.trackingVerified ? '' : ' - CONVERSION TRACKING NOT VERIFIED'}`);
  if (r.campaigns) {
    const c = r.campaigns;
    L.push(`  Account: ${money(c.spend)} spend, ${c.conversions} conversions, CPA ${money(c.cpa)}; brand ${pct(c.brand.spendShare)} of spend at CPA ${money(c.brand.cpa)}, non-brand CPA ${money(c.nonBrand.cpa)}; ${pct(c.zeroConversionShare)} of spend in campaigns with no conversions`);
    c.campaigns.forEach((x) => L.push(`    ${x.name} [${x.type}${x.bidStrategy ? ', ' + x.bidStrategy : ''}]: ${money(x.spend)} spend, ${x.clicks} clicks, ${x.conversions} conv, CPA ${money(x.cpa)}, CTR ${pct(x.ctr, 1)}, CVR ${pct(x.cvr, 1)}${x.lostToBudget != null ? ', lost to budget ' + pct(x.lostToBudget) : ''}${x.lostToRank != null ? ', lost to rank ' + pct(x.lostToRank) : ''}`));
    c.notes.forEach((n) => L.push(`    - ${n}`));
  }
  if (r.searchTerms) L.push(`  Search terms: ${r.searchTerms.terms} rows, ${money(r.searchTerms.spend)} spend; waste ${money(r.searchTerms.waste)} (${pct(r.searchTerms.wasteShare)}): ${r.searchTerms.irrelevant.length} irrelevant, ${r.searchTerms.negate.length} zero-conversion; ${r.searchTerms.addAsKeywords.length} winners not yet keywords`);
  if (r.landingPages) L.push(`  Landing pages: ${r.landingPages.pages.length}, median conversion rate ${pct(r.landingPages.medianCvr, 1)}`);
  L.push('');
  L.push('FIXES - blocking first, then by spend affected');
  r.fixes.forEach((f, i) => L.push(`  ${i + 1}. ${f.level === 'fix' ? '!' : '-'} [${f.area}${f.spendAffected ? ', ' + money(f.spendAffected) : ''}] ${f.text}`));
  L.push('');
  L.push(`${r.verdict.level.toUpperCase()}: ${r.verdict.text}`);
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: an invented account for Fieldnote, an invented scheduling app. Numbers are not benchmarks.
const DEMO = {
  targetCpa: 250,
  setup: { conversionTrackingVerified: true, offlineConversionsImported: false, brandSeparated: true, searchPartnersReviewed: true, displayExpansionOff: true, geoPresenceOnly: false, sharedNegativeLists: false, autoApplyOff: true, assetsComplete: true },
  campaigns: [
    { name: 'Brand', type: 'brand', spend: 900, clicks: 1500, impressions: 5000, conversions: 60, bidStrategy: 'manual', lostToBudget: 0.02, lostToRank: 0.05 },
    { name: 'Scheduling software', type: 'non-brand', spend: 4200, clicks: 700, impressions: 21000, conversions: 21, bidStrategy: 'target-cpa', lostToBudget: 0.35, lostToRank: 0.2 },
    { name: 'Competitors', type: 'competitor', spend: 2600, clicks: 320, impressions: 16000, conversions: 4, bidStrategy: 'maximize-conversions', lostToBudget: 0.05, lostToRank: 0.5 },
    { name: 'Generic contractor', type: 'non-brand', spend: 1800, clicks: 900, impressions: 60000, conversions: 0, bidStrategy: 'maximize-clicks' },
  ],
  irrelevantPatterns: ['free', 'jobs?', 'salary', 'course', 'template'],
  searchTerms: [
    { term: 'field service scheduling software', spend: 1100, clicks: 180, conversions: 9, match: 'phrase', isKeyword: true },
    { term: 'plumbing dispatch app', spend: 420, clicks: 70, conversions: 4, match: 'broad', isKeyword: false },
    { term: 'free scheduling app', spend: 610, clicks: 150, conversions: 0, match: 'broad' },
    { term: 'contractor jobs near me', spend: 540, clicks: 210, conversions: 0, match: 'broad' },
    { term: 'scheduling software', spend: 900, clicks: 160, conversions: 1, match: 'broad', isKeyword: true },
    { term: 'crew scheduling excel template', spend: 330, clicks: 120, conversions: 0, match: 'broad' },
    { term: 'hvac dispatch software', spend: 280, clicks: 40, conversions: 3, match: 'broad', isKeyword: false },
    { term: 'servicetitan pricing', spend: 700, clicks: 90, conversions: 1, match: 'phrase', isKeyword: true },
  ],
  landingPages: [
    { url: '/', spend: 3100, clicks: 1400, conversions: 30, messageMatch: true, mobileOk: true },
    { url: '/field-service-scheduling', spend: 4200, clicks: 1300, conversions: 51, messageMatch: true, mobileOk: true },
    { url: '/compare', spend: 2200, clicks: 720, conversions: 4, messageMatch: false, mobileOk: true },
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
    console.log('(no config - demo: an invented four-campaign account over 30 days, with its search terms and landing pages)\n');
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

module.exports = { run, checkSetup, readCampaigns, readSearchTerms, readLandingPages, SETUP, MIN_CLICKS_TO_JUDGE, MIN_CONV_FOR_AUTO_BID, STARVED_LOST_BUDGET, WASTE_SHARE_FLAG, BRAND_SPEND_FLAG, LOW_PAGE_FACTOR, WINNER_MIN_CONV };
