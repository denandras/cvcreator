-- CV Creator — Database Schema
-- Project: mofjsgpwzgisgvgukdmr (cvcreator)
-- Run via Supabase SQL Editor or psql

-- ============================================================================
-- PROFILES
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_design_config jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================================
-- CVS (a user can have multiple CVs)
-- ============================================================================
create table if not exists public.cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'My CV',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================================
-- SECTIONS
-- ============================================================================
create table if not exists public.cv_sections (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null references public.cvs(id) on delete cascade,
  title text not null,
  section_type text default 'custom', -- education, experience, skills, awards, projects, custom
  is_enabled boolean default true,
  sort_order int default 0,           -- custom ordering of sections within a CV
  entry_sort_mode text default 'year_desc', -- year_asc, year_desc, custom
  layout_config jsonb default '{}'::jsonb,  -- per-section layout options
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================================
-- ENTRIES (items within a section)
-- ============================================================================
create table if not exists public.cv_entries (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.cv_sections(id) on delete cascade,
  year int,
  is_enabled boolean default true,
  sort_order int default 0,           -- custom ordering within section
  data jsonb default '{}'::jsonb,     -- flexible: title, organization, description, etc.
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================================
-- TRANSLATIONS (multilingual content for entries)
-- ============================================================================
create table if not exists public.cv_translations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.cv_entries(id) on delete cascade,
  language text not null default 'en', -- en, hu, de, fr, etc.
  title text,
  organization text,
  description text,
  data jsonb default '{}'::jsonb,     -- any additional translated fields
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(entry_id, language)
);

-- ============================================================================
-- DESIGN SETTINGS (per-CV design configuration)
-- ============================================================================
create table if not exists public.cv_designs (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null unique references public.cvs(id) on delete cascade,
  template text default 'clean',      -- clean, modern, creative, minimalist
  font_family text default 'inter',
  primary_color text default '#1a1a1a',
  accent_color text default '#4f46e5',
  spacing text default 'normal',      -- compact, normal, relaxed
  border_radius int default 8,        -- px
  page_margin int default 48,         -- px
  custom_config jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================================
-- INDEXES
-- ============================================================================
create index if not exists idx_cvs_user on public.cvs(user_id);
create index if not exists idx_sections_cv on public.cv_sections(cv_id);
create index if not exists idx_entries_section on public.cv_entries(section_id);
create index if not exists idx_translations_entry on public.cv_translations(entry_id);

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.cvs enable row level security;
alter table public.cv_sections enable row level security;
alter table public.cv_entries enable row level security;
alter table public.cv_translations enable row level security;
alter table public.cv_designs enable row level security;

-- Profiles: users can see/edit only their own profile
create policy "Profiles are viewable by own user"
  on public.profiles for select using (auth.uid() = id);
create policy "Profiles are insertable by own user"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Profiles are updatable by own user"
  on public.profiles for update using (auth.uid() = id);

-- CVs: users can CRUD only their own CVs
create policy "CVs are viewable by own user"
  on public.cvs for select using (auth.uid() = user_id);
create policy "CVs are insertable by own user"
  on public.cvs for insert with check (auth.uid() = user_id);
create policy "CVs are updatable by own user"
  on public.cvs for update using (auth.uid() = user_id);
create policy "CVs are deletable by own user"
  on public.cvs for delete using (auth.uid() = user_id);

-- Sections: access through CV ownership
create policy "Sections are viewable by CV owner"
  on public.cv_sections for select using (
    exists (select 1 from public.cvs where cvs.id = cv_sections.cv_id and cvs.user_id = auth.uid())
  );
create policy "Sections are insertable by CV owner"
  on public.cv_sections for insert with check (
    exists (select 1 from public.cvs where cvs.id = cv_sections.cv_id and cvs.user_id = auth.uid())
  );
create policy "Sections are updatable by CV owner"
  on public.cv_sections for update using (
    exists (select 1 from public.cvs where cvs.id = cv_sections.cv_id and cvs.user_id = auth.uid())
  );
create policy "Sections are deletable by CV owner"
  on public.cv_sections for delete using (
    exists (select 1 from public.cvs where cvs.id = cv_sections.cv_id and cvs.user_id = auth.uid())
  );

-- Entries: access through section → CV ownership
create policy "Entries are viewable by CV owner"
  on public.cv_entries for select using (
    exists (select 1 from public.cv_sections
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_sections.id = cv_entries.section_id and cvs.user_id = auth.uid())
  );
create policy "Entries are insertable by CV owner"
  on public.cv_entries for insert with check (
    exists (select 1 from public.cv_sections
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_sections.id = cv_entries.section_id and cvs.user_id = auth.uid())
  );
create policy "Entries are updatable by CV owner"
  on public.cv_entries for update using (
    exists (select 1 from public.cv_sections
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_sections.id = cv_entries.section_id and cvs.user_id = auth.uid())
  );
create policy "Entries are deletable by CV owner"
  on public.cv_entries for delete using (
    exists (select 1 from public.cv_sections
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_sections.id = cv_entries.section_id and cvs.user_id = auth.uid())
  );

-- Translations: access through entry → section → CV ownership
create policy "Translations are viewable by CV owner"
  on public.cv_translations for select using (
    exists (select 1 from public.cv_entries
      join public.cv_sections on cv_sections.id = cv_entries.section_id
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_entries.id = cv_translations.entry_id and cvs.user_id = auth.uid())
  );
create policy "Translations are insertable by CV owner"
  on public.cv_translations for insert with check (
    exists (select 1 from public.cv_entries
      join public.cv_sections on cv_sections.id = cv_entries.section_id
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_entries.id = cv_translations.entry_id and cvs.user_id = auth.uid())
  );
create policy "Translations are updatable by CV owner"
  on public.cv_translations for update using (
    exists (select 1 from public.cv_entries
      join public.cv_sections on cv_sections.id = cv_entries.section_id
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_entries.id = cv_translations.entry_id and cvs.user_id = auth.uid())
  );
create policy "Translations are deletable by CV owner"
  on public.cv_translations for delete using (
    exists (select 1 from public.cv_entries
      join public.cv_sections on cv_sections.id = cv_entries.section_id
      join public.cvs on cvs.id = cv_sections.cv_id
      where cv_entries.id = cv_translations.entry_id and cvs.user_id = auth.uid())
  );

-- Designs: access through CV ownership
create policy "Designs are viewable by CV owner"
  on public.cv_designs for select using (
    exists (select 1 from public.cvs where cvs.id = cv_designs.cv_id and cvs.user_id = auth.uid())
  );
create policy "Designs are insertable by CV owner"
  on public.cv_designs for insert with check (
    exists (select 1 from public.cvs where cvs.id = cv_designs.cv_id and cvs.user_id = auth.uid())
  );
create policy "Designs are updatable by CV owner"
  on public.cv_designs for update using (
    exists (select 1 from public.cvs where cvs.id = cv_designs.cv_id and cvs.user_id = auth.uid())
  );
create policy "Designs are deletable by CV owner"
  on public.cv_designs for delete using (
    exists (select 1 from public.cvs where cvs.id = cv_designs.cv_id and cvs.user_id = auth.uid())
  );

-- ============================================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- TRIGGER: auto-create default CV + design on profile creation
-- ============================================================================
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_cv_id uuid;
begin
  insert into public.cvs (user_id, title) values (new.id, 'My CV') returning id into new_cv_id;
  insert into public.cv_designs (cv_id) values (new_cv_id);
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();