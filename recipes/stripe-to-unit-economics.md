# Recipe: Stripe data into `unit-economics`

Stripe holds the subscription side of unit economics: MRR, active subscribers and subscriber churn, each with Stripe's own definition. The `unit-economics` engine does the arithmetic: ARPA, gross-margin LTV, CAC payback and the LTV:CAC ratio, then checks them against two named reference points (David Skok and Bessemer Venture Partners). Stripe brings the billing figures and the engine brings the verdict, so the agent never estimates a number it could compute.

**You need:** a Stripe account with Billing, your gross margin, your customer acquisition cost (or spend and new customers for the same period), and the AAJ engines, installed or as the hosted connector.

## Where each number comes from

Stripe's MCP server can return MRR, but it has no metric for active subscribers or subscriber churn. An agent that counted subscriptions and worked out churn itself would be doing the arithmetic this recipe exists to avoid. So the recipe takes those two from Stripe, where Stripe has already computed them:

| Figure | Where Stripe computes it |
|---|---|
| MRR | The `revenue.mrr` metric, through the MCP server's analytics tool. The Metrics API behind it is in preview: request access on Stripe's Metrics API page. Without it, read MRR from the Billing overview |
| Active subscribers | The Billing overview |
| Subscriber churn rate | The Billing overview |

**No agent at all?** In the Billing overview, open **Report downloads** and download **MRR per subscriber per month**. Drop it on the [Unit Economics Calculator](https://aajconsult.com/tools/unit-economics-calculator), which works out ARPA, churn and expansion with Stripe's definitions, in your browser, and runs the same engine.

## 1. Connect Stripe

Stripe's remote MCP server is at `https://mcp.stripe.com`. Sign in with OAuth and grant read access only.

- **Claude (web and desktop):** add the official Stripe connector from Claude's connector directory, then sign in to Stripe. On Team and Enterprise plans, an owner adds it to the workspace first.
- **Claude Code:** `claude mcp add --transport http stripe https://mcp.stripe.com/`, then run `/mcp` to sign in.
- **ChatGPT:** add the official Stripe plugin and sign in.
- **Other clients:** use `https://mcp.stripe.com` as the server URL, with OAuth if the client supports it. Otherwise use an agent API key as the bearer token.

From December 2026, the server no longer accepts full-access secret keys or restricted keys without the Agent tag. Use OAuth or an agent API key.

For analytics, Stripe asks for these read permissions: **Data > Metrics**, **Data > Queries** and **Data > Reports**. They let the agent read figures without changing anything. The server also has write tools; this recipe only reads, so turn on your client's tool approval and decline any write.

## 2. Add the AAJ engines

Either one works:

- **Hosted, no install:** add `https://mcp.aajconsult.com/mcp` as a custom connector. The engine is `unit-economics`.
- **In a coding agent:** `npx skills add sarojkjha/aaj-marketing-skills --skill unit-economics`.

## 3. Give your agent this prompt

```
Use Stripe and the AAJ unit-economics engine to check my unit economics for
[last complete month]. Read only; change nothing in Stripe.

1. With the Stripe MCP server's analytics tool, get revenue.mrr for that month
   (granularity month, currency [usd]). Stripe returns it in the currency's minor
   unit: divide by 100 for a two-decimal currency such as USD; use it as is for a
   zero-decimal currency such as JPY. If the analytics tool is not available,
   ask me for MRR from the Billing overview instead.
2. Ask me for Active subscribers and Subscriber churn rate from Stripe's Billing
   overview for the same month. Do not count or compute them from subscription
   lists.
3. Ask me for my gross margin (a percentage), my CAC (or spend and new customers
   for the same month), and my segment: smb, midmarket or enterprise.
4. Call run_engine with engine "unit-economics" and input
   { "model": "subscription", "mrr", "activeCustomers", "churnMonthly",
     "grossMargin", "cac", "segment" }.
5. Report the engine's numbers as printed. Do not recompute or round them.
```

## 4. How Stripe's figures map to the engine

| Engine input | From Stripe or from you | Note |
|---|---|---|
| `model` | `"subscription"` | |
| `mrr` | `revenue.mrr`, or MRR on the Billing overview | In major units (dollars, not cents). Stripe's MRR counts `active` and `past_due` subscriptions and leaves out taxes, free plans and metered products. Your Billing settings decide whether discounts are subtracted |
| `activeCustomers` | Active subscribers on the Billing overview | Subscribers with MRR above zero in `active` or `past_due` status; a customer with several subscriptions counts once. The engine works out ARPA as `mrr` ÷ `activeCustomers`, the same as Stripe's ARPU |
| `churnMonthly` | Subscriber churn rate on the Billing overview | A percentage: `2.5` for 2.5%, not `0.025`. Stripe's rate is churned subscribers in the past 30 days ÷ (active subscribers 30 days ago + new subscribers in the past 30 days). The engine rejects values under 0.1 as likely proportions; for churn that low, pass `lifetimeMonths` instead |
| `grossMargin` | You | A percentage from 1 to 100. Stripe does not know your hosting, support or payment processing costs, so this is your figure. Stripe's own fees are on [stripe.com/pricing](https://stripe.com/pricing) |
| `cac` | You | Stripe has no marketing spend. Pass `cac`, or `adSpend` and `customers` and the engine works out blended CAC |
| `segment` | You: `smb`, `midmarket` or `enterprise` | Optional. Sets the payback bar to Bessemer's 12, 18 or 24 months. Without it the engine uses David Skok's 12 months |
| `paybackTargetMonths` | You | Optional. Your own payback bar, in place of the reference point |

The input the engine receives looks like this (Example Co. is fictional):

```json
{
  "model": "subscription",
  "mrr": 60000,
  "activeCustomers": 500,
  "churnMonthly": 2.5,
  "grossMargin": 80,
  "cac": 600,
  "segment": "smb"
}
```

For that input the engine reports ARPA of $120 a month, gross-margin LTV of $3,840, LTV:CAC of 6.4:1 and CAC payback of 6.3 months.

## 5. Before you trust it

- **Your margin and CAC carry the verdict.** They are the two inputs Stripe cannot check. A margin that leaves out hosting, support or payment fees overstates LTV.
- **Logo churn, not revenue churn.** The engine assumes every customer stays at today's ARPA until they churn. If customers expand a lot, it understates LTV; if they shrink or get discounted, it overstates it. Stripe's MRR growth chart shows expansion and contraction, and the calculator's Stripe import reads expansion from the report.
- **Past-due counts as active.** Stripe includes `past_due` subscriptions in MRR and active subscribers until they are canceled or marked `unpaid`. If many are past due, ARPA and churn look better than what you collect.
- **One month is noisy.** For a small subscriber base, one month's churn swings a lot. The calculator's Stripe import pools several months; for the agent route, ask for the churn rate over a longer window and say so.
- **Blended or paid CAC.** CAC from all new customers is blended, lowered by organic signups. For a decision about one paid channel, use paid CAC.
- **The reference points are guidance, not targets for your business.** Skok's 3:1 and 12 months and Bessemer's 12, 18 and 24 months are where the engine draws its lines; it labels them as such.

## Sources

Checked on November 18, 2026.

- [Stripe MCP server](https://docs.stripe.com/mcp) (Stripe docs): server URL, OAuth and agent API keys, client setup, the change for secret and restricted keys from December 2026, and the tool list
- [Analyze your data with AI](https://docs.stripe.com/data/analyze-with-ai) (Stripe docs): the read permissions for analytics
- [Metrics API](https://docs.stripe.com/data/metrics) and [Supported metrics](https://docs.stripe.com/data/metrics/supported-metrics) (Stripe docs): `revenue.mrr`, minor units, preview access, and that there is no subscriber count or churn metric
- [Billing analytics](https://docs.stripe.com/billing/subscriptions/analytics) (Stripe docs): definitions of MRR, active subscribers, ARPU and subscriber churn rate, and the MRR per subscriber per month report
- [Supported currencies](https://docs.stripe.com/currencies) (Stripe docs): minor units and zero-decimal currencies
- David Skok, [SaaS Metrics 2.0](https://www.forentrepreneurs.com/saas-metrics-2/): "The best SaaS businesses have a LTV to CAC ratio that is higher than 3", and profitability is "anemic if the time to recover CAC extends beyond 12 months"
- Bessemer Venture Partners, [Scaling to $100 Million](https://www.bvp.com/assets/uploads/2021/09/Scaling-to-100-Million-by-Mary-DOnofrio_updated2024.pdf) (Mary D'Onofrio, 2021, updated 2024): target CAC payback under 12 months for SMB, 18 for mid-market and 24 for enterprise
- Engine spec: [unit-economics](../docs/engines/unit-economics.md)
