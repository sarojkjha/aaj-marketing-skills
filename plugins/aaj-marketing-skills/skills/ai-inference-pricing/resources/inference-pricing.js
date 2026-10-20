#!/usr/bin/env node
/*
 * AAJ AI Inference Pricing - inference cost and usage pricing engine
 * Part of the "ai-inference-pricing" Agent Skill.
 *
 * Models what one paid account of an AI product costs to serve and earns, from
 * the founder's own numbers: tasks per active user, tokens per task, the model
 * prices the founder looked up (with the date they checked them), routing across
 * models, included usage and overage, the free tier, and other variable costs.
 * It returns the all-in gross margin at normal usage and under a usage spike,
 * the break-even price, the usage level where an account stops paying, and the
 * levers that move margin most. It contains no model prices of its own.
 *
 * USAGE
 *   node inference-pricing.js                    # demo (example prices, not quotes)
 *   node inference-pricing.js '<json-config>'    # your own
 *   node inference-pricing.js --help
 *
 * CONFIG (JSON) - money in one currency, per month; shares as fractions (0.7 = 70%)
 *
 *   {
 *     "today": "2026-10-10",                  // optional, for the price-staleness check
 *     "plan": {
 *       "basis": "seat" | "account",          // price is per seat or per account
 *       "price": 25,                          // per seat or per account per month (> 0)
 *       "usersPerAccount": 8,                 // seats / users on a typical paid account (default 1)
 *       "activeShare": 0.75,                  // share of those users active in a month (default 1)
 *       "includedTasks": 1500,                // tasks included per account per month; omit = unlimited
 *       "overagePrice": 0.02                  // price per task beyond the included tasks (default 0 = not billed)
 *     },
 *     "models": [                             // the prices YOU looked up; 1 or more (routing across 2-3 is typical)
 *       { "name": "Large model", "inputPerM": 4, "outputPerM": 16,  // price per million input / output tokens
 *         "share": 0.4,                       // share of token-based tasks routed here (shares sum to 1; omit for one model)
 *         "checked": "2026-09-15" }           // date you checked the price; older than 90 days is flagged
 *     ],
 *     "tasks": [                              // one row per task type
 *       { "name": "Meeting summary", "perActiveUser": 60, "inputTokens": 18000, "outputTokens": 1200 },
 *       { "name": "Transcription", "perActiveUser": 60, "costPerTask": 0.03, "checked": "2026-09-15" }
 *     ],                                      // costPerTask replaces tokens x model prices for that task
 *     "freeTier": {                           // optional
 *       "users": 4000,                        // free users
 *       "activeShare": 0.35,                  // share of them active in a month (default 1)
 *       "usageShare": 0.3,                    // a free active user's tasks as a share of a paid active user's (default 1)
 *       "capTasks": 40,                       // optional cap on tasks per free user per month
 *       "otherCostPerUser": 0,                // optional non-inference cost per free user per month
 *       "paidAccounts": 120                   // paid accounts that carry the free tier's cost
 *     },
 *     "otherCosts": {
 *       "hostingPerAccount": 6,               // hosting and other fixed cost per paid account per month
 *       "supportPct": 0.04,                   // support cost as a share of revenue
 *       "paymentPct": 0.03                    // payment fees as a share of revenue
 *     },
 *     "targetMargin": 0.7,                    // YOUR target all-in gross margin. Required; not a benchmark.
 *     "spikeMultiplier": 2.5                  // stress test: paid usage x this (default 2)
 *   }
 *
 * RULES OF THIS ENGINE (stated so you can argue with them)
 *   - Healthy: all-in margin at normal usage meets your target AND the account
 *     still makes money at the spike. Thin: makes money, but misses the target
 *     or loses money at the spike. Underwater: loses money at normal usage.
 *   - "All-in" = revenue - inference - other variable costs - the free-tier cost
 *     each paid account carries.
 *   - The spike and the usage break-even scale paid usage only; the free tier is
 *     held at its normal usage. Model a free-tier surge by raising its inputs.
 *   - Usage beyond the included tasks is billed at the overage price; with no
 *     overage price it is treated as unbilled.
 *   - Levers are fixed what-if moves: price +10%, 20 points of task share to the
 *     cheapest model, -20% tokens per task, -20% included tasks, -20% free usage.
 *     Ranked by the change in all-in margin per paid account.
 */

// --- AAJ arg normalisation ---------------------------------------------------
// Accept bare `demo` / `help` as aliases for `--demo` / `--help`.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

// Copied verbatim into aajconsult.com/tools/ai-inference-cost-modeler. If the block
// between the core markers changes, re-copy it there; the site's verify script checks it byte for byte.
/* aaj:core:begin */
function die(msg, hint) {
  const e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  throw e;
}

// Rules of this engine, stated where they are used so a reader can argue with them.
const STALE_DAYS = 90;     // a price not re-checked for longer is flagged: provider prices change
const DEFAULT_SPIKE = 2;   // stress test when none is given: paid usage doubles. A test, not a forecast.
const LEVER = { price: 0.10, routing: 0.20, tokens: 0.20, included: 0.20, free: 0.20 }; // size of each what-if move
const SHARE_TOL = 0.001;   // routing shares must sum to 1 within this

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (v) => str(v).length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function num(v, label, o) {
  o = o || {};
  if (blank(v)) {
    if (o.required) die(`Give ${label}.`, o.hint);
    return o.def;
  }
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) die(`${label} must be a number.`, o.hint);
  if (o.min !== undefined && n < o.min) die(`${label} must be ${o.min} or more.`, o.hint);
  if (o.max !== undefined && n > o.max) die(`${label} must be ${o.max} or less.`, o.hint);
  return n;
}

function parseDate(v) {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? dt : null;
}

function normalise(cfg) {
  if (!cfg || typeof cfg !== 'object') die('Config must be a JSON object.');
  const p = cfg.plan && typeof cfg.plan === 'object' ? cfg.plan : {};
  const basis = str(p.basis || 'account').toLowerCase();
  if (basis !== 'account' && basis !== 'seat') die('"plan.basis" must be "account" or "seat".');
  const plan = {
    basis,
    price: num(p.price, 'the plan price ("plan.price")', { required: true, min: 0 }),
    users: num(p.usersPerAccount, 'users per account ("plan.usersPerAccount")', { def: 1, min: 0 }),
    activeShare: num(p.activeShare, 'the active user share ("plan.activeShare")', { def: 1, min: 0, max: 1 }),
    included: blank(p.includedTasks) ? null : num(p.includedTasks, 'included tasks ("plan.includedTasks")', { min: 0 }),
    overage: num(p.overagePrice, 'the overage price per task ("plan.overagePrice")', { def: 0, min: 0 }),
  };
  if (plan.price <= 0) die('The plan price must be more than 0.', 'Enter what one seat or one account pays per month.');
  if (plan.users <= 0) die('Users per account must be more than 0.');

  const models = arr(cfg.models).filter((m) => m && has(m.name)).map((m) => {
    const name = str(m.name);
    return {
      name,
      inputPerM: num(m.inputPerM, `the input price per million tokens for "${name}"`, { required: true, min: 0, hint: 'Use the price you looked up on the provider\'s own pricing page.' }),
      outputPerM: num(m.outputPerM, `the output price per million tokens for "${name}"`, { required: true, min: 0, hint: 'Use the price you looked up on the provider\'s own pricing page.' }),
      share: blank(m.share) ? null : num(m.share, `the routing share for "${name}"`, { min: 0, max: 1 }),
      checked: str(m.checked),
    };
  });
  const names = models.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length) die('Two models have the same name. Give each model a distinct name.');
  if (models.length === 1 && models[0].share === null) models[0].share = 1;
  if (models.length > 1) {
    if (models.some((m) => m.share === null)) die('With more than one model, give each a routing share ("share").', 'Shares are the fraction of token-based tasks each model handles, and sum to 1.');
    const total = models.reduce((s, m) => s + m.share, 0);
    if (Math.abs(total - 1) > SHARE_TOL) die(`Routing shares add up to ${Math.round(total * 1000) / 10}%, not 100%.`, 'Shares are the fraction of token-based tasks each model handles.');
  }

  const tasks = arr(cfg.tasks).filter((t) => t && has(t.name)).map((t) => {
    const name = str(t.name);
    const direct = !blank(t.costPerTask);
    return {
      name, direct,
      perActiveUser: num(t.perActiveUser, `tasks per active user for "${name}"`, { required: true, min: 0 }),
      costPerTask: direct ? num(t.costPerTask, `the cost per task for "${name}"`, { min: 0 }) : null,
      inputTokens: direct ? 0 : num(t.inputTokens, `input tokens per task for "${name}"`, { required: true, min: 0 }),
      outputTokens: direct ? 0 : num(t.outputTokens, `output tokens per task for "${name}"`, { required: true, min: 0 }),
      checked: str(t.checked),
    };
  });
  if (!tasks.length) die('Give at least one task type.', 'A task is one thing a user asks the product to do: a summary, a draft, an answer.');
  if (tasks.some((t) => !t.direct) && !models.length) die('Token-based tasks need at least one model with its prices.', 'Or give a direct cost per task instead of tokens.');

  let free = null;
  const f = cfg.freeTier;
  if (f && typeof f === 'object' && !blank(f.users) && Number(f.users) > 0) {
    free = {
      users: num(f.users, 'free users ("freeTier.users")', { min: 0 }),
      activeShare: num(f.activeShare, 'the free active share ("freeTier.activeShare")', { def: 1, min: 0, max: 1 }),
      usageShare: num(f.usageShare, 'free usage as a share of paid usage ("freeTier.usageShare")', { def: 1, min: 0 }),
      capTasks: blank(f.capTasks) ? null : num(f.capTasks, 'the free task cap ("freeTier.capTasks")', { min: 0 }),
      otherCostPerUser: num(f.otherCostPerUser, 'other cost per free user ("freeTier.otherCostPerUser")', { def: 0, min: 0 }),
      paidAccounts: num(f.paidAccounts, 'the number of paid accounts carrying the free tier ("freeTier.paidAccounts")', { required: true, min: 0, hint: 'The free tier\'s cost is spread across your paid accounts.' }),
    };
    if (free.paidAccounts <= 0) die('Paid accounts carrying the free tier must be more than 0.');
  }

  const o = cfg.otherCosts && typeof cfg.otherCosts === 'object' ? cfg.otherCosts : {};
  const other = {
    hostingPerAccount: num(o.hostingPerAccount, 'hosting per account ("otherCosts.hostingPerAccount")', { def: 0, min: 0 }),
    supportPct: num(o.supportPct, 'support as a share of revenue ("otherCosts.supportPct")', { def: 0, min: 0, max: 1 }),
    paymentPct: num(o.paymentPct, 'payment fees as a share of revenue ("otherCosts.paymentPct")', { def: 0, min: 0, max: 1 }),
  };
  if (other.supportPct + other.paymentPct >= 1) die('Support and payment fees together must be under 100% of revenue.');

  const targetMargin = num(cfg.targetMargin, 'your target margin ("targetMargin")', { required: true, min: 0, max: 0.99, hint: 'Your own target all-in gross margin as a fraction, e.g. 0.7 for 70%. The verdict is measured against it.' });
  const spike = num(cfg.spikeMultiplier, 'the spike multiplier ("spikeMultiplier")', { def: DEFAULT_SPIKE, min: 1 });

  const today = cfg.today !== undefined && !blank(cfg.today) ? parseDate(cfg.today) : null;
  if (cfg.today !== undefined && !blank(cfg.today) && !today) die('"today" must be a real date as YYYY-MM-DD.');

  return { plan, models, tasks, free, other, targetMargin, spike, today };
}

const BASE = { usage: 1, price: 1, tokens: 1, included: 1, free: 1, shares: null };

function taskCost(t, models, shares, tokenMult) {
  if (t.direct) return t.costPerTask;
  return models.reduce((s, m, i) => s + shares[i] * (t.inputTokens * tokenMult * m.inputPerM + t.outputTokens * tokenMult * m.outputPerM) / 1e6, 0);
}

// One paid account for one month under a set of what-if adjustments.
function scenario(n, adj) {
  const a = Object.assign({}, BASE, adj || {});
  const shares = a.shares || n.models.map((m) => m.share);
  const perTask = n.tasks.map((t) => {
    const cost = taskCost(t, n.models, shares, a.tokens);
    return { name: t.name, direct: t.direct, perActiveUser: t.perActiveUser, costPerTask: cost, costPerActiveUser: cost * t.perActiveUser };
  });
  const tasksPerUser = perTask.reduce((s, t) => s + t.perActiveUser, 0);
  const costPerUser = perTask.reduce((s, t) => s + t.costPerActiveUser, 0);
  const avgCostPerTask = tasksPerUser > 0 ? costPerUser / tasksPerUser : 0;
  const activeUsers = n.plan.users * n.plan.activeShare;
  const tasks = activeUsers * tasksPerUser * a.usage;
  const inference = activeUsers * costPerUser * a.usage;
  const price = n.plan.price * a.price;
  const base = n.plan.basis === 'seat' ? price * n.plan.users : price;
  const included = n.plan.included === null ? null : n.plan.included * a.included;
  const overageTasks = included === null ? 0 : Math.max(0, tasks - included);
  const overage = overageTasks * n.plan.overage;
  const revenue = base + overage;
  const other = n.other.hostingPerAccount + revenue * (n.other.supportPct + n.other.paymentPct);
  const contribution = revenue - inference - other;

  let free = null, freeCarry = 0;
  if (n.free) {
    const activeFree = n.free.users * n.free.activeShare;
    let perFree = tasksPerUser * n.free.usageShare;
    if (n.free.capTasks !== null) perFree = Math.min(perFree, n.free.capTasks);
    perFree *= a.free;
    const monthly = activeFree * perFree * avgCostPerTask + n.free.users * n.free.otherCostPerUser;
    freeCarry = monthly / n.free.paidAccounts;
    free = { activeUsers: activeFree, tasksPerActiveUser: perFree, monthlyCost: monthly, perPaidAccount: freeCarry };
  }
  const allIn = contribution - freeCarry;
  return {
    usage: a.usage, perTask, tasksPerUser, costPerUser, avgCostPerTask, activeUsers, tasks, inference,
    price, base, included, overageTasks, overage, revenue, other, contribution,
    margin: contribution / revenue, free, freeCarry, allIn, allInMargin: allIn / revenue,
  };
}

// The plan price at which the all-in margin hits a given level, at normal usage.
function priceFor(n, s, margin) {
  const q = n.other.supportPct + n.other.paymentPct;
  const room = 1 - q - margin;
  if (room <= 0) return { reachable: false, price: null, coveredByOverage: false };
  const revenue = (s.inference + n.other.hostingPerAccount + s.freeCarry) / room;
  const base = revenue - s.overage;
  const per = n.plan.basis === 'seat' ? n.plan.users : 1;
  return { reachable: true, price: Math.max(0, base / per), coveredByOverage: base <= 0 };
}

// The paid-usage multiple at which the all-in margin reaches zero.
function usageBreakEven(n, s) {
  const q = n.other.supportPct + n.other.paymentPct;
  const H = n.other.hostingPerAccount, F = s.freeCarry, B = s.base, o = n.plan.overage;
  const I1 = s.inference, T1 = s.tasks;
  const inc = n.plan.included;
  const m0 = B * (1 - q) - H - F;            // margin with no usage at all
  const out = (status, k) => ({ status, multiplier: k, tasksPerActiveUser: k === null ? null : k * s.tasksPerUser });
  if (m0 < 0) return out('already', 0);
  if (I1 <= 0 || T1 <= 0) return out('never', null);
  const k1 = m0 / I1;
  if (inc === null || k1 * T1 <= inc) return out('at', k1);
  const slope = o * T1 * (1 - q) - I1;       // margin change per unit of k once overage is billed
  if (slope >= 0) return out('never', null);
  return out('at', (H + F - (B - o * inc) * (1 - q)) / slope);
}

function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }
function money(v) {
  const a = Math.abs(v);
  const d = a === 0 ? 2 : a < 0.01 ? 5 : a < 1 ? 4 : 2;
  const parts = a.toFixed(d).split('.');
  return (v < 0 ? '-$' : '$') + parts[0].replace(/\B(?=(\d{3})+$)/g, ',') + (parts[1] ? '.' + parts[1] : '');
}
function times(k) { return (Math.round(k * 100) / 100) + 'x'; }

function build(cfg) {
  const n = normalise(cfg);
  const now = n.today || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const findings = [];
  const add = (level, id, text) => findings.push({ level, id, text });

  const normal = scenario(n, BASE);
  const spike = scenario(n, { usage: n.spike });
  const q = n.other.supportPct + n.other.paymentPct;

  // ---- price freshness: every price the founder entered carries a checked date
  const priced = n.models.map((m) => ({ kind: 'model', name: m.name, checked: m.checked }))
    .concat(n.tasks.filter((t) => t.direct).map((t) => ({ kind: 'task', name: t.name, checked: t.checked })));
  const ages = priced.map((x) => {
    const d = parseDate(x.checked);
    const age = d ? Math.round((now - d) / 86400000) : null;
    const what = x.kind === 'model' ? `"${x.name}" prices` : `The cost per task for "${x.name}"`;
    if (age === null) add('warn', 'price-undated', `${what} have no price-checked date. Provider prices change; record when you checked so you know when to re-check.`);
    else if (age > STALE_DAYS) add('warn', 'price-stale', `${what} were checked ${age} days ago. Provider prices change; re-check them before you rely on this result. This engine flags anything older than ${STALE_DAYS} days.`);
    return { kind: x.kind, name: x.name, checked: x.checked || null, ageDays: age, stale: age !== null && age > STALE_DAYS };
  });

  // ---- usage terms
  if (n.plan.included === null) {
    add('note', 'uncapped', 'No usage limit on the plan. Inference cost grows with every task while revenue stays flat; the usage break-even shows where an account stops paying.');
  } else if (n.plan.overage <= 0) {
    add('note', 'overage-unbilled', `No overage price. Usage beyond the ${Math.round(n.plan.included)} included tasks is treated as unbilled. If you hard-cap usage instead, that cost does not occur.`);
  } else {
    const floor = normal.avgCostPerTask / (1 - q);
    if (n.plan.overage < floor) add('warn', 'overage-loses', `The overage price (${money(n.plan.overage)} a task) is below what an average task costs you after fees (${money(floor)}). Every task over the included amount loses money.`);
  }
  if (spike.allIn < 0) add('warn', 'spike-underwater', `At ${times(n.spike)} usage an account loses ${money(-spike.allIn)} a month. Heavy users cost more than they pay.`);

  // ---- verdict against the founder's own target
  const meets = normal.allInMargin >= n.targetMargin - 1e-9;
  let verdict;
  if (normal.allIn < 0) {
    verdict = { level: 'underwater', headline: 'Underwater', body: `Each paid account loses ${money(-normal.allIn)} a month at normal usage, after inference, other variable costs${n.free ? ' and the free tier it carries' : ''}.` };
  } else if (meets && spike.allIn >= 0) {
    verdict = { level: 'healthy', headline: 'Healthy against your target', body: `All-in margin is ${pct(normal.allInMargin)} at normal usage, at or above your ${pct(n.targetMargin)} target, and an account still makes money at ${times(n.spike)} usage.` };
  } else {
    const why = [];
    if (!meets) why.push(`all-in margin is ${pct(normal.allInMargin)}, below your ${pct(n.targetMargin)} target`);
    if (spike.allIn < 0) why.push(`an account loses money at ${times(n.spike)} usage`);
    verdict = { level: 'thin', headline: 'Thin', body: `Each account makes money at normal usage, but ${why.join(', and ')}.` };
  }

  // ---- break-evens
  const breakEven = priceFor(n, normal, 0);
  const targetPrice = priceFor(n, normal, n.targetMargin);
  const usage = usageBreakEven(n, normal);

  // ---- levers: fixed what-if moves, ranked by change in all-in margin per account
  const levers = [];
  const tryLever = (id, label, move, adj, caveat) => {
    const s = scenario(n, adj);
    const gain = s.allIn - normal.allIn;
    if (gain > 1e-9) levers.push({ id, label, move, gain, allInAfter: s.allIn, marginAfter: s.allInMargin, marginPoints: (s.allInMargin - normal.allInMargin) * 100, caveat: caveat || '' });
  };
  tryLever('price', 'Raise the plan price', `+${LEVER.price * 100}% on the plan price`, { price: 1 + LEVER.price }, 'Check what buyers will pay before you move it.');
  const tokenTasks = n.tasks.filter((t) => !t.direct);
  if (n.models.length > 1 && tokenTasks.length) {
    const full = n.models.map((m, i) => tokenTasks.reduce((s, t) => s + t.perActiveUser * taskCost(t, n.models, n.models.map((_, j) => (j === i ? 1 : 0)), 1), 0));
    let hi = -1, lo = -1;
    full.forEach((c, i) => {
      if (n.models[i].share > 0 && (hi < 0 || c > full[hi])) hi = i;
      if (lo < 0 || c < full[lo]) lo = i;
    });
    if (hi >= 0 && lo >= 0 && hi !== lo && full[hi] > full[lo]) {
      const move = Math.min(LEVER.routing, n.models[hi].share);
      const shares = n.models.map((m, i) => (i === hi ? m.share - move : i === lo ? m.share + move : m.share));
      tryLever('routing', 'Route more tasks to the cheaper model', `move ${Math.round(move * 100)} points of task share from "${n.models[hi].name}" to "${n.models[lo].name}"`, { shares }, 'Only if the cheaper model does those tasks well enough. Test quality first.');
    }
  }
  if (tokenTasks.length) tryLever('tokens', 'Trim tokens per task', `-${LEVER.tokens * 100}% input and output tokens per task (shorter prompts and outputs)`, { tokens: 1 - LEVER.tokens }, 'Check output quality holds.');
  if (n.plan.included !== null && n.plan.overage > 0) tryLever('included', 'Lower the included usage', `-${LEVER.included * 100}% included tasks per account`, { included: 1 - LEVER.included }, 'Raises bills for heavy users; watch for churn.');
  if (n.free) tryLever('free', 'Tighten the free tier', `-${LEVER.free * 100}% usage per free user`, { free: 1 - LEVER.free }, 'May slow free-to-paid conversion.');
  levers.sort((x, y) => y.gain - x.gain);

  return {
    plan: n.plan, targetMargin: n.targetMargin, spikeMultiplier: n.spike,
    models: n.models, normal, spike,
    breakEven: { price: breakEven, targetPrice, usage },
    verdict, levers: levers.slice(0, 3), allLevers: levers, findings, prices: ages,
    rules: { STALE_DAYS, DEFAULT_SPIKE, LEVER },
  };
}
/* aaj:core:end */

/* ─────────────────────────── rendering ─────────────────────────── */

function render(r) {
  const L = [];
  const n = r.normal, s = r.spike, b = r.breakEven;
  const per = r.plan.basis === 'seat' ? 'seat' : 'account';
  L.push('');
  L.push('AAJ - AI INFERENCE COST & USAGE PRICING');
  L.push('-'.repeat(66));
  L.push(`  ${r.verdict.headline.toUpperCase()} - ${r.verdict.body}`);
  L.push('');
  L.push('INFERENCE COST');
  n.perTask.forEach((t) => L.push(`  ${t.name.padEnd(34)} ${money(t.costPerTask).padStart(10)} a task  x ${t.perActiveUser} = ${money(t.costPerActiveUser)} per active user`));
  L.push(`  Per active user: ${money(n.costPerUser)} a month (${Math.round(n.tasksPerUser)} tasks; ${money(n.avgCostPerTask)} average a task)`);
  L.push('');
  L.push(`ONE PAID ACCOUNT, PER MONTH          normal (1x)    spike (${times(r.spikeMultiplier)})`);
  const row = (k, a, c) => L.push(`  ${k.padEnd(34)} ${a.padStart(12)}   ${c.padStart(12)}`);
  row('Plan revenue', money(n.base), money(s.base));
  row(`Overage revenue (${Math.round(n.overageTasks)} / ${Math.round(s.overageTasks)} tasks)`, money(n.overage), money(s.overage));
  row('Inference', money(-n.inference), money(-s.inference));
  row('Other variable costs', money(-n.other), money(-s.other));
  row('Margin before free tier', `${money(n.contribution)} ${pct(n.margin)}`, `${money(s.contribution)} ${pct(s.margin)}`);
  if (n.free) row('Free tier carried', money(-n.freeCarry), money(-s.freeCarry));
  row('ALL-IN MARGIN', `${money(n.allIn)} ${pct(n.allInMargin)}`, `${money(s.allIn)} ${pct(s.allInMargin)}`);
  L.push('');
  L.push('BREAK-EVENS');
  L.push(`  Break-even price: ${b.price.reachable ? money(b.price.price) + ' per ' + per + (b.price.coveredByOverage ? ' (overage alone covers costs)' : '') : 'not reachable'}`);
  L.push(`  Price for your ${pct(r.targetMargin)} target: ${b.targetPrice.reachable ? money(b.targetPrice.price) + ' per ' + per : 'not reachable - percentage costs plus the target reach 100%'}`);
  const u = b.usage;
  L.push(`  Account turns unprofitable: ${u.status === 'already' ? 'already, at any usage' : u.status === 'never' ? 'never - each extra task earns more than it costs' : 'at ' + times(u.multiplier) + ' normal usage (' + Math.round(u.tasksPerActiveUser) + ' tasks per active user a month)'}`);
  if (n.free) L.push(`  Free tier: ${money(n.free.monthlyCost)} a month, ${money(n.freeCarry)} per paid account`);
  if (r.levers.length) {
    L.push('');
    L.push('BIGGEST LEVERS (all-in margin per account, per month)');
    r.levers.forEach((l, i) => L.push(`  ${i + 1}. ${l.label}: ${l.move} -> +${money(l.gain)} (${pct(l.marginAfter)} margin). ${l.caveat}`));
  }
  if (r.findings.length) {
    L.push('');
    L.push('CHECKS');
    r.findings.filter((f) => f.level === 'warn').forEach((f) => L.push(`  !  ${f.text}`));
    r.findings.filter((f) => f.level === 'note').forEach((f) => L.push(`  -  ${f.text}`));
  }
  return L.join('\n');
}

/* ─────────────────────────── cli ─────────────────────────── */

// Illustrative only: a fictional product, and example prices that are not quotes from any provider.
const DEMO = {
  today: '2026-10-10',
  plan: { basis: 'seat', price: 25, usersPerAccount: 8, activeShare: 0.75, includedTasks: 1500, overagePrice: 0.02 },
  models: [
    { name: 'Large model (example price, not a quote)', inputPerM: 4, outputPerM: 16, share: 0.4, checked: '2026-09-15' },
    { name: 'Small model (example price, not a quote)', inputPerM: 0.3, outputPerM: 1.2, share: 0.6, checked: '2026-05-20' },
  ],
  tasks: [
    { name: 'Meeting summary', perActiveUser: 60, inputTokens: 18000, outputTokens: 1200 },
    { name: 'Follow-up email draft', perActiveUser: 120, inputTokens: 2500, outputTokens: 500 },
    { name: 'Transcription (per meeting)', perActiveUser: 60, costPerTask: 0.03, checked: '2026-09-15' },
  ],
  freeTier: { users: 4000, activeShare: 0.35, usageShare: 0.3, capTasks: 40, paidAccounts: 120 },
  otherCosts: { hostingPerAccount: 6, supportPct: 0.04, paymentPct: 0.03 },
  targetMargin: 0.7,
  spikeMultiplier: 2.5,
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
    console.log('(no config - demo: a fictional meeting-notes product; example prices, not quotes; one price is stale on purpose)');
  }
  try {
    console.log(render(build(cfg)));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { build, scenario, normalise, usageBreakEven, priceFor, STALE_DAYS, DEFAULT_SPIKE, LEVER };
