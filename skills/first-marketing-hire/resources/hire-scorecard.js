#!/usr/bin/env node
/*
 * AAJ First Marketing Hire Scorecard - engine
 * Part of the "first-marketing-hire" Agent Skill.
 *
 * AAJ's position: a first marketing hire is decided on evidence against a
 * scorecard written before anyone is interviewed, not on how the panel felt.
 * The engine weights each competency by what the role profile says it is
 * worth, scores only ratings that carry an evidence note, holds every
 * must-have to its bar, surfaces interviewers who saw different people, and
 * returns hire, no-hire or more-evidence per candidate. Nothing here is a
 * benchmark: the weights, bars and ratings are yours.
 *
 * USAGE
 *   node hire-scorecard.js --demo               # worked example (fictional)
 *   node hire-scorecard.js '<json-config>'      # your own
 *   node hire-scorecard.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "role": {
 *       "title": "First marketer",
 *       "stage": "Seed",                       // Pre-seed | Seed | Series A | Series B
 *       "channelFocus": "community and LinkedIn content for finance leaders",
 *       "outcomes": [                          // what the hire must own in months 1-6
 *         { "month": 3, "outcome": "Tracking fixed; three channel experiments run" },
 *         { "month": 6, "outcome": "Qualified leads from the working channel at the agreed target" }
 *       ],
 *       "competencies": [
 *         { "id": "channel",  "name": "Grows the working channel", "weight": 30, "mustHave": true, "bar": 3 },
 *         { "id": "customer", "name": "Understands the buyer",     "weight": 20, "mustHave": true },
 *         { "id": "paid",     "name": "Paid search",                "weight": 5 }
 *       ],
 *       "hireAt": 3.0                          // optional: weighted score a hire must reach (default 3.0)
 *     },
 *     "candidates": [                          // optional: leave out to check the profile alone
 *       { "name": "Candidate A",
 *         "ratings": [
 *           { "competency": "channel", "interviewer": "CEO", "stage": "founder screen",
 *             "score": 3, "evidence": "Grew a community from 400 to 2,100 members; showed the export" }
 *         ] }
 *     ]
 *   }
 *
 * RATING SCALE (1-4, no middle): 1 strong no, 2 no, 3 yes, 4 strong yes.
 * Weights are any positive numbers; they are normalised. A must-have's bar
 * defaults to 3. A rating with an empty evidence note is flagged and left out
 * of the score.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads pass through.
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
var SCALE_MIN = 1, SCALE_MAX = 4;    // 1 strong no, 2 no, 3 yes, 4 strong yes (no middle option)
var MUST_HAVE_BAR = 3;               // a must-have needs an average of "yes" unless the profile sets its own bar (AAJ's rule)
var HIRE_AT = 3.0;                   // weighted score a hire must reach unless the profile sets hireAt (AAJ's rule)
var DISAGREEMENT_SPREAD = 2;         // interviewers this far apart on one competency saw different people (AAJ's rule)
var MIN_COVERAGE_PCT = 80;           // share of the weight that needs evidenced ratings before any verdict but more-evidence (engine rule)
var THIN_EVIDENCE_WORDS = 4;         // an evidence note shorter than this many words is flagged as thin, still counted (engine rule)
var MAX_MUST_HAVES = 4;              // more must-haves than this for a first hire is a search for someone who does not exist (AAJ's rule)
var CLOSE_CALL = 0.25;               // two hire verdicts this close on score are not separated by the score (engine rule)
var STAGES = ['pre-seed', 'seed', 'series a', 'series b'];

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function r2(v) { return Math.round(v * 100) / 100; }
function str(v) { return v == null ? '' : String(v).trim(); }
function words(s) { return str(s) ? str(s).split(/\s+/).length : 0; }
function f2(v) { return Number(v).toFixed(2); }
function mean(a) { return a.length ? a.reduce(function (t, x) { return t + x; }, 0) / a.length : null; }

function normaliseRole(role) {
  if (!role || typeof role !== 'object') throw inputError('Give "role": the stage, the outcomes for months 1-6, the channel focus and the competencies with weights.');
  var comps = role.competencies;
  if (!Array.isArray(comps) || !comps.length) throw inputError('"role.competencies" needs at least one competency.');
  var seen = {};
  var list = comps.map(function (c, i) {
    var id = str(c && (c.id || c.name));
    if (!id) throw inputError('Competency ' + (i + 1) + ' needs an "id" or a "name".');
    if (seen[id]) throw inputError('Competency id "' + id + '" is used twice.');
    seen[id] = true;
    if (!isNum(c.weight) || c.weight <= 0) throw inputError('Competency "' + id + '" needs a "weight" greater than 0.');
    var bar = c.bar == null ? MUST_HAVE_BAR : c.bar;
    if (!isNum(bar) || bar < SCALE_MIN || bar > SCALE_MAX) throw inputError('Competency "' + id + '": "bar" must be between ' + SCALE_MIN + ' and ' + SCALE_MAX + '.');
    return { id: id, name: str(c.name) || id, weight: c.weight, mustHave: !!c.mustHave, bar: bar };
  });
  var total = list.reduce(function (t, c) { return t + c.weight; }, 0);
  list.forEach(function (c) { c.weightPct = r2((c.weight / total) * 100); });
  var hireAt = role.hireAt == null ? HIRE_AT : role.hireAt;
  if (!isNum(hireAt) || hireAt < SCALE_MIN || hireAt > SCALE_MAX) throw inputError('"role.hireAt" must be between ' + SCALE_MIN + ' and ' + SCALE_MAX + '.');

  var outcomes = (Array.isArray(role.outcomes) ? role.outcomes : []).map(function (o) {
    return typeof o === 'string' ? { month: null, outcome: str(o) } : { month: isNum(o && o.month) ? o.month : null, outcome: str(o && o.outcome) };
  }).filter(function (o) { return o.outcome; });

  var stage = str(role.stage);
  var warnings = [];
  var musts = list.filter(function (c) { return c.mustHave; });
  if (!musts.length) warnings.push('No must-haves. Every competency is negotiable, which usually means the job is not defined yet. Mark the deep skill behind your working channel as a must-have.');
  if (musts.length > MAX_MUST_HAVES) warnings.push(musts.length + ' must-haves. A first hire with more than ' + MAX_MUST_HAVES + ' is a search for someone who does not exist. Keep the deep skill and the few basics the first six months cannot do without.');
  if (!str(role.channelFocus)) warnings.push('No channel focus. Name the channel that already brings in most of your customers; the deep skill to hire for is the one behind it.');
  if (!outcomes.length) warnings.push('No outcomes for months 1-6. Write what the hire must own by month 3 and month 6 before you interview; the competencies follow from them.');
  if (outcomes.some(function (o) { return o.month != null && (o.month < 1 || o.month > 6); })) warnings.push('An outcome falls outside months 1-6. Keep the profile to what the first six months must deliver.');
  if (stage && STAGES.indexOf(stage.toLowerCase()) === -1) warnings.push('Stage "' + stage + '" is not one of Pre-seed, Seed, Series A or Series B; stage notes are skipped.');
  var stageNote = null;
  var s = stage.toLowerCase();
  if (s === 'pre-seed') stageNote = 'At pre-seed the founders usually do the marketing. Check that there is a working channel to amplify before hiring; freelancers or advisors can cover specific jobs until then.';
  else if (s === 'seed') stageNote = 'At seed the usual first hire is a hands-on generalist with one deep skill, with senior guidance from a founder or a fractional leader.';
  else if (s === 'series a' || s === 'series b') stageNote = 'At Series A or B, with channels proven and budget to hire under them, the role may be a head of marketing who has built a team. Weight leadership competencies accordingly.';

  return { title: str(role.title) || 'First marketing hire', stage: stage || null, channelFocus: str(role.channelFocus) || null, outcomes: outcomes, competencies: list, hireAt: hireAt, warnings: warnings, stageNote: stageNote };
}

function scoreCandidate(cand, role, idx) {
  var name = str(cand && cand.name) || 'Candidate ' + (idx + 1);
  var ratings = Array.isArray(cand && cand.ratings) ? cand.ratings : [];
  var byId = {};
  role.competencies.forEach(function (c) { byId[c.id] = c; });
  var flags = { noEvidence: [], thinEvidence: [], unknownCompetency: [] };

  var clean = [];
  ratings.forEach(function (r, i) {
    var comp = str(r && r.competency);
    var score = r && r.score;
    if (!isNum(score) || Math.round(score) !== score || score < SCALE_MIN || score > SCALE_MAX) throw inputError(name + ', rating ' + (i + 1) + ': "score" must be a whole number from ' + SCALE_MIN + ' to ' + SCALE_MAX + '.');
    var who = str(r.interviewer) || 'Unnamed interviewer';
    var ev = str(r.evidence);
    var rec = { competency: comp, interviewer: who, stage: str(r.stage) || null, score: score, evidence: ev, evidenced: !!ev };
    if (!byId[comp]) { flags.unknownCompetency.push({ competency: comp, interviewer: who }); return; }
    if (!ev) flags.noEvidence.push({ competency: comp, interviewer: who, stage: rec.stage, score: score });
    else if (words(ev) < THIN_EVIDENCE_WORDS) flags.thinEvidence.push({ competency: comp, interviewer: who, stage: rec.stage, score: score, evidence: ev });
    clean.push(rec);
  });

  var comps = role.competencies.map(function (c) {
    var rs = clean.filter(function (r) { return r.competency === c.id; });
    // One voice per interviewer: average each interviewer's ratings first, so a person who rated
    // the same competency at three stages does not outvote the rest of the panel.
    var people = {};
    rs.forEach(function (r) { (people[r.interviewer] = people[r.interviewer] || []).push(r); });
    var interviewers = Object.keys(people).map(function (p) {
      var all = people[p], ev = all.filter(function (r) { return r.evidenced; });
      return { interviewer: p, ratings: all.length, mean: r2(mean(all.map(function (r) { return r.score; }))), evidencedMean: ev.length ? r2(mean(ev.map(function (r) { return r.score; }))) : null };
    });
    var evMeans = interviewers.filter(function (x) { return x.evidencedMean != null; }).map(function (x) { return x.evidencedMean; });
    var allMeans = interviewers.map(function (x) { return x.mean; });
    var score = evMeans.length ? r2(mean(evMeans)) : null;
    var scoreAll = allMeans.length ? r2(mean(allMeans)) : null;
    var spread = allMeans.length > 1 ? r2(Math.max.apply(null, allMeans) - Math.min.apply(null, allMeans)) : 0;
    var low = null, high = null;
    if (allMeans.length > 1) {
      interviewers.forEach(function (x) { if (!low || x.mean < low.mean) low = x; if (!high || x.mean > high.mean) high = x; });
    }
    return {
      id: c.id, name: c.name, weight: c.weight, weightPct: c.weightPct, mustHave: c.mustHave, bar: c.bar,
      score: score, scoreIncludingUnevidenced: scoreAll, ratings: rs.length, evidencedRatings: rs.filter(function (r) { return r.evidenced; }).length,
      interviewers: interviewers, spread: spread, disagreement: spread >= DISAGREEMENT_SPREAD,
      low: low ? { interviewer: low.interviewer, mean: low.mean } : null, high: high ? { interviewer: high.interviewer, mean: high.mean } : null,
      unrated: rs.length === 0, noEvidencedRating: score == null,
      belowBar: c.mustHave && score != null && score < c.bar,
    };
  });

  var totalW = comps.reduce(function (t, c) { return t + c.weight; }, 0);
  var rated = comps.filter(function (c) { return c.score != null; });
  var ratedW = rated.reduce(function (t, c) { return t + c.weight; }, 0);
  var weighted = ratedW ? r2(rated.reduce(function (t, c) { return t + c.weight * c.score; }, 0) / ratedW) : null;
  var ratedAll = comps.filter(function (c) { return c.scoreIncludingUnevidenced != null; });
  var ratedAllW = ratedAll.reduce(function (t, c) { return t + c.weight; }, 0);
  var weightedAll = ratedAllW ? r2(ratedAll.reduce(function (t, c) { return t + c.weight * c.scoreIncludingUnevidenced; }, 0) / ratedAllW) : null;
  var coveragePct = r2((ratedW / totalW) * 100);

  var mustBelow = comps.filter(function (c) { return c.belowBar; });
  var mustBelowFirm = mustBelow.filter(function (c) { return !c.disagreement; });
  var mustNoEvidence = comps.filter(function (c) { return c.mustHave && c.noEvidencedRating; });
  var mustSplit = comps.filter(function (c) { return c.mustHave && c.disagreement; });
  var splits = comps.filter(function (c) { return c.disagreement; });

  var call, reasons = [];
  if (mustBelowFirm.length) {
    call = 'no-hire';
    mustBelowFirm.forEach(function (c) { reasons.push('Must-have "' + c.name + '" scores ' + f2(c.score) + ' against a bar of ' + f2(c.bar) + ', and the panel agrees.'); });
  } else if (mustNoEvidence.length || mustSplit.length) {
    call = 'more-evidence';
    mustNoEvidence.forEach(function (c) { reasons.push('Must-have "' + c.name + '" has ' + (c.unrated ? 'no rating at all' : 'ratings but no evidence note') + '.'); });
    mustSplit.forEach(function (c) { reasons.push('Interviewers disagree on must-have "' + c.name + '": ' + c.low.interviewer + ' ' + f2(c.low.mean) + ', ' + c.high.interviewer + ' ' + f2(c.high.mean) + '.'); });
  } else if (coveragePct < MIN_COVERAGE_PCT) {
    call = 'more-evidence';
    reasons.push('Only ' + coveragePct + '% of the weight has evidenced ratings; ' + MIN_COVERAGE_PCT + '% is needed before a call.');
  } else if (weighted < role.hireAt) {
    call = 'no-hire';
    reasons.push('Weighted score ' + f2(weighted) + ' is below the hire line of ' + f2(role.hireAt) + ', with every must-have at or above its bar.');
  } else {
    call = 'hire';
    reasons.push('Every must-have is at or above its bar, with evidence, and the weighted score ' + f2(weighted) + ' clears the hire line of ' + f2(role.hireAt) + '.');
  }

  var next = [];
  mustNoEvidence.forEach(function (c) { next.push('Cover "' + c.name + '" in the next stage with the question tied to it, and write down the example the candidate gives.'); });
  splits.forEach(function (c) { next.push('Put ' + c.low.interviewer + ' and ' + c.high.interviewer + ' in one room with their notes on "' + c.name + '" before anyone decides. Settle it on the evidence, not on who argues best.'); });
  flags.noEvidence.forEach(function (f) {
    var c = byId[f.competency];
    next.push('Ask ' + f.interviewer + ' for the example behind their ' + f.score + ' on "' + (c ? c.name : f.competency) + '", or drop the rating. It is not in the score until it has one.');
  });
  flags.thinEvidence.forEach(function (f) {
    var c = byId[f.competency];
    next.push('The note behind ' + f.interviewer + '\'s ' + f.score + ' on "' + (c ? c.name : f.competency) + '" ("' + f.evidence + '") is an opinion, not an example. Ask what the candidate said or did.');
  });
  if (call === 'hire') next.push('Check references on the deep skill: did they grow a channel, or run one someone else built?');

  return {
    name: name, weightedScore: weighted, weightedScoreIncludingUnevidenced: weightedAll, coveragePct: coveragePct,
    competencies: comps,
    flags: {
      mustHaveBelowBar: mustBelow.map(function (c) { return { competency: c.name, score: c.score, bar: c.bar, disputed: c.disagreement }; }),
      noEvidence: flags.noEvidence, thinEvidence: flags.thinEvidence,
      disagreements: splits.map(function (c) { return { competency: c.name, mustHave: c.mustHave, spread: c.spread, low: c.low, high: c.high }; }),
      unrated: comps.filter(function (c) { return c.unrated; }).map(function (c) { return c.name; }),
      unknownCompetency: flags.unknownCompetency,
    },
    verdict: { call: call, reasons: reasons },
    nextSteps: next,
  };
}

function run(cfg) {
  cfg = cfg || {};
  var role = normaliseRole(cfg.role);
  if (cfg.candidates != null && !Array.isArray(cfg.candidates)) throw inputError('"candidates" must be a list: each with a name and ratings from interviewers.');
  if (!cfg.candidates || !cfg.candidates.length) {
    return { role: role, candidates: [], summary: 'Profile only: no candidates yet. Fix any warnings above before the first interview, then add each interviewer\'s ratings with evidence notes.', rules: rulesOut() };
  }
  var cands = cfg.candidates.map(function (c, i) { return scoreCandidate(c, role, i); });
  var order = cands.slice().sort(function (a, b) { return (b.weightedScore == null ? -1 : b.weightedScore) - (a.weightedScore == null ? -1 : a.weightedScore); });
  order.forEach(function (c, i) { c.rank = i + 1; });
  var hires = order.filter(function (c) { return c.verdict.call === 'hire'; });
  var pending = order.filter(function (c) { return c.verdict.call === 'more-evidence'; });
  var summary;
  if (hires.length > 1 && hires[0].weightedScore - hires[1].weightedScore < CLOSE_CALL) {
    summary = hires[0].name + ' and ' + hires[1].name + ' both clear the bar and are ' + r2(hires[0].weightedScore - hires[1].weightedScore) + ' apart on a 1-4 scale. The score does not separate them; decide on the deep skill and the references.';
  } else if (hires.length) {
    summary = hires[0].name + ' clears every bar with the highest weighted score (' + f2(hires[0].weightedScore) + ').' + (pending.length ? ' ' + pending.map(function (c) { return c.name; }).join(' and ') + (pending.length > 1 ? ' are' : ' is') + ' still short of evidence; close that before you make the offer if you want a fair comparison.' : '');
  } else if (pending.length) {
    summary = 'Nobody clears the bar yet. ' + pending.map(function (c) { return c.name; }).join(' and ') + (pending.length > 1 ? ' need' : ' needs') + ' more evidence before a call.';
  } else {
    summary = 'Nobody clears the bar. Re-open the search rather than lower it; a first hire who misses a must-have costs months, not just salary.';
  }
  return {
    role: role,
    candidates: order,
    summary: summary,
    rules: rulesOut(),
  };
}

function rulesOut() {
  return { SCALE_MIN: SCALE_MIN, SCALE_MAX: SCALE_MAX, MUST_HAVE_BAR: MUST_HAVE_BAR, HIRE_AT: HIRE_AT, DISAGREEMENT_SPREAD: DISAGREEMENT_SPREAD, MIN_COVERAGE_PCT: MIN_COVERAGE_PCT, THIN_EVIDENCE_WORDS: THIN_EVIDENCE_WORDS, MAX_MUST_HAVES: MAX_MUST_HAVES, CLOSE_CALL: CLOSE_CALL };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const L = [];
  const ro = r.role;
  L.push(`ROLE - ${ro.title}${ro.stage ? ' (' + ro.stage + ')' : ''}${ro.channelFocus ? '; channel focus: ' + ro.channelFocus : ''}`);
  ro.outcomes.forEach((o) => L.push(`  ${o.month != null ? 'By month ' + o.month : 'Outcome'}: ${o.outcome}`));
  L.push('  Competencies (weight, bar):');
  ro.competencies.forEach((c) => L.push(`    ${c.mustHave ? '[must] ' : '       '}${c.name} - ${c.weightPct}%${c.mustHave ? ', bar ' + c.bar : ''}`));
  L.push(`  Hire line: weighted ${ro.hireAt.toFixed(2)} on a 1-4 scale.`);
  if (ro.stageNote) L.push(`  Stage: ${ro.stageNote}`);
  ro.warnings.forEach((w) => L.push(`  ! ${w}`));
  L.push('');
  r.candidates.forEach((c) => {
    L.push(`${c.rank}. ${c.name} - ${c.verdict.call.toUpperCase()} - weighted ${c.weightedScore == null ? 'n/a' : c.weightedScore.toFixed(2)} (with unevidenced ratings: ${c.weightedScoreIncludingUnevidenced == null ? 'n/a' : c.weightedScoreIncludingUnevidenced.toFixed(2)}); evidence covers ${c.coveragePct}% of the weight`);
    c.competencies.forEach((k) => {
      const who = k.interviewers.map((x) => `${x.interviewer} ${x.mean}${x.evidencedMean == null ? '*' : ''}`).join(', ');
      L.push(`     ${k.mustHave ? '[must] ' : ''}${k.name}: ${k.score == null ? 'no evidenced rating' : k.score}${k.belowBar ? ' BELOW BAR ' + k.bar : ''}${k.disagreement ? ' SPLIT ' + k.spread : ''}${who ? '  (' + who + ')' : ''}`);
    });
    c.verdict.reasons.forEach((x) => L.push(`   - ${x}`));
    if (c.flags.unknownCompetency.length) L.push(`   ! Ratings for unknown competencies ignored: ${c.flags.unknownCompetency.map((u) => u.competency || '(blank)').join(', ')}`);
    c.nextSteps.forEach((x) => L.push(`   > ${x}`));
    L.push('');
  });
  L.push(r.summary);
  if (r.candidates.length) L.push('(* = no evidence note; not counted in the score)');
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// FICTIONAL. Example Co. is AAJ's fictional running case (a seed-stage B2B SaaS startup that
// automates the month-end close). The weights, ratings and notes are example inputs, not benchmarks.
const DEMO = {
  role: {
    title: 'First marketer (Example Co., fictional)',
    stage: 'Seed',
    channelFocus: 'community and LinkedIn content for finance leaders',
    outcomes: [
      { month: 1, outcome: 'Ten customer conversations written up; tracking and website audited' },
      { month: 3, outcome: 'Tracking fixed, lead stages agreed with sales, three community experiments run' },
      { month: 6, outcome: 'The community channel producing qualified leads at the target agreed on day one, reported weekly' },
    ],
    competencies: [
      { id: 'channel', name: 'Grows the working channel (community and LinkedIn content)', weight: 30, mustHave: true },
      { id: 'customer', name: 'Understands the finance buyer', weight: 20, mustHave: true },
      { id: 'tests', name: 'Plans tests with a measurable pass mark', weight: 15, mustHave: true },
      { id: 'handson', name: 'Works hands-on without a team', weight: 10, mustHave: true },
      { id: 'basics', name: 'Runs email, website updates and basic tracking', weight: 10 },
      { id: 'tradeoffs', name: 'Prioritises and states trade-offs honestly', weight: 10 },
      { id: 'paid', name: 'Bonus skill: paid search', weight: 5 },
    ],
  },
  candidates: [
    {
      name: 'Candidate A (fictional)',
      ratings: [
        { competency: 'channel', interviewer: 'CEO', stage: 'founder screen', score: 3, evidence: 'Walked through growing a practitioner community from 400 to 2,100 members over 18 months; named what they changed each quarter' },
        { competency: 'channel', interviewer: 'Practitioner', stage: 'deep-dive', score: 4, evidence: 'Showed the weekly post log and which three formats drove sign-ups; said a designer did the visuals' },
        { competency: 'customer', interviewer: 'CEO', stage: 'founder screen', score: 3, evidence: 'Asked who signs versus who uses before pitching anything; knew why controllers care about close days' },
        { competency: 'customer', interviewer: 'Account executive', stage: 'take-home review', score: 3, evidence: 'Take-home plan targets controllers first and the CFO second, with the reason' },
        { competency: 'tests', interviewer: 'Practitioner', stage: 'take-home review', score: 3, evidence: 'Three tests, each with a pass mark set before launch and a stop rule' },
        { competency: 'handson', interviewer: 'CEO', stage: 'founder screen', score: 3, evidence: 'Wrote and scheduled every community post themselves last year; used a freelancer only for design' },
        { competency: 'basics', interviewer: 'Practitioner', stage: 'deep-dive', score: 3, evidence: 'Set up UTM conventions and a CRM source field at their last company; showed the naming sheet' },
        { competency: 'tradeoffs', interviewer: 'CEO', stage: 'take-home review', score: 3, evidence: 'Dropped paid search from the 90-day plan and said what that costs' },
        { competency: 'paid', interviewer: 'Practitioner', stage: 'deep-dive', score: 2, evidence: 'Has managed a small search budget but never built an account' },
      ],
    },
    {
      name: 'Candidate B (fictional)',
      ratings: [
        { competency: 'channel', interviewer: 'CEO', stage: 'founder screen', score: 4, evidence: 'Strong portfolio of LinkedIn posts with high engagement' },
        { competency: 'channel', interviewer: 'Practitioner', stage: 'deep-dive', score: 2, evidence: 'Could not say what the posts produced beyond likes; the channel was set up by a predecessor' },
        { competency: 'customer', interviewer: 'CEO', stage: 'founder screen', score: 3, evidence: 'Has sold to finance teams before; explained the month-end pressure in their words' },
        { competency: 'tests', interviewer: 'Practitioner', stage: 'take-home review', score: 3, evidence: 'Clear test plan with a pass mark for each headline' },
        { competency: 'handson', interviewer: 'CEO', stage: 'founder screen', score: 3, evidence: 'Ran the company newsletter alone for two years, from drafting to sending' },
        { competency: 'basics', interviewer: 'Account executive', stage: 'take-home review', score: 3, evidence: '' },
        { competency: 'tradeoffs', interviewer: 'CEO', stage: 'take-home review', score: 3, evidence: 'Good' },
        { competency: 'paid', interviewer: 'Practitioner', stage: 'deep-dive', score: 3, evidence: 'Built and ran a search account for a B2B tool; showed the change log' },
      ],
    },
    {
      name: 'Candidate C (fictional)',
      ratings: [
        { competency: 'channel', interviewer: 'CEO', stage: 'founder screen', score: 3, evidence: 'Ran a community programme for a developer tool; grew event attendance quarter on quarter' },
        { competency: 'channel', interviewer: 'Practitioner', stage: 'deep-dive', score: 3, evidence: 'Explained the referral loop they built and its numbers; owned it end to end' },
        { competency: 'customer', interviewer: 'CEO', stage: 'founder screen', score: 2, evidence: 'Described the buyer as "finance people" and could not separate controller from CFO' },
        { competency: 'customer', interviewer: 'Account executive', stage: 'take-home review', score: 2, evidence: 'Take-home messaging aimed at IT, not at the people who run the close' },
        { competency: 'tests', interviewer: 'Practitioner', stage: 'take-home review', score: 3, evidence: 'Tests had pass marks, though two were not measurable with current tracking' },
        { competency: 'handson', interviewer: 'CEO', stage: 'founder screen', score: 3, evidence: 'Built the event programme alone before the company hired an events lead' },
        { competency: 'basics', interviewer: 'Practitioner', stage: 'deep-dive', score: 4, evidence: 'Has run lifecycle email and a website migration; strong on tracking' },
        { competency: 'tradeoffs', interviewer: 'CEO', stage: 'take-home review', score: 3, evidence: 'Named what they would stop doing to make room for the experiments' },
      ],
    },
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
    console.log('(no config - demo: three FICTIONAL candidates for a FICTIONAL seed-stage first marketer role at Example Co.; every weight and rating is an example input, not a benchmark)\n');
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

module.exports = { run, normaliseRole, scoreCandidate, DEMO, SCALE_MIN, SCALE_MAX, MUST_HAVE_BAR, HIRE_AT, DISAGREEMENT_SPREAD, MIN_COVERAGE_PCT, THIN_EVIDENCE_WORDS, MAX_MUST_HAVES, CLOSE_CALL };
