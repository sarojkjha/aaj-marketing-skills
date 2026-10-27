#!/usr/bin/env node
/*
 * AAJ Campaign Orchestrator - marketing decision guides
 * Part of the "campaign-orchestrator" Agent Skill.
 *
 * Three short question paths for decisions that come up inside a Play: which
 * channel to start with, whether to make a marketing hire and which one, and
 * which marketing tools to set up now. Each returns a recommendation, the
 * steps with the AAJ tools and playbooks that carry them out, what to leave
 * alone for now, and why. The rules encode AAJ's judgement; they are not
 * benchmarks. This is the same engine, byte for byte, as the AAJ Marketing
 * Decision Guides page (aajconsult.com/tools/marketing-decision-guides).
 *
 * USAGE
 *   node decision-guides.js                                   # demo
 *   node decision-guides.js '{"guide":"channel","answers":{...}}'
 *   node decision-guides.js '{"guide":"hire"}'                # lists the questions
 *   node decision-guides.js '<json-config>' --json
 *   node decision-guides.js --help
 *
 * CONFIG (JSON)
 *
 *   { "guide": "channel" | "hire" | "stack", "answers": { "<question id>": "<value>" } }
 *
 *   "channel" - Which channel should we start with?
 *     segment:   yes | notyet          chosen the one segment you are going after first?
 *     selfserve: yes | no              can people try the product without talking to you?
 *     search:    yes | unsure | no     do buyers already search for a product like yours?
 *     acv:       low | mid | high      first-year payment: under $1,000 / $1,000 to $25,000 / over $25,000
 *     named:     yes | no              could you list the target companies, a few hundred at most?
 *     partner:   yes | no              does a partner, community or newsletter already have your buyers' attention?
 *     budget:    none | small | real   paid acquisition a month: nothing yet / under $5,000 / $5,000 or more
 *     founder:   yes | no              will a founder spend three hours a week writing and talking in public?
 *
 *   "hire" - Do we need a marketing hire, and which one?
 *     stage:       prepmf | seed | a | b               before PMF / early customers / repeatable sales, around Series A / Series B or later
 *     positioning: yes | no                            can you say who it's for and why they choose you, and do customers say it back?
 *     channel:     yes | no                            is one channel producing pipeline you could predict next month?
 *     who:         founder | junior | agency | nobody  who does marketing today?
 *     budget:      low | mid | high                    marketing people this year, all in: under $150,000 / $150,000 to $300,000 / over $300,000
 *
 *   "stack" - Which marketing tools do we need now, and which can wait?
 *     tracking: yes | unsure | no      can you see which channel each lead came from, with conversion events firing?
 *     crm:      yes | no               a CRM or customer database the team actually uses?
 *     email:    yes | no               a proper email tool, with your domain authenticated?
 *     volume:   low | mid | high       new leads or signups a month: under 100 / 100 to 1,000 / over 1,000
 *     motion:   self | sales | both    how customers buy
 *
 * The dollar and volume bands are the answer options the page offers, not
 * thresholds from a study. Every answer is required: an incomplete set gives
 * no recommendation, and the CLI lists what is missing.
 */

// --- AAJ arg normalisation ---------------------------------------------------
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

/* aaj:engine:begin */
var AAJ_GUIDES = (function () {
"use strict";
/*
 * AAJ Marketing Decision Guides - engine.
 *
 * Three short question paths that route a founder to a decision and to the AAJ
 * tools and playbooks that carry it out. The rules encode AAJ's judgement. They are not benchmarks, and the page says so.
 *
 * Each guide: questions (id, text, options[{v, label}]) and decide(answers),
 * which returns { title, summary, steps[{head, body, links[]}], avoid[], why[] }.
 * Every link is a site path; the guardrail checks each one against the sitemap.
 */

function L(href, label) { return { href: href, label: label }; }

var CHANNEL = {
  id: "channel", title: "Which channel should we start with?",
  intro: "Eight questions about how your buyers buy and what you can put behind it. You get the channel to start with, the one to add second, and the one to leave alone for now.",
  questions: [
    { id: "segment", text: "Have you chosen the one segment you are going after first?", options: [{ v: "yes", label: "Yes" }, { v: "notyet", label: "Not yet" }] },
    { id: "selfserve", text: "Can people try your product themselves, without talking to you?", options: [{ v: "yes", label: "Yes, a free trial or free plan" }, { v: "no", label: "No, it needs a demo or setup" }] },
    { id: "search", text: "Do buyers already search for a product like yours, in words you could bid on?", options: [{ v: "yes", label: "Yes, the category is searched" }, { v: "unsure", label: "Not sure" }, { v: "no", label: "No, we are creating the category" }] },
    { id: "acv", text: "What does a typical customer pay in the first year?", options: [{ v: "low", label: "Under $1,000" }, { v: "mid", label: "$1,000 to $25,000" }, { v: "high", label: "Over $25,000" }] },
    { id: "named", text: "Could you list the companies you want as customers, a few hundred at most?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No, the market is broad" }] },
    { id: "partner", text: "Does a partner, community or newsletter already have your buyers' attention, and would they work with you?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "Not yet" }] },
    { id: "budget", text: "What can you spend on paid acquisition each month?", options: [{ v: "none", label: "Nothing yet" }, { v: "small", label: "Under $5,000" }, { v: "real", label: "$5,000 or more" }] },
    { id: "founder", text: "Will a founder spend three hours a week writing and talking in public?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }] }
  ],
  channels: {
    search: { name: "Search, on the terms buyers already use", body: "Capture the demand that exists: paid search on high-intent terms if you have budget, and pages that answer the same questions so organic and AI answers catch up.", links: [L("/tools/paid-media-budget-allocator", "Paid Media Budget Allocator"), L("/tools/content-brief-builder", "Content Brief Builder"), L("/playbooks/geo-aeo-playbook", "GEO & AEO Playbook")] },
    outbound: { name: "Founder-led outbound to named accounts", body: "Pick the accounts, score them for fit, and have a founder start conversations with the few people who own the problem.", links: [L("/tools/icp-fit-scorer", "ICP Fit Scorer"), L("/playbooks/abm-playbook", "ABM Playbook")] },
    partner: { name: "A partner who already has the audience", body: "Borrow attention you don't have yet: a joint webinar, a guest issue, or a co-authored piece, with the follow-up agreed in writing before promotion.", links: [L("/playbooks/partner-co-marketing-playbook", "Partner Co-Marketing Playbook"), L("/tools/webinar-pipeline-planner", "Webinar Pipeline Planner")] },
    founder: { name: "Founder-led content and community", body: "When buyers aren't searching yet, create the demand: a founder writing about the problem in public, where the buyers already talk.", links: [L("/playbooks/founder-led-linkedin-playbook", "Founder-Led LinkedIn Playbook"), L("/playbooks/community-dark-social-playbook", "Community & Dark Social Playbook")] },
    paidsocial: { name: "Paid social to reach a defined audience", body: "Useful when there is budget but no search demand: target the job titles and companies you want, with an offer worth their time, and measure it with a holdout.", links: [L("/playbooks/digital-advertising-playbook", "Digital Advertising Playbook"), L("/tools/paid-media-budget-allocator", "Paid Media Budget Allocator")] },
    productled: { name: "Product-led loops and referrals", body: "Let the product do the first sale: a free trial or plan that shows value quickly, and a reason for happy users to invite others.", links: [L("/playbooks/product-led-growth-playbook", "Product-Led Growth Playbook"), L("/playbooks/customer-onboarding-retention-playbook", "Customer Onboarding & Retention Playbook")] },
    events: { name: "Industry events and in-person communities", body: "Go where the few hundred accounts you want already gather: one or two industry events and communities, with meetings booked before you arrive.", links: [L("/playbooks/abm-playbook", "ABM Playbook"), L("/tools/webinar-pipeline-planner", "Webinar Pipeline Planner")] }
  },
  score: function (a) {
    var s = { search: 0, outbound: 0, partner: 0, founder: 0, paidsocial: -99, productled: 0, events: 0 };
    s.search += a.search === "yes" ? 3 : a.search === "unsure" ? 1 : -3;
    if (a.budget === "real") s.search += 1; if (a.budget === "none") s.search -= 1;
    if (a.named === "yes") s.outbound += 3;
    s.outbound += a.acv === "high" ? 2 : a.acv === "mid" ? 1 : -3;
    if (a.partner === "yes") s.partner += 3;
    if (a.acv !== "low") s.partner += 1;
    s.founder += a.founder === "yes" ? 2 : -3;
    if (a.search === "no") s.founder += 1;
    if (a.budget === "real" && a.search !== "yes") s.paidsocial = 1 + (a.acv === "low" ? 1 : 0);
    if (a.selfserve === "yes" && a.acv === "low") s.productled += 3;
    if (a.selfserve === "no") s.productled -= 3;
    if (a.acv === "high") s.events += 2;
    if (a.named === "yes") s.events += 2;
    if (a.founder === "yes") s.events += 1;
    if (a.acv === "low") s.events -= 3;
    return s;
  },
  decide: function (a) {
    var r = CHANNEL.pick(a);
    if (a.segment === "notyet") r.steps.unshift({ head: "Choose your first segment before you commit to a channel", body: "The right channel depends on who you sell to first. The recommendation below still shows, so you can see where you would start; run the guide again once the segment is chosen.", links: [L("/playbooks/customer-segmentation-playbook", "Customer Segmentation Playbook")] });
    r.test = {
      head: "Test it before you commit",
      items: ["Set your pass mark first: the most you can pay per qualified meeting or activated trial, from your margin and payback target.", "Fix a budget and a window, usually four to eight weeks.", "Measure the next step, not clicks: qualified meetings, activated trials, pipeline created."],
      links: [L("/tools/unit-economics-calculator", "Unit Economics Calculator"), L("/blog/which-marketing-channels-first", "Which marketing channels should a startup start with?")]
    };
    return r;
  },
  pick: function (a) {
    var self = CHANNEL, s = self.score(a);
    var order = ["search", "outbound", "partner", "founder", "paidsocial", "productled", "events"];
    var ranked = order.slice().sort(function (x, y) { return s[y] - s[x] || order.indexOf(x) - order.indexOf(y); });
    var first = ranked[0], second = ranked[1];
    var avoid = [];
    if (a.budget === "none") avoid.push("Paid channels, until one free channel produces conversations you can predict.");
    if (a.search === "no") avoid.push("Paid search. There is little demand to capture yet, so you would pay to show ads to nobody.");
    if (a.acv === "low") avoid.push("Outbound. A first-year contract this small rarely pays for a sales-led motion.");
    if (a.founder === "no") avoid.push("Founder-led content. It only works if the founder actually shows up, every week.");
    if (a.acv === "low") avoid.push("Trade shows and events. The cost per conversation is too high for a contract this size.");
    if (a.selfserve === "no") avoid.push("A product-led motion, until people can reach value without a call.");
    if (!avoid.length) avoid.push("Starting three channels at once. Get one to the point where next month is predictable, then add the second.");
    var why = [];
    if (first === "search") why.push("Buyers already search, so there is demand to capture before you create any.");
    if (first === "outbound") why.push("You can name the accounts and the contract is large enough to pay for a conversation-led motion.");
    if (first === "partner") why.push("Someone else already has your buyers' attention, which is the fastest way to reach them.");
    if (first === "founder") why.push("Buyers aren't searching yet, so the first job is to create demand, and a founder's voice is the cheapest way to do it.");
    if (first === "paidsocial") why.push("There is budget but no search demand, so you need to reach a defined audience rather than wait for them.");
    if (first === "productled") why.push("People can try the product alone and the contract is small, so the product can make the first sale.");
    if (first === "events") why.push("The contract is large or you can name the accounts, so going where they gather can pay for the time.");
    if (s[first] <= 0) {
      return {
        title: "No starting channel fits your answers yet",
        summary: "Buyers aren't searching, the contract is small, and nobody is lined up to reach them for you. The first job is a reachable audience, not a channel.",
        steps: [{ head: "Find someone who already has the audience", body: "A partner, a community or a newsletter your buyers already read. Borrowing an audience is the fastest way to start when you have none.", links: self.channels.partner.links },
                { head: "Or reconsider a founder showing up", body: "Three hours a week of writing and talking in public, where buyers already are, is how most categories without search demand get started.", links: self.channels.founder.links }],
        avoid: avoid, why: ["None of the usual starting channels scores above zero on your answers."], ranked: ranked, scores: s
      };
    }
    var c1 = self.channels[first], c2 = s[second] > 0 ? self.channels[second] : null;
    var steps = [{ head: "First: " + c1.name, body: c1.body, links: c1.links }];
    if (c2) steps.push({ head: "Second: " + c2.name, body: c2.body, links: c2.links });
    return {
      title: "Start with: " + c1.name.charAt(0).toLowerCase() + c1.name.slice(1),
      summary: c2 ? "Then add " + c2.name.charAt(0).toLowerCase() + c2.name.slice(1) + " once the first is predictable."
                  : "Hold off on a second channel: none of the others fits your answers yet. Look again once the first is predictable.",
      steps: steps,
      avoid: avoid, why: why, ranked: ranked, scores: s
    };
  }
};

var HIRE = {
  id: "hire", title: "Do we need a marketing hire, and which one?",
  intro: "Five questions about where the company is and what already works. You get the kind of marketing help that fits now, and what to wait for.",
  questions: [
    { id: "stage", text: "Where is the company?", options: [{ v: "prepmf", label: "Before product-market fit" }, { v: "seed", label: "Early customers, still finding what repeats" }, { v: "a", label: "Repeatable sales, around Series A" }, { v: "b", label: "Series B or later" }] },
    { id: "positioning", text: "Can you say in one sentence who it's for and why they choose you, and do customers say it back?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "Not really" }] },
    { id: "channel", text: "Is at least one channel producing pipeline you could predict next month?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }] },
    { id: "who", text: "Who does marketing today?", options: [{ v: "founder", label: "A founder" }, { v: "junior", label: "A junior marketer or generalist" }, { v: "agency", label: "An agency or freelancers" }, { v: "nobody", label: "Nobody, really" }] },
    { id: "budget", text: "What can you spend on marketing people this year, all in?", options: [{ v: "low", label: "Under $150,000" }, { v: "mid", label: "$150,000 to $300,000" }, { v: "high", label: "Over $300,000" }] }
  ],
  decide: function (a) {
    var steps = [], avoid = [], why = [], title, summary;
    var lead = [L("/tools/marketing-leadership-cost-comparator", "Marketing Leadership Cost Comparator"), L("/services/fractional-marketing-leadership", "Fractional marketing leadership")];
    if (a.stage === "prepmf" || a.positioning === "no") {
      title = "Keep it founder-led, and get senior help on positioning";
      summary = "A hire now would be asked to market something that isn't settled yet.";
      steps.push({ head: "Settle the positioning first", body: "Work out who it is for and why they choose you, and test it with customers until they say it back.", links: [L("/tools/positioning-statement-generator", "Positioning Statement Generator"), L("/templates/positioning-messaging-workbook", "Positioning & Messaging Workbook")] });
      steps.push({ head: "Borrow seniority, don't hire it", body: "A few hours a month from an experienced marketer is enough at this point: someone to pressure-test the positioning and the first experiments.", links: lead });
      avoid.push("A full-time head of marketing. There is no settled story or working channel for them to scale yet.");
      avoid.push("A junior hire on their own. They need a clear message and a channel to run, and neither exists yet.");
      why.push(a.stage === "prepmf" ? "Before product-market fit, the product and the story are still moving." : "Without settled positioning, every channel test is measuring the message as much as the channel.");
    } else if (a.channel === "no") {
      title = "Hire a senior part-time leader to find the first channel";
      summary = "The job is to find one channel that repeats. That takes judgement more than hours.";
      steps.push({ head: "A fractional head of marketing", body: "Someone who has found channels before, for a set number of days a month, with a clear goal: one channel you could predict next month.", links: lead });
      if (a.budget !== "low") steps.push({ head: "Plus a hands-on generalist", body: "Someone to run the experiments day to day, so the senior time goes on decisions rather than execution.", links: [L("/tools/marketing-maturity-scorecard", "Marketing Maturity Scorecard")] });
      avoid.push("Hiring a channel specialist. You don't know which channel yet.");
      why.push("Positioning is settled but no channel repeats yet, so the scarce thing is experience in choosing and testing channels.");
    } else if ((a.stage === "a" || a.stage === "b") && a.budget === "high") {
      title = "Hire a full-time head of marketing";
      summary = "A working channel and the budget to grow it: now the job is to scale it and add the second.";
      steps.push({ head: "A full-time head of marketing", body: "Someone to own the number, scale the channel that works, and build the team around it. Keep whoever runs the working channel.", links: [L("/tools/marketing-leadership-cost-comparator", "Marketing Leadership Cost Comparator")] });
      avoid.push("Hiring the team before the leader. Let the head of marketing shape it.");
      why.push("There is a channel to scale, a story to scale it with, and a budget that pays for a full-time leader.");
    } else {
      title = "Hire a hands-on marketer to scale the channel that works";
      summary = "One channel repeats. The next hire makes more of it, not a new strategy.";
      steps.push({ head: "A channel owner", body: "A hands-on marketer with experience in the channel that works, measured on the pipeline it produces.", links: [L("/tools/marketing-leadership-cost-comparator", "Marketing Leadership Cost Comparator")] });
      if (a.who === "junior" || a.who === "nobody") steps.push({ head: "With senior oversight a few days a month", body: "Someone experienced to set the targets and review the numbers, until the company can afford a full-time leader.", links: [L("/services/fractional-marketing-leadership", "Fractional marketing leadership")] });
      avoid.push("A senior leader with no budget to lead. The channel needs hands first.");
      why.push("A channel already works, so the constraint is execution capacity rather than strategy.");
    }
    if (a.who === "agency") avoid.push("Leaving the number with the agency. Keep the agency for execution, but someone inside the company must own the result.");
    return { title: title, summary: summary, steps: steps, avoid: avoid, why: why };
  }
};

var STACK = {
  id: "stack", title: "Which marketing tools do we need now, and which can wait?",
  intro: "Five questions about what you already have and how many leads you handle. You get the next three things to set up, in order, and what to skip for now.",
  questions: [
    { id: "tracking", text: "Can you see which channel each lead or signup came from, with conversion events firing?", options: [{ v: "yes", label: "Yes" }, { v: "unsure", label: "Partly, or not sure" }, { v: "no", label: "No" }] },
    { id: "crm", text: "Is there a CRM or customer database the team actually uses?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No, spreadsheets and inboxes" }] },
    { id: "email", text: "Do you email leads or customers from a proper email tool, with your domain authenticated?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No, or not sure" }] },
    { id: "volume", text: "How many new leads or signups a month?", options: [{ v: "low", label: "Under 100" }, { v: "mid", label: "100 to 1,000" }, { v: "high", label: "Over 1,000" }] },
    { id: "motion", text: "How do customers buy?", options: [{ v: "self", label: "Self-serve" }, { v: "sales", label: "Through sales" }, { v: "both", label: "Both" }] }
  ],
  decide: function (a) {
    var steps = [], avoid = [];
    if (a.tracking !== "yes") steps.push({ head: "Tracking you can trust", body: "Analytics with conversion events and campaign tags on every link, checked end to end. Every later tool depends on knowing where leads came from.", links: [L("/playbooks/analytics-playbook", "Analytics Playbook"), L("/tools/website-grader", "Website Conversion Audit")] });
    if (a.crm === "no") steps.push(a.motion === "self"
      ? { head: "One place for customer records", body: "A simple customer database joined to product sign-ups, so you can see who converts and who leaves.", links: [L("/playbooks/analytics-playbook", "Analytics Playbook")] }
      : { head: "A CRM the team will use", body: "Pick the simplest one the sales team will keep up to date. An unused CRM is worse than a spreadsheet.", links: [L("/reports/marketing-technology-stack-landscape-2025-2026", "Marketing Technology Stack Landscape")] });
    if (a.email === "no") steps.push({ head: "An email tool, with your domain authenticated", body: "Send from a proper tool with SPF, DKIM and DMARC set up, or your emails land in spam no matter how good they are.", links: [L("/tools/email-authentication-checker", "Email Authentication Checker")] });
    if (a.volume === "high" && steps.length < 3) steps.push({ head: "Automation and lead scoring", body: "At this volume, routing and scoring save real time. Score on fit first, behaviour second.", links: [L("/tools/icp-fit-scorer", "ICP Fit Scorer")] });
    if (a.volume === "high" && steps.length < 3) steps.push({ head: "A way to measure what spend actually causes", body: "With enough volume, a lightweight marketing mix model or holdout tests tell you which spend is incremental.", links: [L("/templates/mmm-lite-starter-kit", "MMM-Lite Starter Kit")] });
    if (a.volume !== "high" && steps.length < 3) steps.push({ head: "Nothing new: use what you have", body: "The basics are in place. Before adding tools, check that the ones you pay for are fully used.", links: [L("/reports/marketing-technology-stack-landscape-2025-2026", "Marketing Technology Stack Landscape")] });
    if (a.volume === "low") { avoid.push("Marketing automation platforms and lead scoring. Under a hundred leads a month, a person can read every one."); avoid.push("Intent data and ABM platforms, until you have the accounts and the sales capacity to act on them."); }
    if (a.volume !== "high") avoid.push("Marketing mix modelling. It needs more volume and spend history than you have yet.");
    if (a.tracking !== "yes") avoid.push("Any attribution tool, until the basic tracking is right. It will only automate the wrong answer.");
    if (!avoid.length) avoid.push("Buying a tool to fix a process nobody owns. Name the owner first.");
    return { title: "Set up next: " + steps[0].head.charAt(0).toLowerCase() + steps[0].head.slice(1), summary: steps.length > 1 ? "Then " + steps.slice(1).map(function (s) { return s.head.charAt(0).toLowerCase() + s.head.slice(1); }).join(", then ") + "." : "", steps: steps.slice(0, 3), avoid: avoid, why: [] };
  }
};

var GUIDES = [CHANNEL, HIRE, STACK];
function byId(id) { for (var i = 0; i < GUIDES.length; i++) if (GUIDES[i].id === id) return GUIDES[i]; return null; }
function complete(g, a) { return g.questions.every(function (q) { return q.options.some(function (o) { return o.v === a[q.id]; }); }); }
function evaluate(id, answers) {
  var g = byId(id); if (!g) return { ok: false, error: "unknown_guide" };
  if (!complete(g, answers || {})) return { ok: false, error: "incomplete" };
  var r = g.decide(answers); r.ok = true; r.guide = id; return r;
}
// Every combination of answers, for the guardrail.
function allAnswers(id) {
  var g = byId(id), out = [{}];
  g.questions.forEach(function (q) { var next = []; out.forEach(function (a) { q.options.forEach(function (o) { var c = {}; for (var k in a) c[k] = a[k]; c[q.id] = o.v; next.push(c); }); }); out = next; });
  return out;
}
return { GUIDES: GUIDES, evaluate: evaluate, allAnswers: allAnswers, byId: byId };
})();
/* aaj:engine:end */

/* ─────────────────────────── cli ─────────────────────────── */

const SITE = 'https://aajconsult.com';
const E = AAJ_GUIDES;

function inputError(msg, hint) { const e = new Error(msg); e.hint = hint; e.isInputError = true; return e; }

function questions(g, answers) {
  return g.questions.map((q) => {
    const ok = q.options.some((o) => o.v === answers[q.id]);
    return `  ${ok ? ' ' : '?'} ${q.id}: ${q.options.map((o) => `${o.v} (${o.label})`).join(' | ')}\n      ${q.text}`;
  }).join('\n');
}

function run(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw inputError('Config must be a JSON object.');
  const g = E.byId(cfg.guide);
  if (!g) throw inputError(`"guide" must be one of: ${E.GUIDES.map((x) => x.id).join(', ')}.`);
  const answers = cfg.answers || {};
  if (typeof answers !== 'object' || Array.isArray(answers)) throw inputError('"answers" must be an object of question id to value.');
  const ids = g.questions.map((q) => q.id);
  const unknown = Object.keys(answers).filter((k) => ids.indexOf(k) < 0);
  if (unknown.length) throw inputError(`Unknown question${unknown.length > 1 ? 's' : ''} for "${g.id}": ${unknown.join(', ')}.`, `Questions are: ${ids.join(', ')}.`);
  const bad = g.questions.filter((q) => answers[q.id] !== undefined && !q.options.some((o) => o.v === answers[q.id]));
  if (bad.length) throw inputError(bad.map((q) => `"${q.id}" must be one of: ${q.options.map((o) => o.v).join(', ')}.`).join(' '));
  return { guide: g, answers, result: E.evaluate(g.id, answers) };
}

function render(r) {
  const { guide: g, answers, result: x } = r;
  const L = [];
  L.push(`${g.title}`);
  if (!x.ok) {
    const missing = g.questions.filter((q) => !q.options.some((o) => o.v === answers[q.id])).map((q) => q.id);
    L.push('');
    L.push(`No recommendation yet: ${missing.length} of ${g.questions.length} answers missing (${missing.join(', ')}).`);
    L.push('Answer every question (? = missing):');
    L.push(questions(g, answers));
    return L.join('\n');
  }
  L.push('');
  L.push(x.title);
  if (x.summary) L.push(x.summary);
  L.push('');
  x.steps.forEach((s, i) => {
    L.push(`${i + 1}. ${s.head}`);
    L.push(`   ${s.body}`);
    s.links.forEach((l) => L.push(`   - ${l.label}: ${SITE}${l.href}`));
  });
  if (x.test) {
    L.push('');
    L.push(x.test.head);
    x.test.items.forEach((t) => L.push(`  - ${t}`));
    x.test.links.forEach((l) => L.push(`  - ${l.label}: ${SITE}${l.href}`));
  }
  L.push('');
  L.push('Leave alone for now');
  x.avoid.forEach((a) => L.push(`  - ${a}`));
  if (x.why && x.why.length) {
    L.push('');
    L.push('Why');
    x.why.forEach((w) => L.push(`  - ${w}`));
  }
  L.push('');
  L.push('These rules are judgement, not benchmarks. Check them against your own numbers.');
  return L.join('\n');
}

// Example inputs only: a fictional company's answers, not a benchmark profile.
const DEMO = {
  guide: 'channel',
  answers: { segment: 'yes', selfserve: 'no', search: 'unsure', acv: 'high', named: 'yes', partner: 'no', budget: 'small', founder: 'yes' },
};

function main() {
  const argv = process.argv.slice(2);
  const jsonOut = argv.includes('--json');
  const rest = argv.filter((a) => a !== '--json');
  const arg = rest[0] === '--demo' ? undefined : rest[0];
  if (arg === '--help' || arg === '-h') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*/, ''));
    process.exit(0);
  }
  let cfg;
  if (arg) {
    try { cfg = JSON.parse(arg); }
    catch (e) { console.error('error: Invalid JSON. Run --help for the schema.\n       ' + e.message); process.exit(1); }
  } else {
    cfg = DEMO;
    if (!jsonOut) console.log('(no config - demo: the channel guide for a fictional company with a large first-year contract, a named account list, a small paid budget and a founder willing to write)\n');
  }
  try {
    const r = run(cfg);
    if (jsonOut) console.log(JSON.stringify({ guide: r.guide.id, answers: r.answers, result: r.result }, null, 2));
    else console.log(render(r));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { evaluate: E.evaluate, allAnswers: E.allAnswers, byId: E.byId, GUIDES: E.GUIDES, run };
