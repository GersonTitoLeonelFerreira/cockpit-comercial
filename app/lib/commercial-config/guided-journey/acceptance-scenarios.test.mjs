import assert from 'node:assert/strict'
import test from 'node:test'

import { createBuyerDecisionDraft, getBuyerDecisionProfile } from '../buyer-decision-architecture.ts'
import { DIAGNOSIS_QUESTIONS } from './question-registry-diagnosis.ts'
import { BUYER_DECISION_QUESTIONS } from './question-registry-buyer-decision.ts'
import { getVisibleQuestions } from './types.ts'
import { createEmptyCommercialMethodBuilderData } from '../../../types/commercial-method-builder.ts'

// Cenário A — Academia (seção 27): serviços, PF, planos recorrentes,
// decide sozinho, venda no mesmo atendimento, WhatsApp + presencial, tour,
// objetivo muda recomendação, alto volume, sem jurídico/TI/compras.
test('cenário A (academia): jornada curta, sem perguntas enterprise', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.type = 'service'
  data.company_profile.offer.purchase_frequency = 'recurring'
  data.company_profile.offer.has_plans_or_packages = true
  data.company_profile.customer.buyer_type = 'person'
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.complexity.multiple_decision_makers = false
  data.company_profile.complexity.sales_events = ['Tour']
  data.company_profile.channels = ['WhatsApp', 'Presencial']
  data.company_profile.buyer_behavior.contact_is_decision_maker = 'yes'
  data.company_profile.buyer_behavior.closes_on_first_contact = true
  data.company_profile.buyer_behavior.workload_pattern = 'high_volume_short'

  const diagnosisVisible = getVisibleQuestions(DIAGNOSIS_QUESTIONS, data)
  assert.ok(!diagnosisVisible.some((q) => q.id === 'Q09'), 'sem múltiplos tipos de cliente, Q09 some')
  assert.ok(!diagnosisVisible.some((q) => q.id === 'Q30'), 'venda curta e direta não pergunta sobre consequência de não resolver')

  const decision = createBuyerDecisionDraft(data)
  const decisionVisible = getVisibleQuestions(BUYER_DECISION_QUESTIONS, { diagnosis: data, decision })
  assert.ok(
    !decisionVisible.some((q) => q.id === 'Q53'),
    'academia (PF, decide sozinho) não deveria receber pergunta de aprovação multipessoa',
  )

  const profile = getBuyerDecisionProfile(data, decision)
  assert.equal(profile.depth, 'light', 'venda de academia deveria ser calibrada como leve')
})

// Cenário B — SaaS B2B complexo (seção 28): empresa, semanas/meses, várias
// pessoas, demo, proposta, TI, jurídico, compras, critérios de decisão,
// justificativa interna, evento crítico.
test('cenário B (SaaS B2B complexo): arquitetura de decisão habilitada', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.type = 'service'
  data.company_profile.customer.buyer_type = 'company'
  data.company_profile.complexity.typical_timing = 'months'
  data.company_profile.complexity.multiple_decision_makers = true
  data.company_profile.complexity.sales_events = ['Demonstração', 'Proposta']
  data.commercial_rules.contracts.uses_contract = true
  data.commercial_rules.pricing.model = 'variable'

  const decision = createBuyerDecisionDraft(data)
  decision.formal_process = 'yes'
  decision.formal_process_steps = ['TI', 'Jurídico', 'Compras']
  decision.approval_or_blocker = 'yes'

  const decisionVisible = getVisibleQuestions(BUYER_DECISION_QUESTIONS, { diagnosis: data, decision }).map((q) => q.id)
  assert.ok(decisionVisible.includes('Q53'))
  assert.ok(decisionVisible.includes('Q59'), 'deveria perguntar sobre processo formal (TI/Jurídico/Compras)')
  assert.ok(decisionVisible.includes('Q60'), 'deveria perguntar sobre justificativa interna de investimento')
  assert.ok(decisionVisible.includes('Q61'), 'deveria perguntar sobre evento crítico / urgência real')

  const profile = getBuyerDecisionProfile(data, decision)
  assert.equal(profile.depth, 'deep', 'SaaS B2B complexo deveria ser calibrado como profundo')
})

// Cenário C — Varejo (seção 29): PF, produto padronizado, decide sozinho,
// minutos, alto volume, sem follow-up.
test('cenário C (varejo): poucas perguntas, sem peso de CRM enterprise', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.type = 'product'
  data.company_profile.offer.customization_depth = 'standard'
  data.company_profile.customer.buyer_type = 'person'
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.buyer_behavior.contact_is_decision_maker = 'yes'
  data.company_profile.buyer_behavior.closes_on_first_contact = true
  data.company_profile.buyer_behavior.workload_pattern = 'high_volume_short'
  data.current_sales_process.follow_up.happens = false

  const diagnosisVisible = getVisibleQuestions(DIAGNOSIS_QUESTIONS, data).map((q) => q.id)
  assert.ok(!diagnosisVisible.includes('Q72'), 'sem follow-up, não deveria perguntar motivos de retorno')
  assert.ok(!diagnosisVisible.includes('Q74'), 'sem follow-up, não deveria perguntar quando parar de insistir')

  const decision = createBuyerDecisionDraft(data)
  const profile = getBuyerDecisionProfile(data, decision)
  assert.equal(profile.depth, 'light', 'varejo simples deveria ser calibrado como leve')
})

function academiaData() {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.type = 'service'
  data.company_profile.offer.purchase_frequency = 'recurring'
  data.company_profile.customer.buyer_type = 'person'
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.complexity.multiple_decision_makers = false
  data.company_profile.buyer_behavior.contact_is_decision_maker = 'yes'
  data.company_profile.buyer_behavior.closes_on_first_contact = true
  data.company_profile.buyer_behavior.workload_pattern = 'high_volume_short'
  return data
}

function saasComplexData() {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.type = 'service'
  data.company_profile.customer.buyer_type = 'company'
  data.company_profile.complexity.typical_timing = 'months'
  data.company_profile.complexity.multiple_decision_makers = true
  data.company_profile.complexity.sales_events = ['Demonstração', 'Proposta']
  data.commercial_rules.contracts.uses_contract = true
  data.commercial_rules.pricing.model = 'variable'
  return data
}

test('a jornada guiada de decisão (capítulo 4) é comprovadamente mais curta para B2C simples do que para B2B complexo', () => {
  const academia = academiaData()
  const academiaDecision = createBuyerDecisionDraft(academia)
  academiaDecision.formal_process = 'no'
  academiaDecision.approval_or_blocker = 'no'
  const academiaVisible = getVisibleQuestions(BUYER_DECISION_QUESTIONS, {
    diagnosis: academia,
    decision: academiaDecision,
  })

  const saas = saasComplexData()
  const saasDecision = createBuyerDecisionDraft(saas)
  saasDecision.formal_process = 'yes'
  saasDecision.formal_process_steps = ['TI', 'Jurídico', 'Compras']
  saasDecision.approval_or_blocker = 'yes'
  const saasVisible = getVisibleQuestions(BUYER_DECISION_QUESTIONS, { diagnosis: saas, decision: saasDecision })

  assert.ok(
    academiaVisible.length < saasVisible.length,
    `jornada de decisão da academia (${academiaVisible.length}) deveria ser mais curta que a do SaaS B2B complexo (${saasVisible.length})`,
  )
})
