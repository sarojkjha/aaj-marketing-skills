#!/usr/bin/env node
/*
 * AAJ Churn & Retention Calculator — engine
 * Part of the "lifecycle-and-retention" Agent Skill.
 *
 * For one period of a subscription business, computes gross/net revenue
 * retention (GRR / NRR), revenue & logo churn, the SaaS quick ratio, average
 * customer lifetime, and the LTV impact of a churn improvement. It also carries
 * the period's rates forward (12 months, or 3 years for annual input) to show
 * where today's base ends up, and what a lower churn rate would keep.
 *
 * USAGE
 *   node retention.js                  # demo
 *   node retention.js '<json-config>'  # custom
 *   node retention.js --help
 *
 * CONFIG (JSON) — one period of movement on the EXISTING base (+ new business):
 *   { "period":"monthly",        // "monthly" | "annual" (labels + lifetime unit)
 *     "startMRR":100000,         // recurring revenue at start of period (required)
 *     "newMRR":12000,            // new-business added this period (quick ratio only)
 *     "expansionMRR":8000,       // upgrades / upsell from existing customers
 *     "contractionMRR":3000,     // downgrades from existing customers (positive)
 *     "churnedMRR":6000,         // recurring revenue lost to cancellations (positive)
 *     "startCustomers":200,      // customers at start (optional — enables logo churn)
 *     "churnedCustomers":9,      // customers lost this period (optional)
 *     "targetChurnPct":null,     // optional what-if churn % for the LTV-impact line and the projection
 *     "projectPeriods":null }    // optional: periods to carry the rates forward, 1 to 60
 *                                //   (default 12 for monthly, 3 for annual)
 *
 * OR, instead of the totals, one row per customer and the engine works the
 * movement out (up to 2,000 rows; "id" is optional and is not used):
 *   { "period":"monthly",
 *     "customers":[ {"id":"a","start":500,"end":650},   // paid more: expansion
 *                   {"id":"b","start":300,"end":0},     // went to 0: churned
 *                   {"id":"c","start":0,"end":200} ] }  // from 0: new or returning
 *   "start" and "end" are each customer's recurring revenue at the start and the
 *   end of the period. Give "customers" or the totals, not both.
 *
 * Notes: NRR and GRR are measured on the EXISTING base only — newMRR is excluded
 * and used solely for the quick ratio. Amounts may be ARR instead of MRR; set
 * period:"annual" so lifetime is expressed correctly.
 *
 * Reference points used in the verdict (both are annual figures, so they are
 * applied only when period is "annual"):
 *   NRR above 100% grows the base without new logos (arithmetic). Bessemer's State
 *   of the Cloud 2023 sets 100% good, 110% better and 120%+ best, for Series B/C
 *   enterprise software; expect lower earlier and in SMB.
 *   GRR: SaaS Capital's 2026 survey puts the median at 91% for bootstrapped B2B
 *   SaaS companies between $3M and $20M ARR. Compare with your own segment.
 *   Quick ratio: dollars added per dollar lost. No threshold is applied.
 *
 * The projection is arithmetic, not a forecast: it repeats this period's rates
 * every period. Today's base is start x NRR^t (and start x GRR^t without
 * expansion). With new business given, total(t) = total(t-1) x NRR + new, which
 * assumes new customers retain like the base. The what-if scales the revenue
 * lost with the churn it is measured on (churned revenue for logo churn;
 * churned plus contraction for revenue churn) and changes nothing else.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`. First-run
// friction: users type `node engine.js demo` and hit a JSON parse error.
// Only these two exact tokens are rewritten, so JSON payloads and named modes
// (design, readout, sample, segments, ...) pass through untouched.
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

function pct(n){ return (Math.round(n*10)/10).toLocaleString() + '%'; }
function one(n){ return (Math.round(n*10)/10).toLocaleString(); }
function money(n){ return '$' + Math.round(n).toLocaleString(); }

// Misspelled or miscased fields used to count as zero (churnMRR instead of
// churnedMRR showed 100% GRR). Unknown fields and non-numbers now stop the run.
const TOTALS = ['startMRR','newMRR','expansionMRR','contractionMRR','churnedMRR','startCustomers','churnedCustomers'];
const KNOWN = ['period'].concat(TOTALS, ['targetChurnPct','projectPeriods','customers']);
const MAX_CUSTOMERS = 2000;
const MAX_PERIODS = 60;

// One row per customer -> the period's totals. A customer who paid at the start and
// pays nothing at the end has churned; paying more is expansion, paying less is
// contraction; paying from nothing is new business (two points cannot tell a new
// customer from a returning one). Rows at 0 on both dates are counted and left out.
function fromCustomers(list){
  const t = { startMRR: 0, newMRR: 0, expansionMRR: 0, contractionMRR: 0, churnedMRR: 0, startCustomers: 0, churnedCustomers: 0 };
  const counts = { rows: list.length, expanded: 0, contracted: 0, churned: 0, unchanged: 0, added: 0, empty: 0 };
  for (const x of list){
    const a = x.start, b = x.end;
    if (a > 0){
      t.startMRR += a; t.startCustomers++;
      if (b === 0){ t.churnedMRR += a; t.churnedCustomers++; counts.churned++; }
      else if (b > a){ t.expansionMRR += b - a; counts.expanded++; }
      else if (b < a){ t.contractionMRR += a - b; counts.contracted++; }
      else counts.unchanged++;
    } else if (b > 0){ t.newMRR += b; counts.added++; }
    else counts.empty++;
  }
  // Sums of cents drift in floating point (0.1 + 0.2); keep two decimals.
  for (const k of ['startMRR','newMRR','expansionMRR','contractionMRR','churnedMRR']) t[k] = Math.round(t[k] * 100) / 100;
  return { totals: t, counts };
}

function validate(c){
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['The input must be a JSON object.'];
  const errs = [];
  const unknown = Object.keys(c).filter(k => !KNOWN.includes(k));
  if (unknown.length) errs.push('Unrecognised field' + (unknown.length > 1 ? 's' : '') + ': ' + unknown.map(k => '"' + k + '"').join(', ') + '. Expected: ' + KNOWN.join(', ') + '.');
  if (c.period !== undefined && c.period !== 'monthly' && c.period !== 'annual') errs.push('"period" is "monthly" or "annual".');
  if (c.projectPeriods !== undefined && c.projectPeriods !== null && !(Number.isInteger(c.projectPeriods) && c.projectPeriods >= 1 && c.projectPeriods <= MAX_PERIODS)) errs.push('"projectPeriods" must be a whole number from 1 to ' + MAX_PERIODS + '.');
  if (c.targetChurnPct !== undefined && c.targetChurnPct !== null && (typeof c.targetChurnPct !== 'number' || !Number.isFinite(c.targetChurnPct) || c.targetChurnPct < 0)) errs.push('"targetChurnPct" must be a number, 0 or more.');
  if (c.customers !== undefined && c.customers !== null){
    const both = TOTALS.filter(k => c[k] !== undefined && c[k] !== null);
    if (both.length) errs.push('Give "customers" or the totals, not both. Remove ' + both.map(k => '"' + k + '"').join(', ') + ', or remove "customers".');
    if (!Array.isArray(c.customers) || !c.customers.length) errs.push('"customers" must be a list with at least one row, each {"start": number, "end": number}.');
    else if (c.customers.length > MAX_CUSTOMERS) errs.push('"customers" has ' + c.customers.length.toLocaleString('en-US') + ' rows; the limit is ' + MAX_CUSTOMERS.toLocaleString('en-US') + '. Add the rows up and pass the totals instead.');
    else {
      const bad = [];
      c.customers.forEach((x, i) => {
        const ok = x && typeof x === 'object' && !Array.isArray(x)
          && Object.keys(x).every(k => k === 'id' || k === 'start' || k === 'end')
          && ['start','end'].every(k => typeof x[k] === 'number' && Number.isFinite(x[k]) && x[k] >= 0);
        if (!ok) bad.push(i + 1);
      });
      if (bad.length) errs.push('"customers" row' + (bad.length > 1 ? 's ' : ' ') + bad.slice(0, 5).join(', ') + (bad.length > 5 ? ' and ' + (bad.length - 5) + ' more' : '') + ': each row is {"start": number, "end": number}, both 0 or more, with an optional "id".');
      else if (!errs.length && !(fromCustomers(c.customers).totals.startMRR > 0)) errs.push('No customer in "customers" has "start" above 0, so there is no starting base to measure retention on.');
    }
    return errs;
  }
  if (typeof c.startMRR !== 'number' || !(c.startMRR > 0)) errs.push('"startMRR" is required: recurring revenue at the start of the period, a number above 0.');
  for (const k of TOTALS.slice(1)){
    if (c[k] === undefined || c[k] === null) continue;
    if (typeof c[k] !== 'number' || !Number.isFinite(c[k]) || c[k] < 0) errs.push('"' + k + '" must be a number, 0 or more.');
  }
  if (typeof c.churnedCustomers === 'number' && typeof c.startCustomers === 'number' && c.churnedCustomers > c.startCustomers) errs.push('"churnedCustomers" cannot be more than "startCustomers".');
  // Revenue lost from existing customers cannot exceed what they paid at the start
  // (it gave an NRR of -45%).
  const lost = (typeof c.contractionMRR === 'number' ? c.contractionMRR : 0) + (typeof c.churnedMRR === 'number' ? c.churnedMRR : 0);
  if (typeof c.startMRR === 'number' && c.startMRR > 0 && lost > c.startMRR) errs.push('"contractionMRR" plus "churnedMRR" (' + lost.toLocaleString('en-US') + ') cannot be more than "startMRR" (' + c.startMRR.toLocaleString('en-US') + '): existing customers cannot lose more revenue than they started with.');
  return errs;
}

function compute(input){
  // One row per customer: work the totals out first, then read them like any other period.
  let c = input, derived = null;
  if (Array.isArray(input.customers)){
    const d = fromCustomers(input.customers);
    derived = Object.assign({}, d.totals, { counts: d.counts });
    c = Object.assign({}, input, d.totals);
    delete c.customers;
  }
  const start = c.startMRR;
  const exp = c.expansionMRR || 0;
  const contr = c.contractionMRR || 0;
  const churned = c.churnedMRR || 0;
  const neu = c.newMRR || 0;
  const period = c.period === 'annual' ? 'annual' : 'monthly';

  const grossRevChurn = start > 0 ? (contr + churned) / start * 100 : null;
  const netRevChurn   = start > 0 ? (contr + churned - exp) / start * 100 : null;
  const grr = grossRevChurn != null ? 100 - grossRevChurn : null;
  const nrr = netRevChurn   != null ? 100 - netRevChurn   : null;
  const endBase = start + exp - contr - churned;

  const denom = contr + churned;
  // Without new business the quick ratio is not a quick ratio: leave it out rather than read new as 0.
  const quickRatio = denom > 0 && c.newMRR != null ? (neu + exp) / denom : null;

  let logoChurn = null, logoRet = null;
  if (c.startCustomers > 0 && c.churnedCustomers != null){
    logoChurn = c.churnedCustomers / c.startCustomers * 100;
    logoRet = 100 - logoChurn;
  }

  // Average lifetime from the churn we trust most: logo churn if supplied, else
  // gross revenue churn. lifetime(periods) = 1 / churn.
  const churnForLife = (logoChurn != null ? logoChurn : grossRevChurn);
  let lifetimeMonths = null;
  if (churnForLife != null && churnForLife > 0){
    const perPeriod = 1 / (churnForLife / 100);
    lifetimeMonths = period === 'annual' ? perPeriod * 12 : perPeriod;
  }

  // LTV sensitivity: LTV is proportional to 1/churn. Compare current churn to a
  // target (given, else a 1-point or 50%-relative improvement) on the same basis.
  let impact = null;
  if (churnForLife != null && churnForLife > 0){
    const cur = churnForLife;
    const targetGiven = c.targetChurnPct != null;
    const target = targetGiven ? c.targetChurnPct : Math.max(cur - 1, cur * 0.5);
    if (target > 0 && target < cur){
      const per = period === 'annual' ? 12 : 1;
      impact = {
        fromPct: cur, toPct: target, targetGiven,
        ltvLiftPct: (cur / target - 1) * 100,
        newLifetimeMonths: (1 / (target / 100)) * per,
        basis: logoChurn != null ? 'logo churn' : 'revenue churn'
      };
    }
  }

  const noExpansionData = c.expansionMRR == null && c.contractionMRR == null;

  // Projection: this period's rates repeated. Not a forecast; see the header.
  let projection = null;
  if (nrr != null && grr != null){
    const periods = c.projectPeriods != null ? c.projectPeriods : (period === 'annual' ? 3 : 12);
    const hasNew = c.newMRR != null;
    const line = (nr, lr) => {
      const rows = []; let total = start;
      for (let t = 1; t <= periods; t++){
        total = total * nr + neu;
        rows.push({ t, base: start * Math.pow(nr, t), total: hasNew ? total : null,
                    customers: lr != null ? c.startCustomers * Math.pow(lr, t) : null });
      }
      return rows;
    };
    const now = line(nrr / 100, logoRet != null ? logoRet / 100 : null);
    const rows = now.map(x => ({ t: x.t, baseNet: x.base, baseGross: start * Math.pow(grr / 100, x.t), total: x.total, customers: x.customers }));
    const last = rows[rows.length - 1];

    // What-if: the revenue lost with the churn being cut falls in step with it.
    let scenario = null;
    if (impact){
      const onLogo = logoChurn != null;
      const scaled = onLogo ? churned : contr + churned;
      if (scaled > 0){
        const f = impact.toPct / impact.fromPct;
        const lost2 = onLogo ? contr + churned * f : (contr + churned) * f;
        const grr2 = 100 - lost2 / start * 100;
        const nrr2 = 100 - (lost2 - exp) / start * 100;
        const alt = line(nrr2 / 100, onLogo ? 1 - impact.toPct / 100 : (logoRet != null ? logoRet / 100 : null));
        const pick = x => (hasNew ? x.total : x.base);
        let keptCumulative = 0;
        for (let i = 0; i < periods; i++) keptCumulative += pick(alt[i]) - pick(now[i]);
        const end2 = alt[alt.length - 1];
        scenario = {
          basis: impact.basis, fromPct: impact.fromPct, toPct: impact.toPct, targetGiven: impact.targetGiven,
          nrr: nrr2, grr: grr2, on: hasNew ? 'total' : 'base',
          rows: alt.map(x => ({ t: x.t, baseNet: x.base, total: x.total, customers: x.customers })),
          endBaseNet: end2.base, endTotal: end2.total,
          keptAtEnd: pick(end2) - pick(now[now.length - 1]), keptCumulative,
          customersKept: onLogo && end2.customers != null ? end2.customers - last.customers : null
        };
      }
    }
    projection = { periods, unit: period === 'annual' ? 'year' : 'month', newPerPeriod: hasNew ? neu : null,
                   startCustomers: logoRet != null ? c.startCustomers : null,
                   rows, endBaseNet: last.baseNet, endBaseGross: last.baseGross, endTotal: last.total,
                   customersLeft: last.customers, scenario };
  }

  return { period, grossRevChurn, netRevChurn, grr, nrr, endBase, quickRatio, noExpansionData,
           logoChurn, logoRet, lifetimeMonths, impact, start, projection, derived };
}

// The projection in words: one line per figure, then the what-if.
function projectionLines(r){
  const p = r.projection;
  if (!p) return [];
  const units = p.unit + (p.periods === 1 ? '' : 's');
  const rev = r.period === 'annual' ? 'ARR' : 'MRR';
  const rowsOut = [
    [`Today's base, with expansion`, `${money(p.endBaseNet)} (from ${money(r.start)})`],
    [`Today's base, without expansion`, money(p.endBaseGross)]
  ];
  if (p.endTotal != null) rowsOut.push([`Total ${rev}, with ${money(p.newPerPeriod)} new each ${p.unit}`, money(p.endTotal)]);
  if (p.customersLeft != null) rowsOut.push([`Today's customers still paying`, `about ${Math.round(p.customersLeft).toLocaleString('en-US')} of ${p.startCustomers.toLocaleString('en-US')}`]);
  const w = Math.max.apply(null, rowsOut.map(x => x[0].length)) + 3;
  const L = [`Projection: ${p.periods} ${units} at this ${p.unit}'s rates (arithmetic, not a forecast)`];
  rowsOut.forEach(x => L.push('  ' + x[0].padEnd(w) + x[1]));
  const s = p.scenario;
  if (s){
    const what = s.on === 'total' ? `total ${rev}` : `${rev} from today's base`;
    const more = s.customersKept != null && Math.round(s.customersKept) >= 1 ? ` About ${Math.round(s.customersKept).toLocaleString('en-US')} more of today's customers would still be paying.` : '';
    L.push(`↗ ${s.targetGiven ? 'What-if' : 'What-if (an example step, not your target)'}: ${s.basis} ${pct(s.fromPct)} → ${pct(s.toPct)} keeps ${money(s.keptAtEnd)} more ${what} by ${p.unit} ${p.periods}, worth ${money(s.keptCumulative)} in revenue over the ${p.periods} ${units}.${more}`);
  }
  return L;
}

function verdict(r){
  const L = [];
  const unit = r.period === 'annual' ? '/yr' : '/mo';
  if (r.nrr != null){
    const annual = r.period === 'annual';
    if (annual && r.nrr >= 120) L.push(`\u2713 NRR ${pct(r.nrr)} \u2014 in Bessemer's 'best' band (120%+, set for Series B/C enterprise software); the base compounds without new logos.`);
    else if (annual && r.nrr >= 110) L.push(`\u2713 NRR ${pct(r.nrr)} \u2014 in Bessemer's 'better' band (110%+); expansion clearly outpaces churn.`);
    else if (r.nrr >= 100) L.push(`\u2713 NRR ${pct(r.nrr)}${unit} \u2014 the base grows on its own, without new logos.`);
    else L.push(`\u25bc NRR ${pct(r.nrr)}${unit} \u2014 under 100%: the base is shrinking; fix retention before scaling acquisition.`);
  }
  if (r.nrr != null && r.noExpansionData) L.push('\u2022 NRR counts no expansion or contraction, because neither was given.');
  if (r.grr != null){
    if (r.period !== 'annual') L.push(`\u2022 GRR ${pct(r.grr)}/mo \u2014 about ${pct(Math.pow(r.grr/100,12)*100)} a year if every month looked like this one. Published medians are annual; compare the annual figure.`);
    else if (r.grr >= 91) L.push(`\u2713 GRR ${pct(r.grr)} \u2014 at or above SaaS Capital's 2026 median of 91% for bootstrapped B2B SaaS ($3M\u2013$20M ARR).`);
    else L.push(`\u25bc GRR ${pct(r.grr)} \u2014 below SaaS Capital's 2026 median of 91% for bootstrapped B2B SaaS ($3M\u2013$20M ARR); compare with your own segment.`);
  }
  if (r.quickRatio != null){
    if (r.quickRatio >= 1) L.push(`\u2022 Quick ratio ${one(r.quickRatio)} \u2014 ${one(r.quickRatio)} added for every 1 lost; adds outpace losses.`);
    else L.push(`\u2717 Quick ratio ${one(r.quickRatio)} \u2014 losing more than you add; the base is contracting.`);
  }
  if (r.logoChurn != null){
    L.push(`\u2022 Logo churn ${pct(r.logoChurn)}${unit} \u2192 ~${one(r.lifetimeMonths)} mo average lifetime.`);
  } else if (r.lifetimeMonths != null){
    L.push(`\u2022 ~${one(r.lifetimeMonths)} mo average lifetime at current revenue churn.`);
  }
  if (r.impact){
    L.push(`\u2197 ${r.impact.targetGiven ? '' : 'What-if (an example step, not your target): '}Cutting ${r.impact.basis} ${pct(r.impact.fromPct)} \u2192 ${pct(r.impact.toPct)} lifts LTV ~${pct(r.impact.ltvLiftPct)} (lifetime \u2192 ~${one(r.impact.newLifetimeMonths)} mo). Retention is a direct LTV lever.`);
  }
  return L;
}

const r0 = n => (n == null ? null : Math.round(n));
const r1 = n => (n == null ? null : Math.round(n * 10) / 10);
function projectionJson(r){
  const p = r.projection;
  if (!p) return null;
  const s = p.scenario;
  return {
    periods: p.periods, unit: p.unit, newPerPeriod: p.newPerPeriod,
    endBaseWithExpansion: r0(p.endBaseNet), endBaseWithoutExpansion: r0(p.endBaseGross),
    endTotal: r0(p.endTotal), customersLeft: r1(p.customersLeft),
    rows: p.rows.map(x => ({ period: x.t, baseWithExpansion: r0(x.baseNet), baseWithoutExpansion: r0(x.baseGross), total: r0(x.total), customers: r1(x.customers) })),
    whatIf: s ? {
      basis: s.basis, fromPct: r1(s.fromPct), toPct: r1(s.toPct), isExample: !s.targetGiven,
      nrrPct: r1(s.nrr), grrPct: r1(s.grr), measuredOn: s.on,
      endBaseWithExpansion: r0(s.endBaseNet), endTotal: r0(s.endTotal),
      keptAtEnd: r0(s.keptAtEnd), keptOverPeriods: r0(s.keptCumulative), customersKept: r1(s.customersKept)
    } : null
  };
}

function render(c){
  const r = compute(c);
  const per = r.period === 'annual' ? '/yr' : '/mo';
  const out = [];
  out.push('');
  out.push(`AAJ Churn & Retention \u2014 ${r.period} view`);
  out.push('-'.repeat(56));
  out.push(`Net revenue retention (NRR)   ${r.nrr!=null?pct(r.nrr):'\u2014'}`);
  out.push(`Gross revenue retention (GRR) ${r.grr!=null?pct(r.grr):'\u2014'}`);
  out.push(`Gross revenue churn           ${r.grossRevChurn!=null?pct(r.grossRevChurn)+per:'\u2014'}`);
  out.push(`Net revenue churn             ${r.netRevChurn!=null?pct(r.netRevChurn)+per:'\u2014'}`);
  out.push(`Logo churn                    ${r.logoChurn!=null?pct(r.logoChurn)+per:'\u2014'}`);
  out.push(`Quick ratio                   ${r.quickRatio!=null?one(r.quickRatio):'\u2014'}`);
  out.push(`Avg customer lifetime         ${r.lifetimeMonths!=null?one(r.lifetimeMonths)+' mo':'\u2014'}`);
  out.push(`Retained base MRR (end)       ${money(r.endBase)}`);
  if (r.derived){
    const d = r.derived, k = d.counts;
    out.push('');
    out.push(`From ${k.rows.toLocaleString('en-US')} customer rows: start ${money(d.startMRR)} across ${d.startCustomers.toLocaleString('en-US')} paying customers.`);
    out.push(`  Expansion ${money(d.expansionMRR)} (${k.expanded}), contraction ${money(d.contractionMRR)} (${k.contracted}), churned ${money(d.churnedMRR)} (${k.churned}), unchanged ${k.unchanged}.`);
    out.push(`  New or returning ${money(d.newMRR)} (${k.added})${k.empty ? `; ${k.empty} row${k.empty === 1 ? '' : 's'} at 0 on both dates left out` : ''}.`);
  }
  out.push('');
  verdict(r).forEach(l => out.push(l));
  const pl = projectionLines(r);
  if (pl.length){ out.push(''); pl.forEach(l => out.push(l)); }
  out.push('');
  out.push('--- JSON ---');
  out.push(JSON.stringify({
    period: r.period,
    nrrPct: r.nrr!=null?Math.round(r.nrr*10)/10:null,
    grrPct: r.grr!=null?Math.round(r.grr*10)/10:null,
    grossRevChurnPct: r.grossRevChurn!=null?Math.round(r.grossRevChurn*10)/10:null,
    netRevChurnPct: r.netRevChurn!=null?Math.round(r.netRevChurn*10)/10:null,
    logoChurnPct: r.logoChurn!=null?Math.round(r.logoChurn*10)/10:null,
    quickRatio: r.quickRatio!=null?Math.round(r.quickRatio*100)/100:null,
    avgLifetimeMonths: r.lifetimeMonths!=null?Math.round(r.lifetimeMonths*10)/10:null,
    retainedBaseMRR: Math.round(r.endBase),
    derivedFromCustomers: r.derived,
    projection: projectionJson(r)
  }, null, 2));
  return out.join('\n');
}

const arg = process.argv[2] === '--demo' ? undefined : process.argv[2];
if (arg === '--help' || arg === '-h'){ console.log(require('fs').readFileSync(__filename,'utf8').split('*/')[0].replace(/^\/\*/,'')); process.exit(0); }
let cfg;
if (arg){ try { cfg = JSON.parse(arg); } catch(e){ console.error('Invalid JSON. Run --help for the schema.\n'+e.message); process.exit(1); } }
else { cfg = { period:'monthly', startMRR:100000, newMRR:12000, expansionMRR:8000, contractionMRR:3000, churnedMRR:6000, startCustomers:200, churnedCustomers:9 };
  console.log('(no config \u2014 demo: $100k start MRR; +$12k new, +$8k expansion, \u2212$3k contraction, \u2212$6k churned; 200 customers, 9 lost)'); }
const problems = validate(cfg);
if (problems.length){ console.error(problems.join('\n') + '\nRun --help for the input shape.'); process.exit(1); }
console.log(render(cfg));

module.exports = { compute, verdict, fromCustomers, projectionLines, validate };
