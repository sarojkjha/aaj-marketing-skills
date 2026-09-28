#!/usr/bin/env node
/*
 * AAJ Customer Interview Synthesis — engine
 * Part of the "customer-interview-synthesis" Agent Skill.
 *
 * AAJ's position: an interview programme produces a persona or a
 * positioning decision only when the same problems come up, unprompted,
 * across enough people, and when new interviews stop adding new themes.
 * So the engine counts themes across interviews (not quotes, which
 * over-weight the talkative), weights them by how much the problem costs
 * the person, separates patterns from anecdotes, checks whether the
 * programme has saturated, and says whether to keep interviewing. The
 * thresholds are AAJ's rules and are labelled as such.
 *
 * USAGE
 *   node interview-synthesis.js                    # demo
 *   node interview-synthesis.js '<json-config>'    # your own
 *   node interview-synthesis.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "interviews": [                       // in the order they were done
 *       { "id": "I-01", "segment": "owner-operator",
 *         "notes": [
 *           { "theme": "double booking", "severity": 3,   // 1 annoying, 2 costs time, 3 costs money or customers
 *             "quote": "Lost a job last month because two crews showed up.",
 *             "workaround": "whiteboard photo on WhatsApp", "wouldPay": true }
 *         ] }
 *     ],
 *     "question": "Why do small contractors lose jobs?"   // optional, printed back
 *   }
 *
 * Theme names are matched case-insensitively after trimming; code them
 * consistently before running.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into any AAJ tool that runs this engine */
var MIN_INTERVIEWS = 5;        // below this many interviews nothing is a pattern and saturation is not judged (engine rule)
var PATTERN_SHARE = 0.4;       // a theme raised in at least this share of interviews ... (engine rule)
var PATTERN_MIN = 3;           // ... and by at least this many people is a pattern (engine rule)
var SATURATION_WINDOW = 3;     // no new theme in the last this-many interviews means the programme has saturated (engine rule)
var SEGMENT_CONCENTRATION = 0.75; // a theme with this share of its mentions from one segment is segment-specific (engine rule)

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function synthesise(cfg) {
  cfg = cfg || {};
  var interviews = Array.isArray(cfg.interviews) ? cfg.interviews : [];
  if (!interviews.length) throw inputError('"interviews" needs at least one interview with notes.');
  var N = interviews.length;
  var themes = {};
  var segmentsSeen = {};
  var newPerInterview = [];
  var seen = {};
  interviews.forEach(function (iv, idx) {
    var id = String(iv.id || ('I-' + (idx + 1)));
    var seg = norm(iv.segment) || 'unsegmented';
    segmentsSeen[seg] = (segmentsSeen[seg] || 0) + 1;
    var notes = Array.isArray(iv.notes) ? iv.notes : [];
    var mentionedHere = {};
    var added = 0;
    notes.forEach(function (n) {
      var t = norm(n.theme);
      if (!t) return;
      var sev = isNum(n.severity) ? Math.max(1, Math.min(3, Math.round(n.severity))) : null;
      if (!themes[t]) { themes[t] = { theme: t, interviews: [], severities: [], segments: {}, quotes: [], workarounds: [], wouldPay: 0, firstSeenAt: idx + 1 }; if (!seen[t]) { seen[t] = true; added++; } }
      var th = themes[t];
      if (!mentionedHere[t]) { mentionedHere[t] = true; th.interviews.push(id); th.segments[seg] = (th.segments[seg] || 0) + 1; }
      if (sev !== null) th.severities.push(sev);
      if (n.quote && th.quotes.length < 3) th.quotes.push({ id: id, text: String(n.quote) });
      if (n.workaround) th.workarounds.push(String(n.workaround));
      if (n.wouldPay === true) th.wouldPay++;
    });
    newPerInterview.push({ id: id, newThemes: added, themesRaised: Object.keys(mentionedHere).length });
  });
  var segCount = Object.keys(segmentsSeen).length;
  var rows = Object.keys(themes).map(function (k) {
    var t = themes[k];
    var count = t.interviews.length, share = count / N;
    var sev = t.severities.length ? t.severities.reduce(function (a, b) { return a + b; }, 0) / t.severities.length : null;
    var status = N < MIN_INTERVIEWS ? (count >= 2 ? 'emerging' : 'anecdote') : (share >= PATTERN_SHARE && count >= PATTERN_MIN ? 'pattern' : count >= 2 ? 'emerging' : 'anecdote');
    var topSeg = null, conc = null;
    if (segCount > 1) {
      var segs = Object.keys(t.segments).sort(function (a, b) { return t.segments[b] - t.segments[a]; });
      topSeg = segs[0]; conc = t.segments[topSeg] / count;
    }
    return { theme: t.theme, interviews: count, share: share, meanSeverity: sev, priority: sev !== null ? share * sev : share, status: status,
      segmentSpecific: conc !== null && conc >= SEGMENT_CONCENTRATION && count >= 2 ? topSeg : null, segments: t.segments,
      wouldPay: t.wouldPay, workarounds: t.workarounds.slice(0, 3), quotes: t.quotes, firstSeenAt: t.firstSeenAt };
  });
  rows.sort(function (a, b) { return b.priority - a.priority || b.interviews - a.interviews || a.theme.localeCompare(b.theme); });
  var lastWindow = newPerInterview.slice(-SATURATION_WINDOW);
  var newInWindow = lastWindow.reduce(function (a, x) { return a + x.newThemes; }, 0);
  var saturated = N >= MIN_INTERVIEWS && N > SATURATION_WINDOW && newInWindow === 0;
  var patterns = rows.filter(function (r) { return r.status === 'pattern'; });
  var findings = [];
  var missingSev = rows.filter(function (r) { return r.meanSeverity === null; });
  if (missingSev.length) findings.push({ level: 'improve', id: 'no-severity', text: missingSev.length + ' theme' + (missingSev.length > 1 ? 's have' : ' has') + ' no severity coded, so ' + (missingSev.length > 1 ? 'they rank' : 'it ranks') + ' on frequency alone. Code 1 (annoying), 2 (costs time) or 3 (costs money or customers).' });
  var singletons = rows.filter(function (r) { return r.interviews === 1; }).length;
  if (rows.length && singletons / rows.length > 0.6 && N >= MIN_INTERVIEWS) findings.push({ level: 'improve', id: 'fragmented', text: singletons + ' of ' + rows.length + ' themes were raised once. Either the coding is too fine (merge near-duplicates) or the sample mixes people with different problems (check segments).' });
  var noSeg = segmentsSeen.unsegmented || 0;
  if (noSeg && segCount > 1) findings.push({ level: 'improve', id: 'unsegmented', text: noSeg + ' interview' + (noSeg > 1 ? 's have' : ' has') + ' no segment. Segment-specific themes cannot be seen without it.' });
  var verdict;
  if (N < MIN_INTERVIEWS) verdict = { level: 'too-few', text: N + ' interview' + (N === 1 ? '' : 's') + '. Below ' + MIN_INTERVIEWS + ' nothing here is a pattern yet; the emerging themes tell you what to probe next.' };
  else if (saturated && patterns.length) verdict = { level: 'enough', text: 'No new theme in the last ' + SATURATION_WINDOW + ' interviews and ' + patterns.length + ' pattern' + (patterns.length > 1 ? 's' : '') + ' across ' + N + '. Stop interviewing this segment and act on the top pattern.' };
  else if (saturated) verdict = { level: 'saturated-no-pattern', text: 'New themes have stopped appearing, but nothing reaches a pattern: the problems are spread thin. Either the segment is too broad, or the problem you are looking for is not theirs.' };
  else verdict = { level: 'keep-going', text: newInWindow + ' new theme' + (newInWindow === 1 ? '' : 's') + ' in the last ' + SATURATION_WINDOW + ' interviews. Keep going; re-run after every two or three.' };
  return { question: String(cfg.question || ''), interviews: N, segments: segmentsSeen, themes: rows, patterns: patterns.map(function (p) { return p.theme; }),
    saturation: { window: SATURATION_WINDOW, newThemesInWindow: newInWindow, saturated: saturated, perInterview: newPerInterview }, findings: findings, verdict: verdict,
    rules: { MIN_INTERVIEWS: MIN_INTERVIEWS, PATTERN_SHARE: PATTERN_SHARE, PATTERN_MIN: PATTERN_MIN, SATURATION_WINDOW: SATURATION_WINDOW, SEGMENT_CONCENTRATION: SEGMENT_CONCENTRATION } };
}

function run(cfg) { return synthesise(cfg); }
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const pct = (v) => v == null ? '-' : Math.round(v * 100) + '%';
function render(r) {
  const L = [];
  L.push(`THEMES across ${r.interviews} interviews${r.question ? ' - ' + r.question : ''} (segments: ${Object.keys(r.segments).map((s) => s + ' ' + r.segments[s]).join(', ')})`);
  r.themes.forEach((t) => {
    L.push(`  ${t.status.toUpperCase().padEnd(8)} ${t.theme}: ${t.interviews} of ${r.interviews} (${pct(t.share)}), severity ${t.meanSeverity == null ? '-' : t.meanSeverity.toFixed(1)}, priority ${t.priority.toFixed(2)}${t.wouldPay ? ', ' + t.wouldPay + ' would pay' : ''}${t.segmentSpecific ? ', mostly ' + t.segmentSpecific : ''}`);
    if (t.quotes.length) L.push(`           "${t.quotes[0].text}" (${t.quotes[0].id})`);
    if (t.workarounds.length) L.push(`           workarounds: ${t.workarounds.join('; ')}`);
  });
  L.push('');
  L.push(`SATURATION: ${r.saturation.perInterview.map((x) => x.id + ' +' + x.newThemes).join(', ')}; ${r.saturation.newThemesInWindow} new in the last ${r.saturation.window}${r.saturation.saturated ? ' - saturated' : ''}`);
  r.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
  L.push(`${r.verdict.level.toUpperCase()}: ${r.verdict.text}`);
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented interviews for Fieldnote, an invented scheduling app.
function iv(id, segment, notes) { return { id, segment, notes: notes.map((n) => ({ theme: n[0], severity: n[1], quote: n[2], workaround: n[3], wouldPay: n[4] })) }; }
const DEMO = {
  question: 'Why do small contractors lose jobs they already won?',
  interviews: [
    iv('I-01', 'owner-operator', [['double booking', 3, 'Two crews showed up at the same house. Lost the second job.', 'whiteboard photo on WhatsApp', true], ['late invoices', 2, 'I invoice on Sundays, if I remember.'], ['no-shows', 2, null, 'text the night before']]),
    iv('I-02', 'owner-operator', [['double booking', 3, null, 'one person owns the calendar'], ['quoting takes too long', 2, 'A quote takes me an evening.']]),
    iv('I-03', 'small-crew', [['double booking', 2], ['no-shows', 3, 'A no-show is a wasted morning for two guys.', 'reminder call'], ['late invoices', 2]]),
    iv('I-04', 'small-crew', [['crew does not know the plan', 3, 'They call me at 7am to ask where they are going.', 'group text at 6:30'], ['no-shows', 2], ['double booking', 3, null, null, true]]),
    iv('I-05', 'small-crew', [['crew does not know the plan', 2], ['double booking', 3], ['parts not on the truck', 2, 'Second trip to the supplier kills the margin.']]),
    iv('I-06', 'owner-operator', [['late invoices', 3, 'Found $4k I never invoiced.', 'spreadsheet'], ['double booking', 2]]),
    iv('I-07', 'small-crew', [['crew does not know the plan', 3], ['no-shows', 1]]),
    iv('I-08', 'owner-operator', [['double booking', 3], ['quoting takes too long', 1]]),
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
    console.log('(no config - demo: eight invented interviews with contractors in two segments)\n');
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

module.exports = { run, synthesise, MIN_INTERVIEWS, PATTERN_SHARE, PATTERN_MIN, SATURATION_WINDOW, SEGMENT_CONCENTRATION };
