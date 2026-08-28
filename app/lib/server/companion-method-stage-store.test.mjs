// Fase 12A, Frente 2B — Blocker 3.
//
// Testa companion-method-stage-store.ts com um cliente Supabase falso
// mínimo (sem depender de fake-companion-admin.mjs, que não modela
// upsert() — só o que este módulo realmente usa: select/eq/maybeSingle
// e upsert/onConflict).

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL('../../../scripts/typescript-test-loader.mjs', import.meta.url),
  ),
  import.meta.url,
)

const {
  CompanionMethodStageStoreError,
  loadCompanionMethodStage,
  saveCompanionMethodStage,
} = await import('./companion-method-stage-store.ts')

function buildFakeAdmin({ selectResult, upsertResult }) {
  const calls = []

  const admin = {
    from(table) {
      return {
        select(columns) {
          calls.push({ table, method: 'select', columns, filters: [] })
          const builder = {
            eq(column, value) {
              calls.at(-1).filters.push({ column, value })
              return builder
            },
            async maybeSingle() {
              return selectResult ?? { data: null, error: null }
            },
          }
          return builder
        },
        upsert(payload, options) {
          calls.push({ table, method: 'upsert', payload, options })
          return Promise.resolve(upsertResult ?? { data: null, error: null })
        },
      }
    },
  }

  return { admin, calls }
}

test('loadCompanionMethodStage retorna null quando não há registro (nunca fabrica estágio)', async () => {
  const { admin, calls } = buildFakeAdmin({
    selectResult: { data: null, error: null },
  })

  const result = await loadCompanionMethodStage({
    admin,
    companyId: 'company-1',
    cycleId: 'cycle-1',
    conversationKey: 'conv-1',
  })

  assert.equal(result, null)
  assert.equal(calls[0].table, 'companion_method_stage_state')
  assert.deepEqual(
    calls[0].filters.map((f) => f.column),
    ['company_id', 'cycle_id', 'conversation_key'],
  )
})

test('loadCompanionMethodStage normaliza o registro persistido', async () => {
  const { admin } = buildFakeAdmin({
    selectResult: {
      data: {
        method_config_version_id: 'method-v5',
        stage_key: 'formalizacao',
        stage_name: 'Formalização',
        stage_display_order: 5,
        stage_reason: 'Decisão já confirmada.',
        updated_at: '2026-08-27T10:00:00.000Z',
      },
      error: null,
    },
  })

  const result = await loadCompanionMethodStage({
    admin,
    companyId: 'company-1',
    cycleId: 'cycle-1',
    conversationKey: 'conv-1',
  })

  assert.deepEqual(result, {
    method_config_version_id: 'method-v5',
    stage_key: 'formalizacao',
    stage_name: 'Formalização',
    stage_display_order: 5,
    stage_reason: 'Decisão já confirmada.',
    updated_at: '2026-08-27T10:00:00.000Z',
  })
})

test('loadCompanionMethodStage lança CompanionMethodStageStoreError em falha real de leitura', async () => {
  const { admin } = buildFakeAdmin({
    selectResult: { data: null, error: { message: 'conexão perdida' } },
  })

  await assert.rejects(
    loadCompanionMethodStage({
      admin,
      companyId: 'company-1',
      cycleId: 'cycle-1',
      conversationKey: 'conv-1',
    }),
    (error) => {
      assert.ok(error instanceof CompanionMethodStageStoreError)
      assert.equal(error.code, 'METHOD_STAGE_READ_FAILED')
      return true
    },
  )
})

test('saveCompanionMethodStage faz upsert com onConflict pelo escopo completo', async () => {
  const { admin, calls } = buildFakeAdmin({
    upsertResult: { data: null, error: null },
  })

  await saveCompanionMethodStage({
    admin,
    companyId: 'company-1',
    cycleId: 'cycle-1',
    conversationKey: 'conv-1',
    methodConfigVersionId: 'method-v5',
    stageKey: 'formalizacao',
    stageName: 'Formalização',
    stageDisplayOrder: 5,
    stageReason: 'Decisão já confirmada.',
  })

  assert.equal(calls[0].table, 'companion_method_stage_state')
  assert.equal(calls[0].method, 'upsert')
  assert.equal(calls[0].payload.company_id, 'company-1')
  assert.equal(calls[0].payload.cycle_id, 'cycle-1')
  assert.equal(calls[0].payload.conversation_key, 'conv-1')
  assert.equal(calls[0].payload.stage_key, 'formalizacao')
  assert.equal(calls[0].options.onConflict, 'company_id,cycle_id,conversation_key')
})

test('saveCompanionMethodStage lança CompanionMethodStageStoreError em falha real de escrita', async () => {
  const { admin } = buildFakeAdmin({
    upsertResult: { data: null, error: { message: 'violação de constraint' } },
  })

  await assert.rejects(
    saveCompanionMethodStage({
      admin,
      companyId: 'company-1',
      cycleId: 'cycle-1',
      conversationKey: 'conv-1',
      methodConfigVersionId: 'method-v5',
      stageKey: 'formalizacao',
      stageName: 'Formalização',
      stageDisplayOrder: 5,
      stageReason: null,
    }),
    (error) => {
      assert.ok(error instanceof CompanionMethodStageStoreError)
      assert.equal(error.code, 'METHOD_STAGE_WRITE_FAILED')
      return true
    },
  )
})
