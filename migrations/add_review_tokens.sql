-- Run once in Supabase SQL editor

-- Token on each order, generated when delivered
alter table orders
  add column if not exists review_token         uuid,
  add column if not exists review_token_used_at timestamptz;

create unique index if not exists orders_review_token_idx on orders(review_token) where review_token is not null;

-- Link review to the specific order
alter table reviews
  add column if not exists order_id bigint references orders(id) on delete set null;
