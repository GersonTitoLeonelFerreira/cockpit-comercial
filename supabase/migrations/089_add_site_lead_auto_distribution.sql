-- ============================================================================
-- 089_add_site_lead_auto_distribution.sql
--
-- Leads recebidos pela API do site são distribuídos em rodízio entre vendedores
-- ativos (role member) no mesmo momento em que o ciclo é criado.
-- Quando não houver vendedor ativo, o lead permanece no Pool como contingência.
-- ============================================================================

begin;

create table if not exists public.company_site_lead_distribution (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_assigned_owner_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.company_site_lead_distribution enable row level security;

revoke all on table public.company_site_lead_distribution from anon, authenticated;

grant all on table public.company_site_lead_distribution to service_role;

create or replace function public.rpc_ingest_site_lead(
  p_company_id uuid,
  p_created_by uuid,
  p_api_key_id uuid,
  p_source text,
  p_name text,
  p_phone text,
  p_email text,
  p_document text,
  p_notes text,
  p_campaign_name text,
  p_external_key text,
  p_external_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  result text,
  lead_id uuid,
  cycle_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_lead_id uuid;
  v_existing_deleted_at timestamptz;
  v_existing_external_key text;
  v_lead_id uuid;
  v_cycle_id uuid;
  v_lead_type text;
  v_candidate_owner_ids uuid[] := array[]::uuid[];
  v_last_assigned_owner_id uuid;
  v_assigned_owner_id uuid;
  v_candidate_count integer := 0;
  v_last_position integer;
  v_next_position integer;
begin
  if not exists (
    select 1
    from public.company_lead_api_keys k
    where k.id = p_api_key_id
      and k.company_id = p_company_id
      and k.revoked_at is null
  ) then
    raise exception 'Chave de integração inválida ou revogada.' using errcode = '42501';
  end if;

  select
    l.id,
    l.deleted_at,
    l.external_key
  into
    v_existing_lead_id,
    v_existing_deleted_at,
    v_existing_external_key
  from public.leads l
  left join public.lead_profiles lp
    on lp.lead_id = l.id
   and lp.company_id = l.company_id
  where l.company_id = p_company_id
    and (
      (p_external_key is not null and l.external_key = p_external_key)
      or (p_document is not null and (l.cpf_cnpj = p_document or lp.cpf = p_document or lp.cnpj = p_document))
      or (p_phone is not null and l.phone_norm = p_phone)
      or (p_email is not null and l.email_norm = p_email)
    )
  order by
    case when p_external_key is not null and l.external_key = p_external_key then 0 else 1 end,
    l.created_at asc
  limit 1;

  if v_existing_lead_id is not null then
    select sc.id
      into v_cycle_id
    from public.sales_cycles sc
    where sc.company_id = p_company_id
      and sc.lead_id = v_existing_lead_id
    order by sc.created_at desc
    limit 1;

    update public.company_lead_api_keys
       set last_used_at = now(),
           last_used_lead_id = v_existing_lead_id
     where id = p_api_key_id;

    if p_external_key is not null and v_existing_external_key = p_external_key then
      return query select 'duplicate'::text, v_existing_lead_id, v_cycle_id, null::text;
      return;
    end if;

    if v_existing_deleted_at is not null then
      return query select 'conflict'::text, v_existing_lead_id, v_cycle_id, 'deleted_lead_conflict'::text;
      return;
    end if;

    return query select 'conflict'::text, v_existing_lead_id, v_cycle_id, 'active_lead_conflict'::text;
    return;
  end if;

  -- Trava o ponteiro do rodízio por empresa para impedir que entradas concorrentes
  -- escolham o mesmo vendedor.
  insert into public.company_site_lead_distribution (company_id)
  values (p_company_id)
  on conflict (company_id) do nothing;

  select last_assigned_owner_id
    into v_last_assigned_owner_id
  from public.company_site_lead_distribution
  where company_id = p_company_id
  for update;

  -- O Kanban e as ações de distribuição tratam role member como vendedor.
  select coalesce(
    array_agg(cm.user_id order by lower(coalesce(p.full_name, p.email, '')), cm.user_id),
    array[]::uuid[]
  )
    into v_candidate_owner_ids
  from public.company_memberships cm
  join public.profiles p
    on p.id = cm.user_id
  where cm.company_id = p_company_id
    and cm.is_active = true
    and cm.role = 'member'
    and coalesce(p.is_active_global, true) = true;

  v_candidate_count := coalesce(array_length(v_candidate_owner_ids, 1), 0);

  if v_candidate_count > 0 then
    v_last_position := array_position(v_candidate_owner_ids, v_last_assigned_owner_id);
    v_next_position := coalesce(v_last_position, 0) + 1;

    if v_next_position > v_candidate_count then
      v_next_position := 1;
    end if;

    v_assigned_owner_id := v_candidate_owner_ids[v_next_position];
  end if;

  v_lead_type := case
    when length(coalesce(p_document, '')) = 11 then 'PF'
    when length(coalesce(p_document, '')) = 14 then 'PJ'
    else null
  end;

  insert into public.leads (
    company_id,
    name,
    phone,
    phone_norm,
    email,
    email_norm,
    cpf_cnpj,
    notes,
    campaign_name,
    source,
    external_key,
    entry_mode,
    lead_origin_at,
    created_by
  )
  values (
    p_company_id,
    p_name,
    p_phone,
    p_phone,
    p_email,
    p_email,
    p_document,
    p_notes,
    p_campaign_name,
    p_source,
    p_external_key,
    'import_api',
    now(),
    p_created_by
  )
  returning id into v_lead_id;

  if v_lead_type is not null then
    insert into public.lead_profiles (
      lead_id,
      company_id,
      lead_type,
      cpf,
      cnpj,
      email,
      address_country
    )
    values (
      v_lead_id,
      p_company_id,
      v_lead_type,
      case when v_lead_type = 'PF' then p_document else null end,
      case when v_lead_type = 'PJ' then p_document else null end,
      p_email,
      'Brasil'
    )
    on conflict do nothing;
  end if;

  insert into public.sales_cycles (
    company_id,
    lead_id,
    owner_user_id,
    status,
    stage_entered_at
  )
  values (
    p_company_id,
    v_lead_id,
    v_assigned_owner_id,
    'novo',
    now()
  )
  returning id into v_cycle_id;

  insert into public.cycle_events (
    company_id,
    cycle_id,
    event_type,
    created_by,
    metadata,
    occurred_at
  )
  values (
    p_company_id,
    v_cycle_id,
    'cycle_created',
    p_created_by,
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'site_api',
        'entry_mode', 'import_api',
        'api_key_id', p_api_key_id,
        'source_label', p_source,
        'external_id', p_external_id,
        'campaign_name', p_campaign_name,
        'form_name', nullif(p_metadata ->> 'form_name', ''),
        'page_url', nullif(p_metadata ->> 'page_url', ''),
        'utm_source', nullif(p_metadata ->> 'utm_source', ''),
        'utm_medium', nullif(p_metadata ->> 'utm_medium', ''),
        'utm_campaign', nullif(p_metadata ->> 'utm_campaign', ''),
        'distribution_mode', case when v_assigned_owner_id is null then 'pool_fallback' else 'round_robin' end,
        'assigned_owner_id', v_assigned_owner_id,
        'priority', case when v_assigned_owner_id is null then null else 'site_lead' end
      )
    ),
    now()
  );

  if v_assigned_owner_id is not null then
    update public.company_site_lead_distribution
       set last_assigned_owner_id = v_assigned_owner_id,
           updated_at = now()
     where company_id = p_company_id;

    insert into public.cycle_events (
      company_id,
      cycle_id,
      event_type,
      created_by,
      metadata,
      occurred_at
    )
    values (
      p_company_id,
      v_cycle_id,
      'assigned',
      p_created_by,
      jsonb_build_object(
        'to_owner', v_assigned_owner_id,
        'source', 'site_api_auto_distribution',
        'distribution_mode', 'round_robin',
        'priority', 'site_lead'
      ),
      now()
    );
  end if;

  update public.company_lead_api_keys
     set last_used_at = now(),
         last_used_lead_id = v_lead_id
   where id = p_api_key_id;

  return query select 'created'::text, v_lead_id, v_cycle_id, null::text;
end;
$$;

revoke all on function public.rpc_ingest_site_lead(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.rpc_ingest_site_lead(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb
) to service_role;

commit;
