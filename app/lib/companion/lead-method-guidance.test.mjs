import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL(
      '../../../scripts/typescript-test-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

const {
  composeLeadMethodGuidance,
  normalizePublishedCommercialMethod,
} = await import('./lead-method-guidance.ts')

const publishedV1 = {
  id: 'ef09c47e-83c5-401d-867c-bdf1f909e838',
  version_number: 1,
  commercial_method_name: 'Metodo ATO',
  commercial_method_description: 'Método publicado originalmente no contrato v1.',
  commercial_method_contract_version: 'commercial-method-v1',
  commercial_method_definition: {
    contract_version: 'commercial-method-v1',
  },
}

const legacySteps = [
  {
    step_order: 1,
    name: 'Compreensão do contexto',
    objective: 'Entender a situação atual e o motivo da conversa.',
    completion_criteria: [
      'Situação atual identificada',
      'Motivo do contato compreendido',
    ],
    recommended_questions: [
      'Como vocês realizam esse processo hoje?',
    ],
    is_required: true,
  },
  {
    step_order: 2,
    name: 'Diagnóstico da necessidade',
    objective: 'Identificar o problema, impacto e resultado esperado.',
    completion_criteria: [
      'Problema principal identificado',
      'Impacto do problema compreendido',
      'Resultado esperado confirmado',
    ],
    recommended_questions: [
      'Onde esse processo mais prejudica a operação?',
    ],
    is_required: true,
  },
  {
    step_order: 3,
    name: 'Construção da solução',
    objective: 'Relacionar a necessidade à solução adequada.',
    completion_criteria: [
      'Solução relacionada à necessidade',
      'Benefícios relevantes apresentados',
    ],
    recommended_questions: [],
    is_required: true,
  },
  {
    step_order: 4,
    name: 'Próximo compromisso',
    objective: 'Definir uma ação concreta para avançar.',
    completion_criteria: [
      'Próxima ação definida',
      'Responsável pela ação identificado',
      'Data ou prazo registrado',
    ],
    recommended_questions: [],
    is_required: true,
  },
]

test('configuração publicada v1 usa os passos reais e vira método utilizável', () => {
  const method = normalizePublishedCommercialMethod(
    publishedV1,
    legacySteps,
  )

  assert.ok(method)
  assert.equal(method.name, 'Metodo ATO')
  assert.equal(method.definition.contract_version, 'commercial-method-v2')
  assert.equal(method.definition.stages.length, 4)
  assert.deepEqual(
    method.definition.stages.map((stage) => stage.name),
    [
      'Compreensão do contexto',
      'Diagnóstico da necessidade',
      'Construção da solução',
      'Próximo compromisso',
    ],
  )
  assert.equal(method.definition.stages[1].key, 'legacy_step_2')
  assert.deepEqual(
    method.definition.stages[1].sufficient_when,
    legacySteps[1].completion_criteria,
  )
})

test('configuração v1 sem passos não finge possuir método válido', () => {
  assert.equal(
    normalizePublishedCommercialMethod(publishedV1, []),
    null,
  )
})

test('orientação V2 aceita etapa do método convertido e exige próximo passo concreto', async () => {
  const method = normalizePublishedCommercialMethod(
    publishedV1,
    legacySteps,
  )

  const provider = async () => ({
    content: JSON.stringify({
      stage_key: 'legacy_step_2',
      stage_reason:
        'O problema de follow-up já apareceu, mas o impacto e o resultado esperado ainda precisam ser confirmados.',
      next_step:
        'Confirme com a cliente qual impacto a perda de follow-ups gera hoje e obtenha um exemplo concreto de oportunidade perdida antes de voltar à proposta.',
    }),
    provider: 'test',
  })

  const guidance = await composeLeadMethodGuidance({
    workingSummary:
      'A cliente relatou perda de oportunidades por falta de follow-up, conhece a proposta da Yolen e apresentou objeção de investimento.',
    method,
    provider,
  })

  assert.equal(guidance.status, 'ready')
  assert.equal(guidance.method_name, 'Metodo ATO')
  assert.equal(guidance.stage_name, 'Diagnóstico da necessidade')
  assert.match(guidance.next_step, /impacto a perda de follow-ups/i)
})

test('orientação genérica é rejeitada', async () => {
  const method = normalizePublishedCommercialMethod(
    publishedV1,
    legacySteps,
  )

  const provider = async () => ({
    content: JSON.stringify({
      stage_key: 'legacy_step_4',
      stage_reason: 'Falta continuidade.',
      next_step: 'Retomar a negociação.',
    }),
    provider: 'test',
  })

  const guidance = await composeLeadMethodGuidance({
    workingSummary: 'Existe uma negociação aberta.',
    method,
    provider,
  })

  assert.equal(guidance.status, 'error')
  assert.equal(guidance.next_step, null)
})
