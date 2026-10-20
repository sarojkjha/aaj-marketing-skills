// Builds plugins/aaj-marketing-skills/, the folder the Claude directory scans.
// Only what the plugin needs at run time goes in: skills, the MCP server and
// the two modules it imports, the engine environments file, the manifest, the
// licence and a short README. Ops notes, the hosted worker, Supabase files and
// the repo's scripts stay out, so the directory's validator never reads them.
//
//   node platform/scripts/build-plugin.mjs           rebuild the folder
//   node platform/scripts/build-plugin.mjs --check   fail if it is out of date
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = join(ROOT, "plugins", "aaj-marketing-skills");
const check = process.argv.includes("--check");
const target = check ? join(ROOT, ".plugin-build-check") : OUT;

function build(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, ".claude-plugin"), { recursive: true });
  mkdirSync(join(dest, "platform", "mcp"), { recursive: true });
  cpSync(join(ROOT, "skills"), join(dest, "skills"), { recursive: true });
  cpSync(join(ROOT, "platform", "lib"), join(dest, "platform", "lib"), {
    recursive: true,
    filter: (p) => !p.endsWith("counts.mjs"), // README tooling, not used by the server
  });
  for (const f of ["core.mjs", "server.mjs"]) cpSync(join(ROOT, "platform", "mcp", f), join(dest, "platform", "mcp", f));
  cpSync(join(ROOT, "platform", "engine-environments.json"), join(dest, "platform", "engine-environments.json"));
  cpSync(join(ROOT, "LICENSE"), join(dest, "LICENSE"));
  cpSync(join(ROOT, "platform", "assets", "plugin-icon.png"), join(dest, ".claude-plugin", "icon.png"));
  cpSync(join(ROOT, ".claude-plugin", "plugin.json"), join(dest, ".claude-plugin", "plugin.json"));
  writeFileSync(join(dest, "README.md"), readme());
}

function readme() {
  const p = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  return `# AAJ marketing skills (plugin)

${p.description}

Version ${p.version}. MIT licence.

- **Skills:** the marketing methods, in \`skills/\`.
- **Engines:** most skills carry a small JavaScript engine in \`resources/\`. It takes your numbers and returns a number and a verdict, the same answer every time. Engines make no network calls and write no files.
- **MCP server:** \`platform/mcp/server.mjs\` starts locally (Node 18 or later, no install step) and lets Claude list and run the engines.

Methods and the full catalogue: ${p.homepage}
Source and issues: ${p.repository}
`;
}

function files(dir, base = dir, out = []) {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

build(target);
if (check) {
  const a = files(target), b = existsSync(OUT) ? files(OUT) : [];
  let bad = JSON.stringify(a) !== JSON.stringify(b) ? ["file list differs"] : [];
  if (!bad.length) bad = a.filter((f) => !readFileSync(join(target, f)).equals(readFileSync(join(OUT, f))));
  rmSync(target, { recursive: true, force: true });
  if (bad.length) {
    console.error("plugins/aaj-marketing-skills is out of date:\n  " + bad.slice(0, 10).join("\n  ") + "\nRun: node platform/scripts/build-plugin.mjs");
    process.exit(1);
  }
  console.log(`plugin folder in sync (${a.length} files)`);
} else {
  console.log(`built ${relative(ROOT, OUT)} (${files(OUT).length} files)`);
}
