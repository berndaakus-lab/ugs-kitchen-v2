create table if not exists promos (
  id         bigint primary key generated always as identity,
  title      text not null,
  subtitle   text,
  code       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
