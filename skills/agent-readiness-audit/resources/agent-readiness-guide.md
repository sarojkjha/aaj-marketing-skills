# Agent readiness guide

Reference for the `agent-readiness-audit` skill.

---

## 1. GEO vs agent readiness — the distinction that matters

| | **GEO / AEO** | **Agent readiness** |
|---|---|---|
| The question | Will an AI engine cite my content in an answer? | Can an agent evaluate and transact with me? |
| Who's asking | A person, via an AI interface | An agent, acting for a person |
| Success looks like | Being quoted with attribution | Being included in a shortlist and actioned |
| Key levers | Answer-first structure, citations, statistics | Rendering, published facts, action surface |
| Failure mode | Someone else gets cited | You're absent from a comparison you never saw |

They overlap on rendering and structured data, and diverge sharply after that. A thought-leadership blog can be excellent at GEO and score near zero here. A company with published pricing, a public API, and boring prose can be the reverse.

**Both are worth having. Don't fix one thinking you've fixed the other.**

---

## 2. The checks, in detail

### Machine-readable content (30 pts)

**Content renders without JavaScript — 14 pts.** The hard gate. An agent that doesn't execute JS receives whatever is in the raw HTML. If that's `<div id="root"></div>`, you have no content as far as it's concerned.

*Verify:* `view-source:yoursite.com` (or `curl -s https://yoursite.com | grep "some sentence"`). **Not** DevTools — that shows the post-JavaScript DOM and will tell you everything is fine.

*Fix:* server-render, prerender, or serve a static content layer to non-JS clients. This is exactly what a prerendering edge worker does, and it's the highest-return fix on this list.

**Structured data — 8 pts.** Product, Service, Offer, Organization, FAQPage as applicable. It removes inference: the agent reads what the page *is* rather than guessing from prose.

**llms.txt — 5 pts.** A curated entry point: key pages, what each covers, canonical facts. Cheap to publish, and it makes you legible to crawlers rather than leaving them to work it out.

**Clean heading hierarchy — 3 pts.** One H1, meaningful H2s, no skipped levels for visual effect. Passage extraction degrades when structure is styling rather than markup.

### Evaluable facts (25 pts)

**Published pricing — 12 pts.** The heaviest single check after rendering, and the one most often failed by choice.

An agent asked to compare five vendors returns the four with published prices and a note that the fifth requires contact. In practice that's exclusion. If enterprise pricing genuinely can't be published, publish *something* — a starting price, a range, a per-seat figure, the shape of the model. A range beats silence.

**Specs and features structured — 7 pts.** Tables and lists with consistent labels. Say what it does, not how transformative it is. Marketing prose is close to unusable for requirement-matching.

**Comparison facts — 6 pts.** Agents build comparisons whether or not you participate. Without your facts, they use a competitor's framing of you — including the limitations that competitor chooses to highlight. Publishing honest comparison pages, integration lists, and explicit limits means the framing is at least partly yours.

### Action surface (20 pts)

**Self-serve path — 8 pts.** At least one route that completes without a human: trial, purchase, or booking. If every path ends at "talk to sales", an agent can't progress the purchase.

**Public API or documented integration — 6 pts.** The programmatic surface. Increasingly this means an MCP server or a documented endpoint an agent can call.

**No CAPTCHA on key actions — 6 pts.** CAPTCHA blocks legitimate agents alongside bots. Risk-based or invisible challenges, and at minimum one unblocked path.

### Identity & trust (15 pts)

**Organization schema, consistent identity — 6 pts.** Agents resolve entities. Inconsistent legal names, URLs, or contact details split your identity across sources.

**Claims sourced — 5 pts.** Attributed statistics survive scrutiny; unattributed superlatives get discounted or contradicted by a source the agent trusts more.

**Facts consistent across surfaces — 4 pts.** One number for one fact, everywhere. Contradictions force the agent to pick, and it may not pick yours.

### Agent access policy (10 pts)

**AI crawlers permitted — 6 pts.** Decide per crawler, not by blanket rule. See below.

**No blanket edge blocking — 4 pts.** WAF rules and aggressive rate limits routinely catch legitimate retrieval agents. Allowlist known agents; rate-limit rather than block.

---

## 3. The crawler decision

Not all AI crawlers do the same job, and the honest answer differs by type:

| Type | What it does | Reasonable stance |
|---|---|---|
| **Training crawlers** | Collect content for model training | Blocking is a defensible position |
| **Retrieval crawlers** | Fetch pages to answer a live query | Blocking removes you from AI answers |
| **Agent browsers** | Act on a user's behalf, in the moment | Blocking blocks your own prospect |

The common failure is a blanket `Disallow` that treats all three the same, usually copied from a template. That's not a privacy stance — it's an accident with a commercial cost.

Decide deliberately, document why, and revisit it. If you block training crawlers, say so publicly; it's a legitimate position and some buyers respect it.

---

## 4. Worked example

A B2B SaaS company scores **73 — PARTIAL**:

> Paths assume you installed with `npx skills add`. From a clone of this repo, use `skills/agent-readiness-audit/resources/…` instead.

```bash
node .agents/skills/agent-readiness-audit/resources/agent-readiness.js \
  --ssr --schema --llms-txt --clean-headings \
  --pricing-public --self-serve --no-captcha \
  --org-schema --claims-sourced --allows-ai-crawlers
```

Passing: content renders, schema present, llms.txt published, pricing public, a self-serve trial exists, crawlers allowed.

The top gaps:

| Gap | Cost | Why |
|---|---|---|
| Specs not structured | −7 | Capabilities are in prose, so requirement-matching fails |
| No comparison facts | −6 | Competitors frame the comparison |
| No public API | −6 | Nothing an agent can call |
| Facts inconsistent | −4 | Two different customer counts on two pages |

Note the shape: the expensive fixes were already done. What remains is unglamorous — publish a spec table, write honest comparison pages, reconcile two numbers. That's typical. Most of the remaining value at this stage is in tidying rather than building.

**Contrast:** the same company before prerendering scored 86 on points and still returned **BLOCKED**, because content didn't render without JavaScript. Everything else was invisible until that was fixed.

---

## 5. Fix order

1. **Rendering** — nothing else counts until this passes
2. **Published pricing** — the difference between being compared and being skipped
3. **Crawler access** — cheap, and often an accident to begin with
4. **Structured data + llms.txt** — makes existing content legible
5. **Self-serve path** — the largest build, and the one with the clearest commercial upside
6. **Comparison facts and spec tables** — writing, not engineering
7. **Consistency pass** — one number per fact, everywhere

---

## 6. Re-audit triggers

This degrades silently. Re-run after:

- Any frontend framework or rendering change
- A CDN, WAF, or bot-protection change
- A pricing page redesign
- Adding a CAPTCHA anywhere
- A robots.txt edit
- Quarterly, regardless

The reason it needs a schedule: there's no symptom. Nothing errors, nothing bounces. You just stop appearing in shortlists, and the first signal is a pipeline number that's quietly lower than it was.
