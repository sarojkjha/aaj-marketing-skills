#!/usr/bin/env node
/**
 * Tests for the hosted MCP server: every engine gives the same output in the
 * Worker's in-process runner as it does under Node, and the HTTP transport
 * behaves (initialize, tools/list, run_engine, notifications, errors, limits).
 *
 *   node platform/mcp-worker/test.mjs
 */
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker, { runInProcess } from "./worker.mjs";
import { ENGINES, SKILLS } from "./engines.generated.mjs";
import { readFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { failed++; console.error("FAIL", msg); } };

// 1. Parity: --demo, --help and a bad input, Node vs in-process.
const slow = [];
for (const e of ENGINES) {
  for (const argv of [["--demo"], ["--help"], ["{not json"]]) {
    const node = spawnSync(process.execPath, [join(ROOT, e.file), ...argv], { encoding: "utf8", cwd: join(ROOT, dirname(e.file)) });
    const t0 = performance.now();
    const w = runInProcess(e, argv);
    const ms = performance.now() - t0;
    if (argv[0] === "--demo" && ms > 50) slow.push(`${e.id} ${ms.toFixed(0)}ms`);
    const same = node.stdout === w.out && (node.status === 0) === (w.code === 0);
    ok(same, `${e.id} ${argv[0]}: node exit ${node.status} vs worker ${w.code}; stdout ${node.stdout.length} vs ${w.out.length} chars` +
      (same ? "" : `\n  node: ${JSON.stringify(node.stdout.slice(0, 120))}\n  wrkr: ${JSON.stringify(w.out.slice(0, 120))}\n  wrkr err: ${JSON.stringify(w.err.slice(0, 200))}`));
  }
}

// 2. HTTP transport.
const post = (body, headers = {}) => worker.fetch(new Request("https://mcp.example/mcp", {
  method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
}));
const j = async (r) => [r.status, r.status === 202 ? null : await r.json()];

let [s, b] = await j(await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }));
ok(s === 200 && b.result.serverInfo.name === "aaj-engines" && b.result.protocolVersion === "2025-06-18", "initialize");
[s, b] = await j(await post({ jsonrpc: "2.0", method: "notifications/initialized" }));
ok(s === 202, `notification -> 202 (got ${s})`);
[s, b] = await j(await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
ok(s === 200 && b.result.tools.map((t) => t.name).join() === "list_engines,describe_engine,run_engine,search_skills,get_skill", "tools/list");
ok(b.result.tools.every((t) => t.title && t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false), "every tool has a title and read-only annotations (the Claude directory requires them)");
[s, b] = await j(await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "run_engine", arguments: { engine: "unit-economics" } } }));
ok(s === 200 && !b.result.isError && /unit-economics/.test(b.result.content[0].text), "run_engine demo");
[s, b] = await j(await post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "run_engine", arguments: { engine: "unit-economics", input: { nonsense: true } } } }));
ok(s === 200 && b.result.isError === true, "run_engine bad input is an error result");
[s, b] = await j(await post([{ jsonrpc: "2.0", id: 5, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "search_skills", arguments: { query: "churn is rising" } } }]));
ok(s === 200 && Array.isArray(b) && b.length === 2 && /skill/.test(b[1].result.content[0].text), "batch");
[s, b] = await j(await post("{oops"));
ok(s === 400 && b.error.code === -32700, "parse error");
[s, b] = await j(await post({ jsonrpc: "2.0", id: 7, method: "nope" }));
ok(b.error.code === -32601, "method not found");
[s, b] = await j(await post({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "get_skill", arguments: { skill: "pilot-to-contract" } } }));
ok(/Pilot/.test(b.result.content[0].text), "get_skill");
// list_engines filter: matches category, id and skill title, not just the category name.
const list = async (category) => { const [st, bd] = await j(await post({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "list_engines", arguments: category === undefined ? {} : { category } } })); return st === 200 ? bd.result.content[0].text : ""; };
const ids = (txt) => [...txt.matchAll(/^- \*\*([^*]+)\*\*/gm)].map((m) => m[1]).sort();
const all = ids(await list());
ok(all.length === ENGINES.length, `unfiltered list has every engine (${all.length} vs ${ENGINES.length})`);
const pricing = ids(await list("pricing"));
ok(["ai-inference-pricing", "pricing-and-packaging", "pricing-page-teardown"].every((x) => pricing.includes(x)) && pricing.length <= 5, `"pricing" finds the pricing engines (got ${pricing.join(", ")})`);
const retention = ids(await list("retention"));
ok(retention.includes("lifecycle-and-retention") && retention.includes("email-lifecycle-sequence"), "category name still works");
ok(ids(await list("RETENTION")).join() === retention.join(), "filter ignores case");
ok(ids(await list("seo audit")).includes("seo-geo-aeo-audit"), "several words must all match");
ok(ids(await list("paid search")).includes("paid-search-account-audit"), "multi-word id match");
ok(ids(await list("")).length === all.length, "empty filter lists everything");
const none = await list("zzzz-nothing");
ok(/No engines matched/.test(none) && /Categories:/.test(none) && /Strategy & Positioning/.test(none), "no match lists the categories");

const g = await worker.fetch(new Request("https://mcp.example/mcp"));
ok(g.status === 405, "GET /mcp -> 405");
const home = await worker.fetch(new Request("https://mcp.example/"));
ok(home.status === 200 && /mcp\.example\/mcp/.test(await home.text()), "info page");
const big = await post("x".repeat(300 * 1024));
ok(big.status === 413, "body cap");
let last;
for (let i = 0; i < 61; i++) last = await post({ jsonrpc: "2.0", id: i, method: "ping" }, { "cf-connecting-ip": "203.0.113.9" });
ok(last.status === 429, "rate limit");
const opt = await worker.fetch(new Request("https://mcp.example/mcp", { method: "OPTIONS" }));
ok(opt.status === 204 && opt.headers.get("access-control-allow-origin") === "*", "CORS preflight");
// The published counts: the same object as counts.json, readable from any page.
{
  const res = await worker.fetch(new Request("https://mcp.example/counts.json"));
  const body = await res.json();
  const file = JSON.parse(readFileSync(new URL("../../counts.json", import.meta.url), "utf8"));
  ok(res.status === 200 && res.headers.get("access-control-allow-origin") === "*", "/counts.json is served with CORS");
  ok(JSON.stringify(body) === JSON.stringify(file), "/counts.json matches counts.json in the repo");
  ok(body.skills === SKILLS.length && body.engines === new Set(ENGINES.map((e) => e.slug)).size, "/counts.json agrees with the bundle");
}

// Renamed skills (Oct 11): the old ids still resolve, so agents and links in the wild keep working.
{
  const [st, bd] = await j(await post({ jsonrpc: "2.0", id: 98, method: "tools/call", params: { name: "describe_engine", arguments: { engine: "copywriting" } } }, { "cf-connecting-ip": "192.0.2.50" }));
  ok(st === 200 && /^# aaj-copywriting/.test(bd.result.content[0].text), "an old engine id resolves to its aaj- name");
  const [, sk] = await j(await post({ jsonrpc: "2.0", id: 97, method: "tools/call", params: { name: "get_skill", arguments: { skill: "marketing-loops" } } }, { "cf-connecting-ip": "192.0.2.51" }));
  ok(!sk.result.isError, "an old skill slug resolves to its aaj- name");
}

// 3. Engines that once read input only from a file now take it inline (Oct 10).
for (const [engine, input] of [
  ["pipeline-and-forecast", { target: 100000, winRate: 0.3, stageProbabilities: { Proposal: 0.5 }, deals: [{ name: "a", amount: 50000, stage: "Proposal" }] }],
  ["pricing-and-packaging", { tiers: [{ name: "A", price: 50, customers: 10 }, { name: "B", price: 150, customers: 5 }] }],
  ["target-account-list", { accounts: [{ name: "Acme", signals: { industryMatch: true, sizeBand: true } }] }],
]) {
  const [st, bd] = await j(await post({ jsonrpc: "2.0", id: 99, method: "tools/call", params: { name: "run_engine", arguments: { engine, input } } }));
  ok(st === 200 && /Source: your input/.test(bd.result.content[0].text), `${engine} uses the input it was given, not its demo`);
}

// 4. Review fixes (Oct 10): pollution, batch cap, inherited tool names.
{
  const leads = [
    { id: "a", created_at: "2026-09-01 09:00", fit: 40, behavior: 30, became_mql_at: "2026-09-01 09:10", first_sales_touch_at: "2026-09-01 10:00", outcome: "rejected", decided_at: "2026-09-02 10:00", reason: "__proto__" },
    { id: "b", created_at: "2026-09-01 09:00", fit: 40, behavior: 30, became_mql_at: "2026-09-01 09:10", first_sales_touch_at: "2026-09-01 10:00", outcome: "rejected", decided_at: "2026-09-02 10:00", reason: "__proto__" },
  ];
  await post({ jsonrpc: "2.0", id: 200, method: "tools/call", params: { name: "run_engine", arguments: { engine: "lead-handoff-sla", input: { model: { mqlThreshold: 50 }, sla: { responseHours: 4 }, leads } } } }, { "cf-connecting-ip": "198.51.100.1" });
  ok(!("count" in {}) && Object.prototype.count === undefined, "an input key of __proto__ does not reach Object.prototype");
  const many = Array.from({ length: 21 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
  const r21 = await post(many, { "cf-connecting-ip": "198.51.100.2" });
  ok(r21.status === 413, `batch over 20 is refused (got ${r21.status})`);
  const r20 = await post(many.slice(0, 20), { "cf-connecting-ip": "198.51.100.3" });
  ok(r20.status === 200, "batch of 20 is fine");
  let st = 200;
  for (let i = 0; i < 3 && st === 200; i++) st = (await post(many.slice(0, 20), { "cf-connecting-ip": "198.51.100.3" })).status;
  ok(st === 429, `batches count every message toward the limit (got ${st})`);
  const [, inh] = await j(await post({ jsonrpc: "2.0", id: 201, method: "tools/call", params: { name: "constructor", arguments: {} } }, { "cf-connecting-ip": "198.51.100.4" }));
  ok(inh.result?.isError === true && /Unknown tool/.test(inh.result.content[0].text), "inherited names are not tools");
}

// 5. Bad input stops the run with an error that names the problem (Oct 19).
// Each of these once printed nothing, ran on defaults, or counted a typo as zero.
for (const [engine, input, expect] of [
  ["ab-test-significance", { zzz: 1 }, /Unrecognised field.*zzz/],
  ["lifecycle-and-retention", { startMRR: 1000, churnMRR: 200 }, /Unrecognised field.*churnMRR/],
  ["paid-media-budget-allocation", { zzz: 1 }, /Unrecognised field.*zzz/],
  ["paid-media-budget-allocation", { budget: 1000, channels: [{ key: "gogle", cpc: 1 }] }, /not a known channel/],
  ["pipeline-and-forecast", { target: 1, winRate: 0.2, stageProbabilities: { Proposal: 0.5 }, deals: [{ amount: 5, stage: "Closing" }] }, /not in stageProbabilities/],
  ["pricing-and-packaging", { tiers: [{ name: "A", prce: 5, customers: 3 }] }, /unrecognised field.*prce/],
  ["founder-led-content", { check: "nope", input: {} }, /"check" must be one of/],
  ["ai-marketing-governance", { check: "nope", input: {} }, /"check" must be one of/],
  ["partnerships-and-co-marketing", { zzz: 1 }, /Unrecognised field.*zzz/],
  ["pr-and-earned-media", { check: "scoreStory" }, /"input" is required/],
  // Batch 2 (Oct 19): the rest of the engine-issues list.
  ["incrementality-and-mmm", { zzz: 1 }, /Unrecognised field.*zzz/],
  ["incrementality-and-mmm", { controlN: 1000, controlConv: 50 }, /Readout needs all of/],
  ["aaj-marketing-psychology", {}, /JSON input is/],
  ["pricing-page-teardown", { teardown: { pages: { A: { 1: "yes", 2: "no" } } } }, /answer all 21 checks/],
  ["structured-data-for-ai-search", { pagetype: "product", jsonld: {} }, /Unrecognised field.*pagetype/],
  ["buying-committee-map", { roles: [{ role: "champion", nme: "A" }] }, /unrecognised field.*nme/],
  ["product-launch", { launch: { what: "new-product" }, zzz: 1 }, /Unrecognised field.*zzz/],
  ["marketing-budget-planning", { stage: "series_a", annualRevenue: 3000000, runwayMonths: 12 }, /runwayMonths.*only used/],
  ["webinar-and-event-programs", { readout: { cost: 100, winrate: 0.2 } }, /Unrecognised field.*winrate/],
  ["aaj-copywriting", {}, /JSON input is/],
  ["market-sizing", { segments: [] }, /segment/i],
  ["target-account-list", { accounts: [{ name: "Acme", industryMatch: true }] }, /signals|unrecognised|Unrecognised/],
  ["website-conversion-audit", { checks: { nope: "pass" } }, /unknown|Unrecognised|not a known/i],
  ["seo-geo-aeo-audit", { checks: { nope: "pass" } }, /unknown|Unrecognised|not a known/i],
  ["marketing-report", { current: { MQLs: 5 } }, /MQLs|Unrecognised|unrecognised/],
  ["win-loss-analysis", { deals: [{ outcome: "maybe", amount: 5 }] }, /outcome/],
  ["agent-readiness-audit", { zzz: 1 }, /Unrecognised|unrecognised|unknown/],
  ["signup-flow-optimizer", { zzz: 1 }, /Unrecognised|unrecognised|unknown/],
  ["email-lifecycle-sequence", { zzz: 1 }, /Unrecognised|unrecognised|unknown/],
]) {
  const e = ENGINES.find((x) => x.id === engine || x.slug === engine);
  const argv = [JSON.stringify(input)];
  const node = spawnSync(process.execPath, [join(ROOT, e.file), ...argv], { encoding: "utf8", cwd: join(ROOT, dirname(e.file)) });
  const w = runInProcess(e, argv);
  ok(node.status === 1 && expect.test(node.stderr), `${engine}: bad input is an error under Node (exit ${node.status}: ${node.stderr.slice(0, 100)})`);
  ok(w.code === 1 && expect.test(w.err), `${engine}: bad input is an error in the Worker (exit ${w.code})`);
}
for (const id of ["founder-led-content", "ai-marketing-governance", "partnerships-and-co-marketing", "pr-and-earned-media"]) {
  const e = ENGINES.find((x) => x.id === id || x.slug === id);
  const w = runInProcess(e, []);
  ok(w.code === 0 && /built-in demo/.test(w.out) && w.out.length > 200, `${id}: no input prints a labelled demo`);
  ok(runInProcess(e, ["--help"]).out.length > 200, `${id}: --help prints the header`);
}
// Batch-2 behaviour (Oct 19): wrong answers that used to look right.
{
  const eng = (id) => ENGINES.find((x) => x.id === id || x.slug === id);
  const run = (id, input) => runInProcess(eng(id), [JSON.stringify(input)]);
  const bc = run("buying-committee-map", { roles: [{ role: "champion", name: "A", access: "direct", stance: "for", mustBelieve: "x", asset: "y" }] });
  ok(!/Coverage.*\(100%\)/.test(bc.out), "buying-committee: one champion alone is not 100% coverage");
  const pl = run("partnerships-and-co-marketing", { check: "reviewPartnership", input: { signups: 100, qualifiedLeads: 30, pipelineValue: 50000, ourHours: 20, theirHours: 10, fullSalesCycleElapsed: false } });
  ok(/Too early to decide/.test(pl.out), "partnerships: pipeline before a full sales cycle is too early to repeat");
  const ic = run("incrementality-and-mmm", { baseline: 2.5, mde: 15, daily: 4000, split: 50, value: 400 });
  ok(/Lift withheld/.test(ic.out) && !/Conversions withheld/.test(ic.out), "incrementality: holdout cost counts the withheld lift only");
  const cs = runInProcess(eng("aaj-copywriting"), ["Buy now today"]);
  ok(/NOT SCORED/.test(cs.out) && !/\/100/.test(cs.out), "copywriting: a three-word input is not given a score");
  const sd = run("structured-data-for-ai-search", { pageType: "product", jsonld: { "@context": "https://schema.org", "@type": "Product", name: "X", offers: { "@type": "Offer", price: "10", priceCurrency: "USD" } } });
  ok(!/READY TO PUBLISH/i.test(sd.out), "structured-data: no page text is not 'Ready to publish'");
}
// A one-tailed test no longer calls a worse variant a winner, and the CI label follows the confidence level.
{
  const e = ENGINES.find((x) => x.id === "ab-test-significance" || x.slug === "ab-test-significance");
  const worse = runInProcess(e, [JSON.stringify({ control: { visitors: 4000, conversions: 250 }, variant: { visitors: 4050, conversions: 200 }, tail: "one" })]);
  ok(/NOT significant/.test(worse.out), "one-tailed: a worse variant is not significant");
  const ninety = runInProcess(e, [JSON.stringify({ control: { visitors: 4000, conversions: 200 }, variant: { visitors: 4050, conversions: 250 }, confidence: 90 })]);
  ok(/90% CI/.test(ninety.out) && !/95% CI/.test(ninety.out), "the interval label follows the confidence level");
}

if (slow.length) console.log(`Demos over 50 ms of wall time (check CPU limits): ${slow.join(", ")}`);
console.log(failed ? `\n${failed} of ${n} checks failed.` : `\nAll ${n} checks passed (${ENGINES.length} engines x demo/help/bad input in parity with Node, plus HTTP transport).`);
process.exit(failed ? 1 : 0);
