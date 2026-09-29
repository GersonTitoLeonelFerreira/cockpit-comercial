import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReasoning,
} from './commercial-reasoning-contract'

import type {
  CommercialCoachingDiagnosis,
} from './commercial-coaching-engine'

import {
  classifySellerActionText,
  type SellerExecutionActionType,
} from './seller-execution-trace'

import {
  formatCommercialDuration,
  type CommercialMomentumState,
  type CommercialReactivationMode,
  type CommercialTemporalContext,
} from './commercial-temporal-context'

export const COMMERCIAL_MESSAGE_STRATEGY_VERSION =
  'commercial-message-strategy-v1' as const

export type CommercialMessageContextReference = {
  text: string
  evidence_message_id: string
  required_in_draft: boolean
  anchors: string[]
}

// Enquadramento temporal da mensagem: o redator precisa saber que tempo
// passou, se a intenção antiga ainda pode ser tratada como atual e quais
// táticas de retomada são legítimas neste contexto — sem inventar fatos.
export type CommercialMessageTemporalFrame = {
  evaluated_at: string
  momentum:
    CommercialMomentumState
  reactivation_mode:
    CommercialReactivationMode
  requalify_before_continuing: boolean
  elapsed_since_last_customer_message: string | null
  elapsed_since_customer_intent: string | null
  customer_waiting_for_seller_for: string | null
  intent_time_window_expired: boolean
  unanswered_seller_attempts: number
  enthusiasm_evidenced: boolean
  // Intensidade progressiva da lacuna (não só o balde seller-facing).
  momentum_stage?:
    CommercialTemporalContext[
      'progression'
    ]['stage'] | null
  gap_severity?: number | null
  silence_to_rhythm_ratio?: number | null
  guidance: string[]
}

export type CommercialMessageStrategy = {
  contract_version:
    typeof COMMERCIAL_MESSAGE_STRATEGY_VERSION

  objective: string | null
  relationship_bridge: string | null
  context_reference:
    CommercialMessageContextReference | null

  technique_id: string | null
  technique_title: string | null

  desired_microcommitment: string | null

  facts_allowed: string[]
  facts_required_but_missing: string[]

  prohibited_moves: string[]
  blocked_action_types?:
    SellerExecutionActionType[]
  required_action_type?:
    SellerExecutionActionType | null

  tone: string | null
  max_length: number

  temporal_frame?:
    CommercialMessageTemporalFrame | null
  reactivation_tactics?: string[]

  // false = o cliente pediu para não receber mais contato (opt-out):
  // nenhuma mensagem pode ser gerada, nem de encerramento.
  outbound_allowed?: boolean

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type CommercialMessageCriticViolation =
  | 'message_too_long'
  | 'generic_message'
  | 'repeats_recent_seller_action'
  | 'excessive_questions'
  | 'pressure_risk'
  | 'technique_mismatch'
  | 'generic_filler'
  | 'weak_microcommitment'
  | 'assumes_current_intent'
  | 'fabricated_enthusiasm'

export type CommercialMessageCriticResult = {
  passed: boolean
  violations:
    CommercialMessageCriticViolation[]
}

const MAX_MESSAGE_LENGTH = 700
const REENGAGEMENT_MAX_LENGTH = 420

const STOPWORDS =
  new Set([
    'agora',
    'ainda',
    'cliente',
    'comercial',
    'como',
    'conversa',
    'depois',
    'essa',
    'esse',
    'esta',
    'este',
    'fazer',
    'isso',
    'para',
    'pessoa',
    'precisa',
    'sobre',
    'vendedor',
    'voce',
    'você',
    'quer',
    'quero',
    // Palavras de pedido/tempo não ancoram o assunto: "podemos ... hoje"
    // não é o contexto concreto; "aula experimental" é.
    'podemos',
    'poderia',
    'gostaria',
    'queria',
    'posso',
    'pode',
    'hoje',
    'amanha',
    'tudo',
    'obrigado',
    'obrigada',
    'favor',
    'fazer',
    'saber',
  ])

const REENGAGEMENT_TECHNIQUES =
  new Set([
    'technique.contextual_reengagement',
    'technique.state_change_reactivation',
    'technique.permission_based_reengagement',
    'technique.pattern_interrupt_reengagement',
  ])

const OPERATIONAL_ACTIONS:
  readonly SellerExecutionActionType[] = [
    'scheduling_open_question',
    'scheduling_guided_choice',
    'close_request',
    'price_presentation',
    'product_presentation',
    'commitment_request',
  ]

function unique(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(Boolean),
    ),
  )
}

function comparable(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function anchorsFrom(
  value: string,
): string[] {
  return unique(
    comparable(value)
      .split(' ')
      .filter(
        token =>
          token.length >= 4 &&
          !STOPWORDS.has(token) &&
          !/^\d+$/.test(token),
      ),
  ).slice(0, 8)
}

function sellerIntentIsContextLight(
  value: string | null | undefined,
): boolean {
  if (!value) {
    return false
  }

  return /\b(agradec|obrigad|desped|encerr|disposicao|cumpriment|paraben|pedir desculp|desculp)\w*/.test(
    comparable(value),
  )
}

function activeMessageText(
  message:
    CompanionDiagnosticInput[
      'conversation'
    ]['messages'][number],
): string | null {
  const value =
    message.text_content ??
    message.audio_transcription

  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const clean =
    value
      .replace(/\s+/g, ' ')
      .trim()

  return clean || null
}

function customerReferenceById(
  input:
    CompanionDiagnosticInput,
  messageId: string | null | undefined,
): {
  text: string
  message_id: string
} | null {
  if (!messageId) {
    return null
  }

  const message =
    input.conversation.messages.find(
      item =>
        item.id === messageId &&
        item.direction ===
          'incoming',
    )

  const text =
    message
      ? activeMessageText(message)
      : null

  return message && text
    ? {
        text,
        message_id:
          message.id,
      }
    : null
}

function latestCustomerReference(
  input:
    CompanionDiagnosticInput,
): {
  text: string
  message_id: string
} | null {
  const customerMessages =
    input.conversation.messages
      .filter(
        message =>
          message.direction ===
            'incoming' &&
          message.author_kind ===
            'customer',
      )
      .map(message => ({
        message,
        text:
          activeMessageText(
            message,
          ),
      }))
      .filter(
        (
          item,
        ): item is {
          message:
            CompanionDiagnosticInput[
              'conversation'
            ]['messages'][number]
          text: string
        } =>
          Boolean(item.text),
      )

  const latest =
    customerMessages[
      customerMessages.length - 1
    ]

  return latest
    ? {
        text:
          latest.text,
        message_id:
          latest.message.id,
      }
    : null
}

function requiredActionForTechnique(
  techniqueId:
    string | null | undefined,
): SellerExecutionActionType | null {
  switch (techniqueId) {
    case 'technique.contextual_reengagement':
      return 'reengagement'

    case 'technique.guided_choice':
      return 'scheduling_guided_choice'

    case 'technique.objection_diagnosis':
      return 'objection_probe'

    case 'technique.explicit_close_execution':
      return 'close_request'

    case 'technique.state_change_reactivation':
    case 'technique.permission_based_reengagement':
    case 'technique.pattern_interrupt_reengagement':
      return 'reengagement'

    default:
      return null
  }
}

function desiredMicrocommitment({
  reasoning,
  coaching,
}: {
  reasoning: CommercialReasoning
  coaching:
    CommercialCoachingDiagnosis
}): string | null {
  const technique =
    coaching.chosen_technique
      ?.id

  switch (technique) {
    case 'technique.guided_choice':
      return 'Obter uma escolha simples entre alternativas reais já disponíveis.'

    case 'technique.objection_diagnosis':
      return 'Obter uma resposta curta que esclareça a causa real da objeção.'

    case 'technique.third_party_handoff':
      return 'Definir um próximo passo claro com o interlocutor sem confundir quem está na conversa com o prospect relacionado.'

    case 'technique.discovery_before_prescription':
      return 'Obter uma informação de descoberta que realmente altere a recomendação.'

    case 'technique.contextual_reengagement':
      return 'Obter um microcompromisso simples que confirme se o cliente ainda quer avançar no objetivo já demonstrado, sem repetir a pergunta anterior.'

    case 'technique.state_change_reactivation':
      return 'Obter uma resposta curta que revele o estado atual do interesse (continua, mudou, adiou ou resolveu), sem exigir decisão agora.'

    case 'technique.permission_based_reengagement':
      return 'Obter permissão simples para retomar o assunto — um "sim, vamos" ou "agora não" já é avanço.'

    case 'technique.pattern_interrupt_reengagement':
      return 'Obter qualquer resposta curta a uma pergunta fácil, quebrando o padrão das tentativas sem resposta.'

    case 'technique.delayed_response_recovery':
      return 'Responder ao pedido que ficou esperando e confirmar o que ainda faz sentido agora.'

    case 'technique.respectful_closure':
      return null

    case 'technique.commitment_wait':
      return null

    default:
      return reasoning.status ===
        'silent'
        ? null
        : reasoning.objective_now
  }
}

function missingFacts(
  reasoning:
    CommercialReasoning,
): string[] {
  const result: string[] = []

  for (
    const limitation of
      reasoning.limitations
  ) {
    if (
      limitation.includes(
        'grounded_multiple_valid_options_required',
      )
    ) {
      result.push(
        'multiple_valid_options',
      )
    }
  }

  return unique(result)
}

function bridgeFor({
  coaching,
}: {
  coaching:
    CommercialCoachingDiagnosis
}): string | null {
  if (
    coaching.sequence_break
      .happened &&
    coaching.client_intent_now
  ) {
    return (
      'Retomar a intenção já demonstrada pelo cliente antes de introduzir uma etapa comercial diferente.'
    )
  }

  if (
    coaching.client_intent_now
  ) {
    return (
      'Responder a partir da intenção atual do cliente sem reiniciar a conversa nem apagar o que já foi feito.'
    )
  }

  return null
}

function buildTemporalFrame({
  temporal,
  techniqueId,
  factsAllowed,
}: {
  temporal:
    CommercialTemporalContext | null
  techniqueId: string | null
  factsAllowed: string[]
}): {
  frame:
    CommercialMessageTemporalFrame | null
  tactics: string[]
} {
  if (!temporal) {
    return {
      frame: null,
      tactics: [],
    }
  }

  const duration = (
    value: number | null,
  ) =>
    value === null
      ? null
      : formatCommercialDuration(
          value,
        )

  const requalify =
    temporal.reactivation
      .requalify_before_continuing

  const enthusiasm =
    Boolean(
      temporal.intent
        ?.expressed_enthusiasm,
    )

  const guidance: string[] = []
  const tactics: string[] = []

  const agreedRecontact =
    temporal.reactivation
      .reason_codes.includes(
        'agreed_recontact_due',
      )

  if (
    agreedRecontact &&
    temporal.progression
      .agreed_pause
  ) {
    guidance.push(
      `O cliente pediu para ser chamado ${temporal.progression.agreed_pause.horizon_label}: é o contato combinado. Lembre o combinado com naturalidade e reabra o assunto dele — não trate como cobrança de silêncio.`,
    )
  } else if (
    temporal.reactivation.mode ===
      'reactivate' ||
    temporal.reactivation.mode ===
      'light_follow_up'
  ) {
    guidance.push(
      `Passou tempo desde a última resposta do cliente (${duration(temporal.facts.silence_since_last_customer_message_ms) ?? 'tempo relevante'}). Reconheça a continuidade com naturalidade, sem culpar o cliente pelo silêncio.`,
    )

    // A intensidade da lacuna muda o tom, não só a técnica.
    switch (
      temporal.progression.stage
    ) {
      case 'early_loss':
        guidance.push(
          'O silêncio acabou de passar do ritmo normal: lembrete leve e contextual. Nada de tom de reativação, "sumiu?" ou pedido de desculpas por insistir.',
        )
        break
      case 'prolonged_silence':
        guidance.push(
          'Silêncio prolongado: cheque com leveza se o assunto continua de pé, com saída fácil para o cliente.',
        )
        break
      case 'strong_gap':
        guidance.push(
          'Lacuna forte: não retome o passo antigo como se estivesse vivo; descubra o que mudou desde então.',
        )
        break
      case 'long_dormancy':
        guidance.push(
          'Oportunidade sem continuidade há muito tempo: reative pelo contexto concreto do cliente, sem presumir que o interesse continua.',
        )
        break
      default:
        break
    }
  }

  if (
    temporal.reactivation.mode ===
      'respond_now' &&
    requalify &&
    temporal.intent
  ) {
    guidance.push(
      `O cliente voltou a falar, mas não reconfirmou o interesse demonstrado há ${duration(temporal.intent.related_age_ms)}: responda ao que ele disse agora e pergunte como está esse interesse, sem tratá-lo como atual.`,
    )
  }

  if (requalify) {
    guidance.push(
      'A intenção antiga do cliente NÃO está confirmada agora: não pergunte data, horário, escolha, pagamento ou fechamento; descubra primeiro como está o interesse hoje.',
    )
  }

  if (
    temporal.intent
      ?.time_window_expired
  ) {
    guidance.push(
      'O momento que o cliente indicou (ex.: "hoje", "amanhã") já passou: nunca repita essa referência de tempo como se ainda valesse.',
    )
  }

  if (
    temporal.reactivation
      .outbound_unanswered_turns >= 2
  ) {
    guidance.push(
      'Já houve tentativas sem resposta: não reenvie oferta, lista, link ou a mesma cobrança; mude o formato.',
    )
  }

  if (
    temporal.reactivation.mode ===
      'recover_delay'
  ) {
    guidance.push(
      'O cliente ficou esperando o vendedor: reconheça a demora em no máximo uma frase curta e responda ao que ele pediu.',
    )
  }

  if (
    temporal.reactivation.mode ===
      'respect_closure'
  ) {
    guidance.push(
      temporal.reactivation
        .contact_allowed
        ? 'O cliente encerrou: agradeça e respeite a decisão; nenhuma oferta, desconto ou urgência.'
        : 'O cliente pediu para não receber mais contato: não existe mensagem a gerar.',
    )
  }

  switch (techniqueId) {
    case 'technique.state_change_reactivation':
      tactics.push(
        'Recuperação de contexto: cite de forma concreta o que o cliente pediu ou estava avaliando.',
        'Pergunta de mudança de estado: pergunte como ficou / o que mudou desde então, não peça decisão.',
        'Baixo esforço: uma única pergunta curta que aceite resposta de uma linha.',
        'Saída fácil: tom sem cobrança; está tudo bem se o cliente não quiser mais.',
      )
      break

    case 'technique.permission_based_reengagement':
      tactics.push(
        'Retomada com permissão: pergunte se ainda faz sentido retomar o assunto concreto do cliente.',
        'Saída fácil: deixe claro que tudo bem se não for o momento.',
      )
      break

    case 'technique.pattern_interrupt_reengagement':
      tactics.push(
        'Quebra de padrão: formato curto e diferente das tentativas sem resposta — sem lista, link ou oferta.',
        'Pergunta fácil ancorada no que o próprio cliente trouxe.',
      )
      break

    case 'technique.delayed_response_recovery':
      tactics.push(
        'Reconhecer a demora em uma frase, sem justificativa longa.',
        'Responder exatamente ao pedido original.',
        'Se o momento pedido já passou, confirmar o que ainda faz sentido em vez de presumir a data antiga.',
      )
      break

    case 'technique.respectful_closure':
      tactics.push(
        'Agradecer, respeitar a decisão e, no máximo, deixar a porta aberta.',
      )
      break

    case 'technique.contextual_reengagement':
      tactics.push(
        'Retomar pelo objetivo que o cliente demonstrou, com um microcompromisso diferente da pergunta que ficou sem resposta.',
      )
      break

    default:
      break
  }

  if (
    tactics.length > 0 &&
    factsAllowed.length > 0
  ) {
    tactics.push(
      'Curiosidade legítima: só se um fato oficial de facts_allowed for relevante ao que o cliente buscava; nunca invente novidade, vaga ou prazo.',
    )
  }

  if (
    tactics.length > 0 &&
    enthusiasm
  ) {
    tactics.push(
      'Recuperação emocional permitida: o próprio cliente demonstrou entusiasmo; retome esse sentimento com as palavras dele, sem exagerar.',
    )
  }

  return {
    frame: {
      evaluated_at:
        temporal.evaluated_at,
      momentum:
        temporal.momentum.state,
      reactivation_mode:
        temporal.reactivation.mode,
      requalify_before_continuing:
        requalify,
      elapsed_since_last_customer_message:
        duration(
          temporal.facts
            .silence_since_last_customer_message_ms,
        ),
      elapsed_since_customer_intent:
        duration(
          temporal.facts
            .age_of_last_customer_intent_ms,
        ),
      customer_waiting_for_seller_for:
        duration(
          temporal.seller_timing
            .pending_customer_wait_ms,
        ),
      intent_time_window_expired:
        Boolean(
          temporal.intent
            ?.time_window_expired,
        ),
      unanswered_seller_attempts:
        temporal.reactivation
          .outbound_unanswered_turns,
      enthusiasm_evidenced:
        enthusiasm,
      momentum_stage:
        temporal.progression.stage,
      gap_severity:
        temporal.progression
          .severity,
      silence_to_rhythm_ratio:
        temporal.progression
          .elapsed_ratio,
      guidance,
    },
    tactics,
  }
}

export function buildCommercialMessageStrategy({
  reasoning,
  coaching,
  diagnostic_input,
  seller_intent = null,
}: {
  reasoning:
    CommercialReasoning
  coaching:
    CommercialCoachingDiagnosis
  diagnostic_input:
    CompanionDiagnosticInput
  seller_intent?:
    string | null
}): CommercialMessageStrategy {
  const temporal =
    reasoning.temporal_context ??
    null

  const techniqueId =
    coaching.chosen_technique
      ?.id ??
    null

  const reengagementTechnique =
    REENGAGEMENT_TECHNIQUES.has(
      techniqueId ?? '',
    )

  // Na retomada, a âncora de contexto é o pedido comercial que o cliente
  // fez (ex.: "aula experimental"), não a última fala solta ("Não fiz
  // ainda."). É isso que torna a retomada específica e não transplantável.
  const reference =
    (
      coaching.sequence_break
        .happened ||
      reengagementTechnique ||
      techniqueId ===
        'technique.delayed_response_recovery'
        ? customerReferenceById(
            diagnostic_input,
            coaching.client_intent_now
              ?.evidence_message_id,
          )
        : null
    ) ??
    latestCustomerReference(
      diagnostic_input,
    )

  const referenceAnchors =
    reference
      ? anchorsFrom(
          reference.text,
        )
      : []

  const requiredInDraft =
    Boolean(
      reasoning.status !==
        'silent' &&
      !sellerIntentIsContextLight(
        seller_intent,
      ) &&
      techniqueId !==
        'technique.respectful_closure' &&
      reference &&
      referenceAnchors.length > 0 &&
      (
        coaching.sequence_break
          .happened ||
        reengagementTechnique ||
        coaching
          .client_intent_now
          ?.confidence === 'high'
      ),
    )

  const factsAllowed =
    reasoning
      .company_knowledge_used
      .map(
        item =>
          item.grounded_content ??
          item.why_relevant,
      )

  const factsMissing =
    missingFacts(
      reasoning,
    )

  const lastMoveAction =
    coaching.seller_last_valid_move
      ?.action_type

  const shouldBlockLastMove =
    Boolean(
      lastMoveAction &&
      (
        coaching.sequence_break
          .happened ||
        reengagementTechnique ||
        reasoning.do_not_do.some(
          item =>
            /não repetir/i.test(
              item,
            ),
        )
      ),
    )

  const requalify =
    Boolean(
      temporal?.reactivation
        .requalify_before_continuing,
    )

  // Reativação/requalificação: pedir o compromisso operacional ou reenviar
  // oferta agora trataria a intenção antiga como atual.
  const blockedActionTypes:
    SellerExecutionActionType[] =
      Array.from(
        new Set([
          ...(
            shouldBlockLastMove &&
            lastMoveAction
              ? [lastMoveAction]
              : []
          ),
          ...(
            requalify ||
            (
              reengagementTechnique &&
              (temporal?.reactivation
                .outbound_unanswered_turns ??
                0) >= 2
            )
              ? OPERATIONAL_ACTIONS
              : []
          ),
          ...(
            techniqueId ===
              'technique.respectful_closure'
              ? OPERATIONAL_ACTIONS
              : []
          ),
        ]),
      )

  const {
    frame: temporalFrame,
    tactics: reactivationTactics,
  } =
    buildTemporalFrame({
      temporal,
      techniqueId,
      factsAllowed:
        unique(factsAllowed),
    })

  const prohibitedMoves =
    unique([
      ...reasoning.do_not_do,
      ...diagnostic_input
        .commercial_context
        .prohibited_behaviors,
      ...(
        factsMissing.includes(
          'multiple_valid_options',
        )
          ? [
              'Não inventar alternativas, horários, vagas ou disponibilidade para criar uma escolha guiada.',
            ]
          : []
      ),
      ...(
        requalify
          ? [
              'Não tratar a intenção antiga como confirmada nem pedir data, horário, pagamento ou decisão antes de reconfirmar o interesse atual.',
            ]
          : []
      ),
      ...(
        reactivationTactics.length > 0
          ? [
              'Não inventar entusiasmo, urgência, escassez, perda, relacionamento ou necessidade que o cliente não demonstrou.',
            ]
          : []
      ),
    ])

  const outboundAllowed =
    temporal?.reactivation
      .contact_allowed ??
    true

  return {
    contract_version:
      COMMERCIAL_MESSAGE_STRATEGY_VERSION,
    outbound_allowed:
      outboundAllowed,
    objective:
      reasoning.status ===
        'silent' ||
      !outboundAllowed
        ? null
        : reasoning.objective_now,
    relationship_bridge:
      bridgeFor({
        coaching,
      }),
    context_reference:
      reference
        ? {
            text:
              reference.text,
            evidence_message_id:
              reference.message_id,
            required_in_draft:
              requiredInDraft,
            anchors:
              referenceAnchors,
          }
        : null,
    technique_id:
      coaching.chosen_technique
        ?.id ??
      null,
    technique_title:
      coaching.chosen_technique
        ?.title ??
      null,
    desired_microcommitment:
      outboundAllowed
        ? desiredMicrocommitment({
            reasoning,
            coaching,
          })
        : null,
    facts_allowed:
      unique(
        factsAllowed,
      ),
    facts_required_but_missing:
      factsMissing,
    prohibited_moves:
      prohibitedMoves,
    blocked_action_types:
      blockedActionTypes,
    required_action_type:
      outboundAllowed
        ? requiredActionForTechnique(
            coaching.chosen_technique
              ?.id,
          )
        : null,
    tone:
      diagnostic_input
        .commercial_context
        .communication_tone,
    max_length:
      reengagementTechnique ||
      techniqueId ===
        'technique.respectful_closure'
        ? REENGAGEMENT_MAX_LENGTH
        : MAX_MESSAGE_LENGTH,
    temporal_frame:
      temporalFrame,
    reactivation_tactics:
      reactivationTactics,
    evidence_message_ids:
      unique([
        ...coaching
          .evidence_message_ids,
        ...(
          reference
            ? [
                reference.message_id,
              ]
            : []
        ),
      ]),
    memory_ids:
      unique([
        ...coaching.memory_ids,
      ]),
  }
}

const FILLER_PHRASES = [
  'posso ajudar com o que for necessario',
  'fico a disposicao',
  'estou a disposicao',
  'sigo a disposicao',
  'qualquer coisa estou a disposicao',
  'qualquer duvida',
  'qualquer coisa me chama',
  'qualquer coisa me avisa',
  'conte comigo para o que precisar',
  'estou por aqui',
  'fico no aguardo',
  'aguardo seu retorno',
  'aguardo retorno',
  'para avancarmos',
] as const

// Frases da mensagem, preservando a pontuação final.
function sentencesOf(
  message: string,
): string[] {
  // Só quebra em pontuação seguida de espaço/fim: "R$ 1.299" e
  // "site.com" permanecem inteiros.
  return message
    .split(
      /(?<=[.!?])\s+|\n+/,
    )
    .map(
      sentence =>
        sentence.trim(),
    )
    .filter(Boolean)
}

// Fechamento vazio é uma FRASE que só oferece disponibilidade/cortesia e
// não carrega o microcompromisso. "Qual o melhor dia para avançarmos?" é
// a pergunta comercial — não é filler, mesmo contendo "para avançarmos".
function isFillerSentence(
  sentence: string,
): boolean {
  if (sentence.includes('?')) {
    return false
  }

  const normalized =
    comparable(sentence)

  return FILLER_PHRASES.some(
    phrase =>
      normalized.includes(
        phrase,
      ),
  )
}

function hasGenericFiller(
  message: string,
): boolean {
  return sentencesOf(message)
    .some(isFillerSentence)
}

// Pergunta fática ("tudo bem?") que não carrega compromisso comercial.
function isPhaticQuestion(
  segment: string,
): boolean {
  const normalized =
    comparable(segment)
      .replace(
        /^(oi|ola|bom dia|boa tarde|boa noite)\b/,
        '',
      )
      .trim()

  return (
    segment.includes('?') &&
    /^([a-z]+ )?(tudo bem|tudo bom|como vai|como voce esta|como esta)( com voce)?$/.test(
      normalized,
    )
  )
}

const REENGAGEMENT_MICROCOMMITMENT =
  /\b(ainda|retom\w*|continu\w*|interesse|faz sentido|segue|quer|como ficou|chegou a|conseguiu|desde entao|mudou|resolveu|decidiu|pensando|avaliando|prioridade|momento|podemos|vamos)\b/

function hasReengagementMicrocommitment(
  message: string,
): boolean {
  const questionSegments =
    message.match(
      /[^?]{1,220}\?/g,
    ) ?? []

  return questionSegments.some(
    segment => {
      if (
        isPhaticQuestion(
          segment.split(/[.!]/).pop() ??
            segment,
        )
      ) {
        return false
      }

      const normalized =
        comparable(segment)

      if (
        normalized.includes(
          'tudo bem',
        ) &&
        !REENGAGEMENT_MICROCOMMITMENT
          .test(
            normalized.replace(
              'tudo bem',
              '',
            ),
          )
      ) {
        return false
      }

      return (
        REENGAGEMENT_MICROCOMMITMENT
          .test(normalized) ||
        classifySellerActionText(
          segment,
        ) === 'reengagement'
      )
    },
  )
}

const FABRICATED_ENTHUSIASM =
  /\b(voce|vc) (estava|ficou|parecia|tava) (super |bem |muito |tao )?(animad\w*|empolgad\w*|ansios\w*|entusiasmad\w*)|\b(sei|lembro) (o quanto|que) (voce|vc) (queria muito|adorou|amou|estava animad\w*)/

const UNGROUNDED_URGENCY =
  /\b(ultimas? vagas?|vagas? limitadas?|so ate hoje|so hoje|ultima chance|corre|nao perca|acaba (hoje|amanha)|por tempo limitado|antes que acabe)\b/

// Reparo determinístico SEM relaxar o critic: remove somente o que é
// trivialmente removível (frase de disponibilidade vazia, pergunta fática
// concorrendo com a pergunta comercial). O resultado passa de novo pelo
// MESMO critic/validação; se não passar, o reparo não é usado.
export function repairCommercialMessageDraft(
  message: string,
): {
  message: string
  repairs: string[]
} {
  const repairs: string[] = []

  let sentences =
    sentencesOf(message)

  const withoutFiller =
    sentences.filter(
      sentence =>
        !isFillerSentence(
          sentence,
        ),
    )

  if (
    withoutFiller.length > 0 &&
    withoutFiller.length <
      sentences.length
  ) {
    sentences = withoutFiller
    repairs.push(
      'removed_generic_filler',
    )
  }

  const questionCount =
    sentences.filter(
      sentence =>
        sentence.includes('?'),
    ).length

  if (questionCount > 1) {
    const adjusted =
      sentences.map(
        sentence => {
          if (
            !isPhaticQuestion(
              sentence,
            )
          ) {
            return sentence
          }

          // Mantém a saudação e o nome ("Oi, Lorena") e remove só a cauda
          // fática ("tudo bem?").
          const greeting =
            sentence
              .replace(
                /[,\s]*(tudo bem|tudo bom|como vai|como (você|voce) (está|esta))[^?]*\?\s*$/i,
                '',
              )
              .trim()
              .replace(/[,;:]+$/, '')

          repairs.push(
            'removed_phatic_question',
          )

          return greeting
            ? `${greeting}!`
            : ''
        },
      )
        .filter(Boolean)

    sentences = adjusted
  }

  return {
    message:
      sentences
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    repairs:
      unique(repairs),
  }
}

// Requalificação: a intenção antiga NÃO pode ser tratada como atual — nem
// pedindo o passo operacional numa parte da pergunta ("vi que você ainda
// quer fazer a aula, qual horário fica melhor?"), nem afirmando o interesse
// como fato ("sei que você quer..."). Perguntar pelo estado atual ("ainda
// faz sentido?") continua sendo a retomada correta.
const PRESUMED_CURRENT_INTENT =
  /\b(?:vi que|sei que|ja que|como|entendi que|percebi que|notei que|imagino que)\s+(?:voce|vc)\s+(?:ainda\s+)?(?:quer|deseja|precisa|tem interesse|esta (?:querendo|interessad\w*|procurando|pensando))\b/

function presumesCurrentIntent(
  message: string,
): boolean {
  if (
    PRESUMED_CURRENT_INTENT.test(
      comparable(message),
    )
  ) {
    return true
  }

  // Afirmação (fora de pergunta) de que o cliente AINDA quer.
  return sentencesOf(message)
    .filter(
      sentence =>
        !sentence.includes('?'),
    )
    .some(sentence =>
      /\b(?:voce|vc)\s+(?:ainda\s+)?(?:quer|deseja|esta (?:querendo|interessad\w*))\b/.test(
        comparable(sentence),
      ),
    )
}

// O PEDIDO de uma pergunta é a sua última parte ("vi que você ainda quer a
// aula, qual horário fica melhor?" pede o horário); a abertura ("sobre a
// aula que você tinha pedido:") só contextualiza.
function asksOperationalStep(
  message: string,
): boolean {
  return sentencesOf(message)
    .filter(
      sentence =>
        sentence.includes('?'),
    )
    .map(
      sentence =>
        sentence
          .replace(/\?+\s*$/, '')
          .split(/[,;:]/)
          .map(part => part.trim())
          .filter(Boolean)
          .pop() ?? '',
    )
    .filter(Boolean)
    .some(ask =>
      OPERATIONAL_ACTIONS.includes(
        classifySellerActionText(
          `${ask}?`,
        ),
      ),
    )
}

function repeatsRecentOutgoing({
  message,
  recent_outgoing_messages,
}: {
  message: string
  recent_outgoing_messages:
    readonly string[]
}): boolean {
  const normalized =
    comparable(message)

  if (
    normalized.length < 12
  ) {
    return false
  }

  return recent_outgoing_messages
    .some((previous) => {
      const prior =
        comparable(previous)

      if (
        prior.length < 12
      ) {
        return false
      }

      return (
        prior === normalized ||
        prior.includes(
          normalized,
        ) ||
        normalized.includes(
          prior,
        )
      )
    })
}

export function evaluateCommercialMessageDraft({
  message,
  strategy,
  recent_outgoing_messages = [],
}: {
  message: string
  strategy:
    CommercialMessageStrategy
  recent_outgoing_messages?:
    readonly string[]
}): CommercialMessageCriticResult {
  const violations:
    CommercialMessageCriticViolation[] =
    []

  if (
    message.length >
    strategy.max_length
  ) {
    violations.push(
      'message_too_long',
    )
  }

  const reference =
    strategy.context_reference

  if (
    reference
      ?.required_in_draft &&
    reference.anchors.length > 0
  ) {
    const messageTokens =
      new Set(
        comparable(message)
          .split(' ')
          .filter(Boolean),
      )

    const hasReference =
      reference.anchors.some(
        anchor =>
          messageTokens.has(
            anchor,
          ),
      )

    if (!hasReference) {
      violations.push(
        'generic_message',
      )
    }
  }

  const candidateAction =
    classifySellerActionText(
      message,
    )

  const requiredAction =
    strategy.required_action_type ??
    null

  const blockedByAction =
    (
      strategy.blocked_action_types ??
      []
    ).includes(
      candidateAction,
    ) &&
    candidateAction !==
      requiredAction

  if (
    blockedByAction ||
    repeatsRecentOutgoing({
      message,
      recent_outgoing_messages,
    })
  ) {
    violations.push(
      'repeats_recent_seller_action',
    )
  }

  const questionCount =
    (message.match(/\?/g) ?? [])
      .length

  if (questionCount > 1) {
    violations.push(
      'excessive_questions',
    )
  }

  const groundedFacts =
    comparable(
      strategy.facts_allowed.join(' '),
    )

  const urgency =
    comparable(message).match(
      UNGROUNDED_URGENCY,
    )?.[0] ?? null

  if (
    candidateAction ===
      'pressure_or_false_urgency' ||
    (
      urgency &&
      !groundedFacts.includes(
        urgency,
      )
    )
  ) {
    violations.push(
      'pressure_risk',
    )
  }

  const temporalFrame =
    strategy.temporal_frame ??
    null

  if (
    temporalFrame
      ?.requalify_before_continuing &&
    (
      OPERATIONAL_ACTIONS.includes(
        candidateAction,
      ) ||
      asksOperationalStep(message) ||
      presumesCurrentIntent(message)
    )
  ) {
    violations.push(
      'assumes_current_intent',
    )
  }

  if (
    !temporalFrame
      ?.enthusiasm_evidenced &&
    FABRICATED_ENTHUSIASM.test(
      comparable(message),
    )
  ) {
    violations.push(
      'fabricated_enthusiasm',
    )
  }

  const techniqueId =
    strategy.technique_id

  const techniqueMismatch =
    Boolean(
      requiredAction &&
      candidateAction !==
        requiredAction,
    )

  if (techniqueMismatch) {
    violations.push(
      'technique_mismatch',
    )
  }

  if (
    hasGenericFiller(
      message,
    )
  ) {
    violations.push(
      'generic_filler',
    )
  }

  if (
    REENGAGEMENT_TECHNIQUES.has(
      techniqueId ?? '',
    ) &&
    !hasReengagementMicrocommitment(
      message,
    )
  ) {
    violations.push(
      'weak_microcommitment',
    )
  }

  return {
    passed:
      violations.length === 0,
    violations:
      unique(
        violations,
      ) as
        CommercialMessageCriticViolation[],
  }
}

// ---------------------------------------------------------------------------
// Recuperação semântica da MENSAGEM.
//
// Quando o redator insiste em violar a estratégia (repetir a ação que ficou
// sem resposta, tratar a intenção antiga como atual, oferecer em vez de
// reativar), a MessageStrategy canônica já tem o bastante para montar uma
// copy segura: a fala real do cliente (context_reference), a ação
// obrigatória (required_action_type) e o microcompromisso da técnica. O
// composer é determinístico, só usa o que o próprio cliente disse, e a copy
// passa pelo MESMO critic, pela mesma validação e pelo mesmo gate
// customer-facing — nada é relaxado. Só existe para ações cuja copy segura
// não depende de fatos que faltam (retomada/reativação); para as demais
// (escolha guiada sem opções reais, fechamento, objeção) não há fallback.
// ---------------------------------------------------------------------------

const TOPIC_BOUNDARY_START = '(?<![\\p{L}\\p{N}])'
const TOPIC_BOUNDARY_END = '(?![\\p{L}\\p{N}])'

function topicPattern(
  body: string,
  flags = 'giu',
): RegExp {
  return new RegExp(
    `${TOPIC_BOUNDARY_START}(?:${body})${TOPIC_BOUNDARY_END}`,
    flags,
  )
}

// Referências de tempo do pedido original: o horizonte antigo ("hoje",
// "sexta às 10h") não vale mais e nunca é repetido na retomada.
const TOPIC_TIME_EXPRESSIONS =
  topicPattern(
    [
      'ainda hoje',
      'hoje(?: mesmo)?',
      'depois de amanh[aã]',
      'amanh[aã]',
      'agora',
      '(?:essa|esta|nessa|nesta) semana',
      'semana que vem',
      'pr[oó]xima semana',
      'm[eê]s que vem',
      'pr[oó]ximo m[eê]s',
      '(?:n[ao]|nest[ae]|ness[ae])\\s+(?:pr[oó]xim[ao]\\s+)?(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira|\\s+feira)?',
      '(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira|\\s+feira)?',
      '(?:[àa]s?|por volta d[ae]s?)\\s+\\d{1,2}(?:[:h]\\d{0,2})?\\s*(?:h|horas?)?',
      '\\d{1,2}h\\d{0,2}',
      '(?:de|pela)\\s+manh[aã]',
      '(?:[àa]|pela)\\s+(?:tarde|noite)',
      'cedo',
      'mais tarde',
      'por favor',
      'pra mim',
      'para mim',
    ].join('|'),
  )

// Abertura do pedido que não faz parte do assunto ("podemos", "queria",
// "vocês podem me mandar"). Pedido para o vendedor ENVIAR algo vira o que o
// cliente queria RECEBER.
const TOPIC_REQUEST_LEADS: ReadonlyArray<[RegExp, string]> = [
  [/^(?:voc[eê]s?|vcs)\s+(?:podem|pode|poderiam|poderia|conseguem|consegue|conseguiriam)\s+(?:me\s+)?(?:mandar|enviar|passar)\s+/iu, 'receber '],
  [/^(?:me\s+)?(?:manda|mande|envia|envie|passa|passe)\s+/iu, 'receber '],
  [/^(?:eu\s+)?(?:gostaria\s+de|queria|quero|preciso\s+de|preciso|vou\s+querer)\s+/iu, ''],
  [/^(?:n[oó]s\s+)?(?:podemos|poder[ií]amos|posso|poderia|podia|consigo|conseguiria|conseguimos|d[aá]\s+(?:pra|para)|tem\s+como|seria\s+poss[ií]vel|ser[aá]\s+que\s+(?:d[aá]|consigo|posso)(?:\s+(?:pra|para))?)\s+/iu, ''],
  [/^(?:voc[eê]s?|vcs)\s+(?:t[eê]m|tem|fazem|faz|trabalham\s+com|atendem)\s+/iu, ''],
  [/^(?:tem|t[eê]m|existe)\s+/iu, ''],
]

const TOPIC_COURTESY_TOKENS =
  new Set([
    'ok', 'okay', 'obrigado', 'obrigada', 'obg', 'valeu', 'blz', 'beleza',
    'certo', 'certinho', 'sim', 'nao', 'combinado', 'perfeito', 'entendi',
    'show', 'top', 'legal', 'otimo', 'otima', 'bom', 'boa', 'tranquilo',
    'claro', 'isso', 'esta', 'tudo', 'bem', 'por', 'favor',
  ])

// Assunto do pedido original, reescrito para ser citado ao cliente sem
// repetir o horizonte antigo nem a formulação da pergunta ("Podemos fazer a
// aula experimental hoje?" → "fazer a aula experimental"). Nunca inventa:
// sem assunto reconhecível (ou sem âncora do pedido), devolve null.
export function customerRequestTopic(
  text: string,
  anchors: readonly string[] = [],
): string | null {
  const sentences =
    text
      .split(/(?<=[.!?])\s+|\n+/)
      .map(sentence => sentence.trim())
      .filter(Boolean)

  // A frase do pedido é a que carrega as âncoras do assunto; saudação e
  // "tudo bem?" nunca são o assunto.
  const cleaned =
    sentences
      .map(sentence =>
        sentence
          .replace(/^(?:(?:oi+|ol[aá]|opa|e a[ií]|bom dia|boa tarde|boa noite)(?:\s+[\p{Lu}][\p{L}'-]*)?[\s,!.]*)+/iu, '')
          .replace(/(?<![\p{L}])(?:tudo bem|tudo bom|como vai)\s*\??/giu, '')
          .replace(/[?!.;:]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean)
      .map(sentence => ({
        sentence,
        score:
          anchors.filter(anchor =>
            comparable(sentence)
              .split(' ')
              .includes(anchor),
          ).length,
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.sentence.length - left.sentence.length,
      )

  let topic =
    cleaned[0]?.sentence ?? ''

  // Pergunta de preço: o assunto é o item consultado ("quanto custa o
  // plano X?" → "o plano X"), nunca um valor.
  const priceQuestion =
    topic.match(
      /^(?:quanto\s+(?:custa|fica|sai|[eé])|qual\s+(?:[eé]\s+)?(?:o\s+)?(?:valor|pre[cç]o)(?:\s+d[aoe]s?)?)\s+(.+)$/iu,
    )

  if (priceQuestion) {
    const rest =
      priceQuestion[1].trim()

    topic =
      /^(?:o|a|os|as|um|uma)\s/iu.test(rest)
        ? rest
        : `o ${rest}`
  } else {
    for (let pass = 0; pass < 3; pass += 1) {
      const before = topic

      for (const [pattern, replacement] of TOPIC_REQUEST_LEADS) {
        topic = topic.replace(pattern, replacement)
      }

      if (topic === before) {
        break
      }
    }
  }

  topic =
    topic
      .replace(TOPIC_TIME_EXPRESSIONS, ' ')
      .replace(topicPattern('minhas'), 'suas')
      .replace(topicPattern('minha'), 'sua')
      .replace(topicPattern('meus'), 'seus')
      .replace(topicPattern('meu'), 'seu')
      .replace(topicPattern('nossas'), 'suas')
      .replace(topicPattern('nossa'), 'sua')
      .replace(topicPattern('nossos'), 'seus')
      .replace(topicPattern('nosso'), 'seu')
      .replace(/\s+/g, ' ')
      .replace(/[\s,;:-]+$/g, '')
      .replace(/\s+(?:e|ou|de|do|da|para|pra|com|em|no|na)$/iu, '')
      .trim()

  if (
    !topic ||
    /^(?:quando|como|onde|que horas|qual|quais|por que|porque|pq|o que|sera)\b/iu.test(topic) ||
    topicPattern('eu|comigo|mim|me|nós|conosco', 'iu').test(topic)
  ) {
    return null
  }

  const words =
    topic.split(/\s+/).length

  if (words < 2 || words > 14) {
    return null
  }

  // Cortesia/confirmação ("ok, obrigado", "tá certo") não é assunto.
  if (
    comparable(topic)
      .split(' ')
      .every(token =>
        token.length <= 2 ||
        TOPIC_COURTESY_TOKENS.has(token),
      )
  ) {
    return null
  }

  if (
    anchors.length > 0 &&
    !anchors.some(anchor =>
      comparable(topic)
        .split(' ')
        .includes(anchor),
    )
  ) {
    return null
  }

  return topic.charAt(0).toLowerCase() + topic.slice(1)
}

// Pergunta de retomada por técnica: UMA pergunta de baixo esforço, que
// descobre o estado atual sem presumir interesse nem pedir data/horário.
const REACTIVATION_QUESTIONS: Record<string, string> = {
  'technique.state_change_reactivation':
    'De lá pra cá, você chegou a resolver isso de outra forma ou ainda faz sentido retomarmos por aqui?',
  'technique.permission_based_reengagement':
    'Ainda faz sentido retomarmos esse assunto agora, ou prefere deixar para outro momento?',
  'technique.pattern_interrupt_reengagement':
    'Pergunta rápida: isso ainda é prioridade para você ou ficou para depois?',
  'technique.contextual_reengagement':
    'Isso ainda faz sentido para você, ou algo mudou desde então?',
}

export type StrategyGroundedMessage = {
  message: string
  technique_id: string | null
  topic: string
}

// Copy segura a partir da estratégia canônica. null quando não há ação
// canônica segura (não é retomada), quando o cliente não pode receber
// mensagem, ou quando o pedido do cliente não sustenta uma referência
// concreta — nesses casos não existe copy honesta sem inventar.
export function composeStrategyGroundedMessage({
  strategy,
  recipient_name = null,
}: {
  strategy:
    CommercialMessageStrategy | null
  recipient_name?: string | null
}): StrategyGroundedMessage | null {
  if (
    !strategy ||
    strategy.outbound_allowed === false ||
    !strategy.objective ||
    strategy.required_action_type !==
      'reengagement' ||
    !strategy.context_reference?.text
  ) {
    return null
  }

  const topic =
    customerRequestTopic(
      strategy.context_reference.text,
      strategy.context_reference.anchors,
    )

  if (!topic) {
    return null
  }

  const question =
    REACTIVATION_QUESTIONS[
      strategy.technique_id ?? ''
    ] ??
    REACTIVATION_QUESTIONS[
      'technique.state_change_reactivation'
    ]

  const firstName =
    recipient_name
      ?.trim()
      .split(/\s+/)[0] ??
    null

  const message = [
    firstName
      ? `Oi, ${firstName}!`
      : 'Oi!',
    `Quando a gente conversou, você tinha comentado sobre ${topic}.`,
    question,
  ].join(' ')

  return message.length <=
    strategy.max_length
    ? {
        message,
        technique_id:
          strategy.technique_id,
        topic,
      }
    : null
}
