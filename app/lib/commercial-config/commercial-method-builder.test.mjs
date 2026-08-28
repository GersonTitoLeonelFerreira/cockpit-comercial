import assert from 'node:assert/strict'
import test from 'node:test'

import {
  advanceCommercialMethodBuilder,
  buildCommercialMethodBuilderReview,
  getCommercialMethodBuilderVisibility,
  goToPreviousBuilderStep,
  parseCommercialMethodBuilderDraftInput,
  validateCommercialMethodBuilderStep,
} from './commercial-method-builder.ts'
import {
  createEmptyCommercialMethodBuilderDraft,
} from '../../types/commercial-method-builder.ts'

function validStep1Draft() {
  const draft = createEmptyCommercialMethodBuilderDraft()
  draft.data.company_profile.offer.type = 'service'
  draft.data.company_profile.offer.main_offerings = ['Consultoria']
  draft.data.company_profile.customer.buyer_type = 'person'
  draft.data.company_profile.complexity.typical_timing = 'days'
  draft.data.company_profile.channels = ['WhatsApp']
  return draft
}

function validThroughStep3Draft() {
  const draft = validStep1Draft()
  draft.data.commercial_rules.pricing.model = 'fixed'
  draft.data.commercial_rules.pricing.seller_can_negotiate = false
  draft.data.commercial_rules.discounts.policy = 'manager_only'
  draft.data.commercial_rules.contracts.uses_contract = false

  draft.data.current_sales_process.lead_entry.sources = ['Indicação']
  draft.data.current_sales_process.lead_entry.seller_discovery_needed = true
  draft.data.current_sales_process.commercial.price_timing =
    'Depois de entender a necessidade.'
  draft.data.current_sales_process.closing.completion_actions = ['Pagamento']
  draft.data.current_sales_process.follow_up.happens = true
  draft.data.current_sales_process.losses = ['Preço']
  return draft
}

test('1) usuário começa do zero no passo 1 sem método pronto', () => {
  const draft = createEmptyCommercialMethodBuilderDraft()

  assert.equal(draft.current_step, 1)
  assert.deepEqual(draft.completed_steps, [])
  assert.equal(draft.ready_for_method, false)
  assert.equal(draft.data.company_profile.offer.type, '')
})

test('2) avançar preserva respostas e registra progresso', () => {
  const draft = validStep1Draft()
  const progress = advanceCommercialMethodBuilder(
    draft.current_step,
    draft.completed_steps,
  )

  const next = { ...draft, ...progress }

  assert.equal(next.current_step, 2)
  assert.deepEqual(next.completed_steps, [1])
  assert.deepEqual(next.data.company_profile.offer.main_offerings, ['Consultoria'])
})

test('3) voltar não altera respostas já informadas', () => {
  const draft = validStep1Draft()
  draft.current_step = 3

  const previous = goToPreviousBuilderStep(draft.current_step)

  assert.equal(previous, 2)
  assert.deepEqual(draft.data.company_profile.channels, ['WhatsApp'])
})

test('4) contrato não oculta e mostra somente detalhes aplicáveis', () => {
  const draft = validThroughStep3Draft()

  draft.data.commercial_rules.contracts.uses_contract = false
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showContractDetails,
    false,
  )

  draft.data.commercial_rules.contracts.uses_contract = true
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showContractDetails,
    true,
  )
})

test('5) desconto mostra limite somente quando vendedor possui alçada', () => {
  const draft = validThroughStep3Draft()

  draft.data.commercial_rules.discounts.policy = 'manager_only'
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showDiscountLimit,
    false,
  )
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showDiscountApprovalRule,
    true,
  )

  draft.data.commercial_rules.discounts.policy = 'seller_with_limit'
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showDiscountLimit,
    true,
  )
})

test('6) B2B/B2C altera perguntas sobre decisores', () => {
  const draft = validThroughStep3Draft()

  draft.data.company_profile.customer.buyer_type = 'person'
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showB2BDecisionMakers,
    false,
  )

  draft.data.company_profile.customer.buyer_type = 'company'
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showB2BDecisionMakers,
    true,
  )

  draft.data.company_profile.customer.buyer_type = 'both'
  assert.equal(
    getCommercialMethodBuilderVisibility(draft.data).showB2BDecisionMakers,
    true,
  )
})

test('7) venda no primeiro contato não presume inexistência de follow-up', () => {
  const draft = validThroughStep3Draft()
  draft.data.company_profile.complexity.typical_timing = 'first_contact'
  draft.data.current_sales_process.follow_up.happens = true

  assert.equal(
    draft.data.current_sales_process.follow_up.happens,
    true,
  )
  assert.deepEqual(
    validateCommercialMethodBuilderStep(3, draft.data),
    [],
  )
})

test('8) validação bloqueia avanço quando contexto essencial não existe', () => {
  const draft = createEmptyCommercialMethodBuilderDraft()
  const issues = validateCommercialMethodBuilderStep(1, draft.data)

  assert.ok(issues.length >= 4)
  assert.ok(issues.some((issue) => /oferta/i.test(issue)))
  assert.ok(issues.some((issue) => /canal/i.test(issue)))
})

test('9) revisão reproduz respostas estruturadas corretas', () => {
  const draft = validThroughStep3Draft()
  draft.data.company_profile.customer.buyer_type = 'both'
  draft.data.company_profile.channels = ['WhatsApp', 'Presencial']
  draft.data.commercial_rules.payment.methods = ['PIX', 'Cartão']

  const review = buildCommercialMethodBuilderReview(draft.data)

  assert.equal(review.length, 4)
  assert.ok(
    review
      .flatMap((block) => block.items)
      .some((item) => item.includes('WhatsApp, Presencial')),
  )
  assert.ok(
    review
      .flatMap((block) => block.items)
      .some((item) => item.includes('PIX, Cartão')),
  )
})

test('10) parser aceita rascunho estruturado e rejeita progresso inválido', () => {
  const draft = validThroughStep3Draft()
  draft.current_step = 4
  draft.completed_steps = [1, 2, 3]

  assert.notEqual(parseCommercialMethodBuilderDraftInput(draft), null)

  const invalid = {
    ...draft,
    current_step: 7,
  }

  assert.equal(parseCommercialMethodBuilderDraftInput(invalid), null)
})

test('11) marcar pronto é estado separado da criação do método', () => {
  const draft = validThroughStep3Draft()
  draft.current_step = 4
  draft.completed_steps = [1, 2, 3, 4]
  draft.ready_for_method = true

  const parsed = parseCommercialMethodBuilderDraftInput(draft)

  assert.equal(parsed?.ready_for_method, true)
  assert.equal('commercial_method_definition' in parsed.data, false)
  assert.equal('method_steps' in parsed.data, false)
})
