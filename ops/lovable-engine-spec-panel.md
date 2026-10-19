# Lovable prompt: engine spec panel on skill pages (skills.aajconsult.com, Oct 19, 2026)

Paste everything below the line into the aaj-skills-platform Lovable project.

---

Add an "Engine spec" panel to every skill page that has an engine.

**Data.** Run this migration first:

```sql
alter table public.skills add column if not exists spec jsonb;
```

The catalog sync fills `skills.spec` from the skills repo. It is null for skills without an engine; show no panel for those. Don't write to this column from the site.

The shape (all fields always present when `spec` is not null):

```ts
type EngineSpec = {
  id: string; slug: string; title: string; version: string; phase: string; category: string;
  decision: string;          // a question, e.g. "Can we afford to spend more on acquisition…?"
  inputs: string; outputs: string;
  engine: string;            // repo path of the engine file
  setup: { install: string; hosted_mcp: string; local_mcp: string; runtime: string;
           agents_listed: string[]; agents_tested: string[] };
  acts: { analyzes_only: boolean; network_calls: boolean; writes_files: boolean;
          starts_processes: boolean; reads_a_file_you_name: boolean; agent_writes: string | null };
  data_flow: { path: string; where: string }[];
  limitations: string[];
  review: string;
};
```

**Placement.** Put the panel directly below the install box, above the skill body, and server-render it with the rest of the page so crawlers see it. Heading: "Engine spec".

**Layout**, in this order:

1. **Decision it supports:** `decision`, in a slightly larger type.
2. **Inputs** and **Output**, side by side on desktop and stacked on mobile.
3. **Acts or analyzes:** if `acts.analyzes_only`, show a small neutral badge "Analyzes only" and the line "Makes no network calls, writes no files and changes nothing in your tools." If `acts.reads_a_file_you_name`, add "It can read an input file you name; it reads nothing else." If `acts.agent_writes`, add "The skill asks your agent to write {agent_writes} in your project." If `analyzes_only` is false, show the three booleans plainly instead.
4. **Where your information goes:** a two-row table from `data_flow` (columns "How you run it" and "Where your inputs go"), then the line "No engine needs customer names, emails or other personal data; leave them out."
5. **Limitations:** a bulleted list from `limitations`.
6. **Review before acting:** `review`, in a bordered callout.
7. **Setup:** the install command (copy button), the hosted MCP URL (copy button), and the line "Agents listed: {agents_listed joined}. Tested and recorded: {agents_tested joined, or 'not recorded yet'}." Link "Full spec on GitHub" to `https://github.com/sarojkjha/aaj-marketing-skills/blob/main/docs/engines/{slug}.md`.

**Style.** Use the site's existing card and type styles; no new colours. The badge is neutral, not green: "Analyzes only" is a fact, not a seal of approval. Don't add icons that suggest certification or security ratings.

**Don't** reword the spec text, add claims around it, or show the panel on skills where `spec` is null. Keep the page's existing structured data unchanged.

When done, check three pages: /skills/unit-economics (panel with four limitations), /skills/pipeline-and-forecast (shows the "reads an input file you name" line), and /skills/brand-product-context (no engine, so no panel).
