-- Yolen Companion - Trilha C - Fase C1
-- Telemetria de ações do vendedor sobre sugestões da Yolen.
--
-- Esta estrutura:
-- - registra FATOS de interação (o que foi mostrado, o que o vendedor fez);
-- - não interpreta se a ação foi comercialmente boa ou ruim;
-- - não altera CRM nem Agenda;
-- - não armazena conteúdo da conversa;
-- - permanece acessível somente por operações server-side (service_role),
--   sempre através das RPCs abaixo.

create table public.companion_action_events (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  cycle_id uuid not null,
  seller_user_id uuid not null,

  action_type text not null,

  coaching_note_id uuid,
  conversation_key text,

  idempotency_key text not null,

  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamp with time zone
    default clock_timestamp()
    not null,

  constraint companion_action_events_cycle_fkey
    foreign key (
      company_id,
      cycle_id
    )
    references public.sales_cycles (
      company_id,
      id
    )
    on delete restrict,

  constraint companion_action_events_action_type_check
    check (
      action_type in (
        'suggestion_shown',
        'suggestion_copied',
        'suggestion_inserted',
        'suggestion_ignored',
        'suggestion_edited',
        'suggestion_sent',
        'crm_accepted',
        'crm_rejected',
        'agenda_accepted',
        'agenda_rejected'
      )
    ),

  constraint companion_action_events_idempotency_key_check
    check (
      idempotency_key = btrim(idempotency_key)
      and char_length(idempotency_key) between 1 and 200
    ),

  constraint companion_action_events_conversation_key_check
    check (
      conversation_key is null
      or (
        conversation_key = btrim(conversation_key)
        and char_length(conversation_key) between 1 and 500
      )
    ),

  constraint companion_action_events_metadata_object_check
    check (
      jsonb_typeof(metadata) = 'object'
    ),

  constraint companion_action_events_no_conversation_content_check
    check (
      not (
        metadata ?| array[
          'conversation_text',
          'messages',
          'suggested_message',
          'text_content',
          'audio_transcription'
        ]
      )
    )
);

create unique index
  companion_action_events_idempotency_uidx
on public.companion_action_events (
  company_id,
  idempotency_key
);

create index
  companion_action_events_company_time_idx
on public.companion_action_events (
  company_id,
  occurred_at desc
);

create index
  companion_action_events_company_cycle_time_idx
on public.companion_action_events (
  company_id,
  cycle_id,
  occurred_at desc
);

create index
  companion_action_events_company_type_time_idx
on public.companion_action_events (
  company_id,
  action_type,
  occurred_at desc
);

create index
  companion_action_events_seller_time_idx
on public.companion_action_events (
  company_id,
  seller_user_id,
  occurred_at desc
);

alter table
  public.companion_action_events
enable row level security;

alter table
  public.companion_action_events
force row level security;

create policy
  companion_action_events_client_access_denied
on public.companion_action_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table public.companion_action_events
from public, anon, authenticated, service_role;

grant select
on table public.companion_action_events
to service_role;

-- ---------------------------------------------------------------------------
-- rpc_record_companion_action_event
-- Registra uma ação do vendedor de forma idempotente.
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_record_companion_action_event(
    p_company_id uuid,
    p_cycle_id uuid,
    p_seller_user_id uuid,
    p_action_type text,
    p_idempotency_key text,
    p_coaching_note_id uuid default null,
    p_conversation_key text default null,
    p_metadata jsonb default '{}'::jsonb
  )
returns table (
  event_id uuid,
  occurred_at timestamp with time zone,
  already_registered boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_metadata jsonb;
  v_idempotency_key text;
  v_conversation_key text;

  v_event_id uuid;
  v_occurred_at timestamp with time zone;
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

  if p_seller_user_id is null then
    raise exception
      'seller_user_id é obrigatório';
  end if;

  if
    p_action_type not in (
      'suggestion_shown',
      'suggestion_copied',
      'suggestion_inserted',
      'suggestion_ignored',
      'suggestion_edited',
      'suggestion_sent',
      'crm_accepted',
      'crm_rejected',
      'agenda_accepted',
      'agenda_rejected'
    )
  then
    raise exception
      'action_type inválido';
  end if;

  v_idempotency_key :=
    nullif(
      btrim(
        coalesce(p_idempotency_key, '')
      ),
      ''
    );

  if v_idempotency_key is null then
    raise exception
      'idempotency_key é obrigatório';
  end if;

  if char_length(v_idempotency_key) > 200 then
    raise exception
      'idempotency_key ultrapassa o limite de 200 caracteres';
  end if;

  v_conversation_key :=
    nullif(
      btrim(
        coalesce(p_conversation_key, '')
      ),
      ''
    );

  v_metadata :=
    coalesce(p_metadata, '{}'::jsonb);

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception
      'metadata precisa ser um objeto JSON';
  end if;

  if
    v_metadata ?| array[
      'conversation_text',
      'messages',
      'suggested_message',
      'text_content',
      'audio_transcription'
    ]
  then
    raise exception
      'metadata não pode armazenar conteúdo da conversa';
  end if;

  perform 1
  from public.sales_cycles cycle
  where cycle.company_id = p_company_id
    and cycle.id = p_cycle_id
  for share;

  if not found then
    raise exception
      'Ciclo comercial não encontrado na empresa informada';
  end if;

  if p_coaching_note_id is not null then
    perform 1
    from public.ai_coaching_notes note
    where note.id = p_coaching_note_id
      and note.company_id = p_company_id
      and note.cycle_id = p_cycle_id;

    if not found then
      raise exception
        'coaching_note_id não pertence a esta empresa ou ciclo';
    end if;
  end if;

  insert into
    public.companion_action_events (
      company_id,
      cycle_id,
      seller_user_id,
      action_type,
      coaching_note_id,
      conversation_key,
      idempotency_key,
      metadata
    )
  values (
    p_company_id,
    p_cycle_id,
    p_seller_user_id,
    p_action_type,
    p_coaching_note_id,
    v_conversation_key,
    v_idempotency_key,
    v_metadata
  )
  on conflict (company_id, idempotency_key)
    do nothing
  returning
    id,
    companion_action_events.occurred_at
  into
    v_event_id,
    v_occurred_at;

  v_inserted := found;

  if not v_inserted then
    select
      id,
      companion_action_events.occurred_at
    into
      v_event_id,
      v_occurred_at
    from public.companion_action_events
    where company_id = p_company_id
      and idempotency_key = v_idempotency_key;

    perform 1
    from public.companion_action_events existing
    where existing.id = v_event_id
      and existing.cycle_id = p_cycle_id
      and existing.action_type = p_action_type
      and existing.seller_user_id = p_seller_user_id;

    if not found then
      raise exception
        'idempotency_key já foi usada para um evento diferente';
    end if;
  end if;

  return query
  select
    v_event_id,
    v_occurred_at,
    not v_inserted;
end;
$$;

revoke all
on function
  public.rpc_record_companion_action_event(
    uuid, uuid, uuid, text, text, uuid, text, jsonb
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_record_companion_action_event(
    uuid, uuid, uuid, text, text, uuid, text, jsonb
  )
to service_role;

-- ---------------------------------------------------------------------------
-- rpc_list_companion_action_events
-- Consulta segura do histórico, escopada por empresa e por papel.
-- Admin/manager vê todos os eventos da empresa; vendedor vê só os próprios.
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_list_companion_action_events(
    p_company_id uuid,
    p_requesting_user_id uuid,
    p_is_admin_or_manager boolean,
    p_cycle_id uuid default null,
    p_action_type text default null,
    p_since timestamp with time zone default null,
    p_until timestamp with time zone default null,
    p_limit integer default 100
  )
returns table (
  id uuid,
  cycle_id uuid,
  seller_user_id uuid,
  action_type text,
  coaching_note_id uuid,
  conversation_key text,
  metadata jsonb,
  occurred_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_limit integer;
begin
  if p_company_id is null then
    raise exception
      'company_id é obrigatório';
  end if;

  if p_requesting_user_id is null then
    raise exception
      'requesting_user_id é obrigatório';
  end if;

  if
    p_action_type is not null
    and p_action_type not in (
      'suggestion_shown',
      'suggestion_copied',
      'suggestion_inserted',
      'suggestion_ignored',
      'suggestion_edited',
      'suggestion_sent',
      'crm_accepted',
      'crm_rejected',
      'agenda_accepted',
      'agenda_rejected'
    )
  then
    raise exception
      'action_type inválido';
  end if;

  v_limit := coalesce(p_limit, 100);

  if v_limit < 1 then
    v_limit := 1;
  end if;

  if v_limit > 500 then
    v_limit := 500;
  end if;

  return query
  select
    e.id,
    e.cycle_id,
    e.seller_user_id,
    e.action_type,
    e.coaching_note_id,
    e.conversation_key,
    e.metadata,
    e.occurred_at
  from public.companion_action_events e
  where e.company_id = p_company_id
    and (
      p_cycle_id is null
      or e.cycle_id = p_cycle_id
    )
    and (
      p_action_type is null
      or e.action_type = p_action_type
    )
    and (
      p_since is null
      or e.occurred_at >= p_since
    )
    and (
      p_until is null
      or e.occurred_at <= p_until
    )
    and (
      p_is_admin_or_manager
      or e.seller_user_id = p_requesting_user_id
    )
  order by e.occurred_at desc
  limit v_limit;
end;
$$;

revoke all
on function
  public.rpc_list_companion_action_events(
    uuid, uuid, boolean, uuid, text,
    timestamp with time zone, timestamp with time zone, integer
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_list_companion_action_events(
    uuid, uuid, boolean, uuid, text,
    timestamp with time zone, timestamp with time zone, integer
  )
to service_role;
