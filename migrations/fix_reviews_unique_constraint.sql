-- Allow a customer to review each of their orders independently.
-- The old unique(momo_number) blocked a second review even for a different order.
-- unique(order_id) already prevents double-reviewing the same order.

alter table reviews drop constraint if exists reviews_momo_number_key;
drop index if exists reviews_momo_number_key;

-- Ensure order_id unique index exists (idempotent)
create unique index if not exists reviews_order_id_key on reviews(order_id) where order_id is not null;
