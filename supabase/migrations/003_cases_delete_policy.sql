-- Allow org members to delete their own org's cases.
CREATE POLICY "cases_delete_org"
  ON public.cases FOR DELETE
  USING (organization_id = get_my_organization_id());
