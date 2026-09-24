#!/usr/bin/env node
/**
 * Smoke test for the AAJ Engines MCP server.
 *
 * Starts the server over stdio exactly as a client would, then runs every
 * engine's built-in demo through run_engine. Catches an engine whose argument
 * handling or header differs from the rest before a user finds it.
 *
 *   node platform/mcp/smoke-test.mjs
 *
 * Exit 0 if every engine ran, 1 otherwise.
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "server.mjs");

const listed = spawnSync(process.execPath, [SERVER, "--engines"], { encoding: "utf8" });
const ids = listed.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
if (!ids.length) {
  console.error("No engines discovered. Is this file still inside platform/mcp/ of the repo?");
  process.exit(1);
}
console.log(`Discovered ${ids.length} engines. Running each one's demo…\n`);

const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
const pending = new Map();
let buf = "";
let nextId = 1;

child.stdout.setEncoding("utf8");
child.stdout.on("data", (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.error("NON-JSON on stdout:", line.slice(0, 160)); continue; }
    const resolve = pending.get(msg.id);
    if (resolve) { pending.delete(msg.id); resolve(msg); }
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => process.stderr.write(d));

const call = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });

const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
console.log(`protocol ${init.result.protocolVersion} · ${init.result.serverInfo.name} ${init.result.serverInfo.version}`);
const tools = (await call("tools/list")).result.tools.map((t) => t.name);
console.log(`tools: ${tools.join(", ")}\n`);

let failed = 0;
for (const id of ids) {
  const r = await call("tools/call", { name: "run_engine", arguments: { engine: id } });
  const body = r.result?.content?.[0]?.text || "";
  if (r.result?.isError) {
    failed++;
    console.log(`FAIL  ${id}`);
    console.log("      " + body.split("\n").filter(Boolean).slice(0, 3).join("\n      "));
  } else {
    const lines = body.split("\n").filter((l) => l.trim()).length;
    console.log(`ok    ${id}  (${lines} lines of output)`);
  }
}

child.stdin.end();
console.log(`\n${ids.length - failed}/${ids.length} engines ran. ${failed ? failed + " FAILED." : "All good."}`);
process.exit(failed ? 1 : 0);
