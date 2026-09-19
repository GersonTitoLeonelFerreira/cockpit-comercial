-- Yolen Companion V2 - Fase 2
-- Separa as políticas de escrita para evitar que FOR ALL também participe de
-- SELECT e gere políticas permissivas sobrepostas no advisor do Supabase.

drop policy if exists company_commercial_method_steps_write
  on public.company_commercial_method_steps;

create policy company_commercial_method_steps_insert
  on public.company_commercial_method_steps
  for insert
  to authenticated
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_method_steps.company_id
        and v.id = company_commercial_method_steps.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_method_steps_update
  on public.company_commercial_method_steps
  for update
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_method_steps.company_id
        and v.id = company_commercial_method_steps.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_method_steps.company_id
        and v.id = company_commercial_method_steps.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_method_steps_delete
  on public.company_commercial_method_steps
  for delete
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_method_steps.company_id
        and v.id = company_commercial_method_steps.config_version_id
        and v.status = 'draft'
    )
  );

drop policy if exists company_commercial_product_profiles_write
  on public.company_commercial_product_profiles;

create policy company_commercial_product_profiles_insert
  on public.company_commercial_product_profiles
  for insert
  to authenticated
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_product_profiles.company_id
        and v.id = company_commercial_product_profiles.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_product_profiles_update
  on public.company_commercial_product_profiles
  for update
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_product_profiles.company_id
        and v.id = company_commercial_product_profiles.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_product_profiles.company_id
        and v.id = company_commercial_product_profiles.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_product_profiles_delete
  on public.company_commercial_product_profiles
  for delete
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_product_profiles.company_id
        and v.id = company_commercial_product_profiles.config_version_id
        and v.status = 'draft'
    )
  );

drop policy if exists company_commercial_facts_write
  on public.company_commercial_facts;

create policy company_commercial_facts_insert
  on public.company_commercial_facts
  for insert
  to authenticated
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_facts.company_id
        and v.id = company_commercial_facts.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_facts_update
  on public.company_commercial_facts
  for update
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_facts.company_id
        and v.id = company_commercial_facts.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_facts.company_id
        and v.id = company_commercial_facts.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_facts_delete
  on public.company_commercial_facts
  for delete
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_facts.company_id
        and v.id = company_commercial_facts.config_version_id
        and v.status = 'draft'
    )
  );

drop policy if exists company_commercial_objection_guides_write
  on public.company_commercial_objection_guides;

create policy company_commercial_objection_guides_insert
  on public.company_commercial_objection_guides
  for insert
  to authenticated
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_objection_guides.company_id
        and v.id = company_commercial_objection_guides.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_objection_guides_update
  on public.company_commercial_objection_guides
  for update
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_objection_guides.company_id
        and v.id = company_commercial_objection_guides.config_version_id
        and v.status = 'draft'
    )
  )
  with check (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_objection_guides.company_id
        and v.id = company_commercial_objection_guides.config_version_id
        and v.status = 'draft'
    )
  );

create policy company_commercial_objection_guides_delete
  on public.company_commercial_objection_guides
  for delete
  to authenticated
  using (
    (
      select private.has_company_commercial_access(
        company_id,
        array['admin']
      )
    )
    and exists (
      select 1
      from public.company_commercial_config_versions v
      where v.company_id = company_commercial_objection_guides.company_id
        and v.id = company_commercial_objection_guides.config_version_id
        and v.status = 'draft'
    )
  );
