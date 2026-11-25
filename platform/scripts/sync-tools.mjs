#!/usr/bin/env node
/**
 * Copy the free tool counts from aajconsult.com/counts.json into
 * platform/lib/site-counts.mjs, then refresh counts.json (npm run counts).
 *
 *   node platform/scripts/sync-tools.mjs                 fetch the live file and copy it
 *   node platform/scripts/sync-tools.mjs --check         fail if the copy is out of date
 *   node platform/scripts/sync-tools.mjs --from <file>   read a local copy instead of fetching
 *
 * Only the date changes when the numbers do, so a check on an unchanged site passes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SITE_COUNTS } from "../lib/site-counts.mjs";

const TARGET = fileURLToPath(new URL("../lib/site-counts.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const check = args.includes("--check");
const fromAt = args.indexOf("--from");

const live = fromAt > -1
  ? JSON.parse(readFileSync(args[fromAt + 1], "utf8"))
  : await (await fetch(SITE_COUNTS.source, { headers: { "cache-control": "no-cache" } })).json();

const next = { free_tools: live?.site?.tools, skills_with_browser_tool: live?.skills?.skills_with_browser_tool };
for (const [k, v] of Object.entries(next)) {
  if (!Number.isInteger(v) || v < 0) {
    console.error(`${SITE_COUNTS.source} has no usable ${k} (got ${JSON.stringify(v)}).`);
    process.exit(1);
  }
}
const changed = Object.keys(next).filter((k) => next[k] !== SITE_COUNTS[k]);

if (!changed.length) {
  console.log(`Tool counts match ${SITE_COUNTS.source}: ${next.free_tools} free tools, ${next.skills_with_browser_tool} skills with a browser tool.`);
  process.exit(0);
}
const diff = changed.map((k) => `${k}: ${SITE_COUNTS[k]} here, ${next[k]} on the site`).join("; ");
if (check) {
  console.error(`Tool counts are out of date (${diff}).\nRun: npm run sync:tools, then commit counts.json and platform/lib/site-counts.mjs.`);
  process.exit(1);
}
const src = readFileSync(TARGET, "utf8");
const body = `export const SITE_COUNTS = {
  source: "${SITE_COUNTS.source}",
  copied_on: "${new Date().toISOString().slice(0, 10)}",
  free_tools: ${next.free_tools},
  skills_with_browser_tool: ${next.skills_with_browser_tool},
};
`;
writeFileSync(TARGET, src.slice(0, src.indexOf("export const SITE_COUNTS")) + body);
console.log(`Copied (${diff}).`);
execFileSync(process.execPath, ["platform/scripts/generate-readme.mjs"], { cwd: ROOT, stdio: "inherit" });
