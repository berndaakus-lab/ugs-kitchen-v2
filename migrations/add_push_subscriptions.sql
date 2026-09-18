-- Run this once in Supabase SQL editor to enable push notifications

create table if not exists push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  endpoint   text        unique not null,
  p256dh     text        not null,
  auth       text        not null,
  role       text        not null default 'customer' check (role in ('admin', 'customer')),
  order_id   bigint      references orders(id) on delete cascade,
  created_at timestamptz default now()
);

-- Clean up expired subscriptions older than 90 days (optional, run periodically)
-- delete from push_subscriptions where created_at < now() - interval '90 days';
