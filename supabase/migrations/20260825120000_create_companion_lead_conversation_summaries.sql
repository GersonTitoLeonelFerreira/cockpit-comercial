-- Yolen Companion - Reconstrução controlada, Etapa 1
-- "Resumo persistente do lead": a nova fonte única de verdade sobre o que
-- a Yolen já sabe, de forma resumida, sobre o relacionamento comercial com
-- um lead até o último salvamento explícito do vendedor.
--
-- Diferente de public.companion_conversation_registrations (Fase 12A, log
-- append-only de registros pontuais por watermark): esta tabela guarda
-- UMA linha "atual" por (company_id, lead_id), atualizada por
-- compare-and-set (expected_version) via RPC, nunca sobrescrita
-- silenciosamente.
--
-- Fonte única para dois consumidores com modelos de autenticação distintos:
-- - Companion (extensão): sessão HMAC própria, sempre via service_role e
--   checagens explícitas de membership/ownership no loader TypeScript
--   (mesmo padrão de companion-conversation-registration-loader.ts), leitura
--   direta na tabela e escrita via RPC compare-and-set abaixo;
-- - Página do lead na Yolen: sessão Supabase Auth do usuário, RLS aplicada
--   via can_select_lead_base_strict (mesma função que já rege leads/
--   sales_cycles), somente leitura nesta etapa.

create table public.companion_lead_conversation_summaries (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  lead_id uuid not null,

  conversation_key text not null,

  summary text not null,
  version integer not null default 1,

  last_message_watermark text not null default '',

  created_at timestamp with time zone
    default clock_timestamp()
    not null,

  updated_at timestamp with time zone
    default clock_timestamp()
    not null,

  created_by uuid not null,
  updated_by uuid not null,

  constraint companion_lead_conversation_summaries_lead_fkey
    foreign key (lead_id)
    references public.leads (id)
    on delete cascade,

  constraint companion_lead_conversation_summaries_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key) between 1 and 500
    ),

  constraint companion_lead_conversation_summaries_summary_check
    check (
      summary = btrim(summary)
      and char_length(summary) between 1 and 8000
    ),

  constraint companion_lead_conversation_summaries_version_check
    check (version >= 1),

  constraint companion_lead_conversation_summaries_watermark_check
    check (char_length(last_message_watermark) <= 200)
);

create unique index
  companion_lead_conversation_summaries_lead_uidx
on public.companion_lead_conversation_summaries (
  company_id,
  lead_id
);

create index
  companion_lead_conversation_summaries_company_updated_idx
on public.companion_lead_conversation_summaries (
  company_id,
  updated_at desc
);

alter table
  public.companion_lead_conversation_summaries
enable row level security;

alter table
  public.companion_lead_conversation_summaries
force row level security;

-- Leitura pela página do lead na Yolen: mesma regra de portfólio que já
-- protege public.leads (admin/manager veem tudo da empresa; vendedor vê
-- somente leads de sua carteira, incluindo ciclos que possui).
create policy
  companion_lead_conversation_summaries_select_by_lead_access
on public.companion_lead_conversation_summaries
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.leads lead
    where lead.id = companion_lead_conversation_summaries.lead_id
      and lead.company_id = companion_lead_conversation_summaries.company_id
      and public.can_select_lead_base_strict(
        lead.company_id,
        lead.id,
        lead.owner_id,
        lead.created_by,
        lead.deleted_at
      )
  )
);

create policy
  companion_lead_conversation_summaries_insert_block_authenticated
on public.companion_lead_conversation_summaries
as permissive
for insert
to authenticated
with check (false);

create policy
  companion_lead_conversation_summaries_update_block_authenticated
on public.companion_lead_conversation_summaries
as permissive
for update
to authenticated
using (false)
with check (false);

create policy
  companion_lead_conversation_summaries_delete_block_authenticated
on public.companion_lead_conversation_summaries
as permissive
for delete
to authenticated
using (false);

revoke all
on table public.companion_lead_conversation_summaries
from public, anon, authenticated, service_role;

grant select
on table public.companion_lead_conversation_summaries
to authenticated;

grant select
on table public.companion_lead_conversation_summaries
to service_role;

-- ---------------------------------------------------------------------------
-- rpc_save_companion_lead_conversation_summary
-- Compare-and-set: só grava se expected_version ainda for a versão atual da
-- linha (ou 0/null quando ainda não existe nenhuma). Caso contrário, retorna
-- conflict = true com a versão atual, sem tocar na linha existente — nunca
-- sobrescreve silenciosamente. Chamada somente por service_role (Companion),
-- após o loader TypeScript já ter validado membership/ownership.
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_save_companion_lead_conversation_summary(
    p_company_id uuid,
    p_lead_id uuid,
    p_actor_user_id uuid,
    p_conversation_key text,
    p_summary text,
    p_expected_version integer,
    p_last_message_watermark text default ''
  )
returns table (
  id uuid,
  company_id uuid,
  lead_id uuid,
  conversation_key text,
  summary text,
  version integer,
  last_message_watermark text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  conflict boolean,
  current_version integer
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_conversation_key text;
  v_summary text;
  v_watermark text;
  v_lead_company_id uuid;
  v_row public.companion_lead_conversation_summaries%rowtype;
begin
  if p_company_id is null then
    raise exception 'company_id é obrigatório';
  end if;

  if p_lead_id is null then
    raise exception 'lead_id é obrigatório';
  end if;

  if p_actor_user_id is null then
    raise exception 'actor_user_id é obrigatório';
  end if;

  v_conversation_key :=
    nullif(btrim(coalesce(p_conversation_key, '')), '');

  if v_conversation_key is null
    or char_length(v_conversation_key) > 500
  then
    raise exception 'conversation_key inválido';
  end if;

  v_summary :=
    nullif(btrim(coalesce(p_summary, '')), '');

  if v_summary is null
    or char_length(v_summary) > 8000
  then
    raise exception 'summary inválido';
  end if;

  v_watermark := coalesce(btrim(coalesce(p_last_message_watermark, '')), '');

  if char_length(v_watermark) > 200 then
    raise exception 'last_message_watermark inválido';
  end if;

  select lead.company_id
  into v_lead_company_id
  from public.leads lead
  where lead.id = p_lead_id
    and lead.deleted_at is null
  for share;

  if not found or v_lead_company_id <> p_company_id then
    raise exception 'Lead não encontrado para a empresa informada';
  end if;

  select *
  into v_row
  from public.companion_lead_conversation_summaries existing
  where existing.company_id = p_company_id
    and existing.lead_id = p_lead_id
  for update;

  if not found then
    if p_expected_version is not null and p_expected_version <> 0 then
      return query
      select
        null::uuid, p_company_id, p_lead_id, v_conversation_key,
        null::text, null::integer, null::text,
        null::timestamp with time zone, null::timestamp with time zone,
        null::uuid, null::uuid,
        true, 0;
      return;
    end if;

    insert into public.companion_lead_conversation_summaries (
      company_id, lead_id, conversation_key, summary, version,
      last_message_watermark, created_by, updated_by
    )
    values (
      p_company_id, p_lead_id, v_conversation_key, v_summary, 1,
      v_watermark, p_actor_user_id, p_actor_user_id
    )
    returning * into v_row;

    return query
    select
      v_row.id, v_row.company_id, v_row.lead_id, v_row.conversation_key,
      v_row.summary, v_row.version, v_row.last_message_watermark,
      v_row.created_at, v_row.updated_at, v_row.created_by, v_row.updated_by,
      false, v_row.version;
    return;
  end if;

  if p_expected_version is null or p_expected_version <> v_row.version then
    return query
    select
      v_row.id, v_row.company_id, v_row.lead_id, v_row.conversation_key,
      v_row.summary, v_row.version, v_row.last_message_watermark,
      v_row.created_at, v_row.updated_at, v_row.created_by, v_row.updated_by,
      true, v_row.version;
    return;
  end if;

  update public.companion_lead_conversation_summaries
  set
    summary = v_summary,
    version = v_row.version + 1,
    conversation_key = v_conversation_key,
    last_message_watermark = v_watermark,
    updated_by = p_actor_user_id,
    updated_at = clock_timestamp()
  where companion_lead_conversation_summaries.id = v_row.id
  returning * into v_row;

  return query
  select
    v_row.id, v_row.company_id, v_row.lead_id, v_row.conversation_key,
    v_row.summary, v_row.version, v_row.last_message_watermark,
    v_row.created_at, v_row.updated_at, v_row.created_by, v_row.updated_by,
    false, v_row.version;
end;
$$;

revoke all
on function
  public.rpc_save_companion_lead_conversation_summary(
    uuid, uuid, uuid, text, text, integer, text
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_save_companion_lead_conversation_summary(
    uuid, uuid, uuid, text, text, integer, text
  )
to service_role;
