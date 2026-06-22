-- AAJ — add the Sales & Pipeline category (Sales pillar, Wave 2)
-- Run this in Supabase BEFORE syncing the Sales skills, so they have a category to attach to.
-- Adjust column names to match your existing `categories` table / seed-categories.sql
-- (e.g. if your ordering column is `position` or `order_index` rather than `sort_order`,
-- rename it below; if you have no ordering column, drop that line).

insert into public.categories (slug, name, description, sort_order)
values (
  'sales-pipeline',
  'Sales & Pipeline',
  'Outbound, prospecting, discovery, proposals, win-loss, and forecasting — the full sales motion.',
  9
)
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      sort_order  = excluded.sort_order;
