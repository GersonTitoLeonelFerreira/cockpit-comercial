// Regressão para o FAIL confirmado na validação seller-facing: uma
// negociação comercial ativa que atravessa um intervalo real de silêncio
// maior que CURRENT_SESSION_GAP_MS (4h) perde a evidência comercial porque
// somente a mensagem posterior ao gap entra como "sessão temporal atual" —
// o conteúdo comercial anterior (pergunta de discovery, apresentação de
// valor) só chega ao modelo via context_bridge_messages, que o próprio
// prompt proíbe tratar como evidência de commercial_relevance.
//
// Cenário confirmado (ver investigação): 09:00/09:05/09:10 discussão
// comercial real (leads sem retorno → discovery → apresentação de valor da
// Yolen), gap de 6h, 15:10 resposta do cliente ("Faz sentido, deixa eu ver
// aqui com o time.") sem palavra-chave comercial isolada.
//
// Este arquivo só documenta o comportamento ATUAL do
// stateful-copilot-execution-plan.ts (nenhum código de produção foi
// alterado). Um teste (marcado `todo`) expressa o comportamento ainda NÃO
// implementado que o ajuste aprovado precisa satisfazer — ele falha hoje de
// propósito e deve passar a satisfazer somente depois que a exceção de
// continuidade for adicionada ao prompt, sem enfraquecer os testes normais
// abaixo (que pinam os textos de fail-closed existentes).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from './diagnostic-contract.ts'

import {
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
} from './diagnostic-input.ts'

import {
  buildStatefulCopilotInput,
} from './stateful-copilot-input.ts'

import {
  buildStatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan.ts'

function commercialContext() {
  return {
    configured: true,
    config_version_id: 'config-version-1',
    config_version_number: 1,
    config_contract_version: 'commercial-config-v1',
    business_description: 'Software de execução e inteligência comercial.',
    target_audience: 'Empresas com equipes comerciais.',
    value_proposition: 'Organizar o processo comercial e apoiar decisões.',
    communication_tone: 'Consultivo, claro e direto.',
    required_behaviors: ['Responder perguntas pendentes antes de pressionar por avanço.'],
    prohibited_behaviors: ['Inventar preço ou condição comercial.'],
    sales_method: {
      configured: true,
      name: 'Venda consultiva',
      description: 'Compreender necessidade, contexto e critérios antes da recomendação.',
      steps: [{
        step_order: 1,
        name: 'Descoberta',
        objective: 'Compreender contexto e necessidade.',
        completion_criteria: ['Necessidade identificada.'],
        recommended_questions: ['Como vocês controlam os acompanhamentos atualmente?'],
        is_required: true,
      }],
    },
    products: [{
      product_id: 'product-yolen',
      name: 'Yolen',
      category: 'Software comercial',
      base_price: null,
      active: true,
      indicated_audiences: ['Equipes comerciais'],
      needs_addressed: ['Acompanhamento de leads'],
      benefits: ['Contexto comercial preservado'],
      verified_differentiators: ['Copiloto contextual'],
      limitations: ['Não substitui confirmação humana'],
      contract_conditions: [],
      payment_conditions: [],
      allowed_claims: ['Apoia a execução comercial'],
      forbidden_claims: ['Garante vendas'],
    }],
    facts: [{
      contract_version: 'commercial-fact-v1',
      definition: null,
      validity_status: 'legacy',
      category: 'commercial_policy',
      fact_key: 'price_handling',
      fact_value: 'Não inventar preços não configurados.',
      source_note: 'Política comercial publicada.',
    }],
    objection_guides: [{
      sort_order: 1,
      objection: 'Preço',
      signals: ['Pergunta sobre investimento'],
      discovery_questions: ['Qual critério financeiro precisa ser considerado?'],
      recommended_approach: 'Contextualizar valor sem inventar condições.',
      response_limits: ['Não afirmar desconto inexistente.'],
    }],
  }
}

function buildMessage({
  id,
  sequence,
  direction,
  occurredAt,
  text,
}) {
  return {
    id,
    message_key: `message-${id}`,
    version: 1,
    sequence,
    direction,
    occurred_at: occurredAt,
    observed_at: occurredAt,
    content_type: 'text',
    text_content: text,
    audio_transcription: null,
  }
}

function buildScenarioInput(messages) {
  const diagnosticInput = {
    input_version: COMPANION_DIAGNOSTIC_INPUT_VERSION,
    diagnostic_contract_version: COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
    company_id: 'company-1',
    cycle_id: 'cycle-1',
    conversation_key: 'conversation-1',
    current_crm_status: 'negociacao',
    reference_time: '2026-08-05T15:30:00-03:00',
    analysis_precondition: { status: 'ready', limitations: [] },
    conversation: {
      active_message_ids: messages.map((message) => message.id),
      excluded_message_ids: [],
      messages,
      excluded_messages: [],
    },
    commercial_context: commercialContext(),
  }

  return buildStatefulCopilotInput({
    diagnostic_input: diagnosticInput,
    previous_state: null,
    known_message_ids: messages.map((message) => message.id),
  })
}

function buildPlanPayload(messages) {
  const plan = buildStatefulCopilotExecutionPlan(
    buildScenarioInput(messages),
  )

  return {
    plan,
    payload: JSON.parse(plan.request.user_prompt),
  }
}

// Os textos de fail-closed já existentes no prompt não podem ser
// enfraquecidos ou removidos quando o ajuste de continuidade for
// implementado. Qualquer edição futura em stateful-copilot-execution-plan.ts
// que apague uma dessas frases quebra este teste.
function assertFailClosedGuardrailsIntact(plan) {
  assert.match(
    plan.request.system_prompt,
    /Nunca use commercial_role=buyer, a existência do contato no CRM ou uma memória comercial anterior como prova automática de commercial_relevance=commercial\./,
  )

  assert.match(
    plan.request.system_prompt,
    /Quando commercial_relevance=non_commercial, state_patch precisa manter todas as listas vazias/,
  )

  assert.match(
    plan.request.system_prompt,
    /Quando commercial_relevance=uncertain, aplique fail-closed: state_patch inteiro vazio/,
  )

  assert.match(
    plan.request.system_prompt,
    /nunca pode ser tratado como evidência ocorrida agora nem aparecer em analyzed_message_ids ou evidence_message_ids/,
  )
}

// ---------------------------------------------------------------------
// Caso positivo: mesmo assunto comercial atravessando o gap > 4h, com a
// mensagem atual respondendo diretamente ao que estava em andamento.
// ---------------------------------------------------------------------

function continuidadeExplicitaMessages() {
  return [
    buildMessage({
      id: 'm1',
      sequence: 1,
      direction: 'incoming',
      occurredAt: '2026-08-05T09:00:00-03:00',
      text: 'Nosso maior problema hoje é que muitos leads ficam sem retorno — a gente perde o acompanhamento no meio do processo.',
    }),
    buildMessage({
      id: 'm2',
      sequence: 2,
      direction: 'outgoing',
      occurredAt: '2026-08-05T09:05:00-03:00',
      text: 'Entendi. Hoje vocês conseguem medir quantos leads ficam parados sem retorno por quanto tempo?',
    }),
    buildMessage({
      id: 'm3',
      sequence: 3,
      direction: 'outgoing',
      occurredAt: '2026-08-05T09:10:00-03:00',
      text: 'É exatamente isso que a Yolen resolve: ela acompanha cada lead automaticamente e avisa o vendedor antes de perder o timing, sem depender de planilha.',
    }),
    // gap real de 6h (> CURRENT_SESSION_GAP_MS = 4h)
    buildMessage({
      id: 'm4',
      sequence: 4,
      direction: 'incoming',
      occurredAt: '2026-08-05T15:10:00-03:00',
      text: 'Faz sentido, deixa eu ver aqui com o time.',
    }),
  ]
}

test(
  'continuidade comercial explícita: a mensagem pós-gap ainda entra sozinha como sessão atual, e o conteúdo comercial anterior só sobra na ponte',
  () => {
    const { plan, payload } =
      buildPlanPayload(continuidadeExplicitaMessages())

    assert.equal(plan.mode, 'model')

    assert.deepEqual(
      payload.required_analyzed_message_ids,
      ['m4'],
    )

    assert.deepEqual(
      payload.input.diagnostic_input.conversation.messages.map(
        (message) => message.id,
      ),
      ['m4'],
    )

    const bridgeTexts =
      payload.input.diagnostic_input.conversation.context_bridge_messages
        .map((message) => message.text_content)
        .join(' | ')

    assert.equal(
      payload.input.diagnostic_input.conversation.context_bridge_messages.length,
      3,
    )

    assert.match(bridgeTexts, /leads ficam sem retorno/)
    assert.match(bridgeTexts, /medir quantos leads/)
    assert.match(bridgeTexts, /Yolen resolve/)

    assertFailClosedGuardrailsIntact(plan)
  },
)

test(
  'AJUSTE APROVADO AINDA NÃO IMPLEMENTADO: o prompt deve autorizar commercial_relevance=commercial quando a mensagem atual responde diretamente a uma pergunta/oferta comercial presente na ponte',
  { todo: 'aguardando aprovação da redação exata da exceção de continuidade em stateful-copilot-execution-plan.ts' },
  () => {
    const { plan } =
      buildPlanPayload(continuidadeExplicitaMessages())

    // Esta é a especificação do ajuste: uma frase que autorize
    // explicitamente tratar a sessão atual como continuidade do mesmo
    // assunto comercial quando a mensagem atual for resposta direta e
    // semanticamente conectada a uma pergunta/oferta do
    // context_bridge_messages — sem tratar histórico genérico ou papel de
    // buyer como prova automática (isso continua proibido).
    assert.match(
      plan.request.system_prompt,
      /resposta direta[\s\S]{0,80}context_bridge_messages|context_bridge_messages[\s\S]{0,80}resposta direta/i,
    )

    assertFailClosedGuardrailsIntact(plan)
  },
)

// ---------------------------------------------------------------------
// Negativo 1: histórico comercial antigo + mensagem genérica ("bom dia")
// não pode herdar relevância.
// ---------------------------------------------------------------------

function historicoAntigoMaisGenericaMessages() {
  return [
    buildMessage({
      id: 'm1',
      sequence: 1,
      direction: 'incoming',
      occurredAt: '2026-08-05T09:00:00-03:00',
      text: 'Nosso maior problema hoje é que muitos leads ficam sem retorno.',
    }),
    buildMessage({
      id: 'm2',
      sequence: 2,
      direction: 'outgoing',
      occurredAt: '2026-08-05T09:05:00-03:00',
      text: 'A Yolen resolve isso acompanhando cada lead automaticamente.',
    }),
    // gap de 6h
    buildMessage({
      id: 'm3',
      sequence: 3,
      direction: 'incoming',
      occurredAt: '2026-08-05T15:10:00-03:00',
      text: 'Bom dia!',
    }),
  ]
}

test(
  'histórico comercial antigo + "bom dia" genérico: a mensagem atual não referencia a ponte e não pode herdar relevância comercial',
  () => {
    const { plan, payload } =
      buildPlanPayload(historicoAntigoMaisGenericaMessages())

    assert.deepEqual(
      payload.required_analyzed_message_ids,
      ['m3'],
    )

    assert.equal(
      payload.input.diagnostic_input.conversation.context_bridge_messages.length,
      2,
    )

    assertFailClosedGuardrailsIntact(plan)
  },
)

// ---------------------------------------------------------------------
// Negativo 2: histórico comercial de um assunto + retomada em assunto
// comercial diferente não pode herdar a relevância do assunto antigo.
// ---------------------------------------------------------------------

function historicoAntigoAssuntoDiferenteMessages() {
  return [
    buildMessage({
      id: 'm1',
      sequence: 1,
      direction: 'incoming',
      occurredAt: '2026-08-05T09:00:00-03:00',
      text: 'Sobre o plano anual: fechamos com desconto de 10%?',
    }),
    buildMessage({
      id: 'm2',
      sequence: 2,
      direction: 'outgoing',
      occurredAt: '2026-08-05T09:05:00-03:00',
      text: 'Consigo sim, te mando o contrato ainda hoje.',
    }),
    // gap de 6h — retomada em assunto totalmente diferente, sem ligação
    // com o plano anual discutido antes do gap.
    buildMessage({
      id: 'm3',
      sequence: 3,
      direction: 'incoming',
      occurredAt: '2026-08-05T15:10:00-03:00',
      text: 'Aliás, vocês têm alguma integração com a nossa ferramenta de agendamento?',
    }),
  ]
}

test(
  'histórico comercial diferente: retomada em assunto novo não herda a relevância do assunto antigo discutido antes do gap',
  () => {
    const { plan, payload } =
      buildPlanPayload(historicoAntigoAssuntoDiferenteMessages())

    assert.deepEqual(
      payload.required_analyzed_message_ids,
      ['m3'],
    )

    assert.equal(
      payload.input.diagnostic_input.conversation.context_bridge_messages.length,
      2,
    )

    assertFailClosedGuardrailsIntact(plan)
  },
)

// ---------------------------------------------------------------------
// Negativo 3: resposta vaga, sem ligação clara com a ponte — permanece
// fail-closed.
// ---------------------------------------------------------------------

function respostaVagaMessages() {
  return [
    buildMessage({
      id: 'm1',
      sequence: 1,
      direction: 'incoming',
      occurredAt: '2026-08-05T09:00:00-03:00',
      text: 'Nosso maior problema hoje é que muitos leads ficam sem retorno.',
    }),
    buildMessage({
      id: 'm2',
      sequence: 2,
      direction: 'outgoing',
      occurredAt: '2026-08-05T09:05:00-03:00',
      text: 'A Yolen resolve isso acompanhando cada lead automaticamente.',
    }),
    // gap de 6h — resposta vaga demais para confirmar continuidade
    buildMessage({
      id: 'm3',
      sequence: 3,
      direction: 'incoming',
      occurredAt: '2026-08-05T15:10:00-03:00',
      text: 'Ok, entendi.',
    }),
  ]
}

test(
  'resposta vaga sem conexão clara com a ponte permanece fail-closed',
  () => {
    const { plan, payload } =
      buildPlanPayload(respostaVagaMessages())

    assert.deepEqual(
      payload.required_analyzed_message_ids,
      ['m3'],
    )

    assertFailClosedGuardrailsIntact(plan)
  },
)
