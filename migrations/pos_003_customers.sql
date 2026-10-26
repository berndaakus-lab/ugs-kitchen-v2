-- ═══════════════════════════════════════════════════════════════
-- POS — walk-in customer phone numbers (run after pos_002). Safe to re-run.
--
-- Every walk-in sale can carry the customer's phone (and name). Promo
-- messages may only go to customers who agreed: marketing_opt_in + the time
-- they agreed are stored, as Ghana's Data Protection Act 2012 expects.
-- ═══════════════════════════════════════════════════════════════

create table if not exists pos_customers (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null unique check (phone ~ '^0[0-9]{9}$'),  -- local format 0XXXXXXXXX
  name             text,
  marketing_opt_in boolean not null default false,
  opt_in_at        timestamptz,
  opt_out_at       timestamptz,
  first_branch_id  uuid references branches(id) on delete set null,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now()
);

alter table pos_sales add column if not exists customer_id uuid references pos_customers(id) on delete set null;
create index if not exists pos_sales_customer on pos_sales (customer_id);

alter table pos_customers enable row level security;
revoke all on pos_customers from anon, authenticated;

-- Attach a customer to a sale, creating or updating them by phone.
-- Opt-in is only ever turned ON here (an unticked box means "not asked
-- this time", not "opt out"); opting out is a separate, explicit action.
create or replace function pos_attach_customer(p_sale uuid, p_phone text, p_name text, p_opt_in boolean)
returns uuid language plpgsql as $$
declare
  v_branch uuid;
  v_id     uuid;
begin
  if p_phone !~ '^0[0-9]{9}$' then raise exception 'INVALID_PHONE'; end if;

  select branch_id into v_branch from pos_sales where id = p_sale;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;

  insert into pos_customers (phone, name, marketing_opt_in, opt_in_at, first_branch_id)
  values (p_phone, nullif(trim(p_name), ''), coalesce(p_opt_in, false),
          case when p_opt_in then now() end, v_branch)
  on conflict (phone) do update set
    name             = coalesce(nullif(trim(excluded.name), ''), pos_customers.name),
    marketing_opt_in = pos_customers.marketing_opt_in or excluded.marketing_opt_in,
    opt_in_at        = case when excluded.marketing_opt_in and not pos_customers.marketing_opt_in
                            then now() else pos_customers.opt_in_at end,
    opt_out_at       = case when excluded.marketing_opt_in then null else pos_customers.opt_out_at end,
    last_seen_at     = now()
  returning id into v_id;

  update pos_sales set customer_id = v_id where id = p_sale;
  return v_id;
end $$;

revoke execute on function pos_attach_customer(uuid, text, text, boolean) from public, anon, authenticated;
grant  execute on function pos_attach_customer(uuid, text, text, boolean) to service_role;

-- Walk-in rows in the combined sales view now show the customer's name or
-- phone instead of just "Walk-in".
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
    coalesce(c.name, c.phone, 'Walk-in'),
    (select string_agg(distinct p.method, '+') from pos_payments p
      where p.sale_id = s.id and p.status = 'success'),
    s.id
  from pos_sales s
  left join pos_customers c on c.id = s.customer_id
  where s.status in ('paid','partially_served','served','voided');

revoke all on sales_unified from anon, authenticated;
grant select on sales_unified to service_role;
