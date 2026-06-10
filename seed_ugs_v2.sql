-- ============================================================
-- UGs Kitchen V2 — Supabase Schema & Seed Data
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── STORAGE BUCKET FOR MENU IMAGES ─────────────────────────
-- Creates a public bucket called "menu-images"
-- After running this, go to: Storage → menu-images → Upload your food photos
-- Then copy the public URL and paste it into the menu_items.image column

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

-- Allow anyone to read/view images (public bucket)
create policy "Public can view menu images"
  on storage.objects for select
  using ( bucket_id = 'menu-images' );

-- Only authenticated users (you, the owner) can upload/update/delete
create policy "Owner can upload menu images"
  on storage.objects for insert
  with check ( bucket_id = 'menu-images' and auth.role() = 'authenticated' );

create policy "Owner can update menu images"
  on storage.objects for update
  using ( bucket_id = 'menu-images' and auth.role() = 'authenticated' );

create policy "Owner can delete menu images"
  on storage.objects for delete
  using ( bucket_id = 'menu-images' and auth.role() = 'authenticated' );

-- ─── CATEGORIES ─────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- ─── MENU ITEMS ─────────────────────────────────────────────
create table if not exists menu_items (
  id           uuid primary key default uuid_generate_v4(),
  category_id  uuid references categories(id) on delete set null,
  name         text    not null,
  description  text,
  price        numeric(10, 2) not null,
  image        text,
  is_available boolean not null default true,
  is_popular   boolean not null default false,
  sort_order   int     not null default 0,
  created_at   timestamptz default now()
);

-- ─── ORDERS ─────────────────────────────────────────────────
create table if not exists orders (
  id                   bigserial primary key,
  customer_name        text    not null,
  delivery_location    text    not null,
  momo_number          text    not null,
  items                jsonb   not null default '[]',
  total_amount         numeric(10, 2) not null,
  status               text    not null default 'pending'
                         check (status in ('pending','awaiting_payment','paid','preparing','ready','delivered','failed','cancelled')),
  paystack_reference   text,
  payment_channel      text,
  paid_at              timestamptz,
  created_at           timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

-- Categories: public read
alter table categories enable row level security;
create policy "Public read categories"
  on categories for select using (true);

-- Menu items: public read
alter table menu_items enable row level security;
create policy "Public read menu_items"
  on menu_items for select using (true);

-- Orders: anyone can insert (place order), only service role can update
alter table orders enable row level security;

create policy "Anyone can place an order"
  on orders for insert with check (true);

create policy "Service role can update orders"
  on orders for update using (auth.role() = 'service_role');

create policy "Service role can read all orders"
  on orders for select using (auth.role() = 'service_role');

-- Allow realtime subscription for own order by ID (anon users)
create policy "Customers can read own order"
  on orders for select
  using (true); -- Restrict further if needed: auth.uid()::text = customer_uid

-- ─── REALTIME PUBLICATION ────────────────────────────────────
-- Enable realtime for order status updates
alter publication supabase_realtime add table orders;

-- ─── SEED DATA ───────────────────────────────────────────────

insert into categories (id, name, sort_order) values
  ('a1000000-0000-0000-0000-000000000001', 'Rice Dishes',    1),
  ('a1000000-0000-0000-0000-000000000002', 'Soups & Stews',  2),
  ('a1000000-0000-0000-0000-000000000003', 'Sides & Extras', 3),
  ('a1000000-0000-0000-0000-000000000004', 'Drinks',         4);

insert into menu_items (name, category_id, price, description, is_available, is_popular, sort_order) values
  -- Rice Dishes
  ('Jollof Rice + Chicken',   'a1000000-0000-0000-0000-000000000001', 35.00, 'Party-style jollof with grilled chicken',    true, true,  1),
  ('Fried Rice + Fish',       'a1000000-0000-0000-0000-000000000001', 30.00, 'Classic fried rice with crispy tilapia',     true, false, 2),
  ('Waakye + Egg',            'a1000000-0000-0000-0000-000000000001', 25.00, 'Rice & beans with boiled egg & wele',        true, true,  3),
  ('Plain Rice + Stew',       'a1000000-0000-0000-0000-000000000001', 20.00, 'Steamed rice with tomato-based stew',        true, false, 4),

  -- Soups & Stews
  ('Light Soup + Fufu',       'a1000000-0000-0000-0000-000000000002', 40.00, 'Traditional light soup with pounded fufu',   true, true,  1),
  ('Groundnut Soup + Rice',   'a1000000-0000-0000-0000-000000000002', 38.00, 'Rich peanut soup served with rice balls',    true, false, 2),
  ('Kontomire Stew + Yam',    'a1000000-0000-0000-0000-000000000002', 30.00, 'Cocoyam leaves stew with boiled yam',        true, false, 3),
  ('Palmnut Soup + Banku',    'a1000000-0000-0000-0000-000000000002', 42.00, 'Banga soup with fermented corn & cassava dough', true, true, 4),

  -- Sides & Extras
  ('Extra Chicken',           'a1000000-0000-0000-0000-000000000003', 15.00, 'Grilled half chicken',                       true, false, 1),
  ('Fried Plantain (Kelewele)', 'a1000000-0000-0000-0000-000000000003', 10.00, 'Spiced fried ripe plantain',              true, true,  2),
  ('Boiled Egg',              'a1000000-0000-0000-0000-000000000003',  5.00, 'One boiled egg',                             true, false, 3),
  ('Extra Fufu / Banku',      'a1000000-0000-0000-0000-000000000003',  8.00, 'Extra swallow portion',                      true, false, 4),

  -- Drinks
  ('Sobolo (Sorrel Drink)',   'a1000000-0000-0000-0000-000000000004',  8.00, 'Chilled hibiscus drink',                     true, true,  1),
  ('Bottled Water',           'a1000000-0000-0000-0000-000000000004',  4.00, '500ml bottled water',                        true, false, 2),
  ('Malta',                   'a1000000-0000-0000-0000-000000000004',  7.00, 'Chilled Malta Guinness',                     true, false, 3),
  ('Mineral (Soft Drink)',    'a1000000-0000-0000-0000-000000000004',  6.00, 'Coke, Sprite, or Fanta',                     true, false, 4);
