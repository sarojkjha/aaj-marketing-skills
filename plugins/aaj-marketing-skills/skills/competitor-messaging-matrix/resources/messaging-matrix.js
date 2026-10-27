#!/usr/bin/env node
/*
 * AAJ Competitor Messaging Matrix - engine
 * Part of the "competitor-messaging-matrix" Agent Skill.
 *
 * AAJ's position: positioning is chosen against the alternatives a buyer
 * actually sees, so the first step is to read what every rival's homepage
 * claims, side by side, before writing a word of your own. This engine takes
 * the headline, subhead and opening copy from each competitor's page (and
 * yours), and reports: the claim types each one makes, the audience each one
 * names, the proof each one offers, the call to action, the words the whole
 * category has used up, the words only one competitor uses, and how much of
 * your own headline is distinct. It reports what the pages say; it does not
 * decide what you should say.
 *
 * USAGE
 *   node messaging-matrix.js                    # demo
 *   node messaging-matrix.js '<json-config>'    # your own
 *   node messaging-matrix.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "us": { "name": "Fieldnote", "headline": "...", "subhead": "...", "body": "...",   // optional
 *             "ctas": ["Start free"] },
 *     "competitors": [
 *       { "name": "Crewline", "url": "crewline.example", "checked": "2026-10-01",
 *         "headline": "The all-in-one platform for field service teams",
 *         "subhead": "...", "body": "first screen of copy, optional", "ctas": ["Book a demo"] }
 *     ],
 *     "today": "2026-10-11"                      // optional, for staleness
 *   }
 *
 * Rules of this engine (stated so you can argue with them): a word used in
 * the headline or subhead of at least half the competitors (and at least two)
 * is a category word; a word used by one competitor only is that competitor's
 * distinctive word; your headline is "distinct" when at least half of its
 * content words appear in no competitor's headline or subhead; a page copied
 * more than 90 days ago is stale (the same rule as AAJ's battlecard engine).
 * Claim types are matched by word lists you can read in the source.
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
var CATEGORY_SHARE = 0.5;    // a word in the headline/subhead of at least this share of rivals (min 2) is a category word (engine rule)
var DISTINCT_SHARE = 0.5;    // your headline is distinct when at least this share of its content words are used by no rival (engine rule)
var STALE_DAYS = 90;         // a competitor page copied longer ago than this is stale (engine rule)

var CLAIMS = [
  { id: 'outcome', label: 'Outcome', re: /\b(save|saves|saving|grow|grows|increase|boost|reduce|cut|cuts|win|close more|faster|quicker|more (?:revenue|leads|sales|pipeline|customers|bookings)|less (?:time|admin|work)|without the)\b/i },
  { id: 'superlative', label: 'Superlative or absolute', re: /\b(best|#1|number one|leading|the only|ultimate|all-in-one|world[- ]class|most (?:trusted|popular|powerful|advanced)|unmatched|complete|everything you need)\b/i },
  { id: 'number', label: 'Number as proof', re: /(\d[\d,.]*\s?(%|x\b|\+|percent|k\b|m\b)|\$\s?\d|\b\d[\d,.]*\s+[a-z]+(?:s|es)\b)/i },
  { id: 'social', label: 'Social proof', re: /\b(trusted by|loved by|used by|join \d|rated|stars|g2|capterra|reviews|customers worldwide|teams rely|backed by|as seen in)\b/i },
  { id: 'ease', label: 'Ease or speed of adoption', re: /\b(easy|simple|simply|effortless|intuitive|no code|set up in|get started in|in minutes|no training|out of the box)\b/i },
  { id: 'ai', label: 'AI', re: /\b(ai|ai-powered|artificial intelligence|automat(?:e|es|ed|ion)|copilot|assistant|smart)\b/i },
  { id: 'price', label: 'Price or free', re: /\b(free|free trial|no credit card|from \$|per month|affordable|pricing|pay as you go)\b/i },
  { id: 'security', label: 'Security or compliance', re: /\b(secure|security|soc ?2|hipaa|gdpr|compliant|compliance|enterprise-grade|encrypted)\b/i },
  { id: 'integration', label: 'Integrations', re: /\b(integrat(?:e|es|ed|ion|ions)|works with|connects? (?:to|with)|plugs into|api|sync)\b/i },
];
var CTA_TYPES = [
  { id: 'trial', re: /\b(start (?:your )?free|free trial|try (?:it )?free|try for free|sign up free|get started free)\b/i },
  { id: 'signup', re: /\b(sign up|get started|create (?:an )?account|start now|join)\b/i },
  { id: 'demo', re: /\b(book a demo|request a demo|get a demo|schedule a demo|see a demo|watch demo|demo)\b/i },
  { id: 'contact', re: /\b(contact (?:us|sales)|talk to (?:us|sales|an expert)|get in touch|request a quote|get a quote)\b/i },
  { id: 'learn', re: /\b(learn more|see how|explore|discover|read more|watch)\b/i },
];
var CATEGORY_NOUN = /\b((?:[a-z][a-z-]+\s){0,3}(?:platform|software|tool|tools|app|system|solution|suite|crm|os|workspace|hub|engine|assistant|service))\b/i;
var AUDIENCE = /\b(?:built for|made for|designed for|for)\s+((?:[a-z][a-z-]*\s?){1,5}?)(?=[.,;:!?]|\s(?:that|who|which|to|and|with|in|on|at|from|by|of|or)\b|$)/i;
var NOT_AUDIENCE = /^(free|you|your|yourself|everyone|everybody|all|good|now|life|the first time|me|us|them|it|this|that|a while|real|sure|growth|scale|success|results)$/i;
var STOP = ('a an the and or but of to in on for with at by from as is are was were be been it its this that these those i we you they your our their my me us them ' +
  'do does did have has had can could would should will get got one all any some more most much many than then there here when what which who how why if about into ' +
  'over out up down off only own same other such because while before after so too very just also not no yes every each per via ' +
  'platform software tool tools app system solution suite').split(' ');
var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = true; });

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function stem(w) { return w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; }
function words(s, drop) { return norm(s).toLowerCase().replace(/[^a-z' -]+/g, ' ').split(/[\s-]+/).map(stem).filter(function (w) { return w.length > 2 && !STOPSET[w] && w !== drop; }); }
function uniq(a) { var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = true; r.push(x); } }); return r; }
function parseDate(v) { var s = norm(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; var p = s.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2])); return d.getUTCMonth() === p[1] - 1 ? d : null; }

function readPage(pg, now) {
  var name = norm(pg.name);
  var headline = norm(pg.headline), subhead = norm(pg.subhead), body = norm(pg.body);
  var join = function (a, b) { return !a ? b : !b ? a : a + (/[.!?]$/.test(a) ? ' ' : '. ') + b; };
  var top = join(headline, subhead);
  var all = join(top, body);
  var ctas = Array.isArray(pg.ctas) ? pg.ctas.map(norm).filter(Boolean) : [];
  var claims = CLAIMS.filter(function (c) { return c.re.test(all); }).map(function (c) { return c.id; });
  var headlineClaims = CLAIMS.filter(function (c) { return c.re.test(top); }).map(function (c) { return c.id; });
  var catMatch = top.match(CATEGORY_NOUN) || all.match(CATEGORY_NOUN);
  var audMatch = [top, all].map(function (txt) { var m = txt.match(AUDIENCE); return m && !NOT_AUDIENCE.test(m[1].trim()) ? m : null; }).filter(Boolean)[0];
  var ctaTypes = uniq(ctas.map(function (c) { var t = CTA_TYPES.filter(function (x) { return x.re.test(c); })[0]; return t ? t.id : 'other'; }));
  var checked = parseDate(pg.checked), age = checked && now ? Math.round((now - checked) / 86400000) : null;
  return { name: name, url: norm(pg.url) || null, headline: headline, subhead: subhead, hasBody: !!body, ctas: ctas, ctaTypes: ctaTypes,
    claims: claims, headlineClaims: headlineClaims, category: catMatch ? catMatch[1].trim().replace(/^(?:the|a|an)\s+/i, '') : null, audience: audMatch ? audMatch[1].trim() : null,
    topWords: uniq(words(top, stem(name.toLowerCase().replace(/[^a-z]/g, '')))), checked: checked ? norm(pg.checked) : null, ageDays: age };
}

function analyse(cfg) {
  cfg = cfg || {};
  var comps = Array.isArray(cfg.competitors) ? cfg.competitors.filter(function (c) { return c && norm(c.name) && (norm(c.headline) || norm(c.body)); }) : [];
  if (comps.length < 2) throw inputError('"competitors" needs at least two entries, each with a "name" and a "headline" (or "body").');
  var today = cfg.today !== undefined ? parseDate(cfg.today) : null;
  if (cfg.today !== undefined && !today) throw inputError('"today" must be a real date as YYYY-MM-DD.');
  var now = today || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  var rivals = comps.map(function (c) { return readPage(c, now); });
  var us = cfg.us && (norm(cfg.us.headline) || norm(cfg.us.body)) ? readPage(cfg.us, null) : null;
  var N = rivals.length;

  // vocabulary
  var wordUsers = {};
  rivals.forEach(function (r) { r.topWords.forEach(function (w) { (wordUsers[w] = wordUsers[w] || []).push(r.name); }); });
  var minUsers = Math.max(2, Math.ceil(N * CATEGORY_SHARE));
  var categoryWords = Object.keys(wordUsers).filter(function (w) { return wordUsers[w].length >= minUsers; })
    .map(function (w) { return { word: w, usedBy: wordUsers[w] }; }).sort(function (a, b) { return b.usedBy.length - a.usedBy.length || a.word.localeCompare(b.word); });
  var distinctive = rivals.map(function (r) { return { name: r.name, words: r.topWords.filter(function (w) { return wordUsers[w].length === 1; }) }; });

  // claim matrix
  var claimRows = CLAIMS.map(function (c) {
    var who = rivals.filter(function (r) { return r.claims.indexOf(c.id) >= 0; }).map(function (r) { return r.name; });
    return { claim: c.id, label: c.label, rivals: who, share: who.length / N, us: us ? us.claims.indexOf(c.id) >= 0 : null };
  });
  var crowded = claimRows.filter(function (c) { return c.share >= CATEGORY_SHARE && c.rivals.length >= 2; }).map(function (c) { return c.claim; });
  var open = claimRows.filter(function (c) { return c.rivals.length === 0; }).map(function (c) { return c.claim; });
  var audiences = rivals.map(function (r) { return { name: r.name, audience: r.audience }; });
  var namedAudience = rivals.filter(function (r) { return r.audience; }).length;
  var audienceCounts = {};
  rivals.forEach(function (r) { if (r.audience) { var k = r.audience.toLowerCase(); audienceCounts[k] = (audienceCounts[k] || 0) + 1; } });
  var ctaCounts = {};
  rivals.forEach(function (r) { r.ctaTypes.forEach(function (t) { ctaCounts[t] = (ctaCounts[t] || 0) + 1; }); });

  // our read
  var ours = null;
  if (us) {
    var distinctWords = us.topWords.filter(function (w) { return !wordUsers[w]; });
    var sharedWords = us.topWords.filter(function (w) { return wordUsers[w]; });
    var ratio = us.topWords.length ? distinctWords.length / us.topWords.length : 0;
    var sharedCrowded = us.claims.filter(function (c) { return crowded.indexOf(c) >= 0; });
    var sameAudience = us.audience ? rivals.filter(function (r) { return r.audience && r.audience.toLowerCase() === us.audience.toLowerCase(); }).map(function (r) { return r.name; }) : [];
    var sameCategory = us.category ? rivals.filter(function (r) { return r.category && r.category.toLowerCase() === us.category.toLowerCase(); }).map(function (r) { return r.name; }) : [];
    ours = { name: us.name, headline: us.headline, claims: us.claims, category: us.category, audience: us.audience, ctaTypes: us.ctaTypes,
      distinctWords: distinctWords, sharedWords: sharedWords, distinctShare: ratio, distinct: ratio >= DISTINCT_SHARE && us.topWords.length > 0,
      crowdedClaims: sharedCrowded, sameAudience: sameAudience, sameCategory: sameCategory };
  }

  var findings = [];
  rivals.forEach(function (r) {
    if (!r.checked) findings.push({ level: 'improve', id: 'undated', text: r.name + ': no "checked" date. Record when you copied the page; messaging changes.' });
    else if (r.ageDays > STALE_DAYS) findings.push({ level: 'fix', id: 'stale', text: r.name + ': copied ' + r.ageDays + ' days ago. Re-read the page; this engine treats anything older than ' + STALE_DAYS + ' days as stale.' });
    if (!r.subhead && !r.hasBody) findings.push({ level: 'improve', id: 'thin', text: r.name + ': headline only. Add the subhead and first screen of copy for a fairer read.' });
  });
  if (!us) findings.push({ level: 'improve', id: 'no-us', text: 'No "us" page given, so there is no distinctiveness read. Add your own headline and subhead to see where you overlap.' });
  if (namedAudience === 0) findings.push({ level: 'improve', id: 'no-audience', text: 'No rival names an audience in its headline or subhead. Naming yours is open ground, if it is true.' });

  var verdict;
  if (!us) verdict = { level: 'landscape', text: N + ' rival pages read. ' + crowded.length + ' claim type' + (crowded.length === 1 ? '' : 's') + ' crowded (' + (crowded.join(', ') || 'none') + '), ' + open.length + ' open (' + (open.join(', ') || 'none') + ').' };
  else if (ours.distinct && !ours.crowdedClaims.length) verdict = { level: 'distinct', text: Math.round(ours.distinctShare * 100) + '% of your headline and subhead words appear in no rival page and none of your claims are crowded. Now check the claims have proof (claims-and-proof-check).' };
  else if (ours.distinct) verdict = { level: 'mostly-distinct', text: Math.round(ours.distinctShare * 100) + '% of your headline and subhead words are yours alone, but you share crowded claim' + (ours.crowdedClaims.length > 1 ? 's' : '') + ' (' + ours.crowdedClaims.join(', ') + ') with most rivals. Keep the words; replace the crowded claim with one only you can prove.' };
  else verdict = { level: 'blends-in', text: 'Only ' + Math.round(ours.distinctShare * 100) + '% of your headline and subhead words are yours alone (shared: ' + ours.sharedWords.slice(0, 6).join(', ') + ')' + (ours.crowdedClaims.length ? ', and you make the crowded claim' + (ours.crowdedClaims.length > 1 ? 's' : '') + ' ' + ours.crowdedClaims.join(', ') : '') + '. A buyer reading five tabs cannot tell you apart. Start from the open claims and your own proof.' };

  return { rivals: rivals.map(function (r) { return { name: r.name, url: r.url, headline: r.headline, subhead: r.subhead, category: r.category, audience: r.audience, claims: r.claims, headlineClaims: r.headlineClaims, ctas: r.ctas, ctaTypes: r.ctaTypes, distinctiveWords: distinctive.filter(function (d) { return d.name === r.name; })[0].words, checked: r.checked, ageDays: r.ageDays }; }),
    claimMatrix: claimRows, crowdedClaims: crowded, openClaims: open, categoryWords: categoryWords, audiences: audiences, audienceCounts: audienceCounts, ctaCounts: ctaCounts,
    us: ours, findings: findings, verdict: verdict, rules: { CATEGORY_SHARE: CATEGORY_SHARE, DISTINCT_SHARE: DISTINCT_SHARE, STALE_DAYS: STALE_DAYS } };
}

function run(cfg) { return analyse(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  var L = [];
  L.push('');
  L.push('AAJ - COMPETITOR MESSAGING MATRIX');
  L.push('-'.repeat(66));
  L.push('  ' + r.verdict.level.toUpperCase() + ': ' + r.verdict.text);
  L.push('');
  L.push('CLAIM MATRIX (' + r.rivals.length + ' rivals' + (r.us ? ' + you' : '') + ')');
  r.claimMatrix.forEach(function (c) {
    L.push('  ' + c.label.padEnd(28) + String(c.rivals.length) + '/' + r.rivals.length + (c.rivals.length ? '  ' + c.rivals.join(', ') : '') + (r.us ? (c.us ? '  | you: yes' : '  | you: no') : ''));
  });
  L.push('  Crowded: ' + (r.crowdedClaims.join(', ') || 'none') + '.  Open: ' + (r.openClaims.join(', ') || 'none') + '.');
  L.push('');
  L.push('PAGES');
  r.rivals.forEach(function (x) {
    L.push('  ' + x.name + (x.checked ? ' (checked ' + x.checked + ')' : '') + ': "' + x.headline + '"');
    L.push('      category: ' + (x.category || '-') + ' | audience: ' + (x.audience || 'none named') + ' | CTA: ' + (x.ctaTypes.join(', ') || '-') + ' | distinctive words: ' + (x.distinctiveWords.join(', ') || 'none'));
  });
  if (r.categoryWords.length) { L.push(''); L.push('CATEGORY WORDS (used by ' + Math.max(2, Math.ceil(r.rivals.length * r.rules.CATEGORY_SHARE)) + '+ rivals): ' + r.categoryWords.map(function (w) { return w.word + ' (' + w.usedBy.length + ')'; }).join(', ')); }
  if (r.us) {
    L.push('');
    L.push('YOU - ' + r.us.name + ': "' + r.us.headline + '"');
    L.push('  distinct words: ' + (r.us.distinctWords.join(', ') || 'none') + ' | shared with rivals: ' + (r.us.sharedWords.join(', ') || 'none') + ' (' + Math.round(r.us.distinctShare * 100) + '% distinct)');
    L.push('  claims: ' + (r.us.claims.join(', ') || 'none') + (r.us.crowdedClaims.length ? ' | crowded: ' + r.us.crowdedClaims.join(', ') : '') + ' | category: ' + (r.us.category || '-') + ' | audience: ' + (r.us.audience || 'none named') + ' | CTA: ' + (r.us.ctaTypes.join(', ') || '-'));
    if (r.us.sameAudience.length) L.push('  same named audience as: ' + r.us.sameAudience.join(', '));
    if (r.us.sameCategory.length) L.push('  same category label as: ' + r.us.sameCategory.join(', '));
  }
  if (r.findings.length) { L.push(''); L.push('CHECK'); r.findings.forEach(function (f) { L.push('  ' + (f.level === 'fix' ? '!' : '-') + ' ' + f.text); }); }
  L.push('');
  L.push('  Reads what the pages say, by word lists you can inspect. It does not judge whether a claim is true or wise; claims-and-proof-check does the first, you do the second.');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented products and copy.
var DEMO = {
  today: '2026-10-11',
  us: { name: 'Fieldnote', headline: 'The all-in-one platform for field service teams', subhead: 'Schedule crews, invoice faster and grow your business.', ctas: ['Start free'] },
  competitors: [
    { name: 'Crewline', url: 'crewline.example', checked: '2026-10-01', headline: 'The all-in-one field service platform', subhead: 'Trusted by 10,000+ teams to schedule, dispatch and invoice. Grow your business with Crewline.', ctas: ['Book a demo'] },
    { name: 'Dispatcha', url: 'dispatcha.example', checked: '2026-06-02', headline: 'Field service software that grows your business', subhead: 'AI-powered scheduling and invoicing for contractors. Rated 4.8 on G2.', ctas: ['Start free trial'] },
    { name: 'RouteOwl', url: 'routeowl.example', checked: '2026-10-05', headline: 'Never double-book a crew again', subhead: 'Built for two-truck contractors. Set up in an afternoon, no training.', ctas: ['Get started'] },
  ],
};

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
    console.log('(no config - demo: three invented rival pages and an invented headline that blends in)');
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

module.exports = { run, analyse, readPage, CLAIMS, CATEGORY_SHARE, DISTINCT_SHARE, STALE_DAYS };
