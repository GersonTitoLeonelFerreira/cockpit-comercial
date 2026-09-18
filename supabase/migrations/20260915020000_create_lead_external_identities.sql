-- Yolen Companion V1 - Finalização ManyChat
-- Vínculo universal entre um contato externo (qualquer plataforma) e um
-- lead da Yolen.
--
-- O resolve-lead original (app/api/companion/resolve-lead) é orientado a
-- telefone: funciona bem no WhatsApp, onde telefone confiável faz parte do
-- fluxo. No ManyChat não existe, até aqui, prova suficiente de telefone
-- confiável — subscriber_id e wa_id são identidades de plataforma/canal,
-- nunca telefone (ver docs/companion-universal e
-- manychat-identity-namespace.js). Tratar wa_id como telefone sem essa
-- prova seria uma inferência arriscada.
--
-- Esta tabela guarda o vínculo:
--   company_id + platform + external_identity_key  ->  lead_id
--
-- external_identity_key é sempre uma chave pseudônima já namespaced (ex.:
-- manychat:contact:v1:sha256:<digest>), nunca um identificador bruto da
-- plataforma. O vínculo é com o LEAD, não com um ciclo específico: um lead
-- pode fechar um ciclo e abrir outro depois, e o contato externo continua
-- sendo a mesma pessoa — o ciclo aplicável continua sendo resolvido pelas
-- regras reais do CRM (sales_cycles) a cada chamada, exatamente como já
-- acontece no caminho por telefone.
--
-- Primeiro vínculo: quando o contato ainda não está vinculado, o vendedor
-- escolhe/confirma o lead correto na Yolen (nunca associação silenciosa por
-- nome/similaridade/conversa anterior) — ver
-- rpc_link_companion_external_identity abaixo.

create table public.lead_external_identities (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  lead_id uuid not null,

  platform text not null,
  external_identity_key text not null,
  identity_source text not null,
  channel text,

  created_at timestamp with time zone
    default clock_timestamp()
    not null,

  updated_at timestamp with time zone
    default clock_timestamp()
    not null,

  last_seen_at timestamp with time zone
    default clock_timestamp()
    not null,

  linked_by uuid not null,

  constraint lead_external_identities_lead_fkey
    foreign key (lead_id)
    references public.leads (id)
    on delete cascade,

  constraint lead_external_identities_platform_check
    check (
      platform = lower(btrim(platform))
      and platform ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    ),

  constraint lead_external_identities_channel_check
    check (
      channel is null
      or (
        channel = lower(btrim(channel))
        and channel ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      )
    ),

  constraint lead_external_identities_external_identity_key_check
    check (
      external_identity_key = btrim(external_identity_key)
      and char_length(external_identity_key) between 1 and 500
    ),

  constraint lead_external_identities_identity_source_check
    check (
      identity_source = btrim(identity_source)
      and char_length(identity_source) between 1 and 100
    )
);

-- Unicidade da identidade externa dentro da empresa: a mesma pessoa
-- observada de novo na mesma conta/plataforma sempre resolve para o mesmo
-- vínculo (ou é atualizada por rpc_link_companion_external_identity, nunca
-- duplicada).
create unique index
  lead_external_identities_identity_uidx
on public.lead_external_identities (
  company_id,
  platform,
  external_identity_key
);

create index
  lead_external_identities_lead_idx
on public.lead_external_identities (
  company_id,
  lead_id
);

alter table
  public.lead_external_identities
enable row level security;

alter table
  public.lead_external_identities
force row level security;

create policy
  lead_external_identities_client_access_denied
on public.lead_external_identities
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table public.lead_external_identities
from public, anon, authenticated, service_role;

-- Leitura direta pelo resolve-lead (mesmo padrão de acesso do restante do
-- Companion: service_role, sempre após checagem de membership no loader).
grant select
on table public.lead_external_identities
to service_role;

comment on table public.lead_external_identities is
  'Vinculo entre um contato externo pseudonimo (qualquer plataforma) e um lead da Yolen. Chave: company_id + platform + external_identity_key -> lead_id. Nunca guarda identificador bruto de plataforma (subscriber_id, wa_id, telefone).';

-- ---------------------------------------------------------------------------
-- rpc_link_companion_external_identity
-- Cria ou corrige (upsert deliberado) o vínculo contato externo -> lead.
-- Autorização de portfolio/permissao já foi decidida pela mesma logica de
-- resolve-lead antes de chamar esta RPC (o vendedor so pode vincular um
-- lead que ele mesmo teria acesso a resolver por telefone); aqui a RPC
-- garante apenas que o lead pertence a empresa informada e nao esta
-- soft-deleted.
--
-- R2 (gate final): `#variable_conflict use_column` é obrigatório aqui.
-- Toda coluna de `returns table (...)` (company_id, lead_id, platform,
-- external_identity_key, identity_source, channel, last_seen_at,
-- updated_at) vira uma variável PL/pgSQL implícita com o mesmo nome —
-- sem essa pragma, `on conflict (company_id, platform,
-- external_identity_key)` levanta "column reference is ambiguous" em
-- QUALQUER Postgres real, nunca só neste teste. Descoberto por
-- phase-lead-external-identity-relink-contract.test.mjs; nunca havia
-- sido pego porque esta migration nunca foi aplicada.
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_link_companion_external_identity(
    p_company_id uuid,
    p_lead_id uuid,
    p_platform text,
    p_external_identity_key text,
    p_identity_source text,
    p_actor_user_id uuid,
    p_channel text default null
  )
returns table (
  id uuid,
  company_id uuid,
  lead_id uuid,
  platform text,
  external_identity_key text,
  identity_source text,
  channel text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_seen_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
#variable_conflict use_column
declare
  v_platform text;
  v_external_identity_key text;
  v_identity_source text;
  v_channel text;
  v_lead_company_id uuid;
  v_lead_deleted_at timestamp with time zone;
  v_row public.lead_external_identities%rowtype;
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

  v_platform := lower(btrim(coalesce(p_platform, '')));

  if v_platform !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'platform inválido';
  end if;

  v_external_identity_key :=
    nullif(btrim(coalesce(p_external_identity_key, '')), '');

  if v_external_identity_key is null
    or char_length(v_external_identity_key) > 500
  then
    raise exception 'external_identity_key inválido';
  end if;

  v_identity_source :=
    nullif(btrim(coalesce(p_identity_source, '')), '');

  if v_identity_source is null
    or char_length(v_identity_source) > 100
  then
    raise exception 'identity_source inválido';
  end if;

  v_channel := nullif(lower(btrim(coalesce(p_channel, ''))), '');

  if v_channel is not null
    and v_channel !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  then
    raise exception 'channel inválido';
  end if;

  select lead.company_id, lead.deleted_at
  into v_lead_company_id, v_lead_deleted_at
  from public.leads lead
  where lead.id = p_lead_id
  for share;

  if not found or v_lead_company_id is distinct from p_company_id then
    raise exception 'Lead não encontrado para a empresa informada';
  end if;

  if v_lead_deleted_at is not null then
    raise exception 'Lead arquivado ou excluído não pode receber vínculo de contato externo';
  end if;

  insert into public.lead_external_identities (
    company_id,
    lead_id,
    platform,
    external_identity_key,
    identity_source,
    channel,
    linked_by
  )
  values (
    p_company_id,
    p_lead_id,
    v_platform,
    v_external_identity_key,
    v_identity_source,
    v_channel,
    p_actor_user_id
  )
  on conflict (company_id, platform, external_identity_key)
    do update set
      lead_id = excluded.lead_id,
      identity_source = excluded.identity_source,
      channel = excluded.channel,
      linked_by = excluded.linked_by,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning * into v_row;

  return query
  select
    v_row.id,
    v_row.company_id,
    v_row.lead_id,
    v_row.platform,
    v_row.external_identity_key,
    v_row.identity_source,
    v_row.channel,
    v_row.created_at,
    v_row.updated_at,
    v_row.last_seen_at;
end;
$$;

revoke all
on function
  public.rpc_link_companion_external_identity(
    uuid, uuid, text, text, text, uuid, text
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_link_companion_external_identity(
    uuid, uuid, text, text, text, uuid, text
  )
to service_role;

-- ---------------------------------------------------------------------------
-- rpc_touch_companion_external_identity_last_seen
-- Atualiza last_seen_at sem alterar o vínculo em si, chamado a cada
-- resolução bem-sucedida via identidade externa (mesmo espírito de
-- conversation_capture_state: sinaliza atividade recente sem reescrever o
-- estado). Falhar silenciosamente (retornar 0 linhas) não é erro: o
-- vínculo pode ter sido removido entre a leitura e esta chamada.
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_touch_companion_external_identity_last_seen(
    p_company_id uuid,
    p_platform text,
    p_external_identity_key text
  )
returns void
language sql
security definer
set search_path = ''
set row_security = off
as $$
  update public.lead_external_identities
  set last_seen_at = clock_timestamp()
  where company_id = p_company_id
    and platform = lower(btrim(coalesce(p_platform, '')))
    and external_identity_key = btrim(coalesce(p_external_identity_key, ''));
$$;

revoke all
on function
  public.rpc_touch_companion_external_identity_last_seen(
    uuid, text, text
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_touch_companion_external_identity_last_seen(
    uuid, text, text
  )
to service_role;
