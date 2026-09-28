#!/usr/bin/env node
/*
 * AAJ Brand Voice Definition — engine
 * Part of the "brand-voice-definition" Agent Skill.
 *
 * AAJ's position: a voice guide is derived from writing the team already
 * agrees sounds right, not invented from adjectives. The engine measures a
 * set of on-brand samples (reading grade, sentence length, person,
 * contractions, hedges, buzzwords, exclamation marks), checks whether they
 * agree with each other, contrasts them with off-brand samples if given,
 * and writes the measurable half of the guide: a profile the
 * brand-voice-governance engine can check new content against.
 * The thresholds are AAJ's own rules and are labelled as such.
 *
 * USAGE
 *   node voice-derive.js                    # demo
 *   node voice-derive.js '<json-config>'    # your own
 *   node voice-derive.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "brand": "Fieldnote",
 *     "samples": [
 *       { "label": "Homepage hero", "text": "...", "onBrand": true },     // at least 3 on-brand samples of 100+ words
 *       { "label": "Old press release", "text": "...", "onBrand": false } // optional: writing you do NOT want to sound like
 *     ],
 *     "avoidCandidates": ["synergy", "leverage"]                           // optional: words you already know you avoid
 *   }
 *
 * OUTPUT includes "profile": { avoid, prefer, maxGrade } - pass it as "profile"
 * to brand-voice-governance's voice-check.js check mode.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var MIN_SAMPLES = 3;          // on-brand samples needed before a profile is derived (engine rule)
var MIN_WORDS = 100;          // words per sample for its measurements to count (engine rule)
var GRADE_SPREAD_MAX = 3;     // on-brand samples more than this many grades apart do not share a voice yet (engine rule)
var SENTENCE_SPREAD_MAX = 8;  // ... or more than this many words apart in average sentence length (engine rule)
var GRADE_HEADROOM = 1;       // the ceiling is the on-brand median grade plus this (engine rule)
var LONGEST_FACTOR = 2;       // keep the longest sentence under this multiple of the average (engine rule)
var HOUSE_BUZZWORDS = ['synergy', 'leverage', 'robust', 'seamless', 'cutting-edge', 'best-in-class', 'world-class', 'revolutionary', 'game-changing', 'unleash', 'supercharge'];
var HEDGES = ['very', 'really', 'quite', 'basically', 'actually', 'just', 'somewhat', 'fairly', 'rather', 'kind of', 'sort of', 'a bit', 'arguably', 'perhaps', 'maybe'];

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function sentences(text) { return String(text).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || []; }
function words(text) { return (String(text).toLowerCase().match(/[a-z0-9']+/g) || []); }
function syllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  var m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}
function gradeLevel(text) {
  var s = sentences(text), w = words(text);
  if (!s.length || !w.length) return 0;
  var syl = w.reduce(function (a, x) { return a + syllables(x); }, 0);
  return 0.39 * (w.length / s.length) + 11.8 * (syl / w.length) - 15.59;
}
function countPhrase(text, phrase) {
  var re = new RegExp('(^|[^a-z0-9])' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '(?=$|[^a-z0-9])', 'gi');
  var n = 0; while (re.exec(text)) n++; return n;
}
function median(arr) {
  var a = arr.filter(isNum).slice().sort(function (x, y) { return x - y; });
  if (!a.length) return null;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

function measure(text, extraBuzz) {
  var s = sentences(text), w = words(text), n = w.length, per100 = n ? 100 / n : 0;
  var lens = s.map(function (x) { return words(x).length; }).filter(function (x) { return x > 0; });
  var contractions = w.filter(function (x) { return /(n't|'re|'ve|'ll|'d|'m)$/.test(x) || x === "let's"; }).length;
  var you = w.filter(function (x) { return /^(you|your|yours|you're|you'll|you've|you'd)$/.test(x); }).length;
  var we = w.filter(function (x) { return /^(we|our|ours|us|we're|we'll|we've|we'd)$/.test(x); }).length;
  var i = w.filter(function (x) { return /^(i|my|mine|me|i'm|i'll|i've|i'd)$/.test(x); }).length;
  var excl = s.filter(function (x) { return /!\s*$/.test(x); }).length;
  var ques = s.filter(function (x) { return /\?\s*$/.test(x); }).length;
  var hedges = HEDGES.reduce(function (a, h) { return a + countPhrase(text, h); }, 0);
  var buzzList = HOUSE_BUZZWORDS.concat(extraBuzz || []);
  var buzzHits = {};
  buzzList.forEach(function (b) { var c = countPhrase(text, b); if (c) buzzHits[b] = c; });
  var buzz = Object.keys(buzzHits).reduce(function (a, k) { return a + buzzHits[k]; }, 0);
  var adverbs = w.filter(function (x) { return /[a-z]{3,}ly$/.test(x) && !/^(only|family|early|reply|supply|apply|likely|daily|weekly|monthly)$/.test(x); }).length;
  var passive = s.filter(function (x) { return /\b(is|are|was|were|be|been|being)\s+(\w+ed|\w+en)\b/i.test(x); }).length;
  return { words: n, sentences: s.length, avgSentence: lens.length ? n / lens.length : 0, longestSentence: lens.length ? Math.max.apply(null, lens) : 0,
    grade: gradeLevel(text), contractionsPer100: contractions * per100, youPer100: you * per100, wePer100: we * per100, iPer100: i * per100,
    exclamationShare: s.length ? excl / s.length : 0, questionShare: s.length ? ques / s.length : 0,
    hedgesPer100: hedges * per100, buzzwordsPer100: buzz * per100, buzzwordHits: buzzHits, adverbsPer100: adverbs * per100,
    passiveShare: s.length ? passive / s.length : 0 };
}

function derive(cfg) {
  cfg = cfg || {};
  var samples = Array.isArray(cfg.samples) ? cfg.samples : [];
  if (!samples.length) throw inputError('"samples" needs at least one sample with "text".');
  var candidates = Array.isArray(cfg.avoidCandidates) ? cfg.avoidCandidates.map(function (s) { return String(s).toLowerCase().trim(); }).filter(Boolean) : [];
  var rows = samples.map(function (s, i) {
    var text = String(s.text || '');
    var m = measure(text, candidates);
    return { label: String(s.label || ('Sample ' + (i + 1))), onBrand: s.onBrand !== false, thin: m.words < MIN_WORDS, metrics: m };
  });
  var on = rows.filter(function (r) { return r.onBrand && !r.thin; });
  var off = rows.filter(function (r) { return !r.onBrand && !r.thin; });
  var findings = [];
  rows.filter(function (r) { return r.thin; }).forEach(function (r) { findings.push({ level: 'info', id: 'thin', text: '"' + r.label + '" has ' + r.metrics.words + ' words; under ' + MIN_WORDS + ' it is left out of the measurements.' }); });
  if (on.length < MIN_SAMPLES) {
    return { samples: rows, onBrandCount: on.length, verdict: { level: 'too-thin', text: on.length + ' usable on-brand sample' + (on.length === 1 ? '' : 's') + '. This engine needs ' + MIN_SAMPLES + ' of ' + MIN_WORDS + '+ words before it derives a profile; pick pieces the team agrees sound right.' }, findings: findings, profile: null, rules: [] };
  }
  var pick = function (list, k) { return list.map(function (r) { return r.metrics[k]; }); };
  var med = {};
  ['grade', 'avgSentence', 'longestSentence', 'contractionsPer100', 'youPer100', 'wePer100', 'iPer100', 'exclamationShare', 'questionShare', 'hedgesPer100', 'buzzwordsPer100', 'adverbsPer100', 'passiveShare'].forEach(function (k) { med[k] = median(pick(on, k)); });
  var offMed = null;
  if (off.length) { offMed = {}; Object.keys(med).forEach(function (k) { offMed[k] = median(pick(off, k)); }); }
  var grades = pick(on, 'grade'), sents = pick(on, 'avgSentence');
  var gradeSpread = Math.max.apply(null, grades) - Math.min.apply(null, grades);
  var sentSpread = Math.max.apply(null, sents) - Math.min.apply(null, sents);
  var consistent = gradeSpread <= GRADE_SPREAD_MAX && sentSpread <= SENTENCE_SPREAD_MAX;
  if (gradeSpread > GRADE_SPREAD_MAX) findings.push({ level: 'fix', id: 'grade-spread', text: 'On-brand samples range ' + gradeSpread.toFixed(1) + ' grades apart (' + Math.min.apply(null, grades).toFixed(1) + ' to ' + Math.max.apply(null, grades).toFixed(1) + '). Over ' + GRADE_SPREAD_MAX + ' they do not share a reading level yet; decide which end is the voice and drop the other samples.' });
  if (sentSpread > SENTENCE_SPREAD_MAX) findings.push({ level: 'fix', id: 'sentence-spread', text: 'Average sentence length ranges ' + sentSpread.toFixed(1) + ' words across the on-brand samples. Over ' + SENTENCE_SPREAD_MAX + ' the rhythm is not one voice.' });
  // Buzzwords: used on-brand is a decision to make; used only off-brand or on the candidate list goes to avoid.
  var onBuzz = {}; on.forEach(function (r) { Object.keys(r.metrics.buzzwordHits).forEach(function (k) { onBuzz[k] = (onBuzz[k] || 0) + r.metrics.buzzwordHits[k]; }); });
  var offBuzz = {}; off.forEach(function (r) { Object.keys(r.metrics.buzzwordHits).forEach(function (k) { offBuzz[k] = (offBuzz[k] || 0) + r.metrics.buzzwordHits[k]; }); });
  var avoid = [];
  HOUSE_BUZZWORDS.concat(candidates).forEach(function (b) { if (!onBuzz[b] && avoid.indexOf(b) === -1) avoid.push(b); });
  Object.keys(offBuzz).forEach(function (b) { if (!onBuzz[b] && avoid.indexOf(b) === -1) avoid.push(b); });
  var usedOnBrand = Object.keys(onBuzz);
  if (usedOnBrand.length) findings.push({ level: 'improve', id: 'buzz-on-brand', text: 'The on-brand samples use ' + usedOnBrand.map(function (k) { return '"' + k + '" (' + onBuzz[k] + ')'; }).join(', ') + '. Decide whether each is the brand\'s word or a tic; the profile leaves them off the avoid list until you do.' });
  // Person
  var person = med.youPer100 >= med.wePer100 && med.youPer100 >= med.iPer100 && med.youPer100 >= 0.5 ? 'you'
    : med.iPer100 > med.wePer100 && med.iPer100 >= 0.5 ? 'I' : med.wePer100 >= 0.5 ? 'we' : 'none';
  var prefer = [];
  if (person === 'you') prefer.push('you');
  if (med.contractionsPer100 >= 0.5) prefer.push('contractions');
  var maxGrade = Math.ceil(med.grade) + GRADE_HEADROOM;
  var rules = [];
  rules.push('Reading level: write at grade ' + maxGrade + ' or below (on-brand median ' + med.grade.toFixed(1) + '; ceiling is the median plus ' + GRADE_HEADROOM + ', an engine rule).');
  rules.push('Sentences: average about ' + Math.round(med.avgSentence) + ' words; keep the longest under ' + Math.round(med.avgSentence * LONGEST_FACTOR) + ' (' + LONGEST_FACTOR + 'x the average, an engine rule).');
  rules.push(person === 'you' ? 'Address the reader as "you" (' + med.youPer100.toFixed(1) + ' per 100 words on-brand).'
    : person === 'I' ? 'First person singular: the writer speaks as "I" (' + med.iPer100.toFixed(1) + ' per 100 words).'
    : person === 'we' ? 'First person plural: the company speaks as "we" (' + med.wePer100.toFixed(1) + ' per 100 words).'
    : 'Person: the on-brand samples rarely address anyone directly; decide whether that is the voice or an accident.');
  rules.push(med.contractionsPer100 >= 0.5 ? 'Contractions: use them (' + med.contractionsPer100.toFixed(1) + ' per 100 words on-brand).' : 'Contractions: the on-brand samples avoid them (' + med.contractionsPer100.toFixed(1) + ' per 100 words).');
  rules.push(med.exclamationShare < 0.02 ? 'Exclamation marks: none.' : 'Exclamation marks: ' + Math.round(med.exclamationShare * 100) + '% of sentences on-brand; decide whether that is deliberate.');
  rules.push('Hedges (very, really, just, perhaps...): on-brand runs at ' + med.hedgesPer100.toFixed(1) + ' per 100 words; keep new copy at or below that.');
  if (med.passiveShare > 0.15) rules.push('Passive voice: ' + Math.round(med.passiveShare * 100) + '% of on-brand sentences; if that is not deliberate, it is the first thing to tighten.');
  if (avoid.length) rules.push('Words to avoid: ' + avoid.join(', ') + '.');
  var contrast = null;
  if (offMed) {
    contrast = Object.keys(med).filter(function (k) { return k !== 'longestSentence'; }).map(function (k) { return { metric: k, onBrand: med[k], offBrand: offMed[k] }; });
    var diffs = contrast.filter(function (c) { return Math.abs(c.onBrand - c.offBrand) > Math.max(1, Math.abs(c.onBrand) * 0.5); }).map(function (c) { return c.metric; });
    if (diffs.length) findings.push({ level: 'info', id: 'contrast', text: 'Where off-brand writing differs most: ' + diffs.join(', ') + '. Those are the rules worth writing down first.' });
    else findings.push({ level: 'improve', id: 'no-contrast', text: 'The off-brand samples measure much like the on-brand ones. What makes them off-brand is not in these metrics: write that down as a do/don\'t in words.' });
  }
  var verdict = consistent ? { level: 'profile-ready', text: 'The on-brand samples agree. The profile is checkable; pass it to brand-voice-governance and write the do/don\'t list beside it.' }
    : { level: 'not-one-voice', text: 'The on-brand samples do not agree with each other yet. Fix the spread findings first; a profile derived from two voices checks neither.' };
  return { brand: String(cfg.brand || ''), samples: rows, onBrandCount: on.length, offBrandCount: off.length, medians: med, offBrandMedians: offMed, contrast: contrast,
    spread: { grade: gradeSpread, avgSentence: sentSpread, consistent: consistent }, person: person,
    profile: { avoid: avoid, prefer: prefer, maxGrade: maxGrade }, rules: rules, findings: findings, verdict: verdict,
    engineRules: { MIN_SAMPLES: MIN_SAMPLES, MIN_WORDS: MIN_WORDS, GRADE_SPREAD_MAX: GRADE_SPREAD_MAX, SENTENCE_SPREAD_MAX: SENTENCE_SPREAD_MAX, GRADE_HEADROOM: GRADE_HEADROOM, LONGEST_FACTOR: LONGEST_FACTOR } };
}

function run(cfg) { return derive(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const f1 = (v) => v == null ? '-' : v.toFixed(1);
function render(r) {
  const L = [];
  L.push('SAMPLES' + (r.brand ? ' - ' + r.brand : ''));
  r.samples.forEach((s) => {
    const m = s.metrics;
    L.push(`  ${s.label} [${s.onBrand ? 'on-brand' : 'off-brand'}${s.thin ? ', too short' : ''}]: ${m.words} words, grade ${f1(m.grade)}, ${f1(m.avgSentence)} words/sentence (longest ${m.longestSentence}), you ${f1(m.youPer100)} / we ${f1(m.wePer100)} / I ${f1(m.iPer100)} per 100, contractions ${f1(m.contractionsPer100)}, hedges ${f1(m.hedgesPer100)}, buzzwords ${f1(m.buzzwordsPer100)}, ${Math.round(m.exclamationShare * 100)}% exclamations`);
  });
  L.push('');
  if (r.profile) {
    L.push(`ON-BRAND MEDIANS (${r.onBrandCount} samples): grade ${f1(r.medians.grade)}, ${f1(r.medians.avgSentence)} words/sentence, person "${r.person}", contractions ${f1(r.medians.contractionsPer100)}/100, hedges ${f1(r.medians.hedgesPer100)}/100; spread ${f1(r.spread.grade)} grades, ${f1(r.spread.avgSentence)} words`);
    if (r.contrast) {
      const o = r.offBrandMedians;
      L.push(`OFF-BRAND MEDIANS (${r.offBrandCount}): grade ${f1(o.grade)}, ${f1(o.avgSentence)} words/sentence, you ${f1(o.youPer100)}/100, contractions ${f1(o.contractionsPer100)}/100, hedges ${f1(o.hedgesPer100)}/100, buzzwords ${f1(o.buzzwordsPer100)}/100, passive ${Math.round(o.passiveShare * 100)}%`);
    }
    L.push('');
    L.push('RULES (the measurable half of the guide)');
    r.rules.forEach((x) => L.push(`  - ${x}`));
    L.push('');
    L.push('PROFILE for brand-voice-governance check mode: ' + JSON.stringify(r.profile));
    L.push('');
  }
  r.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
  L.push(`${r.verdict.level.toUpperCase()}: ${r.verdict.text}`);
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: Fieldnote is an invented scheduling app; all samples are invented.
const DEMO = {
  brand: 'Fieldnote',
  avoidCandidates: ['streamline'],
  samples: [
    { label: 'Homepage', onBrand: true, text: "You run a crew of six and a phone that never stops. Fieldnote puts every job on one board, so you can see who is where without calling anyone. Drag a job to a different day and the customer gets a text. That's it. There isn't a setup wizard, because you don't have a spare afternoon. Most contractors move their week over in about an hour, usually on a Sunday night with a beer. If a job runs long, the next customer knows before they start wondering. You'll still get calls. They'll just be about the work. We built it after running a plumbing business for nine years and losing two jobs a month to a whiteboard. It costs less than one of those jobs. Try it on your next week, not a demo account, and see whether Monday feels different. If it doesn't, you've lost an hour." },
    { label: 'Onboarding email 1', onBrand: true, text: "Your board is ready. Here's the one thing to do today: add tomorrow's jobs. Don't import anything yet, and don't invite the crew. Just type in tomorrow. It takes about ten minutes, and tomorrow morning you'll open your phone and see the day laid out. That's the moment most people decide whether Fieldnote is for them. If it isn't, reply to this email and tell me why; I read every one. If it is, the next email shows you how to bring the crew in, which takes another ten minutes. There's no video to watch. We'd rather you had the ten minutes back. One more thing: if you've got a job that always goes wrong, put it in first. You'll want to see what happens when it moves." },
    { label: 'Pricing FAQ', onBrand: true, text: "What happens when you hit the limit? You get a message that says so, and your jobs keep working. Nothing stops. You can add a technician for the price on the pricing page, or take one off next month if the season turns. Can you cancel? Yes, from the settings page, in two clicks, and you keep your data for ninety days. Is there a contract? No. You pay monthly, or yearly if you'd rather save the two months. Why don't you offer a free plan? Because a free plan for a business that bills two hundred dollars an hour isn't a favour; it's a sign the software isn't worth much. Try it for two weeks instead. If it doesn't earn its price in the first month, tell us and we'll refund it." },
    { label: 'Old press release', onBrand: false, text: "Fieldnote, the leading provider of best-in-class field service management solutions, today announced the launch of its revolutionary scheduling platform, designed to seamlessly streamline operations for contractors and empower them to leverage real-time visibility across their workforce. The cutting-edge solution has been engineered to deliver robust functionality while significantly enhancing operational efficiency. \"We are incredibly excited to unveil this game-changing innovation,\" said the CEO. \"Our mission is to supercharge the productivity of trades businesses everywhere.\" The platform is expected to be adopted by organizations of all sizes, and it has been recognized by industry analysts for its comprehensive feature set. Interested parties are encouraged to request a demonstration at their earliest convenience." },
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
    console.log('(no config - demo: three invented on-brand samples and one off-brand press release for Fieldnote)\n');
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

module.exports = { run, derive, measure, gradeLevel, median, HOUSE_BUZZWORDS, HEDGES, MIN_SAMPLES, MIN_WORDS, GRADE_SPREAD_MAX, SENTENCE_SPREAD_MAX, GRADE_HEADROOM, LONGEST_FACTOR };
