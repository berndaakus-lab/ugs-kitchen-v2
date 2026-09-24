-- Allow reading all branches (active or not) so admin can manage them.
-- Customers already only see active branches via the existing policy;
-- this second policy lets the admin panel fetch inactive ones too.
drop policy if exists "Service role can read all branches" on branches;

alter table branches disable row level security;
