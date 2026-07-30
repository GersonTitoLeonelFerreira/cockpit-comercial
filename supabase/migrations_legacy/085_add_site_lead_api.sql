-- ============================================================================
-- 085_add_site_lead_api.sql
-- API de captação de leads vindos de sites externos.
--
-- Invariantes preservadas:
--   * leads = cadastro base;
--   * sales_cycles = operação comercial oficial;
--   * ciclos recebidos pela API sempre entram sem owner, no Pool;
--   * cycle_events registra a origem para auditoria e notificações futuras.
-- ============================================================================

begin;

create table if not exists public.company_lead_api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  secret_hash text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_used_lead_id uuid references public.leads(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  constraint company_lead_api_keys_name_not_blank check (char_length(btrim(name)) between 2 and 80),
  constraint company_lead_api_keys_prefix_not_blank check (char_length(btrim(key_prefix)) between 8 and 40),
  constraint company_lead_api_keys_hash_format check (secret_hash ~ '^[a-f0-9]{64}$')
);

create unique index if not exists company_lead_api_keys_secret_hash_uniq
  on public.company_lead_api_keys(secret_hash);

create unique index if not exists company_lead_api_keys_company_active_name_uniq
  on public.company_lead_api_keys(company_id, lower(name))
  where revoked_at is null;

create index if not exists company_lead_api_keys_company_active_created_idx
  on public.company_lead_api_keys(company_id, created_at desc)
  where revoked_at is null;

alter table public.company_lead_api_keys enable row level security;

-- A tabela é acessada apenas por rotas server-side com service role.
revoke all on table public.company_lead_api_keys from anon, authenticated;

-- A view oficial do Pool passa a expor a origem do cadastro, sem alterar
-- nenhuma coluna já consumida pelas telas existentes.
create or replace view public.v_pipeline_items
with (security_invoker = true)
as
select
  sc.id,
  sc.lead_id,
  l.name,
  l.phone,
  coalesce(nullif(l.email, ''), lp.email) as email,
  lp.cpf,
  lp.cnpj,
  coalesce(nullif(lp.cpf, ''), nullif(lp.cnpj, ''), nullif(l.cpf_cnpj, '')) as document,
  sc.status,
  sc.stage_entered_at,
  sc.owner_user_id as owner_id,
  sc.current_group_id as group_id,
  sc.next_action,
  sc.next_action_date,
  sc.created_at,
  sc.company_id,
  regexp_replace(coalesce(l.phone, ''), '\\D', '', 'g') as phone_digits,
  regexp_replace(
    coalesce(nullif(lp.cpf, ''), nullif(lp.cnpj, ''), nullif(l.cpf_cnpj, ''), ''),
    '\\D',
    '',
    'g'
  ) as document_digits,
  sc.updated_at,
  l.entry_mode,
  l.source,
  l.external_key,
  l.lead_origin_at
from public.sales_cycles sc
join public.leads l
  on l.id = sc.lead_id
left join public.lead_profiles lp
  on lp.lead_id = sc.lead_id
 and lp.company_id = sc.company_id
where l.deleted_at is null;

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
    case when length(coalesce(p_document, '')) = 11 then p_document else null end,
    case when length(coalesce(p_document, '')) = 14 then p_document else null end,
    p_email,
    'Brasil'
  )
  on conflict (lead_id) do nothing;

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
    null,
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
        'utm_campaign', nullif(p_metadata ->> 'utm_campaign', '')
      )
    ),
    now()
  );

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
