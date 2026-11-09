-- ═══════════════════════════════════════════════════════════════
-- POS + website — roles the owner builds himself (run after pos_008 and
-- web_001). Safe to re-run: it never overwrites roles the owner has edited.
--
-- DEPLOY ORDER: run this file FIRST, then merge the code. The current code
-- keeps working on it (same role keys); the new code needs it.
--
-- • pos_role_defs: each role = a name, a set of permissions, where it works
--   (all branches / one branch / the kitchen), whether it runs on shift, and
--   which roles its holders may give to other people.
-- • pos_staff.pos_roles holds role keys; any combination is allowed now.
-- • One PIN per person for the POS and the website staff pages.
-- • Shifts: 'cash' (float + count, for people who sell) or 'duty'
--   (clock in / out, for everyone else who runs on shift).
-- ═══════════════════════════════════════════════════════════════

create table if not exists pos_role_defs (
  key          text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name         text not null,
  permissions  text[] not null default '{}',
  scope        text not null default 'branch' check (scope in ('all', 'branch', 'kitchen')),
  runs_shift   boolean not null default false,
  can_assign   text[] not null default '{}',
  is_system    boolean not null default false,   -- Admin: locked, every permission
  sort         int not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table pos_role_defs enable row level security;
revoke all on pos_role_defs from anon, authenticated;
create unique index if not exists pos_role_defs_name on pos_role_defs (lower(name));

-- Starting roles (from the client's list). Existing rows are left as edited.
insert into pos_role_defs (key, name, permissions, scope, runs_shift, can_assign, is_system, sort) values
  ('admin', 'Admin', '{}', 'all', false, '{}', true, 1),
  ('general_manager', 'General manager',
     '{stock_send,stock_receive,reports,activity,online_orders,staff_assign}', 'all', false, '{cashier,server}', false, 2),
  ('manager', 'Branch manager',
     '{sell,serve,void_approve,stock_receive,stock_count,reports,activity,online_orders,online_orders_manage,staff_assign}',
     'branch', true, '{cashier,server}', false, 3),
  ('kitchen', 'Kitchen head', '{stock_send,activity}', 'kitchen', true, '{}', false, 4),
  ('cashier', 'Cashier', '{sell,online_orders,stock_receive,stock_count}', 'branch', true, '{}', false, 5),
  ('server', 'Server', '{serve,online_orders,stock_receive,stock_count}', 'branch', true, '{}', false, 6),
  ('online_orders', 'Online orders', '{online_orders,online_orders_manage}', 'branch', false, '{}', false, 7),
  ('delivery', 'Delivery', '{delivery}', 'branch', false, '{}', false, 8)
on conflict (key) do nothing;
-- Admin always stays the locked, all-powerful role.
update pos_role_defs set is_system = true, scope = 'all', runs_shift = false where key = 'admin';
update pos_role_defs set is_system = false where key <> 'admin';

-- ── Staff: any combination of roles ─────────────────────────────
alter table pos_staff drop constraint if exists pos_staff_roles_check;
alter table pos_staff drop constraint if exists pos_staff_pos_role_check;
alter table pos_staff drop constraint if exists pos_staff_branch_required;

create or replace function pos_normalize_roles(p_roles text[])
returns text[] language sql stable as $$
  -- keep known roles, no repeats, in the roles' display order
  select coalesce(array_agg(d.key order by d.sort, d.key), '{}')
  from pos_role_defs d where d.key = any (p_roles)
$$;

create or replace function pos_staff_check_roles() returns trigger
language plpgsql as $$
declare v_known text[];
begin
  v_known := pos_normalize_roles(new.pos_roles);
  if cardinality(coalesce(new.pos_roles, '{}')) = 0 then raise exception 'Choose at least one POS role'; end if;
  if cardinality(v_known) <> (select count(distinct r) from unnest(new.pos_roles) r) then
    raise exception 'UNKNOWN_ROLE';
  end if;
  new.pos_roles := v_known;
  if new.pos_role is null or not (new.pos_role = any (v_known)) then new.pos_role := v_known[1]; end if;
  if new.branch_id is null and exists (
    select 1 from pos_role_defs d where d.key = any (v_known) and d.scope = 'branch'
  ) and not exists (
    select 1 from pos_role_defs d where d.key = any (v_known) and d.scope = 'all'
  ) then
    raise exception 'BRANCH_REQUIRED';
  end if;
  return new;
end $$;
drop trigger if exists pos_staff_check_roles on pos_staff;
create trigger pos_staff_check_roles before insert or update of pos_role, pos_roles, branch_id on pos_staff
  for each row execute function pos_staff_check_roles();

create or replace function pos_set_staff_roles(p_staff_id uuid, p_pin text, p_roles text[], p_branch uuid, p_active boolean default true)
returns uuid language plpgsql set search_path = public, extensions as $$
declare
  v_roles text[] := pos_normalize_roles(p_roles);
  v_id    uuid;
begin
  if cardinality(coalesce(p_roles, '{}')) = 0 then raise exception 'Choose at least one POS role'; end if;
  if cardinality(v_roles) <> (select count(distinct r) from unnest(p_roles) r) then raise exception 'UNKNOWN_ROLE'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4-6 digits'; end if;
  if p_pin is null and not exists (select 1 from pos_staff where staff_id = p_staff_id) then
    raise exception 'PIN required for new POS user';
  end if;

  insert into pos_staff (staff_id, pin_hash, pos_role, pos_roles, branch_id, is_active)
  values (p_staff_id, crypt(coalesce(p_pin, gen_random_uuid()::text), gen_salt('bf')),
          v_roles[1], v_roles,
          -- a branch only matters for branch roles (kitchen / all-branch roles have none)
          case when exists (select 1 from pos_role_defs d where d.key = any (v_roles) and d.scope = 'branch') then p_branch end,
          p_active)
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

-- What a person may do right now (both apps call this on every request,
-- so a role change or a disabled account takes effect at once).
create or replace function pos_staff_access(p_pos_staff uuid)
returns table (
  pos_staff_id uuid, staff_id uuid, name text, username text, branch_id uuid,
  roles text[], role_names text[], is_admin boolean, permissions text[],
  scopes text[], runs_shift boolean, can_assign text[], active boolean
)
language sql stable as $$
  select ps.id, ps.staff_id, s.name, s.username, ps.branch_id,
         ps.pos_roles,
         array(select d.name from pos_role_defs d where d.key = any (ps.pos_roles) order by d.sort, d.key),
         exists (select 1 from pos_role_defs d where d.key = any (ps.pos_roles) and d.is_system),
         array(select distinct p from pos_role_defs d, unnest(d.permissions) p where d.key = any (ps.pos_roles) order by p),
         array(select distinct d.scope from pos_role_defs d where d.key = any (ps.pos_roles) order by d.scope),
         exists (select 1 from pos_role_defs d where d.key = any (ps.pos_roles) and d.runs_shift),
         array(select distinct a from pos_role_defs d, unnest(d.can_assign) a where d.key = any (ps.pos_roles) order by a),
         ps.is_active and s.is_active
  from pos_staff ps join staff s on s.id = ps.staff_id
  where ps.id = p_pos_staff
$$;

-- Void approval: a PIN from anyone allowed to approve voids at this branch.
create or replace function pos_verify_void_pin(p_branch uuid, p_pin text)
returns uuid language sql stable set search_path = public, extensions as $$
  select ps.id from pos_staff ps join staff s on s.id = ps.staff_id
  where ps.is_active and s.is_active
    and (ps.locked_until is null or ps.locked_until < now())
    and ps.pin_hash = crypt(p_pin, ps.pin_hash)
    and exists (
      select 1 from pos_role_defs d
      where d.key = any (ps.pos_roles)
        and (d.is_system or 'void_approve' = any (d.permissions))
        and (d.scope = 'all' or (d.scope = 'branch' and ps.branch_id = p_branch))
    )
  limit 1
$$;
-- old name, same rule
create or replace function pos_verify_manager_pin(p_branch uuid, p_pin text)
returns uuid language sql stable as $$ select pos_verify_void_pin(p_branch, p_pin) $$;

-- ── Shifts: cash or duty ────────────────────────────────────────
alter table pos_shifts add column if not exists kind text not null default 'cash';
alter table pos_shifts drop constraint if exists pos_shifts_kind_check;
alter table pos_shifts add constraint pos_shifts_kind_check check (kind in ('cash', 'duty'));
alter table pos_shifts alter column branch_id drop not null;   -- a kitchen duty shift has no branch
alter table pos_shifts drop constraint if exists pos_shifts_branch_for_cash;
alter table pos_shifts add constraint pos_shifts_branch_for_cash check (kind = 'duty' or branch_id is not null);

-- ── Website staff: one PIN for both apps ────────────────────────
-- People who already have a POS login keep their POS roles ("staff" is just
-- the website's default, so it says nothing); website riders also get Delivery.
update pos_staff ps set pos_roles = pos_normalize_roles(ps.pos_roles || array['delivery'])
from staff s
where s.id = ps.staff_id and s.role = 'delivery' and not ('delivery' = any (ps.pos_roles))
  and ps.branch_id is not null;

-- Website-only people get a login with the PIN they already use (bcrypt,
-- from web_001). Anyone with no branch who isn't an admin is skipped and
-- listed below, to be set up in POS → Staff.
insert into pos_staff (staff_id, pin_hash, pos_role, pos_roles, branch_id, is_active)
select s.id, s.pin,
       case s.role when 'admin' then 'admin' when 'delivery' then 'delivery' else 'online_orders' end,
       array[case s.role when 'admin' then 'admin' when 'delivery' then 'delivery' else 'online_orders' end],
       s.branch_id, s.is_active
from staff s
where not exists (select 1 from pos_staff ps where ps.staff_id = s.id)
  and s.pin ~ '^\$2[abxy]\$'
  and (s.role = 'admin' or s.branch_id is not null)
on conflict (staff_id) do nothing;

select s.name, s.username, s.role as website_role
from staff s
where not exists (select 1 from pos_staff ps where ps.staff_id = s.id);   -- needs setting up by hand (usually none)

-- ── Permissions ─────────────────────────────────────────────────
revoke execute on function
  pos_normalize_roles(text[]), pos_staff_access(uuid), pos_verify_void_pin(uuid, text),
  pos_verify_manager_pin(uuid, text), pos_set_staff_roles(uuid, text, text[], uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  pos_normalize_roles(text[]), pos_staff_access(uuid), pos_verify_void_pin(uuid, text),
  pos_verify_manager_pin(uuid, text), pos_set_staff_roles(uuid, text, text[], uuid, boolean)
  to service_role;
