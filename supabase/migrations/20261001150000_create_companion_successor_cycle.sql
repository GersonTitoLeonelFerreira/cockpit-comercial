-- Yolen Companion — "Nova oportunidade" a partir de um ciclo fechado
-- (decisão do Controle Mestre, 01/10/2026).
--
-- NÃO APLICADA. Arquivo versionado para revisão; aplicar só depois do
-- protocolo do GOVERNANCA_RLS.md §12 (baseline, ambiente separado,
-- papéis, advisors, rollback). Enquanto não for aplicada, a rota
-- POST /api/companion/successor-opportunity responde
-- SUCCESSOR_RPC_UNAVAILABLE (503) e nada é criado.
--
-- 1) public.rpc_create_successor_cycle_from_companion
--
-- Mesmas regras de public.rpc_create_successor_cycle_for_company (a ação
-- "+ Nova oportunidade" da Yolen, migration legada 086), que NÃO é
-- alterada aqui. A diferença é de quem é o ator: a função da Yolen usa
-- auth.uid() (sessão do navegador da Yolen); o Companion chama pelo
-- servidor com a service role e o ator vem do token assinado do Companion
-- (sub), como em rpc_ingest_companion_messages (p_captured_by). Por isso
-- esta função só é executável por service_role e refaz TODAS as
-- verificações aqui dentro:
--   - vínculo ativo do ator na empresa (company_memberships.is_active e
--     profiles.is_active_global);
--   - ciclo de origem da empresa, só Ganho ou Perdido (Cancelado não);
--   - lead não excluído;
--   - vendedor (member): só a partir de um ciclo que foi dele (owner,
--     won_owner ou lost_owner);
--   - admin/manager: qualquer ciclo da empresa, mas pelo Companion a nova
--     oportunidade também fica só na carteira de quem criou (Pool,
--     distribuição e outro vendedor continuam só na Yolen);
--   - uma oportunidade aberta por lead (mesmo predicado da Yolen e do
--     índice idx_sales_cycles_lead_active_unique: status fora de
--     ganho/perdido conta como aberto);
--   - tipo obrigatório: reativacao | renovacao | recompra | upgrade |
--     novo_produto.
--
-- O novo ciclo nasce em Novo, com origin_cycle_id do ciclo fechado e
-- opportunity_type. Nada financeiro nem da perda é copiado. O ciclo
-- fechado não é reaberto nem alterado (só travado FOR UPDATE durante a
-- criação, como na função da Yolen). Auditoria igual à da Yolen:
-- cycle_created no ciclo novo (source successor_cycle) e
-- successor_cycle_created no ciclo anterior, ambos com
-- created_via = 'companion'.
--
-- 2) REVOKE de anon/public em rpc_create_successor_cycle_for_company
--
-- Achado separado: no baseline a função da Yolen é SECURITY DEFINER e
-- executável por anon, contra o GOVERNANCA_RLS.md §9 (revogar EXECUTE de
-- PUBLIC e anon). A rota da Yolen chama com o cliente autenticado
-- (authenticated), que continua com EXECUTE. Sem auth.uid() a função já
-- devolvia not_authenticated; o REVOKE fecha a superfície.
--
-- Rollback:
--   drop function if exists public.rpc_create_successor_cycle_from_companion(
--     uuid, uuid, uuid, text, text);
--   grant execute on function public.rpc_create_successor_cycle_for_company(
--     uuid, uuid, text, text, uuid, uuid, text) to anon;

create or replace function public.rpc_create_successor_cycle_from_companion(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_source_cycle_id uuid,
  p_opportunity_type text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_is_admin_or_manager boolean := false;
  v_source public.sales_cycles%rowtype;
  v_source_terminal_owner_id uuid;
  v_existing_active_cycle_id uuid;
  v_new_cycle_id uuid;
  v_type text := lower(btrim(coalesce(p_opportunity_type, '')));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
  v_now timestamptz := now();
begin
  if p_actor_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'not_authenticated'
    );
  end if;

  if p_company_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'company_not_found'
    );
  end if;

  if p_source_cycle_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_found'
    );
  end if;

  if v_type not in (
    'reativacao',
    'renovacao',
    'recompra',
    'upgrade',
    'novo_produto'
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'invalid_opportunity_type'
    );
  end if;

  select cm.role
    into v_actor_role
  from public.company_memberships cm
  join public.profiles p
    on p.id = cm.user_id
  where cm.company_id = p_company_id
    and cm.user_id = p_actor_user_id
    and cm.is_active = true
    and coalesce(p.is_active_global, true) = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'membership_not_found'
    );
  end if;

  v_is_admin_or_manager := v_actor_role in ('admin', 'manager');

  select *
    into v_source
  from public.sales_cycles
  where id = p_source_cycle_id
    and company_id = p_company_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_found'
    );
  end if;

  if v_source.status::text not in ('ganho', 'perdido') then
    return jsonb_build_object(
      'success', false,
      'error', 'source_cycle_not_terminal'
    );
  end if;

  if not exists (
    select 1
    from public.leads l
    where l.id = v_source.lead_id
      and l.company_id = p_company_id
      and l.deleted_at is null
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'lead_not_available'
    );
  end if;

  v_source_terminal_owner_id := case
    when v_source.status::text = 'ganho' then v_source.won_owner_user_id
    when v_source.status::text = 'perdido' then v_source.lost_owner_user_id
    else null
  end;

  if not v_is_admin_or_manager
    and v_source.owner_user_id is distinct from p_actor_user_id
    and v_source_terminal_owner_id is distinct from p_actor_user_id
  then
    return jsonb_build_object(
      'success', false,
      'error', 'permission_denied'
    );
  end if;

  select sc.id
    into v_existing_active_cycle_id
  from public.sales_cycles sc
  where sc.company_id = p_company_id
    and sc.lead_id = v_source.lead_id
    and sc.status::text not in ('ganho', 'perdido')
  limit 1;

  if v_existing_active_cycle_id is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'active_cycle_exists',
      'active_cycle_id', v_existing_active_cycle_id
    );
  end if;

  -- Pelo Companion a oportunidade é sempre de quem cria (same_seller com
  -- destino = ator), também para admin/manager.
  insert into public.sales_cycles (
    company_id,
    lead_id,
    owner_user_id,
    status,
    stage_entered_at,
    current_group_id,
    origin_cycle_id,
    opportunity_type,
    created_at,
    updated_at
  )
  values (
    p_company_id,
    v_source.lead_id,
    p_actor_user_id,
    'novo'::public.lead_status,
    v_now,
    null,
    v_source.id,
    v_type,
    v_now,
    v_now
  )
  returning id
    into v_new_cycle_id;

  insert into public.cycle_events (
    cycle_id,
    company_id,
    event_type,
    metadata,
    created_by,
    occurred_at
  )
  values
    (
      v_new_cycle_id,
      p_company_id,
      'cycle_created',
      jsonb_build_object(
        'source', 'successor_cycle',
        'entry_mode', 'successor_cycle',
        'created_via', 'companion',
        'origin_cycle_id', v_source.id,
        'origin_status', v_source.status,
        'opportunity_type', v_type,
        'assignment_mode', 'same_seller',
        'owner_user_id', p_actor_user_id,
        'group_id', null,
        'note', v_note
      ),
      p_actor_user_id,
      v_now
    ),
    (
      v_source.id,
      p_company_id,
      'successor_cycle_created',
      jsonb_build_object(
        'successor_cycle_id', v_new_cycle_id,
        'created_via', 'companion',
        'opportunity_type', v_type,
        'assignment_mode', 'same_seller',
        'owner_user_id', p_actor_user_id,
        'group_id', null,
        'note', v_note
      ),
      p_actor_user_id,
      v_now
    );

  return jsonb_build_object(
    'success', true,
    'cycle_id', v_new_cycle_id,
    'lead_id', v_source.lead_id,
    'origin_cycle_id', v_source.id,
    'owner_user_id', p_actor_user_id,
    'assignment_mode', 'same_seller',
    'opportunity_type', v_type
  );
exception
  -- Corrida com outra criação para o mesmo lead: o índice único de ciclo
  -- aberto decide, e a resposta é a mesma da verificação acima.
  when unique_violation then
    return jsonb_build_object(
      'success', false,
      'error', 'active_cycle_exists'
    );
end;
$$;

revoke all
on function
  public.rpc_create_successor_cycle_from_companion(
    uuid, uuid, uuid, text, text
  )
from public, anon, authenticated;

grant execute
on function
  public.rpc_create_successor_cycle_from_companion(
    uuid, uuid, uuid, text, text
  )
to service_role;

comment on function
  public.rpc_create_successor_cycle_from_companion(
    uuid, uuid, uuid, text, text
  )
is 'Companion: nova oportunidade (ciclo sucessor) a partir de um ciclo Ganho/Perdido, sempre na carteira do ator. Mesmas regras de rpc_create_successor_cycle_for_company; ator explícito vindo do token do Companion; só service_role.';

-- Achado separado (GOVERNANCA_RLS.md §9): a função da Yolen não pode ser
-- executável por anon/PUBLIC. authenticated continua (rota da Yolen).
revoke execute
on function
  public.rpc_create_successor_cycle_for_company(
    uuid, uuid, text, text, uuid, uuid, text
  )
from public, anon;
