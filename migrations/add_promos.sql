create table if not exists promos (
  id         bigint primary key generated always as identity,
  title      text not null,
  subtitle   text,
  code       text,
  image      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- If table already exists, just add the image column
alter table promos add column if not exists image text;
