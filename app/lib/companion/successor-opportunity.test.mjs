// Rodada 5 (Parte B): "Nova oportunidade" pelo Companion com as MESMAS
// regras da Yolen. Elegibilidade por papel, dono e estado; e a migration
// (não aplicada) com as mesmas verificações, ator explícito, só
// service_role e REVOKE de anon/public na função da Yolen.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  SUCCESSOR_OPPORTUNITY_TYPES,
  SUCCESSOR_OPPORTUNITY_TYPE_LABELS,
  evaluateSuccessorOpportunityEligibility,
  isSuccessorOpportunityType,
} from './successor-opportunity.ts'

const ME = '30000000-0000-4000-8000-0000000000a1'
const OTHER = '30000000-0000-4000-8000-0000000000a2'

function cycle(overrides = {}) {
  return {
    id: '30000000-0000-4000-8000-0000000000c1',
    status: 'ganho',
    owner_user_id: ME,
    won_owner_user_id: ME,
    lost_owner_user_id: null,
    ...overrides,
  }
}

function evaluate({ role = 'member', lead = { deleted_at: null }, source = cycle(), cycles } = {}) {
  return evaluateSuccessorOpportunityEligibility({
    actorUserId: ME,
    role,
    lead,
    sourceCycle: source,
    cycles: cycles ?? [source],
  })
}

test('tipos e rótulos iguais aos da Yolen', () => {
  assert.deepEqual([...SUCCESSOR_OPPORTUNITY_TYPES], ['reativacao', 'renovacao', 'recompra', 'upgrade', 'novo_produto'])
  assert.deepEqual(SUCCESSOR_OPPORTUNITY_TYPE_LABELS, {
    reativacao: 'Reativação',
    renovacao: 'Renovação',
    recompra: 'Recompra',
    upgrade: 'Upgrade',
    novo_produto: 'Novo produto',
  })
  assert.equal(isSuccessorOpportunityType('upgrade'), true)
  assert.equal(isSuccessorOpportunityType(''), false)
  assert.equal(isSuccessorOpportunityType('pool'), false)
})

test('vendedor: Ganho ou Perdido que foi dele → pode', () => {
  assert.deepEqual(evaluate(), { eligible: true, reason: null })
  assert.equal(
    evaluate({ source: cycle({ status: 'perdido', owner_user_id: OTHER, won_owner_user_id: null, lost_owner_user_id: ME }) }).eligible,
    true,
  )
  // Dono do ciclo mesmo sem ter fechado.
  assert.equal(evaluate({ source: cycle({ won_owner_user_id: OTHER }) }).eligible, true)
  // Fechou a venda mesmo com o ciclo hoje em outra carteira.
  assert.equal(evaluate({ source: cycle({ owner_user_id: OTHER, won_owner_user_id: ME }) }).eligible, true)
})

test('vendedor: ciclo que nunca foi dele → não pode (permission_denied)', () => {
  assert.deepEqual(
    evaluate({ source: cycle({ owner_user_id: OTHER, won_owner_user_id: OTHER }) }),
    { eligible: false, reason: 'permission_denied' },
  )
  // won_owner não vale para Perdido (e vice-versa), como na Yolen.
  assert.equal(
    evaluate({ source: cycle({ status: 'perdido', owner_user_id: OTHER, won_owner_user_id: ME, lost_owner_user_id: OTHER }) }).reason,
    'permission_denied',
  )
})

test('admin/manager: qualquer ciclo Ganho/Perdido da empresa', () => {
  for (const role of ['admin', 'manager']) {
    assert.equal(
      evaluate({ role, source: cycle({ owner_user_id: OTHER, won_owner_user_id: OTHER }) }).eligible,
      true,
      role,
    )
  }
})

test('Cancelado (ou etapa aberta) como origem → não pode', () => {
  assert.deepEqual(
    evaluate({ source: cycle({ status: 'cancelado' }) }),
    { eligible: false, reason: 'source_cycle_not_terminal' },
  )
  assert.equal(evaluate({ source: cycle({ status: 'negociacao' }) }).reason, 'source_cycle_not_terminal')
})

test('já existe oportunidade aberta para o lead → não pode (active_cycle_exists), Cancelado conta como na Yolen', () => {
  const source = cycle()

  assert.deepEqual(
    evaluate({ source, cycles: [source, { status: 'novo' }] }),
    { eligible: false, reason: 'active_cycle_exists' },
  )
  assert.equal(evaluate({ source, cycles: [source, { status: 'cancelado' }] }).reason, 'active_cycle_exists')
  assert.equal(evaluate({ source, cycles: [source, { status: 'perdido' }] }).eligible, true)
})

test('lead excluído, sem ciclo ou sem vínculo → não pode', () => {
  assert.equal(evaluate({ lead: { deleted_at: '2026-09-30T00:00:00Z' } }).reason, 'lead_not_available')
  assert.equal(evaluate({ lead: null }).reason, 'lead_not_available')
  assert.equal(evaluate({ source: null }).reason, 'source_cycle_not_found')
  assert.equal(evaluate({ role: null }).reason, 'membership_not_found')
  assert.equal(evaluate({ role: 'viewer' }).reason, 'membership_not_found')
})

// ---------------------------------------------------------------------------
// Migration (NÃO aplicada)
// ---------------------------------------------------------------------------

const MIGRATION = readFileSync(
  new URL('../../../supabase/migrations/20261001150000_create_companion_successor_cycle.sql', import.meta.url),
  'utf8',
)

const FUNCTION_BODY = MIGRATION.slice(
  MIGRATION.indexOf('create or replace function public.rpc_create_successor_cycle_from_companion'),
  MIGRATION.indexOf('revoke all'),
)

test('migration: função do Companion com ator explícito, SECURITY DEFINER e search_path vazio', () => {
  assert.match(MIGRATION, /NÃO APLICADA/)
  assert.match(FUNCTION_BODY, /p_actor_user_id uuid/)
  assert.match(FUNCTION_BODY, /security definer\s+set search_path = ''/)
  assert.doesNotMatch(FUNCTION_BODY, /auth\.uid\(\)/)
})

test('migration: refaz todas as verificações da Yolen dentro da função', () => {
  for (const check of [
    /cm\.is_active = true/,
    /coalesce\(p\.is_active_global, true\) = true/,
    /'membership_not_found'/,
    /in \('ganho', 'perdido'\)[\s\S]*'source_cycle_not_terminal'/,
    /l\.deleted_at is null[\s\S]*'lead_not_available'/,
    /won_owner_user_id[\s\S]*lost_owner_user_id[\s\S]*'permission_denied'/,
    /'active_cycle_exists'/,
    /'invalid_opportunity_type'/,
    /for update/,
  ]) {
    assert.match(FUNCTION_BODY, check)
  }
})

test('migration: ciclo novo em Novo, na carteira do ator, com origem e tipo; nada financeiro copiado', () => {
  const insert = FUNCTION_BODY.slice(
    FUNCTION_BODY.indexOf('insert into public.sales_cycles'),
    FUNCTION_BODY.indexOf('insert into public.cycle_events'),
  )

  assert.match(insert, /'novo'::public\.lead_status/)
  assert.match(insert, /p_actor_user_id,/)
  assert.match(insert, /origin_cycle_id/)
  assert.match(insert, /opportunity_type/)
  assert.doesNotMatch(insert, /won_total|won_value|lost_reason|payment|valor|invoice/i)
  // O ciclo fechado nunca é atualizado.
  assert.doesNotMatch(FUNCTION_BODY, /update public\.sales_cycles/i)
})

test('migration: mesmos eventos de auditoria da Yolen, registrando a origem companion', () => {
  assert.match(FUNCTION_BODY, /'cycle_created',\s*jsonb_build_object\(\s*'source', 'successor_cycle'/)
  assert.match(FUNCTION_BODY, /'successor_cycle_created'/)
  assert.equal((FUNCTION_BODY.match(/'created_via', 'companion'/g) ?? []).length, 2)
})

test('migration: só service_role executa; função da Yolen perde anon/public', () => {
  assert.match(
    MIGRATION,
    /revoke all\s+on function\s+public\.rpc_create_successor_cycle_from_companion\(\s*uuid, uuid, uuid, text, text\s*\)\s+from public, anon, authenticated;/,
  )
  assert.match(
    MIGRATION,
    /grant execute\s+on function\s+public\.rpc_create_successor_cycle_from_companion\(\s*uuid, uuid, uuid, text, text\s*\)\s+to service_role;/,
  )
  assert.match(
    MIGRATION,
    /revoke execute\s+on function\s+public\.rpc_create_successor_cycle_for_company\(\s*uuid, uuid, text, text, uuid, uuid, text\s*\)\s+from public, anon;/,
  )
})
