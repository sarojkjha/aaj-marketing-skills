#!/usr/bin/env node
/*
 * AAJ Pilot-to-Contract - pilot plan engine
 * Part of the "pilot-to-contract" Agent Skill.
 *
 * Plans a pilot so it can turn into a contract: a dated timeline worked back
 * from the buyer's own budget decision and fiscal year, a quality check on
 * every success criterion (measurable, baselined, owned, agreed in writing),
 * deal-risk flags, a readiness verdict and the three fixes that matter most.
 * It also writes the plan out as a Markdown or CSV template.
 *
 * Every date and number comes from the founder. The engine holds no
 * benchmarks: no "typical" pilot length, procurement time or conversion rate.
 *
 * USAGE
 *   node pilot-plan.js                        # demo
 *   node pilot-plan.js '<json-config>'        # your own
 *   node pilot-plan.js '<json-config>' --md   # the plan as a Markdown template
 *   node pilot-plan.js '<json-config>' --csv  # the plan as CSV
 *   node pilot-plan.js --demo --md
 *   node pilot-plan.js --help
 *
 * CONFIG (JSON)
 *
 *   {
 *     "buyerType": "school" | "clinic" | "business",   // school or district / clinic or health system / business or design partner
 *     "buyerName": "Example district (fictional)",     // optional
 *     "today": "2026-10-10",                           // optional, YYYY-MM-DD
 *     "pilotStart": "2027-01-11",                      // kickoff date
 *     "pilotWeeks": 8,                                 // whole weeks, 1-52
 *     "budgetDecisionDate": "2027-03-15",              // when the buyer's budget for next year is decided
 *                                                      //   (founder-entered: the buyer's own date, not a rule)
 *     "fiscalYearStart": "2027-07-01",                 // optional: first day of the year the contract is paid from
 *     "procurementWeeks": 8,                           // founder's estimate: buyer's yes to signed contract
 *     "readoutWeeks": 1,                               // optional, default 1: pilot end to results readout
 *     "decisionWeeks": 2,                              // optional, default 2: readout to buyer's decision
 *     "criteria": [ {
 *         "metric": "Weekly active classrooms",
 *         "baseline": "0 (new product)",               // what it is today; "unknown" counts as missing
 *         "target": "5 of 6 classrooms active 4+ weeks",// must name a number
 *         "howMeasured": "Product usage log, weekly export",
 *         "dataOwner": "District literacy coordinator",
 *         "agreedInWriting": true,
 *         "weeksToSignal": 4                           // optional: weeks before this metric can show a change
 *     } ],
 *     "evidenceNeeded": "usage" | "feedback" | "outcome-comparison" | "formal-study",
 *     "championNamed": true,
 *     "economicBuyerInvolved": false,                  // the person who signs or owns the budget is in the plan
 *     "conversionTerms": { "priceAfterPilot": true, "startDate": false, "ifCriteriaMet": false },
 *                                                      //   or true / false for all three
 *     "pilotPrice": "free" | "paid" | "discounted",
 *     "seats": 6,                                      // seats, classrooms or sites in the pilot
 *     "seatUnit": "classrooms",                        // optional label
 *     "rolloutSeats": 40                               // optional: seats the full contract would cover
 *   }
 *
 * The engine reports gaps instead of refusing to run: a plan with a hole in
 * it is a finding to fix, not an error. It refuses only input it cannot read
 * (a missing or impossible date, a pilot length that is not whole weeks).
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - copied verbatim into aajconsult.com/tools/pilot-to-contract-planner.
   If this block changes, re-copy it there; the site's verify script runs the same cases. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

// Rules of this engine, stated where they are used so a reader can argue with them.
// They are planning defaults the founder can change, not benchmarks.
const MAX_CRITERIA = 3;          // more than this and nobody can say whether the pilot passed
const DEFAULT_READOUT_WEEKS = 1; // pilot end to results readout, unless the founder says otherwise
const DEFAULT_DECISION_WEEKS = 2;// readout to the buyer's decision, unless the founder says otherwise
const BUYERS = {
  school:   { label: 'School or district', buyer: 'district', signer: 'the superintendent, business office or board' },
  clinic:   { label: 'Clinic or health system', buyer: 'health system', signer: 'the budget holder or administrator who signs' },
  business: { label: 'Business or design partner', buyer: 'design partner', signer: 'the budget owner who signs' },
};
const EVIDENCE = {
  'usage': 'Usage data',
  'feedback': 'User feedback',
  'outcome-comparison': 'Outcome comparison (before and after, or against a comparison group)',
  'formal-study': 'A formal study',
};
const PRICES = ['free', 'paid', 'discounted'];
// Words in a target or metric that usually mean the change shows up after a pilot ends.
const SLOW = /\b(end[- ]of[- ]year|annual|yearly|year[- ]over[- ]year|state (test|assessment|exam)s?|graduation|renewal)\b/i;
const UNKNOWN = /^(unknown|tbd|tbc|n\/?a|none|-|\?+|not sure|later)$/i;

// Highest first: which finding to fix first when there are many.
const PRIORITY = [
  'no-pilot-dates', 'readout-after-budget', 'readout-after-procurement', 'decision-after-budget', 'decision-after-procurement',
  'no-budget-date', 'no-economic-buyer', 'free-no-terms', 'no-conversion-terms', 'no-criteria',
  'criteria-not-agreed', 'criteria-not-measurable', 'criteria-too-slow', 'evidence-no-baseline', 'no-champion',
  'evidence-study', 'criteria-no-baseline', 'terms-partial', 'too-many-criteria', 'criteria-no-owner',
  'criteria-slow-words', 'pilot-covers-rollout', 'no-fiscal-year', 'fy-before-pilot', 'start-in-past',
];

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (v) => str(v).length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);
const DAY = 86400000;

function parseDate(v) {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt : null;
}
const iso = (d) => (d ? d.toISOString().slice(0, 10) : '');
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const daysBetween = (a, b) => Math.round((b - a) / DAY);

function optDate(cfg, field) {
  if (cfg[field] === undefined || cfg[field] === null || cfg[field] === '') return null;
  const d = parseDate(cfg[field]);
  if (!d) die(`"${field}" must be a real date as YYYY-MM-DD.`);
  return d;
}
function weeks(cfg, field, dflt, min, max) {
  const v = cfg[field];
  if (v === undefined || v === null || v === '') {
    if (dflt === undefined) die(`Give "${field}": whole weeks.`);
    return dflt;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) die(`"${field}" must be a whole number of weeks from ${min} to ${max}.`);
  return n;
}
function terms(v) {
  if (v === true || v === false) return { priceAfterPilot: v, startDate: v, ifCriteriaMet: v };
  const o = v && typeof v === 'object' ? v : {};
  return { priceAfterPilot: o.priceAfterPilot === true, startDate: o.startDate === true, ifCriteriaMet: o.ifCriteriaMet === true };
}
const TERM_LABEL = { priceAfterPilot: 'the price after the pilot', startDate: 'the contract start date', ifCriteriaMet: 'what happens if the criteria are met' };

function checkCriterion(c, pilotWeeks) {
  const measurable = has(c.target) && /\d/.test(c.target) && has(c.howMeasured);
  const baselined = has(c.baseline) && !UNKNOWN.test(str(c.baseline));
  const owned = has(c.dataOwner);
  const agreed = c.agreedInWriting === true;
  const w = Number(c.weeksToSignal);
  const tooSlow = Number.isFinite(w) && w > pilotWeeks;
  const slowWords = !tooSlow && SLOW.test(c.metric + ' ' + c.target);
  const passed = [measurable, baselined, owned, agreed].filter(Boolean).length;
  return { measurable, baselined, owned, agreed, tooSlow, slowWords, passed };
}

function plan(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  const type = str(cfg.buyerType).toLowerCase();
  if (!BUYERS[type]) die('Give "buyerType": "school", "clinic" or "business".');
  const B = BUYERS[type];
  const start = optDate(cfg, 'pilotStart');
  if (!start) die('Give "pilotStart": the kickoff date as YYYY-MM-DD.');
  const pilotWeeks = weeks(cfg, 'pilotWeeks', undefined, 1, 52);
  const procurementWeeks = weeks(cfg, 'procurementWeeks', undefined, 0, 104);
  const readoutWeeks = weeks(cfg, 'readoutWeeks', DEFAULT_READOUT_WEEKS, 0, 26);
  const decisionWeeks = weeks(cfg, 'decisionWeeks', DEFAULT_DECISION_WEEKS, 0, 26);
  const budget = optDate(cfg, 'budgetDecisionDate');
  const fy = optDate(cfg, 'fiscalYearStart');
  const todayIn = optDate(cfg, 'today');
  const now = todayIn || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const price = str(cfg.pilotPrice).toLowerCase();
  if (!PRICES.includes(price)) die('Give "pilotPrice": "free", "paid" or "discounted".');
  const evidence = str(cfg.evidenceNeeded).toLowerCase();
  if (!EVIDENCE[evidence]) die('Give "evidenceNeeded": "usage", "feedback", "outcome-comparison" or "formal-study".');
  const seats = Number(cfg.seats);
  if (!Number.isFinite(seats) || seats <= 0) die('Give "seats": how many seats, classrooms or sites the pilot covers (a number above 0).');
  const rollout = cfg.rolloutSeats === undefined || cfg.rolloutSeats === null || cfg.rolloutSeats === '' ? null : Number(cfg.rolloutSeats);
  if (rollout !== null && (!Number.isFinite(rollout) || rollout <= 0)) die('"rolloutSeats" must be a number above 0, or left out.');

  const findings = [];
  const add = (level, id, area, text, action) => findings.push({ level, id, area, text, action });

  // ---------------------------------------------------------------- timeline
  const kickoff = start;
  const midpoint = addDays(start, Math.round((pilotWeeks * 7) / 2));
  const pilotEnd = addDays(start, pilotWeeks * 7);
  const readout = addDays(pilotEnd, readoutWeeks * 7);
  const decision = addDays(readout, decisionWeeks * 7);
  const signature = addDays(decision, procurementWeeks * 7);
  const procurementDeadline = fy ? addDays(fy, -procurementWeeks * 7) : null; // last yes that can still be signed by the fiscal year start
  const deadlines = [budget, procurementDeadline].filter(Boolean);
  const binding = deadlines.length ? new Date(Math.min(...deadlines.map((d) => d.getTime()))) : null;
  const latestReadout = binding ? addDays(binding, -decisionWeeks * 7) : null;
  const latestStart = latestReadout ? addDays(latestReadout, -(readoutWeeks + pilotWeeks) * 7) : null;
  const slackDays = binding ? daysBetween(decision, binding) : null;

  const milestones = [
    { id: 'kickoff', label: 'Kickoff', date: iso(kickoff), note: 'Criteria, data owners and conversion terms signed off before day one.' },
    { id: 'midpoint', label: 'Mid-point review', date: iso(midpoint), note: 'Check the numbers with the champion; fix adoption problems while there is time.' },
    { id: 'pilot-end', label: 'Pilot ends', date: iso(pilotEnd), note: `${pilotWeeks} week${pilotWeeks === 1 ? '' : 's'} after kickoff.` },
    { id: 'readout', label: 'Results readout', date: iso(readout), note: 'Results against each criterion, written in the buyer\'s language, easy for the champion to forward.' },
    { id: 'decision', label: 'Buyer decision', date: iso(decision), note: `Yes or no from ${B.signer}.` },
    { id: 'signature', label: 'Contract signature target', date: iso(signature), note: `${procurementWeeks} week${procurementWeeks === 1 ? '' : 's'} of procurement after the decision (your estimate).` },
  ];
  if (budget) milestones.push({ id: 'budget', label: 'Buyer budget decision', date: iso(budget), note: 'Entered by you: the buyer\'s own date.' });
  if (procurementDeadline) milestones.push({ id: 'procurement-window', label: 'Last decision date to sign by fiscal year start', date: iso(procurementDeadline), note: `Fiscal year start ${iso(fy)} minus ${procurementWeeks} weeks of procurement.` });
  if (fy) milestones.push({ id: 'fiscal-year', label: 'Fiscal year starts', date: iso(fy), note: 'Entered by you.' });
  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!budget && !fy) {
    add(type === 'business' ? 'improve' : 'fix', 'no-budget-date', 'timeline',
      `No budget decision date or fiscal year start. Without the ${B.buyer}'s own dates, there is no way to tell whether the readout lands while money can still be committed.`,
      `Ask your champion when next year's budget is decided and when the fiscal year starts, and enter both.`);
  } else if (!fy) {
    add('improve', 'no-fiscal-year', 'timeline', 'No fiscal year start, so the procurement window cannot be checked.',
      'Add the first day of the fiscal year the contract would be paid from.');
  } else if (!budget) {
    add('improve', 'no-budget-date', 'timeline', `No budget decision date, so only the procurement window is checked. The ${B.buyer} may commit next year's money earlier than that.`,
      'Ask your champion when next year\'s budget is decided, and enter it.');
  }
  if (budget && readout > budget) {
    add('fix', 'readout-after-budget', 'timeline',
      `The results readout (${iso(readout)}) lands after the budget decision (${iso(budget)}). The ${B.buyer} would be deciding next year's money before it sees the results.`,
      latestStart && latestStart >= now
        ? `Start by ${iso(latestStart)} or shorten the pilot, so the readout lands by ${iso(latestReadout)}.`
        : `Shorten the pilot, agree an interim readout before ${iso(budget)}, or plan for the following budget cycle.`);
  } else if (budget && decision > budget) {
    add('fix', 'decision-after-budget', 'timeline',
      `The readout lands before the budget decision, but the buyer's decision (${iso(decision)}) does not: ${daysBetween(budget, decision)} days late.`,
      `Book the decision meeting for no later than ${iso(budget)} now, while calendars are open.`);
  }
  if (procurementDeadline && readout > procurementDeadline) {
    add('fix', 'readout-after-procurement', 'timeline',
      `The readout (${iso(readout)}) lands after ${iso(procurementDeadline)}, the last date a yes can still be signed by the fiscal year start, given your ${procurementWeeks}-week procurement estimate.`,
      `Move the pilot earlier, start procurement paperwork (vendor forms, privacy and security review) during the pilot, or agree a later contract start date.`);
  } else if (procurementDeadline && decision > procurementDeadline) {
    add('fix', 'decision-after-procurement', 'timeline',
      `The decision (${iso(decision)}) comes after ${iso(procurementDeadline)}, so the contract cannot be signed by the fiscal year start on your procurement estimate.`,
      'Start the procurement paperwork during the pilot, so signature does not wait for the decision.');
  }
  if (fy && fy <= start) add('improve', 'fy-before-pilot', 'timeline', 'The fiscal year start you entered is before the pilot starts.',
    'Enter the start of the fiscal year the contract would be paid from, which is usually the next one.');
  if (start < now) add('improve', 'start-in-past', 'timeline', `The kickoff date (${iso(start)}) is in the past.`, 'Enter the real kickoff date, so the timeline is current.');

  // ---------------------------------------------------------------- criteria
  const criteria = arr(cfg.criteria).filter((c) => c && has(c.metric)).map((c) => ({
    metric: str(c.metric), baseline: str(c.baseline), target: str(c.target), howMeasured: str(c.howMeasured),
    dataOwner: str(c.dataOwner), agreedInWriting: c.agreedInWriting === true,
    weeksToSignal: c.weeksToSignal === undefined || c.weeksToSignal === null || c.weeksToSignal === '' ? null : Number(c.weeksToSignal),
  }));
  criteria.forEach((c) => { c.check = checkCriterion(c, pilotWeeks); });
  const list = (f) => criteria.filter(f).map((c) => `"${c.metric}"`).join(', ');
  if (!criteria.length) {
    add('fix', 'no-criteria', 'criteria', 'No success criteria. Without them, the pilot cannot pass, so it cannot convert; it just ends.',
      'Write one to three criteria with the champion: metric, baseline, target, how it is measured and who owns the data.');
  } else {
    if (criteria.some((c) => !c.check.agreed)) add('fix', 'criteria-not-agreed', 'criteria',
      `Not agreed in writing: ${list((c) => !c.check.agreed)}. Unwritten criteria can be redefined after the results come in.`,
      'Put the criteria in a one-page pilot plan and get the champion and the economic buyer to sign it before kickoff.');
    if (criteria.some((c) => !c.check.measurable)) add('fix', 'criteria-not-measurable', 'criteria',
      `Not measurable: ${list((c) => !c.check.measurable)}. A target needs a number and a stated way of counting it.`,
      'Give each target a number and say exactly how it is counted (which report, which survey, which log).');
    if (criteria.some((c) => c.check.tooSlow)) add('fix', 'criteria-too-slow', 'criteria',
      `Cannot move within ${pilotWeeks} weeks on your own estimate: ${list((c) => c.check.tooSlow)}.`,
      'Swap it for a leading measure that can move inside the pilot, or lengthen the pilot if the budget dates allow.');
    if (criteria.some((c) => c.check.slowWords)) add('improve', 'criteria-slow-words', 'criteria',
      `May only change after the pilot ends: ${list((c) => c.check.slowWords)}. Annual and end-of-year measures report after a short pilot is over.`,
      'Add how many weeks each one needs to show a change, or pick a measure that reports inside the pilot.');
    if (criteria.some((c) => !c.check.baselined)) {
      const needsComparison = evidence === 'outcome-comparison' || evidence === 'formal-study';
      add(needsComparison ? 'fix' : 'improve', needsComparison ? 'evidence-no-baseline' : 'criteria-no-baseline', 'criteria',
        `No baseline: ${list((c) => !c.check.baselined)}.` + (needsComparison ? ' The buyer wants an outcome comparison, and there is nothing to compare against.' : ' Without one, a good result can be argued away.'),
        'Record today\'s number for each metric before kickoff, from the buyer\'s own data where it exists.');
    }
    if (criteria.some((c) => !c.check.owned)) add('improve', 'criteria-no-owner', 'criteria',
      `No data owner: ${list((c) => !c.check.owned)}. Someone has to pull the number, and the buyer trusts its own data more than yours.`,
      'Name who owns each data source and confirm they will share it at the readout.');
    if (criteria.length > MAX_CRITERIA) add('improve', 'too-many-criteria', 'criteria',
      `${criteria.length} criteria. This engine flags more than ${MAX_CRITERIA}: with more, someone can always point at the one that missed.`,
      `Keep the ${MAX_CRITERIA} the economic buyer cares about most and report the rest as context.`);
  }

  // ---------------------------------------------------------------- evidence
  if (evidence === 'formal-study') {
    add('improve', 'evidence-study', 'evidence',
      'The buyer wants a formal study. A study needs its design agreed before it starts: the comparison group, who is in it and who analyses the results.',
      'Agree in writing what this pilot will produce (usage and outcome data) and, separately, who designs and runs the study and when it reports.');
  }

  // ---------------------------------------------------------------- deal
  const t = terms(cfg.conversionTerms);
  const missingTerms = Object.keys(t).filter((k) => !t[k]);
  if (cfg.economicBuyerInvolved !== true) add('fix', 'no-economic-buyer', 'deal',
    `No economic buyer involved. The champion can run the pilot, but ${B.signer} decides whether it becomes a contract.`,
    'Get the person who owns the budget to agree the criteria and attend the readout.');
  if (cfg.championNamed !== true) add('fix', 'no-champion', 'deal',
    'No named champion. Someone inside has to chase usage during the pilot and forward the results after it.',
    'Name the person who owns the problem and will speak for the pilot inside.');
  if (missingTerms.length === 3) {
    if (price === 'free') add('fix', 'free-no-terms', 'deal',
      'A free pilot with no conversion terms. Nothing says what happens when it works, so it can run as free use indefinitely.',
      'Agree the price after the pilot, the contract start date and what happens if the criteria are met, before kickoff.');
    else add('fix', 'no-conversion-terms', 'deal',
      'No conversion terms agreed. A successful pilot still has to be negotiated from scratch.',
      'Agree the price after the pilot, the contract start date and what happens if the criteria are met, before kickoff.');
  } else if (missingTerms.length) {
    add('improve', 'terms-partial', 'deal', `Conversion terms do not yet cover ${missingTerms.map((k) => TERM_LABEL[k]).join(' or ')}.`,
      `Add ${missingTerms.map((k) => TERM_LABEL[k]).join(' and ')} to the pilot plan.`);
  }
  if (rollout !== null && rollout <= seats) add('improve', 'pilot-covers-rollout', 'deal',
    `The pilot covers ${seats} ${str(cfg.seatUnit) || 'seats'}, and the full contract ${rollout}. There is nothing new to buy after the pilot.`,
    'Scope the pilot to part of the rollout, so the contract is the step up.');

  // ---------------------------------------------------------------- verdict
  const rank = (f) => { const i = PRIORITY.indexOf(f.id); return i < 0 ? PRIORITY.length : i; };
  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'fix' ? -1 : 1) || rank(a) - rank(b));
  const fixes = findings.filter((f) => f.level === 'fix').length;
  const datesBroken = findings.some((f) => /^(readout|decision)-after-/.test(f.id));
  const verdict = datesBroken
    ? { level: 'replan', headline: 'Re-plan the dates', body: `The results arrive after the ${B.buyer} can commit next year's money. Fix the timeline before anything else.` }
    : fixes
      ? { level: 'fix', headline: 'Fix before kickoff', body: `${fixes} gap${fixes > 1 ? 's' : ''} would let a successful pilot end without a contract. Close them before day one.` }
      : { level: 'ready', headline: 'Ready to propose', body: binding
        ? 'The dates fit the buyer\'s calendar, the criteria can be judged, and the path to a contract is agreed.'
        : 'The criteria can be judged and the path to a contract is agreed. Add the buyer\'s budget date to check the timeline.' };

  const notes = [];
  if (type === 'school') notes.push('Student data: ask what the district\'s privacy and security review needs before students use the product, start it before kickoff, and check your obligations with counsel.');
  if (type === 'clinic') notes.push('Patient data or care decisions: ask what the health system\'s privacy, security and clinical reviews need, start them before kickoff, and check your obligations with counsel.');
  if (type === 'business') notes.push('Design partners: write down what each side gets (for example, a price lock for them, and feedback and reference rights for you) alongside the criteria.');

  return {
    buyerType: type, buyerLabel: B.label, buyerName: str(cfg.buyerName),
    pilot: { start: iso(start), weeks: pilotWeeks, price, seats, seatUnit: str(cfg.seatUnit), rolloutSeats: rollout },
    inputs: { budgetDecisionDate: iso(budget), fiscalYearStart: iso(fy), procurementWeeks, readoutWeeks, decisionWeeks, today: iso(now) },
    timeline: { milestones, latestStart: iso(latestStart), latestReadout: iso(latestReadout), bindingDeadline: iso(binding), slackDays },
    criteria, evidence: { level: evidence, label: EVIDENCE[evidence] },
    deal: { championNamed: cfg.championNamed === true, economicBuyerInvolved: cfg.economicBuyerInvolved === true, terms: t },
    findings, topFixes: findings.slice(0, 3).map((f) => ({ id: f.id, text: f.action })),
    verdict, notes,
    rules: { MAX_CRITERIA, DEFAULT_READOUT_WEEKS, DEFAULT_DECISION_WEEKS },
  };
}

// ---- the plan as a template: Markdown and CSV, the same in the tool and the CLI
const yn = (b) => (b ? 'Yes' : 'No');
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\n/g, ' ');

function toMarkdown(r) {
  const L = [];
  L.push(`# Pilot plan${r.buyerName ? ': ' + r.buyerName : ''}`, '');
  L.push(`**Buyer type:** ${r.buyerLabel}  `);
  L.push(`**Pilot:** ${r.pilot.weeks} weeks from ${r.pilot.start}, ${r.pilot.seats} ${r.pilot.seatUnit || 'seats'}, ${r.pilot.price}  `);
  L.push(`**Evidence the buyer needs:** ${r.evidence.label}  `);
  L.push(`**Verdict:** ${r.verdict.headline}. ${r.verdict.body}`, '');
  L.push('## Timeline', '', '| Milestone | Date | Note |', '|---|---|---|');
  r.timeline.milestones.forEach((m) => L.push(`| ${cell(m.label)} | ${m.date} | ${cell(m.note)} |`));
  if (r.timeline.latestStart) L.push('', `Latest kickoff that still lands the decision by ${r.timeline.bindingDeadline}: **${r.timeline.latestStart}**.`);
  L.push('', '## Success criteria', '', '| Metric | Baseline | Target | How measured | Data owner | Agreed in writing |', '|---|---|---|---|---|---|');
  if (!r.criteria.length) L.push('| (add a criterion) | | | | | |');
  r.criteria.forEach((c) => L.push(`| ${cell(c.metric)} | ${cell(c.baseline) || '-'} | ${cell(c.target) || '-'} | ${cell(c.howMeasured) || '-'} | ${cell(c.dataOwner) || '-'} | ${yn(c.agreedInWriting)} |`));
  L.push('', '## Conversion terms (agree before kickoff)', '');
  Object.keys(r.deal.terms).forEach((k) => L.push(`- [${r.deal.terms[k] ? 'x' : ' '}] ${TERM_LABEL[k].replace(/^./, (c) => c.toUpperCase())}`));
  L.push('', '## People', '', `- Champion named: ${yn(r.deal.championNamed)}`, `- Economic buyer involved: ${yn(r.deal.economicBuyerInvolved)}`);
  if (r.topFixes.length) { L.push('', '## The three fixes that matter most', ''); r.topFixes.forEach((f, i) => L.push(`${i + 1}. ${f.text}`)); }
  if (r.findings.length) { L.push('', '## All findings', ''); r.findings.forEach((f) => L.push(`- **${f.level === 'fix' ? 'Fix' : 'Improve'}** (${f.area}): ${f.text}`)); }
  if (r.notes.length) { L.push('', '## Check before kickoff', ''); r.notes.forEach((n) => L.push(`- ${n}`)); }
  L.push('', '## Sign-off', '', '| Role | Name | Date |', '|---|---|---|', '| Champion | | |', '| Economic buyer | | |', '| Vendor | | |');
  L.push('', `_Dates and estimates entered by the founder. Planning defaults: ${r.inputs.readoutWeeks} week(s) to readout, ${r.inputs.decisionWeeks} week(s) to decision. Built with the AAJ Pilot-to-Contract Planner._`);
  return L.join('\n') + '\n';
}

function toCSV(r) {
  const q = (v) => { let s = String(v == null ? '' : v); if (/^[=+@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['section', 'item', 'date', 'baseline', 'target', 'how_measured', 'data_owner', 'agreed_in_writing', 'note']];
  r.timeline.milestones.forEach((m) => rows.push(['timeline', m.label, m.date, '', '', '', '', '', m.note]));
  r.criteria.forEach((c) => rows.push(['criterion', c.metric, '', c.baseline, c.target, c.howMeasured, c.dataOwner, yn(c.agreedInWriting),
    ['measurable', 'baselined', 'owned', 'agreed'].filter((k) => !c.check[k]).map((k) => 'not ' + k).join('; ')]));
  Object.keys(r.deal.terms).forEach((k) => rows.push(['conversion term', TERM_LABEL[k], '', '', '', '', '', yn(r.deal.terms[k]), '']));
  r.findings.forEach((f) => rows.push(['finding', f.id, '', '', '', '', '', '', (f.level === 'fix' ? 'FIX: ' : 'IMPROVE: ') + f.text]));
  rows.push(['verdict', r.verdict.headline, '', '', '', '', '', '', r.verdict.body]);
  return rows.map((row) => row.map(q).join(',')).join('\n') + '\n';
}
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
  const L = [];
  L.push('');
  L.push(`AAJ - PILOT-TO-CONTRACT PLAN${r.buyerName ? ': ' + r.buyerName : ''} (${r.buyerLabel})`);
  L.push('-'.repeat(70));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  L.push('');
  L.push('TIMELINE');
  r.timeline.milestones.forEach((m) => L.push(`  ${m.date}  ${m.label.padEnd(48)}`));
  if (r.timeline.latestStart) L.push(`  Latest kickoff that lands the decision by ${r.timeline.bindingDeadline}: ${r.timeline.latestStart}` +
    (r.timeline.slackDays !== null ? `  (slack: ${r.timeline.slackDays} days)` : ''));
  L.push('');
  L.push('CRITERIA                                   measurable baselined owned agreed');
  if (!r.criteria.length) L.push('  (none)');
  r.criteria.forEach((c) => {
    const k = c.check, m = (b) => (b ? '  yes     ' : '  NO      ');
    L.push(`  ${c.metric.slice(0, 40).padEnd(40)}${m(k.measurable)}${m(k.baselined)}${m(k.owned)}${m(k.agreed)}`);
  });
  L.push('');
  L.push(`EVIDENCE NEEDED: ${r.evidence.label}`);
  if (r.topFixes.length) {
    L.push('');
    L.push('THE THREE FIXES THAT MATTER MOST');
    r.topFixes.forEach((f, i) => L.push(`  ${i + 1}. ${f.text}`));
  }
  if (r.findings.length) {
    L.push('');
    L.push('ALL FINDINGS');
    r.findings.forEach((f) => L.push(`  ${f.level === 'fix' ? '!' : '-'}  [${f.area}] ${f.text}`));
  }
  r.notes.forEach((n) => { L.push(''); L.push('NOTE  ' + n); });
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Illustrative only: a fictional district and product. Every date and estimate is an
// example input a founder would replace with the buyer's own, not a benchmark.
const DEMO = {
  buyerType: 'school', buyerName: 'Example Unified School District (fictional)', today: '2026-10-10',
  pilotStart: '2027-01-11', pilotWeeks: 10,
  budgetDecisionDate: '2027-03-15', fiscalYearStart: '2027-07-01', procurementWeeks: 8,
  criteria: [
    { metric: 'Weekly active classrooms', baseline: '0 (new product)', target: '5 of 6 classrooms active in at least 6 of 10 weeks',
      howMeasured: 'Product usage log, weekly export', dataOwner: 'Vendor, shared weekly with the literacy coordinator', agreedInWriting: true, weeksToSignal: 2 },
    { metric: 'Reading screener: students at benchmark', baseline: 'unknown', target: '10 percentage points more students at benchmark',
      howMeasured: "District's own mid-year screener", dataOwner: 'District assessment office', agreedInWriting: false, weeksToSignal: 12 },
    { metric: 'Teacher feedback', baseline: 'n/a', target: 'Teachers like it', howMeasured: '', dataOwner: '', agreedInWriting: false },
    { metric: 'End-of-year state test scores', baseline: 'Last year\'s results', target: 'Up 5 points', howMeasured: 'State assessment report',
      dataOwner: 'District assessment office', agreedInWriting: false },
  ],
  evidenceNeeded: 'outcome-comparison',
  championNamed: true, economicBuyerInvolved: false,
  conversionTerms: { priceAfterPilot: true, startDate: false, ifCriteriaMet: false },
  pilotPrice: 'free', seats: 6, seatUnit: 'classrooms', rolloutSeats: 40,
};

function main() {
  const args = process.argv.slice(2);
  const fmt = args.includes('--md') ? 'md' : args.includes('--csv') ? 'csv' : 'text';
  const rest = args.filter((a) => a !== '--md' && a !== '--csv');
  const arg = rest[0] === '--demo' ? undefined : rest[0];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    if (fmt === 'text') console.log('(no config - demo: a fictional district; the readout lands after its budget decision, no economic buyer, a free pilot with partial terms, four criteria with gaps)');
  }
  try {
    const r = plan(cfg);
    console.log(fmt === 'md' ? toMarkdown(r) : fmt === 'csv' ? toCSV(r) : render(r));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { plan, toMarkdown, toCSV, checkCriterion, MAX_CRITERIA, DEFAULT_READOUT_WEEKS, DEFAULT_DECISION_WEEKS, DEMO };
