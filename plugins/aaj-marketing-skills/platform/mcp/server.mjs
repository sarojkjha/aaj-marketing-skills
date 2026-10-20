#!/usr/bin/env node
/**
 * AAJ Engines — MCP server (stdio, zero dependencies)
 *
 * Exposes the AAJ marketing skills and their runnable engines to any MCP
 * client: Claude Desktop, Claude Code, Cursor, Windsurf, Codex.
 *
 *   list_engines     which engines exist, what each one answers
 *   describe_engine  the input schema for one engine
 *   run_engine       run it on your numbers, or --demo for a worked example
 *   search_skills    find a skill by problem, not by name
 *   get_skill        the full method for one skill
 *
 * Engines and skills are discovered from the repo at startup, never from a
 * checked-in list. Adding a skill or an engine needs no change to this file.
 *
 * Protocol: JSON-RPC 2.0 over newline-delimited JSON on stdin/stdout.
 * stdout carries protocol traffic only — all logging goes to stderr.
 */
import { spawn } from "node:child_process";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { listSkills, engineHelp } from "../lib/catalog.mjs";
import { buildSpec, specForAgent, loadEnvironments } from "../lib/specs.mjs";
// The protocol and the five tools live in core.mjs, shared with the hosted
// Cloudflare Worker (platform/mcp-worker/). This file adds discovery from disk,
// the child-process engine runner and the stdio transport.
import {
  createServer, engineSummary, SERVER_NAME, SERVER_VERSION, SKILLS_SITE,
  RUN_TIMEOUT_MS, MAX_OUTPUT_BYTES,
} from "./core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// platform/mcp/server.mjs -> repo root
// Default: two levels up from this file. To point at another checkout, pass --root <dir>.
const rootFlag = process.argv.indexOf("--root");
const REPO_ROOT = resolve(rootFlag > -1 && process.argv[rootFlag + 1] ? process.argv[rootFlag + 1] : join(HERE, "..", ".."));
const SKILLS_DIR = join(REPO_ROOT, "skills");

const log = (...a) => process.stderr.write("[aaj-engines] " + a.join(" ") + "\n");

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

function discover() {
  const found = listSkills(REPO_ROOT);
  if (!found.length) {
    log(`no skills found under ${SKILLS_DIR} — pass --root <repo root>`);
    return { skills: [], engines: new Map() };
  }
  const skills = [];
  const engines = new Map();
  const env = loadEnvironments(REPO_ROOT);

  for (const s of found) {
    const skill = { ...s, url: `${SKILLS_SITE}/skills/${s.slug}`, path: s.skillMd };
    skills.push(skill);

    for (const f of s.jsFiles) {
      const file = join(s.resourcesDir, f);
      // One engine per skill in every current case, so the skill slug is the
      // engine id. A second engine in the same skill gets a suffixed id.
      const id = s.jsFiles.length === 1 ? s.slug : `${s.slug}:${basename(f, ".js")}`;
      const help = engineHelp(file);
      engines.set(id, {
        id, slug: s.slug, file, help,
        summary: engineSummary(help, s.description),
        skillName: s.title,
        category: s.category,
        specText: specForAgent(buildSpec(s, file, id, env)),
      });
    }
  }
  return { skills, engines };
}

const { skills, engines } = discover();
log(`${skills.length} skills, ${engines.size} engines from ${REPO_ROOT}`);

/* ------------------------------------------------------------------ *
 * Engine runner (child process)
 * ------------------------------------------------------------------ */

function runEngine(e, argv) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [e.file, ...argv], {
      cwd: dirname(e.file),
      stdio: ["ignore", "pipe", "pipe"],
      env: { NODE_ENV: "production" }, // engines are pure; the node binary is addressed by absolute path
    });
    let out = "", err = "", capped = false, settled = false;
    const cap = (s, chunk) => {
      if (s.length >= MAX_OUTPUT_BYTES) { capped = true; return s; }
      return s + chunk;
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      done({ timedOut: true, out, err, code: null });
    }, RUN_TIMEOUT_MS);

    child.stdout.on("data", (d) => { out = cap(out, d.toString()); });
    child.stderr.on("data", (d) => { err = cap(err, d.toString()); });
    child.on("error", (e2) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      done({ spawnError: e2.message, out, err, code: null });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      done({ code, out, err, capped });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Non-protocol CLI modes — for humans and CI, never used by a client
 * ------------------------------------------------------------------ */

if (process.argv.includes("--engines")) {
  for (const id of engines.keys()) console.log(id);
  process.exit(0);
}
if (process.argv.includes("--version")) {
  console.log(`${SERVER_NAME} ${SERVER_VERSION} — ${skills.length} skills, ${engines.size} engines`);
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * JSON-RPC 2.0 over stdio
 * ------------------------------------------------------------------ */

const server = createServer({ skills, engines, run: runEngine, log, transport: "stdio" });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
const replyError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const res = await server.handle(msg);
  if (res) send(res);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      replyError(null, -32700, "Parse error");
      continue;
    }
    Promise.resolve(handle(msg)).catch((e) => {
      log(`handler error: ${e.stack || e.message}`);
      if (msg.id !== undefined && msg.id !== null) replyError(msg.id, -32603, `Internal error: ${e.message}`);
    });
  }
});
process.stdin.on("end", () => process.exit(0));
