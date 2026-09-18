-- Run once in Supabase SQL editor to add delivery tracking columns

alter table orders
  add column if not exists delivered_by    text,
  add column if not exists delivered_by_id uuid references staff(id) on delete set null,
  add column if not exists delivered_at    timestamptz;
