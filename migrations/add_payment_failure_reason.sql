-- Online orders: keep Paystack's reason when a MoMo payment fails
-- (e.g. "Insufficient balance", "Declined", "Timeout"), so the admin can see
-- why an order failed. Additive and safe to re-run.

alter table orders
  add column if not exists payment_failure_reason text,
  add column if not exists payment_failed_at      timestamptz;
