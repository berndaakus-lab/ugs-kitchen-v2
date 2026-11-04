-- ═══════════════════════════════════════════════════════════════
-- POS Module 2 — extra stock units (run after pos_007). Safe to re-run.
--
-- The kitchen's portion sheet measures rice in scoops and corned beef in
-- tenths of a can ("3 scoops rice + 2/10 can beef"), so stock items can now
-- be counted in scoops and cans too.
-- ═══════════════════════════════════════════════════════════════

alter table inv_stock_items drop constraint if exists inv_stock_items_unit_check;
alter table inv_stock_items add constraint inv_stock_items_unit_check
  check (unit in ('plate','piece','pack','portion','scoop','can','kg','litre','bottle'));
