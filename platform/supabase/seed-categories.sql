-- AAJ Marketing Skills — category seed (Step 4)
-- The eight catalog categories. Run after schema.sql. Idempotent.

insert into public.categories (slug, name, description, sort_order) values
  ('strategy-positioning',   'Strategy & Positioning',      'Positioning, messaging, pricing, plans, and the strategy that directs everything else.', 1),
  ('research-personas',      'Research & Personas',         'Customer research, ICPs, personas, surveys, and competitive insight.',                    2),
  ('seo-geo-aeo',            'SEO, GEO & AEO',              'Ranking in search, getting cited by AI engines, and winning answer-engine snippets.',     3),
  ('conversion-web',         'Conversion & Web',            'Landing pages, CRO, signup and onboarding flows, and on-site conversion.',                4),
  ('content-copy',           'Content & Copy',              'Copywriting, content strategy, editorial calendars, email, and social.',                  5),
  ('paid-media-budgeting',   'Paid Media & Budgeting',      'Total marketing budget, paid channel allocation, and ad creative.',                       6),
  ('analytics-experimentation','Analytics & Experimentation','Unit economics, analytics, and A/B testing.',                                            7),
  ('growth-retention-revops','Growth, Retention & RevOps',  'Referrals, lifecycle, churn prevention, prospecting, and sales enablement.',              8)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;
