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
import { ENGINES } from "./engines.generated.mjs";

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

// 3. Engines that once read input only from a file now take it inline (Oct 10).
for (const [engine, input] of [
  ["pipeline-and-forecast", { target: 100000, winRate: 0.3, stageProbabilities: { Proposal: 0.5 }, deals: [{ name: "a", amount: 50000, stage: "Proposal" }] }],
  ["pricing-and-packaging", { tiers: [{ name: "A", price: 50, customers: 10 }, { name: "B", price: 150, customers: 5 }] }],
  ["target-account-list", { accounts: [{ name: "Acme", industryMatch: true, sizeBand: true }] }],
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

if (slow.length) console.log(`Demos over 50 ms of wall time (check CPU limits): ${slow.join(", ")}`);
console.log(failed ? `\n${failed} of ${n} checks failed.` : `\nAll ${n} checks passed (${ENGINES.length} engines x demo/help/bad input in parity with Node, plus HTTP transport).`);
process.exit(failed ? 1 : 0);
