#!/usr/bin/env node
/*
 * AAJ Referral Program Design - referral economics engine
 * Part of the "referral-program-design" Agent Skill.
 *
 * Runs one period of a referral program as a funnel - customers asked, customers
 * who refer, referrals, referred customers - and prices it: referral CAC, the most
 * you can pay in rewards before referral costs more than the channel it replaces,
 * payback, LTV:CAC, and the k-factor the program adds. Every rate is yours: your
 * measured numbers, or assumptions you mark as assumptions. The engine holds no
 * benchmarks.
 *
 * USAGE
 *   node referral-economics.js                 # demo (fictional example inputs)
 *   node referral-economics.js '<json-config>' # your own
 *   node referral-economics.js --help
 *
 * CONFIG (JSON) - rates are shares between 0 and 1, money in one currency
 *
 *   {
 *     "period": "quarter",              // label only
 *     "currency": "$",                  // label only (default "$")
 *     "customers": 400,                 // active customers at the start of the period
 *     "shareAsked": 0.30,               // share of them you will ask (promoters past a success moment)
 *     "askedToReferrer": 0.25,          // share of those asked who refer at least once
 *     "referralsPerReferrer": 2,        // referrals (intros, invites accepted) per referrer
 *     "referralToCustomer": 0.10,       // share of referrals who become paying customers
 *     "rewardReferrer": 150,            // your cost of one referrer reward (cash, or the cost of a credit)
 *     "rewardFriend": 150,              // your cost of the new customer's reward (0 = one-sided)
 *     "referrerPaidOn": "customer",     // "customer" (paid when the friend pays) | "referral" (paid per referral)
 *     "fixedCost": 3000,                // program cost in the period: tool, staff time, swag
 *     "ltv": 4800,                      // gross-margin lifetime value of a customer (your figure)
 *     "referredLtv": 4800,              // optional: if you have MEASURED referred customers separately
 *     "otherCac": 1200,                 // fully loaded CAC of the channel referral would replace
 *     "monthlyMargin": 200,             // gross margin per customer per month (for payback)
 *     "monthlySpend": 400,              // optional: what a customer pays per month (to size rewards)
 *     "assumed": ["askedToReferrer", "referralToCustomer"],   // inputs that are guesses, not data
 *     "flags": {                        // optional: switches on the matching compliance pointers
 *       "healthcareProviders": false,   // referrers are healthcare providers (US Anti-Kickback Statute)
 *       "publicPosts": false,           // referrers post about you publicly (FTC Endorsement Guides)
 *       "reviewsInvolved": false,       // any reward sits near a review request (FTC review rule, Google policy)
 *       "patientInfo": false            // stories or quotes could involve patients (HIPAA)
 *     }
 *   }
 *
 * The friend's reward is counted when the friend becomes a customer. Referred
 * customers are expected values, so they can be fractional.
 * Orientation, not legal advice: the pointers name the regulator's own text; check
 * the consequences for your program with counsel.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin - the referral economics core. If a browser tool ever embeds
   this engine, copy this block verbatim and guard it byte for byte. */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

const RATE_KEYS = ['shareAsked', 'askedToReferrer', 'referralToCustomer'];
const ASSUMABLE = ['customers', 'shareAsked', 'askedToReferrer', 'referralsPerReferrer', 'referralToCustomer', 'ltv', 'referredLtv', 'otherCac', 'monthlyMargin', 'fixedCost'];

// Compliance pointers, reused from AAJ's post "Referral Programs for Startups"
// (aajconsult.com/blog/referral-programs-for-startups). Pointers, not verdicts.
const POINTERS = {
  always: {
    title: 'Orientation, not legal advice',
    text: 'These pointers name the rules AAJ\'s referral post covers. Check what they mean for your program with counsel before launch.',
    url: 'https://aajconsult.com/blog/referral-programs-for-startups',
  },
  publicPosts: {
    title: 'FTC Endorsement Guides (16 CFR Part 255)',
    text: 'Payment, free or discounted products and prize chances are treated as a "material connection" that must be disclosed when the audience would not expect it. If referrers post publicly to earn a reward, make the disclosure easy.',
    url: 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255',
  },
  reviewsInvolved: {
    title: 'FTC rule on consumer reviews (16 CFR Part 465) and Google Maps content policy',
    text: 'The FTC rule bans incentives for reviews that express a particular sentiment; Google\'s policy prohibits incentives for any review and selective solicitation of positive ones. Keep referral rewards separate from review requests.',
    url: 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465',
    url2: 'https://support.google.com/contributionpolicy/answer/7400114',
  },
  healthcareProviders: {
    title: 'Anti-Kickback Statute (HHS Office of Inspector General)',
    text: 'HHS-OIG describes "remuneration" as anything of value. A credit or discount to a provider for steering business that may be billed to federal health care programs is a plausible risk: have a healthcare lawyer approve any incentive before launch, or run the program with no reward.',
    url: 'https://oig.hhs.gov/compliance/physician-education/fraud-abuse-laws/',
  },
  patientInfo: {
    title: 'HIPAA marketing authorization (45 CFR 164.501, 164.508(a)(3))',
    text: 'Using protected health information for marketing generally needs the patient\'s authorization. The simplest rule: ask for no patient information in referral messages or stories.',
    url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.508',
  },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

function model(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  const need = (k, opts) => {
    const v = num(cfg[k]);
    if (v === null) {
      if (opts && opts.optional) return null;
      die(`Give "${k}" as a number.`, opts && opts.hint);
    }
    if (v < 0) die(`"${k}" cannot be negative.`);
    if (RATE_KEYS.includes(k) && v > 1) die(`"${k}" is a share between 0 and 1, not a percentage.`, `Write ${v}% as ${v / 100}.`);
    return v;
  };

  const customers = need('customers', { hint: 'Active customers at the start of the period.' });
  if (customers <= 0) die('"customers" must be above zero.');
  const shareAsked = need('shareAsked');
  const askedToReferrer = need('askedToReferrer');
  const referralsPerReferrer = need('referralsPerReferrer');
  const referralToCustomer = need('referralToCustomer');
  const rewardReferrer = need('rewardReferrer', { optional: true }) || 0;
  const rewardFriend = need('rewardFriend', { optional: true }) || 0;
  const fixedCost = need('fixedCost', { optional: true });
  const ltv = need('ltv', { hint: 'Gross-margin lifetime value of a customer, from your own data.' });
  const referredLtv = need('referredLtv', { optional: true });
  const otherCac = need('otherCac', { hint: 'Fully loaded CAC of the channel the referred customers would otherwise come from.' });
  const monthlyMargin = need('monthlyMargin', { optional: true });
  const monthlySpend = need('monthlySpend', { optional: true });
  const paidOn = cfg.referrerPaidOn === undefined ? 'customer' : String(cfg.referrerPaidOn).toLowerCase();
  if (!['customer', 'referral'].includes(paidOn)) die('"referrerPaidOn" must be "customer" or "referral".');
  const assumed = (Array.isArray(cfg.assumed) ? cfg.assumed : []).map(String).filter((k) => ASSUMABLE.includes(k));
  const flags = cfg.flags && typeof cfg.flags === 'object' ? cfg.flags : {};

  // ---- the funnel
  const asked = customers * shareAsked;
  const referrers = asked * askedToReferrer;
  const referrals = referrers * referralsPerReferrer;
  const newCustomers = referrals * referralToCustomer;

  // ---- the cost
  const referrerRewards = (paidOn === 'referral' ? referrals : newCustomers) * rewardReferrer;
  const friendRewards = newCustomers * rewardFriend;
  const rewardCost = referrerRewards + friendRewards;
  const fixed = fixedCost === null ? 0 : fixedCost;
  const totalCost = rewardCost + fixed;

  const per = (x) => (newCustomers > 0 ? x / newCustomers : null);
  const referralCac = per(totalCost);
  const rewardPerCustomer = per(rewardCost);
  const fixedPerCustomer = per(fixed);
  const valueLtv = referredLtv === null ? ltv : referredLtv;

  // Break-even: the combined reward per referred customer at which referral CAC equals otherCac.
  const breakEvenRewardPerCustomer = newCustomers > 0 ? otherCac - fixed / newCustomers : null;
  // Holding the friend reward fixed, the most the referrer reward can be.
  let maxReferrerReward = null;
  if (breakEvenRewardPerCustomer !== null) {
    const room = breakEvenRewardPerCustomer - rewardFriend;
    maxReferrerReward = paidOn === 'referral' ? room * referralToCustomer : room;
  }

  const paybackMonths = referralCac !== null && monthlyMargin ? referralCac / monthlyMargin : null;
  const ltvToCac = referralCac ? valueLtv / referralCac : null;
  const savings = referralCac !== null ? (otherCac - referralCac) * newCustomers : null;

  // k contributed by the program: new customers per existing customer per period.
  const k = newCustomers / customers;
  const amplification = k < 1 ? 1 / (1 - k) : null;

  // ---- findings
  const findings = [];
  const add = (level, id, text) => findings.push({ level, id, text });

  if (newCustomers === 0) {
    add('fix', 'no-customers', 'With these rates the program produces no referred customers, so it has no CAC. Check that every rate is above zero.');
  } else {
    if (rewardPerCustomer > otherCac) {
      add('fix', 'reward-above-cac', `Rewards alone cost ${fmt(rewardPerCustomer)} per referred customer, more than the ${fmt(otherCac)} CAC they replace. Shrink the reward or pay it only when the friend pays.`);
    } else if (referralCac > otherCac) {
      add('fix', 'cac-above-other', `Referral CAC (${fmt(referralCac)}) is above the ${fmt(otherCac)} CAC of the channel it replaces. The fixed cost is spread over too few referred customers; widen the ask or cut the fixed cost.`);
    }
    if (referralCac >= valueLtv) {
      add('fix', 'cac-above-ltv', `Referral CAC (${fmt(referralCac)}) is at or above lifetime value (${fmt(valueLtv)}). Every referred customer loses money.`);
    }
  }
  if (paidOn === 'referral' && rewardReferrer > 0) {
    add('improve', 'paid-per-referral', `The referrer is paid per referral, not per customer, so each referred customer carries ${fmt(referralToCustomer > 0 ? rewardReferrer / referralToCustomer : rewardReferrer)} of referrer rewards. Paying when the friend becomes a customer ties cost to outcome.`);
  }
  if (rewardReferrer > 0 && rewardFriend === 0) {
    add('improve', 'one-sided', 'The reward is one-sided. For innovative products, a field experiment and four online experiments found rewarding both sides softened the drop in willingness to refer that a visible referrer reward caused (Dose and others, 2019, doi:10.1007/s11747-019-00635-z).');
  }
  if (monthlySpend !== null && Math.max(rewardReferrer, rewardFriend) > monthlySpend) {
    add('improve', 'reward-large', `A reward (${fmt(Math.max(rewardReferrer, rewardFriend))}) is larger than one month of customer spend (${fmt(monthlySpend)}). In a bank field experiment, larger rewards brought more referred customers but less profitable ones (Wolters, Schulze and Gedenk, 2020, doi:10.1287/mksc.2020.1242). AAJ's post suggests starting at a fraction of one month's spend and testing up only if referrals stay low.`);
  }
  if (shareAsked >= 1) {
    add('improve', 'ask-everyone', 'Every customer is asked. Ask customers who are getting value, at a success moment - promoters, renewals, a milestone reached - not the whole list at once.');
  }
  if (fixedCost === null) {
    add('improve', 'no-fixed-cost', 'No fixed cost given, so referral CAC counts rewards only. Staff time and tooling are real costs; add them as "fixedCost".');
  }
  if (referredLtv === null) {
    add('info', 'ltv-not-split', 'LTV is the same for referred and other customers. Research on a German bank found referred customers worth at least 16% more (Schmitt, Skiera and Van den Bulte, 2011), but that is a bank, not your product: measure your own referred cohort before you count on it.');
  }
  if (k >= 1) {
    add('info', 'k-above-one', `k is ${k.toFixed(2)} per period: on paper each customer brings in more than one. Networks saturate; re-measure before planning on compounding.`);
  }
  if (assumed.length) {
    add('info', 'assumptions', `These inputs are assumptions, not data: ${assumed.join(', ')}. Treat every output as a scenario and replace them with measured rates after the first period.`);
  }

  const pointers = [POINTERS.always];
  ['healthcareProviders', 'publicPosts', 'reviewsInvolved', 'patientInfo'].forEach((f) => { if (flags[f]) pointers.push(POINTERS[f]); });

  const fixes = findings.filter((f) => f.level === 'fix').length;
  const verdict = fixes === 0
    ? { level: 'go', headline: 'The economics work', body: 'Referral costs less per customer than the channel it replaces, at these inputs.' }
    : { level: 'fix', headline: 'Fix the economics first', body: `${fixes} issue${fixes > 1 ? 's' : ''} would make referral more expensive than the alternative.` };

  return {
    period: cfg.period ? String(cfg.period) : 'period',
    funnel: { customers, asked, referrers, referrals, newCustomers },
    cost: { referrerRewards, friendRewards, rewardCost, fixedCost: fixed, totalCost },
    unit: { referralCac, rewardPerCustomer, fixedPerCustomer, otherCac, ltv: valueLtv, ltvToCac, paybackMonths, savings },
    breakEven: { rewardPerCustomer: breakEvenRewardPerCustomer, maxReferrerReward, paidOn },
    loop: { k, amplification },
    assumed, findings, pointers, verdict,
  };
}

function fmt(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  const r = Math.round(v * 100) / 100;
  return (r < 0 ? '-' : '') + Math.abs(r).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r, cur) {
  const c = cur || '$';
  const m = (v) => (v === null || !Number.isFinite(v) ? '-' : (v < 0 ? '-' : '') + c + fmt(Math.abs(v)));
  const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString('en-US');
  const L = [];
  L.push('');
  L.push(`AAJ - REFERRAL ECONOMICS (one ${r.period})`);
  L.push('-'.repeat(66));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  L.push('');
  L.push('FUNNEL');
  L.push(`  ${n1(r.funnel.customers)} customers -> ${n1(r.funnel.asked)} asked -> ${n1(r.funnel.referrers)} refer -> ${n1(r.funnel.referrals)} referrals -> ${n1(r.funnel.newCustomers)} new customers`);
  L.push('');
  L.push('COST');
  L.push(`  Referrer rewards ${m(r.cost.referrerRewards)} + friend rewards ${m(r.cost.friendRewards)} + fixed ${m(r.cost.fixedCost)} = ${m(r.cost.totalCost)}`);
  L.push('');
  L.push('PER REFERRED CUSTOMER');
  L.push(`  Referral CAC        ${m(r.unit.referralCac)}   (rewards ${m(r.unit.rewardPerCustomer)}, fixed ${m(r.unit.fixedPerCustomer)})`);
  L.push(`  CAC it replaces     ${m(r.unit.otherCac)}`);
  L.push(`  LTV:CAC             ${r.unit.ltvToCac === null ? '-' : r.unit.ltvToCac.toFixed(1) + 'x'}`);
  L.push(`  Payback             ${r.unit.paybackMonths === null ? '- (give monthlyMargin)' : r.unit.paybackMonths.toFixed(1) + ' months'}`);
  L.push(`  Saved vs other CAC  ${m(r.unit.savings)} this ${r.period}`);
  L.push('');
  L.push('BREAK-EVEN REWARD');
  L.push(`  Combined rewards per referred customer can rise to ${m(r.breakEven.rewardPerCustomer)} before referral costs as much as the channel it replaces.`);
  L.push(`  Holding the friend reward, the referrer reward can be at most ${m(r.breakEven.maxReferrerReward)} per ${r.breakEven.paidOn}.`);
  L.push('');
  L.push('LOOP');
  L.push(`  k = ${r.loop.k.toFixed(3)} new customers per existing customer per ${r.period}` + (r.loop.amplification ? `; if referred customers refer at the same rate, each customer you win turns into ${r.loop.amplification.toFixed(3)} customers in total, itself included.` : '.'));
  if (r.findings.length) {
    L.push('');
    L.push('FINDINGS');
    r.findings.filter((f) => f.level === 'fix').forEach((f) => L.push(`  !  ${f.text}`));
    r.findings.filter((f) => f.level === 'improve').forEach((f) => L.push(`  -  ${f.text}`));
    r.findings.filter((f) => f.level === 'info').forEach((f) => L.push(`  i  ${f.text}`));
  }
  L.push('');
  L.push('RULES TO CHECK (pointers, not verdicts)');
  r.pointers.forEach((p) => L.push(`  * ${p.title}: ${p.text}\n      ${p.url}${p.url2 ? '\n      ' + p.url2 : ''}`));
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Fictional example inputs for an invented B2B SaaS company. Not benchmarks.
const DEMO = {
  period: 'quarter', currency: '$',
  customers: 400, shareAsked: 0.30, askedToReferrer: 0.25, referralsPerReferrer: 2, referralToCustomer: 0.10,
  rewardReferrer: 150, rewardFriend: 150, referrerPaidOn: 'customer', fixedCost: 3000,
  ltv: 4800, otherCac: 1200, monthlyMargin: 200, monthlySpend: 400,
  assumed: ['askedToReferrer', 'referralToCustomer'],
  flags: { publicPosts: true },
};

function main() {
  const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
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
    console.log('(no config - demo: a fictional B2B SaaS company; every rate is an example input, not a benchmark)');
  }
  try {
    console.log(render(model(cfg), cfg.currency));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { model, POINTERS };
