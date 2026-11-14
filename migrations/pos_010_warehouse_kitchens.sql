-- ═══════════════════════════════════════════════════════════════
-- POS Module 3 — warehouse, central kitchen, satellite kitchens,
-- purchases, recipes & production, food cost, low-stock alerts.
-- Run after pos_009. Safe to re-run.
--
-- DEPLOY ORDER: run this file FIRST, then merge the code. The current code
-- keeps working on it.
--
--   Warehouse ──raw──▶ Central kitchen ──prepared──▶ Satellite kitchens ──cooked──▶ Branches
--        └──────────────────raw──────────────────────────▲
--
-- • Every stock change still goes through inv_move() (one ledger line,
--   idempotent per source). Sending now takes stock off the sender;
--   receiving adds it at the receiver.
-- • The single Module 2 kitchen becomes the first satellite kitchen, and
--   every branch is supplied by it until reassigned.
-- ═══════════════════════════════════════════════════════════════

create table if not exists pos_applied (key text primary key, at timestamptz not null default now());
alter table pos_applied enable row level security;
revoke all on pos_applied from anon, authenticated;

-- ── Locations ──────────────────────────────────────────────────
alter table inv_locations add column if not exists supplied_by  uuid references inv_locations(id) on delete set null;
alter table inv_locations add column if not exists is_active    boolean not null default true;
alter table inv_locations add column if not exists alert_phones text[] not null default '{}';
alter table inv_locations add column if not exists sort         int not null default 100;

alter table inv_locations drop constraint if exists inv_locations_kind_check;
update inv_locations set kind = 'satellite',
       name = case when name = 'Central Kitchen' then 'Satellite kitchen' else name end
where kind = 'kitchen';
alter table inv_locations add constraint inv_locations_kind_check
  check (kind in ('warehouse', 'central', 'satellite', 'branch'));
alter table inv_locations drop constraint if exists inv_locations_supply_check;
alter table inv_locations add constraint inv_locations_supply_check
  check (supplied_by is null or kind = 'branch');

-- A satellite kitchen exists from Module 2; make sure there is one, plus the
-- warehouse and the central kitchen (renamable on the Locations screen).
insert into inv_locations (name, kind, sort)
select 'Satellite kitchen', 'satellite', 30 where not exists (select 1 from inv_locations where kind = 'satellite');
insert into inv_locations (name, kind, sort)
select 'Warehouse', 'warehouse', 10 where not exists (select 1 from inv_locations where kind = 'warehouse');
insert into inv_locations (name, kind, sort)
select 'Central kitchen', 'central', 20 where not exists (select 1 from inv_locations where kind = 'central');

update inv_locations b set supplied_by = (select id from inv_locations where kind = 'satellite' and is_active order by sort, created_at limit 1)
where b.kind = 'branch' and b.supplied_by is null;

-- A branch must be supplied by a satellite kitchen.
create or replace function inv_locations_check() returns trigger language plpgsql as $$
begin
  if new.supplied_by is not null and not exists (select 1 from inv_locations where id = new.supplied_by and kind = 'satellite') then
    raise exception 'SUPPLIER_NOT_SATELLITE';
  end if;
  return new;
end $$;
drop trigger if exists inv_locations_check on inv_locations;
create trigger inv_locations_check before insert or update of supplied_by, kind on inv_locations
  for each row execute function inv_locations_check();

-- A branch added later is supplied by the first satellite kitchen.
create or replace function inv_branch_location(p_branch uuid)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from inv_locations where branch_id = p_branch;
  if found then return v_id; end if;
  insert into inv_locations (name, kind, branch_id, supplied_by)
  select coalesce(name, 'Branch'), 'branch', p_branch,
         (select id from inv_locations where kind = 'satellite' and is_active order by sort, created_at limit 1)
  from branches where id = p_branch
  on conflict (branch_id) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end $$;

-- ── Staff tied to a kitchen or the warehouse ───────────────────
alter table pos_staff add column if not exists location_id uuid references inv_locations(id) on delete set null;
update pos_staff set location_id = (select id from inv_locations where kind = 'satellite' order by sort, created_at limit 1)
where location_id is null and 'kitchen' = any (pos_roles);

-- ── Roles ──────────────────────────────────────────────────────
alter table pos_role_defs drop constraint if exists pos_role_defs_scope_check;
alter table pos_role_defs add constraint pos_role_defs_scope_check check (scope in ('all', 'branch', 'kitchen', 'warehouse'));
insert into pos_role_defs (key, name, permissions, scope, runs_shift, can_assign, sort) values
  ('warehouse', 'Warehouse', '{purchases,stock_send,stock_receive,stock_count,activity}', 'warehouse', true, '{}', 5)
on conflict (key) do nothing;
-- New permissions for the starting roles, added once (owner edits afterwards are kept).
do $$
begin
  if not exists (select 1 from pos_applied where key = 'pos_010_role_perms') then
    update pos_role_defs set permissions = array(select distinct p from unnest(permissions || array['production','stock_receive','stock_count','recipes']) p order by p)
      where key = 'kitchen';
    update pos_role_defs set permissions = array(select distinct p from unnest(permissions || array['food_cost']) p order by p)
      where key = 'general_manager';
    insert into pos_applied (key) values ('pos_010_role_perms');
  end if;
end $$;

-- ── Items: type, cost, more units, per-location reorder levels ──
alter table inv_stock_items add column if not exists kind text not null default 'cooked';
alter table inv_stock_items drop constraint if exists inv_stock_items_kind_check;
alter table inv_stock_items add constraint inv_stock_items_kind_check check (kind in ('raw', 'prepared', 'cooked'));
alter table inv_stock_items add column if not exists unit_cost numeric(12,4) not null default 0;
alter table inv_stock_items drop constraint if exists inv_stock_items_unit_check;
alter table inv_stock_items add constraint inv_stock_items_unit_check
  check (unit in ('plate','piece','pack','portion','scoop','can','kg','litre','bottle','bag','crate','tin','cylinder'));

create table if not exists inv_levels (
  location_id   uuid not null references inv_locations(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id) on delete cascade,
  reorder_level numeric(12,2) not null check (reorder_level >= 0),
  primary key (location_id, stock_item_id)
);

-- ── Ledger kinds ───────────────────────────────────────────────
alter table inv_movements drop constraint if exists inv_movements_kind_check;
alter table inv_movements add constraint inv_movements_kind_check check (kind in (
  'receive','sale','sale_void','online_sale','online_cancel','count_adjust','waste','manual',
  'purchase','send','produce_use','produce_make'));

-- ── Alerts: one per crossing below the level ───────────────────
create table if not exists inv_alerts (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references inv_locations(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id) on delete cascade,
  level         numeric(12,2) not null,
  on_hand       numeric(12,2) not null,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  cleared_at    timestamptz
);
create unique index if not exists inv_alerts_open on inv_alerts (location_id, stock_item_id) where cleared_at is null;

create or replace function inv_level(p_location uuid, p_item uuid)
returns numeric language sql stable as $$
  select coalesce((select reorder_level from inv_levels where location_id = p_location and stock_item_id = p_item),
                  (select low_level from inv_stock_items where id = p_item), 0)
$$;

-- inv_move as in Module 2, plus: raise an alert when the balance drops to or
-- below its level (same rule as the Module 2 "low" badge), and clear it when
-- stock comes back above.
create or replace function inv_move(p_location uuid, p_item uuid, p_qty numeric, p_kind text,
                                    p_source_type text, p_source_id text, p_staff uuid, p_note text default null)
returns boolean language plpgsql as $$
declare v_id uuid; v_new numeric; v_level numeric;
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
    do update set on_hand = inv_balances.on_hand + excluded.on_hand, updated_at = now()
  returning on_hand into v_new;

  v_level := inv_level(p_location, p_item);
  if p_qty < 0 and v_new <= v_level and v_new - p_qty > v_level then
    insert into inv_alerts (location_id, stock_item_id, level, on_hand)
    values (p_location, p_item, v_level, v_new)
    on conflict (location_id, stock_item_id) where cleared_at is null do update set on_hand = excluded.on_hand;
  elsif p_qty > 0 and v_new > v_level then
    update inv_alerts set cleared_at = now() where location_id = p_location and stock_item_id = p_item and cleared_at is null;
  end if;
  return true;
end $$;

-- ── Suppliers & purchases (into the warehouse) ─────────────────
create table if not exists inv_suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists inv_suppliers_name on inv_suppliers (lower(name));

create table if not exists inv_purchases (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references inv_locations(id),
  supplier_id uuid references inv_suppliers(id) on delete set null,
  received_by uuid references pos_staff(id) on delete set null,
  note        text,
  total       numeric(12,2) not null default 0,
  at          timestamptz not null default now()
);
create table if not exists inv_purchase_lines (
  purchase_id   uuid not null references inv_purchases(id) on delete cascade,
  stock_item_id uuid not null references inv_stock_items(id),
  qty           numeric(12,2) not null check (qty > 0),
  unit_cost     numeric(12,4) not null check (unit_cost >= 0),
  primary key (purchase_id, stock_item_id)
);

-- p_lines: [{stock_item_id, qty, unit_cost}]. Stock goes up at the location;
-- each item's cost becomes the weighted average of what's held and what came in.
create or replace function inv_record_purchase(p_location uuid, p_supplier uuid, p_lines jsonb, p_staff uuid, p_note text default null)
returns uuid language plpgsql as $$
declare v_id uuid; v_line jsonb; v_item uuid; v_qty numeric; v_cost numeric; v_held numeric; v_total numeric := 0;
begin
  if not exists (select 1 from inv_locations where id = p_location and kind = 'warehouse' and is_active) then
    raise exception 'NOT_A_WAREHOUSE';
  end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p_lines, '[]')) x where (x->>'qty')::numeric > 0) then
    raise exception 'NOTHING_TO_SEND';
  end if;
  insert into inv_purchases (location_id, supplier_id, received_by, note)
  values (p_location, p_supplier, p_staff, nullif(trim(p_note), '')) returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'stock_item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    v_cost := coalesce((v_line->>'unit_cost')::numeric, 0);
    continue when v_qty is null or v_qty <= 0;
    if v_cost < 0 then raise exception 'Invalid cost'; end if;
    insert into inv_purchase_lines (purchase_id, stock_item_id, qty, unit_cost) values (v_id, v_item, v_qty, v_cost)
      on conflict (purchase_id, stock_item_id) do update
      set unit_cost = (inv_purchase_lines.unit_cost * inv_purchase_lines.qty + excluded.unit_cost * excluded.qty) / (inv_purchase_lines.qty + excluded.qty),
          qty = inv_purchase_lines.qty + excluded.qty;
    select greatest(coalesce(sum(on_hand), 0), 0) into v_held from inv_balances where stock_item_id = v_item;
    update inv_stock_items set unit_cost = case when v_held + v_qty > 0
      then (unit_cost * v_held + v_cost * v_qty) / (v_held + v_qty) else v_cost end
    where id = v_item;
    v_total := v_total + v_qty * v_cost;
  end loop;
  perform inv_move(p_location, l.stock_item_id, l.qty, 'purchase', 'purchase', v_id::text, p_staff)
    from inv_purchase_lines l where l.purchase_id = v_id;
  update inv_purchases set total = round(v_total, 2) where id = v_id;
  return v_id;
end $$;

-- ── Recipes & production ───────────────────────────────────────
create table if not exists inv_recipes (
  id            uuid primary key default gen_random_uuid(),
  output_item   uuid not null references inv_stock_items(id) on delete cascade,
  yield_qty     numeric(12,2) not null check (yield_qty > 0),   -- one batch makes this much of the output
  kitchen_kind  text not null default 'any' check (kitchen_kind in ('central', 'satellite', 'any')),
  note          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create table if not exists inv_recipe_lines (
  recipe_id  uuid not null references inv_recipes(id) on delete cascade,
  input_item uuid not null references inv_stock_items(id) on delete cascade,
  qty        numeric(12,3) not null check (qty > 0),               -- per batch
  primary key (recipe_id, input_item)
);
create table if not exists inv_productions (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references inv_locations(id),
  recipe_id   uuid references inv_recipes(id) on delete set null,
  output_item uuid not null references inv_stock_items(id),
  batches     numeric(12,2) not null check (batches > 0),
  output_qty  numeric(12,2) not null,
  made_by     uuid references pos_staff(id) on delete set null,
  note        text,
  at          timestamptz not null default now()
);

-- Cost of one unit of a recipe's output, from its inputs' current costs.
create or replace function inv_recipe_unit_cost(p_recipe uuid)
returns numeric language sql stable as $$
  select coalesce(sum(l.qty * i.unit_cost), 0) / r.yield_qty
  from inv_recipes r left join inv_recipe_lines l on l.recipe_id = r.id left join inv_stock_items i on i.id = l.input_item
  where r.id = p_recipe group by r.yield_qty
$$;

-- Record batches cooked at a kitchen: inputs out, output in, output cost updated.
create or replace function inv_record_production(p_location uuid, p_recipe uuid, p_batches numeric, p_staff uuid, p_note text default null)
returns uuid language plpgsql as $$
declare v_kind text; r inv_recipes%rowtype; v_id uuid; l record;
begin
  if p_batches is null or p_batches <= 0 then raise exception 'NOTHING_TO_SEND'; end if;
  select kind into v_kind from inv_locations where id = p_location and is_active;
  if v_kind is null or v_kind not in ('central', 'satellite') then raise exception 'NOT_A_KITCHEN'; end if;
  select * into r from inv_recipes where id = p_recipe and is_active;
  if not found then raise exception 'RECIPE_NOT_FOUND'; end if;
  if r.kitchen_kind <> 'any' and r.kitchen_kind <> v_kind then raise exception 'RECIPE_WRONG_KITCHEN'; end if;
  if not exists (select 1 from inv_recipe_lines where recipe_id = r.id) then raise exception 'RECIPE_EMPTY'; end if;

  insert into inv_productions (location_id, recipe_id, output_item, batches, output_qty, made_by, note)
  values (p_location, r.id, r.output_item, p_batches, round(r.yield_qty * p_batches, 2), p_staff, nullif(trim(p_note), ''))
  returning id into v_id;
  for l in select * from inv_recipe_lines where recipe_id = r.id loop
    perform inv_move(p_location, l.input_item, -round(l.qty * p_batches, 2), 'produce_use', 'production', v_id::text, p_staff);
  end loop;
  perform inv_move(p_location, r.output_item, round(r.yield_qty * p_batches, 2), 'produce_make', 'production', v_id::text, p_staff);
  update inv_stock_items set unit_cost = inv_recipe_unit_cost(r.id) where id = r.output_item;
  return v_id;
end $$;

-- ── Deliveries between any two allowed places ─────────────────
--   warehouse → central or satellite · central → satellite · satellite → its own branches
create or replace function inv_step_allowed(p_from uuid, p_to uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from inv_locations f, inv_locations t
    where f.id = p_from and t.id = p_to and f.is_active and t.is_active and f.id <> t.id and (
      (f.kind = 'warehouse' and t.kind in ('central', 'satellite')) or
      (f.kind = 'central'   and t.kind = 'satellite') or
      (f.kind = 'satellite' and t.kind = 'branch' and t.supplied_by = f.id)))
$$;

-- p_lines: [{stock_item_id, qty}]. Takes the stock off the sender now; the
-- receiver's stock goes up when they confirm.
create or replace function inv_send(p_from uuid, p_to uuid, p_lines jsonb, p_staff uuid, p_note text default null)
returns uuid language plpgsql as $$
declare v_id uuid; l record;
begin
  if not inv_step_allowed(p_from, p_to) then raise exception 'STEP_NOT_ALLOWED'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p_lines, '[]')) x where (x->>'qty')::numeric > 0) then
    raise exception 'NOTHING_TO_SEND';
  end if;
  insert into inv_dispatches (from_location, to_location, sent_by, note)
  values (p_from, p_to, p_staff, nullif(trim(p_note), '')) returning id into v_id;
  insert into inv_dispatch_lines (dispatch_id, stock_item_id, qty_sent)
  select v_id, (x->>'stock_item_id')::uuid, sum((x->>'qty')::numeric)
  from jsonb_array_elements(p_lines) x where (x->>'qty')::numeric > 0 group by 2;
  for l in select * from inv_dispatch_lines where dispatch_id = v_id loop
    perform inv_move(p_from, l.stock_item_id, -l.qty_sent, 'send', 'dispatch', v_id::text, p_staff);
  end loop;
  return v_id;
end $$;

-- Module 2's call (Kitchen screen of the old code): send to a branch from the
-- satellite kitchen that supplies it.
create or replace function inv_send_dispatch(p_to_branch uuid, p_lines jsonb, p_staff uuid, p_note text default null)
returns uuid language plpgsql as $$
declare v_to uuid := inv_branch_location(p_to_branch); v_from uuid;
begin
  select supplied_by into v_from from inv_locations where id = v_to;
  if v_from is null then raise exception 'STEP_NOT_ALLOWED'; end if;
  return inv_send(v_from, v_to, p_lines, p_staff, p_note);
end $$;

-- A place confirms what arrived. p_lines: [{line_id, qty_received}] (missing = as sent).
create or replace function inv_receive_at(p_dispatch uuid, p_location uuid, p_lines jsonb, p_staff uuid)
returns text language plpgsql as $$
declare v_status text; v_short boolean; l record; v_got numeric;
begin
  select status into v_status from inv_dispatches where id = p_dispatch and to_location = p_location for update;
  if not found then raise exception 'DISPATCH_NOT_FOUND'; end if;
  if v_status <> 'sent' then raise exception 'ALREADY_RECEIVED'; end if;

  for l in select * from inv_dispatch_lines where dispatch_id = p_dispatch loop
    select coalesce(max((x->>'qty_received')::numeric), l.qty_sent) into v_got
    from jsonb_array_elements(coalesce(p_lines, '[]')) x where (x->>'line_id')::uuid = l.id;
    if v_got < 0 then raise exception 'Invalid quantity'; end if;
    update inv_dispatch_lines set qty_received = v_got where id = l.id;
    perform inv_move(p_location, l.stock_item_id, v_got, 'receive', 'dispatch', p_dispatch::text, p_staff);
  end loop;

  select bool_or(qty_received < qty_sent) into v_short from inv_dispatch_lines where dispatch_id = p_dispatch;
  update inv_dispatches
  set status = case when v_short then 'received_short' else 'received' end, received_by = p_staff, received_at = now()
  where id = p_dispatch
  returning status into v_status;
  return v_status;
end $$;

create or replace function inv_receive_dispatch(p_dispatch uuid, p_branch uuid, p_lines jsonb, p_staff uuid)
returns text language sql as $$ select inv_receive_at(p_dispatch, inv_branch_location(p_branch), p_lines, p_staff) $$;

-- ── Counts & adjustments at any place ──────────────────────────
create or replace function inv_apply_count_at(p_location uuid, p_lines jsonb, p_staff uuid, p_note text default null)
returns uuid language plpgsql as $$
declare v_id uuid; x jsonb; v_exp numeric; v_cnt numeric; v_item uuid;
begin
  insert into inv_counts (location_id, counted_by, note) values (p_location, p_staff, nullif(trim(p_note), ''))
  returning id into v_id;
  for x in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    v_item := (x->>'stock_item_id')::uuid;
    v_cnt  := (x->>'counted')::numeric;
    if v_cnt is null or v_cnt < 0 then raise exception 'Invalid count'; end if;
    select coalesce(on_hand, 0) into v_exp from inv_balances where location_id = p_location and stock_item_id = v_item for update;
    v_exp := coalesce(v_exp, 0);
    insert into inv_count_lines (count_id, stock_item_id, expected, counted, variance)
    values (v_id, v_item, v_exp, v_cnt, v_cnt - v_exp);
    perform inv_move(p_location, v_item, v_cnt - v_exp, 'count_adjust', 'count', v_id::text, p_staff, p_note);
  end loop;
  return v_id;
end $$;

create or replace function inv_apply_count(p_branch uuid, p_lines jsonb, p_staff uuid, p_note text default null)
returns uuid language sql as $$ select inv_apply_count_at(inv_branch_location(p_branch), p_lines, p_staff, p_note) $$;

create or replace function inv_adjust_at(p_location uuid, p_item uuid, p_qty numeric, p_kind text, p_staff uuid, p_note text)
returns void language plpgsql as $$
begin
  if p_kind not in ('waste','manual') then raise exception 'Invalid adjustment'; end if;
  if p_kind = 'waste' and p_qty > 0 then p_qty := -p_qty; end if;
  if nullif(trim(p_note), '') is null then raise exception 'Give a reason'; end if;
  perform inv_move(p_location, p_item, p_qty, p_kind, 'adjust', gen_random_uuid()::text, p_staff, p_note);
end $$;

create or replace function inv_adjust(p_branch uuid, p_item uuid, p_qty numeric, p_kind text, p_staff uuid, p_note text)
returns void language sql as $$ select inv_adjust_at(inv_branch_location(p_branch), p_item, p_qty, p_kind, p_staff, p_note) $$;

-- ── Food cost per dish ─────────────────────────────────────────
create or replace view inv_dish_cost as
select m.id as menu_item_id, m.branch_id, m.name, m.price,
       count(u.stock_item_id)::int as links,
       round(coalesce(sum(u.qty * i.unit_cost), 0), 2) as cost,
       case when m.price > 0 then round(coalesce(sum(u.qty * i.unit_cost), 0) / m.price * 100, 1) end as cost_pct
from menu_items m
left join inv_menu_usage u on u.menu_item_id = m.id
left join inv_stock_items i on i.id = u.stock_item_id
group by m.id, m.branch_id, m.name, m.price;

-- ── Access: server (service role) only ─────────────────────────
alter table inv_levels          enable row level security;
alter table inv_alerts          enable row level security;
alter table inv_suppliers       enable row level security;
alter table inv_purchases       enable row level security;
alter table inv_purchase_lines  enable row level security;
alter table inv_recipes         enable row level security;
alter table inv_recipe_lines    enable row level security;
alter table inv_productions     enable row level security;
revoke all on inv_levels, inv_alerts, inv_suppliers, inv_purchases, inv_purchase_lines,
  inv_recipes, inv_recipe_lines, inv_productions, inv_dish_cost from anon, authenticated;

revoke execute on function
  inv_level(uuid, uuid), inv_record_purchase(uuid, uuid, jsonb, uuid, text), inv_recipe_unit_cost(uuid),
  inv_record_production(uuid, uuid, numeric, uuid, text), inv_step_allowed(uuid, uuid),
  inv_send(uuid, uuid, jsonb, uuid, text), inv_receive_at(uuid, uuid, jsonb, uuid),
  inv_apply_count_at(uuid, jsonb, uuid, text), inv_adjust_at(uuid, uuid, numeric, text, uuid, text),
  inv_send_dispatch(uuid, jsonb, uuid, text), inv_receive_dispatch(uuid, uuid, jsonb, uuid),
  inv_apply_count(uuid, jsonb, uuid, text), inv_adjust(uuid, uuid, numeric, text, uuid, text),
  inv_move(uuid, uuid, numeric, text, text, text, uuid, text), inv_branch_location(uuid)
  from public, anon, authenticated;
grant execute on function
  inv_level(uuid, uuid), inv_record_purchase(uuid, uuid, jsonb, uuid, text), inv_recipe_unit_cost(uuid),
  inv_record_production(uuid, uuid, numeric, uuid, text), inv_step_allowed(uuid, uuid),
  inv_send(uuid, uuid, jsonb, uuid, text), inv_receive_at(uuid, uuid, jsonb, uuid),
  inv_apply_count_at(uuid, jsonb, uuid, text), inv_adjust_at(uuid, uuid, numeric, text, uuid, text),
  inv_send_dispatch(uuid, jsonb, uuid, text), inv_receive_dispatch(uuid, uuid, jsonb, uuid),
  inv_apply_count(uuid, jsonb, uuid, text), inv_adjust(uuid, uuid, numeric, text, uuid, text),
  inv_move(uuid, uuid, numeric, text, text, text, uuid, text), inv_branch_location(uuid)
  to service_role;
