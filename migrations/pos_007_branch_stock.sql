-- ═══════════════════════════════════════════════════════════════
-- Module 2 — Central Kitchen & Branch Stock (run after pos_006). Safe to re-run.
--
-- • The central kitchen sends food to branches (dispatch); a branch's stock
--   goes up only when the branch confirms what actually arrived.
-- • Stock is counted in sellable units (plates, pieces, packs …). A stock
--   item can carry a batch conversion, e.g. "5 kg bag" = 25 plates.
-- • Each menu dish is linked to the stock it uses (Jollof = 1 plate of
--   jollof; Assorted Fried Rice = 1 plate fried rice + 1 chicken + 1 sausage).
--   Dishes with no link are untracked and behave exactly as before.
-- • Every walk-in sale (cash at payment, MoMo when confirmed) and every paid
--   online order takes the stock off; a void / cancelled order puts it back.
-- • Every change is a line in a ledger (inv_movements) with a unique key per
--   source, so a retry or a double "paid" can never deduct twice.
-- • Stock may go negative (two people buying the last plate at once); that
--   is shown, never hidden.
--
-- Changes to existing objects: pos_create_sale, pos_confirm_payment and
-- pos_void are re-created with the stock calls; the 'kitchen' POS role is
-- added; a trigger is added on the online `orders` table (no column changes).
-- ═══════════════════════════════════════════════════════════════

-- ─── LOCATIONS: the central kitchen + one per branch ───────────
create table if not exists inv_locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null check (kind in ('kitchen','branch')),
  branch_id  uuid unique references branches(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into inv_locations (name, kind, branch_id)
select name, 'branch', id from branches
on conflict (branch_id) do nothing;

insert into inv_locations (name, kind)
select 'Central Kitchen', 'kitchen'
where not exists (select 1 from inv_locations where kind = 'kitchen');

-- The stock location of a branch (created on first use, so a branch added in
-- the online admin later is ready automatically).
create or replace function inv_branch_location(p_branch uuid)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from inv_locations where branch_id = p_branch;
  if found then return v_id; end if;
  insert into inv_locations (name, kind, branch_id)
  select coalesce(name, 'Branch'), 'branch', p_branch from branches where id = p_branch
  on conflict (branch_id) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end $$;

-- ─── STOCK ITEMS, MENU LINKS, BALANCES, LEDGER ─────────────────
create table if not exists inv_stock_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        text not null default 'plate' check (unit in ('plate','piece','pack','portion','kg','litre','bottle')),
  batch_label text,                                     -- e.g. "5 kg bag of rice"
  batch_yield numeric(10,2) check (batch_yield > 0),    -- e.g. 25 (plates per batch)
  low_level   numeric(10,2) not null default 5 check (low_level >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists inv_stock_items_name on inv_stock_items (lower(name));

create table if not exists inv_menu_usage (
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id) on delete cascade,
  qty           numeric(10,2) not null default 1 check (qty > 0),
  primary key (menu_item_id, stock_item_id)
);

create table if not exists inv_balances (
  location_id   uuid not null references inv_locations(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id) on delete cascade,
  on_hand       numeric(12,2) not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (location_id, stock_item_id)
);

create table if not exists inv_movements (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references inv_locations(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id) on delete cascade,
  qty           numeric(12,2) not null,      -- + in, − out
  kind          text not null check (kind in ('receive','sale','sale_void','online_sale','online_cancel','count_adjust','waste','manual')),
  source_type   text not null,               -- dispatch | pos_sale | order | count | adjust
  source_id     text not null,
  staff_id      uuid references pos_staff(id) on delete set null,
  note          text,
  at            timestamptz not null default now(),
  unique (kind, source_type, source_id, stock_item_id, location_id)
);
create index if not exists inv_movements_loc_at on inv_movements (location_id, at);

-- ─── KITCHEN → BRANCH DELIVERIES ───────────────────────────────
create table if not exists inv_dispatches (
  id            uuid primary key default gen_random_uuid(),
  from_location uuid not null references inv_locations(id),
  to_location   uuid not null references inv_locations(id),
  status        text not null default 'sent' check (status in ('sent','received','received_short')),
  note          text,
  sent_by       uuid references pos_staff(id) on delete set null,
  sent_at       timestamptz not null default now(),
  received_by   uuid references pos_staff(id) on delete set null,
  received_at   timestamptz
);
create index if not exists inv_dispatches_to on inv_dispatches (to_location, status, sent_at);

create table if not exists inv_dispatch_lines (
  id            uuid primary key default gen_random_uuid(),
  dispatch_id   uuid not null references inv_dispatches(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id),
  qty_sent      numeric(12,2) not null check (qty_sent > 0),
  qty_received  numeric(12,2) check (qty_received >= 0)
);

-- ─── CLOSING COUNTS ────────────────────────────────────────────
create table if not exists inv_counts (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references inv_locations(id) on delete cascade,
  counted_by  uuid references pos_staff(id) on delete set null,
  note        text,
  at          timestamptz not null default now()
);
create table if not exists inv_count_lines (
  count_id      uuid not null references inv_counts(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id),
  expected      numeric(12,2) not null,
  counted       numeric(12,2) not null check (counted >= 0),
  variance      numeric(12,2) not null,
  primary key (count_id, stock_item_id)
);

-- ─── LOCK DOWN ────────────────────────────────────────────────
alter table inv_locations      enable row level security;
alter table inv_stock_items    enable row level security;
alter table inv_menu_usage     enable row level security;
alter table inv_balances       enable row level security;
alter table inv_movements      enable row level security;
alter table inv_dispatches     enable row level security;
alter table inv_dispatch_lines enable row level security;
alter table inv_counts         enable row level security;
alter table inv_count_lines    enable row level security;
revoke all on inv_locations, inv_stock_items, inv_menu_usage, inv_balances, inv_movements,
              inv_dispatches, inv_dispatch_lines, inv_counts, inv_count_lines
  from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- CORE: one ledger line + balance, exactly once per source
-- ═══════════════════════════════════════════════════════════════
create or replace function inv_move(p_location uuid, p_item uuid, p_qty numeric, p_kind text,
                                    p_source_type text, p_source_id text, p_staff uuid, p_note text default null)
returns boolean language plpgsql as $$
declare v_id uuid;
begin
  if p_qty = 0 then return false; end if;
  insert into inv_movements (location_id, stock_item_id, qty, kind, source_type, source_id, staff_id, note)
  values (p_location, p_item, p_qty, p_kind, p_source_type, p_source_id, p_staff, p_note)
  on conflict (kind, source_type, source_id, stock_item_id, location_id) do nothing
  returning id into v_id;
  if v_id is null then return false; end if;   -- already applied

  insert into inv_balances (location_id, stock_item_id, on_hand)
  values (p_location, p_item, p_qty)
  on conflict (location_id, stock_item_id)
    do update set on_hand = inv_balances.on_hand + excluded.on_hand, updated_at = now();
  return true;
end $$;

-- Stock needed for a list of dishes: [{menu_item_id, qty}] → one row per stock item.
create or replace function inv_needs(p_items jsonb)
returns table (stock_item_id uuid, qty numeric) language sql stable as $$
  select u.stock_item_id, sum(u.qty * (x->>'qty')::numeric)
  from jsonb_array_elements(coalesce(p_items, '[]')) x
  join inv_menu_usage u on u.menu_item_id = (x->>'menu_item_id')::uuid
  where (x->>'menu_item_id') ~ '^[0-9a-fA-F-]{36}$'
  group by u.stock_item_id
$$;

-- How many of a dish can still be sold at a location; null = not tracked.
create or replace function inv_dish_left(p_menu_item uuid, p_location uuid)
returns numeric language sql stable as $$
  select case when count(*) = 0 then null
              else greatest(0, min(floor(coalesce(b.on_hand, 0) / u.qty))) end
  from inv_menu_usage u
  left join inv_balances b on b.stock_item_id = u.stock_item_id and b.location_id = p_location
  where u.menu_item_id = p_menu_item
$$;

-- For the POS and the website: what's left of each tracked dish at a branch.
-- `low` = at or below the warning level of the item that runs out first.
create or replace function menu_stock(p_branch uuid)
returns table (menu_item_id uuid, "left" integer, low boolean)
language sql stable security definer set search_path = public as $$
  with loc as (select id from inv_locations where branch_id = p_branch),
  per_dish as (
    select m.id as menu_item_id,
           greatest(0, min(floor(coalesce(b.on_hand, 0) / u.qty)))::int as left_qty,
           max(s.low_level) as low_level
    from menu_items m
    join inv_menu_usage u on u.menu_item_id = m.id
    join inv_stock_items s on s.id = u.stock_item_id
    left join inv_balances b on b.stock_item_id = u.stock_item_id and b.location_id = (select id from loc)
    where m.branch_id = p_branch
    group by m.id
  )
  select menu_item_id, left_qty, (left_qty > 0 and left_qty <= low_level) from per_dish
$$;

-- Refuse a cart that needs more than a branch has (tracked dishes only).
-- Returns null when fine, else a message naming the first dish short.
create or replace function inv_cart_problem(p_branch uuid, p_items jsonb)
returns text language plpgsql stable as $$
declare
  v_loc uuid := (select id from inv_locations where branch_id = p_branch);
  r record;
begin
  for r in
    select n.stock_item_id, n.qty, coalesce(b.on_hand, 0) as on_hand
    from inv_needs(p_items) n
    left join inv_balances b on b.stock_item_id = n.stock_item_id and b.location_id = v_loc
  loop
    if r.qty > r.on_hand then
      return (
        select 'OUT_OF_STOCK:' || m.name || ':' || coalesce(inv_dish_left(m.id, v_loc), 0)::int
        from jsonb_array_elements(p_items) x
        join menu_items m on m.id = (x->>'menu_item_id')::uuid
        join inv_menu_usage u on u.menu_item_id = m.id and u.stock_item_id = r.stock_item_id
        limit 1);
    end if;
  end loop;
  return null;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- WALK-IN SALES
-- ═══════════════════════════════════════════════════════════════
create or replace function inv_apply_sale(p_sale uuid)
returns void language plpgsql as $$
declare v_loc uuid; v_items jsonb; r record;
begin
  select inv_branch_location(branch_id) into v_loc from pos_sales where id = p_sale;
  select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', menu_item_id, 'qty', qty)), '[]')
    into v_items from pos_sale_items where sale_id = p_sale and menu_item_id is not null;
  for r in select * from inv_needs(v_items) loop
    perform inv_move(v_loc, r.stock_item_id, -r.qty, 'sale', 'pos_sale', p_sale::text, null);
  end loop;
end $$;

create or replace function inv_reverse_sale(p_sale uuid)
returns void language plpgsql as $$
declare r record;
begin
  -- put back exactly what this sale took
  for r in select location_id, stock_item_id, qty from inv_movements
           where kind = 'sale' and source_type = 'pos_sale' and source_id = p_sale::text loop
    perform inv_move(r.location_id, r.stock_item_id, -r.qty, 'sale_void', 'pos_sale', p_sale::text, null);
  end loop;
end $$;

-- pos_006's pos_create_sale + stock: sold-out check before selling, and the
-- deduction for a cash sale. (A MoMo sale is checked here and deducted when
-- the money arrives, in pos_confirm_payment.)
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
  v_problem  text;
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

  -- Sold out? Lock this branch's balances so two tills can't both sell the last plate.
  perform 1 from inv_balances b
  where b.location_id = (select id from inv_locations where branch_id = p_branch)
    and b.stock_item_id in (select stock_item_id from inv_needs(v_req))
  for update;
  v_problem := inv_cart_problem(p_branch, v_req);
  if v_problem is not null then raise exception '%', v_problem; end if;

  if p_status = 'paid' then
    select coalesce(sum((x->>'amount')::numeric), 0) into v_paid from jsonb_array_elements(p_payments) x;
    if v_paid <> v_subtotal then raise exception 'PAYMENT_MISMATCH'; end if;
  end if;

  begin
    insert into pos_sales (client_ref, branch_id, shift_id, business_date, ticket_no, status, subtotal, total, cashier_id)
    values (p_client_ref, p_branch, v_shift, current_date,
            case when p_status = 'paid'
                 then pos_next_ticket_no(p_branch, current_date)
                 else 'PENDING-' || substr(md5(p_client_ref::text), 1, 8) end,
            p_status, v_subtotal, v_subtotal, p_cashier)
    returning id into v_sale;
  exception when unique_violation then
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
    perform inv_apply_sale(v_sale);
  else
    insert into pos_payments (sale_id, method, amount, status)
    values (v_sale, 'momo_paystack', v_subtotal, 'pending');
  end if;

  return v_sale;
end $$;

-- pos_006's pos_confirm_payment + stock deduction when the MoMo money arrives.
create or replace function pos_confirm_payment(p_sale uuid, p_reference text, p_channel text)
returns boolean language plpgsql as $$
declare v_branch uuid;
begin
  update pos_payments set status = 'success', channel = p_channel, confirmed_at = now()
  where sale_id = p_sale and reference = p_reference and status = 'pending';
  if not found then return false; end if;

  select branch_id into v_branch from pos_sales where id = p_sale;
  update pos_sales
  set status        = 'paid',
      ticket_no     = pos_next_ticket_no(v_branch, current_date),
      business_date = current_date
  where id = p_sale and status = 'pending_payment';
  perform inv_apply_sale(p_sale);   -- money is in: always deduct, even past zero
  return true;
end $$;

-- pos_001's pos_void + putting the stock back for a paid sale.
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
  perform inv_reverse_sale(p_sale);

  insert into pos_audit_log (actor_id, action, sale_id, meta)
  values (p_requested_by, 'void', p_sale, jsonb_build_object('approved_by', p_manager, 'reason', p_reason, 'previous_status', v_status));
end $$;

-- ═══════════════════════════════════════════════════════════════
-- ONLINE ORDERS: deduct when an order becomes paid, restore if cancelled.
-- orders.items holds the menu rows: {id (menu_items.id), quantity, …}.
-- ═══════════════════════════════════════════════════════════════
create or replace function inv_orders_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_loc uuid; v_items jsonb; r record;
begin
  if new.branch_id is null then return new; end if;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    v_loc := inv_branch_location(new.branch_id);
    select coalesce(jsonb_agg(jsonb_build_object('menu_item_id', x->>'id', 'qty', coalesce((x->>'quantity')::numeric, 1))), '[]')
      into v_items from jsonb_array_elements(coalesce(new.items, '[]')) x
      where (x->>'id') ~ '^[0-9a-fA-F-]{36}$';
    for r in select * from inv_needs(v_items) loop
      perform inv_move(v_loc, r.stock_item_id, -r.qty, 'online_sale', 'order', new.id::text, null);
    end loop;

  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    for r in select location_id, stock_item_id, qty from inv_movements
             where kind = 'online_sale' and source_type = 'order' and source_id = new.id::text loop
      perform inv_move(r.location_id, r.stock_item_id, -r.qty, 'online_cancel', 'order', new.id::text, null);
    end loop;
  end if;
  return new;
exception when others then
  -- Stock must never block an online payment from being recorded.
  raise warning 'inv_orders_trigger: %', sqlerrm;
  return new;
end $$;

drop trigger if exists inv_orders_stock on orders;
create trigger inv_orders_stock
  after update of status on orders
  for each row execute function inv_orders_trigger();

-- ═══════════════════════════════════════════════════════════════
-- KITCHEN, RECEIVING, COUNTS, ADJUSTMENTS
-- ═══════════════════════════════════════════════════════════════
-- Send food from the central kitchen to a branch. p_lines: [{stock_item_id, qty}]
create or replace function inv_send_dispatch(p_to_branch uuid, p_lines jsonb, p_staff uuid, p_note text default null)
returns uuid language plpgsql as $$
declare v_id uuid; v_count int;
begin
  select count(*) into v_count from jsonb_array_elements(coalesce(p_lines, '[]')) x where (x->>'qty')::numeric > 0;
  if v_count = 0 then raise exception 'NOTHING_TO_SEND'; end if;

  insert into inv_dispatches (from_location, to_location, sent_by, note)
  values ((select id from inv_locations where kind = 'kitchen' order by created_at limit 1),
          inv_branch_location(p_to_branch), p_staff, nullif(trim(p_note), ''))
  returning id into v_id;

  insert into inv_dispatch_lines (dispatch_id, stock_item_id, qty_sent)
  select v_id, (x->>'stock_item_id')::uuid, sum((x->>'qty')::numeric)
  from jsonb_array_elements(p_lines) x
  where (x->>'qty')::numeric > 0
  group by 2;
  return v_id;
end $$;

-- A branch confirms what arrived. p_lines: [{line_id, qty_received}] (missing = as sent).
-- Returns 'received' or 'received_short'.
create or replace function inv_receive_dispatch(p_dispatch uuid, p_branch uuid, p_lines jsonb, p_staff uuid)
returns text language plpgsql as $$
declare v_loc uuid := inv_branch_location(p_branch); v_status text; v_short boolean; l record; v_got numeric;
begin
  select status into v_status from inv_dispatches where id = p_dispatch and to_location = v_loc for update;
  if not found then raise exception 'DISPATCH_NOT_FOUND'; end if;
  if v_status <> 'sent' then raise exception 'ALREADY_RECEIVED'; end if;

  for l in select * from inv_dispatch_lines where dispatch_id = p_dispatch loop
    select coalesce(max((x->>'qty_received')::numeric), l.qty_sent) into v_got
    from jsonb_array_elements(coalesce(p_lines, '[]')) x where (x->>'line_id')::uuid = l.id;
    if v_got < 0 then raise exception 'Invalid quantity'; end if;
    update inv_dispatch_lines set qty_received = v_got where id = l.id;
    perform inv_move(v_loc, l.stock_item_id, v_got, 'receive', 'dispatch', p_dispatch::text, p_staff);
  end loop;

  select bool_or(qty_received < qty_sent) into v_short from inv_dispatch_lines where dispatch_id = p_dispatch;
  update inv_dispatches
  set status = case when v_short then 'received_short' else 'received' end, received_by = p_staff, received_at = now()
  where id = p_dispatch
  returning status into v_status;
  return v_status;
end $$;

-- Closing count: set each counted item to what's actually there; the
-- difference is recorded as a variance. Leftovers carry over to tomorrow.
-- p_lines: [{stock_item_id, counted}]
create or replace function inv_apply_count(p_branch uuid, p_lines jsonb, p_staff uuid, p_note text default null)
returns uuid language plpgsql as $$
declare v_loc uuid := inv_branch_location(p_branch); v_id uuid; x jsonb; v_exp numeric; v_cnt numeric; v_item uuid;
begin
  insert into inv_counts (location_id, counted_by, note) values (v_loc, p_staff, nullif(trim(p_note), ''))
  returning id into v_id;
  for x in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    v_item := (x->>'stock_item_id')::uuid;
    v_cnt  := (x->>'counted')::numeric;
    if v_cnt is null or v_cnt < 0 then raise exception 'Invalid count'; end if;
    select coalesce(on_hand, 0) into v_exp from inv_balances where location_id = v_loc and stock_item_id = v_item for update;
    v_exp := coalesce(v_exp, 0);
    insert into inv_count_lines (count_id, stock_item_id, expected, counted, variance)
    values (v_id, v_item, v_exp, v_cnt, v_cnt - v_exp);
    perform inv_move(v_loc, v_item, v_cnt - v_exp, 'count_adjust', 'count', v_id::text, p_staff, p_note);
  end loop;
  return v_id;
end $$;

-- Waste or a manual correction with a reason (manager).
create or replace function inv_adjust(p_branch uuid, p_item uuid, p_qty numeric, p_kind text, p_staff uuid, p_note text)
returns void language plpgsql as $$
begin
  if p_kind not in ('waste','manual') then raise exception 'Invalid adjustment'; end if;
  if p_kind = 'waste' and p_qty > 0 then p_qty := -p_qty; end if;
  if nullif(trim(p_note), '') is null then raise exception 'Give a reason'; end if;
  perform inv_move(inv_branch_location(p_branch), p_item, p_qty, p_kind, 'adjust', gen_random_uuid()::text, p_staff, p_note);
end $$;

-- Link every unlinked dish to a stock item of the same name (created if
-- needed, 1 per sale). p_branch null = all branches. Returns dishes linked.
create or replace function inv_auto_link(p_branch uuid default null)
returns integer language plpgsql as $$
declare m record; v_item uuid; n int := 0;
begin
  for m in select id, name from menu_items mi
           where (p_branch is null or mi.branch_id = p_branch)
             and not exists (select 1 from inv_menu_usage u where u.menu_item_id = mi.id) loop
    select id into v_item from inv_stock_items where lower(name) = lower(trim(m.name));
    if not found then
      insert into inv_stock_items (name, unit) values (trim(m.name), 'plate') returning id into v_item;
    end if;
    insert into inv_menu_usage (menu_item_id, stock_item_id, qty) values (m.id, v_item, 1) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- KITCHEN ROLE: standalone, not tied to a branch (the kitchen will move)
-- ═══════════════════════════════════════════════════════════════
alter table pos_staff drop constraint if exists pos_staff_roles_check;
alter table pos_staff add constraint pos_staff_roles_check check (
  cardinality(pos_roles) >= 1
  and pos_roles <@ array['cashier','server','manager','admin','kitchen']
  and pos_role = any (pos_roles)
);
alter table pos_staff drop constraint if exists pos_staff_pos_role_check;
alter table pos_staff add constraint pos_staff_pos_role_check
  check (pos_role in ('cashier','server','manager','admin','kitchen'));
alter table pos_staff drop constraint if exists pos_staff_branch_required;
alter table pos_staff add constraint pos_staff_branch_required
  check (pos_role in ('admin','kitchen') or branch_id is not null);

create or replace function pos_normalize_roles(p_roles text[])
returns text[] language sql immutable as $$
  select case
    when 'admin'   = any (p_roles) then array['admin']
    when 'manager' = any (p_roles) then array['manager']
    when 'kitchen' = any (p_roles) then array['kitchen']
    else array(select r from unnest(array['cashier','server']) r where r = any (p_roles))
  end
$$;

create or replace function pos_set_staff_roles(p_staff_id uuid, p_pin text, p_roles text[], p_branch uuid, p_active boolean default true)
returns uuid language plpgsql set search_path = public, extensions as $$
declare
  v_roles text[] := pos_normalize_roles(p_roles);
  v_id    uuid;
begin
  if cardinality(v_roles) = 0 then raise exception 'Choose at least one POS role'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4-6 digits'; end if;
  if p_pin is null and not exists (select 1 from pos_staff where staff_id = p_staff_id) then
    raise exception 'PIN required for new POS user';
  end if;

  insert into pos_staff (staff_id, pin_hash, pos_role, pos_roles, branch_id, is_active)
  values (p_staff_id, crypt(coalesce(p_pin, gen_random_uuid()::text), gen_salt('bf')),
          v_roles[1], v_roles, case when v_roles[1] in ('admin','kitchen') then null else p_branch end, p_active)
  on conflict (staff_id) do update set
    pin_hash        = case when p_pin is null then pos_staff.pin_hash else excluded.pin_hash end,
    pos_role        = excluded.pos_role,
    pos_roles       = excluded.pos_roles,
    branch_id       = excluded.branch_id,
    is_active       = excluded.is_active,
    failed_attempts = 0,
    locked_until    = null
  returning id into v_id;
  return v_id;
end $$;

-- ─── PERMISSIONS ──────────────────────────────────────────────
revoke execute on function
  inv_branch_location(uuid), inv_move(uuid, uuid, numeric, text, text, text, uuid, text),
  inv_needs(jsonb), inv_dish_left(uuid, uuid), inv_cart_problem(uuid, jsonb),
  inv_apply_sale(uuid), inv_reverse_sale(uuid),
  inv_send_dispatch(uuid, jsonb, uuid, text), inv_receive_dispatch(uuid, uuid, jsonb, uuid),
  inv_apply_count(uuid, jsonb, uuid, text), inv_adjust(uuid, uuid, numeric, text, uuid, text),
  inv_auto_link(uuid), inv_orders_trigger(),
  pos_create_sale(uuid, uuid, uuid, jsonb, jsonb, text), pos_confirm_payment(uuid, text, text),
  pos_void(uuid, uuid, uuid, uuid, text), pos_normalize_roles(text[]),
  pos_set_staff_roles(uuid, text, text[], uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  inv_branch_location(uuid), inv_move(uuid, uuid, numeric, text, text, text, uuid, text),
  inv_needs(jsonb), inv_dish_left(uuid, uuid), inv_cart_problem(uuid, jsonb),
  inv_apply_sale(uuid), inv_reverse_sale(uuid),
  inv_send_dispatch(uuid, jsonb, uuid, text), inv_receive_dispatch(uuid, uuid, jsonb, uuid),
  inv_apply_count(uuid, jsonb, uuid, text), inv_adjust(uuid, uuid, numeric, text, uuid, text),
  inv_auto_link(uuid),
  pos_create_sale(uuid, uuid, uuid, jsonb, jsonb, text), pos_confirm_payment(uuid, text, text),
  pos_void(uuid, uuid, uuid, uuid, text), pos_normalize_roles(text[]),
  pos_set_staff_roles(uuid, text, text[], uuid, boolean)
  to service_role;

-- The website may ask "how many left" — dish id, count and low flag only.
revoke execute on function menu_stock(uuid) from public;
grant execute on function menu_stock(uuid) to anon, authenticated, service_role;
