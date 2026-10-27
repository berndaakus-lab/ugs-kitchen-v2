-- ═══════════════════════════════════════════════════════════════
-- POS Module 1 — Walk-in sales
-- Additive only: creates pos_* tables, functions and the sales_unified
-- view. Does NOT alter any table used by the online ordering app.
-- Safe to re-run.
--
-- Security model: RLS is enabled on every pos_* table with NO policies,
-- and anon/authenticated have no grants. Only the POS app's API routes
-- (service role) can read or write. Functions are service-role only.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── POS STAFF (credentials + POS role, linked to online staff) ───
create table if not exists pos_staff (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null unique references staff(id) on delete cascade,
  pin_hash        text not null,
  pos_role        text not null check (pos_role in ('cashier','server','manager')),
  branch_id       uuid not null references branches(id) on delete cascade,
  is_active       boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz default now()
);

-- Admin (owner) = POS user not tied to one branch: switches between branches,
-- sets up staff at any branch and sees sales across all of them.
alter table pos_staff drop constraint if exists pos_staff_pos_role_check;
alter table pos_staff add constraint pos_staff_pos_role_check
  check (pos_role in ('cashier','server','manager','admin'));
alter table pos_staff alter column branch_id drop not null;
alter table pos_staff drop constraint if exists pos_staff_branch_required;
alter table pos_staff add constraint pos_staff_branch_required
  check (pos_role = 'admin' or branch_id is not null);

-- ─── SHIFTS ───────────────────────────────────────────────────
create table if not exists pos_shifts (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id),
  staff_id       uuid not null references pos_staff(id),
  opened_at      timestamptz not null default now(),
  opening_float  numeric(10,2) not null default 0 check (opening_float >= 0),
  closed_at      timestamptz,
  expected_cash  numeric(10,2),
  counted_cash   numeric(10,2),
  variance       numeric(10,2),
  notes          text
);
-- one open shift per staff member
create unique index if not exists pos_shifts_one_open
  on pos_shifts (staff_id) where closed_at is null;

-- ─── DAILY TICKET COUNTERS ────────────────────────────────────
create table if not exists pos_ticket_counters (
  branch_id     uuid not null references branches(id) on delete cascade,
  business_date date not null,
  last_no       int  not null default 0,
  primary key (branch_id, business_date)
);

-- ─── SALES ────────────────────────────────────────────────────
create table if not exists pos_sales (
  id             uuid primary key default gen_random_uuid(),
  client_ref     uuid not null unique,            -- idempotency key from the device
  branch_id      uuid not null references branches(id),
  shift_id       uuid not null references pos_shifts(id),
  business_date  date not null default current_date,
  ticket_no      text not null,                   -- e.g. W-042, resets daily per branch
  status         text not null default 'paid'
                   check (status in ('pending_payment','paid','partially_served','served','voided','failed')),
  subtotal       numeric(10,2) not null,
  discount       numeric(10,2) not null default 0,
  total          numeric(10,2) not null,
  cashier_id     uuid not null references pos_staff(id),
  served_by_id   uuid references pos_staff(id),
  served_at      timestamptz,
  voided_by_id   uuid references pos_staff(id),
  voided_at      timestamptz,
  void_reason    text,
  created_at     timestamptz not null default now(),
  unique (branch_id, business_date, ticket_no)
);
create index if not exists pos_sales_branch_day on pos_sales (branch_id, business_date, status);
create index if not exists pos_sales_shift on pos_sales (shift_id);

create table if not exists pos_sale_items (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references pos_sales(id) on delete cascade,
  menu_item_id   uuid references menu_items(id) on delete set null,
  name_snapshot  text not null,
  unit_price     numeric(10,2) not null,
  qty            int not null check (qty > 0),
  qty_served     int not null default 0,
  check (qty_served between 0 and qty)
);
create index if not exists pos_sale_items_sale on pos_sale_items (sale_id);

create table if not exists pos_payments (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references pos_sales(id) on delete cascade,
  method        text not null check (method in ('cash','momo_paystack','momo_manual','card')),
  amount        numeric(10,2) not null check (amount > 0),  -- portion of the sale total
  tendered      numeric(10,2),                               -- cash handed over
  change_given  numeric(10,2),
  reference     text,
  channel       text,
  status        text not null default 'success' check (status in ('pending','success','failed')),
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);
create index if not exists pos_payments_sale on pos_payments (sale_id);
create index if not exists pos_payments_reference on pos_payments (reference);

-- every serve action (supports partial serving; the server's evidence trail)
create table if not exists pos_serve_events (
  id        uuid primary key default gen_random_uuid(),
  sale_id   uuid not null references pos_sales(id) on delete cascade,
  staff_id  uuid not null references pos_staff(id),
  items     jsonb not null,               -- [{item_id, name, qty}]
  at        timestamptz not null default now()
);
create index if not exists pos_serve_events_staff on pos_serve_events (staff_id, at);

create table if not exists pos_audit_log (
  id        uuid primary key default gen_random_uuid(),
  actor_id  uuid references pos_staff(id),
  action    text not null,                -- void | reprint_ticket | reprint_receipt | staff_update
  sale_id   uuid references pos_sales(id) on delete set null,
  meta      jsonb not null default '{}',
  at        timestamptz not null default now()
);

-- ─── LOCK DOWN ────────────────────────────────────────────────
alter table pos_staff           enable row level security;
alter table pos_shifts          enable row level security;
alter table pos_ticket_counters enable row level security;
alter table pos_sales           enable row level security;
alter table pos_sale_items      enable row level security;
alter table pos_payments        enable row level security;
alter table pos_serve_events    enable row level security;
alter table pos_audit_log       enable row level security;

revoke all on pos_staff, pos_shifts, pos_ticket_counters, pos_sales, pos_sale_items,
              pos_payments, pos_serve_events, pos_audit_log
  from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Create or update a POS login for an existing online staff member.
-- p_pin may be null when updating (keeps the existing PIN).
create or replace function pos_set_staff(p_staff_id uuid, p_pin text, p_role text, p_branch uuid, p_active boolean default true)
returns uuid language plpgsql set search_path = public, extensions as $$
declare v_id uuid;
begin
  if p_pin is not null and p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4-6 digits';
  end if;
  if p_pin is null and not exists (select 1 from pos_staff where staff_id = p_staff_id) then
    raise exception 'PIN required for new POS user';
  end if;

  insert into pos_staff (staff_id, pin_hash, pos_role, branch_id, is_active)
  values (p_staff_id, crypt(coalesce(p_pin, gen_random_uuid()::text), gen_salt('bf')), p_role, p_branch, p_active)
  on conflict (staff_id) do update set
    pin_hash        = case when p_pin is null then pos_staff.pin_hash else excluded.pin_hash end,
    pos_role        = excluded.pos_role,
    branch_id       = excluded.branch_id,
    is_active       = excluded.is_active,
    failed_attempts = 0,
    locked_until    = null
  returning id into v_id;
  return v_id;
end $$;

-- Verify username + PIN. Locks the account for 10 minutes after 5 failures.
-- (pos_005 replaces this with a version that also returns all roles; if you
-- re-run this file, re-run pos_005 after it.)
drop function if exists pos_verify_pin(text, text);
create function pos_verify_pin(p_username text, p_pin text)
returns table (pos_staff_id uuid, staff_id uuid, name text, pos_role text, branch_id uuid, locked boolean)
language plpgsql set search_path = public, extensions as $$
declare r record;
begin
  select ps.*, s.name as staff_name into r
  from pos_staff ps join staff s on s.id = ps.staff_id
  where lower(s.username) = lower(trim(p_username)) and ps.is_active and s.is_active;

  if not found then return; end if;

  if r.locked_until is not null and r.locked_until > now() then
    return query select null::uuid, null::uuid, null::text, null::text, null::uuid, true;
    return;
  end if;

  if r.pin_hash = crypt(p_pin, r.pin_hash) then
    update pos_staff set failed_attempts = 0, locked_until = null where id = r.id;
    return query select r.id, r.staff_id, r.staff_name, r.pos_role, r.branch_id, false;
  else
    update pos_staff set
      failed_attempts = failed_attempts + 1,
      locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
    where id = r.id;
  end if;
end $$;

-- Returns the id of an active manager at the branch (or any admin) whose PIN matches, else null.
create or replace function pos_verify_manager_pin(p_branch uuid, p_pin text)
returns uuid language sql stable set search_path = public, extensions as $$
  select ps.id from pos_staff ps join staff s on s.id = ps.staff_id
  where ((ps.pos_role = 'manager' and ps.branch_id = p_branch) or ps.pos_role = 'admin')
    and ps.is_active and s.is_active
    and (ps.locked_until is null or ps.locked_until < now())
    and ps.pin_hash = crypt(p_pin, ps.pin_hash)
  limit 1
$$;

-- Atomic daily ticket number per branch: W-001, W-002, ...
create or replace function pos_next_ticket_no(p_branch uuid, p_date date)
returns text language plpgsql as $$
declare n int;
begin
  insert into pos_ticket_counters (branch_id, business_date, last_no)
  values (p_branch, p_date, 1)
  on conflict (branch_id, business_date) do update set last_no = pos_ticket_counters.last_no + 1
  returning last_no into n;
  return 'W-' || lpad(n::text, 3, '0');
end $$;

-- Create a sale atomically. Prices come from menu_items, never from the client.
--   p_items    [{menu_item_id, qty}]
--   p_payments [{method, amount, tendered, reference}]   (ignored for pending_payment)
--   p_status   'paid' (cash / manual momo / card) or 'pending_payment' (Paystack prompt)
-- Idempotent on p_client_ref: a retry returns the existing sale id.
create or replace function pos_create_sale(
  p_branch uuid, p_cashier uuid, p_client_ref uuid,
  p_items jsonb, p_payments jsonb, p_status text default 'paid'
) returns uuid language plpgsql as $$
declare
  v_existing uuid;
  v_shift    uuid;
  v_sale     uuid;
  v_req      jsonb;
  v_subtotal numeric(10,2);
  v_paid     numeric(10,2);
  v_count    int;
  v_valid    int;
  p          jsonb;
begin
  select id into v_existing from pos_sales where client_ref = p_client_ref;
  if found then return v_existing; end if;

  if p_status not in ('paid','pending_payment') then
    raise exception 'Invalid sale status';
  end if;

  select id into v_shift from pos_shifts
  where staff_id = p_cashier and branch_id = p_branch and closed_at is null;
  if not found then raise exception 'NO_OPEN_SHIFT'; end if;

  -- aggregate requested quantities by menu item
  select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', t.menu_item_id, 'qty', t.qty)), '[]') into v_req
  from (
    select (x->>'menu_item_id')::uuid as menu_item_id, sum((x->>'qty')::int) as qty
    from jsonb_array_elements(coalesce(p_items, '[]')) x
    group by 1
  ) t;

  select count(*) into v_count from jsonb_to_recordset(v_req) as r(menu_item_id uuid, qty int);
  if v_count = 0 then raise exception 'Cart is empty'; end if;
  if exists (select 1 from jsonb_to_recordset(v_req) as r(menu_item_id uuid, qty int) where r.qty is null or r.qty <= 0) then
    raise exception 'Invalid quantity';
  end if;

  select count(*), sum(m.price * r.qty) into v_valid, v_subtotal
  from jsonb_to_recordset(v_req) as r(menu_item_id uuid, qty int)
  join menu_items m on m.id = r.menu_item_id
  where m.branch_id = p_branch and m.is_available;
  if v_valid <> v_count then raise exception 'ITEM_UNAVAILABLE'; end if;

  if p_status = 'paid' then
    select coalesce(sum((x->>'amount')::numeric), 0) into v_paid from jsonb_array_elements(p_payments) x;
    if v_paid <> v_subtotal then raise exception 'PAYMENT_MISMATCH'; end if;
  end if;

  begin
    insert into pos_sales (client_ref, branch_id, shift_id, business_date, ticket_no, status, subtotal, total, cashier_id)
    values (p_client_ref, p_branch, v_shift, current_date,
            pos_next_ticket_no(p_branch, current_date), p_status, v_subtotal, v_subtotal, p_cashier)
    returning id into v_sale;
  exception when unique_violation then
    -- concurrent retry with the same client_ref won the race
    select id into v_existing from pos_sales where client_ref = p_client_ref;
    if found then return v_existing; end if;
    raise;
  end;

  insert into pos_sale_items (sale_id, menu_item_id, name_snapshot, unit_price, qty)
  select v_sale, m.id, m.name, m.price, r.qty
  from jsonb_to_recordset(v_req) as r(menu_item_id uuid, qty int)
  join menu_items m on m.id = r.menu_item_id;

  if p_status = 'paid' then
    for p in select * from jsonb_array_elements(p_payments) loop
      if (p->>'method') = 'cash' and coalesce((p->>'tendered')::numeric, 0) < (p->>'amount')::numeric then
        raise exception 'Cash tendered is less than amount';
      end if;
      insert into pos_payments (sale_id, method, amount, tendered, change_given, reference, status, confirmed_at)
      values (
        v_sale, p->>'method', (p->>'amount')::numeric,
        (p->>'tendered')::numeric,
        case when p->>'method' = 'cash' then (p->>'tendered')::numeric - (p->>'amount')::numeric end,
        nullif(trim(p->>'reference'), ''), 'success', now()
      );
    end loop;
  else
    insert into pos_payments (sale_id, method, amount, status)
    values (v_sale, 'momo_paystack', v_subtotal, 'pending');
  end if;

  return v_sale;
end $$;

-- Confirm a pending Paystack payment. Returns true if this call flipped it to paid.
create or replace function pos_confirm_payment(p_sale uuid, p_reference text, p_channel text)
returns boolean language plpgsql as $$
begin
  update pos_payments set status = 'success', channel = p_channel, confirmed_at = now()
  where sale_id = p_sale and reference = p_reference and status = 'pending';
  if not found then return false; end if;

  update pos_sales set status = 'paid' where id = p_sale and status = 'pending_payment';
  return true;
end $$;

-- Serve items on a sale. p_items null = serve everything remaining.
--   p_items [{item_id, qty}]  (item_id = pos_sale_items.id)
-- Returns the sale's new status.
create or replace function pos_serve(p_sale uuid, p_staff uuid, p_branch uuid, p_items jsonb default null)
returns text language plpgsql as $$
declare
  v_status text;
  v_log    jsonb := '[]';
  r        record;
  v_qty    int;
begin
  select status into v_status from pos_sales where id = p_sale and branch_id = p_branch for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if v_status = 'served'  then raise exception 'ALREADY_SERVED'; end if;
  if v_status = 'voided'  then raise exception 'SALE_VOIDED'; end if;
  if v_status not in ('paid','partially_served') then raise exception 'NOT_PAID'; end if;

  for r in select * from pos_sale_items where sale_id = p_sale for update loop
    if p_items is null then
      v_qty := r.qty - r.qty_served;
    else
      select coalesce(sum((x->>'qty')::int), 0) into v_qty
      from jsonb_array_elements(p_items) x where (x->>'item_id')::uuid = r.id;
    end if;

    continue when v_qty = 0;
    if v_qty < 0 or r.qty_served + v_qty > r.qty then
      raise exception 'OVER_SERVE: %', r.name_snapshot;
    end if;

    update pos_sale_items set qty_served = qty_served + v_qty where id = r.id;
    v_log := v_log || jsonb_build_object('item_id', r.id, 'name', r.name_snapshot, 'qty', v_qty);
  end loop;

  if jsonb_array_length(v_log) = 0 then raise exception 'NOTHING_TO_SERVE'; end if;

  insert into pos_serve_events (sale_id, staff_id, items) values (p_sale, p_staff, v_log);

  if exists (select 1 from pos_sale_items where sale_id = p_sale and qty_served < qty) then
    update pos_sales set status = 'partially_served' where id = p_sale;
    return 'partially_served';
  end if;

  update pos_sales set status = 'served', served_by_id = p_staff, served_at = now() where id = p_sale;
  return 'served';
end $$;

-- Void a sale. Only allowed before any food has been served.
create or replace function pos_void(p_sale uuid, p_branch uuid, p_manager uuid, p_requested_by uuid, p_reason text)
returns void language plpgsql as $$
declare v_status text;
begin
  select status into v_status from pos_sales where id = p_sale and branch_id = p_branch for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if v_status not in ('paid','pending_payment','failed') then raise exception 'CANNOT_VOID_%', upper(v_status); end if;
  if exists (select 1 from pos_sale_items where sale_id = p_sale and qty_served > 0) then
    raise exception 'CANNOT_VOID_SERVED';
  end if;

  update pos_sales set status = 'voided', voided_by_id = p_manager, voided_at = now(), void_reason = p_reason
  where id = p_sale;

  insert into pos_audit_log (actor_id, action, sale_id, meta)
  values (p_requested_by, 'void', p_sale, jsonb_build_object('approved_by', p_manager, 'reason', p_reason, 'previous_status', v_status));
end $$;

revoke execute on function
  pos_set_staff(uuid, text, text, uuid, boolean),
  pos_verify_pin(text, text),
  pos_verify_manager_pin(uuid, text),
  pos_next_ticket_no(uuid, date),
  pos_create_sale(uuid, uuid, uuid, jsonb, jsonb, text),
  pos_confirm_payment(uuid, text, text),
  pos_serve(uuid, uuid, uuid, jsonb),
  pos_void(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function
  pos_set_staff(uuid, text, text, uuid, boolean),
  pos_verify_pin(text, text),
  pos_verify_manager_pin(uuid, text),
  pos_next_ticket_no(uuid, date),
  pos_create_sale(uuid, uuid, uuid, jsonb, jsonb, text),
  pos_confirm_payment(uuid, text, text),
  pos_serve(uuid, uuid, uuid, jsonb),
  pos_void(uuid, uuid, uuid, uuid, text)
  to service_role;

-- ═══════════════════════════════════════════════════════════════
-- UNIFIED SALES VIEW (online + walk-in) — basis for reports and,
-- in later modules, inventory deduction. Items use the same shape
-- as orders.items: [{id, name, price, quantity}].
-- ═══════════════════════════════════════════════════════════════
create or replace view sales_unified with (security_invoker = true) as
  select
    'online'::text                       as channel,
    o.id::text                           as sale_ref,
    o.branch_id,
    coalesce(o.paid_at, o.created_at)    as sold_at,
    (coalesce(o.paid_at, o.created_at) at time zone 'UTC')::date as business_date,
    o.total_amount                       as total,
    o.status,
    o.items,
    o.customer_name                      as customer,
    o.payment_channel                    as payment,
    null::uuid                           as pos_sale_id
  from orders o
  where o.status in ('paid','preparing','ready','delivered')
union all
  select
    'walk_in'::text,
    s.ticket_no,
    s.branch_id,
    s.created_at,
    s.business_date,
    s.total,
    s.status,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', i.menu_item_id, 'name', i.name_snapshot,
                                          'price', i.unit_price, 'quantity', i.qty))
      from pos_sale_items i where i.sale_id = s.id
    ), '[]'::jsonb),
    'Walk-in'::text,
    (select string_agg(distinct p.method, '+') from pos_payments p
      where p.sale_id = s.id and p.status = 'success'),
    s.id
  from pos_sales s
  where s.status in ('paid','partially_served','served','voided');
-- voided walk-ins are kept so managers see them; filter by status for revenue.

revoke all on sales_unified from anon, authenticated;
grant select on sales_unified to service_role;

-- ─── BOOTSTRAP ────────────────────────────────────────────────
-- Create the owner's POS admin login once (they must exist in the online staff list):
--   select pos_set_staff('<staff.id>', '<4-6 digit PIN>', 'admin', null);
-- The admin then sets up managers, cashiers and servers for every branch from
-- the POS Staff screen. A branch added in the online admin is ready in the POS
-- as soon as it has a menu and staff.
