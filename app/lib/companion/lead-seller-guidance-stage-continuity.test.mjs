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

test('regressão sem evidência em ambas as tentativas: status de erro controlado, sem reaproveitar next_step/seller_intents da etapa rejeitada', async () => {
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

  // Re-auditoria (2ª rodada): a saída rejeitada foi gerada para a etapa
  // REGRESSIVA ("Descoberta") — nunca pode ser exibida como se fosse a
  // orientação da etapa anterior ("Formalização"). O contrato correto é
  // um erro controlado, nunca "Formalização" + ação de "Descoberta".
  assert.equal(result.status, 'error')
  assert.equal(
    result.stage_key,
    'formalizacao',
    'o estágio informado precisa continuar sendo o anterior (persistido), nunca o regressivo rejeitado',
  )
  assert.equal(result.stage_name, 'Formalização')
  assert.equal(
    result.next_step,
    null,
    'next_step da tentativa rejeitada (gerada para Descoberta) nunca pode ser reaproveitado sob Formalização',
  )
  assert.deepEqual(result.seller_intents, [])
  assert.ok(result.error, 'precisa haver uma mensagem de erro explicando a rejeição')
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

  assert.equal(result.status, 'error')
  assert.equal(
    result.stage_key,
    'formalizacao',
    'a saída do próprio modelo (stage_reason) nunca pode autorizar sua própria regressão',
  )
  assert.equal(result.next_step, null)
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

  assert.equal(result.status, 'error')
  assert.equal(
    result.stage_key,
    'formalizacao',
    'silêncio/ausência de resposta é waiting/follow-up, nunca regressão de etapa',
  )
  assert.equal(result.next_step, null)
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

  assert.equal(result.status, 'error')
  assert.equal(
    result.stage_key,
    'formalizacao',
    '"sumiu" não é evidência comercial de mudança — não pode justificar regressão',
  )
  assert.equal(result.next_step, null)
})

// ---------------------------------------------------------------------
// Re-auditoria do Controle Mestre (2ª rodada): MENÇÃO A CANCELAMENTO ≠
// CANCELAMENTO. PERGUNTA ≠ FATO. HIPÓTESE ≠ FATO. NEGAÇÃO DE REGRESSÃO ≠
// REGRESSÃO. Os 6 testes abaixo usam as frases exatas exigidas pelo
// Controle Mestre para validar sentenceAffirmsCommercialRegression.
// ---------------------------------------------------------------------

async function runRegressionScenario(incomingText) {
  const { provider } = buildProvider({
    stage_name: 'Descoberta',
    stage_reason: 'A conversa indica uma mudança na decisão da Marina sobre a academia.',
    next_step: 'Pergunte à Marina o que mudou e quais horários de aulas ela prefere agora.',
    seller_intents: ['Quero entender o que mudou para a Marina.'],
  })

  return composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: WORKING_SUMMARY,
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-27T10:00:00.000Z',
        text: incomingText,
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
}

test('(1, Controle Mestre) "Se eu cancelar depois, tem multa?" — pergunta condicional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Se eu cancelar depois, tem multa?',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
  assert.equal(result.next_step, null)
})

test('(2, Controle Mestre) "Não quero cancelar, só queria entender." — negação da própria regressão: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Não quero cancelar, só queria entender.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
  assert.equal(result.next_step, null)
})

test('(3, Controle Mestre) "Eu não quero recomeçar." — negação da própria regressão: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Eu não quero recomeçar.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
  assert.equal(result.next_step, null)
})

test('(4, Controle Mestre) "Se eu desistir no futuro, o que acontece?" — hipótese/pergunta: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Se eu desistir no futuro, o que acontece?',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
  assert.equal(result.next_step, null)
})

test('(5, Controle Mestre) "Desisti. Não quero mais continuar." — fato afirmado em primeira pessoa: regressão PODE ser aceita', async () => {
  const result = await runRegressionScenario(
    'Desisti. Não quero mais continuar.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(6, Controle Mestre) "Mudei de ideia e quero voltar atrás." — fato afirmado em primeira pessoa: regressão PODE ser aceita', async () => {
  const result = await runRegressionScenario(
    'Mudei de ideia e quero voltar atrás.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

// ---------------------------------------------------------------------
// Re-auditoria do Controle Mestre (3ª rodada): troca de estratégia de
// KEYWORD + BLACKLIST para ALLOWLIST DE AFIRMAÇÕES COMERCIAIS EXPLÍCITAS.
// "Quero saber como cancelar", "talvez eu cancele", "meu marido cancelou"
// e "não quero mais receber mensagens" continham as palavras-chave sem
// representar nenhuma regressão comercial real — só uma afirmação
// explícita em primeira pessoa, ligada à negociação, pode autorizar.
// ---------------------------------------------------------------------

test('(3.1, Controle Mestre) "Quero saber como cancelar" — pergunta de informação: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Quero saber como cancelar',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(3.2, Controle Mestre) "Talvez eu cancele" — incerteza: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Talvez eu cancele',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(3.3, Controle Mestre) "Estou pensando em cancelar" — incerteza: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Estou pensando em cancelar',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(3.4, Controle Mestre) "Não tenho certeza se quero cancelar" — incerteza (contém "quero cancelar" como substring, mas não pode ser aprovado): BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Não tenho certeza se quero cancelar',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(3.5, Controle Mestre) "Meu marido cancelou o plano dele" — terceiro: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Meu marido cancelou o plano dele',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(3.6, Controle Mestre) "Não quero mais receber mensagens" — opt-out de comunicação, não desistência comercial: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Não quero mais receber mensagens',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(3.7, Controle Mestre) "Desisti" — afirmação explícita em primeira pessoa: PERMITIDO', async () => {
  const result = await runRegressionScenario('Desisti')

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(3.8, Controle Mestre) "Quero cancelar" — afirmação explícita em primeira pessoa: PERMITIDO', async () => {
  const result = await runRegressionScenario('Quero cancelar')

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(3.9, Controle Mestre) "Mudei de ideia e não vou seguir" — afirmação explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Mudei de ideia e não vou seguir',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(3.10, Controle Mestre) "Não quero mais continuar" — afirmação explícita ligada à continuidade: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Não quero mais continuar',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(3.11, Controle Mestre) "Meu marido cancelou. Eu quero continuar." — contradição/terceiro: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Meu marido cancelou. Eu quero continuar.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(3.12, Controle Mestre) "Talvez eu cancele, mas por enquanto quero continuar." — incerteza/contradição: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Talvez eu cancele, mas por enquanto quero continuar.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

// ---------------------------------------------------------------------
// Re-auditoria do Controle Mestre (4ª rodada, hardening final):
//   1. Contrato/regra não é terceiro — "quero cancelar o contrato" é
//      declaração comercial válida; só a PERGUNTA sobre a regra bloqueia.
//   2. Objeto não comercial — "cancelar"/"desisti" não autorizam
//      cancelamento de agenda/operacional (aula, agendamento, ligação);
//      e "desisti de cancelar"/"desisti da ideia de cancelar" é inversão
//      semântica (quer continuar, não desistir do negócio).
//   3. Contradição entre frases — uma afirmação de continuidade em
//      qualquer parte da interação veta a regressão nesta rodada.
// ---------------------------------------------------------------------

test('(4.1, Controle Mestre) "Quero cancelar o contrato." — contrato não é terceiro: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Quero cancelar o contrato.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(4.2, Controle Mestre) "Decidi cancelar o contrato." — declaração comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Decidi cancelar o contrato.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(4.3, Controle Mestre) "Quero cancelar o plano." — declaração comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Quero cancelar o plano.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(4.4, Controle Mestre) "Desisti da compra." — desistência comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Desisti da compra.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(4.5, Controle Mestre) "Desisti da contratação." — desistência comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Desisti da contratação.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(4.6, Controle Mestre) "O contrato diz que posso cancelar?" — pergunta sobre a regra: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'O contrato diz que posso cancelar?',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.7, Controle Mestre) "Quero cancelar a aula de amanhã." — objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Quero cancelar a aula de amanhã.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.8, Controle Mestre) "Quero cancelar meu agendamento." — objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Quero cancelar meu agendamento.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.9, Controle Mestre) "Quero cancelar a ligação." — objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Quero cancelar a ligação.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.10, Controle Mestre) "Desisti de cancelar." — inversão semântica (quer continuar): BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti de cancelar.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.11, Controle Mestre) "Desisti da ideia de cancelar." — inversão semântica (quer continuar): BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti da ideia de cancelar.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.12, Controle Mestre) "Não quero mais receber mensagens." — opt-out de comunicação: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Não quero mais receber mensagens.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.13, Controle Mestre) "Desisti. Pensando melhor, quero continuar." — contradição explícita: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti. Pensando melhor, quero continuar.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.14, Controle Mestre) "Quero cancelar. Na verdade, quero seguir." — contradição explícita: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Quero cancelar. Na verdade, quero seguir.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(4.15, Controle Mestre) "Mudei de ideia. Mas decidi continuar com a contratação." — contradição explícita: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Mudei de ideia. Mas decidi continuar com a contratação.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

// ---------------------------------------------------------------------
// Re-auditoria do Controle Mestre (última correção cirúrgica): o filtro
// de objeto operacional só rodava para "(quero|vou|decidi) cancelar" —
// "desisti" isolado (sem "cancelar") ligado a um objeto operacional
// ("Desisti da aula de amanhã.") ainda escapava e autorizava regressão
// comercial indevidamente.
// ---------------------------------------------------------------------

test('(5.1, Controle Mestre) "Desisti da aula de amanhã." — desistência de objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti da aula de amanhã.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(5.2, Controle Mestre) "Desisti da reunião." — desistência de objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti da reunião.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(5.3, Controle Mestre) "Desisti da visita." — desistência de objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti da visita.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(5.4, Controle Mestre) "Desisti do agendamento." — desistência de objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti do agendamento.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(5.5, Controle Mestre) "Desisti da consulta." — desistência de objeto operacional: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti da consulta.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
})

test('(5.6, Controle Mestre) "Desisti." — desistência comercial sem objeto: PERMITIDO', async () => {
  const result = await runRegressionScenario('Desisti.')

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(5.7, Controle Mestre) "Desisti da compra." — desistência comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Desisti da compra.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(5.8, Controle Mestre) "Desisti da contratação." — desistência comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Desisti da contratação.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(5.9, Controle Mestre) "Desisti do plano." — desistência comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Desisti do plano.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(5.10, Controle Mestre) "Desisti do contrato." — desistência comercial explícita: PERMITIDO', async () => {
  const result = await runRegressionScenario(
    'Desisti do contrato.',
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_key, 'descoberta')
})

test('(5.11, Controle Mestre) "Desisti de cancelar." — inversão semântica preservada: BLOQUEADO', async () => {
  const result = await runRegressionScenario(
    'Desisti de cancelar.',
  )

  assert.equal(result.status, 'error')
  assert.equal(result.stage_key, 'formalizacao')
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
