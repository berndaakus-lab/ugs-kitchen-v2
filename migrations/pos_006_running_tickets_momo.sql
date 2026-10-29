-- ═══════════════════════════════════════════════════════════════
-- POS — (run after pos_005). Safe to re-run.
--
-- 1. Ticket numbers keep counting across days (W-041 yesterday → W-042
--    today) instead of restarting at W-001 every morning. One running
--    counter per branch, starting after the highest number already used.
-- 2. A MoMo sale only becomes a real sale once the money arrives:
--    while waiting it has a temporary number (PENDING-…); it gets its
--    ticket number when Paystack confirms. If the payment fails or is
--    cancelled, the sale is deleted (a line is kept in pos_audit_log so a
--    late "I paid" can still be checked against Paystack).
-- ═══════════════════════════════════════════════════════════════

-- The running counter lives in pos_ticket_counters under a fixed date.
create or replace function pos_next_ticket_no(p_branch uuid, p_date date)
returns text language plpgsql as $$
declare n int;
begin
  insert into pos_ticket_counters (branch_id, business_date, last_no)
  values (p_branch, date '1970-01-01', 1)
  on conflict (branch_id, business_date) do update set last_no = pos_ticket_counters.last_no + 1
  returning last_no into n;
  return 'W-' || lpad(n::text, 3, '0');
end $$;

-- Start each branch's running counter after its highest ticket so far.
insert into pos_ticket_counters (branch_id, business_date, last_no)
select branch_id, date '1970-01-01', max(substring(ticket_no from '^W-(\d+)$')::int)
from pos_sales
where ticket_no ~ '^W-\d+$'
group by branch_id
on conflict (branch_id, business_date)
  do update set last_no = greatest(pos_ticket_counters.last_no, excluded.last_no);

-- Same as before, except a pending MoMo sale gets a temporary number.
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
  else
    insert into pos_payments (sale_id, method, amount, status)
    values (v_sale, 'momo_paystack', v_subtotal, 'pending');
  end if;

  return v_sale;
end $$;

-- Paystack confirmed the MoMo payment: the sale becomes real and gets its
-- ticket number now. Returns true only for the call that flipped it.
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
  return true;
end $$;

-- Payment failed or was cancelled: delete the sale instead of keeping it.
-- Refuses if any money was recorded against it. Returns true if deleted.
create or replace function pos_discard_pending(p_sale uuid, p_actor uuid, p_reason text)
returns boolean language plpgsql as $$
declare r record;
begin
  select s.id, s.status, s.total, s.client_ref, s.branch_id,
         (select reference from pos_payments where sale_id = s.id order by created_at desc limit 1) as reference
  into r
  from pos_sales s where s.id = p_sale for update;
  if not found or r.status not in ('pending_payment', 'failed') then return false; end if;
  if exists (select 1 from pos_payments where sale_id = p_sale and status = 'success') then return false; end if;

  insert into pos_audit_log (actor_id, action, meta)
  values (p_actor, 'momo_not_paid', jsonb_build_object(
    'reason', p_reason, 'total', r.total, 'paystack_reference', r.reference,
    'client_ref', r.client_ref, 'branch_id', r.branch_id));

  delete from pos_sales where id = p_sale;   -- items and payment rows go with it
  return true;
end $$;

revoke execute on function
  pos_next_ticket_no(uuid, date),
  pos_create_sale(uuid, uuid, uuid, jsonb, jsonb, text),
  pos_confirm_payment(uuid, text, text),
  pos_discard_pending(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function
  pos_next_ticket_no(uuid, date),
  pos_create_sale(uuid, uuid, uuid, jsonb, jsonb, text),
  pos_confirm_payment(uuid, text, text),
  pos_discard_pending(uuid, uuid, text)
  to service_role;
