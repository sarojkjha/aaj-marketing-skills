# Friction patterns & flow structures

Reference for the `signup-flow-optimizer` skill.

---

## 1. The field audit

For every field, answer in order. Stop at the first "no".

1. **Does the account genuinely fail to work without this, right now?**
2. **If not, can it be collected after the first value moment?**
3. **If it must be now, can it be inferred instead of asked?** (domain from email, company from domain, location from IP, timezone from browser)
4. **If it must be asked, can it be optional?**

Most flows survive this audit with two fields: **email and password** — or email alone with a magic link.

### The usual suspects

| Field | Usual verdict |
|---|---|
| Email | Keep — it's the account |
| Password | Keep, or replace with magic link / SSO |
| Full name | Move later. Nothing breaks without it on day one |
| Company name | Infer from email domain, or ask in onboarding |
| Company size | Move later. This is a sales-qualification field wearing a signup costume |
| Job role | Move later, or infer from behaviour |
| Phone number | Remove unless you genuinely call. It's the single most abandonment-prone field |
| Use case / "how did you hear" | Move to onboarding, where the answer helps the user |
| Credit card | See below — a positioning decision |

**Phone number deserves its own note.** It signals a sales call is coming, which changes what the visitor thinks they're signing up for. If sales genuinely needs it, ask after the account exists and the product has shown value.

---

## 2. Blocking conditions

These cost more than field count, and they're decisions rather than oversights.

| Condition | The cost | The alternative |
|---|---|---|
| **Card before value** | Filters hard for intent; sharply reduces trial starts | Card-free trial, or card at the point of genuine value |
| **Demo gate** | Excludes every buyer who wants to evaluate before talking | Self-serve path *alongside* the demo, not instead |
| **Email verification blocks entry** | A wall at the highest-intent moment, dependent on inbox delivery | Let them in; verify in the background before a consequential action |
| **No SSO** | Forces a password decision at the worst moment | Add Google/Microsoft SSO next to email |
| **No trial-before-account** | Everyone must commit before seeing anything | Sandbox, sample data, or an interactive demo |

**On card-upfront specifically:** this is a legitimate strategic choice, not automatically a mistake. Requiring a card produces fewer, better-qualified trials; not requiring one produces more trials and more tyre-kickers. What matters is that it's chosen deliberately, with the trade understood — not inherited from whatever the signup library defaulted to.

---

## 3. Progressive disclosure

The pattern that resolves the tension between "sales wants data" and "visitors want in".

```
SIGNUP          email + password  (or SSO)          → account exists
FIRST RUN       one question that shapes the product → in context, useful
AFTER VALUE     role, company size, team            → they now have a reason
ONGOING         enrichment from behaviour            → no asking at all
```

The key is that later questions must **help the user**, not just you. "How many people on your team?" is extractive at signup and useful in onboarding when it configures their workspace.

---

## 4. Flow structures by model

**Self-serve SaaS** — one step, two fields, SSO offered.
```
[Google] [Microsoft]  ——or——  email + password  →  in the product
```

**Sales-assisted B2B** — self-serve path plus a demo path, both visible. Qualify after the account exists, not before.

**Ecommerce checkout** — guest checkout always available. Address autocomplete. Payment last. Never force account creation to buy; offer it after purchase when the data is already collected.

**High-consideration / enterprise** — the form can be longer because intent is higher, but say what happens next and when. The friction here should be *stated*, not hidden.

---

## 5. Mechanics that are cheap and matter

- **`autocomplete` attributes** on every field — `email`, `current-password`, `new-password`, `organization`. Free conversion.
- **Mobile input types** — `type="email"` brings up the right keyboard; getting this wrong is a self-inflicted wound on the majority of traffic.
- **Inline validation** — validate on blur, not on submit. Never clear entered data on error.
- **Error copy that says what to do** — "Password needs 8+ characters" beats "Invalid password".
- **Progress indicator** on any multi-step flow — "Step 2 of 3".
- **Single-column layout** — multi-column forms increase completion time and errors.
- **Show password toggle** — reduces failed attempts more than it risks anything.
- **Submit button says what happens** — "Create my account" beats "Submit".

---

## 6. Worked example — Brightlane trial start

**Current flow:** 3 steps, 8 required fields (email, password, full name, company, company size, role, phone, use case), card required, email verification before entry, no SSO.

```bash
node resources/friction-score.js \
  --fields 8 --steps 3 --visitors 4000 --conv-rate 2.5 --value 900 \
  --card-upfront --email-verify --no-sso
```

Score lands in the BLOCKING band. The ranking puts card-upfront first, email verification second, no-SSO third — ahead of any field change, which is the point: the team's instinct was to shorten the form.

**Rebuilt flow:**

```
STEP 1 (only step)
  [ Continue with Google ]  [ Continue with Microsoft ]
  ——— or ———
  Email
  Password                                   (show/hide toggle)
  [ Start free trial — no card required ]

  → account created, straight into the product
  → verification email sent, but does not block entry
  → verification required only before inviting a teammate

FIRST RUN (in product, one question)
  "What are you trying to fix first?"  → configures the workspace

AFTER FIRST IMPORT
  role + company size, framed as "helps us set your defaults"

NEVER ASKED AT SIGNUP
  phone — sales requests it after the account shows activity
```

**Test first:** removing the card requirement, measured on trial starts **and** on paid conversion at day 30. If paid conversion collapses, the card was doing qualification work and the trade needs revisiting.

---

## 7. Ship checklist

- [ ] Every required field survives the four-question audit
- [ ] Blocking conditions removed or deliberately chosen
- [ ] One step where possible; progress indicator if not
- [ ] SSO offered alongside email
- [ ] `autocomplete` and mobile input types correct on every field
- [ ] Inline validation; errors never clear entered data
- [ ] Walked on a real phone, as a new user, start to finish
- [ ] Downstream metric identified — activation, not just account creation
- [ ] One change tested at a time
