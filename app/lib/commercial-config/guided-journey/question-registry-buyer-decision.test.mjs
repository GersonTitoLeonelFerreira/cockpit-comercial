import assert from 'node:assert/strict'
import test from 'node:test'

import { createBuyerDecisionDraft } from '../buyer-decision-architecture.ts'
import { BUYER_DECISION_QUESTIONS } from './question-registry-buyer-decision.ts'
import { getQuestionById, getVisibleQuestions, isQuestionVisible } from './types.ts'
import { createEmptyCommercialMethodBuilderData } from '../../../types/commercial-method-builder.ts'

function context(overrides = {}) {
  const diagnosis = createEmptyCommercialMethodBuilderData()
  Object.assign(diagnosis.company_profile, overrides.company_profile ?? {})
  if (overrides.customer) Object.assign(diagnosis.company_profile.customer, overrides.customer)
  if (overrides.complexity) Object.assign(diagnosis.company_profile.complexity, overrides.complexity)
  const decision = createBuyerDecisionDraft(diagnosis)
  return { diagnosis, decision }
}

test('B2C decide sozinho elimina perguntas de aprovação multipessoa (Q53/Q54)', () => {
  const ctx = context({
    customer: { buyer_type: 'person' },
    complexity: { multiple_decision_makers: false, typical_timing: 'first_contact' },
  })

  const q53 = getQuestionById(BUYER_DECISION_QUESTIONS, 'Q53')
  assert.equal(isQuestionVisible(q53, ctx), false, 'Q53 não deveria aparecer para B2C que decide sozinho')
})

test('B2B habilita perguntas de aprovação e processo formal', () => {
  const ctx = context({
    customer: { buyer_type: 'company' },
    complexity: { typical_timing: 'days' },
  })

  const visible = getVisibleQuestions(BUYER_DECISION_QUESTIONS, ctx).map((q) => q.id)
  assert.ok(visible.includes('Q53'), 'B2B deveria receber a pergunta de aprovação/bloqueio')
})

test('B2B complexo (ciclo longo + múltiplos decisores) habilita justificativa de investimento e urgência', () => {
  const ctx = context({
    customer: { buyer_type: 'company' },
    complexity: { typical_timing: 'months', multiple_decision_makers: true },
  })

  const visible = getVisibleQuestions(BUYER_DECISION_QUESTIONS, ctx).map((q) => q.id)
  assert.ok(visible.includes('Q60'), 'venda B2B longa deveria perguntar sobre justificativa interna de investimento')
  assert.ok(visible.includes('Q59'), 'venda B2B longa deveria perguntar sobre processo formal de compra')
})

test('mudar de PF para PJ recalcula a rota e passa a exigir arquitetura de decisão', () => {
  const personCtx = context({ customer: { buyer_type: 'person' }, complexity: { multiple_decision_makers: false } })
  const q53Person = getQuestionById(BUYER_DECISION_QUESTIONS, 'Q53')
  assert.equal(isQuestionVisible(q53Person, personCtx), false)

  const companyCtx = context({ customer: { buyer_type: 'company' } })
  assert.equal(isQuestionVisible(q53Person, companyCtx), true)
})
