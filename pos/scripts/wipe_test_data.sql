-- ═══════════════════════════════════════════════════════════════
-- POS — wipe TEST data before going live.
--
-- ⚠  PERMANENT. Run only on the live database when everything in the POS so
--    far was testing. Take a backup first (Supabase → Database → Backups).
--
-- REMOVES (all branches):
--   • every walk-in sale, its items, payments and serve records
--   • every shift: open and closed, opening floats, cash counts, Z-reports
--   • walk-in reviews (online-order reviews are kept)
--   • sale-related log lines (voids, reprints, failed MoMo attempts, …)
--   • ticket numbering → the next sale is W-001 again
--
-- KEEPS: staff POS logins and PINs, menu, branches, online orders and their
--        reviews, and (unless you run step 3) walk-in customers.
--
-- HOW: in Supabase → SQL Editor, run STEP 1 on its own and check the counts.
--      Then run STEP 2 (and STEP 3 only if you also want customers gone).
-- ═══════════════════════════════════════════════════════════════


-- ── STEP 1: preview what will be deleted (changes nothing) ───────
select 'walk-in sales'        as what, count(*) from pos_sales
union all select 'sale items',          count(*) from pos_sale_items
union all select 'payments',            count(*) from pos_payments
union all select 'serve records',       count(*) from pos_serve_events
union all select 'shifts (open+closed)',count(*) from pos_shifts
union all select 'open shifts',         count(*) from pos_shifts where closed_at is null
union all select 'walk-in reviews',     count(*) from reviews where pos_sale_id is not null
union all select 'sale log lines',      count(*) from pos_audit_log
  where action in ('void', 'reprint_ticket', 'reprint_receipt', 'online_receipt', 'momo_not_paid')
union all select 'walk-in customers (step 3 only)', count(*) from pos_customers;


-- ── STEP 2: wipe sales, shifts and cash (one transaction) ────────
begin;

delete from reviews where pos_sale_id is not null;      -- walk-in reviews only
delete from pos_audit_log
  where action in ('void', 'reprint_ticket', 'reprint_receipt', 'online_receipt', 'momo_not_paid');
delete from pos_serve_events;
delete from pos_payments;
delete from pos_sale_items;
delete from pos_sales;
delete from pos_shifts;                                  -- open + closed, with floats and counts
delete from pos_ticket_counters;                         -- next ticket is W-001

commit;


-- ── STEP 3 (optional): also remove test walk-in customers ────────
-- Only if the customers captured so far were all test numbers.
-- begin;
-- delete from pos_audit_log where action = 'customer_opt_out';
-- delete from pos_customers;
-- commit;
