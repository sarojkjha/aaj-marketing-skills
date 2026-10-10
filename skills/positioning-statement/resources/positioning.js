#!/usr/bin/env node
/*
 * AAJ Positioning Statement - positioning system and linter
 * Part of the "positioning-statement" Agent Skill.
 *
 * Turns the seven positioning choices (plus optional proof) into the same five
 * assets as the AAJ Positioning Statement Generator
 * (aajconsult.com/tools/positioning-statement-generator): the classic
 * statement, a one-line value proposition, a 30-second pitch for one of three
 * audiences, a homepage hero suggestion and a positioning canvas. It runs the
 * page's linter on the same inputs: buzzwords, a target customer that is
 * everyone, a differentiator that is a claim with no number behind it, a
 * benefit phrased as a feature, and a differentiator identical to the
 * alternative. The output matches the page's copied and downloaded text.
 *
 * USAGE
 *   node positioning.js                       # demo
 *   node positioning.js '<json-config>'       # your own
 *   node positioning.js '<json-config>' --json
 *   node positioning.js --help
 *
 * CONFIG (JSON) - every field is optional; an empty slot shows as [placeholder]
 *
 *   {
 *     "product":  "product or company name",
 *     "customer": "target customer - a segment you could name 20 real examples of",
 *     "need":     "their problem, starting with who...",
 *     "category": "the market category buyers already shop in",
 *     "benefit":  "the key benefit, as an outcome (a verb, not a feature)",
 *     "alt":      "the real alternative - what they would do without you",
 *     "diff":     "the key differentiator - a capability, not a claim",
 *     "proof":    "a number, named customer or result (optional)",
 *     "aud":      "customer" | "investor" | "internal"     // pitch audience, default customer
 *   }
 *
 * RULES (the same ones the page applies)
 *   - Buzzwords are flagged in the category, benefit, differentiator, problem
 *     and customer: innovative, best-in-class, world-class, cutting-edge,
 *     revolutionary, disruptive, next-generation, state-of-the-art, seamless,
 *     leading, synergy, game-changing, holistic, robust, turnkey, solutions,
 *     leverage, empower.
 *   - A differentiator using better, faster, cheaper, easier, smarter,
 *     superior or "the best" with no digit in it is flagged as a claim.
 *   - The page lists at most six lint messages and shows none until one of the
 *     seven core fields has text; the engine returns all of them as well.
 *
 * The linter checks wording, not truth: a clean lint does not mean the
 * positioning is right. Pressure-test it with the checklist in
 * positioning-template.md and with customers.
 */

// --- AAJ arg normalisation ---------------------------------------------------
process.argv = process.argv.map((a, i) =>
  i >= 2 && /^(demo|help)$/i.test(a) ? '--' + a.toLowerCase() : a
);
// -----------------------------------------------------------------------------

'use strict';

/* aaj:core:begin */
var FIELDS = ["product", "customer", "need", "category", "benefit", "alt", "diff", "proof"];
var CORE = ["product", "customer", "need", "category", "benefit", "alt", "diff"];
var AUDIENCES = ["customer", "investor", "internal"];
// Single-line fields on the page; a browser strips line breaks from these, so the engine does too.
var SINGLE_LINE = ["product", "customer", "category", "alt", "proof"];
var SHARE_BASE_URL = "https://aajconsult.com/tools/positioning-statement-generator";

var BUZZ = ["innovative","best-in-class","best in class","world-class","cutting-edge","cutting edge","revolutionary","disruptive","next-generation","next generation","state-of-the-art","state of the art","seamless","leading","synergy","game-changing","game changing","holistic","robust","turnkey","solutions","leverage","empower"];
var CLAIMS = ["better", "faster", "cheaper", "easier", "smarter", "superior", "the best"];
var BROAD = ["everyone", "anybody", "anyone", "all businesses", "businesses", "companies", "people", "users"];
var LINT_SHOWN = 6;  // the page lists at most this many lint messages at once
var LINT_OK = "No vague language detected — every slot is doing real work.";

function inputError(msg, hint) {
  var e = new Error(msg);
  e.hint = hint;
  e.isInputError = true;
  return e;
}

function lcFirst(s) {
  if (!s) return s;
  if (s.length > 1 && s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase()) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function ucFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function clean(s) { return s.replace(/[.\s]+$/, ""); }
function stripWho(s) { return clean(s).replace(/^who\s+/i, ""); }
function noArt(s) { return s.replace(/^(a|an|the)\s+/i, ""); }

function normalise(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw inputError("Input must be a JSON object.");
  var unknown = Object.keys(input).filter(function (k) { return FIELDS.indexOf(k) < 0 && k !== "aud"; });
  if (unknown.length) throw inputError("Unknown field" + (unknown.length > 1 ? "s" : "") + ": " + unknown.join(", ") + ".", "Fields are: " + FIELDS.join(", ") + ", aud.");
  var n = {};
  FIELDS.forEach(function (k) {
    var v = String(input[k] == null ? "" : input[k]);
    if (SINGLE_LINE.indexOf(k) >= 0) v = v.replace(/[\r\n]/g, "");
    n[k] = v.trim();
  });
  n.aud = input.aud == null || input.aud === "" ? "customer" : String(input.aud);
  if (AUDIENCES.indexOf(n.aud) < 0) throw inputError("\"aud\" must be one of: " + AUDIENCES.join(", ") + ".");
  return n;
}

function generate(input) {
  var n = normalise(input);
  var val = function (k) { return n[k]; };
  var txt = function (k, fallback) { var v = val(k); return v ? clean(v) : "[" + fallback + "]"; };

  // ---- the linter
  var issues = [], flagged = [];
  var flag = function (k, msg) { if (flagged.indexOf(k) < 0) flagged.push(k); issues.push(msg); };
  BUZZ.forEach(function (w) {
    var rx = new RegExp("\\b" + w.replace(/[-\s]/g, "[-\\s]") + "\\b", "i");
    ["category", "benefit", "diff", "need", "customer"].forEach(function (k) {
      if (rx.test(val(k)))
        flag(k, "\"" + w + "\" in " + (k === "diff" ? "your differentiator" : "your " + k) + " is a buzzword — replace it with the specific thing you do.");
    });
  });
  var c = val("customer").toLowerCase();
  if (c && BROAD.some(function (w) { return c === w || c === "all " + w; }))
    flag("customer", "Target customer is too broad — narrow until you could name 20 real examples.");
  var d = val("diff").toLowerCase();
  if (d && CLAIMS.some(function (w) { return new RegExp("\\b" + w + "\\b").test(d); }) && !/\d/.test(d))
    flag("diff", "Differentiator reads as a claim (\"better/faster\") without a capability or number behind it.");
  var b = val("benefit").toLowerCase();
  if (b && /^(has|with|features|offers|includes|provides)\b/.test(b))
    flag("benefit", "That reads like a feature (what it has). Restate as the outcome the customer gets.");
  if (val("diff") && val("alt") && clean(val("diff")).toLowerCase() === clean(val("alt")).toLowerCase())
    flag("diff", "Differentiator and alternative are identical — the \"unlike\" clause needs a contrast.");
  if (val("need") && !/^who\b/i.test(val("need")))
    issues.push("Tip: phrase the problem starting with \"who…\" so the statement reads naturally.");
  var anyCore = CORE.some(function (k) { return val(k); });
  var lint = {
    shown: anyCore,
    issues: issues,
    flagged: flagged,
    display: !anyCore ? [] : (issues.length ? issues.slice(0, LINT_SHOWN) : [LINT_OK])
  };

  // ---- the five assets
  var statement =
    "For " + txt("customer", "target customer") + " " +
    (val("need") ? lcFirst(clean(val("need"))) : "[who have this problem]") + ", " +
    txt("product", "Product") + " is a " + lcFirst(txt("category", "market category")) +
    " that " + lcFirst(txt("benefit", "key benefit")) + ". Unlike " +
    lcFirst(txt("alt", "the alternative")) + ", " + txt("product", "Product") + " " +
    lcFirst(txt("diff", "key differentiator")) + ".";

  var valueProp =
    txt("product", "Product") + " helps " + lcFirst(txt("customer", "your customer")) + " " +
    (val("benefit") ? lcFirst(clean(val("benefit"))) : "[get the key benefit]") +
    (val("diff") ? " — because it " + lcFirst(clean(val("diff"))) : "") + ".";

  var p = txt("product", "Product");
  var cu = lcFirst(txt("customer", "our customer"));
  var ne = val("need") ? stripWho(val("need")) : "";
  var ca = lcFirst(txt("category", "category"));
  var be = val("benefit") ? lcFirst(clean(val("benefit"))) : "[benefit]";
  var al = lcFirst(txt("alt", "the status quo"));
  var di = val("diff") ? lcFirst(clean(val("diff"))) : "[differentiator]";
  var pr = val("proof") ? ucFirst(clean(val("proof"))) + "." : "";
  var pitch;
  if (n.aud === "investor") {
    pitch = p + " is a " + ca + " for " + cu + (ne ? ", who today " + lcFirst(ne) : "") +
      ". Their current answer is " + al + " — and it fails them. We win because " + p + " " + di +
      ". For customers, that means it " + be + ". " + pr;
  } else if (n.aud === "internal") {
    pitch = "We win when " + cu + (ne ? " who " + lcFirst(ne) : "") + " choose " + p + " over " + al +
      ". They choose us because we " + di + ". Every feature, page, and campaign should reinforce one promise: " + be + ". " + pr;
  } else {
    pitch = "If you’re one of the " + noArt(cu) + (ne ? " " + (val("need") ? lcFirst(clean(val("need"))) : "") : "") +
      ", you’ve probably been making do with " + al + ". " + p + " is a " + ca +
      " built for exactly this: it " + di + ". The result — it " + be + ". " + pr;
  }

  var heroHeadline = val("benefit") ? ucFirst(clean(val("benefit"))) : "[Your key benefit, stated as a headline]";
  var heroSub = "The " + lcFirst(txt("category", "category")) + " for " + lcFirst(txt("customer", "your customer")) + ". " +
    (val("diff") ? ucFirst(clean(val("diff"))) + ". " : "") +
    (val("alt") ? "No more " + noArt(lcFirst(clean(val("alt")))) + "." : "");

  var canvas = [
    ["Target customer", "customer"], ["Problem", "need"], ["Category", "category"],
    ["Key benefit", "benefit"], ["Real alternative", "alt"], ["Differentiator", "diff"], ["Proof", "proof"]
  ].map(function (r) { return r[0] + ": " + (val(r[1]) ? clean(val(r[1])) : "—"); }).join("\n");

  var q = new URLSearchParams();
  FIELDS.forEach(function (k) { if (val(k)) q.set(k, val(k)); });
  q.set("aud", n.aud);
  var shareLink = SHARE_BASE_URL + "?" + q.toString();

  var doc = "# " + (val("product") || "Positioning") + " — Positioning System\n\n" +
    "## Positioning statement\n" + statement + "\n\n" +
    "## One-line value proposition\n" + valueProp + "\n\n" +
    "## Elevator pitch (" + n.aud + ")\n" + pitch + "\n\n" +
    "## Homepage hero\n**" + heroHeadline + "**\n" + heroSub + "\n\n" +
    "## Positioning canvas\n" + canvas + "\n\n" +
    "---\nGenerated with AAJ’s free Positioning Statement Generator — " + shareLink + "\n";

  var filled = CORE.filter(function (k) { return val(k); }).length;
  return {
    aud: n.aud,
    completeness: { filled: filled, of: CORE.length, label: filled + " of 7 core fields" },
    statement: statement, valueProp: valueProp, pitch: pitch,
    hero: { headline: heroHeadline, sub: heroSub },
    canvas: canvas, lint: lint, shareLink: shareLink, doc: doc,
    fileName: (val("product") || "positioning").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-positioning.md"
  };
}
/* aaj:core:end */

/* ─────────────────────────── cli ─────────────────────────── */

function render(r) {
  const L = [];
  L.push(`Positioning system - ${r.completeness.label}`);
  L.push('');
  L.push('Linter');
  if (!r.lint.shown) L.push('  (nothing to check until one of the seven core fields has text)');
  else if (!r.lint.issues.length) L.push(`  ok  ${LINT_OK}`);
  else r.lint.issues.forEach((m) => L.push(`  !   ${m}`));
  if (r.lint.issues.length > LINT_SHOWN) L.push(`  (the page shows the first ${LINT_SHOWN} of these ${r.lint.issues.length})`);
  if (r.lint.flagged.length) L.push(`  Fields flagged: ${r.lint.flagged.join(', ')}`);
  L.push('');
  L.push(r.doc.trimEnd());
  return L.join('\n');
}

// Example inputs only: a fictional product, written badly on purpose so the linter has work to do.
const DEMO = {
  product: 'Shiftboard',
  customer: 'companies',
  need: 'struggle to fill last-minute shifts',
  category: 'innovative scheduling solutions',
  benefit: 'offers a mobile app for shift swaps',
  alt: 'a group chat and a spreadsheet',
  diff: 'is faster than other tools',
  proof: '',
  aud: 'investor',
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
    if (!jsonOut) console.log('(no config - demo with fictional example inputs: a customer that is everyone, buzzwords in the category, a feature for a benefit and a claim for a differentiator)\n');
  }
  try {
    const r = generate(cfg);
    console.log(jsonOut ? JSON.stringify(r, null, 2) : render(r));
  } catch (e) {
    if (!e.isInputError) throw e;
    console.error('error: ' + e.message);
    if (e.hint) console.error('       ' + e.hint);
    console.error('\nRun --help for the schema, or --demo for a worked example.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { generate, normalise, FIELDS, CORE, AUDIENCES, BUZZ, CLAIMS, BROAD, LINT_SHOWN, LINT_OK };
