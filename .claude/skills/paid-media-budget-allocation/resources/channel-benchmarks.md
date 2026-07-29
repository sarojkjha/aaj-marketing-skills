# Channel benchmarks & default sets

Starting points only. A client's own account data always wins — these move 30–50% by vertical, offer, and creative. Sources: WordStream/LocaliQ 2025 Google benchmarks, LinkedIn 2025 benchmark reports (Closely, HockeyStack), Dreamdata/eMarketer (channel ROAS & share), Flyweel (CPL/CAC index). Figures reflect early-2026 conditions.

All channels use the **funnel** model — `CPC`, `click→lead %`, `lead→customer %` — except pay-per-lead directories (Capterra/G2), which take **cost-per-lead** directly plus a close rate (`model: "cpl"`). `cap` is "scale headroom": the monthly spend beyond which that channel saturates and marginal CAC climbs steeply.

## Channel roles

| Channel | Role | Notes |
|---|---|---|
| Google | Capture intent | Harvest in-market search demand; caps at search volume |
| Microsoft (Bing) | Capture intent | ~20–30% cheaper CPCs than Google; import the Google setup |
| LinkedIn | B2B targeting | Premium price, best lead quality for B2B; strong closed-won CAC |
| Meta | Reach & demand | Cheap reach/volume, lower intent, needs nurturing |
| TikTok | Reach & demand | Younger/consumer audiences; rising fast |
| YouTube | Awareness | Demos, brand, consideration; more top-funnel |
| Amazon | Bottom-funnel | Ecommerce purchase intent; closed-loop attribution |
| Capterra / G2 | High-intent leads | B2B software evaluation; pay per lead |
| Reddit / Quora | Community / research | Technical and research-mode audiences |
| Pinterest / Snapchat | Discovery / reach | DTC discovery, younger reach |

## Default sets & starting numbers

### B2B SaaS  — ACV $6,000 · margin 80% · LTV $15,000
Defaults: **Google, LinkedIn, Microsoft, Meta, YouTube** · add-ons: Capterra/G2, Reddit, Quora, X

| Channel | CPC | click→lead | lead→customer | cap | Base CAC |
|---|---|---|---|---|---|
| Google | $6.00 | 8% | 12% | $30,000 | $625 |
| LinkedIn | $11.00 | 11% | 20% | $15,000 | $500 |
| Microsoft | $4.50 | 8% | 12% | $12,000 | $469 |
| Meta | $2.50 | 5% | 9% | $45,000 | $556 |
| YouTube | $3.00 | 4% | 8% | $25,000 | $938 |
| Capterra/G2 | CPL $90 | — | 22% | $8,000 | $409 |
| Reddit | $1.80 | 4% | 8% | $10,000 | $563 |
| Quora | $2.20 | 5% | 10% | $6,000 | $440 |
| X | $1.50 | 3% | 6% | $12,000 | $833 |

### Ecommerce  — AOV $80 · margin 60% · LTV $160
Funnel = click → add-to-cart → purchase. Defaults: **Meta, Google, TikTok, Amazon, Microsoft** · add-ons: Pinterest, YouTube, Snapchat

| Channel | CPC | click→cart | cart→purchase | cap | Base CAC |
|---|---|---|---|---|---|
| Meta | $0.90 | 6% | 30% | $120,000 | $50 |
| Google | $1.00 | 8% | 35% | $60,000 | $36 |
| TikTok | $0.80 | 5% | 25% | $80,000 | $64 |
| Amazon | $0.90 | 12% | 40% | $50,000 | $19 |
| Microsoft | $0.70 | 7% | 32% | $30,000 | $31 |
| Pinterest | $0.60 | 4% | 20% | $40,000 | $75 |
| YouTube | $0.50 | 3% | 18% | $50,000 | $93 |
| Snapchat | $0.50 | 3.5% | 16% | $30,000 | $89 |

### Local / services  — ticket $800 · margin 50% · LTV $2,000
Defaults: **Google, Meta, Microsoft, YouTube, TikTok** · add-ons: Nextdoor, Yelp, LinkedIn

| Channel | CPC | click→lead | lead→customer | cap | Base CAC |
|---|---|---|---|---|---|
| Google | $4.00 | 10% | 25% | $20,000 | $160 |
| Meta | $1.50 | 7% | 15% | $25,000 | $143 |
| Microsoft | $3.00 | 9% | 24% | $12,000 | $139 |
| YouTube | $1.20 | 4% | 12% | $15,000 | $250 |
| TikTok | $1.00 | 5% | 12% | $18,000 | $167 |
| Nextdoor | $1.80 | 6% | 18% | $8,000 | $167 |
| Yelp | $5.00 | 12% | 22% | $10,000 | $189 |
| LinkedIn | $8.00 | 4% | 10% | $4,000 | $2,000 |

### Marketplace  — first-order $120 · margin 70% · LTV $360
Defaults: **Google, Meta, TikTok, Microsoft, YouTube** · add-ons: Reddit, Apple Search, Pinterest

| Channel | CPC | click→lead | lead→customer | cap | Base CAC |
|---|---|---|---|---|---|
| Google | $1.50 | 6% | 25% | $50,000 | $100 |
| Meta | $1.00 | 5% | 20% | $80,000 | $100 |
| TikTok | $0.80 | 4.5% | 18% | $80,000 | $99 |
| Microsoft | $1.10 | 6% | 23% | $30,000 | $80 |
| YouTube | $0.60 | 3.5% | 15% | $50,000 | $114 |
| Reddit | $0.90 | 4% | 14% | $20,000 | $161 |
| Apple Search | $2.00 | 50% | 8% | $25,000 | $50 |
| Pinterest | $0.70 | 4% | 16% | $40,000 | $109 |

## Engine config keys

`model`: `saas` | `ecom` | `local` | `market` — picks the default channels + numbers above.
`mode`: `budget` | `cac` | `goal`. `diminishingReturns`: `gentle` | `moderate` | `aggressive`.
`channels[]`: override a default or add a channel — funnel form `{key,cpc,cvr,l2c,cap}` or cpl form `{key,model:"cpl",cpl,l2c,cap}`.
Channel keys: `google microsoft linkedin meta youtube tiktok amazon capterra reddit quora x pinterest snapchat nextdoor yelp applesearch`.
