-- Bhoj Ki Khoj Smart Meal Finder schema
-- Run in Supabase SQL Editor in a DEVELOPMENT project first.
-- If your project already has these tables, adapt the existing schema instead of rerunning blindly.

create table if not exists public.chef_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  kitchen_name text not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  constraint chef_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint chef_longitude_range check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  chef_id uuid not null constraint meals_chef_id_fkey
    references public.chef_profiles(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  food_type text not null check (food_type in ('veg', 'non_veg', 'vegan', 'jain')),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snacks')),
  is_available boolean not null default true,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists meals_available_price_idx
  on public.meals (price) where is_available = true;
create index if not exists meals_chef_id_idx on public.meals (chef_id);
create index if not exists chef_profiles_verification_idx
  on public.chef_profiles (verification_status);

alter table public.chef_profiles enable row level security;
alter table public.meals enable row level security;

-- Public reads only verified chefs' profiles.
drop policy if exists "Public can view verified chef profiles" on public.chef_profiles;
create policy "Public can view verified chef profiles"
on public.chef_profiles for select to anon, authenticated
using (verification_status = 'verified');

-- Public reads only available meals owned by verified chefs.
drop policy if exists "Public can view available verified meals" on public.meals;
create policy "Public can view available verified meals"
on public.meals for select to anon, authenticated
using (
  is_available = true
  and exists (
    select 1
    from public.chef_profiles c
    where c.id = meals.chef_id
      and c.verification_status = 'verified'
  )
);

-- Ensure API roles have SELECT permission; RLS still applies.
grant select on public.chef_profiles to anon, authenticated;
grant select on public.meals to anon, authenticated;

-- IMPORTANT:
-- Do not add public INSERT/UPDATE/DELETE policies.
-- Add separate authenticated owner/admin policies for your existing vendor/admin workflows.
-- The SQL above intentionally does not grant vendors permission to change verification_status.
