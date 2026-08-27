// Fase 12A, Frente 2B — Blocker 3: gate determinístico anti-regressão
// de etapa em composeSellerFacingGuidance.

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

const { composeSellerFacingGuidance } =
  await import('./lead-seller-guidance.ts')

const method = {
  id: 'method-v5',
  version_number: 5,
  source_contract_version: 'commercial-method-v2',
  name: 'Metodo AVANÇAR',
  description: 'Método comercial de teste.',
  structure_source: 'structured_definition',
  principles: [],
  stages: [
    {
      key: 'descoberta',
      name: 'Descoberta',
      display_order: 1,
      objective: 'Entender a necessidade do cliente.',
      requirement: 'required',
      completion_criteria: [],
      partial_completion_criteria: [],
      skip_conditions: [],
      deepen_when: [],
      sufficient_when: [],
      advance_when: [],
      wait_when: [],
      stop_asking_when: [],
      recommended_questions: [],
      common_mistakes: [],
      dimensions: [],
    },
    {
      key: 'formalizacao',
      name: 'Formalização',
      display_order: 5,
      objective: 'Concluir as pendências depois da decisão.',
      requirement: 'required',
      completion_criteria: [],
      partial_completion_criteria: [],
      skip_conditions: [],
      deepen_when: [],
      sufficient_when: [],
      advance_when: [],
      wait_when: [],
      stop_asking_when: [],
      recommended_questions: [],
      common_mistakes: [],
      dimensions: [],
    },
  ],
  business_context: {
    business_description: 'Academia',
    target_audience: 'Alunos',
    value_proposition: 'Treino',
  },
  seller_rules: {
    communication_tone: 'Direta e humana',
    required_behaviors: [],
    prohibited_behaviors: [],
  },
}

const WORKING_SUMMARY =
  'A Marina já decidiu seguir com a academia e falta apenas confirmar o horário de início das aulas.'

function buildProvider(response) {
  let calls = 0
  return {
    getCalls: () => calls,
    provider: async () => {
      calls++
      return {
        content: JSON.stringify(response),
        provider: 'test',
        model: 'test',
        request_id: `req-${calls}`,
        usage: null,
      }
    },
  }
}

test('mantém a etapa anterior quando a nova sugestão regrediria sem evidência', async () => {
  const { provider, getCalls } = buildProvider({
    stage_name: 'Descoberta',
    stage_reason: 'Quero entender melhor o que a Marina procura nas aulas.',
    next_step: 'Pergunte à Marina quais horários de aulas ela prefere.',
    seller_intents: ['Quero entender o que a Marina procura nas aulas.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    method,
    provider,
    previousStage: {
      method_config_version_id: 'method-v5',
      stage_key: 'formalizacao',
      stage_display_order: 5,
      stage_reason: 'Decisão de seguir com a academia já confirmada.',
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.stage_key,
    'formalizacao',
    'a etapa não deveria regredir sem evidência de mudança real',
  )
  assert.equal(result.stage_name, 'Formalização')
  assert.match(result.stage_reason, /mantida/i)
  // O next_step da tentativa (rejeitada apenas por causa da etapa)
  // continua sendo aproveitado.
  assert.match(result.next_step, /horários de aulas/i)
  assert.equal(getCalls(), 2, 'deveria esgotar as 2 tentativas antes de aplicar o fallback')
})

test('permite regressão de etapa quando o CLIENTE diz, na interação atual, algo que evidencia mudança real', async () => {
  const { provider } = buildProvider({
    stage_name: 'Descoberta',
    stage_reason:
      'A Marina desistiu de seguir com a academia e quer recomeçar a conversa sobre os horários de aulas.',
    next_step: 'Pergunte à Marina o que mudou e quais horários de aulas ela prefere agora.',
    seller_intents: ['Quero entender o que mudou para a Marina.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-27T10:00:00.000Z',
        text: 'Na verdade eu desisti da academia, quero recomeçar a conversa do zero sobre os horários de aulas.',
      },
    ],
    method,
    provider,
    previousStage: {
      method_config_version_id: 'method-v5',
      stage_key: 'formalizacao',
      stage_display_order: 5,
      stage_reason: 'Decisão de seguir com a academia já confirmada.',
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.stage_key,
    'descoberta',
    'regressão com evidência explícita do cliente na interação atual deveria ser permitida',
  )
})

test('(A, Controle Mestre) modelo inventa "cliente desistiu" no próprio stage_reason, mas a conversa não contém isso: regressão BLOQUEADA', async () => {
  const { provider, getCalls } = buildProvider({
    stage_name: 'Descoberta',
    stage_reason:
      'A Marina desistiu de seguir com a academia e quer recomeçar do zero.',
    next_step: 'Pergunte à Marina quais horários de aulas ela prefere.',
    seller_intents: ['Quero entender o que a Marina procura nas aulas.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    // Nenhuma mensagem incoming real do cliente contém desistência —
    // a única fonte da palavra "desistiu" é o stage_reason do próprio
    // modelo, o que NUNCA pode autorizar o gate.
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-27T10:00:00.000Z',
        text: 'Certo, e sobre o horário das aulas?',
      },
    ],
    method,
    provider,
    previousStage: {
      method_config_version_id: 'method-v5',
      stage_key: 'formalizacao',
      stage_display_order: 5,
      stage_reason: 'Decisão de seguir com a academia já confirmada.',
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.stage_key,
    'formalizacao',
    'a saída do próprio modelo (stage_reason) nunca pode autorizar sua própria regressão',
  )
  assert.equal(getCalls(), 2)
})

test('(C, Controle Mestre) cliente parou de responder: NÃO é motivo de regressão', async () => {
  const { provider } = buildProvider({
    stage_name: 'Descoberta',
    stage_reason: 'A Marina parou de responder, o que sugere que ela sumiu da conversa.',
    next_step: 'Envie um follow-up perguntando se a Marina ainda tem interesse nas aulas.',
    seller_intents: ['Quero saber se a Marina ainda tem interesse nas aulas.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    currentInteraction: [],
    method,
    provider,
    previousStage: {
      method_config_version_id: 'method-v5',
      stage_key: 'formalizacao',
      stage_display_order: 5,
      stage_reason: 'Decisão de seguir com a academia já confirmada.',
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.stage_key,
    'formalizacao',
    'silêncio/ausência de resposta é waiting/follow-up, nunca regressão de etapa',
  )
})

test('(D, Controle Mestre) cliente "sumiu": NÃO é motivo de regressão', async () => {
  const { provider } = buildProvider({
    stage_name: 'Descoberta',
    stage_reason: 'A Marina sumiu da conversa, então voltamos para entender a necessidade dela.',
    next_step: 'Envie um follow-up perguntando se a Marina ainda tem interesse nas aulas.',
    seller_intents: ['Quero saber se a Marina ainda tem interesse nas aulas.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    currentInteraction: [],
    method,
    provider,
    previousStage: {
      method_config_version_id: 'method-v5',
      stage_key: 'formalizacao',
      stage_display_order: 5,
      stage_reason: 'Decisão de seguir com a academia já confirmada.',
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.stage_key,
    'formalizacao',
    '"sumiu" não é evidência comercial de mudança — não pode justificar regressão',
  )
})

test('nova versão do método publicado não é tratada como regressão (sem estágio anterior aplicável)', async () => {
  const { provider } = buildProvider({
    stage_name: 'Descoberta',
    stage_reason: 'Início da conversa sob o novo método publicado.',
    next_step: 'Pergunte à Marina quais horários de aulas ela prefere.',
    seller_intents: ['Quero entender o que a Marina procura nas aulas.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    method,
    provider,
    previousStage: {
      // Versão diferente da atual (method.id = 'method-v5') — o
      // estágio anterior pertence a uma versão obsoleta do método.
      method_config_version_id: 'method-v4-old',
      stage_key: 'formalizacao',
      stage_display_order: 5,
      stage_reason: 'Decisão já confirmada na versão antiga do método.',
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.stage_key,
    'descoberta',
    'estágio de versão diferente do método não deveria bloquear a nova etapa',
  )
})

test('avanço de etapa nunca é bloqueado pelo gate de continuidade', async () => {
  const { provider } = buildProvider({
    stage_name: 'Formalização',
    stage_reason: 'A Marina confirmou que quer seguir com a academia.',
    next_step: 'Confirme com a Marina o horário de início das aulas.',
    seller_intents: ['Quero confirmar o horário das aulas com a Marina.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    method,
    provider,
    previousStage: {
      method_config_version_id: 'method-v5',
      stage_key: 'descoberta',
      stage_display_order: 1,
      stage_reason: 'Ainda entendendo a necessidade da Marina.',
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'formalizacao')
})

test('sem estágio anterior (primeira análise do ciclo), qualquer etapa é aceita normalmente', async () => {
  const { provider } = buildProvider({
    stage_name: 'Formalização',
    stage_reason: 'A Marina já chegou decidida a seguir com a academia.',
    next_step: 'Confirme com a Marina o horário de início das aulas.',
    seller_intents: ['Quero confirmar o horário das aulas com a Marina.'],
  })

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    method,
    provider,
    previousStage: null,
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'formalizacao')
})
