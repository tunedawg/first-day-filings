-- ============================================================
-- First Day Filings — initial schema
-- Run this in Supabase dashboard → SQL Editor, or via supabase db push.
-- ============================================================

-- ─── organizations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text UNIQUE NOT NULL,
  phone            text,
  address          text,
  state            text DEFAULT 'Missouri',
  practice_area    text DEFAULT 'Employment Litigation',
  created_at       timestamptz DEFAULT now()
);

-- ─── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  uuid REFERENCES public.organizations(id),
  full_name        text,
  role             text CHECK (role IN ('admin', 'attorney', 'paralegal')) DEFAULT 'attorney',
  user_preferences jsonb DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT now()
);

-- ─── attorneys ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attorneys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name        text NOT NULL,
  bar_number       text NOT NULL,
  email            text,
  role             text CHECK (role IN ('attorney', 'paralegal', 'admin')) DEFAULT 'attorney',
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- ─── cases ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id),
  created_by       uuid REFERENCES public.profiles(id),
  petitioner_name  text,
  respondent_name  text,
  case_type        text,
  intake_fields    jsonb,
  status           text CHECK (status IN ('draft', 'generated', 'filed')) DEFAULT 'draft',
  drive_folder_url text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ─── generated_documents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  document_type   text,
  drive_file_url  text,
  generated_at    timestamptz DEFAULT now()
);

-- ─── uploads ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uploads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  storage_path      text,
  original_filename text,
  uploaded_at       timestamptz DEFAULT now()
);

-- ─── events (audit log) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES public.profiles(id),
  action     text NOT NULL,
  metadata   jsonb,
  created_at timestamptz DEFAULT now()
);

-- ─── Helper functions (after tables exist) ────────────────────────────────────
-- SECURITY DEFINER so they can read profiles without RLS interference.
CREATE OR REPLACE FUNCTION get_my_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_own"
  ON public.organizations FOR SELECT
  USING (id = get_my_organization_id());

CREATE POLICY "org_update_admin"
  ON public.organizations FOR UPDATE
  USING (id = get_my_organization_id() AND get_my_role() = 'admin')
  WITH CHECK (id = get_my_organization_id() AND get_my_role() = 'admin');

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_org"
  ON public.profiles FOR SELECT
  USING (organization_id = get_my_organization_id());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

ALTER TABLE public.attorneys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attorneys_select_org"
  ON public.attorneys FOR SELECT
  USING (organization_id = get_my_organization_id());

CREATE POLICY "attorneys_insert_admin"
  ON public.attorneys FOR INSERT
  WITH CHECK (organization_id = get_my_organization_id() AND get_my_role() = 'admin');

CREATE POLICY "attorneys_update_admin"
  ON public.attorneys FOR UPDATE
  USING (organization_id = get_my_organization_id() AND get_my_role() = 'admin')
  WITH CHECK (organization_id = get_my_organization_id() AND get_my_role() = 'admin');

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cases_select_org"
  ON public.cases FOR SELECT
  USING (organization_id = get_my_organization_id());

CREATE POLICY "cases_insert_org"
  ON public.cases FOR INSERT
  WITH CHECK (organization_id = get_my_organization_id());

CREATE POLICY "cases_update_org"
  ON public.cases FOR UPDATE
  USING (organization_id = get_my_organization_id())
  WITH CHECK (organization_id = get_my_organization_id());

ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_docs_select_org"
  ON public.generated_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = generated_documents.case_id
        AND cases.organization_id = get_my_organization_id()
    )
  );

CREATE POLICY "generated_docs_insert_org"
  ON public.generated_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = generated_documents.case_id
        AND cases.organization_id = get_my_organization_id()
    )
  );

ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uploads_select_org"
  ON public.uploads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = uploads.case_id
        AND cases.organization_id = get_my_organization_id()
    )
  );

CREATE POLICY "uploads_insert_org"
  ON public.uploads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = uploads.case_id
        AND cases.organization_id = get_my_organization_id()
    )
  );

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_insert_org"
  ON public.events FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      case_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.cases
        WHERE cases.id = events.case_id
          AND cases.organization_id = get_my_organization_id()
      )
    )
  );

CREATE POLICY "events_select_admin"
  ON public.events FOR SELECT
  USING (
    get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = events.case_id
        AND cases.organization_id = get_my_organization_id()
    )
  );

-- ─── Trigger: auto-update cases.updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_cases_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_updated_at ON public.cases;
CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION update_cases_updated_at();

-- ─── Storage bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('petition-uploads', 'petition-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_upload_org"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'petition-uploads'
    AND (storage.foldername(name))[1] = get_my_organization_id()::text
  );

CREATE POLICY "storage_read_org"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'petition-uploads'
    AND (storage.foldername(name))[1] = get_my_organization_id()::text
  );
