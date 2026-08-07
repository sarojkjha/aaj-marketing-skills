// src/data/paths.ts
//
// Single source of truth for /paths. Everything on the page — the path count,
// the per-path skill and engine counts, the install command, and the JSON-LD —
// derives from this array. Do not type any of those numbers into copy.
//
// Adjust the import below to wherever the catalog already lives.
import { skills } from "@/data/skills";

export const REPO = "sarojkjha/aaj-marketing-skills";

export type Phase = "Diagnose" | "Design" | "Execute";

export interface PathStep {
  slug: string;
  phase: Phase;
}

export interface LearningPath {
  slug: string;
  title: string;
  /** One line, second person, names the situation not the mechanism. */
  promise: string;
  /** The question a user would actually type at their agent afterwards. */
  examplePrompt: string;
  steps: PathStep[];
}

export const paths: LearningPath[] = [
  {
    slug: "fix-a-funnel",
    title: "Fix a funnel",
    promise:
      "Find where people are dropping, price the leak, and fix the step that costs you most.",
    examplePrompt:
      "Signups are flat and trial-to-paid is 4%. Where is our funnel actually losing people?",
    steps: [
      { slug: "website-conversion-audit", phase: "Diagnose" },
      { slug: "unit-economics", phase: "Diagnose" },
      { slug: "pipeline-and-forecast", phase: "Diagnose" },
      { slug: "signup-flow-optimizer", phase: "Design" },
      { slug: "onboarding-activation", phase: "Design" },
      { slug: "lifecycle-and-retention", phase: "Design" },
      { slug: "email-lifecycle-sequence", phase: "Execute" },
      { slug: "ab-test-significance", phase: "Execute" },
    ],
  },
  {
    slug: "launch-a-product",
    title: "Launch a product",
    promise:
      "Take something new to market with the positioning, the budget, and the measurement decided before launch day.",
    examplePrompt:
      "Help us launch our analytics product to PLG SaaS teams in Q3.",
    steps: [
      { slug: "customer-survey-design", phase: "Diagnose" },
      { slug: "unit-economics", phase: "Diagnose" },
      { slug: "persona-builder", phase: "Design" },
      { slug: "positioning-statement", phase: "Design" },
      { slug: "marketing-budget-planning", phase: "Design" },
      { slug: "landing-page-brief", phase: "Execute" },
      { slug: "content-calendar-planning", phase: "Execute" },
      { slug: "ab-test-significance", phase: "Execute" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived values. Nothing below should ever be hand-edited.
// ---------------------------------------------------------------------------

const bySlug = new Map(skills.map((s) => [s.slug, s]));

/** Throws at build time if a path names a skill that is not in the catalog. */
export function assertPathsResolve(): void {
  const missing: string[] = [];
  for (const p of paths) {
    for (const step of p.steps) {
      if (!bySlug.has(step.slug)) missing.push(`${p.slug} -> ${step.slug}`);
    }
  }
  if (missing.length) {
    throw new Error(`paths.ts references unknown skills:\n  ${missing.join("\n  ")}`);
  }
}

export function skillCount(path: LearningPath): number {
  return path.steps.length;
}

/** Counts skills in the path that ship a runnable engine. */
export function engineCount(path: LearningPath): number {
  return path.steps.filter((s) => bySlug.get(s.slug)?.hasEngine).length;
}

export function stepsByPhase(path: LearningPath): Record<Phase, PathStep[]> {
  return {
    Diagnose: path.steps.filter((s) => s.phase === "Diagnose"),
    Design: path.steps.filter((s) => s.phase === "Design"),
    Execute: path.steps.filter((s) => s.phase === "Execute"),
  };
}

/**
 * The install command, exactly as the user must paste it.
 *
 * MUST render as one unbroken line. No backslash continuations: they fall
 * through to the interactive picker in PowerShell. `--path` does not exist;
 * a path is a curated list of --skill flags, nothing more.
 *
 * Order is the phase order for readability only — the installer alphabetises.
 */
export function installCommand(path: LearningPath): string {
  const flags = path.steps.map((s) => `--skill ${s.slug}`).join(" ");
  return `npx skills add ${REPO} ${flags} --yes`;
}

export const pathCount = paths.length;

/** JSON-LD for the /paths index. Never emit an empty itemListElement. */
export function pathsJsonLd(origin = "https://skills.aajconsult.com") {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Learning paths",
    description:
      "Curated sequences of AAJ marketing skills, installed in one command and run by your AI agent.",
    url: `${origin}/paths`,
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: paths.length,
      itemListElement: paths.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.title,
        description: p.promise,
        url: `${origin}/paths/${p.slug}`,
      })),
    },
  };
}
