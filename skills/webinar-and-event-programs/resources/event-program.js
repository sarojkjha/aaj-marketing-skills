#!/usr/bin/env node
/*
 * AAJ Webinar & Event Programs — engine
 * Part of the "webinar-and-event-programs" Agent Skill.
 *
 * AAJ's position: a webinar or event is a pipeline instrument, not a
 * calendar entry. Plan it backwards from the pipeline it has to create,
 * using your own conversion rates (the engine supplies none), check the
 * run-of-show before invitations go out, and read the result on meetings
 * and pipeline against cost - never on registrations.
 *
 * USAGE
 *   node event-program.js                    # demo
 *   node event-program.js '<json-config>'    # your own
 *   node event-program.js --help
 *
 * CONFIG (JSON) - "plan", "runOfShow", "readout": any or all
 *
 *   {
 *     "plan": {
 *       "pipelineTarget": 150000,          // opportunity value the event must create
 *       "avgDealValue": 15000,             // your average opportunity value
 *       "meetingToOppRate": 0.5,           // share of booked meetings that become opportunities (your history)
 *       "attendeeToMeetingRate": 0.1,      // share of live attendees who book a meeting (your history)
 *       "showRate": 0.4,                   // attendees / registrations at your last events
 *       "reachableRegistrations": 350,     // registrations you can realistically get from your list + partners + paid
 *       "costs": { "platform": 400, "promotion": 2500, "production": 800, "peopleHours": 40, "hourlyCost": 90 }
 *     },
 *     "runOfShow": {                        // true when done
 *       "topicIsBuyerProblem": true, "promotionLive14DaysOut": true, "dryRun": false,
 *       "recordingAndOnDemandPage": true, "followUpSequenceWritten": false,
 *       "salesHandoffAgreed": false, "questionOrPollPlanned": true, "singleCta": true
 *     },
 *     "readout": {
 *       "registrations": 320, "attendees": 121, "onDemandViews": 64,
 *       "meetingsBooked": 14, "opportunities": 6, "pipelineCreated": 84000,
 *       "winRate": 0.25,                    // your win rate, to turn pipeline into expected revenue
 *       "cost": 7300,
 *       "followUpHours": 20,               // hours after the event the first follow-up went out
 *       "targetReturn": 3                  // expected revenue / cost you need to call it a repeat (default 3, an engine rule)
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
var TARGET_RETURN_DEFAULT = 3;   // expected revenue must be this multiple of cost for a "repeat" (engine rule; override with readout.targetReturn)
var MIN_MEETINGS = 5;            // below this many meetings the readout is too early to judge (engine rule)
var FOLLOW_UP_HOURS_MAX = 24;    // first follow-up later than this is flagged (AAJ's rule: the follow-up is the real event)
var FEASIBLE_RATIO = 1;          // reachable / needed registrations at or above this: feasible
var STRETCH_RATIO = 0.5;         // ... at or above this: stretch; below: not feasible (engine rule)
var RUN_OF_SHOW = [
  { id: 'topicIsBuyerProblem', label: 'Topic is a buyer problem, not a product tour', why: 'People give an hour to a problem they have this quarter, not to a demo.' },
  { id: 'promotionLive14DaysOut', label: 'Promotion live at least two weeks out', why: 'Registrations come from repeated invitations across your list, partners and the speakers\' own audiences.' },
  { id: 'dryRun', label: 'Dry run done on the real platform', why: 'Audio, screen share, polls and the handoff between speakers, tested once.' },
  { id: 'recordingAndOnDemandPage', label: 'Recording and on-demand page planned', why: 'Most registrants do not attend live; the recording is the event for them.' },
  { id: 'followUpSequenceWritten', label: 'Follow-up sequence written before the event', why: 'Attendees, no-shows and on-demand viewers each get a different first email within a day.' },
  { id: 'salesHandoffAgreed', label: 'Sales handoff agreed', why: 'Who calls whom, within what time, on what signal (question asked, poll answer, stayed to the end).' },
  { id: 'questionOrPollPlanned', label: 'A question or poll that qualifies', why: 'One question whose answer tells sales who to call first.' },
  { id: 'singleCta', label: 'One call to action', why: 'A single next step at the end, on screen, repeated in the follow-up.' },
];

function inputError(msg) { var e = new Error(msg); e.isInputError = true; return e; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function rate(v, name, missing) { if (isNum(v) && v > 0 && v <= 1) return v; missing.push(name); return null; }

function totalCost(c) {
  c = c || {};
  var fixed = ['platform', 'promotion', 'production', 'venue', 'catering', 'travel', 'speakers', 'other'].reduce(function (a, k) { return a + (isNum(c[k]) ? c[k] : 0); }, 0);
  var people = isNum(c.peopleHours) && isNum(c.hourlyCost) ? c.peopleHours * c.hourlyCost : 0;
  return { total: fixed + people, fixed: fixed, people: people };
}

function plan(p) {
  p = p || {};
  if (!isNum(p.pipelineTarget) || p.pipelineTarget <= 0) throw inputError('"plan.pipelineTarget" must be greater than 0.');
  if (!isNum(p.avgDealValue) || p.avgDealValue <= 0) throw inputError('"plan.avgDealValue" must be greater than 0.');
  var missing = [];
  var m2o = rate(p.meetingToOppRate, 'meetingToOppRate', missing);
  var a2m = rate(p.attendeeToMeetingRate, 'attendeeToMeetingRate', missing);
  var show = rate(p.showRate, 'showRate', missing);
  var findings = [];
  if (missing.length) findings.push({ level: 'fix', id: 'rates-missing', text: 'No rate for ' + missing.join(', ') + '. This engine supplies no defaults: use your last event, or a partner\'s, and label it as an assumption.' });
  var opps = Math.ceil(p.pipelineTarget / p.avgDealValue);
  var meetings = m2o ? Math.ceil(opps / m2o) : null;
  var attendees = meetings !== null && a2m ? Math.ceil(meetings / a2m) : null;
  var registrations = attendees !== null && show ? Math.ceil(attendees / show) : null;
  var cost = totalCost(p.costs);
  var reach = isNum(p.reachableRegistrations) && p.reachableRegistrations > 0 ? p.reachableRegistrations : null;
  var ratio = registrations && reach ? reach / registrations : null;
  var verdict;
  if (registrations === null) verdict = { level: 'incomplete', text: 'Fill the missing rates to size the room.' };
  else if (ratio === null) verdict = { level: 'sized', text: 'You need ' + registrations.toLocaleString('en-US') + ' registrations. Add reachableRegistrations to see whether you can fill it.' };
  else if (ratio >= FEASIBLE_RATIO) verdict = { level: 'feasible', text: 'You can reach the registrations this target needs.' };
  else if (ratio >= STRETCH_RATIO) verdict = { level: 'stretch', text: 'You can reach ' + Math.round(ratio * 100) + '% of the registrations needed. Either add a partner\'s audience, lower the target, or lift a rate you control (show rate through reminders; attendee-to-meeting through the offer).' };
  else verdict = { level: 'not-feasible', text: 'You can reach ' + Math.round(ratio * 100) + '% of the registrations needed. This target does not fit one event; plan a series, or pick a smaller target.' };
  // Where the funnel is thinnest: the step whose rate multiplies the room the most is the one worth lifting.
  var lever = null;
  if (m2o && a2m && show) {
    var steps = [{ id: 'showRate', v: show }, { id: 'attendeeToMeetingRate', v: a2m }, { id: 'meetingToOppRate', v: m2o }];
    lever = steps.sort(function (a, b) { return a.v - b.v; })[0].id;
  }
  return { pipelineTarget: p.pipelineTarget, opportunitiesNeeded: opps, meetingsNeeded: meetings, attendeesNeeded: attendees, registrationsNeeded: registrations,
    reachableRegistrations: reach, reachRatio: ratio, cost: cost.total, costBreakdown: cost,
    costPerRegistration: registrations && cost.total ? cost.total / registrations : null,
    costPerAttendee: attendees && cost.total ? cost.total / attendees : null,
    costPerMeeting: meetings && cost.total ? cost.total / meetings : null,
    pipelinePerDollar: cost.total ? p.pipelineTarget / cost.total : null,
    weakestStep: lever, verdict: verdict, findings: findings, missing: missing };
}

function checkRunOfShow(c) {
  c = c || {};
  var items = RUN_OF_SHOW.map(function (t) { return { id: t.id, label: t.label, why: t.why, done: c[t.id] === true }; });
  var missing = items.filter(function (t) { return !t.done; }).map(function (t) { return t.id; });
  return { items: items, missing: missing, ready: missing.length === 0 };
}

function readout(r) {
  r = r || {};
  var regs = isNum(r.registrations) ? r.registrations : null;
  var att = isNum(r.attendees) ? r.attendees : null;
  var onDemand = isNum(r.onDemandViews) ? r.onDemandViews : null;
  var meetings = isNum(r.meetingsBooked) ? r.meetingsBooked : 0;
  var opps = isNum(r.opportunities) ? r.opportunities : null;
  var pipe = isNum(r.pipelineCreated) ? r.pipelineCreated : 0;
  var cost = isNum(r.cost) && r.cost > 0 ? r.cost : null;
  if (!cost) throw inputError('"readout.cost" must be greater than 0. Include people time.');
  var win = isNum(r.winRate) && r.winRate > 0 && r.winRate <= 1 ? r.winRate : null;
  var target = isNum(r.targetReturn) && r.targetReturn > 0 ? r.targetReturn : TARGET_RETURN_DEFAULT;
  var findings = [];
  var showRate = regs && att !== null ? att / regs : null;
  var reached = (att || 0) + (onDemand || 0);
  if (onDemand === null) findings.push({ level: 'improve', id: 'no-on-demand', text: 'No on-demand views given. If there is no recording page, the registrants who did not attend live were never reached.' });
  if (isNum(r.followUpHours) && r.followUpHours > FOLLOW_UP_HOURS_MAX) findings.push({ level: 'fix', id: 'slow-follow-up', text: 'First follow-up went out ' + r.followUpHours + ' hours after the event. AAJ\'s rule is within ' + FOLLOW_UP_HOURS_MAX + ' hours; the follow-up is the real event.' });
  else if (!isNum(r.followUpHours)) findings.push({ level: 'improve', id: 'follow-up-unknown', text: 'Say when the first follow-up went out; it is the step most programmes lose on.' });
  if (!win) findings.push({ level: 'improve', id: 'no-win-rate', text: 'No win rate given, so pipeline cannot be turned into expected revenue. The verdict uses pipeline against cost at ' + target + 'x instead.' });
  var expectedRevenue = win ? pipe * win : null;
  var returnRatio = expectedRevenue !== null ? expectedRevenue / cost : pipe / cost;
  var basis = expectedRevenue !== null ? 'expected revenue (pipeline x win rate)' : 'pipeline';
  var verdict;
  if (meetings < MIN_MEETINGS) verdict = { level: 'too-early', text: meetings + ' meetings booked so far. Below ' + MIN_MEETINGS + ' this engine does not judge; finish the follow-up sequence and read again.' };
  else if (returnRatio >= target) verdict = { level: 'repeat', text: basis.charAt(0).toUpperCase() + basis.slice(1) + ' is ' + returnRatio.toFixed(1) + 'x cost, at or above your ' + target + 'x target. Repeat, and test one change: topic, partner or offer.' };
  else if (returnRatio >= 1) verdict = { level: 'change', text: basis.charAt(0).toUpperCase() + basis.slice(1) + ' is ' + returnRatio.toFixed(1) + 'x cost: it pays for itself but misses your ' + target + 'x target. Change the weakest step before running again.' };
  else verdict = { level: 'stop', text: basis.charAt(0).toUpperCase() + basis.slice(1) + ' is ' + returnRatio.toFixed(1) + 'x cost. Stop this format for this audience unless the topic or the follow-up was clearly the failure.' };
  return { registrations: regs, attendees: att, onDemandViews: onDemand, reached: reached, showRate: showRate,
    meetingsBooked: meetings, opportunities: opps, pipelineCreated: pipe, cost: cost, winRate: win,
    costPerAttendee: att ? cost / att : null, costPerReached: reached ? cost / reached : null,
    costPerMeeting: meetings ? cost / meetings : null, costPerOpportunity: opps ? cost / opps : null,
    pipelinePerDollar: pipe / cost, expectedRevenue: expectedRevenue, returnRatio: returnRatio, returnBasis: basis, targetReturn: target,
    verdict: verdict, findings: findings };
}

function run(cfg) {
  cfg = cfg || {};
  if (!cfg.plan && !cfg.runOfShow && !cfg.readout) throw inputError('Give a "plan", a "runOfShow", a "readout", or any combination.');
  return {
    plan: cfg.plan ? plan(cfg.plan) : null,
    runOfShow: cfg.runOfShow ? checkRunOfShow(cfg.runOfShow) : null,
    readout: cfg.readout ? readout(cfg.readout) : null,
    rules: { TARGET_RETURN_DEFAULT: TARGET_RETURN_DEFAULT, MIN_MEETINGS: MIN_MEETINGS, FOLLOW_UP_HOURS_MAX: FOLLOW_UP_HOURS_MAX, FEASIBLE_RATIO: FEASIBLE_RATIO, STRETCH_RATIO: STRETCH_RATIO },
  };
}
/* aaj:core:end */

/* ─────────────────────────── render ─────────────────────────── */
const money = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-US');
const pct = (v) => v == null ? '-' : Math.round(v * 100) + '%';
function render(r) {
  const L = [];
  if (r.plan) {
    const p = r.plan;
    L.push('PLAN - backwards from ' + money(p.pipelineTarget) + ' of pipeline');
    L.push(`  Opportunities ${p.opportunitiesNeeded} -> meetings ${p.meetingsNeeded == null ? '?' : p.meetingsNeeded} -> live attendees ${p.attendeesNeeded == null ? '?' : p.attendeesNeeded} -> registrations ${p.registrationsNeeded == null ? '?' : p.registrationsNeeded}`);
    if (p.cost) L.push(`  Cost ${money(p.cost)} (people time ${money(p.costBreakdown.people)}): ${money(p.costPerRegistration)} per registration, ${money(p.costPerAttendee)} per attendee, ${money(p.costPerMeeting)} per meeting; ${p.pipelinePerDollar == null ? '-' : p.pipelinePerDollar.toFixed(1)} of pipeline per 1 spent`);
    if (p.weakestStep) L.push(`  Weakest step: ${p.weakestStep} - the rate most worth lifting.`);
    p.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
    L.push(`  ${p.verdict.level.toUpperCase()}: ${p.verdict.text}`);
    L.push('');
  }
  if (r.runOfShow) {
    const s = r.runOfShow;
    L.push(s.ready ? 'RUN OF SHOW - all eight items done' : `RUN OF SHOW - ${s.missing.length} of ${s.items.length} items missing`);
    s.items.filter((t) => !t.done).forEach((t) => L.push(`  ! ${t.label}: ${t.why}`));
    L.push('');
  }
  if (r.readout) {
    const x = r.readout;
    L.push('READOUT - on meetings and pipeline, not registrations');
    L.push(`  ${money(x.registrations)} registered, ${money(x.attendees)} attended live (${pct(x.showRate)}), ${x.onDemandViews == null ? 'no on-demand figure' : money(x.onDemandViews) + ' on demand'}; ${x.meetingsBooked} meetings, ${x.opportunities == null ? '-' : x.opportunities} opportunities, ${money(x.pipelineCreated)} pipeline`);
    L.push(`  Cost ${money(x.cost)}: ${money(x.costPerAttendee)} per attendee, ${money(x.costPerReached)} per person reached, ${money(x.costPerMeeting)} per meeting, ${money(x.costPerOpportunity)} per opportunity; ${x.pipelinePerDollar.toFixed(1)} of pipeline per 1 spent${x.expectedRevenue == null ? '' : '; expected revenue ' + money(x.expectedRevenue)}`);
    x.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : '-'} ${f.text}`));
    L.push(`  ${x.verdict.level.toUpperCase()}: ${x.verdict.text}`);
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */
// Illustrative only: invented event and numbers.
const DEMO = {
  plan: { pipelineTarget: 150000, avgDealValue: 15000, meetingToOppRate: 0.5, attendeeToMeetingRate: 0.1, showRate: 0.4, reachableRegistrations: 350,
    costs: { platform: 400, promotion: 2500, production: 800, peopleHours: 40, hourlyCost: 90 } },
  runOfShow: { topicIsBuyerProblem: true, promotionLive14DaysOut: true, dryRun: false, recordingAndOnDemandPage: true, followUpSequenceWritten: false, salesHandoffAgreed: false, questionOrPollPlanned: true, singleCta: true },
  readout: { registrations: 320, attendees: 121, onDemandViews: 64, meetingsBooked: 14, opportunities: 6, pipelineCreated: 84000, winRate: 0.25, cost: 7300, followUpHours: 44 },
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
    console.log('(no config - demo: one invented webinar planned backwards, its run-of-show, and the readout six weeks later)\n');
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

module.exports = { run, plan, checkRunOfShow, readout, totalCost, RUN_OF_SHOW, TARGET_RETURN_DEFAULT, MIN_MEETINGS, FOLLOW_UP_HOURS_MAX, FEASIBLE_RATIO, STRETCH_RATIO };
