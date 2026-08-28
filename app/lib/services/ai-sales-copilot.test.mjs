// Fase 12A, Frente 2B (re-auditoria do Controle Mestre): teste de
// "caller" para applyAISuggestion — confirma que o payload enviado a
// /api/ai/apply-suggestion é repassado tal como recebido, incluindo
// confirmed_by_human, sem o serviço fabricar, omitir ou sobrescrever
// esse campo.

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

const { applyAISuggestion } = await import('./ai-sales-copilot.ts')

function suggestion(overrides = {}) {
  return {
    recommended_status: 'negociacao',
    confidence: 0.8,
    action_channel: null,
    action_result: null,
    result_detail: null,
    next_action: null,
    next_action_date: null,
    summary: 'Cliente demonstrou interesse.',
    tags: [],
    should_close_won: false,
    should_close_lost: false,
    close_reason: null,
    reason_for_recommendation: 'Cliente respondeu positivamente.',
    source: 'ai',
    ...overrides,
  }
}

function installFakeFetch({ ok = true, body } = {}) {
  const calls = []

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })

    return {
      ok,
      text: async () =>
        JSON.stringify(
          body ?? {
            ok: true,
            data: { id: 'cycle-1', status: 'negociacao' },
          },
        ),
    }
  }

  return calls
}

test('applyAISuggestion repassa confirmed_by_human=true tal como recebido, sem fabricar nem omitir', async () => {
  const calls = installFakeFetch()

  await applyAISuggestion({
    cycle_id: 'cycle-1',
    applied_status: 'negociacao',
    suggestion: suggestion(),
    confirmed_by_human: true,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/ai/apply-suggestion')

  const sentBody = JSON.parse(calls[0].init.body)

  assert.equal(
    sentBody.confirmed_by_human,
    true,
    'o serviço precisa repassar confirmed_by_human exatamente como recebeu do chamador',
  )
})

test('applyAISuggestion não fabrica confirmed_by_human quando o chamador não o envia (o TypeScript já barra isso em compilação, mas o serviço não pode compensar em runtime)', async () => {
  const calls = installFakeFetch()

  // Simula um chamador que ignora o tipo (ex.: JS puro ou `as any`) e
  // não envia confirmed_by_human — o serviço não pode inserir o campo
  // por conta própria.
  await applyAISuggestion(
    /** @type {any} */ ({
      cycle_id: 'cycle-1',
      applied_status: 'negociacao',
      suggestion: suggestion(),
    }),
  )

  const sentBody = JSON.parse(calls[0].init.body)

  assert.equal(
    Object.prototype.hasOwnProperty.call(sentBody, 'confirmed_by_human'),
    false,
    'o serviço nunca deveria adicionar confirmed_by_human por conta própria',
  )
})
