-- Add 'delivery' to the allowed roles on the staff table
alter table staff
  drop constraint if exists staff_role_check;

alter table staff
  add constraint staff_role_check
  check (role in ('admin', 'staff', 'delivery'));
