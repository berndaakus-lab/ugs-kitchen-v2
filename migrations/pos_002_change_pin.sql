-- ═══════════════════════════════════════════════════════════════
-- POS — "Change my PIN" (run after pos_001_walkin.sql). Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- Change your own PIN by proving the current one.
-- Returns 'ok' | 'wrong' | 'locked'. Wrong current PINs count towards the
-- same 5-try lockout as the login screen.
create or replace function pos_change_pin(p_pos_staff uuid, p_current text, p_new text)
returns text language plpgsql set search_path = public, extensions as $$
declare r record;
begin
  if p_new !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4-6 digits';
  end if;

  select * into r from pos_staff where id = p_pos_staff and is_active for update;
  if not found then return 'wrong'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;

  if r.pin_hash <> crypt(p_current, r.pin_hash) then
    update pos_staff set
      failed_attempts = failed_attempts + 1,
      locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
    where id = r.id;
    return 'wrong';
  end if;

  update pos_staff
  set pin_hash = crypt(p_new, gen_salt('bf')), failed_attempts = 0, locked_until = null
  where id = r.id;

  insert into pos_audit_log (actor_id, action) values (r.id, 'pin_changed');
  return 'ok';
end $$;

revoke execute on function pos_change_pin(uuid, text, text) from public, anon, authenticated;
grant  execute on function pos_change_pin(uuid, text, text) to service_role;
