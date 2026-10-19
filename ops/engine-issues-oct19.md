# Engine issues found while writing the specs (Oct 19, 2026)

**Fixed in the Oct 19 engine-fix PR:** the five founder-math engines (ab-test-significance, lifecycle-and-retention, paid-media-budget-allocation, pipeline-and-forecast, pricing-and-packaging), the "95% CI" label, the one-tailed direction, the unsourced tier-count remark, and the four engines that printed nothing (now `{check, input}` plus a labelled demo and `--help`). Their limitations are updated in each `spec.json`. Everything else below is still open. **aajconsult.com vendors these engines for Ask AAJ, so re-run `scripts/ask-aaj/export-engines.mjs` there to pick the fixes up.**

Writing a spec for each of the 62 engines meant running each one, including on input it doesn't recognise (`'{"zzz":1}'`). These are the problems found. Each affected spec already states the problem as a limitation, so the specs are accurate today; fixing an engine means removing that limitation from its `spec.json` in the same PR.

"Verified" means re-run by hand after the drafting pass. The rest were reported by the drafting pass and are written into the specs, but not yet re-run independently.

## 1. Wrong input gives a confident answer instead of an error (highest priority)

The SKILL.md promise is "these engines fail loudly by design rather than returning a confident wrong answer". These don't.

| Engine | What happens | Status |
|---|---|---|
| founder-led-content | Prints nothing and exits 0 unless given `--demo`; `--help` prints nothing | Verified |
| ai-marketing-governance | Same: prints nothing and exits 0 unless given `--demo`; `--help` prints nothing | Verified |
| partnerships-and-co-marketing | Same | Verified |
| pr-and-earned-media | Same | Verified |
| win-loss-analysis | From the command line it always prints the demo, even for valid deals | Reported |
| agent-readiness-audit | Reads flags only; any JSON returns the "nothing passing" demo | Verified |
| signup-flow-optimizer | Reads flags only; JSON is ignored and the demo defaults are used | Reported |
| email-lifecycle-sequence | Ignores input and runs on defaults | Reported |
| incrementality-and-mmm | Ignores input and runs on defaults | Reported |
| paid-media-budget-allocation | Unknown input runs on placeholder channels (about $14.7M allocated with no budget given); a mistyped channel key adds a NaN row | Partly verified (placeholder run) |
| lifecycle-and-retention | No recognised field gives blanks and "$NaN"; a misnamed field counts as zero, e.g. `churnMRR` shows 100% GRR | Reported |
| marketing-report | Empty report; a miscased field such as `MQLs` is dropped silently | Reported |
| target-account-list | An `--input` file without `"accounts"` returns the demo accounts, labelled with your file name | Reported |
| pricing-and-packaging | A misnamed tier field reads as zero | Reported |
| website-conversion-audit, seo-geo-aeo-audit | A misspelled check scores as fail; `{"zzz":1}` gives 0/100, grade F | Reported |
| aaj-marketing-psychology | Any argument is read as copy, so JSON or `--fiel` returns PASS | Reported |
| pipeline-and-forecast | A stage name that doesn't match the probability map exactly (case-sensitive) counts as 0%, with only a warning | Reported |

**Fix pattern:** reject unknown top-level keys and required-but-missing fields with an error that names them, the way marketing-budget-planning already does; make no-argument runs print the demo with a "demo" label, and `--help` print the header.

## 2. Arithmetic or labels that mislead

| Engine | Problem | Status |
|---|---|---|
| ab-test-significance | At 90% confidence the interval is computed at 90% but labelled "95% CI" | Verified |
| ab-test-significance | One-tailed mode tests whichever direction the data moved | Reported |
| incrementality-and-mmm | Holdout cost counts all baseline conversions in the control group, not just the withheld lift, so it reads high; a 15% minimum lift is used silently when `--mde` is omitted; no MMM is computed despite the name | Reported |
| pricing-page-teardown | Unanswered checks drop out of the score, so 2 of 21 answered can score 100% | Reported |
| structured-data-for-ai-search | Says "Ready to publish" for a rating with no visible text supplied to compare | Reported |
| buying-committee-map | One champion alone reads 100% coverage | Reported |
| product-launch | Tasks are marked overdue even when the gate scores say they are done | Reported |
| partnerships-and-co-marketing | The review says "Do it again" with any qualified lead and any pipeline, however early | Reported |
| marketing-budget-planning | SKILL.md says runway caps the growth ambition; the engine doesn't. Series A ignores `runwayMonths` without a warning | Reported |
| webinar-and-event-programs | A misspelled `winRate` falls back to a more lenient pipeline-to-cost verdict, with only a note | Reported |
| signup-flow-optimizer | Only the yes/no blocking flags get a value; the demo reads "HEAVY" with $0 of fixes | Reported |
| aaj-copywriting | A two-word input scores 100 (labelled "indicative only") | Reported |

## 3. Engine does less than its SKILL.md says

- **win-loss-analysis:** no win reasons, no lost-at stage, no thin-sample flag; the "biggest fixable leak" can be "No decision".
- **pricing-and-packaging:** prints "most SaaS converts best with 3-4" tiers with no source. Source it or remove it.
- **market-sizing:** the "needs a name" error fires for any name under 3 characters.

## Order to fix

1. Section 1 for the five founder-math engines first (ab-test-significance, lifecycle-and-retention, paid-media-budget-allocation, pipeline-and-forecast, pricing-and-packaging) plus the ab-test label. These carry board numbers and are the likely flagship engines.
2. The four engines that print nothing (one shared fix).
3. The rest of section 1, then sections 2 and 3.

Each fix: change the engine, add a bad-input case to `platform/mcp-worker/test.mjs`, remove the limitation from `spec.json`, run `npm run mcp:build` and `node platform/scripts/generate-engine-specs.mjs`. **aajconsult.com vendors these engines for Ask AAJ** (`scripts/ask-aaj/export-engines.mjs --check` in its preflight), so the site picks up a fix only after re-exporting there. Check too whether the matching browser tool on aajconsult.com has the same bug.
