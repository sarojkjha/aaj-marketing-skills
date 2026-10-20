#!/usr/bin/env node
/*
 * AAJ SEO Content Brief - brief checker
 * Part of the "seo-content-brief" Agent Skill.
 *
 * Checks a content brief before anyone writes the page: reads the intent from
 * the titles that already rank, checks the answer block is 40-60 words, finds
 * an existing page that already serves the same intent (cannibalisation),
 * counts headings that are not phrased as questions, and refuses a brief with
 * no named sources. Then it writes the brief out in the same format as the
 * AAJ Content Brief Builder (aajconsult.com/tools/content-brief-builder),
 * which runs this exact code.
 *
 * USAGE
 *   node brief-check.js                       # demo
 *   node brief-check.js '<json-config>'       # your own
 *   node brief-check.js '<json-config>' --json
 *   node brief-check.js --help
 *
 * CONFIG (JSON) - every field is optional; a missing field is reported, not an error
 *
 *   {
 *     "query":    "the target query, as someone would type it",
 *     "action":   "the next action this page routes to",
 *     "serp":     ["title that ranks today", "..."],        // or one string, a title per line
 *     "intent":   "informational" | "commercial" | "transactional" | "navigational",
 *     "format":   "guide" | "listicle" | "comparison" | "definition" | "tool" | "template",
 *     "answer":   "the 40-60 word answer block",
 *     "existing": ["/blog/some-page - commercial"],          // your pages on the topic, with the intent each serves
 *     "entities": ["entity or subtopic the page must cover"],
 *     "headings": ["H2 phrased as a question?"],
 *     "sources":  ["named source the writer must cite - URL"],
 *     "linksIn":  ["/existing/page/that/links/in"],
 *     "schema":   "Article" | "FAQPage" | "HowTo" | "Product",
 *     "success":  "the outcome that makes the page worth having written"
 *   }
 *
 * RULES (the same ones the page applies)
 *   - Intent is read from the ranking titles: each title votes once for its
 *     strongest format signal (listicle, comparison, tool, template,
 *     definition, guide); the top format implies the intent.
 *   - Blockers: no query, no next action, no ranking titles, no intent, no
 *     answer block, an existing page already serving the chosen intent, no
 *     named sources. Anything else missing is a smaller gap.
 *   - The verdict is "Not ready for a writer" with any blocker, "Ready, with
 *     gaps" with only smaller gaps, and "Ready for a writer" with none.
 *
 * The signal words are pattern rules, not a model of the search engine: read
 * the titles yourself when the tally is close.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin */
var FIELDS = ["query", "action", "serp", "intent", "format", "answer", "existing", "entities", "headings", "sources", "linksIn", "schema", "success"];
var LIST_FIELDS = ["serp", "existing", "entities", "headings", "sources", "linksIn"];
var ANSWER_MIN = 40, ANSWER_MAX = 60;  // the answer-block window the page and the skill both brief for

function inputError(msg, hint) {
  var e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  return e;
}
function text(v) { return String(v == null ? "" : v).trim(); }
// A list field may be one string with a line per item (as typed into the page) or an array.
function toLines(v) {
  var s = Array.isArray(v) ? v.map(function (x) { return x == null ? "" : String(x); }).join("\n") : text(v);
  return s.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
}
function words(s) { return String(s).split(/\s+/).filter(Boolean).length; }

// Format signals in the titles that already rank. Each title votes once,
// for the strongest signal it carries.
var SIGNALS = [
  ["listicle",   /^\s*\d+\s|\btop\s+\d+\b|\bbest\b|\b\d+\s+(best|ways|tips|tools|examples|templates)\b/i],
  ["comparison", /\bvs\.?\b|\bversus\b|\bcompared\b|\balternatives?\b/i],
  ["tool",       /\bcalculator\b|\btool\b|\bgenerator\b|\bchecker\b|\bscorer\b/i],
  ["template",   /\btemplate\b|\bchecklist\b|\bworkbook\b|\bdownload\b|\bexample files?\b/i],
  ["definition", /^what (is|are)\b|\bdefinition\b|\bmeaning\b/i],
  ["guide",      /\bguide\b|\bhow to\b|\bplaybook\b|\bframework\b|\bcomplete\b/i]
];
var FORMAT_LABEL = {
  listicle: "Listicle or roundup", comparison: "Comparison or versus", tool: "Tool or calculator",
  template: "Template or download", definition: "Definition", guide: "Guide or explainer"
};
// The wording of each format as the page's format menu shows it (used in the exported brief).
var FORMAT_OPTION = {
  guide: "Guide or explainer", listicle: "Listicle or roundup", comparison: "Comparison or versus",
  definition: "Definition or \"what is\"", tool: "Tool or calculator", template: "Template or download"
};
var INTENT_FOR = {
  listicle: "commercial", comparison: "commercial", tool: "transactional",
  template: "transactional", definition: "informational", guide: "informational"
};
var INTENT_LABEL = {
  informational: "Informational", commercial: "Commercial investigation",
  transactional: "Transactional", navigational: "Navigational"
};
var SCHEMAS = ["Article", "FAQPage", "HowTo", "Product"];

function normalise(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw inputError("Input must be a JSON object.");
  var unknown = Object.keys(input).filter(function (k) { return FIELDS.indexOf(k) < 0; });
  if (unknown.length) throw inputError("Unknown field" + (unknown.length > 1 ? "s" : "") + ": " + unknown.join(", ") + ".", "Fields are: " + FIELDS.join(", ") + ".");
  var n = {};
  FIELDS.forEach(function (k) { n[k] = LIST_FIELDS.indexOf(k) >= 0 ? toLines(input[k]) : text(input[k]); });
  if (n.intent && !INTENT_LABEL.hasOwnProperty(n.intent)) throw inputError("\"intent\" must be one of: " + Object.keys(INTENT_LABEL).join(", ") + ".");
  if (n.format && !FORMAT_OPTION.hasOwnProperty(n.format)) throw inputError("\"format\" must be one of: " + Object.keys(FORMAT_OPTION).join(", ") + ".");
  if (n.schema && SCHEMAS.indexOf(n.schema) < 0) throw inputError("\"schema\" must be one of: " + SCHEMAS.join(", ") + ".");
  return n;
}

function readSerp(titles) {
  if (!titles.length) return null;
  var tally = {}, votes = 0;
  titles.forEach(function (t) {
    for (var i = 0; i < SIGNALS.length; i++) {
      if (SIGNALS[i][1].test(t)) { tally[SIGNALS[i][0]] = (tally[SIGNALS[i][0]] || 0) + 1; votes++; return; }
    }
  });
  var ranked = Object.keys(tally).map(function (k) { return [k, tally[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
  return { titles: titles.length, votes: votes, ranked: ranked, top: ranked[0] ? ranked[0][0] : null };
}

function build(input) {
  var n = normalise(input);
  var serp = readSerp(n.serp);
  var intent = n.intent, format = n.format;
  var answer = n.answer, aw = words(answer);
  var ents = n.entities, heads = n.headings, srcs = n.sources;
  var existing = n.existing;

  var issues = [];
  var blockers = 0;
  function add(bad, label, why) {
    issues.push({ bad: bad, label: label, why: why });
    if (bad === "block") blockers++;
  }

  if (!n.query) add("block", "No target query", "One query, as someone would type it.");
  if (!n.action) add("block", "No next action", "A brief without a defined next action produces content that ranks and converts nothing.");

  if (!serp) {
    add("block", "No ranking results pasted", "Intent is being inferred rather than read. Paste the titles that rank today, or mark the brief as unverified.");
  } else if (serp.top && format && serp.top !== format) {
    add("warn", "The results disagree with your format",
      "What ranks looks like “" + FORMAT_LABEL[serp.top] + "”; you are planning “" + FORMAT_LABEL[format] + "”. Arguing with the SERP rarely works — do it deliberately or not at all.");
  }
  if (serp && serp.top && intent && INTENT_FOR[serp.top] !== intent) {
    add("warn", "The results disagree with your intent",
      "The ranking pages read as " + INTENT_LABEL[INTENT_FOR[serp.top]].toLowerCase() + "; you have chosen " + INTENT_LABEL[intent].toLowerCase() + ".");
  }
  if (!intent) add("block", "Intent not chosen", "Everything below this decision depends on it.");
  if (!format) add("warn", "Format not chosen", "One intent per page, one format per page.");

  if (!answer) {
    add("block", "No answer block", "If you cannot write it, the topic is not clear enough to brief.");
  } else if (aw < ANSWER_MIN || aw > ANSWER_MAX) {
    add("warn", "Answer block is " + aw + " words",
      aw < ANSWER_MIN ? "Under 40 words usually means the answer is not actually answered." : "Over 60 words is past what an answer engine will lift cleanly.");
  }

  // cannibalisation: an existing page claiming the same intent
  var clash = existing.filter(function (l) {
    return intent && new RegExp("\\b" + intent + "\\b", "i").test(l);
  });
  if (clash.length) {
    add("block", "An existing page already serves this intent",
      clash.join(" · ") + " — usually the answer is to improve that page rather than publish a second one.");
  }

  if (!ents.length) add("warn", "No entities listed", "Completeness against the topic beats word count.");
  if (!heads.length) {
    add("warn", "No headings", "Phrase H2s as the questions people actually ask.");
  } else {
    var notQ = heads.filter(function (h) { return !/\?\s*$/.test(h); });
    if (notQ.length) add("warn", notQ.length + " of " + heads.length + " headings are not questions",
      "Question-shaped H2s answered in the first two sentences are what make a page extractable.");
  }

  if (!srcs.length) add("block", "No named sources",
    "“Include a statistic here” produces a fabricated statistic. Name the source or supply the data.");

  if (!n.schema) add("warn", "No schema type", "Article, FAQPage, HowTo or Product.");
  if (!n.success) add("warn", "No success criteria", "The outcome that would make this page worth having written.");

  if (/\b\d{3,4}\s*(words|word count)\b/i.test(n.query + " " + n.success)) {
    add("warn", "A word count is being briefed", "Length is an output of covering the topic, not an input.");
  }

  var gaps = issues.length - blockers;
  return { serp: serp, issues: issues, blockers: blockers, aw: aw,
           answerInWindow: aw >= ANSWER_MIN && aw <= ANSWER_MAX,
           verdict: blockers ? "Not ready for a writer" : (issues.length ? "Ready, with gaps" : "Ready for a writer"),
           gaps: gaps,
           counts: { ents: ents.length, heads: heads.length, srcs: srcs.length } };
}

function briefText(input) {
  var n = normalise(input);
  var out = [];
  out.push("# Content brief: " + (n.query || "(no query)"));
  out.push("");
  out.push("**Intent:** " + (INTENT_LABEL[n.intent] || "(not set)"));
  out.push("**Format:** " + (n.format ? FORMAT_OPTION[n.format] : "(not set)"));
  out.push("**Next action:** " + (n.action || "(not set)"));
  out.push("**Schema:** " + (n.schema || "(not set)"));
  out.push("");
  out.push("## Answer block (40-60 words, near the top)");
  out.push(n.answer || "(not written)");
  out.push("");
  out.push("## Must cover");
  (n.entities.length ? n.entities : ["(none listed)"]).forEach(function (e) { out.push("- " + e); });
  out.push("");
  out.push("## Headings");
  (n.headings.length ? n.headings : ["(none listed)"]).forEach(function (h) { out.push("- " + h); });
  out.push("");
  out.push("## Sources the writer must cite");
  (n.sources.length ? n.sources : ["(none named - do not let the writer invent one)"]).forEach(function (s) { out.push("- " + s); });
  out.push("");
  out.push("## Internal links in");
  (n.linksIn.length ? n.linksIn : ["(none)"]).forEach(function (l) { out.push("- " + l); });
  out.push("");
  out.push("## Existing pages on this topic");
  (n.existing.length ? n.existing : ["(none)"]).forEach(function (l) { out.push("- " + l); });
  out.push("");
  out.push("## Success criteria");
  out.push(n.success || "(not set)");
  out.push("");
  var s = readSerp(n.serp);
  out.push("## Intent evidence");
  out.push(s ? (s.titles + " ranking titles read as: " +
    s.ranked.map(function (r) { return FORMAT_LABEL[r[0]] + " x" + r[1]; }).join(", "))
    : "No ranking results were pasted - intent is inferred, not read. Verify before writing.");
  out.push("");
  out.push("_Built with the AAJ Content Brief Builder - aajconsult.com/tools/content-brief-builder_");
  return out.join("\n");
}
/* aaj:core:end */

/* ─────────────────────────── cli ─────────────────────────── */

function render(input) {
  const b = build(input);
  const n = normalise(input);
  const L = [];
  L.push(`Content brief check - ${n.query || '(no query)'}`);
  L.push(`Verdict: ${b.verdict} (${b.blockers} blocker${b.blockers === 1 ? '' : 's'}, ${b.gaps} smaller gap${b.gaps === 1 ? '' : 's'})`);
  L.push(`Answer block: ${b.aw} words (${b.answerInWindow ? 'inside the 40-60 window' : 'target 40-60'})`);
  if (b.serp) {
    const r = b.serp.ranked.map((x) => `${FORMAT_LABEL[x[0]]} x${x[1]}`).join(', ');
    L.push(`What ranks today: ${b.serp.titles} titles read as: ${r || 'no clear format signal'}` +
      (b.serp.top ? `. That points to ${INTENT_LABEL[INTENT_FOR[b.serp.top]]} intent.` : '.'));
  } else {
    L.push('Intent is inferred: nothing was pasted from the results page, so the intent is a guess rather than a reading.');
  }
  L.push('');
  L.push('What is missing');
  if (!b.issues.length) L.push('  Nothing missing.');
  b.issues.forEach((i) => L.push(`  ${i.bad === 'block' ? '!  Blocker: ' : '-  '}${i.label}. ${i.why}`));
  L.push('');
  L.push('The brief');
  L.push('---------');
  L.push(briefText(input));
  return L.join('\n');
}

// Example inputs only: the query, titles and pages are invented to show the checks firing.
const DEMO = {
  query: 'how to choose a pricing model for b2b saas',
  action: 'Pricing ARPU Modeler',
  serp: [
    'How to Choose a SaaS Pricing Model: A Complete Guide',
    '7 SaaS Pricing Models Compared',
    'SaaS Pricing Models: Per Seat vs Usage-Based',
    'Pricing Strategy Playbook for B2B SaaS',
    'What Is Value-Based Pricing?',
    'Usage-based pricing guide for startups',
  ],
  intent: 'commercial',
  format: 'comparison',
  answer: 'Pick the pricing model that tracks the value a customer gets: per seat when value grows with users, usage-based when it grows with volume, and flat tiers when neither scales cleanly.',
  existing: ['/blog/saas-pricing-models - commercial'],
  entities: ['per-seat pricing', 'usage-based pricing', 'tiered pricing', 'value metric', 'packaging'],
  headings: ['Which pricing model fits a B2B SaaS product?', 'Per seat or usage-based?', 'How to test a pricing change'],
  sources: ['Your own win-loss notes on pricing objections (supplied by sales)'],
  linksIn: ['/tools/pricing-arpu-modeler'],
  schema: 'Article',
  success: 'Cited in AI answers for the query; visitors start the Pricing ARPU Modeler from this page',
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
    if (!jsonOut) console.log('(no config - demo with example inputs: the results read as a guide, the plan is a comparison, the answer block is short, and an existing page already serves the intent)\n');
  }
  try {
    if (jsonOut) console.log(JSON.stringify({ result: build(cfg), brief: briefText(cfg) }, null, 2));
    else console.log(render(cfg));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { build, briefText, normalise, readSerp, words, FIELDS, FORMAT_LABEL, FORMAT_OPTION, INTENT_FOR, INTENT_LABEL, SCHEMAS, ANSWER_MIN, ANSWER_MAX };
