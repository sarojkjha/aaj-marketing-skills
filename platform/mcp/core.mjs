/**
 * AAJ Engines — MCP protocol core, shared by the stdio server (server.mjs) and
 * the hosted Cloudflare Worker (platform/mcp-worker/). No Node imports: it runs
 * anywhere that has fetch-era JavaScript.
 *
 *   const server = createServer({ skills, engines, run, log, transport });
 *   const response = await server.handle(jsonRpcMessage);   // undefined for notifications
 *
 * skills  — catalog entries (slug, title, description, category, body, hasEngine, url)
 * engines — Map of id -> { id, slug, help, summary, skillName, category, specText? }
 * run     — async (engine, argv) => { code, out, err, capped?, timedOut?, spawnError? }
 */
import { currentSlug } from "../lib/renamed.mjs";

export const SERVER_NAME = "aaj-engines";
export const SERVER_VERSION = "1.2.0";
export const SITE = "https://aajconsult.com";
export const SKILLS_SITE = "https://skills.aajconsult.com";
// Protocol versions this server knows how to speak, newest first.
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const RUN_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 120_000;

export function firstSentence(s, cap = 180) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  let out = m ? m[1] : t;
  if (out.length > cap) out = out.slice(0, cap).replace(/\s+\S*$/, "") + "…";
  return out;
}

export function engineSummary(help, fallback) {
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

export function createServer({ skills, engines, run, log = () => {}, transport = "stdio" }) {
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
        limit: { type: "integer", description: "Max results, default 8.", minimum: 1, maximum: Math.max(1, skills.length) },
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

// Old names keep working: five skills took an `aaj-` prefix on Oct 11, 2026.
const findEngine = (id) => engines.get(id) || engines.get(currentSlug(id));

function toolDescribeEngine({ engine }) {
  const e = findEngine(engine);
  if (!e) return fail(unknownEngine(engine));
  return text(
    [
      `# ${e.id}`,
      `Skill: ${e.skillName}  ·  ${SKILLS_SITE}/skills/${e.slug}`,
      "",
      ...(e.specText ? [e.specText, `Full spec: https://github.com/sarojkjha/aaj-marketing-skills/blob/main/docs/engines/${e.slug}.md`, ""] : []),
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

async function toolRunEngine({ engine, input }) {
  const e = findEngine(engine);
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

  const r = await run(e, argv);

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
  const n = Math.min(Math.max(limit || 8, 1), Math.max(1, skills.length));

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
  const slug = currentSlug(String(skill || "").trim());
  const s = skills.find((x) => x.slug === slug) || skills.find((x) => x.slug === currentSlug(slug.toLowerCase()));
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

async function handle(msg) {
    // Returns the JSON-RPC response object, or undefined for notifications.
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      const version = SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return ok(id, {
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
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name;
      const fn = Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : undefined;
      if (!fn) return ok(id, fail(`Unknown tool "${name}". This server offers: ${Object.keys(HANDLERS).join(", ")}.`));
      try {
        return ok(id, await fn(params?.arguments || {}));
      } catch (e) {
        // Log the error type and stack frames, never the message: an error message can
        // quote the input (JSON.parse does), and the hosted server keeps no inputs.
        log(`tool ${name} threw ${e?.name || "Error"}${String(e?.stack || "").split("\n").slice(1, 6).join("\n")}`);
        return ok(id, fail(`${name} failed: ${e.message}`));
      }
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      if (isNotification) return;
      return err(id, -32601, `Method not found: ${method}`);
  }
}


  const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
  const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  return { handle, TOOLS, HANDLERS, skills, engines, transport };
}
