#!/usr/bin/env node
/*
 * AAJ Review Miner - engine
 * Part of the "review-mining" Agent Skill.
 *
 * AAJ's position: public reviews are the cheapest customer research a startup
 * has, and almost nobody codes them. This engine counts what reviewers of your
 * product and your competitors' products complain about and praise, pulls out
 * the sentences where someone switched products or asked for a feature, and
 * lists the words buyers use when they are happy. It counts reviews, never
 * occurrences, and reads sentiment from the star rating, never from the text.
 * Where it codes a review itself it uses a word list you can see and change,
 * and it tells you how much of the text that list reached.
 *
 * USAGE
 *   node review-miner.js                    # demo
 *   node review-miner.js '<json-config>'    # your own
 *   node review-miner.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "product": "Fieldnote",                    // your product, as named in the reviews
 *     "reviews": [
 *       { "product": "Fieldnote",                // or a competitor's name
 *         "rating": 2,                           // 1-5; optional, but needed for praise/complaint
 *         "text": "Switched from Jobber. Scheduling is great but support took three days.",
 *         "source": "G2",                        // optional
 *         "date": "2026-09-14",                  // optional, YYYY-MM-DD
 *         "themes": ["support", "scheduling"] }  // optional: your own coding, overrides the word list
 *     ],
 *     "lexicon": { "scheduling": ["schedule", "calendar", "booking"] }  // optional: add or replace themes
 *   }
 *
 * Rules of this engine (stated so you can argue with them): a rating of 4 or 5
 * is praise, 1 or 2 is a complaint, 3 is mixed; a review without a rating is a
 * mention only. A theme is counted once per review however often it appears.
 * Shares carry a 95% Wilson interval. Fewer than 10 reviews of a product is
 * too few to compare it with another. A theme where a competitor's complaint
 * share is at least 20% and yours is at least 10 points lower, with 10 or more
 * reviews each, is an opportunity to claim, with proof. The default word list
 * covers twelve themes common to software reviews; it is a starting point, not
 * a finding, and the engine reports how many reviews it failed to code.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var MIN_REVIEWS = 10;          // fewer reviews of a product than this: too few to compare (engine rule)
var OPP_RIVAL_SHARE = 0.20;    // a rival complaint share at or above this ... (engine rule)
var OPP_GAP = 0.10;            // ... and yours at least this far below it is an opportunity (engine rule)
var LEXICON_COVERAGE = 0.6;    // below this share of reviews coded by the word list, code by hand (engine rule)
var Z = 1.959964;

var DEFAULT_LEXICON = {
  'pricing': ['price', 'pricing', 'expensive', 'cost', 'cheap', 'afford', 'subscription', 'per seat', 'per user', 'overpriced', 'value for money'],
  'support': ['support', 'customer service', 'help desk', 'response time', 'ticket', 'nobody answered', 'live chat'],
  'ease of use': ['easy to use', 'intuitive', 'simple', 'user friendly', 'user-friendly', 'learning curve', 'confusing', 'clunky', 'hard to use', 'complicated'],
  'onboarding': ['onboarding', 'setup', 'set up', 'getting started', 'implementation', 'migration', 'import'],
  'reliability': ['bug', 'bugs', 'crash', 'crashes', 'glitch', 'broken', 'downtime', 'outage', 'unreliable', 'error'],
  'performance': ['slow', 'fast', 'speed', 'lag', 'loading', 'performance', 'responsive'],
  'integrations': ['integration', 'integrations', 'integrate', 'api', 'zapier', 'sync', 'connects to', 'plugin'],
  'missing features': ['missing', 'lacks', 'lack of', 'no way to', "doesn't have", 'does not have', 'wish', 'would be nice', 'feature request', 'limited'],
  'reporting': ['report', 'reports', 'reporting', 'dashboard', 'analytics', 'export'],
  'mobile': ['mobile', 'mobile app', 'iphone', 'android', 'ios', 'on the phone', 'on my phone', 'tablet'],
  'notifications': ['notification', 'notifications', 'reminder', 'reminders', 'alerts', 'email alerts'],
  'customisation': ['customize', 'customise', 'customization', 'customisation', 'configure', 'flexible', 'templates', 'workflow'],
};
var SWITCH = /\b(switched (?:to|from)|moved (?:to|from)|migrated (?:to|from)|replaced|left [A-Z][\w]* for|came (?:over )?from|used to use|after years (?:with|on)|ditched|instead of)\b/i;
var ASK = /\b(wish|would be nice|would love|would be great|missing|lacks?|doesn'?t have|does not have|no way to|needs? to add|should add|please add|if only|hoping for|feature request)\b/i;
var STOP = ('a an the and or but of to in on for with at by from as is are was were be been it its this that these those i we you they he she my our your their me us them ' +
  'very really just so too also not no yes do does did have has had can could would should will get got one two all any some more most much many ' +
  'than then there here when what which who how why if about into over out up down off only own same other such been being because while before after though').split(' ');
var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = true; });

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function wilson(k, n) {
  if (!n) return { low: null, high: null };
  var p = k / n, z2 = Z * Z, d = 1 + z2 / n, c = p + z2 / (2 * n), m = Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return { low: Math.max(0, (c - m) / d), high: Math.min(1, (c + m) / d) };
}
function sentences(text) { return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(Boolean); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildLexicon(extra) {
  var lex = {};
  Object.keys(DEFAULT_LEXICON).forEach(function (k) { lex[k] = DEFAULT_LEXICON[k].slice(); });
  if (extra && typeof extra === 'object') Object.keys(extra).forEach(function (k) {
    var v = Array.isArray(extra[k]) ? extra[k].map(norm).filter(Boolean) : null;
    if (v) lex[norm(k)] = v; else delete lex[norm(k)];
  });
  var compiled = {};
  Object.keys(lex).forEach(function (k) { if (lex[k].length) compiled[k] = new RegExp('\\b(' + lex[k].map(escapeRe).join('|') + ')\\b', 'i'); });
  return compiled;
}

function ngrams(text, n) {
  // phrases keep their inner words ("easy to use"); only the first and last word must carry meaning
  var out = [];
  sentences(text).forEach(function (sent) {
    var words = norm(sent).replace(/[^a-z0-9' ]+/g, ' ').split(' ').filter(Boolean);
    for (var i = 0; i + n <= words.length; i++) {
      var g = words.slice(i, i + n);
      if (STOPSET[g[0]] || STOPSET[g[n - 1]] || g[0].length < 3 || g[n - 1].length < 3) continue;
      out.push(g.join(' '));
    }
  });
  return out;
}

function mine(cfg) {
  cfg = cfg || {};
  var reviews = Array.isArray(cfg.reviews) ? cfg.reviews : [];
  if (!reviews.length) throw inputError('"reviews" needs at least one review with "text".');
  var own = norm(cfg.product);
  var lexicon = buildLexicon(cfg.lexicon);
  var themeNames = Object.keys(lexicon);
  var products = {};
  var switches = [], asks = [], uncoded = 0, lexiconCoded = 0, manualCoded = 0, unrated = 0, sources = {};
  var phraseVotes = { praise: {}, rivalComplaint: {} };

  reviews.forEach(function (r, idx) {
    var text = String(r && r.text || '').trim();
    if (!text) return;
    var p = norm(r.product) || own || 'product';
    if (!products[p]) products[p] = { product: p, n: 0, praise: 0, complaint: 0, mixed: 0, unrated: 0, themes: {} };
    var P = products[p];
    P.n++;
    var rating = isNum(r.rating) ? Math.round(r.rating) : null;
    var tone = rating === null ? 'unrated' : rating >= 4 ? 'praise' : rating <= 2 ? 'complaint' : 'mixed';
    P[tone]++;
    if (tone === 'unrated') unrated++;
    if (r.source) sources[norm(r.source)] = (sources[norm(r.source)] || 0) + 1;
    var themes;
    if (Array.isArray(r.themes) && r.themes.length) { themes = r.themes.map(norm).filter(Boolean); manualCoded++; }
    else {
      themes = themeNames.filter(function (t) { return lexicon[t].test(text); });
      if (themes.length) lexiconCoded++; else uncoded++;
    }
    var seen = {};
    themes.forEach(function (t) {
      if (seen[t]) return; seen[t] = true;
      if (!P.themes[t]) P.themes[t] = { theme: t, mentions: 0, praise: 0, complaint: 0, mixed: 0, quotes: [] };
      var T = P.themes[t];
      T.mentions++; if (tone !== 'unrated') T[tone]++;
      if (T.quotes.length < 2 && tone === 'complaint') T.quotes.push(text.length > 160 ? text.slice(0, 157) + '...' : text);
    });
    sentences(text).forEach(function (s) {
      if (SWITCH.test(s)) switches.push({ product: p, tone: tone, text: s });
      if (ASK.test(s)) {
        var hit = themeNames.filter(function (t) { return lexicon[t].test(s); })[0] || null;
        asks.push({ product: p, theme: hit, text: s });
      }
    });
    if (tone === 'praise' && p === own) ngrams(text, 2).concat(ngrams(text, 3)).forEach(function (g) { (phraseVotes.praise[g] = phraseVotes.praise[g] || {})[idx] = true; });
    if (tone === 'complaint' && p !== own) ngrams(text, 2).concat(ngrams(text, 3)).forEach(function (g) { (phraseVotes.rivalComplaint[g] = phraseVotes.rivalComplaint[g] || {})[idx] = true; });
  });

  function topPhrases(votes) {
    return Object.keys(votes).map(function (g) { return { phrase: g, reviews: Object.keys(votes[g]).length }; })
      .filter(function (x) { return x.reviews >= 2; })
      .sort(function (a, b) { return b.reviews - a.reviews || a.phrase.localeCompare(b.phrase); }).slice(0, 12);
  }

  var table = Object.keys(products).map(function (k) {
    var P = products[k];
    var rated = P.n - P.unrated;
    var rows = Object.keys(P.themes).map(function (t) {
      var T = P.themes[t];
      var w = wilson(T.mentions, P.n), wc = wilson(T.complaint, rated);
      return { theme: t, mentions: T.mentions, share: T.mentions / P.n, shareLow: w.low, shareHigh: w.high,
        praise: T.praise, complaint: T.complaint, mixed: T.mixed,
        complaintShare: rated ? T.complaint / rated : null, complaintLow: wc.low, complaintHigh: wc.high, quotes: T.quotes };
    }).sort(function (a, b) { return b.mentions - a.mentions || a.theme.localeCompare(b.theme); });
    return { product: k, isOwn: k === own, reviews: P.n, praise: P.praise, complaint: P.complaint, mixed: P.mixed, unrated: P.unrated,
      praiseShare: rated ? P.praise / rated : null, themes: rows };
  }).sort(function (a, b) { return (b.isOwn ? 1 : 0) - (a.isOwn ? 1 : 0) || b.reviews - a.reviews; });

  var ownRow = table.filter(function (p) { return p.isOwn; })[0] || null;
  var rivals = table.filter(function (p) { return !p.isOwn; });
  var opportunities = [], fixFirst = null;
  if (ownRow && ownRow.reviews >= MIN_REVIEWS) {
    var ownBy = {}; ownRow.themes.forEach(function (t) { ownBy[t.theme] = t; });
    rivals.forEach(function (rv) {
      if (rv.reviews < MIN_REVIEWS) return;
      rv.themes.forEach(function (t) {
        if (t.complaintShare === null || t.complaintShare < OPP_RIVAL_SHARE) return;
        var mine = ownBy[t.theme] ? (ownBy[t.theme].complaintShare || 0) : 0;
        if (t.complaintShare - mine >= OPP_GAP) opportunities.push({ theme: t.theme, rival: rv.product, rivalComplaintShare: t.complaintShare, ownComplaintShare: mine, quote: t.quotes[0] || null });
      });
    });
    opportunities.sort(function (a, b) { return (b.rivalComplaintShare - b.ownComplaintShare) - (a.rivalComplaintShare - a.ownComplaintShare); });
    var worst = ownRow.themes.filter(function (t) { return t.complaint >= 2; }).sort(function (a, b) { return b.complaint - a.complaint || b.complaintShare - a.complaintShare; })[0];
    if (worst) fixFirst = { theme: worst.theme, complaints: worst.complaint, complaintShare: worst.complaintShare, quote: worst.quotes[0] || null };
  }

  var coded = lexiconCoded + manualCoded, total = coded + uncoded;
  var findings = [];
  if (!own) findings.push({ level: 'improve', id: 'no-product', text: 'No "product" named, so every review is treated as the same product and there is no own-versus-rival read.' });
  if (unrated) findings.push({ level: 'improve', id: 'unrated', text: unrated + ' review' + (unrated > 1 ? 's have' : ' has') + ' no star rating. They count as mentions only; the engine never infers praise or complaint from the words.' });
  if (lexiconCoded && total && coded / total < LEXICON_COVERAGE) findings.push({ level: 'fix', id: 'low-coverage', text: 'The word list coded ' + lexiconCoded + ' of ' + total + ' reviews and ' + uncoded + ' matched no theme. Below ' + Math.round(LEXICON_COVERAGE * 100) + '% coverage, code the reviews by hand ("themes" on each review) or extend "lexicon".' });
  else if (uncoded) findings.push({ level: 'improve', id: 'uncoded', text: uncoded + ' review' + (uncoded > 1 ? 's' : '') + ' matched no theme in the word list. Read them; they may hold a theme the list does not know.' });
  if (lexiconCoded) findings.push({ level: 'improve', id: 'lexicon', text: lexiconCoded + ' review' + (lexiconCoded > 1 ? 's were' : ' was') + ' coded by the word list, not by a person. Spot-check ten before quoting a share.' });
  table.forEach(function (p) { if (p.reviews < MIN_REVIEWS) findings.push({ level: 'improve', id: 'too-few', text: p.product + ': ' + p.reviews + ' review' + (p.reviews === 1 ? '' : 's') + '. Below ' + MIN_REVIEWS + ' the shares are too wide to compare with another product.' }); });
  if (Object.keys(sources).length === 1) findings.push({ level: 'improve', id: 'one-source', text: 'All reviews come from one source (' + Object.keys(sources)[0] + '). Review sites differ in who writes; add a second source before generalising.' });

  var verdict;
  if (!ownRow) verdict = { level: 'rivals-only', text: 'No reviews of your own product in the set. The rival themes and switching sentences still stand; add your own reviews for the opportunity read.' };
  else if (ownRow.reviews < MIN_REVIEWS) verdict = { level: 'too-few', text: ownRow.reviews + ' review' + (ownRow.reviews === 1 ? '' : 's') + ' of ' + ownRow.product + '. Collect ' + (MIN_REVIEWS - ownRow.reviews) + ' more before reading shares; the switching sentences and feature asks are usable now.' };
  else if (fixFirst && opportunities.length) verdict = { level: 'act', text: 'Fix "' + fixFirst.theme + '" first (' + fixFirst.complaints + ' complaints). Claim "' + opportunities[0].theme + '" against ' + opportunities[0].rival + ', with proof, in your comparison and sales copy.' };
  else if (fixFirst) verdict = { level: 'fix', text: 'Fix "' + fixFirst.theme + '" first (' + fixFirst.complaints + ' complaints). No rival theme clears the opportunity rule yet.' };
  else if (opportunities.length) verdict = { level: 'claim', text: 'No theme draws two or more complaints about ' + ownRow.product + '. Claim "' + opportunities[0].theme + '" against ' + opportunities[0].rival + ', with proof.' };
  else verdict = { level: 'quiet', text: 'No complaint theme reaches two reviews and no rival theme clears the opportunity rule. Read the uncoded reviews and the feature asks.' };

  return { product: own || null, reviews: total, coded: { byHand: manualCoded, byLexicon: lexiconCoded, uncoded: uncoded, coverage: total ? coded / total : null }, sources: sources,
    products: table, switching: switches.slice(0, 40), featureAsks: asks.slice(0, 40),
    language: { praise: topPhrases(phraseVotes.praise), rivalComplaints: topPhrases(phraseVotes.rivalComplaint) },
    opportunities: opportunities.slice(0, 10), fixFirst: fixFirst, findings: findings, verdict: verdict,
    rules: { MIN_REVIEWS: MIN_REVIEWS, OPP_RIVAL_SHARE: OPP_RIVAL_SHARE, OPP_GAP: OPP_GAP, LEXICON_COVERAGE: LEXICON_COVERAGE } };
}

function run(cfg) { return mine(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
var pct = function (v) { return v == null ? '-' : Math.round(v * 100) + '%'; };
function render(r) {
  var L = [];
  L.push('');
  L.push('AAJ - REVIEW MINER' + (r.product ? ': ' + r.product : ''));
  L.push('-'.repeat(66));
  L.push('  ' + r.reviews + ' reviews; coded by hand ' + r.coded.byHand + ', by word list ' + r.coded.byLexicon + ', uncoded ' + r.coded.uncoded + ' (coverage ' + pct(r.coded.coverage) + ')');
  L.push('  ' + r.verdict.level.toUpperCase() + ': ' + r.verdict.text);
  r.products.forEach(function (p) {
    L.push('');
    L.push((p.isOwn ? 'YOU - ' : 'RIVAL - ') + p.product + ': ' + p.reviews + ' reviews, ' + p.praise + ' praise / ' + p.mixed + ' mixed / ' + p.complaint + ' complaint' + (p.unrated ? ' / ' + p.unrated + ' unrated' : ''));
    p.themes.slice(0, 8).forEach(function (t) {
      L.push('  ' + t.theme.padEnd(18) + t.mentions + ' of ' + p.reviews + ' (' + pct(t.share) + ', ' + pct(t.shareLow) + '-' + pct(t.shareHigh) + ')  praise ' + t.praise + ' / complaint ' + t.complaint + (t.complaintShare != null ? ' (' + pct(t.complaintShare) + ' of rated)' : ''));
      if (t.quotes[0]) L.push('      "' + t.quotes[0] + '"');
    });
  });
  if (r.opportunities.length) { L.push(''); L.push('OPPORTUNITIES (rival complained about, you not)'); r.opportunities.forEach(function (o) { L.push('  ' + o.theme + ' vs ' + o.rival + ': their complaint share ' + pct(o.rivalComplaintShare) + ', yours ' + pct(o.ownComplaintShare)); }); }
  if (r.fixFirst) { L.push(''); L.push('FIX FIRST: ' + r.fixFirst.theme + ' - ' + r.fixFirst.complaints + ' complaints (' + pct(r.fixFirst.complaintShare) + ' of rated reviews)'); }
  if (r.switching.length) { L.push(''); L.push('SWITCHING SENTENCES'); r.switching.slice(0, 8).forEach(function (s) { L.push('  [' + s.product + ', ' + s.tone + '] ' + s.text); }); }
  if (r.featureAsks.length) { L.push(''); L.push('FEATURE ASKS'); r.featureAsks.slice(0, 8).forEach(function (s) { L.push('  [' + s.product + (s.theme ? ', ' + s.theme : '') + '] ' + s.text); }); }
  if (r.language.praise.length) { L.push(''); L.push('WORDS YOUR HAPPY REVIEWERS USE: ' + r.language.praise.map(function (x) { return '"' + x.phrase + '" (' + x.reviews + ')'; }).join(', ')); }
  if (r.language.rivalComplaints.length) L.push('WORDS RIVAL COMPLAINTS USE: ' + r.language.rivalComplaints.map(function (x) { return '"' + x.phrase + '" (' + x.reviews + ')'; }).join(', '));
  if (r.findings.length) { L.push(''); L.push('CHECK'); r.findings.forEach(function (f) { L.push('  ' + (f.level === 'fix' ? '!' : '-') + ' ' + f.text); }); }
  L.push('');
  L.push('  Counts of the reviews you pasted. Sentiment comes from star ratings only; themes coded by the word list are a starting point, not a finding.');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented reviews of Fieldnote and Crewline, two invented scheduling apps.
function rv(product, rating, text, source) { return { product: product, rating: rating, text: text, source: source || 'G2' }; }
var DEMO = {
  product: 'Fieldnote',
  reviews: [
    rv('Fieldnote', 5, 'Easy to use and the crew finally knows where they are going each morning. Setup took an afternoon.'),
    rv('Fieldnote', 5, 'Switched from Crewline after two double bookings. The calendar is simple and the reminders work.'),
    rv('Fieldnote', 4, 'Scheduling is great. I wish the reports could be exported to Excel.'),
    rv('Fieldnote', 2, 'Support took three days to answer a billing question. The app itself is fine.'),
    rv('Fieldnote', 4, 'Simple, fast, easy to use. The mobile app lacks offline mode though.'),
    rv('Fieldnote', 5, 'Easy to use. Our office manager set it up without calling anyone.', 'Capterra'),
    rv('Fieldnote', 3, 'Does the job. Pricing per user adds up once you have six crews.', 'Capterra'),
    rv('Fieldnote', 5, 'Came over from Crewline. Reminders cut our no-shows and the crew likes the mobile app.'),
    rv('Fieldnote', 4, 'Good calendar. Would love a QuickBooks integration.'),
    rv('Fieldnote', 1, 'Support never answered my ticket. Cancelled.'),
    rv('Fieldnote', 5, 'Easy to use, the crew picked it up in a day.'),
    rv('Fieldnote', 4, 'Fast and simple. Needs to add a customer portal.'),
    rv('Crewline', 2, 'Powerful but confusing. Took us a month of onboarding calls to set up.'),
    rv('Crewline', 1, 'Crashes on the mobile app every week. Support blames our phones.'),
    rv('Crewline', 3, 'Lots of features, steep learning curve. Reporting is good.'),
    rv('Crewline', 2, 'Expensive once you add the dispatch module. Setup needs a consultant.'),
    rv('Crewline', 4, 'Great reporting and integrations. Clunky on the phone.'),
    rv('Crewline', 1, 'Buggy. Jobs disappeared from the calendar twice. We moved to Fieldnote.'),
    rv('Crewline', 2, 'Hard to use for the crew. The office likes the dashboard.'),
    rv('Crewline', 5, 'Best reporting in the category. Integrations with everything we use.'),
    rv('Crewline', 2, 'Onboarding took forever and the implementation fee was a surprise.'),
    rv('Crewline', 3, 'Solid once configured. Confusing at first.'),
    rv('Crewline', 1, 'Bugs every release. Support is slow.'),
    rv('Crewline', 4, 'Good integrations, pricey.'),
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
    console.log('(no config - demo: 24 invented reviews of two invented scheduling apps, coded by the default word list)');
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

module.exports = { run, mine, wilson, DEFAULT_LEXICON, MIN_REVIEWS, OPP_RIVAL_SHARE, OPP_GAP, LEXICON_COVERAGE };
