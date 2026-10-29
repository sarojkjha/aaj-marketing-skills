#!/usr/bin/env node
/*
 * AAJ Beachhead Segment Scorer - engine
 * Part of the "beachhead-segment-selection" Agent Skill.
 *
 * Which segment, industry or grade level to go after first. AAJ's position: a
 * young company wins one segment at a time, and the pick should rest on
 * evidence about buyers, not on which market sounds biggest. The engine scores
 * each candidate on five criteria against a written rubric, rules out any
 * segment that fails one outright, picks one, says why the runner-up lost, and
 * checks whether the pick survives different weights and its own assumptions.
 *
 * USAGE
 *   node beachhead-score.js                    # demo (Example Co., invented scores)
 *   node beachhead-score.js '<json-config>'    # your own
 *   node beachhead-score.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "segments": [                          // 2 to 10 candidates
 *       { "name": "Mid-size clinics",
 *         "scores": {                        // 1 to 5 each, against the rubric below
 *           "pain": 4, "reach": 3, "budget": 4, "competition": 3, "proof": 2 },
 *         "evidence": {                      // optional, per criterion: what the score rests on
 *           "pain": "7 of 9 interviews named it unprompted" },
 *         "accounts": 1800,                  // optional: how many buyers in the segment you could reach
 *         "acv": 12000 }                     // optional: annual contract value per buyer
 *     ],
 *     "weights": { "pain": 1, "reach": 1, "budget": 1, "competition": 1, "proof": 1 },
 *                                            // optional: relative weights (default equal)
 *     "knockout": true,                      // optional: a 1 on any criterion rules the segment out (default true)
 *     "revenueTarget": 1000000               // optional: with accounts and acv, the share of the segment you would need
 *   }
 *
 * RUBRIC (1 / 3 / 5; 2 and 4 sit between)
 *   pain         1 nice to have, nobody raised it   3 a known problem with a workaround   5 urgent: budgeted, searched for, raised unprompted
 *   reach        1 no list or channel to reach them 3 reachable, cost unknown             5 named list, shared communities or events, warm intros
 *   budget       1 no one owns a budget for it      3 budget exists but competes           5 an owner who can sign at your price
 *   competition  1 entrenched leader, costly switch 3 alternatives with clear gaps         5 no good alternative; spreadsheets and workarounds
 *   proof        1 no conversations yet             3 interviews or a pilot                5 paying customers and references in this segment
 *
 * OUTPUT
 *   Each segment's 0-100 score, knock-outs, evidence coverage and, with
 *   accounts and acv, its revenue pool and the share of it a target needs;
 *   the pick, why the runner-up lost, whether the pick holds when each weight
 *   is doubled or halved and when its unevidenced scores drop by one, a verdict
 *   (clear, leaning, only one left, or none eligible), and the test that would decide it.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`.
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
// Rules of this engine, stated where they are used so a reader can argue with them.
// These are AAJ's defaults, not industry benchmarks; each can be changed in the config.
var CRITERIA = ['pain', 'reach', 'budget', 'competition', 'proof'];
var LABELS = { pain: 'Pain', reach: 'Reach', budget: 'Budget', competition: 'Competition', proof: 'Proof' };
var RUBRIC = {
  pain: { 1: 'Nice to have; nobody raised it', 3: 'A known problem with a workaround in place', 5: 'Urgent: budgeted, searched for, raised unprompted' },
  reach: { 1: 'No list or channel to reach them', 3: 'Reachable through paid channels, cost unknown', 5: 'A named list, shared communities or events, warm intros' },
  budget: { 1: 'No one owns a budget for this', 3: 'A budget exists but competes with other priorities', 5: 'A budget owner who can sign at your price' },
  competition: { 1: 'An entrenched leader and a costly switch', 3: 'Alternatives exist, with clear gaps', 5: 'No good alternative; spreadsheets and workarounds' },
  proof: { 1: 'No conversations with this segment yet', 3: 'Interviews or a pilot', 5: 'Paying customers and references in this segment' }
};
var CLEAR_MARGIN = 10;   // points out of 100 the pick must lead by to be called clear
var MIN_SEGMENTS = 2, MAX_SEGMENTS = 10;
var TOP_FIELDS = ['segments', 'weights', 'knockout', 'revenueTarget'];
var SEGMENT_FIELDS = ['name', 'scores', 'evidence', 'accounts', 'acv'];

function inputError(msg, hint) { var e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function unknownFields(obj, allowed, where) {
  Object.keys(obj).forEach(function (k) {
    if (allowed.indexOf(k) < 0) throw inputError('Unknown field "' + k + '"' + where + '.', 'Allowed: ' + allowed.join(', ') + '.');
  });
}

function normalise(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw inputError('The config must be a JSON object.');
  unknownFields(cfg, TOP_FIELDS, '');
  var weights = {};
  var w = cfg.weights == null ? {} : cfg.weights;
  if (typeof w !== 'object' || Array.isArray(w)) throw inputError('"weights" must be an object, e.g. {"pain": 2, "reach": 1}.');
  unknownFields(w, CRITERIA, ' in weights');
  var total = 0;
  CRITERIA.forEach(function (c) {
    var v = w[c] == null ? 1 : w[c];
    if (!isNum(v) || v < 0) throw inputError('Weight "' + c + '" must be 0 or more (got ' + JSON.stringify(w[c]) + ').');
    weights[c] = v; total += v;
  });
  if (total <= 0) throw inputError('At least one weight must be above 0.');
  if (cfg.knockout != null && typeof cfg.knockout !== 'boolean') throw inputError('"knockout" must be true or false.');
  var target = cfg.revenueTarget == null ? null : cfg.revenueTarget;
  if (target !== null && (!isNum(target) || target <= 0)) throw inputError('"revenueTarget" must be a number above 0.');
  if (!Array.isArray(cfg.segments) || cfg.segments.length < MIN_SEGMENTS) throw inputError('Give "segments": a list of ' + MIN_SEGMENTS + ' to ' + MAX_SEGMENTS + ' candidates.');
  if (cfg.segments.length > MAX_SEGMENTS) throw inputError('At most ' + MAX_SEGMENTS + ' segments at once (got ' + cfg.segments.length + ').', 'Narrow the list first: drop any segment you could not name ten buyers in.');
  var given = {}, names = {};
  cfg.segments.forEach(function (sg) { if (sg && sg.name != null && sg.name !== '') given[String(sg.name)] = true; });
  var segments = cfg.segments.map(function (sg, i) {
    if (!sg || typeof sg !== 'object' || Array.isArray(sg)) throw inputError('segments[' + i + '] must be an object.');
    var name = sg.name == null || sg.name === '' ? null : String(sg.name);
    if (name === null) { var k = i + 1; while (given['Segment ' + k] || names['Segment ' + k]) k++; name = 'Segment ' + k; }
    var where = ' on segment "' + name + '"';
    unknownFields(sg, SEGMENT_FIELDS, where);
    if (names[name]) throw inputError('Two segments are both called "' + name + '". Give each a different name.');
    names[name] = true;
    if (!sg.scores || typeof sg.scores !== 'object' || Array.isArray(sg.scores)) throw inputError('Give "scores"' + where + ': ' + CRITERIA.join(', ') + ', each 1 to 5.');
    unknownFields(sg.scores, CRITERIA, ' in scores' + where);
    var scores = {};
    CRITERIA.forEach(function (c) {
      var v = sg.scores[c];
      if (v == null) throw inputError('Missing score "' + c + '"' + where + '.', 'Score every criterion 1 to 5; see --help for the rubric.');
      if (!isNum(v) || v < 1 || v > 5 || Math.round(v) !== v) throw inputError('Score "' + c + '"' + where + ' must be a whole number from 1 to 5 (got ' + JSON.stringify(v) + ').');
      scores[c] = v;
    });
    var ev = sg.evidence == null ? {} : sg.evidence;
    if (typeof ev !== 'object' || Array.isArray(ev)) throw inputError('"evidence"' + where + ' must be an object of notes per criterion.');
    unknownFields(ev, CRITERIA, ' in evidence' + where);
    var evidence = {};
    CRITERIA.forEach(function (c) {
      var t = ev[c] == null ? '' : String(ev[c]).trim();
      evidence[c] = t;
    });
    var accounts = sg.accounts == null ? null : sg.accounts, acv = sg.acv == null ? null : sg.acv;
    if (accounts !== null && (!isNum(accounts) || accounts <= 0)) throw inputError('"accounts"' + where + ' must be a number above 0.');
    if (acv !== null && (!isNum(acv) || acv <= 0)) throw inputError('"acv"' + where + ' must be a number above 0.');
    return { name: name, scores: scores, evidence: evidence, accounts: accounts, acv: acv };
  });
  return { segments: segments, weights: weights, knockout: cfg.knockout !== false, revenueTarget: target };
}

// Weighted 0-100: each 1-5 score maps to 0-100, then a weighted mean.
function scoreOf(scores, weights) {
  var sum = 0, wsum = 0;
  CRITERIA.forEach(function (c) { sum += weights[c] * (scores[c] - 1) / 4 * 100; wsum += weights[c]; });
  return sum / wsum;
}
// The eligible segment with the highest score, and whether it leads outright:
// a tie at the top is not a win for anyone (tied is false).
function pick(list, weights) {
  var best = null, bestScore = -1, tied = false;
  list.forEach(function (sg) {
    if (!sg.eligible) return;
    var sc = scoreOf(sg.scores, weights);
    if (sc > bestScore + 1e-9) { best = sg; bestScore = sc; tied = false; }
    else if (Math.abs(sc - bestScore) <= 1e-9) tied = true;
  });
  return best ? { name: best.name, tied: tied } : null;
}
function holds(p, name) { return !!p && !p.tied && p.name === name; }

function run(cfg) {
  var s = normalise(cfg);
  var segs = s.segments.map(function (sg) {
    var r = { name: sg.name, scores: sg.scores, evidence: sg.evidence, accounts: sg.accounts, acv: sg.acv };
    r.score = scoreOf(sg.scores, s.weights);
    r.assumed = CRITERIA.filter(function (c) { return !sg.evidence[c]; });
    r.evidenceCoverage = (CRITERIA.length - r.assumed.length) / CRITERIA.length;
    r.knockouts = [];
    if (s.knockout) CRITERIA.forEach(function (c) { if (sg.scores[c] === 1) r.knockouts.push({ criterion: c, text: LABELS[c] + ' scored 1: ' + RUBRIC[c][1].toLowerCase() + '.' }); });
    if (sg.accounts !== null && sg.acv !== null) {
      r.pool = sg.accounts * sg.acv;
      if (s.revenueTarget !== null) {
        r.shareNeeded = s.revenueTarget / r.pool;
        if (r.shareNeeded > 1) r.knockouts.push({ criterion: 'size', text: 'Too small: your revenue target is ' + Math.round(r.shareNeeded * 100) / 100 + 'x everything this segment spends on it in a year.' });
      }
    }
    r.eligible = r.knockouts.length === 0;
    return r;
  });
  var ranked = segs.slice().sort(function (a, b) {
    return (a.eligible === b.eligible ? 0 : a.eligible ? -1 : 1) || (b.score - a.score) || (s.segments.findIndex(function (x) { return x.name === a.name; }) - s.segments.findIndex(function (x) { return x.name === b.name; }));
  });
  ranked.forEach(function (r, i) { r.rank = i + 1; });
  var eligible = ranked.filter(function (r) { return r.eligible; });
  var out = { weights: s.weights, knockout: s.knockout, revenueTarget: s.revenueTarget, segments: ranked, pick: null, runnerUp: null,
    rules: { CLEAR_MARGIN: CLEAR_MARGIN, MIN_SEGMENTS: MIN_SEGMENTS, MAX_SEGMENTS: MAX_SEGMENTS } };
  if (!eligible.length) {
    out.verdict = { level: 'none', headline: 'No segment is ready to be the beachhead',
      body: 'Every candidate fails at least one criterion outright. Fix the weakest criterion of the most promising segment, or look for a narrower segment inside it.' };
    return out;
  }
  var win = eligible[0], ru = eligible[1] || null;
  out.pick = win.name;
  out.runnerUp = ru ? ru.name : null;
  out.margin = ru ? win.score - ru.score : null;

  // Why the runner-up lost: each criterion's weighted contribution to the gap, in points.
  var wsum = 0; CRITERIA.forEach(function (c) { wsum += s.weights[c]; });
  if (ru) {
    out.comparison = CRITERIA.map(function (c) {
      return { criterion: c, pick: win.scores[c], runnerUp: ru.scores[c], points: s.weights[c] * (win.scores[c] - ru.scores[c]) / 4 * 100 / wsum };
    }).sort(function (a, b) { return Math.abs(b.points) - Math.abs(a.points); });
  }

  // Robustness 1: double and halve each weight in turn (ten scenarios).
  var scen = [], held = 0;
  CRITERIA.forEach(function (c) {
    [2, 0.5].forEach(function (f) {
      var w2 = {}; CRITERIA.forEach(function (k) { w2[k] = s.weights[k] * (k === c ? f : 1); });
      if (CRITERIA.every(function (k) { return w2[k] === 0; })) return;
      var p = pick(segs, w2);
      var ok = holds(p, win.name);
      scen.push({ criterion: c, factor: f, pick: p ? p.name : null, tied: !!p && p.tied, held: ok });
      if (ok) held++;
    });
  });
  out.weightTest = { scenarios: scen.length, held: held, flips: scen.filter(function (x) { return !x.held; }) };

  // Robustness 2: lower each of the pick's unevidenced scores by one (not below 1).
  var stressed = segs.map(function (sg) {
    if (sg.name !== win.name) return sg;
    var sc = {}; CRITERIA.forEach(function (c) { sc[c] = sg.assumed.indexOf(c) >= 0 ? Math.max(1, sg.scores[c] - 1) : sg.scores[c]; });
    return { name: sg.name, scores: sc, eligible: sg.eligible };
  });
  var sp = pick(stressed, s.weights);
  out.assumptionTest = { lowered: win.assumed.slice(), pick: sp ? sp.name : null, tied: !!sp && sp.tied, held: holds(sp, win.name),
    scoreAfter: scoreOf(stressed.filter(function (x) { return x.name === win.name; })[0].scores, s.weights) };

  // The test that would decide it: among criteria that move the gap and lack
  // evidence on either side, the one carrying the most points; on a tie, one
  // where the pick itself is unevidenced. Without a runner-up, the pick's
  // heaviest unevidenced criterion.
  var decider = null;
  if (ru) {
    var cands = out.comparison.filter(function (x) {
      return x.points !== 0 && (win.assumed.indexOf(x.criterion) >= 0 || ru.assumed.indexOf(x.criterion) >= 0);
    }).sort(function (a, b) {
      return (Math.abs(b.points) - Math.abs(a.points)) ||
        ((win.assumed.indexOf(b.criterion) >= 0 ? 1 : 0) - (win.assumed.indexOf(a.criterion) >= 0 ? 1 : 0)) ||
        (CRITERIA.indexOf(a.criterion) - CRITERIA.indexOf(b.criterion));
    });
    if (cands.length) {
      var dc = cands[0].criterion;
      decider = { criterion: dc, segments: [win, ru].filter(function (x) { return x.assumed.indexOf(dc) >= 0; }).map(function (x) { return x.name; }) };
    }
  }
  if (!decider && win.assumed.length) {
    var dw = win.assumed.slice().sort(function (a, b) { return s.weights[b] - s.weights[a]; })[0];
    decider = { criterion: dw, segments: [win.name] };
  }
  out.decidingCriterion = decider ? decider.criterion : null;
  out.decidingTest = decider;

  var clear = (!ru || out.margin >= CLEAR_MARGIN) && out.weightTest.flips.length === 0 && out.assumptionTest.held;
  var reasons = [];
  if (ru && out.margin < CLEAR_MARGIN) reasons.push('it leads ' + ru.name + ' by only ' + out.margin.toFixed(1) + ' points');
  if (out.weightTest.flips.length) reasons.push('its lead disappears in ' + out.weightTest.flips.length + ' of ' + out.weightTest.scenarios + ' weight changes');
  if (!out.assumptionTest.held) reasons.push(out.assumptionTest.tied ? 'it only ties when its unevidenced scores are one point lower'
    : out.assumptionTest.pick && out.assumptionTest.pick !== win.name ? 'with its unevidenced scores one point lower, ' + out.assumptionTest.pick + ' wins' : 'it relies on scores with no evidence');
  if (!ru) {
    var out_ = segs.length - 1;
    out.verdict = { level: 'only', headline: win.name + ' is the only segment left',
      body: 'The other ' + (out_ === 1 ? 'candidate is' : out_ + ' candidates are') + ' ruled out, so ' + win.name + ' is the default, not a proven choice' +
        (win.assumed.length ? ': ' + win.assumed.length + ' of its 5 scores have no evidence yet.' + (decider ? ' Start with ' + LABELS[decider.criterion].toLowerCase() + '.' : '') : '.') };
  } else if (clear) {
    out.verdict = { level: 'clear', headline: 'Start with ' + win.name,
      body: win.name + ' leads' + (ru ? ' ' + ru.name + ' by ' + out.margin.toFixed(1) + ' points' : '') + ', keeps the lead when any weight is doubled or halved' +
        (win.assumed.length ? ', and still wins with its unevidenced scores one point lower.' : ', and every score rests on evidence.') };
  } else {
    out.verdict = { level: 'leaning', headline: 'Leaning to ' + win.name + ', not settled',
      body: win.name + ' scores highest, but ' + reasons.join('; ') + '.' +
        (decider ? ' Get evidence on ' + LABELS[decider.criterion].toLowerCase() + ' for ' + decider.segments.join(' and ') + ' first: it moves the gap most and is not yet backed by evidence.' : '') };
  }
  return out;
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
function render(r) {
  const L = [];
  const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
  const LBL = { pain: 'Pain', reach: 'Reach', budget: 'Budget', competition: 'Competition', proof: 'Proof' };
  const C = ['pain', 'reach', 'budget', 'competition', 'proof'];
  L.push('BEACHHEAD SEGMENT SCORER');
  L.push('═'.repeat(58));
  const wEqual = C.every((c) => r.weights[c] === r.weights.pain);
  L.push('Weights: ' + (wEqual ? 'equal (AAJ default)' : C.map((c) => `${LBL[c]} ${r.weights[c]}`).join(', ')) + (r.knockout ? ' · a 1 on any criterion rules a segment out' : ''));
  L.push('');
  L.push(r.verdict.headline.toUpperCase());
  L.push('  ' + r.verdict.body);
  L.push('');
  L.push('RANKING' + ' '.repeat(27) + 'Score  Pa Re Bu Co Pr  Evidence');
  r.segments.forEach((s) => {
    const sc = C.map((c) => String(s.scores[c]).padStart(2)).join(' ');
    L.push(`  ${String(s.rank).padStart(2)}. ${(s.name.length > 28 ? s.name.slice(0, 27) + '…' : s.name).padEnd(28)} ${s.eligible ? s.score.toFixed(0).padStart(5) : '  out'}  ${sc}  ${Math.round(s.evidenceCoverage * 5)}/5`);
    s.knockouts.forEach((k) => L.push(`      ✗ ${k.text}`));
    if (s.pool != null) L.push(`      Pool ${money(s.pool)} a year` + (s.shareNeeded != null ? `; your target needs ${(s.shareNeeded * 100).toFixed(1)}% of it` : ''));
  });
  if (r.pick && r.runnerUp) {
    L.push('');
    L.push(`WHY ${r.runnerUp.toUpperCase()} CAME SECOND (points of the ${r.margin.toFixed(1)}-point gap)`);
    r.comparison.forEach((x) => L.push(`  ${LBL[x.criterion].padEnd(12)} ${x.pick} vs ${x.runnerUp}   ${x.points >= 0 ? '+' : ''}${x.points.toFixed(1)}`));
  }
  if (r.pick) {
    L.push('');
    L.push('HOW SOLID THE PICK IS');
    L.push(`  Weights   holds in ${r.weightTest.held} of ${r.weightTest.scenarios} changes (each weight doubled, then halved)` +
      (r.weightTest.flips.length ? '; ' + r.weightTest.flips.map((f) => `${f.tied ? 'ties' : f.pick + ' wins'} when ${LBL[f.criterion].toLowerCase()} is ${f.factor === 2 ? 'doubled' : 'halved'}`).join('; ') : ''));
    const p = r.segments.find((s) => s.name === r.pick);
    L.push(`  Evidence  ${p.assumed.length ? 'unevidenced: ' + p.assumed.map((c) => LBL[c].toLowerCase()).join(', ') + '; with those one point lower, ' + (r.assumptionTest.held ? 'it still wins' : r.assumptionTest.tied ? 'it only ties' : r.assumptionTest.pick + ' wins') : 'every score has evidence'}`);
    if (r.decidingTest) L.push(`  Next test evidence on ${LBL[r.decidingTest.criterion].toLowerCase()} for ${r.decidingTest.segments.join(' and ')}, before committing`);
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Example Co. is fictional; every score and note here is invented for the demo.
const DEMO = {
  revenueTarget: 600000,
  segments: [
    { name: 'Independent dental clinics', scores: { pain: 4, reach: 4, budget: 3, competition: 3, proof: 3 },
      evidence: { pain: '6 of 8 interviews raised it unprompted', reach: 'state association list, two conferences', proof: 'two pilots running' },
      accounts: 4000, acv: 3600 },
    { name: 'Multi-site dental groups', scores: { pain: 5, reach: 3, budget: 4, competition: 2, proof: 2 },
      evidence: { pain: 'ops directors describe it as their top problem' }, accounts: 450, acv: 24000 },
    { name: 'Veterinary clinics', scores: { pain: 3, reach: 3, budget: 3, competition: 4, proof: 1 },
      evidence: {}, accounts: 3000, acv: 3000 },
    { name: 'Physiotherapy practices', scores: { pain: 3, reach: 4, budget: 2, competition: 4, proof: 2 },
      evidence: { reach: 'one large online community' }, accounts: 2500, acv: 2400 },
  ],
};

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    return;
  }
  let cfg;
  if (argv.length === 0 || argv.includes('--demo')) {
    cfg = DEMO;
    console.log('(no config - demo: Example Co., a fictional company, with invented scores)\n');
  } else {
    try { cfg = JSON.parse(argv[0]); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  }
  try { console.log(render(run(cfg))); }
  catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema and the rubric, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run, render, normalise, scoreOf, CRITERIA, RUBRIC, CLEAR_MARGIN };
