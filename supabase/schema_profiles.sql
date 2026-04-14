-- ============================================================
-- MaidThis Franchise Hub — Profile Schema Update
-- Run this in Supabase: SQL Editor → New Query → Paste → Run
-- ============================================================

-- Update profiles table with personal fields
alter table profiles
  add column if not exists avatar_url text,
  add column if not exists email text,
  add column if not exists mailing_street text,
  add column if not exists mailing_city text,
  add column if not exists mailing_state text,
  add column if not exists mailing_zip text,
  add column if not exists tshirt_size text,
  add column if not exists fav_coffee text,
  add column if not exists fav_fast_food text,
  add column if not exists fav_treat text,
  add column if not exists shoe_size text,
  add column if not exists sports_team text,
  add column if not exists hobby text;

-- Business profiles — separate table since it's distinct from personal info
create table if not exists business_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade unique,
  territory text,
  dba text,
  open_date date,
  status text default 'active' check (status in ('active', 'pending', 'inactive')),
  zip_codes text[] default '{}',
  gbp_address text,
  website text,
  gbp_link text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for business_profiles
alter table business_profiles enable row level security;

-- Franchisees can read/write their own; corporate can read all
create policy "business_profiles_read" on business_profiles
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'corporate'
    )
  );

create policy "business_profiles_write" on business_profiles
  for all using (profile_id = auth.uid());
