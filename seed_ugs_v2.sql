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
--   alter table customers add column if not exists avatar_url    text;
--   alter table customers add column if not exists username      text unique;
--   alter table customers add column if not exists password      text;
--   alter table customers add column if not exists contact_phone text;
--   alter table orders    add column if not exists contact_phone text;
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
  username   text unique,           -- auto-generated on first order (e.g. kwame456)
  password   text,                  -- plain-text temp password shown once on confirmation
  avatar_url text,                  -- public URL from customer-avatars storage bucket
  created_at timestamptz default now()
);

-- If running against an existing DB, add columns safely:
alter table customers add column if not exists avatar_url     text;
alter table customers add column if not exists username       text unique;
alter table customers add column if not exists password       text;
alter table customers add column if not exists contact_phone  text;
alter table orders    add column if not exists contact_phone  text;

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
  image       text,           -- public URL from menu-images bucket
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

alter table categories add column if not exists image text;

-- ─── MENU ITEMS ─────────────────────────────────────────────
create table if not exists menu_items (
  id                uuid primary key default uuid_generate_v4(),
  branch_id         uuid references branches(id) on delete cascade,
  category_id       uuid references categories(id) on delete set null,
  name              text    not null,
  description       text,
  price             numeric(10, 2) not null,
  image             text,
  is_available      boolean not null default true,
  is_popular        boolean not null default false,
  sort_order        int     not null default 0,
  wait_time_minutes int     not null default 30, -- estimated prep time in minutes
  created_at        timestamptz default now()
);

alter table menu_items add column if not exists wait_time_minutes int not null default 30;

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
  wait_time_minutes    int,           -- estimated prep time stored at order time
  created_at           timestamptz default now()
);

alter table orders add column if not exists wait_time_minutes int;

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

-- ── Categories ───────────────────────────────────────────────
-- Same categories for both branches. image URLs to be set from admin panel.
insert into categories (id, branch_id, name, sort_order) values
  -- Central branch
  ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Fried Rice',          1),
  ('a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Jollof Rice',         2),
  ('a1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Special Chicken',     3),
  ('a1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'Special Beef',        4),
  ('a1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'Special Egg',         5),
  ('a1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000001', 'Assorted',            6),
  ('a1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000001', 'Vegetable Noodles',   7),
  ('a1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000001', 'Fries & Chips',       8),
  ('a1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000001', 'Special Meat Fries',  9),
  ('a1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000001', 'Banku',               10),
  ('a1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000001', 'Add Ons',             11),
  ('a1000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000001', 'Natural Juice',       12),
  ('a1000000-0000-0000-0000-000000000013', 'b1000000-0000-0000-0000-000000000001', 'Drinks',              13),
  ('a1000000-0000-0000-0000-000000000014', 'b1000000-0000-0000-0000-000000000001', 'Student Pack',        14),
  -- KTU branch (same categories)
  ('a2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'Fried Rice',          1),
  ('a2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'Jollof Rice',         2),
  ('a2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'Special Chicken',     3),
  ('a2000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'Special Beef',        4),
  ('a2000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002', 'Special Egg',         5),
  ('a2000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000002', 'Assorted',            6),
  ('a2000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000002', 'Vegetable Noodles',   7),
  ('a2000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000002', 'Fries & Chips',       8),
  ('a2000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000002', 'Special Meat Fries',  9),
  ('a2000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000002', 'Banku',               10),
  ('a2000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000002', 'Add Ons',             11),
  ('a2000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000002', 'Natural Juice',       12),
  ('a2000000-0000-0000-0000-000000000013', 'b1000000-0000-0000-0000-000000000002', 'Drinks',              13),
  ('a2000000-0000-0000-0000-000000000014', 'b1000000-0000-0000-0000-000000000002', 'Student Pack',        14);

-- ── Menu Items (Central Branch) ───────────────────────────────
-- Prices missing from images can be updated from the admin panel.

-- FRIED RICE
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Regular)',  40.00, 20, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Classic)',  50.00, 20, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Boss)',     60.00, 20, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Champion)', 70.00, 20, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Regular)',     40.00, 20, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Classic)',     50.00, 20, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Boss)',        60.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Champion)',    70.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Tilapia (Classic)',        69.00, 20, true, 9),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Tilapia (Boss)',           84.00, 20, true, 10),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Fried Rice with Tilapia (Champion)',       99.00, 20, true, 11);

-- JOLLOF RICE
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Regular)',  40.00, 20, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Classic)',  50.00, 20, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Boss)',     60.00, 20, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Champion)', 70.00, 20, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Regular)',     40.00, 20, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Classic)',     50.00, 20, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Boss)',        60.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Champion)',    70.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Tilapia (Classic)',        69.00, 20, true, 9),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Tilapia (Boss)',           84.00, 20, true, 10),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Jollof Rice with Tilapia (Champion)',       99.00, 20, true, 11);

-- SPECIAL CHICKEN
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Fried Rice (Classic)',   64.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Fried Rice (Boss)',      79.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Fried Rice (Champion)',  99.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Jollof Rice (Classic)',  64.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Jollof Rice (Boss)',     79.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Jollof Rice (Champion)', 99.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Noodles (Classic)',      64.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Noodles (Boss)',         79.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','Special Chicken Noodles (Champion)',     99.00, 20, true, 9);

-- SPECIAL BEEF
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Fried Rice (Classic)',    69.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Fried Rice (Boss)',       89.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Fried Rice (Champion)',  109.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Jollof Rice (Classic)',   69.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Jollof Rice (Boss)',      89.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Jollof Rice (Champion)', 109.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Noodles (Classic)',       69.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Noodles (Boss)',          89.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','Special Beef Noodles (Champion)',     109.00, 20, true, 9);

-- SPECIAL EGG
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Fried Rice (Classic)',   49.00, 20, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Fried Rice (Boss)',      59.00, 20, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Fried Rice (Champion)',  69.00, 20, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Jollof Rice (Classic)',  49.00, 20, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Jollof Rice (Boss)',     59.00, 20, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Jollof Rice (Champion)', 69.00, 20, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Noodles (Classic)',      49.00, 15, true, 7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Noodles (Boss)',         59.00, 15, true, 8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','Special Egg Noodles (Champion)',     69.00, 15, true, 9);

-- ASSORTED
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Fried Rice (Classic)',    74.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Fried Rice (Boss)',       94.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Fried Rice (Champion)',  129.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Jollof Rice (Classic)',   74.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Jollof Rice (Boss)',      94.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Jollof Rice (Champion)', 129.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Noodles (Classic)',       74.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Noodles (Boss)',          94.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','Assorted Noodles (Champion)',     129.00, 20, true, 9);

-- VEGETABLE NOODLES
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007','Vegetable Noodles with Fried Egg (Classic)',  39.00, 15, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007','Vegetable Noodles with Fried Egg (Boss)',     49.00, 15, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007','Vegetable Noodles with Fried Egg (Champion)', 59.00, 15, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007','MAS Spaghetti with Fried Egg (Classic)',      34.00, 15, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007','MAS Spaghetti with Fried Egg (Boss)',         44.00, 15, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007','MAS Spaghetti with Fried Egg (Champion)',     54.00, 15, true, 6);

-- FRIES & CHIPS
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Chicken Wings (Classic)',     49.00, 15, true,  1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Chicken Wings (Boss)',        64.00, 15, true,  2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Chicken Wings (Champion)',    79.00, 15, true,  3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Fish (Classic)',              49.00, 15, true,  4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Fish (Boss)',                 64.00, 15, true,  5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Fish (Champion)',             79.00, 15, true,  6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Tilapia (Classic)',           69.00, 15, true,  7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Tilapia (Boss)',              74.00, 15, true,  8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Yam Chips with Tilapia (Champion)',          99.00, 15, true,  9),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Chicken Wings (Classic)',  49.00, 12, true, 10),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Chicken Wings (Boss)',     64.00, 12, true, 11),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Chicken Wings (Champion)', 79.00, 12, true, 12),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Fish (Classic)',           49.00, 12, true, 13),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Fish (Boss)',              64.00, 12, true, 14),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Fish (Champion)',          79.00, 12, true, 15),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Tilapia (Classic)',        69.00, 12, true, 16),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Tilapia (Boss)',           74.00, 12, true, 17),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','Potato Chips with Tilapia (Champion)',       99.00, 12, true, 18);

-- SPECIAL MEAT FRIES
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000009','Special Meat Fries (Classic)',    79.00, 15, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000009','Special Meat Fries (Boss)',       99.00, 15, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000009','Special Meat Fries (Champion)',  124.00, 15, true, 3);

-- BANKU
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','Banku with Grilled Tilapia (Classic)',   59.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','Banku with Grilled Tilapia (Boss)',      74.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','Banku with Grilled Tilapia (Champion)',  94.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','Banku with Fried Tilapia (Classic)',     59.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','Banku with Fried Tilapia (Boss)',        74.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','Banku with Fried Tilapia (Champion)',    94.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','Extra Banku (1pc)',                       5.00,  5, true, 7);

-- ADD ONS
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Grilled Chicken Mini (1pc)',               25.00,  5, true,  1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Grilled Chicken Max (3pcs)',               70.00,  5, true,  2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Fried Chicken Mini (1pc)',                 20.00,  5, true,  3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Fried Chicken Max (3pcs)',                 55.00,  5, true,  4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Gizzard Stick',                            10.00,  5, true,  5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Chicken Stick',                            15.00,  5, true,  6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Beef Stick',                               25.00,  5, true,  7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Mix Meat Stick (Chicken, Beef & Gizzard)', 40.00,  5, true,  8),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Fried Plantain',                            5.00,  5, true,  9),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Chicken Wings (1pc)',                      20.00,  5, true, 10),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Grilled Tilapia Mini',                     60.00, 15, true, 11),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','Grilled Tilapia Max',                      80.00, 15, true, 12);

-- NATURAL JUICE
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000012','Mango Juice (Mini)',     15.00, 5, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000012','Mango Juice (Max)',      25.00, 5, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000012','Pineapple Juice (Mini)', 15.00, 5, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000012','Pineapple Juice (Max)',  25.00, 5, true, 4);

-- DRINKS (add items via admin panel once you know your drinks list)

-- STUDENT PACK (last per client)
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Fried Rice + Fried Chicken (Mini)',  30.00, 15, true, 1),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Fried Rice + Fried Chicken (Max)',   35.00, 15, true, 2),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Jollof Rice + Fried Chicken (Mini)', 30.00, 15, true, 3),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Jollof Rice + Fried Chicken (Max)',  35.00, 15, true, 4),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Veg Noodles + Fried Egg (Mini)',     30.00, 15, true, 5),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Veg Noodles + Fried Egg (Max)',      35.00, 15, true, 6),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Spaghetti + Fried Egg (Mini)',       25.00, 15, true, 7),
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000014','Student Pack: Spaghetti + Fried Egg (Max)',        30.00, 15, true, 8);

-- ── Menu Items (KTU Branch) ───────────────────────────────────

-- FRIED RICE
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Regular)',   40.00, 20, true,  1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Classic)',   50.00, 20, true,  2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Boss)',      60.00, 20, true,  3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Chicken (Champion)',  70.00, 20, true,  4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Regular)',      40.00, 20, true,  5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Classic)',      50.00, 20, true,  6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Boss)',         60.00, 20, true,  7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Fried Fish (Champion)',     70.00, 20, true,  8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Tilapia (Classic)',         69.00, 20, true,  9),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Tilapia (Boss)',            84.00, 20, true, 10),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Fried Rice with Tilapia (Champion)',        99.00, 20, true, 11);

-- JOLLOF RICE
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Regular)',  40.00, 20, true,  1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Classic)',  50.00, 20, true,  2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Boss)',     60.00, 20, true,  3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Chicken (Champion)', 70.00, 20, true,  4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Regular)',     40.00, 20, true,  5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Classic)',     50.00, 20, true,  6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Boss)',        60.00, 20, true,  7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Fried Fish (Champion)',    70.00, 20, true,  8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Tilapia (Classic)',        69.00, 20, true,  9),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Tilapia (Boss)',           84.00, 20, true, 10),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Jollof Rice with Tilapia (Champion)',       99.00, 20, true, 11);

-- SPECIAL CHICKEN
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Fried Rice (Classic)',    64.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Fried Rice (Boss)',       79.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Fried Rice (Champion)',   99.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Jollof Rice (Classic)',   64.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Jollof Rice (Boss)',      79.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Jollof Rice (Champion)',  99.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Noodles (Classic)',       64.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Noodles (Boss)',          79.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Special Chicken Noodles (Champion)',      99.00, 20, true, 9);

-- SPECIAL BEEF
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Fried Rice (Classic)',    69.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Fried Rice (Boss)',       89.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Fried Rice (Champion)',  109.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Jollof Rice (Classic)',   69.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Jollof Rice (Boss)',      89.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Jollof Rice (Champion)', 109.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Noodles (Classic)',       69.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Noodles (Boss)',          89.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','Special Beef Noodles (Champion)',     109.00, 20, true, 9);

-- SPECIAL EGG
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Fried Rice (Classic)',    49.00, 20, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Fried Rice (Boss)',       59.00, 20, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Fried Rice (Champion)',   69.00, 20, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Jollof Rice (Classic)',   49.00, 20, true, 4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Jollof Rice (Boss)',      59.00, 20, true, 5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Jollof Rice (Champion)',  69.00, 20, true, 6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Noodles (Classic)',       49.00, 15, true, 7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Noodles (Boss)',          59.00, 15, true, 8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005','Special Egg Noodles (Champion)',      69.00, 15, true, 9);

-- ASSORTED
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Fried Rice (Classic)',    74.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Fried Rice (Boss)',       94.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Fried Rice (Champion)',  129.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Jollof Rice (Classic)',   74.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Jollof Rice (Boss)',      94.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Jollof Rice (Champion)', 129.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Noodles (Classic)',       74.00, 20, true, 7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Noodles (Boss)',          94.00, 20, true, 8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006','Assorted Noodles (Champion)',     129.00, 20, true, 9);

-- VEGETABLE NOODLES
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000007','Vegetable Noodles with Fried Egg (Classic)',  39.00, 15, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000007','Vegetable Noodles with Fried Egg (Boss)',     49.00, 15, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000007','Vegetable Noodles with Fried Egg (Champion)', 59.00, 15, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000007','MAS Spaghetti with Fried Egg (Classic)',      34.00, 15, true, 4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000007','MAS Spaghetti with Fried Egg (Boss)',         44.00, 15, true, 5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000007','MAS Spaghetti with Fried Egg (Champion)',     54.00, 15, true, 6);

-- FRIES & CHIPS
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Chicken Wings (Classic)',      49.00, 15, true,  1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Chicken Wings (Boss)',         64.00, 15, true,  2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Chicken Wings (Champion)',     79.00, 15, true,  3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Fish (Classic)',               49.00, 15, true,  4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Fish (Boss)',                  64.00, 15, true,  5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Fish (Champion)',              79.00, 15, true,  6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Tilapia (Classic)',            69.00, 15, true,  7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Tilapia (Boss)',               74.00, 15, true,  8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Yam Chips with Tilapia (Champion)',           99.00, 15, true,  9),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Chicken Wings (Classic)',   49.00, 12, true, 10),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Chicken Wings (Boss)',      64.00, 12, true, 11),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Chicken Wings (Champion)',  79.00, 12, true, 12),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Fish (Classic)',            49.00, 12, true, 13),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Fish (Boss)',               64.00, 12, true, 14),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Fish (Champion)',           79.00, 12, true, 15),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Tilapia (Classic)',         69.00, 12, true, 16),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Tilapia (Boss)',            74.00, 12, true, 17),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008','Potato Chips with Tilapia (Champion)',        99.00, 12, true, 18);

-- SPECIAL MEAT FRIES
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000009','Special Meat Fries (Classic)',    79.00, 15, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000009','Special Meat Fries (Boss)',       99.00, 15, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000009','Special Meat Fries (Champion)',  124.00, 15, true, 3);

-- BANKU
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000010','Banku with Grilled Tilapia (Classic)',   59.00, 25, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000010','Banku with Grilled Tilapia (Boss)',      74.00, 25, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000010','Banku with Grilled Tilapia (Champion)',  94.00, 25, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000010','Banku with Fried Tilapia (Classic)',     59.00, 25, true, 4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000010','Banku with Fried Tilapia (Boss)',        74.00, 25, true, 5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000010','Banku with Fried Tilapia (Champion)',    94.00, 25, true, 6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000010','Extra Banku (1pc)',                       5.00,  5, true, 7);

-- ADD ONS
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Grilled Chicken Mini (1pc)',               25.00,  5, true,  1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Grilled Chicken Max (3pcs)',               70.00,  5, true,  2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Fried Chicken Mini (1pc)',                 20.00,  5, true,  3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Fried Chicken Max (3pcs)',                 55.00,  5, true,  4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Gizzard Stick',                            10.00,  5, true,  5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Chicken Stick',                            15.00,  5, true,  6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Beef Stick',                               25.00,  5, true,  7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Mix Meat Stick (Chicken, Beef & Gizzard)', 40.00,  5, true,  8),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Fried Plantain',                            5.00,  5, true,  9),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Chicken Wings (1pc)',                      20.00,  5, true, 10),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Grilled Tilapia Mini',                     60.00, 15, true, 11),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000011','Grilled Tilapia Max',                      80.00, 15, true, 12);

-- NATURAL JUICE
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000012','Mango Juice (Mini)',     15.00, 5, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000012','Mango Juice (Max)',      25.00, 5, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000012','Pineapple Juice (Mini)', 15.00, 5, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000012','Pineapple Juice (Max)',  25.00, 5, true, 4);

-- DRINKS (add items via admin panel)

-- STUDENT PACK
insert into menu_items (branch_id, category_id, name, price, wait_time_minutes, is_available, sort_order) values
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Fried Rice + Fried Chicken (Mini)',  30.00, 15, true, 1),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Fried Rice + Fried Chicken (Max)',   35.00, 15, true, 2),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Jollof Rice + Fried Chicken (Mini)', 30.00, 15, true, 3),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Jollof Rice + Fried Chicken (Max)',  35.00, 15, true, 4),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Veg Noodles + Fried Egg (Mini)',     30.00, 15, true, 5),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Veg Noodles + Fried Egg (Max)',      35.00, 15, true, 6),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Spaghetti + Fried Egg (Mini)',       25.00, 15, true, 7),
  ('b1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000014','Student Pack: Spaghetti + Fried Egg (Max)',        30.00, 15, true, 8);
