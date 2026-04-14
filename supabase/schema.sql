-- ============================================================
-- MaidThis Franchise Hub — Database Schema
-- Run this in Supabase: SQL Editor → New Query → Paste → Run
-- ============================================================

-- LOCATIONS
-- The 36 franchisee markets
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- "MaidThis Alexandria" (CapForge name)
  name_ghl text not null unique,      -- "Alexandria" (GHL name)
  created_at timestamptz default now()
);

-- PROFILES
-- Extends Supabase auth — one profile per user account
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'franchisee' check (role in ('franchisee', 'corporate')),
  location_id uuid references locations(id),  -- null for corporate users
  created_at timestamptz default now()
);

-- Auto-create a profile when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'franchisee');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- OPPORTUNITIES
-- Every lead/booking from GHL (one row per opportunity)
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text unique not null,   -- GHL's unique ID — prevents duplicates on sync
  location_id uuid references locations(id),
  date date,
  last_updated date,
  customer_id text,
  customer_name text,
  source text,
  pipeline text,
  stage_id text,
  stage_name text,
  status text check (status in ('won', 'lost', 'open')),
  value numeric default 0,
  customer_ltv numeric default 0,
  primary_source text,
  frequency_type text,
  synced_at timestamptz default now()
);

create index if not exists opportunities_location_id_idx on opportunities(location_id);
create index if not exists opportunities_date_idx on opportunities(date);
create index if not exists opportunities_status_idx on opportunities(status);

-- REVENUE
-- Monthly revenue per location from Launch27/Operto
create table if not exists revenue (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),
  source_type text check (source_type in ('Long Term', 'Short Term')),
  period_start date not null,
  period_end date not null,
  amount numeric default 0,
  synced_at timestamptz default now(),
  unique (location_id, source_type, period_start)  -- prevents duplicates on sync
);

create index if not exists revenue_location_id_idx on revenue(location_id);
create index if not exists revenue_period_start_idx on revenue(period_start);

-- SPEND
-- Monthly marketing spend per location per channel
create table if not exists spend (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id),
  channel text,
  period_start date not null,
  period_end date not null,
  amount numeric default 0,
  synced_at timestamptz default now(),
  unique (location_id, channel, period_start)  -- prevents duplicates on sync
);

create index if not exists spend_location_id_idx on spend(location_id);
create index if not exists spend_period_start_idx on spend(period_start);

-- ============================================================
-- ROW LEVEL SECURITY
-- Franchisees can only see their own location's data.
-- Corporate users can see everything.
-- ============================================================

alter table locations enable row level security;
alter table profiles enable row level security;
alter table opportunities enable row level security;
alter table revenue enable row level security;
alter table spend enable row level security;

-- Locations: everyone can read
create policy "locations_read" on locations
  for select using (true);

-- Profiles: users can read their own; corporate can read all
create policy "profiles_read_own" on profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'corporate'
    )
  );

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Opportunities: franchisees see own location; corporate sees all
create policy "opportunities_read" on opportunities
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and (p.role = 'corporate' or p.location_id = opportunities.location_id)
    )
  );

-- Revenue: franchisees see own location; corporate sees all
create policy "revenue_read" on revenue
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and (p.role = 'corporate' or p.location_id = revenue.location_id)
    )
  );

-- Spend: franchisees see own location; corporate sees all
create policy "spend_read" on spend
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and (p.role = 'corporate' or p.location_id = spend.location_id)
    )
  );
