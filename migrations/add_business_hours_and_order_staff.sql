-- Business hours stored as a JSONB array on each branch
-- Format: [{ day: 0-6 (0=Sun), open: "08:00", close: "22:00", closed: false }, ...]
alter table branches add column if not exists business_hours jsonb;

-- Multiple SMS recipients per branch (JSON array of phone strings)
alter table branches add column if not exists sms_recipients jsonb default '[]';

-- Global extra SMS recipients (CEO / owner level)
-- Store as comma-separated or JSONB in env — handled in code via OWNER_PHONES env var

-- Staff who actioned each status change on an order
alter table orders
  add column if not exists actioned_by      text,        -- staff name
  add column if not exists actioned_by_id   uuid references staff(id) on delete set null,
  add column if not exists actioned_at      timestamptz;
