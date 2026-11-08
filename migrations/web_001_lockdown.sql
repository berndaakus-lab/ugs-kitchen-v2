-- ═══════════════════════════════════════════════════════════════
-- Website security lockdown. Run in Supabase → SQL Editor, the whole file,
-- AFTER the matching website code is deployed (see the note at the end).
-- Safe to re-run.
--
-- Before: anyone holding the public (anon) key — every visitor's browser has
-- it — could read all staff PINs, all customer passwords and every order
-- (names, phones, MoMo numbers, locations), and change menu prices, staff,
-- branches, promos and reviews.
--
-- After:
--   • staff, customers, orders, push_subscriptions: no public access at all.
--     The website reaches them only through its server (/api/*), which checks
--     a signed login cookie.
--   • menu_items, categories: public can read only.
--   • branches, promos, reviews: public can read only the columns the shop
--     front shows (no SMS phone lists, no reviewer MoMo numbers), and only
--     active promos / approved reviews.
--   • Staff PINs and customer passwords are stored as bcrypt hashes, and are
--     hashed automatically however they are saved.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── 1. Remove every existing policy on these tables ─────────────
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('staff','customers','orders','push_subscriptions','reviews','promos','branches','menu_items','categories')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table staff              enable row level security;
alter table customers          enable row level security;
alter table orders             enable row level security;
alter table push_subscriptions enable row level security;
alter table reviews            enable row level security;
alter table promos             enable row level security;
alter table branches           enable row level security;
alter table menu_items         enable row level security;
alter table categories         enable row level security;

revoke all on staff, customers, orders, push_subscriptions, reviews, promos, branches, menu_items, categories
  from anon, authenticated;

-- ── 2. What the public shop front may read ──────────────────────
grant select on menu_items, categories to anon, authenticated;
create policy "Public reads the menu"       on menu_items for select to anon, authenticated using (true);
create policy "Public reads the categories" on categories for select to anon, authenticated using (true);

grant select (id, name, slug, address, phone, whatsapp, delivery_locations, is_active, sort_order, created_at, business_hours)
  on branches to anon, authenticated;
create policy "Public reads branches" on branches for select to anon, authenticated using (true);

grant select (id, title, subtitle, code, active, created_at, image, ends_at) on promos to anon, authenticated;
create policy "Public reads active promos" on promos for select to anon, authenticated using (active);

grant select (id, customer_name, rating, comment, is_approved, created_at) on reviews to anon, authenticated;
create policy "Public reads approved reviews" on reviews for select to anon, authenticated using (is_approved);

-- ── 3. Hash staff PINs and customer passwords ───────────────────
create or replace function web_is_bcrypt(p text) returns boolean
language sql immutable as $$ select coalesce(p ~ '^\$2[abxy]\$\d\d\$', false) $$;

create or replace function web_hash_staff_pin() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.pin is not null and not web_is_bcrypt(new.pin) then
    new.pin := crypt(new.pin, gen_salt('bf'));
  end if;
  return new;
end $$;
drop trigger if exists staff_hash_pin on staff;
create trigger staff_hash_pin before insert or update of pin on staff
  for each row execute function web_hash_staff_pin();

create or replace function web_hash_customer_password() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.password is not null and new.password <> '' and not web_is_bcrypt(new.password) then
    new.password := crypt(new.password, gen_salt('bf'));
  end if;
  return new;
end $$;
drop trigger if exists customers_hash_password on customers;
create trigger customers_hash_password before insert or update of password on customers
  for each row execute function web_hash_customer_password();

-- hash what is already stored (the triggers do the work)
update staff     set pin = pin           where not web_is_bcrypt(pin);
update customers set password = password where password is not null and password <> '' and not web_is_bcrypt(password);

-- ── 4. Login checks (server only) ───────────────────────────────
alter table staff add column if not exists web_failed_attempts int not null default 0;
alter table staff add column if not exists web_locked_until timestamptz;

-- Website staff login. Locks the account for 10 minutes after 5 wrong PINs.
-- Returns one row: ok=false with a reason, or ok=true with the person.
create or replace function web_staff_login(p_username text, p_pin text)
returns table (ok boolean, reason text, id uuid, name text, role text, branch_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare s staff%rowtype;
begin
  select * into s from staff where lower(staff.username) = lower(trim(p_username));
  if not found then return query select false, 'not_found', null::uuid, null::text, null::text, null::uuid; return; end if;
  if not s.is_active then return query select false, 'disabled', null::uuid, null::text, null::text, null::uuid; return; end if;
  if s.web_locked_until is not null and s.web_locked_until > now() then
    return query select false, 'locked', null::uuid, null::text, null::text, null::uuid; return;
  end if;
  if s.pin is not null and s.pin = crypt(coalesce(p_pin, ''), s.pin) then
    update staff set web_failed_attempts = 0, web_locked_until = null where staff.id = s.id;
    return query select true, null::text, s.id, s.name, s.role, s.branch_id;
  else
    update staff set
      web_failed_attempts = case when web_failed_attempts + 1 >= 5 then 0 else web_failed_attempts + 1 end,
      web_locked_until    = case when web_failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
    where staff.id = s.id;
    return query select false, 'wrong_pin', null::uuid, null::text, null::text, null::uuid;
  end if;
end $$;

-- Customer username + password check. Returns the customer id, or null.
create or replace function web_customer_login(p_username text, p_password text)
returns uuid language sql security definer set search_path = public, extensions as $$
  select c.id from customers c
  where lower(c.username) = lower(trim(p_username))
    and c.password is not null and c.password <> ''
    and c.password = crypt(coalesce(p_password, ''), c.password)
  limit 1
$$;

revoke all on function web_staff_login(text, text)      from public, anon, authenticated;
revoke all on function web_customer_login(text, text)   from public, anon, authenticated;
grant execute on function web_staff_login(text, text)    to service_role;
grant execute on function web_customer_login(text, text) to service_role;

-- ── 5. One-time sign-in codes sent by SMS (server only) ─────────
create table if not exists web_login_codes (
  phone       text primary key,
  code_hash   text not null,
  name        text,                    -- set when the code is for a new account
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  sent_at     timestamptz not null default now()
);
alter table web_login_codes enable row level security;
revoke all on web_login_codes from anon, authenticated;

-- ── Deploy order ────────────────────────────────────────────────
-- 1. Merge the website code (the version that signs in through /api/*) and
--    wait for Vercel to finish deploying.
-- 2. Run this file.
-- Between 1 and 2 the old open access still works, so nothing breaks; after 2
-- the old website code (if still cached in someone's browser) can no longer
-- read private data — which is the point.
