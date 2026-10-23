/**
 * Build stamp: which code a server is running (Oct 23, 2026).
 *
 * Both MCP servers report it, so a stale copy shows up: the hosted Worker
 * (stamped at build time by platform/mcp-worker/build.mjs) and the local stdio
 * server (stamped at start-up from the files it loaded).
 *
 *   engineHash  sha256 of every engine's id and source, first 12 hex characters.
 *               The same engines give the same hash on every server and in every
 *               copy, so it is the number to compare: a vendored plugin copy or an
 *               old deploy shows a different one.
 *   commit      git short SHA of the checkout, when there is one. A plugin installed
 *               from the directory has no .git of its own, so it reports null and
 *               the engineHash carries the comparison.
 *
 * Zero dependencies beyond Node built-ins; no process is started (the local
 * server reads .git directly rather than running git).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readText } from "./catalog.mjs";

/** Engine count and content hash for skills as listed by catalog.listSkills(). */
export function engineFingerprint(skills) {
  const h = createHash("sha256");
  let engines = 0;
  for (const s of skills) {
    for (const f of s.jsFiles) {
      const id = s.jsFiles.length === 1 ? s.slug : `${s.slug}:${basename(f, ".js")}`;
      h.update(`${id}\n${readText(join(s.resourcesDir, f))}\n`);
      engines++;
    }
  }
  return { engines, engineHash: h.digest("hex").slice(0, 12) };
}

/**
 * Short SHA of HEAD when `root` is itself a git checkout (has its own .git),
 * read from the files under .git. Null otherwise, or if anything is unreadable.
 */
export function readGitHead(root) {
  try {
    let gitDir = join(root, ".git");
    if (!existsSync(gitDir)) return null;
    if (statSync(gitDir).isFile()) {                       // worktree or submodule: "gitdir: <path>"
      const m = readFileSync(gitDir, "utf8").match(/^gitdir:\s*(.+)$/m);
      if (!m) return null;
      gitDir = resolve(root, m[1].trim());
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40,64}$/.test(head)) return head.slice(0, 7);   // detached HEAD
    const ref = (head.match(/^ref:\s*(\S+)$/) || [])[1];
    if (!ref) return null;
    const common = existsSync(join(gitDir, "commondir"))
      ? resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim())
      : gitDir;
    for (const dir of [gitDir, common]) {
      const p = join(dir, ref);
      if (existsSync(p)) return readFileSync(p, "utf8").trim().slice(0, 7);
    }
    const packed = join(common, "packed-refs");
    if (existsSync(packed)) {
      const line = readFileSync(packed, "utf8").split("\n").find((l) => l.endsWith(" " + ref));
      if (line) return line.slice(0, 7);
    }
  } catch { /* no stamp rather than a failed start */ }
  return null;
}

/** One line for logs and --version. */
export function describeBuild(b) {
  return [
    `${b.server} ${b.version}`,
    `commit ${b.commit || "unknown"}${b.builtAt ? ` built ${b.builtAt}` : ""}`,
    `${b.skills} skills, ${b.engines} engines`,
    `engine hash ${b.engineHash}`,
  ].join(" · ");
}
