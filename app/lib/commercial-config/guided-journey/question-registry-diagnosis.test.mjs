import assert from 'node:assert/strict'
import test from 'node:test'

import { DIAGNOSIS_QUESTIONS } from './question-registry-diagnosis.ts'
import {
  getChapterProgress,
  getNextQuestion,
  getPreviousQuestion,
  getQuestionById,
  getVisibleQuestions,
  isQuestionVisible,
} from './types.ts'
import { createEmptyCommercialMethodBuilderData } from '../../../types/commercial-method-builder.ts'

function findQuestion(id) {
  const question = getQuestionById(DIAGNOSIS_QUESTIONS, id)
  assert.ok(question, `pergunta ${id} deveria existir no registro`)
  return question
}

function visibleIds(data) {
  return getVisibleQuestions(DIAGNOSIS_QUESTIONS, data).map((question) => question.id)
}

test('B2C simples pula perguntas de segmentação múltipla', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.buyer_behavior.has_multiple_customer_types = false

  const ids = visibleIds(data)
  assert.ok(!ids.includes('Q09'), 'Q09 não deveria aparecer sem múltiplos tipos de cliente')
  assert.ok(!ids.includes('Q10'), 'Q10 não deveria aparecer sem múltiplos tipos de cliente')
})

test('venda curta não recebe pergunta de consequência (Q30)', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.buyer_behavior.workload_pattern = 'high_volume_short'

  assert.ok(!visibleIds(data).includes('Q30'))
})

test('venda longa ou poucas oportunidades complexas habilita Q30 (consequência influencia decisão)', () => {
  const longSale = createEmptyCommercialMethodBuilderData()
  longSale.company_profile.complexity.typical_timing = 'weeks'
  assert.ok(visibleIds(longSale).includes('Q30'))

  const complexSale = createEmptyCommercialMethodBuilderData()
  complexSale.company_profile.buyer_behavior.workload_pattern = 'few_complex'
  assert.ok(visibleIds(complexSale).includes('Q30'))
})

test('compra única não habilita perguntas de renovação', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.purchase_frequency = 'one_time'

  const ids = visibleIds(data)
  assert.ok(!ids.includes('Q81'))
  assert.ok(!ids.includes('Q83'))
})

test('recorrência habilita perguntas de renovação', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.purchase_frequency = 'recurring'

  const ids = visibleIds(data)
  assert.ok(ids.includes('Q81'))
  assert.ok(ids.includes('Q83'))
})

test('sem eventos de venda (sem demo/tour) não pergunta detalhe de eventos', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.complexity.sales_events = []

  assert.ok(!visibleIds(data).includes('Q33_36'))
})

test('demo/tour selecionado habilita o detalhamento de eventos (Q33_36)', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.complexity.sales_events = ['Demonstração']

  assert.ok(visibleIds(data).includes('Q33_36'))

  const question = findQuestion('Q33_36')
  const detail = question.getValue(data)
  assert.deepEqual(
    detail.map((item) => item.event),
    ['Demonstração'],
  )
  assert.equal(question.isAnswered(data), false, 'não deveria contar como respondida sem frequência preenchida')

  const answered = question.setValue(data, [
    { event: 'Demonstração', frequency: 'always', success_definition: 'Cliente confirma interesse', depends_on_customer_knowledge: 'no' },
  ])
  assert.equal(question.isAnswered(answered), true)
})

test('mudar uma resposta anterior recalcula a rota (show_when reage a novo valor)', () => {
  let data = createEmptyCommercialMethodBuilderData()
  const q05 = findQuestion('Q05')
  data = q05.setValue(data, true)

  assert.ok(visibleIds(data).includes('Q06'), 'Q06 deveria aparecer quando existem planos/pacotes')

  data = q05.setValue(data, false)
  assert.ok(!visibleIds(data).includes('Q06'), 'Q06 deveria sumir quando a resposta muda para não')
})

test('voltar preserva a resposta já dada (não apaga nada)', () => {
  let data = createEmptyCommercialMethodBuilderData()
  const q01 = findQuestion('Q01')
  const q02 = findQuestion('Q02')

  data = q01.setValue(data, 'service')
  data = q02.setValue(data, ['Consultoria mensal'])

  const previous = getPreviousQuestion(DIAGNOSIS_QUESTIONS, data, 'Q02')
  assert.equal(previous.id, 'Q01')
  assert.equal(previous.getValue(data), 'service', 'a resposta de Q01 continua intacta ao voltar')
  assert.deepEqual(q02.getValue(data), ['Consultoria mensal'], 'a resposta de Q02 continua intacta')
})

test('refresh (recomputar do zero) retoma exatamente na próxima pergunta correta', () => {
  let data = createEmptyCommercialMethodBuilderData()
  const q01 = findQuestion('Q01')
  const q02 = findQuestion('Q02')

  data = q01.setValue(data, 'service')
  data = q02.setValue(data, ['Consultoria mensal'])

  // Simula um "refresh": recomputa a próxima pergunta apenas a partir dos
  // dados persistidos, sem nenhum estado de navegação em memória.
  const resumed = getNextQuestion(DIAGNOSIS_QUESTIONS, data)
  assert.equal(resumed.id, 'Q03', 'deveria retomar em Q03, a primeira pergunta ainda não respondida')
})

test('progresso de capítulo conta apenas perguntas visíveis, não o total de 96', () => {
  const data = createEmptyCommercialMethodBuilderData()
  const progress = getChapterProgress(DIAGNOSIS_QUESTIONS, 'buyers', data)
  assert.ok(progress.total < 20, 'o capítulo "buyers" não deveria expor uma contagem gigante do tipo "17 de 96"')
})

test('pergunta oculta não é considerada visível mesmo se alguém tentar acessá-la diretamente', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.buyer_behavior.has_multiple_customer_types = false
  const q10 = findQuestion('Q10')
  assert.equal(isQuestionVisible(q10, data), false)
})
