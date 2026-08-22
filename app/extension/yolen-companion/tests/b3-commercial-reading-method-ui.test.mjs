import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const require = createRequire(import.meta.url)
const sellerView = require('../src/companion-seller-information-view.js')
const contentScript = readFileSync(new URL('../src/content-script.js', import.meta.url), 'utf8')

function reading(method) {
  return {
    commercial_relevance: 'commercial',
    seller_strengths: [],
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    commercial_evolution: [],
    method,
  }
}

function configuredMethod(overrides = {}) {
  return {
    configured: true,
    name: 'Método Consultivo',
    stages: [],
    current_stage: null,
    adherence: {
      status: 'on_method',
      summary: 'A condução segue o método.',
      deviation_stage_order: null,
      what_happened: null,
      missing_information: [],
      why_it_matters: null,
      evidence_message_ids: [],
      memory_ids: [],
    },
    recovery_guidance: null,
    ...overrides,
  }
}

test('B3.3 renderiza método, etapa atual e seis status oficiais', () => {
  const statuses = [
    'completed',
    'active',
    'partial',
    'not_started',
    'skipped',
    'not_applicable',
  ]

  const html = sellerView.renderAnalysisArea(reading(configuredMethod({
    stages: statuses.map((status, index) => ({
      step_order: index + 1,
      stage_key: `etapa-${index + 1}`,
      name: `Etapa ${index + 1}`,
      status,
      explanation: `Explicação ${index + 1}`,
      evidence_message_ids: [],
      memory_ids: [],
    })),
    current_stage: {
      step_order: 2,
      stage_key: 'etapa-2',
      name: 'Etapa 2',
    },
  })))

  assert.match(html, /Método Consultivo/)
  assert.match(html, /data-yolen-current-method-stage="true"/)

  for (const status of statuses) {
    assert.match(html, new RegExp(`data-yolen-method-stage-status="${status}"`))
  }

  assert.doesNotMatch(html, /checkbox|<input|checklist/i)
  assert.match(html, /Método comercial e etapa do CRM são avaliações independentes/i)
})

test('B3.3 preserva método não configurado e evidência insuficiente sem inventar erro', () => {
  const notConfigured = sellerView.renderAnalysisArea(reading({
    configured: false,
    name: null,
    stages: [],
    current_stage: null,
    adherence: { status: 'not_configured' },
    recovery_guidance: null,
  }))

  assert.match(notConfigured, /Método comercial não configurado/)
  assert.doesNotMatch(notConfigured, /Como voltar para o método/)

  const insufficient = sellerView.renderAnalysisArea(reading(configuredMethod({
    adherence: {
      status: 'insufficient_evidence',
      summary: 'Poucas mensagens disponíveis.',
    },
  })))

  assert.match(insufficient, /Evidência insuficiente/)
  assert.match(insufficient, /Não há evidência suficiente para avaliar esta etapa/)
  assert.doesNotMatch(insufficient, /Fora do método/)
})

test('B3.3 traduz aderência e mostra recovery somente quando fora do método', () => {
  for (const [status, label] of [
    ['on_method', 'Dentro do método'],
    ['partially_on_method', 'Parcialmente dentro do método'],
  ]) {
    const html = sellerView.renderAnalysisArea(reading(configuredMethod({
      adherence: { status, summary: 'Resumo da aderência.' },
    })))
    assert.match(html, new RegExp(label))
    assert.doesNotMatch(html, /Como voltar para o método/)
  }

  const offMethod = sellerView.renderAnalysisArea(reading(configuredMethod({
    adherence: {
      status: 'off_method',
      summary: 'A condução saiu do método.',
      deviation_stage_order: 2,
      what_happened: 'Preço antes do diagnóstico.',
      missing_information: ['Impacto do problema'],
      why_it_matters: 'O valor ficou abstrato.',
      evidence_message_ids: ['message-1'],
      memory_ids: [],
    },
    recovery_guidance: {
      objective: 'Retomar o diagnóstico.',
      missing_information: ['Urgência'],
      recommended_move: 'Perguntar sobre impacto.',
      optional_question: 'Qual é o impacto hoje?',
      evidence_message_ids: ['message-1'],
      memory_ids: [],
    },
  })))

  assert.match(offMethod, /Fora do método/)
  assert.match(offMethod, /Onde saiu/)
  assert.match(offMethod, /O que aconteceu/)
  assert.match(offMethod, /O que faltou/)
  assert.match(offMethod, /Por que importa/)
  assert.match(offMethod, /Como voltar para o método/)
  assert.match(offMethod, /Perguntar sobre impacto/)
})

test('B3.3 integra o renderer oficial na área ANÁLISE sem reconstrução por coaching legado', () => {
  assert.match(
    contentScript,
    /getRichCommercialReadingExpandedHtml[\s\S]*sellerInformationViewTools[\s\S]*renderAnalysisArea/,
  )
  assert.match(
    contentScript,
    /getDetailedAnalysisAreaHtml[\s\S]*getRichCommercialReadingExpandedHtml/,
  )
})
