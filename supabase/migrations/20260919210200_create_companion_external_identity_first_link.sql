-- Yolen Companion V1 - STEP 2A.1 - First-link atômico de identidade externa
--
-- rpc_link_companion_external_identity (20260915020000) é uma primitiva de
-- UPSERT deliberado: seu `on conflict ... do update set lead_id =
-- excluded.lead_id` sobrescreve o vínculo existente sempre que chamada de
-- novo com outro lead_id. Isso é correto para um futuro fluxo de correção
-- de vínculo ("relink"), mas é inseguro como primitiva de "primeiro
-- vínculo": duas chamadas concorrentes vindas de dois vendedores diferentes
-- resolvendo o mesmo contato ainda não vinculado poderiam, em sequência,
-- sobrescrever uma à outra silenciosamente — nenhuma das duas chamadas
-- falharia nem sinalizaria conflito.
--
-- Esta migration adiciona uma segunda RPC, específica para "primeiro
-- vínculo apenas": ela NUNCA sobrescreve um vínculo já existente. A tabela
-- public.lead_external_identities e a RPC de relink
-- (rpc_link_companion_external_identity) não são alteradas por esta
-- migration — os dois contratos (first-link vs. relink) permanecem
-- deliberadamente separados, cada um com seu próprio caller esperado no
-- futuro.
--
-- Sem caller produtivo ainda: nenhum endpoint, UI ou runtime de extensão
-- chama esta RPC nesta rodada (STEP 2A.1 é repositório + teste local
-- somente). Ver docs/companion-universal/EXTERNAL_IDENTITY_RELINK_CONTRACT.md
-- para o contrato irmão da RPC de relink.

-- ---------------------------------------------------------------------------
-- rpc_link_companion_external_identity_first
--
-- Contrato de atomicidade: o único ponto de decisão é o próprio
-- `insert ... on conflict (...) do nothing`. Sob READ COMMITTED (nível de
-- isolamento padrão do Postgres, usado pelas chamadas RPC do Supabase via
-- service_role), se duas transações concorrentes tentam inserir a mesma
-- chave (company_id, platform, external_identity_key), o índice único
-- força a segunda a bloquear no lock de linha até a primeira commitar; ao
-- destravar, a segunda enxerga o conflito e o DO NOTHING não insere nada
-- para ela. O SELECT que roda em seguida, para descobrir se o vínculo
-- existente aponta para o mesmo lead_id solicitado ou para outro, é uma
-- instrução NOVA: READ COMMITTED tira um snapshot por instrução, então
-- esse SELECT sempre enxerga a linha já commitada pela transação vencedora
-- — não existe uma leitura anterior ao INSERT cujo resultado seja usado
-- para decidir se insere ou não (isso seria o padrão inseguro
-- "SELECT está livre? -> INSERT", explicitamente proibido aqui). A
-- primeira transação a vencer o índice único é sempre quem cria o vínculo;
-- todas as demais, quaisquer que sejam seus lead_id, apenas leem o
-- resultado dela.
--
-- Autorização: exatamente as mesmas duas fronteiras de
-- rpc_link_companion_external_identity — a RPC garante apenas
-- same-company + lead ativo; membership/portfolio/ação explícita do
-- usuário continuam sendo responsabilidade do caller (futuro endpoint),
-- nunca desta função. p_actor_user_id é dado de auditoria (linked_by),
-- nunca autorização.
--
-- `#variable_conflict use_column` é obrigatório aqui pelo mesmo motivo da
-- RPC de relink: toda coluna de `returns table (...)` que coincide com uma
-- coluna real de public.lead_external_identities vira uma variável
-- PL/pgSQL implícita, e `on conflict (company_id, platform,
-- external_identity_key)` seria ambíguo sem a pragma.
-- ---------------------------------------------------------------------------
create or replace function
  public.rpc_link_companion_external_identity_first(
    p_company_id uuid,
    p_lead_id uuid,
    p_platform text,
    p_external_identity_key text,
    p_identity_source text,
    p_actor_user_id uuid,
    p_channel text default null
  )
returns table (
  status text,
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
  v_inserted public.lead_external_identities%rowtype;
  v_existing public.lead_external_identities%rowtype;
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
    do nothing
  returning * into v_inserted;

  if found then
    return query
    select
      'LINKED'::text,
      v_inserted.id,
      v_inserted.company_id,
      v_inserted.lead_id,
      v_inserted.platform,
      v_inserted.external_identity_key,
      v_inserted.identity_source,
      v_inserted.channel,
      v_inserted.created_at,
      v_inserted.updated_at,
      v_inserted.last_seen_at;
    return;
  end if;

  select existing.*
  into v_existing
  from public.lead_external_identities existing
  where existing.company_id = p_company_id
    and existing.platform = v_platform
    and existing.external_identity_key = v_external_identity_key;

  if not found then
    raise exception 'Falha inesperada ao resolver vínculo existente após conflito';
  end if;

  if v_existing.lead_id = p_lead_id then
    return query
    select
      'IDEMPOTENT_ALREADY_LINKED_TO_TARGET'::text,
      v_existing.id,
      v_existing.company_id,
      v_existing.lead_id,
      v_existing.platform,
      v_existing.external_identity_key,
      v_existing.identity_source,
      v_existing.channel,
      v_existing.created_at,
      v_existing.updated_at,
      v_existing.last_seen_at;
    return;
  end if;

  -- Conflito com outro lead: a linha existente não é tocada (nenhum
  -- UPDATE roda neste caminho) e nenhum detalhe dela além do necessário é
  -- exposto ao caller — um futuro endpoint não pode usar esta RPC como
  -- forma de descobrir a carteira de outro vendedor.
  return query
  select
    'ALREADY_LINKED_CONFLICT'::text,
    null::uuid,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    null::text,
    null::text,
    null::timestamp with time zone,
    null::timestamp with time zone,
    null::timestamp with time zone;
end;
$$;

revoke all
on function
  public.rpc_link_companion_external_identity_first(
    uuid, uuid, text, text, text, uuid, text
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_link_companion_external_identity_first(
    uuid, uuid, text, text, text, uuid, text
  )
to service_role;

comment on function
  public.rpc_link_companion_external_identity_first(
    uuid, uuid, text, text, text, uuid, text
  ) is
  'Primeiro vínculo atômico entre contato externo e lead (INSERT ... ON CONFLICT DO NOTHING). Nunca sobrescreve um vínculo existente — retorna LINKED / IDEMPOTENT_ALREADY_LINKED_TO_TARGET / ALREADY_LINKED_CONFLICT. Para correção deliberada de vínculo, ver rpc_link_companion_external_identity (relink, upsert).';
