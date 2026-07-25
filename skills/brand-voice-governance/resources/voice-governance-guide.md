# Brand Voice Governance — Reference Guide

Companion to the `brand-voice-governance` skill. Covers what the engine checks, how the voice profile is structured, the severity model, and how to use the audit trail.

## Contents

1. [What this checks, and what it doesn't](#1-what-this-checks-and-what-it-doesnt)
2. [The voice profile](#2-the-voice-profile)
3. [The severity model](#3-the-severity-model)
4. [Input schema](#4-input-schema)
5. [Reading the output](#5-reading-the-output)
6. [The audit trail](#6-the-audit-trail)
7. [House defaults](#7-house-defaults)
8. [Worked example](#8-worked-example)

---

## 1. What this checks, and what it doesn't

**Checks — mechanical conformance to stated rules:**

- **Banned words** — whole-word, case-insensitive matches against the brand's avoid-list.
- **Hedges** — weakening words (`very`, `really`, `just`, `basically`, `actually`, and similar) that dilute a claim.
- **Reading grade** — Flesch–Kincaid grade level per block against a ceiling.
- **Sentence length** — a proxy the grade formula can miss on short blocks.

**Does not check — anything requiring judgment:**

- Whether the copy is persuasive, clear, or well-argued → `copywriting`.
- Whether a claim is true or defensible → `copywriting`.
- Whether the *voice rules themselves* are right → `brand-product-context`.
- Tone conveyed by paraphrase rather than banned words → a human read.

This is deliberately a floor. It catches the mechanical drift that slips through at volume — the AI-written paragraph that reaches for "leverage" and "seamless" because that's the generic professional register. It does not replace a human on the pages that matter.

## 2. The voice profile

A profile is a checkable ruleset. It can be supplied inline or parsed from a brand-context brief.

```json
{
  "avoid":    ["synergy", "leverage", "robust", "seamless", "best-in-class"],
  "prefer":   ["plain", "concrete", "specific"],
  "maxGrade": 9
}
```

**Parsed from a brief.** Profile mode reads the `## Voice & tone` section of `.agents/product-marketing.md` and extracts:

- `Words to avoid:` / `Avoid:` / `Don't:` → the avoid-list
- `Words to use:` / `Prefer:` / `Do:` → the prefer-list
- `Grade ceiling: N` / `grade level N` → the reading-grade ceiling

The parse is deterministic — no inference — so the ruleset itself is auditable. What the engine flags can always be traced back to a line the brand wrote.

**If the avoid-list comes back empty**, the brief has no words-to-avoid line. That's the finding: the fix is to add one in `brand-product-context`, not to work around it here. A brand with no stated banned words has nothing brand-specific to govern, and the check will fall back to house defaults.

## 3. The severity model

The single most important design decision in this skill is which findings can fail content.

| Severity | Symbol | Fails the check? | What it is |
|---|---|---|---|
| **Blocking** | ✗ | Yes | A rule the brand wrote for itself: a banned word, copy over the grade ceiling |
| **Advisory** | · | No | A hedge, a long sentence, a block above target reading level |

**Only rules the brand set for itself are blocking.** A banned word is blocking because the brand's own brief bans it — that's not the tool's opinion. A hedge is advisory because "avoid hedges" is generally good writing advice, not a rule this specific brand ratified.

The reason this line matters: the moment the tool fails content on taste, editors learn to ignore its verdict, and an ignored guardrail governs nothing. Keeping the blocking tier strictly to brand-ratified rules is what lets a team trust a `REVISE` verdict enough to act on it.

Block verdicts:
- **REVISE** — at least one blocking finding.
- **WARN** — advisory findings only.
- **PASS** — clean.

Document verdict:
- **REVISE** — any block needs revision.
- **PASS WITH NOTES** — only advisory findings anywhere.
- **PASS** — fully clean.

## 4. Input schema

### profile

```json
{
  "brand": "Northwind Analytics",
  "brief": "...markdown containing a '## Voice & tone' section...",
  "maxGrade": 9
}
```

### check

```json
{
  "brand": "Northwind Analytics",
  "content": "the text to check, in markdown or plain paragraphs",
  "profile": { "avoid": ["synergy","leverage"], "prefer": ["plain"], "maxGrade": 9 },
  "brief": "...alternative to profile — re-parsed here...",
  "maxGrade": 9,
  "checkHedges": true,
  "useHouseDefaults": true
}
```

Supply **either** `profile` (a ready ruleset) **or** `brief` (parsed on the fly). If both are absent and `useHouseDefaults` isn't `false`, the check runs against AAJ house defaults and says so.

## 5. Reading the output

**Verdict and conformance** lead. Conformance is the share of blocks with no findings at all — a strict measure, since a single advisory note drops a block out of "clean."

**Banned terms roll-up** shows which specific words are causing the most failures. One word appearing eight times is a find-and-replace; eight different words once each is a deeper voice-drift problem.

**By block** is where the work happens. Each block shows its verdict, an excerpt, and every finding quoted beneath it with its severity symbol. An editor works top to bottom fixing the ✗ lines.

**Profile line** states whether the run used the brand's real rules or house defaults. Never let a house-default pass be reported as brand conformance.

## 6. The audit trail

Every finding is quoted with its block number. That's the governance record: for AI-generated content, or any brand that needs to show what was reviewed and why, the list of findings *is* the log.

This matters beyond tidiness. 2026 state privacy laws increasingly require a transparency trail for AI-assisted decisions about content and customers. A conformance check that can produce, on demand, "these 10 items were flagged in this content, here is each one and the rule it touched" is the difference between a defensible process and an assertion that someone looked.

Keep the output when the content was AI-assisted or the brand is in a regulated space. Discard it freely for internal drafts.

## 7. House defaults

When no brand avoid-list is available, the check uses a small default set — the generic marketing jargon most brands ban anyway: `synergy`, `leverage`, `robust`, `seamless`, `cutting-edge`, `best-in-class`, `world-class`, `revolutionary`, `game-changing`, `unleash`, `supercharge`.

These catch the worst of AI-generated register drift, but they are **not a brand profile**. A pass against house defaults means only "no generic jargon" — not "sounds like this brand." The output flags every house-default run so the distinction is never lost. Treat a house-default pass as a prompt to go capture the real rules in `brand-product-context`.

Opt out entirely with `"useHouseDefaults": false` — useful when you want to check *only* hedges and reading level without any banned-word list.

## 8. Worked example

`node voice-check.js --demo` runs both modes on a fictional B2B analytics brand.

Profile mode parses Northwind's Voice & tone section into an avoid-list of five words and a grade-9 ceiling. Check mode then runs four blocks of content against it:

- **Block 1** — "robust, best-in-class analytics platform" → REVISE, two banned words in one sentence.
- **Block 2** — a 34-word sentence packing `leverage`, `seamless`, and `synergy` → REVISE on three banned words, plus advisory notes for reading at grade 19 against a grade-9 ceiling and for the sentence length.
- **Block 3** — "Set up in an afternoon. No SQL, no data hire." → PASS. Short, concrete, on-brand.
- **Block 4** — "basically just the easiest way to actually see..." → WARN. No banned words, but four hedges dilute the claim.

The result — 25% conformance, REVISE — is the honest read: three of four blocks drift toward exactly the generic register the brand banned, and the one clean block shows what on-brand looks like. That contrast is the point. The check doesn't just fail the content; it shows, block by block, what conforming copy looks like right next to what doesn't.
