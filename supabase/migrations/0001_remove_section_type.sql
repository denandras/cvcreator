-- Migration: Remove section_type column from cv_sections
-- The section_type column was a hardcoded category with no real purpose.
-- Section names are now free-text, controlled entirely by the user.
-- Run this against your Supabase project to drop the column.

alter table public.cv_sections
  drop column if exists section_type;