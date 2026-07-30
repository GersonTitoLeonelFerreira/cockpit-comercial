-- Yolen Companion V2 - Fase 4
-- Cursor relacional de captura por empresa, conversa e dispositivo.
--
-- Esta migration cria somente o estado persistente que as fases seguintes
-- usarão. Ela não altera o motor padrão, não liga o V2 e não modifica as rotas
-- ou a extensão do Companion.

-- O id sequencial do ledger já é globalmente único. Este índice composto
-- permite que os cursores comprovem no próprio banco que o ponteiro pertence
-- à mesma empresa e à mesma conversa do estado.
create unique index conversation_messages_company_conversation_id_uidx
  on public.conversation_messages (
    company_id,
    conversation_key,
    id
  );

create table public.conversation_capture_state (
  company_id uuid not null,
  conversation_key text not null,
  device_key text not null,
  last_observed_message_id bigint,
  last_observed_at timestamp with time zone,
  last_processed_message_id bigint,
  last_processed_at timestamp with time zone,
  state_version bigint default 1 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,

  constraint conversation_capture_state_pkey
    primary key (
      company_id,
      conversation_key,
      device_key
    ),

  constraint conversation_capture_state_company_fkey
    foreign key (company_id)
    references public.companies (id)
    on delete cascade,

  constraint conversation_capture_state_observed_message_fkey
    foreign key (
      company_id,
      conversation_key,
      last_observed_message_id
    )
    references public.conversation_messages (
      company_id,
      conversation_key,
      id
    )
    on delete restrict,

  constraint conversation_capture_state_processed_message_fkey
    foreign key (
      company_id,
      conversation_key,
      last_processed_message_id
    )
    references public.conversation_messages (
      company_id,
      conversation_key,
      id
    )
    on delete restrict,

  constraint conversation_capture_state_conversation_key_check
    check (
      conversation_key = btrim(conversation_key)
      and char_length(conversation_key) between 1 and 500
    ),

  constraint conversation_capture_state_device_key_check
    check (
      device_key = btrim(device_key)
      and char_length(device_key) between 1 and 200
    ),

  constraint conversation_capture_state_observed_pair_check
    check (
      (last_observed_message_id is null) =
      (last_observed_at is null)
    ),

  constraint conversation_capture_state_processed_pair_check
    check (
      (last_processed_message_id is null) =
      (last_processed_at is null)
    ),

  constraint conversation_capture_state_processed_not_ahead_check
    check (
      last_processed_message_id is null
      or (
        last_observed_message_id is not null
        and last_processed_message_id <= last_observed_message_id
      )
    ),

  constraint conversation_capture_state_version_check
    check (state_version > 0),

  constraint conversation_capture_state_timestamps_check
    check (updated_at >= created_at)
);

create index conversation_capture_state_observed_message_idx
  on public.conversation_capture_state (
    company_id,
    conversation_key,
    last_observed_message_id
  )
  where last_observed_message_id is not null;

create index conversation_capture_state_processed_message_idx
  on public.conversation_capture_state (
    company_id,
    conversation_key,
    last_processed_message_id
  )
  where last_processed_message_id is not null;

alter table public.conversation_capture_state enable row level security;
alter table public.conversation_capture_state force row level security;

create policy conversation_capture_state_client_access_denied
  on public.conversation_capture_state
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- O estado é escrito somente pelo backend. Diferentemente do ledger imutável,
-- ele precisa de UPDATE para avançar os dois cursores, mas não de DELETE.
revoke all on table public.conversation_capture_state
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.conversation_capture_state
  to service_role;

comment on table public.conversation_capture_state is
  'Cursor do Yolen Companion V2 por empresa, conversa e instalação do dispositivo.';

comment on column public.conversation_capture_state.device_key is
  'Identidade aleatória e pseudônima da instalação; não é fingerprint do equipamento.';

comment on column public.conversation_capture_state.last_observed_message_id is
  'Maior versão do ledger cuja persistência foi confirmada para este dispositivo.';

comment on column public.conversation_capture_state.last_processed_message_id is
  'Maior versão observada que um consumidor posterior confirmou ter processado.';

comment on column public.conversation_capture_state.state_version is
  'Versão monotônica do estado para controle de concorrência nas fases seguintes.';
