-- Add sort_order column to attorneys for manual signature block ordering.
ALTER TABLE public.attorneys
  ADD COLUMN IF NOT EXISTS sort_order integer;
