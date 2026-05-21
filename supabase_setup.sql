-- Run this in your Supabase SQL editor
-- (same Supabase project as First Day Filings)

-- Stores shared OAuth tokens (Box, Google) and other app-wide settings
create table if not exists app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Only service role can read/write (never exposed to client)
alter table app_settings enable row level security;

-- No RLS policies = only service key can access (correct behavior)
-- The Flask backend uses SUPABASE_SERVICE_KEY, so it bypasses RLS
