# Recipe: Stripe export into `unit-economics`

Stripe's export or MCP server supplies subscription and billing data: active subscriptions, recurring revenue, plan intervals, and cancellations. The `unit-economics` engine does the arithmetic: gross-margin LTV, CAC payback, and the LTV:CAC ratio, then evaluates them against named SaaS reference points (David Skok and Bessemer Venture Partners). The vendor brings the billing data and the engine brings the verdict, so the agent never estimates a number it could compute.

**You need:** a Stripe account you can export from (or connect to an AI client via the Stripe MCP server), your estimated gross margin percentage, your customer acquisition cost (or ad spend and customer counts), and the AAJ engines, either installed or as the hosted connector.

## 1. Connect Stripe (or export your data)

Either route works:

- **Via the Stripe MCP server:**
  - **Remote MCP connector:** Stripe provides a managed remote MCP server at `https://mcp.stripe.com` with OAuth sign-in. In Claude Desktop or Web: Settings → Connectors → Stripe → Connect.
  - **Local MCP server:** Add `@stripe/mcp` using your restricted read-only API key (`rk_live_...` with read permissions on Subscriptions, Customers, Invoices):
    ```
    claude mcp add stripe -- npx -y @stripe/mcp --tools=all --api-key=YOUR_RESTRICTED_KEY
    ```
    Or install the official Claude Code plugin: `claude plugin install stripe@claude-plugins-official`.
  - The server can perform writes if granted full access; this recipe only reads (`subscriptions.list`, `invoices.list`, `customers.list`).
- **Via Stripe Dashboard export (CSV):**
  - In Stripe Dashboard, navigate to **Billing → Subscriptions** (or **Customers**).
  - Click **Export** to download your subscriptions CSV (including status, amount, currency, interval, and canceled date).
  - You can also read your Monthly Recurring Revenue (MRR) and Churn rate directly from **Billing → Analytics** (or Stripe Sigma).

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://aaj-engines-mcp.sarojkjha10.workers.dev/mcp` as a custom connector. The engine is `unit-economics`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill unit-economics`.

## 3. Give your agent this prompt

```
Use Stripe and the AAJ unit-economics engine to calculate and evaluate our unit economics.

1. Connect to Stripe (via the Stripe MCP server or the uploaded subscriptions CSV export).
2. Filter for active subscriptions (status = "active").
   - Calculate Monthly Recurring Revenue (MRR): sum each subscription's normalized monthly amount.
     For monthly plans (plan.interval = "month"): amount × quantity ÷ 100.
     For annual plans (plan.interval = "year"): (amount × quantity) ÷ 1200.
   - Count the total active customers.
   - Compute arpaMonthly = total MRR ÷ active customers.
3. Calculate monthly churn rate (churnMonthly):
   - Over the last completed calendar month, find subscriptions canceled (status = "canceled" or
     with canceled_at in that month).
   - Divide canceled subscriptions by active subscriptions at the start of that month, and multiply
     by 100 to get the percentage (e.g., 2.5 for 2.5%). If churn is under 0.1%, report lifetimeMonths
     (100 ÷ churn%) instead.
4. Acquisition cost and margin:
   - Gross margin: [your gross margin %, e.g., 80] (Stripe does not know your COGS or hosting).
   - CAC: [your CAC in $, or your total ad spend and new customers for the period].
   - Segment: [smb | midmarket | enterprise] (optional, for Bessemer's payback benchmark).
5. Call run_engine with engine "unit-economics" and input:
   { "model": "subscription", "arpaMonthly", "grossMargin", "churnMonthly", "cac", "segment" }.
6. Report the engine's LTV, CAC payback, LTV:CAC ratio, and verdict as printed. Do not recompute or round them.
```

## 4. How Stripe's data maps to the engine

| Engine input | From Stripe or from you | Note |
|---|---|---|
| `model` | `"subscription"` | Default model for recurring billing |
| `arpaMonthly` | Total MRR ÷ active customer count | Normalize annual subscriptions (`plan.interval === 'year'`) to monthly by dividing by 12. Use amounts in dollars/major units, not Stripe cents |
| `grossMargin` | You (percentage, e.g. `80`) | Stripe does not track COGS (cloud hosting, customer support, third-party APIs) or processing fees (2.9% + 30¢). Must be a percentage between 1 and 100, not a decimal proportion |
| `churnMonthly` | Canceled subscriptions ÷ starting active subscriptions | Monthly logo churn as a percentage (e.g. `2.5` for 2.5%, not `0.025`). Values under 0.1 are rejected as proportions |
| `lifetimeMonths` | Alternative to `churnMonthly` | Average customer lifetime in months (`100 ÷ churnMonthly`). Use this if monthly churn is below 0.1% |
| `cac` | You (in dollars) | Stripe does not track marketing or ad spend. Pass `cac`, or pass `adSpend` and `customers` to derive blended CAC |
| `segment` | You: `smb`, `midmarket`, or `enterprise` | Optional. Compares payback against Bessemer's 12 / 18 / 24-month benchmarks instead of David Skok's 12-month default |
| `paybackTargetMonths` | You (in months) | Optional. Overrides the benchmark with your own cash-runway threshold |

An example input for a B2B SaaS product:

```json
{
  "model": "subscription",
  "arpaMonthly": 120,
  "grossMargin": 80,
  "churnMonthly": 2.5,
  "cac": 600,
  "segment": "smb"
}
```

Run it locally from your clone:

```bash
node skills/unit-economics/resources/unit-economics.js '{"model":"subscription","arpaMonthly":120,"grossMargin":80,"churnMonthly":2.5,"cac":600,"segment":"smb"}'
```

The engine prints the gross-margin LTV, CAC payback, LTV:CAC ratio, and a verdict against the Skok and Bessemer reference points.

## 5. Before you trust it

- **Annual plans distort naive averages.** An annual subscription charged as $1,200 looks like $1,200 in invoice or charge logs, but represents $100/mo of MRR. Always normalize by `plan.interval` (`amount / 12` for yearly plans) before computing ARPA. Dividing raw charge volume by customer count will severely inflate ARPA and LTV.
- **Refunds, chargebacks, and failed payments.** Stripe's gross subscription amounts don't deduct refunds, disputes, or past-due subscriptions. A customer in `status: "past_due"` or `"unpaid"` has not paid; check whether your query includes delinquent accounts. High refund or dispute rates mean real ARPA and retention are lower than subscription list prices show.
- **Churn definition: logo churn vs. net revenue churn.** The standard subscription engine formula (`LTV = (ARPA × margin%) ÷ churn%`) models customer (logo) churn with constant ARPA. If you have strong account expansion (upsells and seat additions yielding net negative revenue churn), logo churn understates LTV. If contraction or discounting is rampant, logo churn overstates it.
- **Account for payment processing fees in gross margin.** Stripe charges 2.9% + 30¢ per transaction (plus fees for Billing, Radar, or international cards). Combined with cloud infrastructure and customer support, software gross margin is typically 70% to 85%, not 100%. Never assume 100% margin.
- **Blended vs. paid CAC.** If you derive CAC using Stripe's newly acquired customer count and your ad spend, that yields a blended CAC (diluted by organic traffic, viral signups, and word of mouth). For paid channel scaling decisions, calculate paid CAC using only paid conversions.

## Sources

Checked on October 19, 2026.

- Stripe: [Stripe Agent Toolkit & Model Context Protocol](https://github.com/stripe/agent-toolkit/tree/main/modelcontextprotocol), [Stripe API reference: Subscriptions](https://docs.stripe.com/api/subscriptions), [Stripe Billing Analytics](https://docs.stripe.com/billing/subscriptions/overview)
- David Skok: [SaaS Metrics 2.0 – A Guide to Measuring and Improving what Matters](https://www.forentrepreneurs.com/saas-metrics-2/) (LTV:CAC > 3:1, payback < 12 months)
- Bessemer Venture Partners: [Scaling to $100 Million](https://www.bvp.com/atlas/scaling-to-100-million) (2021) (payback guidelines by customer tier: SMB < 12 mo, mid-market < 18 mo, enterprise < 24 mo)
