// Golden seller-facing de ponta a ponta (R7): a mesma conversa atravessa
// mensagens → temporal context → Commercial Reasoning → projeções
// seller-facing → Message Strategy → composeSellerMessage (com um redator
// que INSISTE em errar) → HTML real da extensão (AGORA, ANÁLISE, CLIENTE).
//
// Não basta cada camada estar certa isoladamente: o vendedor vê a soma. Os
// asserts aqui são funcionais — decisão, ação e justificativa aparecem uma
// vez no primeiro nível, o que se repete desce para detalhes, a mensagem
// converge mesmo com o redator errando, e CLIENTE não trata lacuna antiga
// como prioridade atual quando o reasoning exige requalificação.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  caseById,
  runCase,
} from './sales-expert-golden-support.mjs'

import {
  composeSellerMessage,
} from './lead-seller-message.ts'

import {
  evaluateCommercialMessageDraft,
} from './commercial-message-strategy.ts'

import {
  buildSellerFacingReasoningProjection,
} from '../server/seller-facing-reasoning-projection.ts'

import {
  CURRENT_INTEREST_GAP_SUMMARY,
  buildCustomerViewModel,
} from '../server/customer-view-model.ts'

const require = createRequire(import.meta.url)

const baseView = require(
  '../../extension/yolen-companion/src/companion-seller-information-view.js',
)

const view = require(
  '../../extension/yolen-companion/src/companion-reasoning-view.js',
).enhanceSellerInformationView(baseView)

const clientContextView = require(
  '../../extension/yolen-companion/src/companion-client-context-view.js',
)

const METHOD = {
  name: 'Método comercial',
  description: null,
  stages: [],
  business_context: null,
  seller_rules: [],
}

// ---------------------------------------------------------------------------
// Casos multissetoriais: pedido real do cliente, uma resposta do vendedor e
// silêncio do cliente. Horários realistas; nada de mensagens no mesmo minuto.
// ---------------------------------------------------------------------------
const SECTOR_CASES = [
  {
    id: 'saas-demo',
    industry: 'saas',
    scenario: 'Cliente pediu demonstração e ficou 5 dias sem responder.',
    recipient_name: 'Rafael Souza',
    evaluated_at: '2026-09-29T15:00:00Z',
    turns: [
      ['in', '2026-09-24T13:00:00Z', 'Olá, vi o sistema de vocês no Instagram.'],
      ['in', '2026-09-24T13:00:30Z', 'Consigo agendar uma demonstração do sistema de gestão para a minha equipe?'],
      ['out', '2026-09-24T13:20:00Z', 'Oi, Rafael! Claro. Qual dia e horário fica melhor para você?'],
    ],
    reading: {
      best_approach: 'set_commitment',
      missing_discovery: [
        { topic: 'timeline', summary: 'Dia e horário da demonstração', evidence: ['m2'] },
      ],
    },
    subject: /demonstração do sistema de gestão/,
    historical_gap: 'Dia e horário da demonstração',
    requalify: true,
  },
  {
    id: 'imobiliaria-visita',
    industry: 'real_estate',
    scenario: 'Cliente pediu visita e ficou 8 dias sem responder.',
    recipient_name: 'Carla Mendes',
    evaluated_at: '2026-09-29T12:30:00Z',
    turns: [
      ['in', '2026-09-21T12:00:00Z', 'Boa tarde! Gostaria de visitar o apartamento de dois quartos no Centro.'],
      ['out', '2026-09-21T12:30:00Z', 'Boa tarde, Carla! Qual dia você consegue vir para a visita?'],
    ],
    reading: {
      best_approach: 'set_commitment',
      missing_discovery: [
        { topic: 'timeline', summary: 'Data e horário da visita ao apartamento', evidence: ['m1'] },
      ],
    },
    subject: /visitar o apartamento de dois quartos/,
    historical_gap: 'Data e horário da visita ao apartamento',
    requalify: true,
  },
  {
    // 3 dias: a política temporal canônica ainda lê a intenção de agenda como
    // "envelhecendo" (não obsoleta) — a retomada é leve, com permissão, e o
    // reasoning não exige requalificação. CLIENTE espelha o reasoning; não
    // decide sozinho que a lacuna virou histórica.
    id: 'clinica-avaliacao',
    industry: 'healthcare_clinic',
    scenario: 'Cliente queria avaliação e ficou 3 dias sem responder.',
    recipient_name: 'Paula Lima',
    evaluated_at: '2026-09-29T13:15:00Z',
    turns: [
      ['in', '2026-09-26T13:00:00Z', 'Oi, queria marcar uma avaliação para clareamento dental.'],
      ['out', '2026-09-26T13:15:00Z', 'Oi, Paula! Temos horário na terça às 10h ou na quinta às 15h. Qual prefere?'],
    ],
    reading: {
      best_approach: 'set_commitment',
      missing_discovery: [
        { topic: 'timeline', summary: 'Dia e horário da avaliação', evidence: ['m1'] },
      ],
    },
    subject: /avaliação para clareamento dental/,
    historical_gap: 'Dia e horário da avaliação',
    requalify: false,
  },
  {
    id: 'b2b-proposta',
    industry: 'b2b_services',
    scenario: 'Cliente pediu proposta, vendedor mandou preço antes de fechar escopo, 10 dias sem resposta.',
    recipient_name: 'Marcos Ribeiro',
    evaluated_at: '2026-09-29T14:30:00Z',
    turns: [
      ['in', '2026-09-19T14:00:00Z', 'Bom dia. Vocês podem me mandar uma proposta para a manutenção predial do nosso condomínio?'],
      ['out', '2026-09-19T14:30:00Z', 'Bom dia, Marcos! O valor mensal do contrato de manutenção fica em R$ 4.500.'],
    ],
    reading: {
      best_approach: 'respond',
      missing_discovery: [
        { topic: 'need', summary: 'Escopo da manutenção: equipamentos, frequência e tamanho do condomínio', evidence: ['m1'] },
      ],
    },
    subject: /proposta para a manutenção predial do seu condomínio/,
    historical_gap: 'Escopo da manutenção: equipamentos, frequência e tamanho do condomínio',
    requalify: true,
  },
]

// ---------------------------------------------------------------------------
// Cadeia
// ---------------------------------------------------------------------------
function interactionOf(turns) {
  return turns.map(([direction, at, text]) => ({
    direction: direction === 'in' ? 'incoming' : 'outgoing',
    occurred_at: at,
    text,
  }))
}

// Redator que insiste em errar do jeito que a Lorena real mostrou: repete o
// passo operacional antigo, presume o interesse atual, empurra oferta.
function adversarialProvider(firstName) {
  const drafts = [
    `Oi, ${firstName}! Qual dia e horário fica melhor para você?`,
    `Oi, ${firstName}! Vi que você ainda quer seguir com isso, qual horário fica melhor?`,
    `Oi, ${firstName}! Temos uma condição especial só hoje, quer aproveitar?`,
  ]
  const calls = []
  let generation = 0

  const provider = async request => {
    calls.push(request)

    if (request.prompt_version.includes('review')) {
      const candidate = JSON.parse(request.user_prompt).candidate_message

      return {
        content: JSON.stringify({ message: candidate, changed: false, issue_code: 'none' }),
        provider: 'test',
      }
    }

    const draft = drafts[Math.min(generation, drafts.length - 1)]
    generation += 1

    return { content: JSON.stringify({ message: draft }), provider: 'test' }
  }

  return { provider, calls }
}

// Mesmo mapeamento de agora-decision-state-loader.ts: com o reasoning
// disponível, situação e próxima ação vêm dele.
function agoraViewModelFor(projection) {
  return {
    silent: false,
    silent_reason: null,
    primary: {
      status: projection.decision === 'respond' ? 'respond' : 'follow_up',
      priority: 'high',
      headline: projection.what_is_happening,
      action: projection.next_best_action,
      provenance: {
        decision_kind: projection.decision,
        source: 'commercial_reasoning',
        evidence_message_ids: [],
        memory_ids: [],
      },
    },
    secondary: [],
    reference_time: null,
    reasoning: projection,
  }
}

// Mesmo mapeamento de customer-view-model-loader.ts.
function customerViewModelFor(chain, projection, evaluatedAt) {
  const intentEvidence = chain.reasoning.temporal_context?.intent?.evidence_message_id ?? null

  return buildCustomerViewModel(
    {
      reading: chain.reading,
      state_record_id: 'state-1',
      state_version: 1,
      state_updated_at: evaluatedAt,
    },
    {
      requalify_before_continuing: projection.momentum?.requalify_before_continuing === true,
      current_interest_evidence_message_ids: intentEvidence ? [intentEvidence] : [],
    },
  )
}

async function runSellerFacingChain(item) {
  const chain = runCase(item)
  const projection = buildSellerFacingReasoningProjection({
    reasoning: chain.reasoning,
    reading: null,
    state: null,
  })
  const interaction = interactionOf(item.turns)
  const { provider, calls } = adversarialProvider(item.recipient_name.split(' ')[0])

  const message = await composeSellerMessage({
    workingSummary: item.scenario,
    currentInteraction: interaction,
    sellerIntent: 'Quero responder ao ponto principal desta conversa.',
    recipientName: item.recipient_name,
    method: METHOD,
    reasoning: chain.reasoning,
    messageStrategy: chain.strategy,
    provider,
  })

  const customer = customerViewModelFor(chain, projection, item.evaluated_at)

  return {
    ...chain,
    projection,
    interaction,
    message,
    calls,
    customer,
    agoraHtml: view.renderAgoraViewModelSnapshot(agoraViewModelFor(projection)),
    analysisHtml: view.renderAnalysisViewModel({
      ...chain.analysis,
      coaching_diagnosis: chain.coaching,
    }),
    customerHtml: view.renderCustomerViewModel(customer),
  }
}

// ---------------------------------------------------------------------------
// Leitura do HTML como o vendedor lê: primeiro nível x detalhes
// ---------------------------------------------------------------------------
function textOf(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstLevelText(html) {
  return textOf(html.replace(/<details[\s\S]*?<\/details>/g, ' '))
}

function detailsText(html) {
  return textOf((html.match(/<details[\s\S]*?<\/details>/g) ?? []).join(' '))
}

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1
}

// Frases de conteúdo do primeiro nível, bloco a bloco (rótulos como
// "Próxima ação" ou "Por que essa ação" nunca grudam na frase seguinte).
function firstLevelSentences(html) {
  return html
    .replace(/<details[\s\S]*?<\/details>/g, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sentence =>
      sentence
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(sentence => sentence.length >= 30)
}

// Nenhuma frase de conteúdo aparece duas vezes aberta na mesma aba.
function assertNoRepeatedSentence(html, label) {
  const seen = new Map()

  for (const sentence of firstLevelSentences(html)) {
    seen.set(sentence, (seen.get(sentence) ?? 0) + 1)
  }

  const repeated = [...seen.entries()].filter(([, count]) => count > 1)

  assert.deepEqual(repeated, [], `${label}: frase repetida no primeiro nível`)
}

function whyCopy(agoraHtml) {
  const match = agoraHtml.match(
    /Por que essa ação<\/div>\s*<div class="yolen-seller-detail-copy">([^<]*)<\/div>/,
  )

  return match ? textOf(match[1]) : null
}

function headlineCopy(agoraHtml) {
  const match = agoraHtml.match(/<div class="yolen-now-attention-decision">([^<]*)<\/div>/)

  return match ? textOf(match[1]) : null
}

// ---------------------------------------------------------------------------
// Invariantes seller-facing comuns a toda conversa em que o tempo mudou a
// decisão.
// ---------------------------------------------------------------------------
function assertAgoraCompressed(result, label) {
  const html = result.agoraHtml
  const open = firstLevelText(html)
  const action = result.projection.next_best_action

  // 1 decisão: um único card principal.
  assert.equal(occurrences(html, 'data-yolen-now-attention-variant="primary"'), 1, `${label}: um card principal`)

  // 1 ação: a próxima ação aparece uma única vez aberta.
  assert.equal(occurrences(open, action), 1, `${label}: próxima ação uma vez`)

  // 1 justificativa curta, no máximo, e que acrescenta informação.
  assert.ok(occurrences(html, 'Por que essa ação') <= 1, `${label}: no máximo um "por quê"`)

  const why = whyCopy(html)
  const headline = headlineCopy(html)

  if (why) {
    assert.equal(
      baseView.repeatsContent(why, [headline, action]),
      false,
      `${label}: o "por quê" não repete a situação nem a ação (${why})`,
    )
  }

  // O why_now bruto do motor (que embute a situação inteira) nunca aparece
  // aberto.
  assert.equal(open.includes(result.projection.why_now), false, `${label}: why_now bruto não aparece aberto`)

  // Fatos temporais nunca aparecem inteiros em dois blocos abertos.
  for (const fact of result.projection.momentum?.facts ?? []) {
    assert.ok(occurrences(open, fact) <= 1, `${label}: fato repetido aberto: ${fact}`)
  }

  assertNoRepeatedSentence(html, `${label} AGORA`)

  // Técnica e cuidados só em progressive disclosure.
  const technique = result.projection.technique?.title

  if (technique) {
    assert.equal(open.includes(technique), false, `${label}: técnica fora do primeiro nível`)
    assert.ok(detailsText(html).includes(technique), `${label}: técnica disponível nos detalhes`)
  }
}

function assertMessageConverges(result, item, label) {
  const { message, strategy, interaction, calls } = result

  assert.equal(message.status, 'ready', `${label}: ${message.error ?? ''}`)
  assert.equal(message.error, null)

  // Critic intacto: as falhas do redator ficam registradas e a copy entregue
  // passa pelo MESMO critic sem nenhuma violação.
  assert.ok(message.diagnostics.failures.length >= 3, `${label}: falhas do redator registradas`)
  assert.deepEqual(
    evaluateCommercialMessageDraft({
      message: message.message,
      strategy,
      recent_outgoing_messages: interaction
        .filter(entry => entry.direction === 'outgoing')
        .map(entry => entry.text),
    }).violations,
    [],
    `${label}: copy entregue sem violação`,
  )

  const text = message.message

  assert.match(text, new RegExp(`^Oi, ${item.recipient_name.split(' ')[0]}!`), `${label}: primeiro nome`)
  assert.match(text, item.subject, `${label}: ancorada no pedido real`)
  assert.equal((text.match(/\?/g) ?? []).length, 1, `${label}: uma pergunta / um microcompromisso`)
  assert.doesNotMatch(text, /ainda quer|você quer|vc quer/i, `${label}: não presume interesse atual`)
  assert.doesNotMatch(text, /\b(dia|horário|horario|hoje|amanhã|terça|quinta|sábado)\b/i, `${label}: não volta para agenda`)
  assert.doesNotMatch(text, /R\$|preço|preco|valor|promo|condição especial|matrícula|plano/i, `${label}: sem oferta/preço`)
  assert.doesNotMatch(text, /só hoje|últimas vagas|não perca|corre/i, `${label}: sem urgência inventada`)

  for (const previous of interaction.filter(entry => entry.direction === 'outgoing')) {
    assert.equal(text.includes(previous.text), false, `${label}: não repete mensagem anterior`)
  }

  // Sem loop: 3 gerações + 1 revisão customer-facing.
  assert.equal(calls.filter(call => !call.prompt_version.includes('review')).length, 3)
  assert.equal(calls.filter(call => call.prompt_version.includes('review')).length, 1)
}

function assertCustomerGapPriority(result, item, label) {
  const gaps = result.customer.knowledge_gaps
  const html = result.customerHtml
  const open = firstLevelText(html)

  if (item.requalify) {
    // Estado atual primeiro; a lacuna da etapa antiga continua registrada,
    // com evidência, mas condicional.
    assert.equal(gaps[0].kind, 'current_interest', `${label}: estado atual é a lacuna principal`)
    assert.equal(gaps[0].summary, CURRENT_INTEREST_GAP_SUMMARY)

    const historical = gaps.find(gap => gap.summary === item.historical_gap)

    assert.ok(historical, `${label}: lacuna antiga preservada`)
    assert.equal(historical.conditional_on_reconfirmation, true, `${label}: lacuna antiga condicional`)
    assert.ok(historical.evidence_message_ids.length > 0, `${label}: evidência da lacuna preservada`)

    assert.ok(
      open.indexOf(CURRENT_INTEREST_GAP_SUMMARY) < open.indexOf(item.historical_gap),
      `${label}: interesse atual aparece antes da lacuna antiga`,
    )
    assert.match(open, /Se o interesse continuar/, `${label}: lacuna antiga marcada como condicional`)
  } else {
    // O reasoning canônico não exige requalificação: CLIENTE não inventa
    // uma prioridade que o cérebro não decidiu.
    assert.equal(gaps.some(gap => gap.kind === 'current_interest'), false, `${label}: sem requalificação inventada`)
    assert.equal(gaps[0].summary, item.historical_gap)
  }
}

// ---------------------------------------------------------------------------
// Lorena — ponta a ponta
// ---------------------------------------------------------------------------
test('Lorena ponta a ponta: AGORA, MENSAGEM, ANÁLISE e CLIENTE coerentes com o mesmo raciocínio', async () => {
  const item = caseById('A')
  const result = await runSellerFacingChain({
    ...item,
    reading: {
      ...item.reading,
      missing_discovery: [
        { topic: 'timeline', summary: 'Dia e horário da aula experimental', evidence: ['m3'] },
      ],
    },
  })

  // ---- AGORA --------------------------------------------------------------
  const agoraOpen = firstLevelText(result.agoraHtml)

  // Reconhece intenção antiga e recomenda reativação, sem pedir horário e
  // sem repetir oferta.
  assert.match(agoraOpen, /interesse atual não está confirmado/)
  assert.match(agoraOpen, /Próxima ação Reativar a conversa/)
  assert.doesNotMatch(result.reasoning.objective_now, /dia e hor[aá]rio/i)
  assert.doesNotMatch(agoraOpen, /dia e horário|R\$|promo/i)

  // Situação → ação → um "por quê" factual (sem resposta há 19 dias, 2
  // tentativas), e o resto em "Ver técnica e cuidados".
  assert.match(
    whyCopy(result.agoraHtml),
    /A última resposta do cliente foi há 19 dias, com 2 tentativas do vendedor sem resposta/,
  )
  assert.doesNotMatch(headlineCopy(result.agoraHtml), /há 19 dias/, 'o fato vira o "por quê" e sai da situação')
  assert.match(result.agoraHtml, /<summary>Ver técnica e cuidados<\/summary>/)
  assert.match(detailsText(result.agoraHtml), /Oportunidade sem continuidade/)
  assert.match(detailsText(result.agoraHtml), /Reativação por mudança de estado/)
  assertAgoraCompressed(result, 'Lorena')

  // ---- MENSAGEM -----------------------------------------------------------
  assertMessageConverges(result, { ...item, subject: /fazer a aula experimental/ }, 'Lorena')
  assert.match(result.message.message, /chegou a resolver|faz sentido retomarmos/, 'executa a reativação por mudança de estado')

  // ---- ANÁLISE ------------------------------------------------------------
  const analysisOpen = firstLevelText(result.analysisHtml)
  const analysisDetails = detailsText(result.analysisHtml)
  const mistake = result.coaching.seller_mistake.summary
  const timing = result.coaching.additional_findings.find(finding => finding.kind === 'response_timing')

  // Diagnóstico coerente e temporal, sem repetir o que o ajuste e o
  // aprendizado de tempo de resposta já explicam logo abaixo.
  assert.match(analysisOpen, /Diagnóstico da condução Hoje: oportunidade sem continuidade — o interesse atual precisa ser reconfirmado/)
  assert.match(analysisOpen, /Momento da oportunidade/)
  assert.match(analysisOpen, /Última mensagem do cliente há 19 dias/)
  assert.equal(occurrences(analysisOpen, mistake), 1, 'principal ajuste aparece aberto uma vez')
  assert.equal(occurrences(analysisOpen, timing.summary), 1, 'tempo de resposta aparece aberto uma vez')
  assertNoRepeatedSentence(result.analysisHtml, 'Lorena ANÁLISE')

  // Momento subordinado: o rótulo que o diagnóstico já disse não reaparece
  // aberto; continua em "Ver raciocínio".
  assert.equal(analysisOpen.includes('Oportunidade sem continuidade — interesse atual precisa ser reconfirmado.'), false)
  assert.match(analysisDetails, /Momento da oportunidade Oportunidade sem continuidade/)

  // Profundidade preservada sob detalhes: diagnóstico completo e explicação
  // da técnica (que só repetia a ação).
  assert.ok(analysisDetails.includes(`Diagnóstico completo ${result.coaching.synthesis.diagnosis}`))
  assert.match(analysisDetails, /Em termos simples Relembre de forma concreta/)
  assert.equal(analysisOpen.includes('Em termos simples'), false)

  // Não elogia a mesma ação que critica: o acerto que o aprendizado
  // "Qualidade da pergunta" ressalva vira acerto parcial.
  assert.doesNotMatch(result.analysisHtml, /Principal acerto/)
  assert.match(analysisOpen, /Acerto parcial O vendedor identificou que a conversa precisava avançar para um compromisso de agenda\. Ressalva Qualidade da pergunta/)
  assert.doesNotMatch(result.analysisHtml, /oferta promocional detalhada/i)

  // Tempo de resposta: respondeu ("Olá") em 3 horas, mas só tratou o pedido
  // 9 dias depois — nunca "demorou X dias para responder".
  assert.match(analysisOpen, /a primeira resposta veio 3 horas depois e não tratou o pedido; o pedido só foi efetivamente tratado 9 dias depois/)
  assert.doesNotMatch(`${analysisOpen} ${analysisDetails} ${agoraOpen}`, /demorou/i)

  // Evidência continua auditável.
  assert.match(result.analysisHtml, /Evidência: \d+ mensage/)

  // ---- CLIENTE ------------------------------------------------------------
  assertCustomerGapPriority(
    result,
    { requalify: true, historical_gap: 'Dia e horário da aula experimental' },
    'Lorena',
  )

  // "Pendência de resposta" é fato do relacionamento (quem deve a próxima
  // mensagem), nunca o estado comercial da oportunidade.
  const relationship = clientContextView.renderRelationshipCard({
    contract_version: 'companion-client-context-v1',
    generated_at: item.evaluated_at,
    identity: {
      company_id: 'company-golden',
      cycle_id: 'cycle-golden',
      conversation_key: 'conversation-golden',
      current_status: 'negociacao',
    },
    relationship: {
      first_known_interaction_at: item.turns[0][1],
      relationship_age_ms: Date.parse(item.evaluated_at) - Date.parse(item.turns[0][1]),
      latest_customer_message_at: '2026-09-10T15:20:00Z',
      latest_seller_message_at: '2026-09-25T13:01:00Z',
      last_interaction_at: '2026-09-25T13:01:00Z',
      known_interaction_count: item.turns.length,
    },
    waiting: {
      state: 'seller_waiting_for_customer',
      waiting_since: '2026-09-25T13:01:00Z',
      waiting_duration_ms: Date.parse(item.evaluated_at) - Date.parse('2026-09-25T13:01:00Z'),
    },
    timeline: [],
    sla: {
      configured: false,
      applicable: true,
      stage: 'negociacao',
      stage_label: 'NEGOCIAÇÃO',
      target_minutes: null,
      warning_minutes: null,
      danger_minutes: null,
      elapsed_minutes: null,
      risk: null,
    },
  })

  assert.match(
    relationship,
    /<span class="yolen-client-relationship-label">Pendência de resposta<\/span><span class="yolen-client-relationship-value">Aguardando resposta do cliente/,
  )
  assert.doesNotMatch(relationship, />Situação</)
  assert.doesNotMatch(relationship, /Oportunidade sem continuidade|Reativação/)
})

// ---------------------------------------------------------------------------
// Multissetorial
// ---------------------------------------------------------------------------
for (const item of SECTOR_CASES) {
  test(`multissetorial ${item.id} (${item.industry}): ${item.scenario}`, async () => {
    const result = await runSellerFacingChain(item)

    // Contexto histórico preservado: o pedido real continua como referência
    // da estratégia e como evidência da intenção.
    assert.equal(result.strategy.required_action_type, 'reengagement', item.id)
    assert.match(result.strategy.context_reference.text, /demonstração|visitar|avaliação|proposta/)
    assert.equal(result.reasoning.decision, 'follow_up', item.id)

    // Estado atual tem prioridade sobre o passo antigo.
    assert.equal(result.temporal.reactivation.requalify_before_continuing, item.requalify, item.id)
    assert.ok(
      result.strategy.blocked_action_types.includes('scheduling_guided_choice'),
      `${item.id}: não repete a escolha de agenda`,
    )

    if (item.requalify) {
      assert.equal(result.coaching.client_intent_now.is_current, false, `${item.id}: intenção tratada como histórico`)
      assert.match(firstLevelText(result.agoraHtml), /interesse atual não está confirmado/, item.id)
      assert.doesNotMatch(result.reasoning.objective_now, /dia e hor[aá]rio|data da visita/i, item.id)
      assert.ok(
        result.strategy.blocked_action_types.includes('scheduling_open_question') &&
        result.strategy.blocked_action_types.includes('price_presentation'),
        `${item.id}: sem voltar para agenda nem preço antes de reconfirmar`,
      )
    } else {
      // Retomada leve e com permissão: checa se o assunto continua de pé.
      assert.match(result.projection.next_best_action, /ainda faz sentido/, item.id)
    }

    // Seller-facing sem repetir a mesma conclusão.
    assertAgoraCompressed(result, item.id)
    assertNoRepeatedSentence(result.analysisHtml, `${item.id} ANÁLISE`)

    // Mensagem requalifica sem presumir, mesmo com o redator errando.
    assertMessageConverges(result, item, item.id)

    // Lacuna antiga fica condicional quando o reasoning exige requalificação.
    assertCustomerGapPriority(result, item, item.id)
  })
}

test('B2B: preço antes do escopo nunca é reenviado e o pedido de proposta segue como referência', async () => {
  const item = SECTOR_CASES.find(entry => entry.id === 'b2b-proposta')
  const result = await runSellerFacingChain(item)

  assert.match(result.coaching.seller_mistake.summary, /pedido comercial claro e a resposta do vendedor não tratou esse pedido/)
  assert.ok(result.strategy.blocked_action_types.includes('price_presentation'))
  assert.doesNotMatch(result.message.message, /4\.500|R\$/)
  assert.match(result.message.message, /seu condomínio/, 'a voz do cliente vira a do vendedor')
})
