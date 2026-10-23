#!/usr/bin/env node
/**
 * Golden-output tests for every engine.
 *
 * Each engine has a fixture in platform/test/golden/<engine id>.json holding one
 * or more fixed inputs and the exact output the engine gave when the fixture was
 * recorded: exit code, stdout and stderr, line by line. This runs every engine on
 * its fixtures and fails, engine by engine, on any difference. An engine with no
 * fixture fails too, so a new engine cannot skip the check.
 *
 *   node platform/test/golden.mjs                 # check every engine
 *   node platform/test/golden.mjs --only <id>     # check one engine (repeatable)
 *   node platform/test/golden.mjs --update        # re-record expected output (all, or --only)
 *
 * --update rewrites the "exitCode", "stdout" and "stderr" of every case from a
 * fresh run and keeps each case's name, source and args. For an engine with no
 * fixture it writes one with the engine's built-in worked example (--demo) as
 * its only case. Read the diff before committing: a re-recorded fixture is a
 * claim that the new output is right.
 *
 * Runs are made reproducible: TZ=UTC, an en-US locale (engines format numbers
 * with toLocaleString), and the clock pinned by freeze-clock.cjs, so engines
 * that default "today" to the current date give the same answer every day.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { listSkills } from "../lib/catalog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const FIXTURES = join(HERE, "golden");
const CLOCK = join(HERE, "freeze-clock.cjs");
const NOW = "2026-10-23T12:00:00Z";
const ENV = { NODE_ENV: "production", TZ: "UTC", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8", AAJ_GOLDEN_NOW: NOW };

const args = process.argv.slice(2);
const update = args.includes("--update");
const only = args.flatMap((a, i) => (a === "--only" && args[i + 1] ? [args[i + 1]] : []));

// The same engine ids as the MCP servers (platform/mcp/server.mjs, mcp-worker/build.mjs).
const engines = [];
for (const s of listSkills(ROOT)) {
  for (const f of s.jsFiles) {
    const id = s.jsFiles.length === 1 ? s.slug : `${s.slug}:${basename(f, ".js")}`;
    engines.push({ id, file: join(s.resourcesDir, f) });
  }
}
const fixtureName = (id) => id.replace(/:/g, "__") + ".json";
const lines = (s) => {
  const out = String(s).replace(/\r\n/g, "\n").split("\n");
  if (out[out.length - 1] === "") out.pop();
  return out;
};

function run(engine, argv) {
  const r = spawnSync(process.execPath, ["--require", CLOCK, engine.file, ...argv], {
    cwd: dirname(engine.file), env: ENV, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return { exitCode: null, stdout: [], stderr: [`could not run: ${r.error.message}`] };
  return { exitCode: r.status, stdout: lines(r.stdout), stderr: lines(r.stderr) };
}

function firstDiff(want, got) {
  const n = Math.max(want.length, got.length);
  for (let i = 0; i < n; i++) {
    if (want[i] !== got[i]) return { line: i + 1, want: want[i], got: got[i] };
  }
  return null;
}

const show = (s) => (s === undefined ? "(no line)" : JSON.stringify(s.length > 160 ? s.slice(0, 160) + "…" : s));

let failed = 0, passedCases = 0, written = 0;
const problems = [];
const selected = only.length ? engines.filter((e) => only.includes(e.id)) : engines;
if (only.length && selected.length !== only.length) {
  const known = new Set(engines.map((e) => e.id));
  console.error(`Unknown engine id: ${only.filter((id) => !known.has(id)).join(", ")}`);
  process.exit(1);
}

for (const engine of selected) {
  const path = join(FIXTURES, fixtureName(engine.id));
  const rel = relative(ROOT, path);
  if (!existsSync(path)) {
    if (update) {
      mkdirSync(FIXTURES, { recursive: true });
      const fx = { engine: engine.id, file: relative(ROOT, engine.file), cases: [{ name: "built-in worked example", source: "the engine's --demo", args: ["--demo"], ...run(engine, ["--demo"]) }] };
      writeFileSync(path, JSON.stringify(fx, null, 2) + "\n");
      written++;
      console.log(`created ${rel} (demo only) - read it, and add a case with your own input`);
      continue;
    }
    failed++;
    problems.push(`${engine.id}: no golden fixture. Every engine needs one: run \`npm run test:golden -- --update --only ${engine.id}\`, read the output it records, and add a second case with a realistic input.`);
    continue;
  }

  let fx;
  try { fx = JSON.parse(readFileSync(path, "utf8")); } catch (e) {
    failed++; problems.push(`${engine.id}: ${rel} is not valid JSON (${e.message}).`); continue;
  }
  if (!Array.isArray(fx.cases) || !fx.cases.length) {
    failed++; problems.push(`${engine.id}: ${rel} has no cases.`); continue;
  }

  if (update) {
    fx.engine = engine.id;
    fx.file = relative(ROOT, engine.file);
    fx.cases = fx.cases.map((c) => ({ name: c.name, source: c.source, args: c.args, ...run(engine, c.args) }));
    writeFileSync(path, JSON.stringify(fx, null, 2) + "\n");
    written++;
    console.log(`recorded ${rel} (${fx.cases.length} case${fx.cases.length > 1 ? "s" : ""})`);
    continue;
  }

  const msgs = [];
  for (const c of fx.cases) {
    if (!Array.isArray(c.args)) { msgs.push(`  case "${c.name}": "args" must be an array of command-line arguments.`); continue; }
    const got = run(engine, c.args);
    const bad = [];
    if (got.exitCode !== c.exitCode) bad.push(`exit code ${got.exitCode}, expected ${c.exitCode}`);
    for (const stream of ["stdout", "stderr"]) {
      const d = firstDiff(c[stream] || [], got[stream]);
      if (d) bad.push(`${stream} differs at line ${d.line} (${(c[stream] || []).length} lines expected, ${got[stream].length} now)\n      expected ${show(d.want)}\n      got      ${show(d.got)}`);
    }
    if (bad.length) msgs.push(`  case "${c.name}":\n    ${bad.join("\n    ")}`);
    else passedCases++;
  }
  if (msgs.length) {
    failed++;
    problems.push(`${engine.id}: output changed (${rel})\n${msgs.join("\n")}\n  If the change is intended, re-record with \`npm run test:golden -- --update --only ${engine.id}\` and explain it in the PR.`);
  }
}

// A fixture whose engine is gone (renamed or removed) is stale.
if (!only.length && existsSync(FIXTURES)) {
  const ids = new Set(engines.map((e) => fixtureName(e.id)));
  for (const f of readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort()) {
    if (!ids.has(f)) { failed++; problems.push(`${f}: fixture for an engine that no longer exists. Delete it or rename it to the engine's id.`); }
  }
}

if (update) {
  console.log(`\n${written} fixture(s) written. Read the diff before committing.`);
  process.exit(0);
}
if (problems.length) {
  console.error(problems.map((p) => "FAIL " + p).join("\n\n"));
  console.error(`\n${failed} of ${selected.length} engines failed the golden check; ${passedCases} cases matched.`);
  process.exit(1);
}
console.log(`Golden outputs match: ${selected.length} engines, ${passedCases} cases.`);
