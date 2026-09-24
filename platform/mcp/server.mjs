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
import { listSkills, engineHelp, firstSentence } from "../lib/catalog.mjs";

const SERVER_NAME = "aaj-engines";
const SERVER_VERSION = "1.0.0";
const SITE = "https://aajconsult.com";
const SKILLS_SITE = "https://skills.aajconsult.com";

// Protocol versions this server knows how to speak, newest first.
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

// A runaway engine must never wedge the client.
const RUN_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 120_000;

const HERE = dirname(fileURLToPath(import.meta.url));
// platform/mcp/server.mjs -> repo root
const REPO_ROOT = resolve(process.env.AAJ_SKILLS_ROOT || join(HERE, "..", ".."));
const SKILLS_DIR = join(REPO_ROOT, "skills");

const log = (...a) => process.stderr.write("[aaj-engines] " + a.join(" ") + "\n");

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

function engineSummary(help, fallback) {
  const fromDescription = firstSentence(fallback);
  if (fromDescription) return fromDescription;
  // No description: use the first prose paragraph of the engine header,
  // joined across its wrapped lines so it never ends mid-word.
  const lines = help.split("\n").map((l) => l.trim());
  const para = [];
  for (const line of lines.slice(1)) {
    if (/^Part of the /i.test(line)) continue;
    if (/^(USAGE|CONFIG|INPUT|OUTPUT|MODES)\b/.test(line)) break;
    if (!line) { if (para.length) break; continue; }
    para.push(line);
  }
  return firstSentence(para.join(" ").replace(/:$/, ""));
}

function discover() {
  const found = listSkills(REPO_ROOT);
  if (!found.length) {
    log(`no skills found under ${SKILLS_DIR} — set AAJ_SKILLS_ROOT to the repo root`);
    return { skills: [], engines: new Map() };
  }
  const skills = [];
  const engines = new Map();

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
      });
    }
  }
  return { skills, engines };
}

const { skills, engines } = discover();
log(`${skills.length} skills, ${engines.size} engines from ${REPO_ROOT}`);

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: "list_engines",
    description:
      "List every AAJ marketing engine that can be run: id, what question it answers, and its category. " +
      "Call this first when you need to compute something (unit economics, pipeline forecast, budget " +
      "allocation, retention, A/B significance, SEO/GEO score, ad spend, pricing) rather than estimate it.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional filter, matched loosely against the engine's category." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "describe_engine",
    description:
      "Show one engine's input schema: required fields, units, alternative shapes, and a worked example. " +
      "Always call this before run_engine unless you already know the schema — the engines reject bad input rather than guessing.",
    inputSchema: {
      type: "object",
      properties: { engine: { type: "string", description: "Engine id from list_engines." } },
      required: ["engine"],
      additionalProperties: false,
    },
  },
  {
    name: "run_engine",
    description:
      "Run an AAJ engine and return its verdict. Pass `input` as an object of the engine's fields. " +
      "Omit `input` to run the engine's built-in worked example. Engines are deterministic, offline, " +
      "and validate their input — a wrong unit is reported as an error, not absorbed into a confident answer.",
    inputSchema: {
      type: "object",
      properties: {
        engine: { type: "string", description: "Engine id from list_engines." },
        input: {
          type: ["object", "string"],
          description:
            "The engine's configuration object. Some engines also accept a named mode as a plain string " +
            "(for example 'design' or 'readout') — describe_engine says which. Omit for the demo.",
        },
      },
      required: ["engine"],
      additionalProperties: false,
    },
  },
  {
    name: "search_skills",
    description:
      "Find AAJ marketing skills by the problem they solve — 'churn is rising', 'we're launching next month', " +
      "'not showing up in AI answers'. Returns the method to follow, and says which skills have a runnable engine.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The problem, in plain words." },
        limit: { type: "integer", description: "Max results, default 8.", minimum: 1, maximum: 43 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_skill",
    description:
      "Return the full method for one skill: when to use it, the steps, the quality bar, and how to run its engine if it has one.",
    inputSchema: {
      type: "object",
      properties: { skill: { type: "string", description: "Skill slug from search_skills." } },
      required: ["skill"],
      additionalProperties: false,
    },
  },
];

const text = (s) => ({ content: [{ type: "text", text: s }] });
const fail = (s) => ({ content: [{ type: "text", text: s }], isError: true });

function toolListEngines({ category }) {
  let rows = [...engines.values()];
  if (category) {
    const q = String(category).toLowerCase();
    rows = rows.filter((e) => (e.category || "").toLowerCase().includes(q));
  }
  if (!rows.length) return text("No engines matched. Call list_engines with no filter to see all of them.");
  const byCat = new Map();
  for (const e of rows) {
    const c = e.category || "Uncategorised";
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(e);
  }
  const out = [`${rows.length} runnable engines.`, ""];
  for (const [cat, list] of [...byCat].sort()) {
    out.push(`## ${cat}`);
    for (const e of list) out.push(`- **${e.id}** — ${e.summary}`);
    out.push("");
  }
  out.push("Call describe_engine for an engine's input schema, then run_engine.");
  return text(out.join("\n"));
}

function toolDescribeEngine({ engine }) {
  const e = engines.get(engine);
  if (!e) return fail(unknownEngine(engine));
  return text(
    [
      `# ${e.id}`,
      `Skill: ${e.skillName}  ·  ${SKILLS_SITE}/skills/${e.slug}`,
      "",
      e.help || "(this engine ships no header schema; run it with no input to see its demo)",
      "",
      "Run it with run_engine. Omit `input` for the worked example above.",
    ].join("\n")
  );
}

function unknownEngine(id) {
  const all = [...engines.keys()];
  const near = all.filter((k) => k.includes(String(id).toLowerCase().slice(0, 5)));
  return (
    `Unknown engine "${id}".` +
    (near.length ? ` Did you mean: ${near.join(", ")}?` : "") +
    ` Call list_engines for the ${all.length} available ids.`
  );
}

function runEngine(e, argv) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [e.file, ...argv], {
      cwd: dirname(e.file),
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH, NODE_ENV: "production" },
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

async function toolRunEngine({ engine, input }) {
  const e = engines.get(engine);
  if (!e) return fail(unknownEngine(engine));

  let argv;
  if (input === undefined || input === null || input === "") {
    argv = ["--demo"];
  } else if (typeof input === "string") {
    const s = input.trim();
    // A JSON string, a named mode, or a flag — all pass through as one argument.
    argv = [s];
  } else if (typeof input === "object") {
    argv = [JSON.stringify(input)];
  } else {
    return fail(`\`input\` must be an object, a string mode, or omitted. Got ${typeof input}.`);
  }

  const r = await runEngine(e, argv);

  if (r.spawnError) return fail(`Could not start the engine: ${r.spawnError}`);
  if (r.timedOut) return fail(`Engine "${e.id}" did not finish within ${RUN_TIMEOUT_MS / 1000}s and was stopped.`);

  const body = (r.out || "").trim();
  const errBody = (r.err || "").trim();

  if (r.code !== 0) {
    return fail(
      [
        `Engine "${e.id}" rejected the input (exit ${r.code}).`,
        "",
        errBody || body || "(no output)",
        "",
        "Call describe_engine for the exact schema. These engines fail loudly by design rather than returning a confident wrong answer.",
      ].join("\n")
    );
  }

  const head = `${e.id} — ${e.skillName}\nMethod: ${SKILLS_SITE}/skills/${e.slug}\n`;
  const tail = r.capped ? `\n\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]` : "";
  const warn = errBody ? `\n\n[engine notes]\n${errBody}` : "";
  return text(head + "\n" + (body || "(engine produced no output)") + warn + tail);
}

const STOPWORDS = new Set((
  "the and for with that this from are but not all any more most very just about into over than " +
  "then them they you your how why what when who does doing done can will would should could " +
  "keep keeps keeping get gets getting make makes making need needs want wants help helps " +
  "work works working use uses using our their its his her was were been has have had " +
  "whether sure much many some each other others where which while such both either neither " +
  "still even only also every there here been being those these thing things way ways"
).split(" "));

function toolSearchSkills({ query, limit }) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return fail("Give me a `query` — the problem in plain words.");
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  const n = Math.min(Math.max(limit || 8, 1), 43);

  const scored = skills.map((s) => {
    const name = s.name.toLowerCase();
    const desc = s.description.toLowerCase();
    const slug = s.slug.toLowerCase();
    const body = s.body.toLowerCase();
    let score = 0;
    if (slug.includes(q) || name.includes(q)) score += 60;
    if (desc.includes(q)) score += 40;
    for (const t of terms) {
      if (slug.includes(t)) score += 12;
      if (name.includes(t)) score += 10;
      if (desc.includes(t)) score += 6;
      if (body.includes(t)) score += 1;
    }
    if (score > 0 && s.hasEngine) score += 5;   // a computed answer beats a described one
    return { s, score };
  // A match on body text alone scores low; requiring 8 keeps out skills that
  // merely happen to use the words somewhere in their prose.
  }).filter((r) => r.score >= 8).sort((a, b) => b.score - a.score).slice(0, n);

  if (!scored.length) {
    return text(
      `Nothing matched "${query}". The catalogue covers ${skills.length} skills across strategy, ` +
      `positioning, SEO/GEO, content, conversion, paid media, analytics, sales, pricing and retention. ` +
      `Try the symptom rather than the technique — "leads aren't converting" rather than "CRO".`
    );
  }

  const out = [`${scored.length} skill(s) for "${query}":`, ""];
  for (const { s } of scored) {
    out.push(`### ${s.title}  \`${s.slug}\``);
    if (s.description) out.push(firstSentence(s.description, 260));
    const bits = [];
    if (s.category) bits.push(s.category);
    if (s.hasEngine) bits.push(`runnable engine — run_engine("${s.slug}")`);
    bits.push(s.url);
    out.push(bits.join("  ·  "), "");
  }
  out.push("Call get_skill for the full method.");
  return text(out.join("\n"));
}

function toolGetSkill({ skill }) {
  const slug = String(skill || "").trim();
  const s = skills.find((x) => x.slug === slug) || skills.find((x) => x.slug === slug.toLowerCase());
  if (!s) {
    return fail(
      `Unknown skill "${skill}". Call search_skills to find it, or list_engines if you want the runnable ones.`
    );
  }
  const mine = [...engines.values()].filter((e) => e.slug === s.slug);
  const header = [
    `# ${s.title}`,
    s.description,
    "",
    `Source: ${s.url}`,
    mine.length
      ? `Runnable: ${mine.map((e) => `run_engine("${e.id}")`).join(", ")}`
      : "No engine — this skill is a method to follow.",
    "",
    "---",
    "",
  ].join("\n");
  return text(header + s.body.trim());
}

const HANDLERS = {
  list_engines: toolListEngines,
  describe_engine: toolDescribeEngine,
  run_engine: toolRunEngine,
  search_skills: toolSearchSkills,
  get_skill: toolGetSkill,
};

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

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const replyError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      const version = SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return reply(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          `AAJ marketing engines. ${engines.size} engines compute answers from your numbers — unit economics, ` +
          `forecasting, budget allocation, retention, experiment significance, SEO/GEO scoring. ` +
          `${skills.length} skills carry the method. Prefer running an engine over estimating. ` +
          `Methods are published at ${SKILLS_SITE} and ${SITE}/hub.`,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return; // notifications take no response
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name;
      const fn = HANDLERS[name];
      if (!fn) return reply(id, fail(`Unknown tool "${name}". This server offers: ${Object.keys(HANDLERS).join(", ")}.`));
      try {
        return reply(id, await fn(params?.arguments || {}));
      } catch (e) {
        log(`tool ${name} threw: ${e.stack || e.message}`);
        return reply(id, fail(`${name} failed: ${e.message}`));
      }
    }
    case "resources/list":
      return reply(id, { resources: [] });
    case "prompts/list":
      return reply(id, { prompts: [] });
    default:
      if (isNotification) return;
      return replyError(id, -32601, `Method not found: ${method}`);
  }
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
