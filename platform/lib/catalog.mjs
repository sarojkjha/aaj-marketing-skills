/**
 * AAJ skills catalog — the one reader of skills/<slug>/SKILL.md.
 *
 * Both the MCP server (platform/mcp/server.mjs) and the README generator
 * (platform/scripts/generate-readme.mjs) import this. Two parsers of the same
 * frontmatter is how the README fell four skills behind in the first place:
 * a second reader is a second thing to forget to update.
 *
 * Zero dependencies, on purpose — the MCP server ships without a package
 * install and this module must not change that.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
export const readText = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/**
 * Parse the frontmatter our SKILL.md files actually use: YAML with folded
 * block scalars (`description: >-`) and a nested `metadata:` map holding
 * category, phase, topic, card and version. Keys are flattened, first
 * occurrence winning, so a top-level key is never shadowed by a nested one.
 */
export function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: text };
  const lines = m[1].split("\n");
  const data = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const kv = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;                       // list items and continuations
    const indent = kv[1].length;
    const key = kv[2];
    let v = kv[3].trim();

    if (/^[|>][-+]?$/.test(v)) {             // block scalar
      const folded = v[0] === ">";
      const block = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.trim() && next.length - next.trimStart().length <= indent) break;
        block.push(next.trim());
        i++;
      }
      v = folded ? block.join(" ").trim() : block.join("\n").trim();
    } else if (v === "") {
      continue;                              // a parent key such as `metadata:`
    } else if (v.startsWith("[") && v.endsWith("]")) {
      v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, "");
    }
    if (!(key in data)) data[key] = v;
  }
  return { data, body: text.slice(m[0].length) };
}

/**
 * The header comment of every engine is its documented input schema — it is
 * literally what `--help` prints. Read it statically rather than spawning.
 */
export function engineHelp(file) {
  const src = readText(file);
  const start = src.indexOf("/*");
  if (start === -1) return "";
  const end = src.indexOf("*/", start);
  if (end === -1) return "";
  return src.slice(start + 2, end).replace(/^[ \t]*\*[ \t]?/gm, "").trim();
}

const ACRONYMS = new Set(["ab","seo","geo","aeo","mmm","pr","ai","abm","kpi","nrr","gtm","icp","roi","cac","ltv","b2b","b2c","crm"]);

/** "pr-and-earned-media" -> "PR & Earned Media". Frontmatter `name` is the slug. */
export function titleize(slug) {
  return slug.split("-").map((w) => {
    if (w === "and") return "&";
    if (ACRONYMS.has(w)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ").replace(/\bCo (\w)/g, "Co-$1");
}

export function firstSentence(s, cap = 180) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  let out = m ? m[1] : t;
  if (out.length > cap) out = out.slice(0, cap).replace(/\s+\S*$/, "") + "…";
  return out;
}

/**
 * Every skill in the repo, sorted by slug. A skill is a directory under
 * skills/ holding a SKILL.md — there is no manifest to keep in step.
 * `jsFiles` is the engine rule: any .js under resources/ is a runnable engine.
 */
export function listSkills(repoRoot) {
  const skillsDir = join(repoRoot, "skills");
  if (!isDir(skillsDir)) return [];
  const out = [];

  for (const slug of readdirSync(skillsDir).sort()) {
    const dir = join(skillsDir, slug);
    if (!isDir(dir)) continue;
    const skillMd = join(dir, "SKILL.md");
    if (!existsSync(skillMd)) continue;

    const { data, body } = frontmatter(readText(skillMd));
    const resources = join(dir, "resources");
    const jsFiles = isDir(resources)
      ? readdirSync(resources).filter((f) => f.endsWith(".js")).sort()
      : [];

    out.push({
      slug,
      dir,
      skillMd,
      name: data.name || slug,
      title: data.title || titleize(slug),
      description: data.description || "",
      card: data.card || "",
      category: data.category || "",
      topic: data.topic || "",
      phase: data.phase || "",
      body,
      jsFiles,
      resourcesDir: resources,
      hasEngine: jsFiles.length > 0,
    });
  }
  return out;
}
