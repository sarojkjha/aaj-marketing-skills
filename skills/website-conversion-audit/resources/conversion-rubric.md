# Conversion audit rubric

23 checks across 6 weighted categories, mirroring the AAJ Website Grader. Record `pass`, `partial`, or `fail` for each, then run `score.js`. Grades: A ≥ 90, B 75–89, C 60–74, D 45–59, F < 45. Check IDs are exactly the keys `score.js` expects.

## Message & Clarity — weight 22
- `clear_value_prop` — within 5 seconds it's obvious what this is and what you get.
- `headline_outcome_focused` — the hero leads with the outcome/benefit, not the product category.
- `audience_obvious` — it's clear who it's for.
- `jargon_free` — no insider terms the visitor wouldn't use.
- `above_fold_clarity` — the core message lands without scrolling.

## Call to Action — weight 20
- `primary_cta_visible` — a clear primary CTA is visible above the fold.
- `single_primary_action` — one primary action, not several competing CTAs.
- `cta_copy_specific` — CTA copy says what happens ("Get my plan"), not "Submit"/"Learn more".
- `cta_repeated_on_long_pages` — long pages repeat the CTA at natural decision points.

## Trust & Proof — weight 18
- `social_proof` — logos, counts, ratings, or named customers present.
- `specific_results_or_data` — concrete, quantified results rather than vague claims.
- `security_trust_signals` — security/privacy/guarantee cues where relevant (esp. checkout/forms).
- `real_testimonials` — attributed, believable testimonials (name/photo/company), not anonymous.

## Friction & Forms — weight 16
- `short_forms` — forms ask for the minimum needed now.
- `no_unnecessary_fields` — no fields that aren't essential to the next step.
- `clear_next_step` — the visitor always knows what happens next.
- `no_dead_ends` — no pages that leave the visitor with nowhere to go.

## Speed & Mobile — weight 14
- `fast_load` — loads quickly; no long blocking spinners.
- `mobile_usable` — fully usable and legible on a phone.
- `no_layout_shift` — content doesn't jump as it loads.

## Conversion Tracking — weight 10
- `analytics_installed` — analytics is present and firing.
- `conversion_events_defined` — the real conversion (signup/lead/purchase) is tracked as an event.
- `optimizes_to_customers` — ad/landing optimization targets customers or qualified leads, not raw clicks/form-fills.

## Scoring values
`pass` = 1.0 · `partial` = 0.5 · `fail` = 0. Omitted checks = fail. Category score = (sum earned ÷ checks) × weight.
