-- ═══════════════════════════════════════════════════════════════
-- POS — review link by SMS right after a walk-in payment (run after pos_003).
-- Safe to re-run.
--
-- Walk-in reviews go into the SAME `reviews` table as online reviews, so they
-- show in the online admin's Reviews tab and on the website automatically.
-- The only change to an online table is one new, optional column on
-- `reviews` (pos_sale_id); the online app's code is untouched.
-- ═══════════════════════════════════════════════════════════════

alter table pos_sales add column if not exists review_token         uuid;
alter table pos_sales add column if not exists review_token_used_at timestamptz;
alter table pos_sales add column if not exists review_sms_sent_at   timestamptz;
create unique index if not exists pos_sales_review_token on pos_sales (review_token) where review_token is not null;

alter table reviews add column if not exists pos_sale_id uuid references pos_sales(id) on delete set null;
create unique index if not exists reviews_pos_sale_id_key on reviews (pos_sale_id) where pos_sale_id is not null;

-- Claim the right to send the review SMS for a paid sale — exactly once, even
-- if the payment is confirmed twice (retry, poll + cancel). Returns the review
-- token to put in the link, or null if it was already sent / not paid / no phone.
create or replace function pos_claim_review_sms(p_sale uuid)
returns uuid language plpgsql as $$
declare v_token uuid;
begin
  update pos_sales
  set review_token       = coalesce(review_token, gen_random_uuid()),
      review_sms_sent_at = now()
  where id = p_sale
    and review_sms_sent_at is null
    and customer_id is not null
    and status in ('paid','partially_served','served')
  returning review_token into v_token;
  return v_token;
end $$;

-- Submit a walk-in review. One per sale, link valid 24 hours after payment.
-- Returns 'ok' | 'invalid' | 'used' | 'expired'.
create or replace function pos_submit_review(p_token uuid, p_rating int, p_comment text)
returns text language plpgsql as $$
declare r record;
begin
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'INVALID_RATING'; end if;

  select s.id, s.created_at, s.review_token_used_at, s.status,
         coalesce(c.name, 'Walk-in customer') as customer_name, coalesce(c.phone, '') as phone
  into r
  from pos_sales s left join pos_customers c on c.id = s.customer_id
  where s.review_token = p_token
  for update of s;

  if not found or r.status = 'voided' then return 'invalid'; end if;
  if r.review_token_used_at is not null then return 'used'; end if;
  if r.created_at < now() - interval '24 hours' then return 'expired'; end if;

  insert into reviews (customer_name, momo_number, rating, comment, is_approved, pos_sale_id)
  values (r.customer_name, r.phone, p_rating, nullif(trim(p_comment), ''), true, r.id);

  update pos_sales set review_token_used_at = now() where id = r.id;
  return 'ok';
end $$;

revoke execute on function pos_claim_review_sms(uuid), pos_submit_review(uuid, int, text)
  from public, anon, authenticated;
grant execute on function pos_claim_review_sms(uuid), pos_submit_review(uuid, int, text)
  to service_role;
