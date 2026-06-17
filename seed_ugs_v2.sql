-- ============================================================
-- UGs Kitchen V2 — Supabase Schema & Seed Data
-- Run this in the Supabase SQL Editor
-- Safe to run from scratch — drops everything and rebuilds clean
-- ============================================================
--
-- ⚠️  IF YOU WANT TO KEEP EXISTING DATA (orders, branches, etc.)
-- run only these lines instead of the full script:
--
--   alter table orders add column if not exists reminded_at timestamptz;
--   alter table orders add column if not exists contact_phone text;
--   alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
--   create table if not exists customers (
--     id uuid primary key default uuid_generate_v4(),
--     name text not null,
--     phone text not null unique,
--     created_at timestamptz default now()
--   );
--   alter table customers enable row level security;
--   create policy "Anyone can upsert customers" on customers for insert with check (true);
--   create policy "Anyone can update customers" on customers for update using (true) with check (true);
--   create policy "Anyone can read customers"   on customers for select using (true);
--   alter table customers add column if not exists avatar_url text;
--
-- ============================================================

-- ─── DROP EXISTING TABLES (order matters due to foreign keys) ─
drop table if exists reviews    cascade;
drop table if exists orders     cascade;
drop table if exists menu_items cascade;
drop table if exists categories cascade;
drop table if exists branches   cascade;
drop table if exists customers  cascade;
drop table if exists staff      cascade;

-- Drop storage policies if bucket already exists
drop policy if exists "Public can view menu images"      on storage.objects;
drop policy if exists "Owner can upload menu images"     on storage.objects;
drop policy if exists "Owner can update menu images"     on storage.objects;
drop policy if exists "Owner can delete menu images"     on storage.objects;
drop policy if exists "Public can view avatars"          on storage.objects;
drop policy if exists "Anyone can upload their avatar"   on storage.objects;
drop policy if exists "Anyone can update their avatar"   on storage.objects;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── STAFF ───────────────────────────────────────────────────
-- Kitchen staff who can log into the admin dashboard.
-- Role 'staff'  → Orders tab only
-- Role 'admin'  → All tabs (Orders, Reviews, Menu, Staff)
-- The master admin account is stored in env vars (NEXT_PUBLIC_ADMIN_USERNAME / NEXT_PUBLIC_ADMIN_PIN)
-- and does NOT need a row here.

create table if not exists staff (
  id         uuid primary key default uuid_generate_v4(),
  name       text    not null,
  username   text    not null unique,
  pin        text    not null,
  role       text    not null default 'staff' check (role in ('admin','staff')),
  is_active  boolean not null default true,
  branch_id  uuid references branches(id) on delete set null,
  created_at timestamptz default now()
);

-- If table already exists, add branch_id safely:
alter table staff add column if not exists branch_id uuid references branches(id) on delete set null;

alter table staff enable row level security;
-- Anon key can read staff (needed for login verification — PIN is app-level protected)
create policy "Public can read staff for login"
  on staff for select using (true);
-- Only via anon key (admin PIN-gated at app level) can manage staff
create policy "Admin can insert staff"
  on staff for insert with check (true);
create policy "Admin can update staff"
  on staff for update using (true) with check (true);
create policy "Admin can delete staff"
  on staff for delete using (true);

-- ─── BRANCHES ────────────────────────────────────────────────
create table if not exists branches (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text    not null,
  slug                 text    not null unique,  -- used in ?branch=slug URL param
  address              text,
  phone                text,
  whatsapp             text,                     -- branch-specific owner WhatsApp
  delivery_locations   jsonb   not null default '[]', -- array of location strings
  is_active            boolean not null default true,
  sort_order           int     not null default 0,
  created_at           timestamptz default now()
);

alter table branches enable row level security;
create policy "Public can read active branches"
  on branches for select using (is_active = true);
create policy "Service role can manage branches"
  on branches for all using (auth.role() = 'service_role');

-- ─── CUSTOMERS ───────────────────────────────────────────────
-- Auto-created silently when a customer places their first order
create table if not exists customers (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  phone      text not null unique,  -- Ghana format: 0244XXXXXX
  avatar_url text,                  -- public URL from customer-avatars storage bucket
  created_at timestamptz default now()
);

-- If running against an existing DB, add the column safely:
alter table customers add column if not exists avatar_url text;

alter table customers enable row level security;
-- Anyone (anon key) can upsert their own record by phone
create policy "Anyone can upsert customers"
  on customers for insert with check (true);
create policy "Anyone can update customers"
  on customers for update using (true) with check (true);
create policy "Anyone can read customers"
  on customers for select using (true);

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

-- ─── STORAGE BUCKET FOR CUSTOMER AVATARS ────────────────────
insert into storage.buckets (id, name, public)
values ('customer-avatars', 'customer-avatars', true)
on conflict (id) do nothing;

create policy "Public can view avatars"
  on storage.objects for select
  using ( bucket_id = 'customer-avatars' );

create policy "Anyone can upload their avatar"
  on storage.objects for insert
  with check ( bucket_id = 'customer-avatars' );

create policy "Anyone can update their avatar"
  on storage.objects for update
  using ( bucket_id = 'customer-avatars' );

-- ─── CATEGORIES ─────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default uuid_generate_v4(),
  branch_id   uuid references branches(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- ─── MENU ITEMS ─────────────────────────────────────────────
create table if not exists menu_items (
  id           uuid primary key default uuid_generate_v4(),
  branch_id    uuid references branches(id) on delete cascade,
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
  branch_id            uuid references branches(id) on delete set null,
  customer_id          uuid references customers(id) on delete set null,
  contact_phone        text,                          -- account phone if logged in, else momo_number
  notes                text,
  reminded_at          timestamptz,   -- set when 30-min reminder SMS is sent (prevents duplicates)
  created_at           timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

-- Categories: public read
alter table categories enable row level security;
create policy "Public read categories"
  on categories for select using (true);

-- Menu items: public read; admin can write (PIN-protected at app level)
alter table menu_items enable row level security;
create policy "Public read menu_items"
  on menu_items for select using (true);
create policy "Admin can insert menu_items"
  on menu_items for insert with check (true);
create policy "Admin can update menu_items"
  on menu_items for update using (true) with check (true);
create policy "Admin can delete menu_items"
  on menu_items for delete using (true);

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

-- ─── REVIEWS ─────────────────────────────────────────────────
create table if not exists reviews (
  id            bigserial primary key,
  customer_name text not null,
  momo_number   text not null,           -- used for deduplication only, not shown publicly
  rating        int  not null check (rating between 1 and 5),
  comment       text,
  is_approved   boolean not null default true,
  created_at    timestamptz default now(),
  unique (momo_number)                   -- one review per MoMo number
);

alter table reviews enable row level security;

create policy "Anyone can submit a review"
  on reviews for insert with check (true);

create policy "Anyone can read approved reviews"
  on reviews for select using (is_approved = true);

create policy "Service role can manage reviews"
  on reviews for all using (auth.role() = 'service_role');

alter publication supabase_realtime add table reviews;

-- ─── SEED DATA ───────────────────────────────────────────────

-- ── Branches (Koforidua) ─────────────────────────────────────
-- To add a new branch later: just insert a new row here and assign menu items to it.
-- Delivery locations are stored as a JSON array per branch.

insert into branches (id, name, slug, address, delivery_locations, sort_order) values
  (
    'b1000000-0000-0000-0000-000000000001',
    'UGs Kitchen — Central',
    'central',
    'Koforidua Central, Eastern Region',
    '["Koforidua Central","Adweso","Effiduase","Koforidua Station","Oyoko","Nsukwao","Zongo","Hospital Area","Pick-Up (No Delivery)"]',
    1
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'UGs Kitchen — KTU Campus',
    'ktu',
    'Koforidua Technical University Area',
    '["KTU Campus","Adweso","Asokore","Koforidua Central","Nkurakan","Pick-Up (No Delivery)"]',
    2
  );

-- ── Categories (assigned to Central branch) ──────────────────
insert into categories (id, branch_id, name, sort_order) values
  ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Rice Dishes',    1),
  ('a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Soups & Stews',  2),
  ('a1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Sides & Extras', 3),
  ('a1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'Drinks',         4),
  -- KTU branch categories
  ('a2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'Rice Dishes',    1),
  ('a2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'Soups & Stews',  2),
  ('a2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'Sides & Extras', 3),
  ('a2000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'Drinks',         4);

-- ── Menu Items ────────────────────────────────────────────────
-- Central Branch
insert into menu_items (branch_id, name, category_id, price, description, is_available, is_popular, sort_order) values
  ('b1000000-0000-0000-0000-000000000001', 'Jollof Rice + Chicken',    'a1000000-0000-0000-0000-000000000001', 35.00, 'Party-style jollof with grilled chicken',            true, true,  1),
  ('b1000000-0000-0000-0000-000000000001', 'Fried Rice + Fish',        'a1000000-0000-0000-0000-000000000001', 30.00, 'Classic fried rice with crispy tilapia',             true, false, 2),
  ('b1000000-0000-0000-0000-000000000001', 'Waakye + Egg',             'a1000000-0000-0000-0000-000000000001', 25.00, 'Rice & beans with boiled egg & wele',               true, true,  3),
  ('b1000000-0000-0000-0000-000000000001', 'Plain Rice + Stew',        'a1000000-0000-0000-0000-000000000001', 20.00, 'Steamed rice with tomato-based stew',               true, false, 4),
  ('b1000000-0000-0000-0000-000000000001', 'Light Soup + Fufu',        'a1000000-0000-0000-0000-000000000002', 40.00, 'Traditional light soup with pounded fufu',          true, true,  1),
  ('b1000000-0000-0000-0000-000000000001', 'Groundnut Soup + Rice',    'a1000000-0000-0000-0000-000000000002', 38.00, 'Rich peanut soup served with rice balls',           true, false, 2),
  ('b1000000-0000-0000-0000-000000000001', 'Kontomire Stew + Yam',     'a1000000-0000-0000-0000-000000000002', 30.00, 'Cocoyam leaves stew with boiled yam',              true, false, 3),
  ('b1000000-0000-0000-0000-000000000001', 'Palmnut Soup + Banku',     'a1000000-0000-0000-0000-000000000002', 42.00, 'Banga soup with fermented corn & cassava dough',   true, true,  4),
  ('b1000000-0000-0000-0000-000000000001', 'Extra Chicken',            'a1000000-0000-0000-0000-000000000003', 15.00, 'Grilled half chicken',                             true, false, 1),
  ('b1000000-0000-0000-0000-000000000001', 'Fried Plantain (Kelewele)','a1000000-0000-0000-0000-000000000003', 10.00, 'Spiced fried ripe plantain',                       true, true,  2),
  ('b1000000-0000-0000-0000-000000000001', 'Boiled Egg',               'a1000000-0000-0000-0000-000000000003',  5.00, 'One boiled egg',                                   true, false, 3),
  ('b1000000-0000-0000-0000-000000000001', 'Extra Fufu / Banku',       'a1000000-0000-0000-0000-000000000003',  8.00, 'Extra swallow portion',                            true, false, 4),
  ('b1000000-0000-0000-0000-000000000001', 'Sobolo (Sorrel Drink)',    'a1000000-0000-0000-0000-000000000004',  8.00, 'Chilled hibiscus drink',                           true, true,  1),
  ('b1000000-0000-0000-0000-000000000001', 'Bottled Water',            'a1000000-0000-0000-0000-000000000004',  4.00, '500ml bottled water',                              true, false, 2),
  ('b1000000-0000-0000-0000-000000000001', 'Malta',                    'a1000000-0000-0000-0000-000000000004',  7.00, 'Chilled Malta Guinness',                           true, false, 3),
  ('b1000000-0000-0000-0000-000000000001', 'Mineral (Soft Drink)',     'a1000000-0000-0000-0000-000000000004',  6.00, 'Coke, Sprite, or Fanta',                          true, false, 4),

  -- KTU Branch (same menu — prices can be adjusted per branch anytime)
  ('b1000000-0000-0000-0000-000000000002', 'Jollof Rice + Chicken',    'a2000000-0000-0000-0000-000000000001', 35.00, 'Party-style jollof with grilled chicken',           true, true,  1),
  ('b1000000-0000-0000-0000-000000000002', 'Fried Rice + Fish',        'a2000000-0000-0000-0000-000000000001', 30.00, 'Classic fried rice with crispy tilapia',            true, false, 2),
  ('b1000000-0000-0000-0000-000000000002', 'Waakye + Egg',             'a2000000-0000-0000-0000-000000000001', 25.00, 'Rice & beans with boiled egg & wele',              true, true,  3),
  ('b1000000-0000-0000-0000-000000000002', 'Plain Rice + Stew',        'a2000000-0000-0000-0000-000000000001', 20.00, 'Steamed rice with tomato-based stew',              true, false, 4),
  ('b1000000-0000-0000-0000-000000000002', 'Light Soup + Fufu',        'a2000000-0000-0000-0000-000000000002', 40.00, 'Traditional light soup with pounded fufu',         true, true,  1),
  ('b1000000-0000-0000-0000-000000000002', 'Groundnut Soup + Rice',    'a2000000-0000-0000-0000-000000000002', 38.00, 'Rich peanut soup served with rice balls',          true, false, 2),
  ('b1000000-0000-0000-0000-000000000002', 'Palmnut Soup + Banku',     'a2000000-0000-0000-0000-000000000002', 42.00, 'Banga soup with fermented corn & cassava dough',  true, true,  3),
  ('b1000000-0000-0000-0000-000000000002', 'Extra Chicken',            'a2000000-0000-0000-0000-000000000003', 15.00, 'Grilled half chicken',                            true, false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'Fried Plantain (Kelewele)','a2000000-0000-0000-0000-000000000003', 10.00, 'Spiced fried ripe plantain',                      true, true,  2),
  ('b1000000-0000-0000-0000-000000000002', 'Sobolo (Sorrel Drink)',    'a2000000-0000-0000-0000-000000000004',  8.00, 'Chilled hibiscus drink',                          true, true,  1),
  ('b1000000-0000-0000-0000-000000000002', 'Bottled Water',            'a2000000-0000-0000-0000-000000000004',  4.00, '500ml bottled water',                             true, false, 2),
  ('b1000000-0000-0000-0000-000000000002', 'Mineral (Soft Drink)',     'a2000000-0000-0000-0000-000000000004',  6.00, 'Coke, Sprite, or Fanta',                         true, false, 3);
