#!/usr/bin/env node
/*
 * AAJ SEO Content Brief - brief checker
 * Part of the "seo-content-brief" Agent Skill.
 *
 * Checks a content brief before anyone writes the page: reads the intent from
 * the titles that already rank, checks the answer block is 40-60 words, finds
 * a page of yours that already serves the same intent or already shows for the
 * query in Search Console (cannibalisation), counts headings that are not
 * phrased as questions, refuses a brief with no named source, and marks every
 * line an AI proposed that nobody has checked. Then it writes the brief out in
 * the same format as the AAJ Content Brief Builder
 * (aajconsult.com/tools/content-brief-builder), which runs this exact code.
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
 *     "audience": "who reads the page and what they already know",
 *     "serp":     ["title that ranks today - https://its.link", "..."],  // or one string, a title per line; the link is optional
 *     "intent":   "informational" | "commercial" | "transactional" | "navigational",
 *     "format":   "guide" | "listicle" | "comparison" | "definition" | "tool" | "template",
 *     "answer":   "the 40-60 word answer block",
 *     "existing": ["/blog/some-page - commercial"],          // your pages on the topic, with the intent each serves
 *     "pages":    [{ "page": "https://example.com/blog/some-page", "clicks": 12, "impressions": 410, "position": 9.4 }],
 *                                                            // the Pages table of a Search Console export filtered to one query
 *     "pagesFor": "the query that export was filtered to",   // required with "pages"
 *     "updates":  "/blog/some-page",                         // set when this brief rewrites a page you already have
 *     "entities": ["entity or subtopic the page must cover"],
 *     "headings": ["H2 phrased as a question?"],
 *     "sources":  ["named source the writer must cite - URL"],
 *     "linksIn":  ["/existing/page/that/links/in"],
 *     "schema":   "Article" | "Product" | "SoftwareApplication" | "FAQPage" | "HowTo",
 *     "success":  "the outcome that makes the page worth having written",
 *     "notes":    "anything else the writer needs: tone, what to leave out",
 *     "drafts":   ["a line above, exactly as written, that an AI proposed and nobody has checked"]
 *   }
 *
 * RULES (the same ones the page applies)
 *   - Intent is read from the ranking titles: each title votes once for its
 *     strongest format signal (listicle, comparison, tool, template,
 *     definition, guide); the top format implies the intent. A link after a
 *     title is ignored, and a year at the start of a title is not a list count.
 *   - Search Console rows: a page holds the query when it has 20% or more of
 *     the query's impressions, and it is on page one at an average position of
 *     10 or better. Both are rules of this engine, drawn at the same two
 *     numbers as the search-demand-reader engine's, not benchmarks. Rows that
 *     differ only after a # are one page. A page that holds the query on page one is a
 *     blocker unless the brief updates it or you list it under "existing" with
 *     another intent; one that holds it lower down is a smaller gap. Rows
 *     filtered to another query are left out.
 *   - "drafts" lists lines an AI proposed (ranking titles, entities, headings,
 *     sources) that nobody has checked. They are marked in the brief, they
 *     keep the verdict at "Ready, with gaps", and a source that is still a
 *     draft does not count as a named source.
 *   - Blockers: no query, no next action, no ranking titles, no intent, no
 *     answer block, an existing page already serving the chosen intent, a page
 *     of yours already on page one for the query, no named source. Anything
 *     else missing is a smaller gap.
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
// Windows shells (PowerShell, cmd) can pass a JSON payload with its quotes
// backslash-escaped, i.e. {\"a\":1}. Undo that only when the payload opens that
// way, so JSON with legitimately escaped quotes inside strings is left alone.
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^\s*[\[{]\s*\\"/.test(a) ? a.replace(/\\"/g, '"') : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin */
var TEXT_FIELDS = ["query", "action", "audience", "intent", "format", "answer", "pagesFor", "updates", "schema", "success", "notes"];
var LIST_FIELDS = ["serp", "existing", "entities", "headings", "sources", "linksIn", "drafts"];
var FIELDS = ["query", "action", "audience", "serp", "intent", "format", "answer", "existing", "pages", "pagesFor", "updates",
  "entities", "headings", "sources", "linksIn", "schema", "success", "notes", "drafts"];
var DRAFT_FIELDS = ["serp", "entities", "headings", "sources"];  // the lists an AI may have filled in
var PAGE_FIELDS = ["page", "clicks", "impressions", "ctr", "position"];
var ANSWER_MIN = 40, ANSWER_MAX = 60;  // the answer-block window the page and the skill both brief for
// Search Console rows. Both lines are rules of this engine, drawn at the same two numbers as the search-demand-reader
// engine draws its own. They are not benchmarks.
var HOLD_SHARE_PCT = 20;  // a page with this share of the query's impressions, or more, holds the query
var PAGE_ONE = 10;        // an average position of 10 or better is page one
var MAX_PAGES = 1000;     // Search Console exports at most 1,000 rows
var LIST_ROWS = 10;       // rows of the Search Console table written into the brief

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
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
function fmtInt(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function listOf(parts) { return parts.length < 2 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1]; }

// A pasted result may carry its link ("Title - https://...", "[Title](https://...)") and a bullet or list
// number in front. The title is what is left; the link is kept for the brief and never read for signals.
var LINK = "(?:https?:\\/\\/|www\\.)[^\\s<>()\\[\\]|]+";
function titleOf(line) {
  var s = String(line)
    .replace(new RegExp("\\[([^\\]]+)\\]\\(\\s*" + LINK + "\\s*\\)", "gi"), "$1")
    .replace(new RegExp(LINK, "gi"), " ")
    .replace(/\(\s*\)|\[\s*\]|<\s*>/g, " ");
  s = s.replace(/^\s*(?:[-*\u2022]\s+|\d{1,2}[.)]\s+)/, "");
  return s.replace(/[\s|\-\u2013\u2014:\u00b7]+$/, "").replace(/^[\s|\u00b7]+/, "").replace(/\s+/g, " ");
}
function linkOf(line) {
  var m = new RegExp(LINK, "i").exec(String(line));
  return m ? m[0].replace(/[.,;:]+$/, "") : "";
}

// Format signals in the titles that already rank. Each title votes once,
// for the strongest signal it carries. A year in front ("2026 Guide to ...") is not a list count,
// and "best practices" is a guide, not a roundup.
var SIGNALS = [
  ["listicle",   /^\s*(?!(?:19|20)\d\d\b)\d+\s|\btop\s+\d+\b|\bbest\b(?!\s+practices?\b)|\b\d+\s+(best|ways|tips|tools|examples|templates)\b/i],
  ["comparison", /\bvs\.?\b|\bversus\b|\bcompared\b|\balternatives?\b/i],
  ["tool",       /\bcalculator\b|\btool\b|\bgenerator\b|\bchecker\b|\bscorer\b/i],
  ["template",   /\btemplate\b|\bchecklist\b|\bworkbook\b|\bdownload\b|\bexample files?\b/i],
  ["definition", /^what (is|are)\b|\bdefinition\b|\bmeaning\b/i],
  ["guide",      /\bguide\b|\bhow to\b|\bplaybook\b|\bframework\b|\bcomplete\b|\bbest practices?\b/i]
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
var SCHEMAS = ["Article", "Product", "SoftwareApplication", "FAQPage", "HowTo"];
// Two types are still valid schema.org but no longer earn a Google rich result. Dates as Google gives them.
var SCHEMA_NOTE = {
  FAQPage: "Google has not shown FAQ rich results since 7 May 2026 (Search Central documentation updates, 8 May 2026). Use FAQPage only where it mirrors a FAQ the page shows.",
  HowTo: "Google has not shown How-to rich results since 13 September 2023 (Search Central blog, 8 August 2023, updated 14 September 2023). The markup is still valid schema.org."
};

function kindOf(v) { return v === null ? "null" : Array.isArray(v) ? "a list" : typeof v === "object" ? "an object" : typeof v === "string" ? "text" : "a " + typeof v; }
function isPage(s) { return /^(\/|https?:\/\/)/i.test(s); }
// The comparable form of a page: no "#..." part, no closing slash, the site name in lower case.
function pageKey(u) {
  var s = text(u).replace(/#.*$/, "");
  var m = /^(https?:\/\/)([^\/?#]+)(.*)$/i.exec(s);
  if (m) s = m[1].toLowerCase() + m[2].toLowerCase() + m[3];
  return s.length > 1 ? s.replace(/\/$/, "") : s;
}
function pathOf(key) { return key.replace(/^https?:\/\/[^\/?#]+/i, "") || "/"; }
// "/blog/x" is the same page as "https://example.com/blog/x"; http and https are the same page.
function samePage(a, b) {
  var x = pageKey(a), y = pageKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.charAt(0) === "/" || y.charAt(0) === "/") return pathOf(x) === pathOf(y);
  return x.replace(/^https?:\/\//i, "") === y.replace(/^https?:\/\//i, "");
}
// A query as typed: no quote marks around it, single spaces. Queries match whatever their capitals.
function cleanQuery(s) { return text(s).replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "").replace(/\s+/g, " ").trim(); }
function sameQuery(a, b) { return cleanQuery(a).toLowerCase() === cleanQuery(b).toLowerCase(); }

function normalise(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw inputError("Input must be a JSON object.");
  var unknown = Object.keys(input).filter(function (k) { return FIELDS.indexOf(k) < 0; });
  if (unknown.length) throw inputError("Unknown field" + (unknown.length > 1 ? "s" : "") + ": " + unknown.join(", ") + ".", "Fields are: " + FIELDS.join(", ") + ".");
  var n = {};
  TEXT_FIELDS.forEach(function (k) {
    var v = input[k];
    if (v != null && typeof v !== "string") throw inputError("\"" + k + "\" must be text, not " + kindOf(v) + ".");
    n[k] = text(v);
  });
  LIST_FIELDS.forEach(function (k) {
    var v = input[k];
    if (v != null && typeof v !== "string" && !Array.isArray(v)) throw inputError("\"" + k + "\" must be a list of lines, or one text with a line per item, not " + kindOf(v) + ".");
    if (Array.isArray(v)) v.forEach(function (x, i) {
      if (x != null && typeof x !== "string") throw inputError("\"" + k + "\"[" + i + "] must be text, not " + kindOf(x) + ".");
    });
    n[k] = toLines(v);
  });
  if (n.intent && !INTENT_LABEL.hasOwnProperty(n.intent)) throw inputError("\"intent\" must be one of: " + Object.keys(INTENT_LABEL).join(", ") + ".");
  if (n.format && !FORMAT_OPTION.hasOwnProperty(n.format)) throw inputError("\"format\" must be one of: " + Object.keys(FORMAT_OPTION).join(", ") + ".");
  if (n.schema && SCHEMAS.indexOf(n.schema) < 0) throw inputError("\"schema\" must be one of: " + SCHEMAS.join(", ") + ".");
  if (n.updates && !isPage(n.updates)) throw inputError("\"updates\" must be a path such as /blog/page, or a full link starting with http.");

  // Search Console rows: strict, because a wrong column read as impressions gives a wrong blocker.
  n.pages = null;
  if (input.pages != null) {
    if (!Array.isArray(input.pages)) throw inputError("\"pages\" must be a list of rows, not " + kindOf(input.pages) + ".", "Each row: { \"page\": \"https://...\", \"clicks\": 12, \"impressions\": 410, \"position\": 9.4 }.");
    if (input.pages.length > MAX_PAGES) throw inputError("\"pages\" has " + fmtInt(input.pages.length) + " rows; the most is " + fmtInt(MAX_PAGES) + ".", "Search Console exports at most " + fmtInt(MAX_PAGES) + " rows. Filter the report to one query first.");
    if (!n.pagesFor) throw inputError("\"pagesFor\" is missing: say which query the Search Console rows were filtered to.", "In Search Console, click the query in the Queries tab, then export; \"pagesFor\" is that query.");
    var seen = {};
    n.pages = input.pages.map(function (r, i) {
      var at = "\"pages\"[" + i + "]";
      if (!r || typeof r !== "object" || Array.isArray(r)) throw inputError(at + " must be a row object, not " + kindOf(r) + ".");
      var extra = Object.keys(r).filter(function (k) { return PAGE_FIELDS.indexOf(k) < 0; });
      if (extra.length) throw inputError(at + " has an unknown field: " + extra.join(", ") + ".", "A row has: " + PAGE_FIELDS.join(", ") + ".");
      if (typeof r.page !== "string" || !isPage(r.page.trim())) throw inputError(at + ".page must be a link starting with http, or a path starting with /.");
      var page = r.page.trim();
      var whole = function (k, need) {
        var v = r[k];
        if (v == null && !need) return 0;
        if (v == null) throw inputError(at + "." + k + " is missing.", "Each row needs the page and its impressions.");
        if (typeof v !== "number" || !isFinite(v) || v < 0 || Math.floor(v) !== v) throw inputError(at + "." + k + " must be a whole number, 0 or more.", "Got " + JSON.stringify(v) + ". Check the columns: clicks and impressions are counts.");
        return v;
      };
      var impressions = whole("impressions", true), clicks = whole("clicks", false);
      if (clicks > impressions) throw inputError(at + ": clicks (" + fmtInt(clicks) + ") is more than impressions (" + fmtInt(impressions) + ").", "A click needs an impression. Check the columns.");
      var position = null;
      if (r.position != null) {
        if (typeof r.position !== "number" || !isFinite(r.position) || r.position < 1) throw inputError(at + ".position must be a number, 1 or more.", "Got " + JSON.stringify(r.position) + ".");
        position = r.position;
      }
      if (r.ctr != null && (typeof r.ctr !== "number" || !isFinite(r.ctr))) throw inputError(at + ".ctr must be a number. It is not used: the engine works from clicks and impressions.");
      if (seen.hasOwnProperty("$" + page)) throw inputError(at + " repeats " + page + ".", "Give each page once, from one export.");
      seen["$" + page] = true;
      return { page: page, clicks: clicks, impressions: impressions, position: position };
    });
  } else if (n.pagesFor) {
    throw inputError("\"pagesFor\" is set but there are no \"pages\" rows.", "Add the rows of the Search Console Pages table, or remove \"pagesFor\".");
  }

  // Drafts: every line must be one of the lines it marks.
  var draftable = {};
  DRAFT_FIELDS.forEach(function (k) { n[k].forEach(function (l) { draftable["$" + l] = true; }); });
  n.drafts.forEach(function (l, i) {
    if (!draftable.hasOwnProperty("$" + l)) throw inputError("\"drafts\"[" + i + "] matches no line in " + listOf(DRAFT_FIELDS) + ".", "List each draft exactly as it is written there: " + JSON.stringify(l));
  });
  return n;
}

function readSerp(lines) {
  var titles = lines.map(titleOf).filter(Boolean);
  if (!titles.length) return null;
  var tally = {}, votes = 0;
  titles.forEach(function (t) {
    for (var i = 0; i < SIGNALS.length; i++) {
      if (SIGNALS[i][1].test(t)) { tally[SIGNALS[i][0]] = (tally[SIGNALS[i][0]] || 0) + 1; votes++; return; }
    }
  });
  var ranked = Object.keys(tally).map(function (k) { return [k, tally[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
  // The intent is the sum of its formats' votes. A tie for first calls nothing: an even split
  // (say one title each for four formats) is not a reading of the results.
  var byIntent = {};
  ranked.forEach(function (r) { byIntent[INTENT_FOR[r[0]]] = (byIntent[INTENT_FOR[r[0]]] || 0) + r[1]; });
  var intents = Object.keys(byIntent).map(function (k) { return [k, byIntent[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
  var lead = function (list) { return list[0] && !(list[1] && list[1][1] === list[0][1]) ? list[0][0] : null; };
  var intent = lead(intents);
  return { titles: titles.length, votes: votes, ranked: ranked, top: lead(ranked), intents: intents, intent: intent, unclear: votes > 0 && !intent };
}

// The tally as one line: "6 ranking titles read as: Guide or explainer x3, Listicle or roundup x2".
function tallyText(s, noun) {
  return s.titles + " " + (noun ? noun + " " : "") + (s.titles === 1 ? "title reads as: " : "titles read as: ") +
    (s.ranked.map(function (r) { return FORMAT_LABEL[r[0]] + " x" + r[1]; }).join(", ") || "no clear format signal");
}

// The intents a line of "existing" names for a page ("/blog/x - commercial").
function intentsNamed(n, page) {
  var out = [];
  n.existing.forEach(function (l) {
    if (!samePage(l.split(/\s+/)[0], page)) return;
    Object.keys(INTENT_LABEL).forEach(function (k) {
      if (new RegExp("\\b" + k + "\\b", "i").test(l) && out.indexOf(k) < 0) out.push(k);
    });
  });
  return out;
}

// What Search Console's Pages table, filtered to the query, says about your own pages.
function readPages(n) {
  if (!n.pages) return null;
  var matches = sameQuery(n.pagesFor, n.query);
  // Rows that differ only after a # are one page: add them up, weighting position by impressions.
  var byKey = {}, order = [];
  n.pages.forEach(function (r) {
    var key = pageKey(r.page), m = byKey["$" + key];
    if (!m) { m = byKey["$" + key] = { page: key, clicks: 0, impressions: 0, posSum: 0, posWeight: 0, posPlain: 0, posCount: 0 }; order.push(m); }
    m.clicks += r.clicks; m.impressions += r.impressions;
    if (r.position !== null) { m.posSum += r.position * r.impressions; m.posWeight += r.impressions; m.posPlain += r.position; m.posCount++; }
  });
  var total = 0, clicks = 0;
  order.forEach(function (m) { total += m.impressions; clicks += m.clicks; });
  var rows = order.filter(function (m) { return m.impressions > 0; }).map(function (m, i) {
    var position = m.posWeight ? m.posSum / m.posWeight : m.posCount ? m.posPlain / m.posCount : null;
    var holds = m.impressions * 100 >= HOLD_SHARE_PCT * total;  // whole numbers, so exactly 20% holds
    var isUpdate = !!n.updates && samePage(n.updates, m.page);
    var named = intentsNamed(n, m.page);
    var same = !!n.intent && named.indexOf(n.intent) >= 0;
    var other = !!n.intent && named.length > 0 && !same;
    // A merged row's position is an average worked out in floating point: 10 must not miss page one by a rounding error.
    var pageOne = position !== null && position <= PAGE_ONE + 1e-11;
    // How the row bears on the brief: the page it updates, one already listed with this intent (the
    // existing-page blocker covers it), one on page one, one lower down, or one too small to hold the query.
    var role = isUpdate ? "updates" : !holds ? "minor" : same ? "listed" : pageOne ? (other ? "other-intent" : "page-one") : (other ? "acknowledged" : "lower");
    var sharePct = Math.round(m.impressions * 100 / total);
    if (!holds && sharePct >= HOLD_SHARE_PCT) sharePct = HOLD_SHARE_PCT - 1;
    return { page: m.page, impressions: m.impressions, clicks: m.clicks, position: position, sharePct: sharePct,
             holds: holds, pageOne: pageOne, isUpdate: isUpdate, named: named, role: role, at: i };
  }).sort(function (a, b) { return b.impressions - a.impressions || b.clicks - a.clicks || a.at - b.at; });
  rows.forEach(function (r) { delete r.at; });
  var pick = function (role) { return rows.filter(function (r) { return r.role === role; }); };
  return { query: cleanQuery(n.pagesFor), matches: matches, rows: rows, pages: rows.length, impressions: total, clicks: clicks,
           updatesFound: rows.some(function (r) { return r.isUpdate; }),
           pageOne: matches ? pick("page-one") : [], otherIntent: matches ? pick("other-intent") : [], lower: matches ? pick("lower") : [] };
}
function shareText(r) { return (r.sharePct < 1 ? "under 1" : r.sharePct) + "% of impressions"; }
function rowText(r, total) { return r.page + " (" + fmtInt(r.impressions) + " of " + (total === 1 ? "1 impression" : fmtInt(total) + " impressions") + (r.position !== null ? ", position " + r.position.toFixed(1) : "") + ")"; }
// One sentence for the brief and the page: where the rows came from and what they add up to.
function pagesSummary(p) {
  if (!p.matches) return "The Search Console rows were filtered to “" + p.query + "”, not this query, so they are left out.";
  if (!p.pages) return "Search Console, filtered to “" + p.query + "”: no page of yours appeared for this query.";
  return "Search Console, filtered to “" + p.query + "”: " + plural(p.pages, "page", "pages") + ", " +
    (p.impressions === 1 ? "1 impression" : fmtInt(p.impressions) + " impressions") + ", " +
    (p.clicks === 1 ? "1 click" : fmtInt(p.clicks) + " clicks") + ".";
}
function pagesLines(p) {
  if (!p.matches || !p.pages) return [];
  var out = p.rows.slice(0, LIST_ROWS).map(function (r) {
    return r.page + ": " + shareText(r) + " (" + fmtInt(r.impressions) + "), " + (r.clicks === 1 ? "1 click" : fmtInt(r.clicks) + " clicks") +
      (r.position !== null ? ", position " + r.position.toFixed(1) + (r.pageOne ? ", on page one" : "") : "") +
      (r.isUpdate ? " (the page this brief updates)" : "");
  });
  var rest = p.rows.slice(LIST_ROWS);
  if (rest.length) {
    var imp = 0; rest.forEach(function (r) { imp += r.impressions; });
    out.push("and " + plural(rest.length, "more page", "more pages") + " with " + fmtInt(imp) + " impressions between them");
  }
  return out;
}

function build(input) {
  var n = normalise(input);
  var serp = readSerp(n.serp);
  var pages = readPages(n);
  var intent = n.intent, format = n.format;
  var answer = n.answer, aw = words(answer);
  var ents = n.entities, heads = n.headings, srcs = n.sources;
  var existing = n.existing;
  var draft = {};
  n.drafts.forEach(function (l) { draft["$" + l] = true; });
  var isDraft = function (l) { return draft.hasOwnProperty("$" + l); };
  var drafts = { serp: n.serp.filter(isDraft).length, entities: ents.filter(isDraft).length, headings: heads.filter(isDraft).length, sources: srcs.filter(isDraft).length };
  drafts.total = drafts.serp + drafts.entities + drafts.headings + drafts.sources;

  var issues = [];
  var blockers = 0;
  function add(bad, label, why) {
    issues.push({ bad: bad, label: label, why: why });
    if (bad === "block") blockers++;
  }

  if (!n.query) add("block", "No target query", "One query, as someone would type it.");
  if (!n.action) add("block", "No next action", "A brief without a defined next action produces content that ranks and converts nothing.");
  if (!n.audience) add("warn", "No reader named", "Say who reads this page and what they already know. A writer who has to guess writes for nobody in particular.");

  if (!serp) {
    add("block", "No ranking results pasted", n.serp.length
      ? "Only links were pasted. Paste the titles as the results page shows them; a link after a title is fine."
      : "Intent is being inferred rather than read. Paste the titles that rank today, or mark the brief as unverified.");
  } else if (serp.top && format && serp.top !== format) {
    add("warn", "The results disagree with your format",
      "What ranks looks like “" + FORMAT_LABEL[serp.top] + "”; you are planning “" + FORMAT_LABEL[format] + "”. Arguing with the results rarely works: do it deliberately or not at all.");
  }
  if (serp && serp.intent && intent && serp.intent !== intent) {
    add("warn", "The results disagree with your intent",
      "The ranking pages read as " + INTENT_LABEL[serp.intent].toLowerCase() + "; you have chosen " + INTENT_LABEL[intent].toLowerCase() + ".");
  }
  if (serp && serp.unclear) {
    add("warn", "Intent unclear from the results",
      "The titles that rank split evenly between " + serp.intents.filter(function (x) { return x[1] === serp.intents[0][1]; }).map(function (x) { return INTENT_LABEL[x[0]].toLowerCase(); }).join(" and ") + ". Look at the results again, or choose the intent deliberately and say why in the brief.");
  }
  if (!intent) add("block", "Intent not chosen", "Everything below this decision depends on it.");
  if (!format) add("warn", "Format not chosen", "One intent per page, one format per page.");

  if (!answer) {
    add("block", "No answer block", "If you cannot write it, the topic is not clear enough to brief.");
  } else if (aw < ANSWER_MIN || aw > ANSWER_MAX) {
    add("warn", "Answer block is " + plural(aw, "word", "words"),
      aw < ANSWER_MIN ? "Under " + ANSWER_MIN + " words usually means the answer is not actually answered." : "Over " + ANSWER_MAX + " words is past what an answer engine will lift cleanly.");
  }

  // cannibalisation: an existing page claiming the same intent (the page this brief updates is not a second page)
  var clash = existing.filter(function (l) {
    return intent && new RegExp("\\b" + intent + "\\b", "i").test(l) && !(n.updates && samePage(n.updates, l.split(/\s+/)[0]));
  });
  if (clash.length) {
    add("block", "An existing page already serves this intent",
      clash.join("; ") + ". Usually the answer is to improve that page rather than publish a second one.");
  }
  // cannibalisation, from Search Console: your own pages that already show for this query
  if (pages && !pages.matches) {
    add("warn", "The Search Console rows are for another query",
      "They were filtered to “" + pages.query + "”, and " + (n.query ? "this brief is for “" + n.query + "”" : "this brief has no target query yet") + ", so they are left out. Export again with this query clicked in the Queries tab.");
  } else if (pages) {
    var also = !!n.updates;
    var names = function (rows) { return rows.map(function (r) { return rowText(r, pages.impressions); }).join("; "); };
    if (pages.pageOne.length) {
      var k = pages.pageOne.length;
      add("block", k === 1
          ? (also ? "Another page of yours already ranks on page one for this query" : "A page of yours already ranks on page one for this query")
          : (also ? k + " other pages of yours already rank on page one for this query" : k + " of your pages already rank on page one for this query"),
        names(pages.pageOne) + ". " + (also
          ? "Decide which page owns this query: update " + (k === 1 ? "that one" : "one of those") + " instead, merge them, or list " + (k === 1 ? "it" : "each") + " under existing pages with the intent it serves."
          : (k === 1 ? "Usually the answer is to improve that page rather than publish a second one. If it serves another intent, list it under existing pages with that intent."
                     : "Settle which page owns this query before a writer starts. If one serves another intent, list it under existing pages with that intent.")));
    }
    if (pages.otherIntent.length) {
      var o = pages.otherIntent.length;
      add("warn", o === 1 ? "A page of yours ranks on page one for this query with another intent" : o + " of your pages rank on page one for this query with another intent",
        pages.otherIntent.map(function (r) { return rowText(r, pages.impressions) + ", listed as " + r.named.map(function (x) { return INTENT_LABEL[x].toLowerCase(); }).join(" and "); }).join("; ") +
        ". Link " + (o === 1 ? "the two pages" : "these pages and the new one") + " to each other, so readers and crawlers can tell them apart.");
    }
    if (pages.lower.length) {
      var w = pages.lower.length;
      add("warn", w === 1 ? "A page of yours already appears for this query" : w + " of your pages already appear for this query",
        names(pages.lower) + ". Say in the notes whether this page replaces " + (w === 1 ? "it" : "them") + ", merges with " + (w === 1 ? "it" : "them") + " or links to " + (w === 1 ? "it" : "them") + ".");
    }
  }

  if (!ents.length) add("warn", "No entities listed", "Completeness against the topic beats word count.");
  if (!heads.length) {
    add("warn", "No headings", "Phrase H2s as the questions people actually ask.");
  } else {
    var notQ = heads.filter(function (h) { return !/\?\s*$/.test(h); });
    if (notQ.length) add("warn", notQ.length + " of " + heads.length + (notQ.length === 1 ? " headings is not a question" : " headings are not questions"),
      "Question-shaped H2s answered in the first two sentences are what make a page extractable.");
  }

  if (!srcs.length) {
    add("block", "No named sources",
      "“Include a statistic here” produces a fabricated statistic. Name the source or supply the data.");
  } else if (drafts.sources === srcs.length) {
    add("block", "No checked source",
      (srcs.length === 1 ? "The only source listed" : "Every source listed") + " came from an AI and has not been opened. An unchecked source is how a made-up statistic gets into a page. Open " + (srcs.length === 1 ? "it" : "each one") + ", or supply your own data.");
  }
  if (drafts.total) {
    var parts = [];
    if (drafts.serp) parts.push(plural(drafts.serp, "ranking title", "ranking titles"));
    if (drafts.headings) parts.push(plural(drafts.headings, "heading", "headings"));
    if (drafts.entities) parts.push(plural(drafts.entities, "entity", "entities"));
    if (drafts.sources) parts.push(plural(drafts.sources, "source", "sources"));
    add("warn", drafts.total === 1 ? "1 line is an unchecked AI draft" : drafts.total + " lines are unchecked AI drafts",
      listOf(parts) + " came from an AI and nobody has checked " + (drafts.total === 1 ? "it" : "them") + ". Check " + (drafts.total === 1 ? "it" : "them") + " against the live pages, then clear the mark.");
  }

  if (!n.schema) add("warn", "No schema type", "Article, Product or SoftwareApplication. FAQPage and HowTo are valid markup but no longer earn a Google rich result.");
  if (!n.success) add("warn", "No success criteria", "The outcome that would make this page worth having written.");

  if (/\b\d{3,5}[\s-]*(?:words?\b|word count)/i.test(n.query + " " + n.success + " " + n.notes)) {
    add("warn", "A word count is being briefed", "Length is an output of covering the topic, not an input.");
  }

  var gaps = issues.length - blockers;
  return { serp: serp, pages: pages, issues: issues, blockers: blockers, aw: aw,
           answerInWindow: aw >= ANSWER_MIN && aw <= ANSWER_MAX,
           verdict: blockers ? "Not ready for a writer" : (issues.length ? "Ready, with gaps" : "Ready for a writer"),
           gaps: gaps, drafts: drafts, schemaNote: SCHEMA_NOTE[n.schema] || null,
           counts: { ents: ents.length, heads: heads.length, srcs: srcs.length, titles: serp ? serp.titles : 0 } };
}

function briefText(input) {
  var n = normalise(input);
  var draft = {};
  n.drafts.forEach(function (l) { draft["$" + l] = true; });
  var mark = function (l) { return l + (draft.hasOwnProperty("$" + l) ? " (AI draft, not checked)" : ""); };
  var marked = DRAFT_FIELDS.reduce(function (sum, k) { return sum + n[k].filter(function (l) { return draft.hasOwnProperty("$" + l); }).length; }, 0);
  var out = [];
  out.push("# Content brief: " + (n.query || "(no query)"));
  out.push("");
  out.push("**Intent:** " + (INTENT_LABEL[n.intent] || "(not set)"));
  out.push("**Format:** " + (n.format ? FORMAT_OPTION[n.format] : "(not set)"));
  out.push("**Reader:** " + (n.audience || "(not set)"));
  out.push("**Next action:** " + (n.action || "(not set)"));
  out.push("**Schema:** " + (n.schema || "(not set)"));
  if (n.updates) out.push("**Updates the page:** " + n.updates);
  if (SCHEMA_NOTE[n.schema]) { out.push(""); out.push("_" + SCHEMA_NOTE[n.schema] + "_"); }
  if (marked) { out.push(""); out.push("_" + (marked === 1 ? "1 line below came from an AI and has not been checked. It is marked." : marked + " lines below came from an AI and have not been checked. They are marked.") + "_"); }
  out.push("");
  out.push("## Answer block (" + ANSWER_MIN + "-" + ANSWER_MAX + " words, near the top)");
  out.push(n.answer || "(not written)");
  out.push("");
  out.push("## Must cover");
  (n.entities.length ? n.entities.map(mark) : ["(none listed)"]).forEach(function (e) { out.push("- " + e); });
  out.push("");
  out.push("## Headings");
  (n.headings.length ? n.headings.map(mark) : ["(none listed)"]).forEach(function (h) { out.push("- " + h); });
  out.push("");
  out.push("## Sources the writer must cite");
  (n.sources.length ? n.sources.map(mark) : ["(none named - do not let the writer invent one)"]).forEach(function (s) { out.push("- " + s); });
  out.push("");
  out.push("## Internal links in");
  (n.linksIn.length ? n.linksIn : ["(none)"]).forEach(function (l) { out.push("- " + l); });
  out.push("");
  out.push("## Existing pages on this topic");
  (n.existing.length ? n.existing : ["(none)"]).forEach(function (l) { out.push("- " + l); });
  out.push("");
  var p = readPages(n);
  if (p) {
    out.push("## Your pages Google already shows for this query");
    out.push(pagesSummary(p));
    pagesLines(p).forEach(function (l) { out.push("- " + l); });
    out.push("");
  }
  out.push("## Success criteria");
  out.push(n.success || "(not set)");
  out.push("");
  if (n.notes) {
    out.push("## Notes for the writer");
    out.push(n.notes);
    out.push("");
  }
  var shown = n.serp.filter(function (l) { return titleOf(l) || linkOf(l); });
  if (shown.length) {
    out.push("## What ranks today");
    shown.forEach(function (l) {
      var t = titleOf(l), u = linkOf(l);
      out.push("- " + (t && u ? t + " - " + u : t || u) + (draft.hasOwnProperty("$" + l) ? " (AI draft, not checked)" : ""));
    });
    out.push("");
  }
  var s = readSerp(n.serp);
  out.push("## Intent evidence");
  var fromAi = n.serp.filter(function (l) { return titleOf(l) && draft.hasOwnProperty("$" + l); }).length;
  out.push(s ? (tallyText(s, "ranking") +
    (s.intent ? ". " + INTENT_LABEL[s.intent] + " intent." : s.unclear ? ". Intent unclear: the titles split evenly." : ".") +
    (fromAi ? " " + (fromAi === s.titles ? (fromAi === 1 ? "The title" : "All " + fromAi + " titles") + " came" : fromAi + " of the " + s.titles + " titles came") + " from an AI's reading of the results and " + (fromAi === 1 ? "is" : "are") + " not checked." : ""))
    : (n.serp.length ? "Only links were pasted, no titles" : "No ranking results were pasted") + " - intent is inferred, not read. Verify before writing.");
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
  L.push(`Answer block: ${b.aw} word${b.aw === 1 ? '' : 's'} (${b.answerInWindow ? `inside the ${ANSWER_MIN}-${ANSWER_MAX} window` : `target ${ANSWER_MIN}-${ANSWER_MAX}`})`);
  if (b.serp) {
    L.push('What ranks today: ' + tallyText(b.serp) +
      (b.serp.intent ? `. That points to ${INTENT_LABEL[b.serp.intent]} intent.` : b.serp.unclear ? '. Intent unclear: the titles split evenly.' : '.'));
  } else {
    L.push(n.serp.length
      ? 'Intent is inferred: only links were pasted, with no titles to read, so the intent is a guess rather than a reading.'
      : 'Intent is inferred: nothing was pasted from the results page, so the intent is a guess rather than a reading.');
  }
  if (b.pages) {
    L.push('Your pages on this query: ' + pagesSummary(b.pages));
    pagesLines(b.pages).forEach((l) => L.push('  ' + l));
  }
  if (b.drafts.total) L.push(`AI drafts: ${b.drafts.total} line${b.drafts.total === 1 ? '' : 's'} not checked yet`);
  if (b.schemaNote) L.push('Schema note: ' + b.schemaNote);
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

// Example inputs only: the query, titles, pages and Search Console rows are invented to show the checks firing.
const DEMO = {
  query: 'how to choose a pricing model for b2b saas',
  action: 'Pricing ARPU Modeler',
  audience: 'Founders of seed to Series B SaaS companies setting their first pricing model',
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
  pages: [
    { page: 'https://example.com/blog/saas-pricing-models', clicks: 12, impressions: 410, position: 9.4 },
    { page: 'https://example.com/pricing', clicks: 3, impressions: 130, position: 18.2 },
  ],
  pagesFor: 'how to choose a pricing model for b2b saas',
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
    if (!jsonOut) console.log('(no config - demo with example inputs: the results read as a guide, the plan is a comparison, the answer block is short, an existing page already serves the intent, and Search Console shows a second page of yours for the query)\n');
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

module.exports = { build, briefText, normalise, readSerp, tallyText, readPages, pagesSummary, pagesLines, titleOf, linkOf, samePage, sameQuery, words,
  FIELDS, TEXT_FIELDS, LIST_FIELDS, DRAFT_FIELDS, PAGE_FIELDS, FORMAT_LABEL, FORMAT_OPTION, INTENT_FOR, INTENT_LABEL, SCHEMAS, SCHEMA_NOTE,
  ANSWER_MIN, ANSWER_MAX, HOLD_SHARE_PCT, PAGE_ONE, MAX_PAGES, LIST_ROWS };
