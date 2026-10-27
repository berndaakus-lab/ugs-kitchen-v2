-- ═══════════════════════════════════════════════════════════════
-- POS — a person can have more than one role (run after pos_004).
-- Safe to re-run. Existing staff keep their current role.
--
-- pos_roles = everything the person may do, e.g. {cashier,server} for
-- someone who takes payments and serves. pos_role stays as their main role
-- (admin > manager > cashier > server), used for admin/manager checks.
-- Manager and admin already open every screen, so they are not combined
-- with other roles.
-- ═══════════════════════════════════════════════════════════════

alter table pos_staff add column if not exists pos_roles text[];
update pos_staff set pos_roles = array[pos_role] where pos_roles is null or cardinality(pos_roles) = 0;
alter table pos_staff alter column pos_roles set not null;

alter table pos_staff drop constraint if exists pos_staff_roles_check;
alter table pos_staff add constraint pos_staff_roles_check check (
  cardinality(pos_roles) >= 1
  and pos_roles <@ array['cashier','server','manager','admin']
  and pos_role = any (pos_roles)
);

-- Clean a requested set of roles: admin or manager stand alone; cashier and
-- server can be combined. Returns them in a fixed order.
create or replace function pos_normalize_roles(p_roles text[])
returns text[] language sql immutable as $$
  select case
    when 'admin'   = any (p_roles) then array['admin']
    when 'manager' = any (p_roles) then array['manager']
    else array(select r from unnest(array['cashier','server']) r where r = any (p_roles))
  end
$$;

-- Create/update a POS login with one or more roles. p_pin null = keep PIN.
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
          v_roles[1], v_roles, case when v_roles[1] = 'admin' then null else p_branch end, p_active)
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

-- The original single-role function keeps working (used in the setup guide).
create or replace function pos_set_staff(p_staff_id uuid, p_pin text, p_role text, p_branch uuid, p_active boolean default true)
returns uuid language sql as $$
  select pos_set_staff_roles(p_staff_id, p_pin, array[p_role], p_branch, p_active)
$$;

-- Login now also returns all roles (return type changes, so drop first).
drop function if exists pos_verify_pin(text, text);
create function pos_verify_pin(p_username text, p_pin text)
returns table (pos_staff_id uuid, staff_id uuid, name text, pos_role text, pos_roles text[], branch_id uuid, locked boolean)
language plpgsql set search_path = public, extensions as $$
declare r record;
begin
  select ps.*, s.name as staff_name into r
  from pos_staff ps join staff s on s.id = ps.staff_id
  where lower(s.username) = lower(trim(p_username)) and ps.is_active and s.is_active;

  if not found then return; end if;

  if r.locked_until is not null and r.locked_until > now() then
    return query select null::uuid, null::uuid, null::text, null::text, null::text[], null::uuid, true;
    return;
  end if;

  if r.pin_hash = crypt(p_pin, r.pin_hash) then
    update pos_staff set failed_attempts = 0, locked_until = null where id = r.id;
    return query select r.id, r.staff_id, r.staff_name, r.pos_role, r.pos_roles, r.branch_id, false;
  else
    update pos_staff set
      failed_attempts = failed_attempts + 1,
      locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
    where id = r.id;
  end if;
end $$;

revoke execute on function
  pos_normalize_roles(text[]),
  pos_set_staff_roles(uuid, text, text[], uuid, boolean),
  pos_set_staff(uuid, text, text, uuid, boolean),
  pos_verify_pin(text, text)
  from public, anon, authenticated;
grant execute on function
  pos_normalize_roles(text[]),
  pos_set_staff_roles(uuid, text, text[], uuid, boolean),
  pos_set_staff(uuid, text, text, uuid, boolean),
  pos_verify_pin(text, text)
  to service_role;
