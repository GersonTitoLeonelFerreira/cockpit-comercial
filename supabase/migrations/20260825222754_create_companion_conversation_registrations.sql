-- Yolen Companion - Fase 12A
-- "Registrar conversa": registro factual e idempotente de um resumo da
-- conversa atual no histórico do lead.
--
-- Esta estrutura:
-- - é independente da análise profunda (V2) e não depende dela;
-- - não altera CRM (sales_cycles.status/next_action/next_contact_at) nem
--   Agenda;
-- - guarda o texto do resumo (ao contrário de companion_action_events, que
--   proíbe conteúdo de conversa por desenho — aqui o conteúdo É o produto);
-- - é idempotente por (company_id, cycle_id, watermark): o watermark é um
--   hash canônico derivado server-side do snapshot de mensagens vigente
--   (conversation_messages), então cliques repetidos com a mesma versão da
--   conversa nunca duplicam o registro;
-- - permanece acessível somente por operações server-side (service_role),
--   sempre através da RPC abaixo.

create table public.companion_conversation_registrations (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  cycle_id uuid not null,
  lead_id uuid not null,
  seller_user_id uuid not null,

  conversation_key text not null,
  watermark text not null,

  summary_text text not null,
  message_count integer not null,

  source text not null default 'yolen_companion_register_conversation',

  created_at timestamp with time zone
    default clock_timestamp()
    not null,

  constraint companion_conversation_registrations_cycle_fkey
    foreign key (
      company_id,
      cycle_id
    )
    references public.sales_cycles (
      company_id,
      id
    )
    on delete restrict,

  constraint companion_conversation_registrations_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key) between 1 and 500
    ),

  constraint companion_conversation_registrations_watermark_check
    check (
      watermark = btrim(watermark)
      and char_length(watermark) between 1 and 200
    ),

  constraint companion_conversation_registrations_summary_text_check
    check (
      summary_text = btrim(summary_text)
      and char_length(summary_text) between 1 and 4000
    ),

  constraint companion_conversation_registrations_message_count_check
    check (message_count >= 0)
);

create unique index
  companion_conversation_registrations_idempotency_uidx
on public.companion_conversation_registrations (
  company_id,
  cycle_id,
  watermark
);

create index
  companion_conversation_registrations_company_cycle_time_idx
on public.companion_conversation_registrations (
  company_id,
  cycle_id,
  created_at desc
);

create index
  companion_conversation_registrations_company_lead_time_idx
on public.companion_conversation_registrations (
  company_id,
  lead_id,
  created_at desc
);

alter table
  public.companion_conversation_registrations
enable row level security;

alter table
  public.companion_conversation_registrations
force row level security;

create policy
  companion_conversation_registrations_client_access_denied
on public.companion_conversation_registrations
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table public.companion_conversation_registrations
from public, anon, authenticated, service_role;

grant select
on table public.companion_conversation_registrations
to service_role;

-- ---------------------------------------------------------------------------
-- rpc_register_companion_conversation_summary
-- Persiste um resumo factual de conversa de forma idempotente e cria o
-- evento correspondente em cycle_events (fonte que já alimenta a timeline
-- do Companion) somente quando o registro é novo — nunca em duplicidade.
-- Não escreve em sales_cycles: não altera stage/status/next_action/
-- next_contact_at, não cria Agenda.
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_register_companion_conversation_summary(
    p_company_id uuid,
    p_cycle_id uuid,
    p_lead_id uuid,
    p_seller_user_id uuid,
    p_conversation_key text,
    p_watermark text,
    p_summary_text text,
    p_message_count integer,
    p_source text default 'yolen_companion_register_conversation'
  )
returns table (
  registration_id uuid,
  occurred_at timestamp with time zone,
  summary_text text,
  already_registered boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_conversation_key text;
  v_watermark text;
  v_summary_text text;
  v_source text;

  v_id uuid;
  v_created_at timestamp with time zone;
  v_persisted_summary text;
  v_inserted boolean;
begin
  if p_company_id is null then
    raise exception
      'company_id é obrigatório';
  end if;

  if p_cycle_id is null then
    raise exception
      'cycle_id é obrigatório';
  end if;

  if p_lead_id is null then
    raise exception
      'lead_id é obrigatório';
  end if;

  if p_seller_user_id is null then
    raise exception
      'seller_user_id é obrigatório';
  end if;

  v_conversation_key :=
    nullif(
      btrim(
        coalesce(p_conversation_key, '')
      ),
      ''
    );

  if v_conversation_key is null
    or char_length(v_conversation_key) > 500
  then
    raise exception
      'conversation_key inválido';
  end if;

  v_watermark :=
    nullif(
      btrim(
        coalesce(p_watermark, '')
      ),
      ''
    );

  if v_watermark is null
    or char_length(v_watermark) > 200
  then
    raise exception
      'watermark inválido';
  end if;

  v_summary_text :=
    nullif(
      btrim(
        coalesce(p_summary_text, '')
      ),
      ''
    );

  if v_summary_text is null
    or char_length(v_summary_text) > 4000
  then
    raise exception
      'summary_text inválido';
  end if;

  if p_message_count is null or p_message_count < 0 then
    raise exception
      'message_count inválido';
  end if;

  v_source := coalesce(
    nullif(btrim(coalesce(p_source, '')), ''),
    'yolen_companion_register_conversation'
  );

  -- company + ciclo + lead precisam pertencer uns aos outros: garante
  -- isolamento de tenant e de ciclo dentro do próprio banco, não só na API.
  perform 1
  from public.sales_cycles cycle
  where cycle.company_id = p_company_id
    and cycle.id = p_cycle_id
    and cycle.lead_id = p_lead_id
  for share;

  if not found then
    raise exception
      'Ciclo comercial não encontrado para a empresa e o lead informados';
  end if;

  insert into
    public.companion_conversation_registrations (
      company_id,
      cycle_id,
      lead_id,
      seller_user_id,
      conversation_key,
      watermark,
      summary_text,
      message_count,
      source
    )
  values (
    p_company_id,
    p_cycle_id,
    p_lead_id,
    p_seller_user_id,
    v_conversation_key,
    v_watermark,
    v_summary_text,
    p_message_count,
    v_source
  )
  on conflict (company_id, cycle_id, watermark)
    do nothing
  returning
    id,
    companion_conversation_registrations.created_at,
    companion_conversation_registrations.summary_text
  into
    v_id,
    v_created_at,
    v_persisted_summary;

  v_inserted := found;

  if not v_inserted then
    select
      companion_conversation_registrations.id,
      companion_conversation_registrations.created_at,
      companion_conversation_registrations.summary_text
    into
      v_id,
      v_created_at,
      v_persisted_summary
    from public.companion_conversation_registrations
    where company_id = p_company_id
      and cycle_id = p_cycle_id
      and watermark = v_watermark;

    perform 1
    from public.companion_conversation_registrations existing
    where existing.id = v_id
      and existing.lead_id = p_lead_id
      and existing.conversation_key = v_conversation_key;

    if not found then
      raise exception
        'watermark já foi usado para um registro diferente';
    end if;
  else
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
      p_cycle_id,
      'conversation_registered',
      p_seller_user_id,
      jsonb_build_object(
        'source', v_source,
        'registration_id', v_id,
        'conversation_key', v_conversation_key,
        'message_count', p_message_count,
        'summary_preview', left(v_persisted_summary, 220)
      ),
      v_created_at
    );
  end if;

  return query
  select
    v_id,
    v_created_at,
    v_persisted_summary,
    not v_inserted;
end;
$$;

revoke all
on function
  public.rpc_register_companion_conversation_summary(
    uuid, uuid, uuid, uuid, text, text, text, integer, text
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_register_companion_conversation_summary(
    uuid, uuid, uuid, uuid, text, text, text, integer, text
  )
to service_role;
