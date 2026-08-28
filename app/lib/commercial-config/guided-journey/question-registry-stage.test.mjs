import assert from 'node:assert/strict'
import test from 'node:test'

import { STAGE_QUESTIONS } from './question-registry-stage.ts'
import { getNextQuestion, getVisibleQuestions, isQuestionAnswered } from './types.ts'
import { createManualConstructionStage } from '../assisted-method-construction.ts'

test('E15 (quando pular a etapa) só aparece quando a etapa não é obrigatória', () => {
  const stage = createManualConstructionStage('Diagnóstico')
  stage.requirement = 'required'
  assert.ok(!getVisibleQuestions(STAGE_QUESTIONS, stage).some((q) => q.id === 'E15'))

  stage.requirement = 'conditional'
  assert.ok(getVisibleQuestions(STAGE_QUESTIONS, stage).some((q) => q.id === 'E15'))
})

test('a jornada da etapa segue E01 → E02 → ... na ordem, uma pergunta por vez', () => {
  let stage = createManualConstructionStage('')
  const first = getNextQuestion(STAGE_QUESTIONS, stage)
  assert.equal(first.id, 'E01', 'sem nome, a primeira pergunta em aberto deve ser E01')

  stage = first.setValue(stage, 'Diagnóstico inicial')
  const second = getNextQuestion(STAGE_QUESTIONS, stage)
  assert.equal(second.id, 'E02', 'depois de responder E01, a próxima em aberto é E02')
})

test('todos os campos E01-E14 mapeiam para campos reais e reutilizáveis do editor avançado', () => {
  const stage = createManualConstructionStage('Etapa')
  const prefilledByFactory = new Set(['E01', 'E14']) // nome e obrigatoriedade já vêm com valor padrão da fábrica
  for (const question of STAGE_QUESTIONS) {
    if (question.id === 'E15') continue
    const value = question.getValue(stage)
    assert.notEqual(value, undefined, `getValue(${question.id}) não deveria ser undefined`)
    assert.equal(
      isQuestionAnswered(question, stage),
      prefilledByFactory.has(question.id),
      `estado de "respondida" inesperado para ${question.id}`,
    )
  }
})
