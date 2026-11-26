# Output format

Present the allocation in this shape. Keep it tight and decision-ready — the user should be able to take it into a budget meeting and defend it.

---

**Paid media allocation — [Business model] · [$budget/mo or "to hit $X CAC" or "for N customers/mo"]**

**The split**

| Channel | Monthly | % | Per day | Customers | CAC |
|---|---|---|---|---|---|
| [Channel] | $X | XX% | $X | X.X | $X |
| … | | | | | |
| **Blended** | **$X** | **100%** | **$X** | **X.X** | **$X** |

**Health:** LTV:CAC **X.X:1** · ROAS **X.X×** · CAC payback **X.X mo** *(paid-media CAC — fully-loaded is higher)*

**Pacing:** the engine's line: $X a week and $X a day in total (month ÷ 30.4). [Per-channel daily figures are in the table; weekly ones are in the JSON.]

**Range:** the engine's lines: what the plan gives if every channel's cost per customer runs 20% lower or higher than entered. Say it is a what-if on the inputs, not a forecast.

**What this means**
- [Which channel carries the plan and why — best efficiency × headroom.]
- [Any channel funded at $0 and why (base CAC above target at this budget); how to bring it in.]
- [Guardrail flags: channels under the ~$1,500/mo learning floor → consolidate; channels scaling into steep marginal CAC.]
- [The bigger lever: improving a channel's conversion/close rate lowers its base CAC and shifts the whole split toward it.]

**Next step:** validate against the client's own account data, then revisit monthly as marginal CAC drifts.

---

Guidance:
- Round money to whole dollars and customers to one decimal.
- Copy the pacing and range figures from the engine's output. Don't recompute them.
- If any channel came from past results, keep the engine's "From results" lines so the reader sees what it was fitted to and the base CAC it worked out. Pass on any warning that results sit above a channel's scale cap.
- Always label the CAC as paid-media CAC at least once.
- If the objective was a CAC target that's infeasible (below every channel's base CAC), say so plainly and recommend raising the target or improving the funnels — don't present a $0 plan as if it were valid.
- If the user has real account data, use it. If any channel still runs on the engine's defaults, say so plainly: those are AAJ placeholders, not benchmarks.
- Offer the AAJ tool for live what-if exploration and the playbook for the full method.
