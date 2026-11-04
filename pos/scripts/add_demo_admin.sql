-- ═══════════════════════════════════════════════════════════════
-- POS — add a separate admin login for the developer (demo / support).
--
-- Gives you your own POS admin login, so you don't need the owner's PIN.
--
-- • Creates a staff row named "Dev Support (POS)". It shows in the online
--   admin's staff list, but it CANNOT log into the online admin: its online
--   PIN is a random, unknown string.
-- • POS role: admin (all branches, every screen).
--
-- HOW: in Supabase → SQL Editor:
--   1. Change the PIN on the line marked ◀ to your own 4–6 digit PIN.
--      (It refuses to run until you do.)
--   2. Run the whole file. Safe to re-run: running it again just resets the PIN.
--   3. Log in at pos.ugskitchen.com with username  devsupport  and your PIN.
--
-- Anything you do with this login (sales, voids, stock) is real data, recorded
-- under "Dev Support (POS)". Test on a quiet day, or clear it afterwards with
-- scripts/wipe_test_data.sql.
-- ═══════════════════════════════════════════════════════════════

with s as (
  insert into staff (name, username, pin, role, is_active)
  values ('Dev Support (POS)', 'devsupport', md5(random()::text || clock_timestamp()::text), 'staff', true)
  on conflict (username) do update set is_active = true
  returning id
)
select pos_set_staff_roles(
  (select id from s),
  'CHANGE-ME',                -- ◀ your POS PIN (4–6 digits)
  array['admin'],
  null
) as pos_staff_id;


-- ── To remove it later (run on its own) ──────────────────────────
-- update pos_staff set is_active = false
--   where staff_id = (select id from staff where username = 'devsupport');
-- update staff set is_active = false where username = 'devsupport';
