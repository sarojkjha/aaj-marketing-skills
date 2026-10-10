/**
 * AAJ Engines — hosted MCP server on Cloudflare Workers (roadmap R6, Oct 10, 2026).
 *
 * The same five tools as the local server (platform/mcp/server.mjs), shared
 * through platform/mcp/core.mjs: list_engines, describe_engine, run_engine,
 * search_skills, get_skill. Founders add one URL as a custom connector in Claude
 * or ChatGPT instead of cloning the repo.
 *
 * Transport: MCP "Streamable HTTP", stateless. POST /mcp with a JSON-RPC message
 * (or a batch) returns application/json; notifications return 202. GET /mcp
 * returns 405 (no server-initiated stream). No accounts, no storage: engines are
 * deterministic and make no network calls, and nothing a client sends is kept.
 *
 * Build: node platform/mcp-worker/build.mjs   (regenerates engines.generated.mjs)
 * Deploy: see platform/mcp-worker/README.md
 */
import { createServer, firstSentence, MAX_OUTPUT_BYTES, SERVER_NAME, SERVER_VERSION, SKILLS_SITE } from "../mcp/core.mjs";
import { SKILLS, ENGINES, RUNNERS } from "./engines.generated.mjs";

const MAX_BODY_BYTES = 256 * 1024;
const RATE_PER_MINUTE = 60; // messages per client IP per minute, per isolate: a guard against loops, not a quota
const MAX_BATCH = 20;       // JSON-RPC messages in one POST
const MAX_TRACKED_IPS = 5000;

// One isolate serves many people, so no engine may change a built-in prototype
// (an input key of "__proto__" must never leak into the next request). Frozen
// once at start; engines that try fail on their own input, not on anyone else's.
for (const proto of [Object.prototype, Array.prototype, Function.prototype, String.prototype, Number.prototype, Boolean.prototype]) Object.freeze(proto);

/* ------------------------------------------------------------------ *
 * In-process engine runner
 * ------------------------------------------------------------------ */

const EXIT = Symbol("aaj-exit");

function fmt(v) {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack || v.message;
  try { return typeof v === "object" ? JSON.stringify(v, null, 2) : String(v); } catch { return String(v); }
}

export function runInProcess(engine, argv) {
  const fn = RUNNERS[engine.id];
  if (!fn) return { spawnError: "engine not bundled" };
  const out = [], err = [];
  let size = 0, capped = false;
  const push = (arr, s) => {
    if (size >= MAX_OUTPUT_BYTES) { capped = true; return; }
    size += s.length;
    arr.push(s);
  };
  let code = null;
  const proc = {
    argv: ["node", engine.file, ...argv],
    env: { NODE_ENV: "production" },
    platform: "linux",
    exitCode: undefined,
    stdout: { write: (s) => { push(out, String(s)); return true; }, isTTY: false },
    stderr: { write: (s) => { push(err, String(s)); return true; }, isTTY: false },
    exit: (c) => { if (code === null) code = c === undefined ? (proc.exitCode ?? 0) : Number(c) || 0; throw EXIT; },
    on: () => proc,
    cwd: () => "/",
  };
  const con = {
    log: (...a) => push(out, a.map(fmt).join(" ") + "\n"),
    info: (...a) => push(out, a.map(fmt).join(" ") + "\n"),
    warn: (...a) => push(err, a.map(fmt).join(" ") + "\n"),
    error: (...a) => push(err, a.map(fmt).join(" ") + "\n"),
    table: (x) => push(out, fmt(x) + "\n"),
  };
  const req = (m) => {
    if (m === "fs" || m === "node:fs") {
      return {
        readFileSync: (p) => {
          if (p === engine.file) return engine.head; // engines print their own header for --help
          throw new Error("Reading files is not available on the hosted server. Pass the data in `input` instead.");
        },
        existsSync: () => false,
      };
    }
    if (m === "path" || m === "node:path") {
      return { join: (...p) => p.join("/"), basename: (p) => String(p).split("/").pop(), dirname: (p) => String(p).split("/").slice(0, -1).join("/") || "/", resolve: (...p) => p.join("/") };
    }
    throw new Error(`Module "${m}" is not available on the hosted server.`);
  };
  const mod = { exports: {} };
  mod.require = req;
  req.main = mod;
  try {
    fn(con, proc, req, mod, mod.exports, engine.file, engine.file.split("/").slice(0, -1).join("/"));
  } catch (e) {
    if (e !== EXIT) {
      push(err, fmt(e) + "\n");
      if (code === null) code = 1;
    }
  }
  if (code === null) code = proc.exitCode ?? 0;
  // An engine that catches everything may print our exit sentinel; never show it.
  const clean = (a) => a.join("").replace(/Symbol\(aaj-exit\)\n?/g, "");
  return { code, out: clean(out), err: clean(err), capped };
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

const engines = new Map(ENGINES.map((e) => [e.id, e]));
const server = createServer({
  skills: SKILLS,
  engines,
  run: async (e, argv) => runInProcess(e, argv),
  log: (...a) => console.log("[aaj-engines]", ...a),
  transport: "http",
});

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, authorization",
  "access-control-expose-headers": "mcp-session-id",
  "access-control-max-age": "86400",
};
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS, ...extra } });

const hits = new Map();
/** Count `n` messages for this IP; true when it is over the per-minute limit. */
function limited(ip, n = 1) {
  const now = Date.now(), win = 60_000;
  const h = hits.get(ip);
  if (!h || now - h.start > win) {
    if (hits.size >= MAX_TRACKED_IPS) hits.clear(); // checked before every insert, so the map can't grow without bound
    hits.set(ip, { start: now, n });
    return n > RATE_PER_MINUTE;
  }
  h.n += n;
  return h.n > RATE_PER_MINUTE;
}

function infoPage(origin) {
  const url = `${origin}/mcp`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AAJ Engines MCP server</title><meta name="robots" content="noindex">
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.55;color:#142338}code{background:#f2efe8;padding:2px 6px;border-radius:5px}a{color:#c45a00}</style></head><body>
<h1>AAJ Engines</h1>
<p>An MCP server with ${ENGINES.length} runnable marketing engines and ${SKILLS.length} skills from <a href="${SKILLS_SITE}">AAJ's open-source skills</a>. Your AI assistant can find the right method for a problem and run the maths on your numbers instead of estimating.</p>
<p><strong>Connect:</strong> add a custom connector (remote MCP server) with the URL <code>${url}</code>. No sign-in.</p>
<p><strong>Privacy:</strong> the engines run in memory and make no network calls. Nothing you send is stored by this server.</p>
<p>Prefer to run it locally? Clone <a href="https://github.com/sarojkjha/aaj-marketing-skills">the repo</a> and see platform/mcp/README.md.</p>
<p>${SERVER_NAME} ${SERVER_VERSION}</p></body></html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(infoPage(url.origin), { headers: { "content-type": "text/html; charset=utf-8", ...CORS } });
    }
    if (url.pathname === "/health") {
      return json({ ok: true, server: SERVER_NAME, version: SERVER_VERSION, skills: SKILLS.length, engines: ENGINES.length });
    }
    if (url.pathname !== "/mcp") return json({ error: "Not found. The MCP endpoint is /mcp." }, 404);

    if (request.method === "GET") {
      return new Response("This server does not open a server-to-client stream. POST JSON-RPC messages to /mcp.", { status: 405, headers: { allow: "POST, OPTIONS", ...CORS } });
    }
    if (request.method === "DELETE") return new Response(null, { status: 405, headers: { allow: "POST, OPTIONS", ...CORS } });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { allow: "POST, OPTIONS" });

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const tooMany = () => json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `Too many requests: up to ${RATE_PER_MINUTE} a minute. Wait a minute and try again.` } }, 429, { "retry-after": "60" });
    if (limited(ip)) return tooMany();

    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_BODY_BYTES) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large." } }, 413);
    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large." } }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }

    const batch = Array.isArray(body);
    const msgs = batch ? body : [body];
    if (!msgs.length) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Empty batch" } }, 400);
    if (msgs.length > MAX_BATCH) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Batch too large: at most ${MAX_BATCH} messages.` } }, 413);
    // Every message in a batch counts toward the limit (the first was counted above).
    if (msgs.length > 1 && limited(ip, msgs.length - 1)) return tooMany();
    const results = [];
    for (const m of msgs) {
      if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
        if (m && typeof m === "object" && ("result" in m || "error" in m)) continue; // a client's response to us: nothing to do
        results.push({ jsonrpc: "2.0", id: m?.id ?? null, error: { code: -32600, message: "Invalid Request" } });
        continue;
      }
      try {
        const r = await server.handle(m);
        if (r) results.push(r);
      } catch (e) {
        if (m.id !== undefined && m.id !== null) results.push({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: `Internal error: ${firstSentence(e.message, 200)}` } });
      }
    }
    if (!results.length) return new Response(null, { status: 202, headers: CORS });
    return json(batch ? results : results[0]);
  },
};
