import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeCommercialMethodBuilderData } from './normalize.ts'
import { DIAGNOSIS_QUESTIONS } from './question-registry-diagnosis.ts'
import { getNextQuestion, isQuestionAnswered } from './types.ts'
import { createEmptyCommercialMethodBuilderData } from '../../../types/commercial-method-builder.ts'

function oldFormDraft() {
  // Simula exatamente o que o formulário Fase 1/2 (CommercialMethodBuilder.tsx)
  // já escrevia — sem nenhum dos campos novos da Jornada Guiada.
  const data = createEmptyCommercialMethodBuilderData()
  delete data.company_profile.buyer_behavior
  delete data.current_sales_process.discovery_depth
  delete data.current_sales_process.problem_context
  delete data.current_sales_process.presentation_depth
  delete data.current_sales_process.pricing_flow
  delete data.current_sales_process.objections
  delete data.current_sales_process.decision_evidence
  delete data.current_sales_process.formalization
  delete data.current_sales_process.renewal
  delete data.current_sales_process.sales_events_detail

  data.company_profile.offer.type = 'service'
  data.company_profile.offer.main_offerings = ['Plano mensal']
  data.company_profile.offer.has_recurring_revenue = true
  data.company_profile.offer.has_plans_or_packages = true
  data.company_profile.customer.buyer_type = 'person'
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.channels = ['WhatsApp', 'Presencial']
  return data
}

test('draft antigo sem os campos novos não quebra a normalização', () => {
  const raw = oldFormDraft()
  const normalized = normalizeCommercialMethodBuilderData(raw)

  assert.ok(normalized.company_profile.buyer_behavior, 'buyer_behavior deveria ser preenchido com padrão')
  assert.ok(normalized.current_sales_process.discovery_depth)
  assert.ok(normalized.current_sales_process.pricing_flow)
  assert.equal(normalized.company_profile.buyer_behavior.initiator, '')
})

test('respostas já dadas no formulário antigo aparecem como já respondidas na jornada guiada', () => {
  const raw = oldFormDraft()
  const normalized = normalizeCommercialMethodBuilderData(raw)

  const q01 = DIAGNOSIS_QUESTIONS.find((q) => q.id === 'Q01')
  const q07 = DIAGNOSIS_QUESTIONS.find((q) => q.id === 'Q07')
  const q16 = DIAGNOSIS_QUESTIONS.find((q) => q.id === 'Q16')

  assert.equal(isQuestionAnswered(q01, normalized), true, 'Q01 já foi respondida pelo formulário antigo (offer.type)')
  assert.equal(isQuestionAnswered(q07, normalized), true, 'Q07 já foi respondida pelo formulário antigo (buyer_type)')
  assert.equal(isQuestionAnswered(q16, normalized), true, 'Q16 já foi respondida pelo formulário antigo (channels)')
})

test('a jornada guiada continua exatamente do que falta, sem repetir o que já foi respondido', () => {
  const raw = oldFormDraft()
  const normalized = normalizeCommercialMethodBuilderData(raw)

  const next = getNextQuestion(DIAGNOSIS_QUESTIONS, normalized)
  assert.ok(next, 'deveria haver uma próxima pergunta em aberto')
  assert.notEqual(next.id, 'Q01', 'não deveria pedir novamente o que o formulário antigo já respondeu')
  assert.notEqual(next.id, 'Q07')
  assert.notEqual(next.id, 'Q16')
})

test('normalização é idempotente e não injeta nada além de defaults locais conhecidos', () => {
  const raw = oldFormDraft()
  const once = normalizeCommercialMethodBuilderData(raw)
  const twice = normalizeCommercialMethodBuilderData(once)

  assert.deepEqual(once, twice, 'normalizar um draft já normalizado não deveria mudar nada (pura, sem efeitos colaterais)')

  const knownTopLevelKeys = new Set(['company_profile', 'commercial_rules', 'current_sales_process'])
  for (const key of Object.keys(once)) {
    assert.ok(knownTopLevelKeys.has(key), `chave inesperada "${key}" foi introduzida pela normalização`)
  }
})
