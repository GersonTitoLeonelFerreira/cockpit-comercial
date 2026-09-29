import type {
  CompanionDiagnosticInput,
  DiagnosticInputMessage,
} from './diagnostic-input'

import {
  expressesAffirmativeContinuation,
  isCustomerPhaticMessage,
} from './seller-execution-trace'

import type {
  SellerExecutionActionType,
  SellerExecutionConfidence,
  SellerExecutionCustomerIntentKind,
  SellerExecutionCustomerSignal,
  SellerExecutionTimeReference,
  SellerExecutionTrace,
  SellerExecutionTurn,
} from './seller-execution-trace'

import type {
  CompanionClientRelationship,
  CompanionClientSlaAssessment,
} from './companion-client-context-contract'

// ============================================================================
// Commercial Temporal Context — TEMPO É EVIDÊNCIA COMERCIAL.
//
// A mesma transcrição pode exigir decisões diferentes depois de 30 minutos,
// 2 dias ou 18 dias de silêncio. Este módulo transforma timestamps já
// canônicos (DiagnosticInput + Seller Execution Trace) em fatos temporais e
// numa leitura explícita de continuidade/momentum que alimenta o raciocínio
// comercial canônico (Reasoning → Coaching → Message Strategy). Não é um
// segundo cérebro: não escolhe técnica nem redige nada; só diz o que o tempo
// prova e com que confiança.
//
// Regras:
// - Tempo decorrido é sempre FATO; sua interpretação carrega confiança.
// - Intenção histórica != intenção atual confirmada: intenção envelhecida
//   perde o status de "atual" até ser reconfirmada.
// - Oportunidade sem continuidade != oportunidade perdida: dormência pede
//   reativação, nunca marcação automática de perda.
// - Nenhum limiar universal do tipo "7 dias = lead morto". A janela de
//   resposta esperada deriva do ritmo observado do próprio cliente quando
//   existe; adiamento explícito do cliente estende o horizonte; os valores
//   default abaixo são heurística de cadência comercial, NÃO SLA.
// - SLA só é citado quando a empresa configurou a regra (passthrough do
//   CLIENTE); este módulo nunca declara violação de SLA sem base.
// ============================================================================

export const COMMERCIAL_TEMPORAL_CONTEXT_VERSION =
  'commercial-temporal-context-v1' as const

export const COMMERCIAL_TEMPORAL_POLICY = {
  // Mesma janela de sessão usada por Decision State/diagnóstico (4h).
  active_exchange_window_ms:
    4 * 60 * 60 * 1000,

  // Janela de resposta esperada do cliente quando não há ritmo observado:
  // "ontem" ainda é ritmo normal; dois dias sem resposta já não é.
  default_expected_reply_window_ms:
    36 * 60 * 60 * 1000,

  min_expected_reply_window_ms:
    12 * 60 * 60 * 1000,

  max_expected_reply_window_ms:
    72 * 60 * 60 * 1000,

  // Multiplicador sobre o ritmo mediano observado do cliente.
  observed_cadence_multiplier: 3,

  // Avaliação de latência do vendedor (sem SLA configurado não se fala em
  // "violação": apenas em rapidez relativa ao tipo de pedido).
  high_intent_timely_response_ms:
    60 * 60 * 1000,

  timely_response_ms:
    4 * 60 * 60 * 1000,

  delayed_response_ms:
    24 * 60 * 60 * 1000,

  // ------------------------------------------------------------------
  // Momentum progressivo. O tempo NÃO é convertido em poucos baldes: a
  // razão silêncio/janela esperada é contínua e vira uma severidade
  // contínua (0..1). Os estágios são só a síntese seller-facing dessa
  // curva; a intensidade continua disponível para Reasoning, Coaching e
  // Message Strategy.
  // ------------------------------------------------------------------

  // Dentro da janela esperada a severidade cresce devagar até este teto.
  within_rhythm_severity_ceiling: 0.08,

  // Quantas "janelas esperadas" além do ritmo levam ~63% do caminho até a
  // perda total de continuidade.
  continuity_decay_ratio: 3,

  // Cada tentativa adicional sem resposta aproxima a severidade de 1.
  unanswered_outbound_factor: 0.85,

  // Risco alto de SLA configurado pela empresa agrava a severidade.
  sla_risk_factor: 0.8,

  // Limites dos estágios seller-facing sobre a severidade contínua.
  stage_thresholds: {
    early_loss: 0.3,
    prolonged_silence: 0.55,
    strong_gap: 0.8,
  },

  // Janela em que o vendedor deve responder quando o cliente espera.
  seller_high_intent_response_window_ms:
    60 * 60 * 1000,

  seller_standard_response_window_ms:
    4 * 60 * 60 * 1000,

  owed_response_decay_ratio: 6,

  // Pedido do próprio cliente com urgência ("hoje", "amanhã") encurta o
  // ritmo esperado enquanto a janela dele está aberta.
  time_sensitive_customer_window_ms:
    12 * 60 * 60 * 1000,

  // Vitalidade da intenção histórica: decai com o tempo desde a última
  // manifestação RELACIONADA do cliente (não com qualquer atividade).
  intent_decay_windows: 3,

  intent_confidence_base: {
    high: 1,
    medium: 0.75,
    low: 0.5,
  },

  intent_expired_window_factor: 0.6,

  intent_current_vitality: 0.7,

  intent_aging_vitality: 0.35,

  intent_reconfirmation_vitality: 0.5,

  intent_expired_reconfirmation_vitality: 0.7,

  // Durante uma pausa combinada com o cliente a intenção envelhece a um
  // quarto da velocidade normal.
  agreed_pause_decay_weight: 0.25,
} as const

const DAY_MS =
  24 * 60 * 60 * 1000

const BUSINESS_TIME_ZONE =
  'America/Sao_Paulo'

export type CommercialMomentumState =
  | 'active'
  | 'awaiting_seller'
  | 'awaiting_customer'
  | 'cooling'
  | 'dormant'
  | 'closed'
  | 'no_history'

export type CommercialIntentFreshness =
  | 'current'
  | 'aging'
  | 'stale'
  | 'closed'
  | 'none'

// Síntese seller-facing da curva contínua de severidade.
export type CommercialMomentumStage =
  | 'within_rhythm'
  | 'early_loss'
  | 'prolonged_silence'
  | 'strong_gap'
  | 'long_dormancy'
  | 'closed'
  | 'no_history'

// Quem deve o próximo movimento. "agreed_pause" = o cliente pediu um
// prazo e ele ainda vale; ninguém deve movimento imediato.
export type CommercialTemporalResponsible =
  | 'seller'
  | 'customer'
  | 'agreed_pause'
  | 'none'
  | 'unknown'

// O que manteve a intenção histórica viva pela última vez. Atividade
// fática ("Bom dia", "ok", emoji) nunca aparece aqui.
export type CommercialIntentRefreshReason =
  | 'new_statement'
  | 'reconfirmation'
  | 'answer_to_seller_move'
  | 'same_subject'
  | 'deferral_agreement'
  | 'enthusiastic_reaction'

export type CommercialAgreedPause = {
  requested_message_id: string
  requested_at: string
  resume_at: string
  agreed_until: string
  seller_owes_contact: boolean
  horizon_label: string
  status:
    | 'in_progress'
    | 'due'
    | 'overdue'
}

export type CommercialTemporalProgression = {
  responsible:
    CommercialTemporalResponsible
  // Silêncio do lado que deve o movimento (ou desde o pedido de pausa).
  silence_ms: number | null
  expected_window_ms: number | null
  expected_window_basis:
    | 'observed'
    | 'default'
    | 'time_sensitive_intent'
    | 'agreed_pause'
    | null
  // silêncio / janela esperada (depois de uma pausa combinada:
  // 1 + atraso sobre o combinado / ritmo esperado).
  elapsed_ratio: number | null
  // Perda de continuidade contínua 0..1, monótona no tempo.
  severity: number
  stage: CommercialMomentumStage
  // Força restante da intenção histórica 0..1.
  intent_vitality: number | null
  intent_related_age_ms: number | null
  bidirectional_inactivity_ms: number | null
  unanswered_outbound: number
  owed_response: {
    owner: 'seller'
    expected_ms: number
    elapsed_ms: number
    overdue_ratio: number
    severity: number
    basis:
      | 'high_intent'
      | 'time_sensitive_intent'
      | 'standard'
  } | null
  agreed_pause:
    CommercialAgreedPause | null
  factors: string[]
}

export type CommercialTemporalWaitingOn =
  | 'seller'
  | 'customer'
  | 'none'
  | 'unknown'

// Próximo movimento que o TEMPO sustenta — o Reasoning escolhe a técnica.
export type CommercialReactivationMode =
  | 'none'
  | 'wait'
  | 'respond_now'
  | 'recover_delay'
  | 'light_follow_up'
  | 'reactivate'
  | 'respect_closure'

export type CommercialResponseTimingAssessment =
  | 'timely'
  | 'delayed'
  | 'very_delayed'
  | 'unanswered'
  | 'unknown'

export type CommercialResponseQualityTiming =
  | 'fast_adequate'
  | 'fast_inadequate'
  | 'slow_adequate'
  | 'slow_inadequate'
  | 'unknown'

export type CommercialTemporalGap = {
  from_message_id: string
  to_message_id: string
  from_author: 'customer' | 'seller'
  to_author: 'customer' | 'seller'
  gap_ms: number
}

export type CommercialHighIntentResponse = {
  customer_message_id: string
  intent_kind:
    SellerExecutionCustomerIntentKind
  time_reference:
    SellerExecutionTimeReference
  requested_at: string
  first_response_message_id: string | null
  first_response_latency_ms: number | null
  first_response_addressed: boolean | null
  effective_response_message_id: string | null
  effective_response_latency_ms: number | null
  assessment:
    CommercialResponseTimingAssessment
}

export type CommercialTemporalContext = {
  contract_version:
    typeof COMMERCIAL_TEMPORAL_CONTEXT_VERSION

  evaluated_at: string

  facts: {
    first_contact_at: string | null
    last_message_at: string | null
    last_message_author:
      | 'customer'
      | 'seller'
      | null
    last_customer_message_at: string | null
    last_seller_message_at: string | null
    last_bidirectional_exchange_at: string | null
    last_customer_intent_at: string | null
    last_meaningful_commercial_event_at: string | null

    conversation_age_ms: number | null
    silence_since_last_customer_message_ms: number | null
    silence_since_last_seller_message_ms: number | null
    silence_since_last_bidirectional_exchange_ms: number | null
    age_of_last_customer_intent_ms: number | null

    seller_messages_since_last_customer_reply: number
    seller_turns_since_last_customer_reply: number
    longest_relevant_gap:
      CommercialTemporalGap | null
  }

  cadence: {
    customer_reply_samples: number
    customer_median_reply_ms: number | null
    seller_reply_samples: number
    seller_median_reply_ms: number | null
    expected_customer_reply_window_ms: number
    dormancy_horizon_ms: number
    basis:
      | 'observed'
      | 'default'
      | 'deferral'
  }

  seller_timing: {
    high_intent_request:
      CommercialHighIntentResponse | null
    latest_response: {
      turn_id: string
      latency_ms: number | null
      addressed: boolean | null
      assessment:
        CommercialResponseTimingAssessment
      quality_timing:
        CommercialResponseQualityTiming
    } | null
    pending_customer_wait_ms: number | null
  }

  intent: {
    kind:
      SellerExecutionCustomerIntentKind
    confidence:
      SellerExecutionConfidence
    evidence_message_id: string
    demonstrated_at: string
    last_engagement_at: string
    freshness:
      CommercialIntentFreshness
    time_reference:
      SellerExecutionTimeReference
    time_window_expired: boolean
    expressed_enthusiasm: boolean
    needs_reconfirmation: boolean
    // Força restante (0..1) e o que a manteve viva pela última vez.
    vitality: number
    related_age_ms: number
    refreshed_by:
      CommercialIntentRefreshReason
  } | null

  progression:
    CommercialTemporalProgression

  momentum: {
    state: CommercialMomentumState
    waiting_on:
      CommercialTemporalWaitingOn
    since: string | null
    duration_ms: number | null
    confidence:
      SellerExecutionConfidence
    reason_codes: string[]
  }

  reactivation: {
    mode: CommercialReactivationMode
    // false quando o cliente pediu para não receber mais contato: nenhuma
    // mensagem nova é permitida, nem de encerramento.
    contact_allowed: boolean
    requalify_before_continuing: boolean
    outbound_unanswered_turns: number
    last_unanswered_action_types:
      SellerExecutionActionType[]
    reason_codes: string[]
  }

  sla:
    CompanionClientSlaAssessment | null

  snapshot: {
    newer_activity_outside_snapshot: boolean
  }

  signals: string[]
  situations: string[]

  narrative: {
    momentum_label: string
    intent_label: string | null
    facts: string[]
  }
}

export type CommercialTemporalOperationalContext = {
  relationship?:
    CompanionClientRelationship | null
  sla?:
    CompanionClientSlaAssessment | null
}

const COMMERCIAL_INTENT_KINDS:
  ReadonlySet<SellerExecutionCustomerIntentKind> =
    new Set([
      'scheduling',
      'close',
      'payment_objection',
      'objection',
      'pricing',
      'product_interest',
      'third_party_interest',
      'general_interest',
    ])

const HIGH_INTENT_KINDS:
  ReadonlySet<SellerExecutionCustomerIntentKind> =
    new Set([
      'scheduling',
      'close',
      'payment_objection',
      'pricing',
    ])

function parse(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null
  }

  const parsed =
    Date.parse(value)

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function iso(
  value: number | null,
): string | null {
  return value === null
    ? null
    : new Date(value).toISOString()
}

function median(
  values: number[],
): number | null {
  if (values.length === 0) {
    return null
  }

  const sorted =
    [...values].sort(
      (left, right) =>
        left - right,
    )

  const middle =
    Math.floor(
      sorted.length / 2,
    )

  return sorted.length % 2 === 0
    ? Math.round(
        (
          sorted[middle - 1] +
          sorted[middle]
        ) / 2,
      )
    : sorted[middle]
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    max,
    Math.max(min, value),
  )
}

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[̀-ͯ]/g,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function messageText(
  message: DiagnosticInputMessage,
): string {
  return (
    message.text_content ??
    message.audio_transcription ??
    ''
  ).trim()
}

type AuthoredMessage = {
  message: DiagnosticInputMessage
  author: 'customer' | 'seller'
  at: number
}

function authoredMessages(
  input: CompanionDiagnosticInput,
): AuthoredMessage[] {
  return [
    ...input.conversation.messages,
  ]
    .sort(
      (left, right) =>
        left.sequence -
          right.sequence ||
        left.occurred_at.localeCompare(
          right.occurred_at,
        ) ||
        left.id.localeCompare(
          right.id,
        ),
    )
    .flatMap(
      (message): AuthoredMessage[] => {
        const at =
          parse(
            message.occurred_at,
          )

        if (at === null) {
          return []
        }

        if (
          message.direction ===
            'incoming' &&
          message.author_kind ===
            'customer'
        ) {
          return [{
            message,
            author: 'customer',
            at,
          }]
        }

        // Automação (flow/bot) nunca conta como follow-up humano do
        // vendedor nem como resposta dele.
        if (
          message.direction ===
            'outgoing' &&
          message.author_kind ===
            'human_agent'
        ) {
          return [{
            message,
            author: 'seller',
            at,
          }]
        }

        return []
      },
    )
}

function calendarDayKey(
  instant: number,
): string {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone:
        BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).format(
    new Date(instant),
  )
}

function calendarDaysBetween(
  from: number,
  to: number,
): number {
  const fromDay =
    Date.parse(
      `${calendarDayKey(from)}T00:00:00Z`,
    )

  const toDay =
    Date.parse(
      `${calendarDayKey(to)}T00:00:00Z`,
    )

  return Math.round(
    (toDay - fromDay) / DAY_MS,
  )
}

const WEEKDAY_TOKENS = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
] as const

// Fim da janela que o cliente indicou dentro da semana, no calendário
// comercial: um dia da semana vale até o fim da próxima ocorrência desse
// dia ("segunda" dita na sexta = até o fim da segunda seguinte); "fim de
// semana" até o fim do domingo; "esta semana" até o fim da semana-calendário
// em que foi dita — nunca sete dias corridos.
function weekWindowEnd(
  text: string,
  demonstratedAt: number,
): number {
  const normalized =
    normalizeText(text)

  const said =
    zonedParts(demonstratedAt)

  const weekdayMatch =
    normalized.match(
      /\b(proxim[oa] )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?( que vem)?\b/,
    )

  const weekday =
    weekdayMatch?.[2]

  // "Próxima sexta" / "sexta que vem" dita numa sexta é a sexta seguinte,
  // não o próprio dia.
  const nextOccurrenceModifier =
    Boolean(
      weekdayMatch?.[1] ||
      weekdayMatch?.[3],
    )

  const endOfDayIn = (
    daysAhead: number,
  ): number =>
    zonedInstant(
      said.year,
      said.month,
      said.day + daysAhead + 1,
      0,
    )

  if (
    /\b(fim|final) de semana\b/.test(
      normalized,
    )
  ) {
    return endOfDayIn(
      (7 - said.weekday) % 7,
    )
  }

  if (weekday) {
    const target =
      WEEKDAY_TOKENS.indexOf(
        weekday as typeof WEEKDAY_TOKENS[number],
      )

    const offset =
      (target - said.weekday + 7) % 7

    return endOfDayIn(
      offset === 0 &&
        nextOccurrenceModifier
        ? 7
        : offset,
    )
  }

  // Semana-calendário de segunda a domingo.
  return endOfDayIn(
    (7 - said.weekday) % 7,
  )
}

function timeWindowExpired({
  reference,
  demonstratedAt,
  evaluatedAt,
  text,
}: {
  reference:
    SellerExecutionTimeReference
  demonstratedAt: number
  evaluatedAt: number
  text: string
}): boolean {
  if (!reference) {
    return false
  }

  const days =
    calendarDaysBetween(
      demonstratedAt,
      evaluatedAt,
    )

  switch (reference) {
    case 'same_day':
      return days >= 1
    case 'next_day':
      return days >= 2
    case 'this_week':
      return (
        evaluatedAt >=
        weekWindowEnd(
          text,
          demonstratedAt,
        )
      )
  }
}

// Calendário no fuso comercial (sem depender do fuso do servidor).
function zonedParts(
  instant: number,
): {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
  second: number
} {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hourCycle: 'h23',
      },
    ).formatToParts(
      new Date(instant),
    )

  const value = (
    type: string,
  ): string =>
    parts.find(
      part =>
        part.type === type,
    )?.value ?? '0'

  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday:
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        .indexOf(
          value('weekday'),
        ),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    second: Number(value('second')),
  }
}

function zonedOffsetMs(
  instant: number,
): number {
  const parts =
    zonedParts(instant)

  const asUtc =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )

  return (
    asUtc -
    Math.floor(instant / 1000) * 1000
  )
}

// Instante de uma hora local no fuso comercial. Dias fora do mês
// transbordam como em Date.UTC ("dia 0" = último dia do mês anterior).
function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
): number {
  const guess =
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
    )

  return (
    guess -
    zonedOffsetMs(guess)
  )
}

// Pedido explícito para o VENDEDOR retomar o contato ("me chama semana que
// vem"). Diferente de "te aviso semana que vem", em que o próximo movimento
// combinado é do cliente.
const SELLER_CONTACT_REQUEST =
  /\b(me (chama|chame|procura|procure|liga|ligue|contata|contate|aciona|cobra|cobre|lembra|lembre)|me (manda|mande) (uma )?(mensagem|msg)|fala comigo|pode me chamar|entra em contato|entre em contato|retoma comigo|retome comigo)\b/

const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  quinze: 15,
  vinte: 20,
  trinta: 30,
}

const DEFERRAL_DURATION =
  /\b(?:daqui a|daqui|em|dentro de) (\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta) (dia|dias|semana|semanas|mes|meses)\b/

const DEFERRAL_WEEKDAY =
  /\b(proxim[oa] )?(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?( que vem)?\b/

const WEEKDAY_LABELS: Record<string, string> = {
  domingo: 'no domingo',
  segunda: 'na segunda-feira',
  terca: 'na terça-feira',
  quarta: 'na quarta-feira',
  quinta: 'na quinta-feira',
  sexta: 'na sexta-feira',
  sabado: 'no sábado',
}

type DeferralPlan = {
  resume_at: number
  agreed_until: number
  seller_owes_contact: boolean
  horizon_label: string
}

// Prazo combinado num adiamento. Só texto explícito do cliente; o
// calendário é o do fuso comercial ("semana que vem" dita numa terça
// começa na segunda seguinte, não "daqui a 7 dias").
function deferralPlan(
  text: string,
  requestedAt: number,
): DeferralPlan {
  const normalized =
    normalizeText(text)

  const today =
    zonedParts(requestedAt)

  const sellerOwesContact =
    SELLER_CONTACT_REQUEST.test(
      normalized,
    )

  let resumeAt: number
  let until: number
  let label: string

  // Todo horizonte que o trace aceita como adiamento vira uma data real:
  // durações (dias/semanas/meses), dia da semana, "depois de amanhã",
  // "mais tarde", início/fim do mês, semana/mês/ano que vem. Só o que é
  // genuinamente vago ("outro dia", "depois") usa o horizonte curto padrão.
  const duration =
    normalized.match(
      DEFERRAL_DURATION,
    )

  const weekday =
    normalized.match(
      DEFERRAL_WEEKDAY,
    )

  const nextWeek =
    /\b(semana que vem|proxima semana)\b/.test(
      normalized,
    )

  const daysToNextMonday =
    ((8 - today.weekday) % 7) || 7

  const endOfDayAfter = (
    daysAhead: number,
  ): number =>
    zonedInstant(
      today.year,
      today.month,
      today.day + daysAhead + 1,
      0,
    )

  if (duration) {
    const amount =
      NUMBER_WORDS[duration[1]] ??
      Number(duration[1])

    const unit =
      duration[2]

    if (unit.startsWith('mes')) {
      // Mês de calendário, sem transbordar: "em um mês" dito em 31/01 é o
      // último dia de fevereiro, não 3 de março.
      const monthIndex =
        today.month - 1 + amount

      const targetYear =
        today.year +
        Math.floor(monthIndex / 12)

      const targetMonth =
        (monthIndex % 12) + 1

      const lastDay =
        new Date(
          Date.UTC(
            targetYear,
            targetMonth,
            0,
          ),
        ).getUTCDate()

      resumeAt =
        zonedInstant(
          targetYear,
          targetMonth,
          Math.min(
            today.day,
            lastDay,
          ),
          9,
        )

      until =
        resumeAt + 3 * DAY_MS

      label =
        amount === 1
          ? 'em um mês'
          : `em ${amount} meses`
    } else if (
      unit.startsWith('semana')
    ) {
      resumeAt =
        requestedAt +
        amount * 7 * DAY_MS

      until =
        resumeAt + 2 * DAY_MS

      label =
        amount === 1
          ? 'em uma semana'
          : `em ${amount} semanas`
    } else {
      resumeAt =
        requestedAt +
        amount * DAY_MS

      until =
        resumeAt + DAY_MS

      label =
        amount === 1
          ? 'em um dia'
          : `em ${amount} dias`
    }
  } else if (weekday) {
    const target =
      WEEKDAY_TOKENS.indexOf(
        weekday[2] as typeof WEEKDAY_TOKENS[number],
      )

    // "Sexta da semana que vem" é a sexta da PRÓXIMA semana-calendário;
    // um dia da semana dito no próprio dia é o da semana seguinte.
    const offset =
      nextWeek
        ? daysToNextMonday +
          ((target - 1 + 7) % 7)
        : ((target - today.weekday + 7) % 7) || 7

    resumeAt =
      zonedInstant(
        today.year,
        today.month,
        today.day + offset,
        9,
      )

    until =
      endOfDayAfter(offset)

    label =
      WEEKDAY_LABELS[weekday[2]] ??
      'no dia combinado'
  } else if (nextWeek) {
    resumeAt =
      zonedInstant(
        today.year,
        today.month,
        today.day + daysToNextMonday,
        9,
      )

    until =
      zonedInstant(
        today.year,
        today.month,
        today.day + daysToNextMonday + 5,
        0,
      )

    label = 'na semana seguinte'
  } else if (
    /\b(mes que vem|proximo mes|(inicio|comeco) do (proximo )?mes)\b/.test(
      normalized,
    )
  ) {
    resumeAt =
      zonedInstant(
        today.year,
        today.month + 1,
        1,
        9,
      )

    until =
      resumeAt + 10 * DAY_MS

    label = 'no mês seguinte'
  } else if (
    /\b(fim do mes|final do mes)\b/.test(
      normalized,
    )
  ) {
    resumeAt =
      zonedInstant(
        today.year,
        today.month + 1,
        0,
        9,
      )

    until =
      zonedInstant(
        today.year,
        today.month + 1,
        3,
        0,
      )

    label = 'no fim do mês'
  } else if (
    /\b(ano que vem|proximo ano)\b/.test(
      normalized,
    )
  ) {
    resumeAt =
      zonedInstant(
        today.year + 1,
        1,
        5,
        9,
      )

    until =
      resumeAt + 14 * DAY_MS

    label = 'no ano seguinte'
  } else if (
    /\b(depois das ferias|depois das festas)\b/.test(
      normalized,
    )
  ) {
    resumeAt =
      requestedAt + 30 * DAY_MS

    until = resumeAt

    label = 'depois do período que ele indicou'
  } else if (
    /\bmais (pra|para) frente\b/.test(
      normalized,
    )
  ) {
    resumeAt =
      requestedAt + 14 * DAY_MS

    until = resumeAt

    label = 'mais para frente'
  } else if (
    /\bdepois de amanha\b/.test(
      normalized,
    )
  ) {
    resumeAt =
      zonedInstant(
        today.year,
        today.month,
        today.day + 2,
        9,
      )

    until =
      endOfDayAfter(2)

    label = 'depois de amanhã'
  } else if (
    /\bamanha\b/.test(
      normalized,
    )
  ) {
    resumeAt =
      zonedInstant(
        today.year,
        today.month,
        today.day + 1,
        9,
      )

    until =
      endOfDayAfter(1)

    label = 'no dia seguinte'
  } else if (
    /\b(daqui a pouco|daqui a pouquinho|mais tarde|depois do almoco|depois do trabalho|depois do expediente|no fim do dia|no final do dia|(hoje )?a tarde|(hoje )?a noite)\b/.test(
      normalized,
    )
  ) {
    // Ainda hoje: horas, não dias.
    resumeAt =
      requestedAt +
      (
        /\bdaqui a pouc/.test(
          normalized,
        )
          ? 60 * 60 * 1000
          : 3 * 60 * 60 * 1000
      )

    until =
      Math.max(
        endOfDayAfter(0),
        resumeAt + 60 * 60 * 1000,
      )

    label = 'mais tarde, no mesmo dia'
  } else {
    resumeAt =
      requestedAt + 3 * DAY_MS

    until = resumeAt

    label = 'em alguns dias'
  }

  return {
    resume_at: resumeAt,
    // Quando o cliente pediu para ser chamado, o combinado vence um dia
    // depois do momento de retomada: dali em diante o atraso é do vendedor.
    agreed_until:
      sellerOwesContact
        ? resumeAt + DAY_MS
        : Math.max(
            until,
            resumeAt,
          ),
    seller_owes_contact:
      sellerOwesContact,
    horizon_label: label,
  }
}

// Severidade contínua da perda de continuidade. Monótona na razão
// silêncio/janela esperada e no número de tentativas sem resposta; nunca
// salta de "normal" para "reativação" num limiar único.
function continuitySeverity(
  ratio: number,
  unansweredOutbound: number,
): number {
  const ceiling =
    COMMERCIAL_TEMPORAL_POLICY
      .within_rhythm_severity_ceiling

  const base =
    ratio <= 1
      ? ceiling *
        Math.max(0, ratio)
      : ceiling +
        (1 - ceiling) *
          (
            1 -
            Math.exp(
              -(ratio - 1) /
                COMMERCIAL_TEMPORAL_POLICY
                  .continuity_decay_ratio,
            )
          )

  const streak =
    Math.max(
      0,
      unansweredOutbound - 1,
    )

  return (
    1 -
    (1 - base) *
      Math.pow(
        COMMERCIAL_TEMPORAL_POLICY
          .unanswered_outbound_factor,
        streak,
      )
  )
}

// Razão silêncio/janela em que a curva entra em "sem continuidade"
// (sem tentativas extras) — só para documentar o horizonte no contrato.
function longDormancyRatio(): number {
  const ceiling =
    COMMERCIAL_TEMPORAL_POLICY
      .within_rhythm_severity_ceiling

  const target =
    COMMERCIAL_TEMPORAL_POLICY
      .stage_thresholds
      .strong_gap

  return (
    1 -
    COMMERCIAL_TEMPORAL_POLICY
      .continuity_decay_ratio *
      Math.log(
        1 -
          (target - ceiling) /
            (1 - ceiling),
      )
  )
}

function stageForSeverity(
  severity: number,
): CommercialMomentumStage {
  const thresholds =
    COMMERCIAL_TEMPORAL_POLICY
      .stage_thresholds

  if (
    severity <=
    COMMERCIAL_TEMPORAL_POLICY
      .within_rhythm_severity_ceiling +
      1e-9
  ) {
    return 'within_rhythm'
  }

  if (
    severity <
    thresholds.early_loss
  ) {
    return 'early_loss'
  }

  if (
    severity <
    thresholds.prolonged_silence
  ) {
    return 'prolonged_silence'
  }

  if (
    severity <
    thresholds.strong_gap
  ) {
    return 'strong_gap'
  }

  return 'long_dormancy'
}

function round(
  value: number,
  digits: number,
): number {
  const factor =
    10 ** digits

  return (
    Math.round(
      value * factor,
    ) / factor
  )
}

// ---------------------------------------------------------------------------
// Frescor por engajamento RELACIONADO.
//
// RECÊNCIA DA CONVERSA != RECÊNCIA DA INTENÇÃO. Uma intenção histórica só é
// renovada por: nova declaração equivalente (o próprio sinal), reconfirmação
// afirmativa, resposta com conteúdo à ação do vendedor que deu sequência à
// intenção, fala do cliente sobre o mesmo assunto, adiamento combinado sobre
// ela ou reação entusiasmada à ação do vendedor. Saudação, agradecimento,
// "ok" e emoji nunca renovam.
// ---------------------------------------------------------------------------
const GENERIC_SUBJECT_WORDS =
  new Set([
    'obrigado', 'obrigada', 'tudo', 'sobre', 'quero', 'queria', 'gostaria', 'voces',
    'pode', 'posso', 'podemos', 'fazer', 'favor', 'entao', 'agora', 'depois', 'ainda',
    'mesmo', 'tambem', 'estou', 'estava', 'aqui', 'dessa', 'desse', 'nessa', 'nesse',
    'muito', 'menos', 'porque', 'quando', 'quais', 'tenho', 'temos', 'seria', 'vamos',
    'semana', 'manha', 'tarde', 'noite', 'hoje', 'ontem', 'amanha', 'bom', 'certo',
    'claro', 'perfeito', 'combinado', 'beleza', 'otimo', 'otima', 'abraco', 'mensagem',
    'desculpa', 'desculpe', 'consegue', 'consigo', 'saber', 'falar', 'tchau',
  ])

function subjectStems(
  text: string,
): Set<string> {
  return new Set(
    normalizeText(text)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(
        token =>
          token.length >= 5 &&
          !GENERIC_SUBJECT_WORDS.has(
            token,
          ),
      )
      .map(
        token =>
          token.slice(0, 5),
      ),
  )
}

const OPEN_QUESTION_START =
  /^(qual|quais|quando|onde|como|quanto|quanta|quantos|quantas|que horas|que dia|em que|de que|por que|porque|o que)\b/

const ANSWER_CONTENT =
  /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|hoje|amanha|manha|tarde|noite|\d{1,2}\s*(h|hs|hrs?|horas?)\b|\d{1,2}:\d{2}|primeir[oa]|segund[oa]|terceir[oa]|opcao|prefiro|pode ser|esse|essa|melhor pra mim|melhor para mim)/

const SHORT_ANSWER =
  /^(sim|pode|claro|isso|combinado|fechado|com certeza|quero|tenho|bora|vamos|nao|ainda nao|agora nao)\b/

function lastQuestionClause(
  texts: string[],
): { open: boolean } | null {
  const joined =
    texts.join(' ')

  const questionEnd =
    joined.lastIndexOf('?')

  if (questionEnd < 0) {
    return null
  }

  const before =
    joined.slice(
      0,
      questionEnd,
    )

  const clause =
    normalizeText(
      before
        .split(/[.!?\n,;]/)
        .pop() ?? '',
    )
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  return {
    open:
      OPEN_QUESTION_START.test(
        clause,
      ),
  }
}

function answersSellerQuestion(
  sellerTexts: string[],
  customerText: string,
): boolean {
  const question =
    lastQuestionClause(
      sellerTexts,
    )

  if (!question) {
    return false
  }

  const normalized =
    normalizeText(customerText)
      .replace(/[^a-z0-9:\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  if (
    ANSWER_CONTENT.test(
      normalized,
    )
  ) {
    return true
  }

  return (
    !question.open &&
    SHORT_ANSWER.test(
      normalized,
    )
  )
}

function latestRelatedEngagement({
  messages,
  trace,
  signals,
  intentSignal,
  demonstratedAt,
}: {
  messages: AuthoredMessage[]
  trace: SellerExecutionTrace
  signals:
    SellerExecutionCustomerSignal[]
  intentSignal:
    SellerExecutionCustomerSignal
  demonstratedAt: number
}): {
  at: number
  reason:
    CommercialIntentRefreshReason
} | null {
  const signalById =
    new Map(
      signals.map(
        signal => [
          signal.message_id,
          signal,
        ],
      ),
    )

  const eventById =
    new Map(
      trace.events.map(
        event => [
          event.message_id,
          event,
        ],
      ),
    )

  const intentMessage =
    messages.find(
      item =>
        item.message.id ===
          intentSignal.message_id,
    )

  const contextStems =
    subjectStems(
      intentMessage
        ? messageText(
            intentMessage.message,
          )
        : '',
    )

  let latest: {
    at: number
    reason:
      CommercialIntentRefreshReason
  } | null = null

  let sellerBurst: string[] = []
  let sellerFollowsIntent = false
  let awaitingFirstReply = false

  for (const item of messages) {
    if (
      item.at < demonstratedAt ||
      item.message.id ===
        intentSignal.message_id
    ) {
      continue
    }

    const text =
      messageText(item.message)

    if (
      item.author === 'seller'
    ) {
      if (!awaitingFirstReply) {
        sellerBurst = []
        sellerFollowsIntent = false
      }

      awaitingFirstReply = true
      sellerBurst.push(text)

      const event =
        eventById.get(
          item.message.id,
        )

      if (
        event &&
        (
          event.sequence
            .follows_previous_context ===
            true ||
          event.action_type ===
            'reengagement'
        )
      ) {
        sellerFollowsIntent = true
      }

      for (
        const stem of subjectStems(
          text,
        )
      ) {
        contextStems.add(stem)
      }

      continue
    }

    const firstReply =
      awaitingFirstReply

    awaitingFirstReply = false

    const signal =
      signalById.get(
        item.message.id,
      )

    if (
      signal?.kind ===
        'disengaged'
    ) {
      break
    }

    let reason:
      CommercialIntentRefreshReason | null =
        null

    if (
      signal?.kind ===
        'deferral'
    ) {
      reason =
        'deferral_agreement'
    } else if (
      expressesAffirmativeContinuation(
        text,
      )
    ) {
      reason = 'reconfirmation'
    } else if (
      isCustomerPhaticMessage(text)
    ) {
      reason = null
    } else if (
      firstReply &&
      sellerFollowsIntent &&
      answersSellerQuestion(
        sellerBurst,
        text,
      )
    ) {
      reason =
        'answer_to_seller_move'
    } else if (
      firstReply &&
      sellerFollowsIntent &&
      signal?.expressed_enthusiasm
    ) {
      reason =
        'enthusiastic_reaction'
    } else if (
      Array.from(
        subjectStems(text),
      ).some(
        stem =>
          contextStems.has(stem),
      )
    ) {
      reason = 'same_subject'
    }

    if (reason) {
      latest = {
        at: item.at,
        reason,
      }
    }
  }

  return latest
}

export function formatCommercialDuration(
  ms: number,
): string {
  const minutes =
    Math.max(
      1,
      Math.round(ms / 60_000),
    )

  if (minutes < 60) {
    return minutes === 1
      ? '1 minuto'
      : `${minutes} minutos`
  }

  const hours =
    Math.round(
      ms / 3_600_000,
    )

  if (hours < 48) {
    return hours <= 1
      ? '1 hora'
      : `${hours} horas`
  }

  const days =
    Math.round(ms / DAY_MS)

  return `${days} dias`
}

function latencyAssessment({
  latencyMs,
  highIntent,
}: {
  latencyMs: number | null
  highIntent: boolean
}): CommercialResponseTimingAssessment {
  if (latencyMs === null) {
    return 'unknown'
  }

  const timely =
    highIntent
      ? COMMERCIAL_TEMPORAL_POLICY
          .high_intent_timely_response_ms
      : COMMERCIAL_TEMPORAL_POLICY
          .timely_response_ms

  if (latencyMs <= timely) {
    return 'timely'
  }

  if (
    latencyMs <=
    COMMERCIAL_TEMPORAL_POLICY
      .delayed_response_ms
  ) {
    return 'delayed'
  }

  return 'very_delayed'
}

function momentumLabel({
  state,
  stage,
  responsible,
  agreedPause,
  contactOptOut,
}: {
  state: CommercialMomentumState
  stage: CommercialMomentumStage
  responsible:
    CommercialTemporalResponsible
  agreedPause:
    CommercialAgreedPause | null
  contactOptOut: boolean
}): string {
  if (contactOptOut) {
    return 'Cliente pediu para não ser mais contatado'
  }

  if (
    agreedPause &&
    responsible === 'agreed_pause'
  ) {
    return 'Pausa combinada com o cliente'
  }

  if (
    agreedPause &&
    agreedPause.seller_owes_contact &&
    responsible === 'seller' &&
    state !== 'dormant'
  ) {
    return 'Momento combinado para o vendedor retomar'
  }

  switch (state) {
    case 'active':
      return 'Conversa ativa'
    case 'awaiting_seller':
      return 'Cliente aguardando resposta do vendedor'
    case 'awaiting_customer':
      return 'Aguardando o cliente, dentro do ritmo normal'
    case 'cooling':
      return stage === 'early_loss'
        ? 'Conversa começando a esfriar'
        : stage === 'prolonged_silence'
          ? 'Conversa esfriando — silêncio prolongado'
          : stage === 'strong_gap'
            ? 'Conversa fria — lacuna forte de continuidade'
            : 'Conversa esfriando'
    case 'dormant':
      return 'Oportunidade sem continuidade'
    case 'closed':
      return 'Cliente encerrou esta oportunidade'
    case 'no_history':
      return 'Sem histórico suficiente'
  }
}

function intentFreshnessLabel(
  freshness: CommercialIntentFreshness,
): string | null {
  switch (freshness) {
    case 'current':
      return 'Intenção atual'
    case 'aging':
      return 'Intenção recente, ainda não reconfirmada'
    case 'stale':
      return 'Intenção antiga — precisa ser reconfirmada antes de ser tratada como atual'
    case 'closed':
      return 'Intenção encerrada pelo cliente'
    case 'none':
      return null
  }
}

function findLongestGap(
  messages: AuthoredMessage[],
): CommercialTemporalGap | null {
  let longest:
    CommercialTemporalGap | null =
      null

  for (
    let index = 1;
    index < messages.length;
    index += 1
  ) {
    const previous =
      messages[index - 1]

    const current =
      messages[index]

    const gap =
      current.at - previous.at

    if (
      !longest ||
      gap > longest.gap_ms
    ) {
      longest = {
        from_message_id:
          previous.message.id,
        to_message_id:
          current.message.id,
        from_author:
          previous.author,
        to_author:
          current.author,
        gap_ms:
          Math.max(0, gap),
      }
    }
  }

  return longest
}

function customerReplyLatencies(
  messages: AuthoredMessage[],
): number[] {
  const latencies: number[] = []

  for (
    let index = 1;
    index < messages.length;
    index += 1
  ) {
    const previous =
      messages[index - 1]

    const current =
      messages[index]

    if (
      previous.author ===
        'seller' &&
      current.author ===
        'customer'
    ) {
      latencies.push(
        Math.max(
          0,
          current.at -
            previous.at,
        ),
      )
    }
  }

  return latencies
}

function latestTransitionAt(
  messages: AuthoredMessage[],
): number | null {
  for (
    let index =
      messages.length - 1;
    index >= 1;
    index -= 1
  ) {
    if (
      messages[index].author !==
      messages[index - 1].author
    ) {
      return messages[index].at
    }
  }

  return null
}

function highIntentResponse({
  trace,
  signals,
}: {
  trace: SellerExecutionTrace
  signals:
    SellerExecutionCustomerSignal[]
}): CommercialHighIntentResponse | null {
  const request =
    [...signals]
      .reverse()
      .find(
        signal =>
          signal.confidence ===
            'high' &&
          HIGH_INTENT_KINDS.has(
            signal.kind,
          ),
      )

  if (!request) {
    return null
  }

  const requestedAt =
    parse(
      request.occurred_at,
    )

  if (requestedAt === null) {
    return null
  }

  const laterEvents =
    trace.events.filter(
      event => {
        const at =
          parse(
            event.occurred_at,
          )

        return (
          at !== null &&
          at >= requestedAt
        )
      },
    )

  const firstResponse =
    laterEvents[0] ?? null

  const effective =
    laterEvents.find(
      event =>
        event.sequence
          .follows_previous_context ===
          true &&
        event.action_type !==
          'rapport_opening' &&
        event.action_type !==
          'confirmation',
    ) ?? null

  const firstLatency =
    firstResponse
      ? Math.max(
          0,
          (
            parse(
              firstResponse.occurred_at,
            ) ?? requestedAt
          ) - requestedAt,
        )
      : null

  const effectiveLatency =
    effective
      ? Math.max(
          0,
          (
            parse(
              effective.occurred_at,
            ) ?? requestedAt
          ) - requestedAt,
        )
      : null

  const firstAddressed =
    firstResponse
      ? effective?.message_id ===
          firstResponse.message_id ||
        (
          effective !== null &&
          firstResponse.turn_id ===
            effective.turn_id
        )
      : null

  return {
    customer_message_id:
      request.message_id,
    intent_kind:
      request.kind,
    time_reference:
      request.time_reference,
    requested_at:
      request.occurred_at,
    first_response_message_id:
      firstResponse?.message_id ??
      null,
    first_response_latency_ms:
      firstLatency,
    first_response_addressed:
      firstAddressed,
    effective_response_message_id:
      effective?.message_id ??
      null,
    effective_response_latency_ms:
      effectiveLatency,
    assessment:
      effective
        ? latencyAssessment({
            latencyMs:
              effectiveLatency,
            highIntent: true,
          })
        : firstResponse
          ? 'unanswered'
          : 'unknown',
  }
}

function latestRespondedTurn(
  turns: SellerExecutionTurn[],
): SellerExecutionTurn | null {
  return [...turns]
    .reverse()
    .find(
      turn =>
        turn
          .responds_to_customer_message_ids
          .length > 0,
    ) ?? null
}

function unique(
  values: string[],
): string[] {
  return Array.from(
    new Set(values),
  )
}

export function buildCommercialTemporalContext({
  diagnostic_input,
  trace,
  evaluated_at,
  operational = null,
}: {
  diagnostic_input:
    CompanionDiagnosticInput
  trace: SellerExecutionTrace
  evaluated_at?: string | null
  operational?:
    CommercialTemporalOperationalContext | null
}): CommercialTemporalContext {
  const evaluatedAt =
    parse(evaluated_at) ??
    parse(
      diagnostic_input
        .reference_time,
    ) ??
    Date.now()

  const messages =
    authoredMessages(
      diagnostic_input,
    )

  const customerMessages =
    messages.filter(
      item =>
        item.author ===
          'customer',
    )

  const sellerMessages =
    messages.filter(
      item =>
        item.author ===
          'seller',
    )

  const first =
    messages[0] ?? null

  const last =
    messages[
      messages.length - 1
    ] ?? null

  const lastCustomer =
    customerMessages[
      customerMessages.length - 1
    ] ?? null

  const lastSeller =
    sellerMessages[
      sellerMessages.length - 1
    ] ?? null

  const since = (
    value: number | null,
  ): number | null =>
    value === null
      ? null
      : Math.max(
          0,
          evaluatedAt - value,
        )

  const transitionAt =
    latestTransitionAt(
      messages,
    )

  // -------------------------------------------------------------------
  // Ritmo observado
  // -------------------------------------------------------------------
  const customerLatencies =
    customerReplyLatencies(
      messages,
    )

  const sellerLatencies =
    trace.turns
      .map(
        turn =>
          turn.response_latency_ms,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value === 'number',
      )

  const customerMedian =
    median(customerLatencies)

  let customerRhythmWindow:
    number =
      COMMERCIAL_TEMPORAL_POLICY
        .default_expected_reply_window_ms

  let cadenceBasis:
    CommercialTemporalContext[
      'cadence'
    ]['basis'] =
      'default'

  if (
    customerLatencies.length >= 2 &&
    customerMedian !== null
  ) {
    customerRhythmWindow =
      clamp(
        customerMedian *
          COMMERCIAL_TEMPORAL_POLICY
            .observed_cadence_multiplier,
        COMMERCIAL_TEMPORAL_POLICY
          .min_expected_reply_window_ms,
        COMMERCIAL_TEMPORAL_POLICY
          .max_expected_reply_window_ms,
      )
    cadenceBasis = 'observed'
  }

  const signals =
    trace.customer_signals

  const latestKindSignal =
    [...signals]
      .reverse()
      .find(
        signal =>
          signal.kind !==
            'unknown',
      ) ?? null

  const closed =
    latestKindSignal?.kind ===
      'disengaged'

  const contactOptOut =
    closed &&
    Boolean(
      latestKindSignal
        ?.no_contact_requested,
    )

  const unansweredTurns =
    lastCustomer
      ? trace.turns.filter(
          turn => {
            const at =
              parse(
                turn.started_at,
              )

            return (
              at !== null &&
              at > lastCustomer.at
            )
          },
        )
      : trace.turns

  const sellerMessagesSinceCustomer =
    lastCustomer
      ? sellerMessages.filter(
          item =>
            item.at >
            lastCustomer.at,
        ).length
      : sellerMessages.length

  // -------------------------------------------------------------------
  // Pausa combinada com o cliente ("me chama semana que vem")
  // -------------------------------------------------------------------
  let agreedPause:
    CommercialAgreedPause | null =
      null

  let pauseRequestedAt:
    number | null =
      null

  let pauseResumeAt:
    number | null =
      null

  let pauseUntil:
    number | null =
      null

  if (
    latestKindSignal?.kind ===
      'deferral'
  ) {
    const deferralMessage =
      customerMessages.find(
        item =>
          item.message.id ===
            latestKindSignal.message_id,
      )

    const requestedAt =
      parse(
        latestKindSignal.occurred_at,
      )

    // O combinado só vale enquanto o cliente não voltou com conteúdo.
    const customerCameBack =
      requestedAt !== null &&
      customerMessages.some(
        item =>
          item.at > requestedAt &&
          !isCustomerPhaticMessage(
            messageText(
              item.message,
            ),
          ),
      )

    if (
      deferralMessage &&
      requestedAt !== null &&
      !customerCameBack
    ) {
      const plan =
        deferralPlan(
          messageText(
            deferralMessage.message,
          ),
          requestedAt,
        )

      pauseRequestedAt =
        requestedAt
      pauseResumeAt =
        plan.resume_at
      pauseUntil =
        plan.agreed_until

      agreedPause = {
        requested_message_id:
          deferralMessage.message.id,
        requested_at:
          new Date(
            requestedAt,
          ).toISOString(),
        resume_at:
          new Date(
            plan.resume_at,
          ).toISOString(),
        agreed_until:
          new Date(
            plan.agreed_until,
          ).toISOString(),
        seller_owes_contact:
          plan.seller_owes_contact,
        horizon_label:
          plan.horizon_label,
        status:
          evaluatedAt <
          plan.resume_at
            ? 'in_progress'
            : evaluatedAt <=
                plan.agreed_until
              ? 'due'
              : 'overdue',
      }

      cadenceBasis =
        'deferral'
    }
  }

  // -------------------------------------------------------------------
  // Intenção: histórica vs atual
  // -------------------------------------------------------------------
  const latestCommercialSignal =
    [...signals]
      .reverse()
      .find(
        signal =>
          COMMERCIAL_INTENT_KINDS.has(
            signal.kind,
          ),
      ) ?? null

  // Reconfirmação fraca ("ainda tenho interesse, vamos seguir?") não
  // substitui a intenção mais forte que ela reconfirma: ela a RENOVA — mantém
  // tipo e confiança da intenção forte, mas o momento e o horizonte de tempo
  // passam a ser os da reconfirmação ("quero contratar amanhã" + dois dias
  // depois "ainda tenho interesse, quero ir hoje" = intenção de hoje).
  const intentSignal:
    SellerExecutionCustomerSignal | null =
    (() => {
      if (
        !latestCommercialSignal ||
        latestCommercialSignal.confidence ===
          'high'
      ) {
        return latestCommercialSignal
      }

      const message =
        customerMessages.find(
          item =>
            item.message.id ===
              latestCommercialSignal.message_id,
        )

      if (
        !message ||
        !expressesAffirmativeContinuation(
          messageText(
            message.message,
          ),
        )
      ) {
        return latestCommercialSignal
      }

      const rank = {
        low: 0,
        medium: 1,
        high: 2,
      } as const

      const stronger =
          [...signals]
          .reverse()
          .find(
            signal =>
              signal !==
                latestCommercialSignal &&
              COMMERCIAL_INTENT_KINDS.has(
                signal.kind,
              ) &&
              rank[signal.confidence] >
                rank[
                  latestCommercialSignal
                    .confidence
                ] &&
              (
                parse(
                  signal.occurred_at,
                ) ?? 0
              ) <=
                (
                  parse(
                    latestCommercialSignal
                      .occurred_at,
                  ) ?? 0
                ),
          ) ?? null

      return stronger
        ? {
            ...latestCommercialSignal,
            kind: stronger.kind,
            confidence:
              stronger.confidence,
          }
        : latestCommercialSignal
    })()

  const intentDemonstratedAt =
    intentSignal
      ? parse(
          intentSignal.occurred_at,
        ) ?? evaluatedAt
      : null

  const intentExpired =
    intentSignal &&
    intentDemonstratedAt !== null
      ? timeWindowExpired({
          reference:
            intentSignal.time_reference,
          demonstratedAt:
            intentDemonstratedAt,
          evaluatedAt,
          text:
            (() => {
              const message =
                customerMessages.find(
                  item =>
                    item.message.id ===
                      intentSignal.message_id,
                )

              return message
                ? messageText(
                    message.message,
                  )
                : ''
            })(),
        })
      : false

  // Urgência declarada pelo próprio cliente encurta o ritmo esperado
  // enquanto a janela dele está aberta ("quero contratar hoje").
  const timeSensitiveIntent =
    Boolean(
      intentSignal &&
      !intentExpired &&
      HIGH_INTENT_KINDS.has(
        intentSignal.kind,
      ) &&
      (
        intentSignal.time_reference ===
          'same_day' ||
        intentSignal.time_reference ===
          'next_day'
      ),
    )

  const customerExpected =
    timeSensitiveIntent
      ? Math.min(
          customerRhythmWindow,
          COMMERCIAL_TEMPORAL_POLICY
            .time_sensitive_customer_window_ms,
        )
      : customerRhythmWindow

  let intent:
    CommercialTemporalContext['intent'] =
      null

  if (
    intentSignal &&
    intentDemonstratedAt !== null
  ) {
    const demonstratedAt =
      intentDemonstratedAt

    const refresh =
      closed
        ? null
        : latestRelatedEngagement({
            messages,
            trace,
            signals,
            intentSignal,
            demonstratedAt,
          })

    const relatedAt =
      Math.max(
        demonstratedAt,
        refresh?.at ??
          demonstratedAt,
      )

    const relatedAge =
      Math.max(
        0,
        evaluatedAt - relatedAt,
      )

    // Enquanto o combinado vale, a intenção envelhece mais devagar.
    const decayAge =
      pauseRequestedAt !== null &&
      pauseUntil !== null &&
      relatedAt >= pauseRequestedAt
        ? Math.max(
            0,
            Math.min(
              evaluatedAt,
              pauseUntil,
            ) - relatedAt,
          ) *
            COMMERCIAL_TEMPORAL_POLICY
              .agreed_pause_decay_weight +
          Math.max(
            0,
            evaluatedAt - pauseUntil,
          )
        : relatedAge

    const vitality =
      closed
        ? 0
        : COMMERCIAL_TEMPORAL_POLICY
            .intent_confidence_base[
              intentSignal.confidence
            ] *
          Math.exp(
            -decayAge /
              (
                customerExpected *
                COMMERCIAL_TEMPORAL_POLICY
                  .intent_decay_windows
              ),
          ) *
          (
            intentExpired
              ? COMMERCIAL_TEMPORAL_POLICY
                  .intent_expired_window_factor
              : 1
          ) *
          Math.pow(
            COMMERCIAL_TEMPORAL_POLICY
              .unanswered_outbound_factor,
            Math.max(
              0,
              unansweredTurns.length - 1,
            ),
          )

    const freshness:
      CommercialIntentFreshness =
        closed
          ? 'closed'
          : vitality >=
              COMMERCIAL_TEMPORAL_POLICY
                .intent_current_vitality
            ? 'current'
            : vitality >=
                COMMERCIAL_TEMPORAL_POLICY
                  .intent_aging_vitality
              ? 'aging'
              : 'stale'

    intent = {
      kind:
        intentSignal.kind,
      confidence:
        intentSignal.confidence,
      evidence_message_id:
        intentSignal.message_id,
      demonstrated_at:
        intentSignal.occurred_at,
      last_engagement_at:
        new Date(
          relatedAt,
        ).toISOString(),
      freshness,
      time_reference:
        intentSignal.time_reference,
      time_window_expired:
        intentExpired,
      expressed_enthusiasm:
        signals.some(
          signal =>
            signal.expressed_enthusiasm &&
            (
              parse(
                signal.occurred_at,
              ) ?? 0
            ) >=
              demonstratedAt -
                COMMERCIAL_TEMPORAL_POLICY
                  .active_exchange_window_ms,
        ),
      needs_reconfirmation:
        !closed &&
        (
          vitality <
            COMMERCIAL_TEMPORAL_POLICY
              .intent_reconfirmation_vitality ||
          (
            intentExpired &&
            vitality <
              COMMERCIAL_TEMPORAL_POLICY
                .intent_expired_reconfirmation_vitality
          )
        ),
      vitality:
        round(vitality, 3),
      related_age_ms:
        relatedAge,
      refreshed_by:
        refresh?.reason ??
        'new_statement',
    }
  }

  // -------------------------------------------------------------------
  // Momentum progressivo e responsabilidade
  // -------------------------------------------------------------------
  const reasonCodes: string[] = []
  const factors: string[] = []

  let state:
    CommercialMomentumState =
      'no_history'

  let waitingOn:
    CommercialTemporalWaitingOn =
      'unknown'

  let responsible:
    CommercialTemporalResponsible =
      'unknown'

  let waitingSince:
    number | null =
      null

  let silenceMs:
    number | null =
      null

  let expectedMs:
    number | null =
      null

  let expectedBasis:
    CommercialTemporalProgression[
      'expected_window_basis'
    ] = null

  let ratio:
    number | null =
      null

  let severity = 0

  let owedResponse:
    CommercialTemporalProgression[
      'owed_response'
    ] = null

  let confidence:
    SellerExecutionConfidence =
      cadenceBasis === 'observed'
        ? 'high'
        : 'medium'

  const rhythmBasis:
    CommercialTemporalProgression[
      'expected_window_basis'
    ] =
      timeSensitiveIntent
        ? 'time_sensitive_intent'
        : cadenceBasis === 'observed'
          ? 'observed'
          : 'default'

  factors.push(
    cadenceBasis === 'observed'
      ? 'customer_rhythm_observed'
      : 'default_reply_rhythm',
  )

  if (timeSensitiveIntent) {
    factors.push(
      'customer_time_sensitive_intent',
    )
  }

  const pendingCustomerBurst =
    (() => {
      if (
        !last ||
        last.author !==
          'customer'
      ) {
        return [] as AuthoredMessage[]
      }

      const burst: AuthoredMessage[] = []

      for (
        let index =
          messages.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          messages[index].author !==
            'customer'
        ) {
          break
        }

        burst.unshift(
          messages[index],
        )
      }

      return burst
    })()

  const pendingCustomerBurstStart =
    pendingCustomerBurst[0]?.at ??
    null

  const lastBurstIsPauseRequest =
    agreedPause !== null &&
    pendingCustomerBurst.some(
      item =>
        item.message.id ===
          agreedPause?.requested_message_id,
    )

  // Pedido de pausa acabou de chegar: o vendedor ainda deve confirmar o
  // combinado. Depois disso, o combinado vale por si.
  const pauseAcknowledgementPending =
    lastBurstIsPauseRequest &&
    (since(
      pendingCustomerBurstStart,
    ) ?? 0) <=
      COMMERCIAL_TEMPORAL_POLICY
        .active_exchange_window_ms

  const pauseGoverns =
    agreedPause !== null &&
    pauseRequestedAt !== null &&
    pauseResumeAt !== null &&
    pauseUntil !== null &&
    !pauseAcknowledgementPending &&
    (
      last?.author === 'seller' ||
      lastBurstIsPauseRequest
    )

  if (!last) {
    state = 'no_history'
    confidence = 'low'
  } else if (closed) {
    state = 'closed'
    waitingOn = 'none'
    responsible = 'none'
    waitingSince =
      parse(
        latestKindSignal?.occurred_at,
      )
    reasonCodes.push(
      'customer_explicitly_disengaged',
    )
  } else if (
    pauseGoverns &&
    pauseRequestedAt !== null &&
    pauseResumeAt !== null &&
    pauseUntil !== null &&
    agreedPause
  ) {
    factors.push(
      'agreed_pause',
    )

    const pauseLength =
      Math.max(
        60_000,
        pauseUntil -
          pauseRequestedAt,
      )

    silenceMs =
      since(pauseRequestedAt)

    expectedMs = pauseLength
    expectedBasis =
      'agreed_pause'

    if (
      evaluatedAt <= pauseUntil
    ) {
      ratio =
        (silenceMs ?? 0) /
        pauseLength

      severity =
        continuitySeverity(
          ratio,
          0,
        )

      responsible =
        agreedPause.seller_owes_contact &&
        evaluatedAt >=
          pauseResumeAt
          ? 'seller'
          : 'agreed_pause'
    } else {
      ratio =
        1 +
        (evaluatedAt - pauseUntil) /
          customerExpected

      responsible =
        agreedPause.seller_owes_contact
          ? 'seller'
          : 'customer'

      severity =
        continuitySeverity(
          ratio,
          responsible === 'customer'
            ? unansweredTurns.length
            : 0,
        )

      factors.push(
        'agreed_pause_elapsed',
      )
    }

    waitingOn =
      responsible === 'seller'
        ? 'seller'
        : responsible === 'customer'
          ? 'customer'
          : 'none'

    waitingSince =
      responsible === 'seller'
        ? pauseResumeAt
        : pauseRequestedAt

    reasonCodes.push(
      responsible === 'agreed_pause'
        ? 'customer_deferral_in_progress'
        : responsible === 'seller'
          ? 'agreed_recontact_due'
          : 'agreed_pause_elapsed',
    )
  } else if (
    last.author ===
      'customer'
  ) {
    waitingOn = 'seller'
    responsible = 'seller'
    waitingSince =
      pendingCustomerBurstStart

    const wait =
      since(waitingSince) ?? 0

    silenceMs = wait
    expectedMs =
      customerExpected
    expectedBasis =
      rhythmBasis
    ratio =
      wait / customerExpected

    severity =
      continuitySeverity(
        ratio,
        0,
      )

    const pendingIntent =
      signals
        .filter(
          signal =>
            pendingCustomerBurst.some(
              item =>
                item.message.id ===
                  signal.message_id,
            ),
        )
        .find(
          signal =>
            signal.confidence ===
              'high' &&
            HIGH_INTENT_KINDS.has(
              signal.kind,
            ),
        ) ?? null

    const owedBasis =
      pendingIntent?.time_reference ===
        'same_day'
        ? 'time_sensitive_intent'
        : pendingIntent
          ? 'high_intent'
          : 'standard'

    const owedExpected =
      owedBasis === 'standard'
        ? COMMERCIAL_TEMPORAL_POLICY
            .seller_standard_response_window_ms
        : COMMERCIAL_TEMPORAL_POLICY
            .seller_high_intent_response_window_ms

    const overdueRatio =
      wait / owedExpected

    owedResponse = {
      owner: 'seller',
      expected_ms:
        owedExpected,
      elapsed_ms: wait,
      overdue_ratio:
        round(overdueRatio, 2),
      severity:
        round(
          overdueRatio <= 1
            ? 0
            : 1 -
              Math.exp(
                -(overdueRatio - 1) /
                  COMMERCIAL_TEMPORAL_POLICY
                    .owed_response_decay_ratio,
              ),
          3,
        ),
      basis: owedBasis,
    }

    factors.push(
      overdueRatio <= 1
        ? 'seller_response_within_window'
        : 'seller_response_overdue',
    )

    reasonCodes.push(
      wait <=
        COMMERCIAL_TEMPORAL_POLICY
          .active_exchange_window_ms &&
        overdueRatio <= 1
        ? 'customer_spoke_last_recently'
        : 'seller_response_late',
    )
  } else {
    waitingOn = 'customer'
    responsible = 'customer'
    waitingSince =
      lastSeller?.at ?? null

    const firstUnanswered =
      sellerMessages.find(
        item =>
          !lastCustomer ||
          item.at > lastCustomer.at,
      ) ?? null

    silenceMs =
      since(
        firstUnanswered?.at ??
          null,
      ) ?? 0

    expectedMs =
      customerExpected
    expectedBasis =
      rhythmBasis
    ratio =
      silenceMs /
      customerExpected

    severity =
      continuitySeverity(
        ratio,
        unansweredTurns.length,
      )

    if (!lastCustomer) {
      reasonCodes.push(
        'customer_never_replied',
      )
    }

    if (
      unansweredTurns.length >= 2
    ) {
      reasonCodes.push(
        'seller_outbound_streak_without_reply',
      )
      factors.push(
        'unanswered_outbound_streak',
      )
    }

    const lastUnanswered =
      unansweredTurns[
        unansweredTurns.length - 1
      ] ?? null

    if (
      lastUnanswered?.action_types.some(
        action =>
          action ===
            'scheduling_open_question' ||
          action ===
            'scheduling_guided_choice' ||
          action ===
            'close_request',
      )
    ) {
      factors.push(
        'awaiting_answer_to_commitment_ask',
      )
    }
  }

  const sla =
    operational?.sla ?? null

  if (
    sla?.configured &&
    sla.applicable &&
    sla.risk === 'high' &&
    (
      responsible === 'seller' ||
      responsible === 'customer'
    )
  ) {
    severity =
      1 -
      (1 - severity) *
        COMMERCIAL_TEMPORAL_POLICY
          .sla_risk_factor
    factors.push(
      'stage_sla_risk_high',
    )
  }

  if (
    intentExpired
  ) {
    factors.push(
      'intent_time_window_expired',
    )
  }

  let stage:
    CommercialMomentumStage =
      !last
        ? 'no_history'
        : closed
          ? 'closed'
          : stageForSeverity(
              severity,
            )

  if (
    last &&
    !closed
  ) {
    if (
      responsible ===
        'agreed_pause'
    ) {
      state =
        'awaiting_customer'
    } else if (
      responsible ===
        'customer'
    ) {
      state =
        stage === 'within_rhythm'
          ? 'awaiting_customer'
          : stage === 'long_dormancy'
            ? 'dormant'
            : 'cooling'

      reasonCodes.push(
        stage === 'within_rhythm'
          ? 'within_expected_reply_window'
          : stage === 'long_dormancy'
            ? 'customer_silence_beyond_dormancy_horizon'
            : 'customer_silence_beyond_expected_window',
      )
    } else if (
      responsible ===
        'seller'
    ) {
      state =
        stage === 'within_rhythm' ||
        stage === 'early_loss'
          ? 'awaiting_seller'
          : stage === 'long_dormancy'
            ? 'dormant'
            : 'cooling'

      if (
        state === 'cooling'
      ) {
        reasonCodes.push(
          'customer_waiting_long_for_seller',
        )
      } else if (
        state === 'dormant'
      ) {
        reasonCodes.push(
          'seller_left_customer_without_response',
        )
      }
    }
  }

  // Troca bidirecional recente vence qualquer leitura de silêncio quando
  // o vendedor acabou de responder. Se o cliente falou por último, o estado
  // informativo é "cliente aguardando o vendedor", não "ativa".
  if (
    state !== 'closed' &&
    last?.author === 'seller' &&
    transitionAt !== null &&
    evaluatedAt - transitionAt <=
      COMMERCIAL_TEMPORAL_POLICY
        .active_exchange_window_ms &&
    lastCustomer &&
    evaluatedAt - lastCustomer.at <=
      COMMERCIAL_TEMPORAL_POLICY
        .active_exchange_window_ms
  ) {
    state = 'active'
    reasonCodes.push(
      'recent_bidirectional_exchange',
    )
  }

  // O snapshot comercial pode estar atrás da conversa viva (mensagens
  // ainda não analisadas). Nesse caso não afirmamos dormência.
  const relationship =
    operational?.relationship ??
    null

  const liveLatest =
    Math.max(
      parse(
        relationship
          ?.latest_customer_message_at,
      ) ?? -Infinity,
      parse(
        relationship
          ?.latest_seller_message_at,
      ) ?? -Infinity,
    )

  const newerActivityOutsideSnapshot =
    Number.isFinite(liveLatest) &&
    last !== null &&
    liveLatest > last.at + 1000

  if (
    newerActivityOutsideSnapshot
  ) {
    confidence = 'low'
    reasonCodes.push(
      'newer_activity_pending_analysis',
    )
    factors.push(
      'newer_activity_outside_snapshot',
    )

    if (
      evaluatedAt - liveLatest <=
      COMMERCIAL_TEMPORAL_POLICY
        .active_exchange_window_ms &&
      (
        state === 'dormant' ||
        state === 'cooling'
      )
    ) {
      state = 'active'
      stage = 'within_rhythm'
    }
  }

  // -------------------------------------------------------------------
  // Próximo movimento sustentado pelo tempo
  // -------------------------------------------------------------------
  const reactivationReasons: string[] = []

  let mode:
    CommercialReactivationMode =
      'none'

  const sinceSeller =
    since(
      lastSeller?.at ?? null,
    )

  if (state === 'closed') {
    mode = 'respect_closure'
    reactivationReasons.push(
      contactOptOut
        ? 'customer_requested_no_contact'
        : 'customer_closed_opportunity',
    )
  } else if (
    state === 'active'
  ) {
    mode =
      waitingOn === 'seller'
        ? 'respond_now'
        : 'none'
  } else if (
    responsible ===
      'agreed_pause'
  ) {
    mode = 'wait'
    reactivationReasons.push(
      'agreed_pause_in_progress',
    )
  } else if (
    waitingOn === 'seller' &&
    agreedPause &&
    pauseGoverns
  ) {
    // O cliente pediu para ser chamado e o momento chegou: o próximo
    // movimento é o contato combinado (retomada contextual), não resposta
    // a uma pergunta pendente.
    mode =
      stage === 'long_dormancy'
        ? 'reactivate'
        : 'light_follow_up'
    reactivationReasons.push(
      'agreed_recontact_due',
    )
  } else if (
    waitingOn === 'seller'
  ) {
    if (
      owedResponse &&
      owedResponse.overdue_ratio <= 1
    ) {
      mode = 'respond_now'
    } else {
      mode = 'recover_delay'
      reactivationReasons.push(
        'seller_owes_late_response',
      )
    }
  } else if (
    waitingOn === 'customer'
  ) {
    const lastUnansweredTurn =
      unansweredTurns[
        unansweredTurns.length - 1
      ] ?? null

    if (
      state ===
      'awaiting_customer'
    ) {
      mode = 'wait'
    } else if (
      sinceSeller !== null &&
      sinceSeller <=
        COMMERCIAL_TEMPORAL_POLICY
          .active_exchange_window_ms &&
      lastUnansweredTurn !== null &&
      lastUnansweredTurn
        .negative_signals.length === 0
    ) {
      // O vendedor acabou de agir de forma válida: mandar outra mensagem
      // agora seria envio duplo. Se a última ação foi uma quebra, a
      // recuperação continua sendo o próximo movimento.
      mode = 'wait'
      reactivationReasons.push(
        'seller_just_acted',
      )
    } else if (
      sinceSeller !== null &&
      sinceSeller <=
        customerExpected &&
      lastUnansweredTurn?.action_types.includes(
        'reengagement',
      )
    ) {
      // A retomada já foi feita e ainda está dentro da janela de resposta
      // esperada: repetir agora seria insistência.
      mode = 'wait'
      reactivationReasons.push(
        'recent_reactivation_attempt_pending',
      )
    } else if (
      state === 'cooling'
    ) {
      mode = 'light_follow_up'
      reactivationReasons.push(
        'continuity_cooling',
      )
    } else if (
      state === 'dormant'
    ) {
      mode = 'reactivate'
      reactivationReasons.push(
        'continuity_lost',
      )
    }
  }

  const requalify =
    mode !== 'respect_closure' &&
    mode !== 'wait' &&
    mode !== 'none' &&
    Boolean(
      intent?.needs_reconfirmation ||
      stage === 'long_dormancy' ||
      (
        mode === 'recover_delay' &&
        intent?.time_window_expired
      ),
    )

  if (requalify) {
    reactivationReasons.push(
      'current_intent_unknown',
    )
  }

  if (
    intent &&
    stage === 'long_dormancy' &&
    intent.freshness !== 'closed' &&
    !intent.needs_reconfirmation
  ) {
    intent.needs_reconfirmation =
      true
  }

  const lastUnansweredActions =
    unique(
      unansweredTurns.flatMap(
        turn =>
          turn.action_types,
      ),
    ) as SellerExecutionActionType[]

  // -------------------------------------------------------------------
  // Latência do vendedor
  // -------------------------------------------------------------------
  const highIntent =
    highIntentResponse({
      trace,
      signals,
    })

  const latestTurn =
    latestRespondedTurn(
      trace.turns,
    )

  const latestAssessment =
    latestTurn
      ? latencyAssessment({
          latencyMs:
            latestTurn.response_latency_ms,
          highIntent:
            Boolean(
              latestTurn
                .pending_customer_intent &&
              HIGH_INTENT_KINDS.has(
                latestTurn
                  .pending_customer_intent
                  .kind,
              ) &&
              latestTurn
                .pending_customer_intent
                .confidence ===
                'high',
            ),
        })
      : 'unknown'

  const latestAdequate =
    latestTurn
      ? latestTurn
          .addresses_customer_request !==
          false &&
        latestTurn.negative_signals
          .length === 0
      : null

  const latestQualityTiming:
    CommercialResponseQualityTiming =
      !latestTurn ||
      latestAssessment ===
        'unknown'
        ? 'unknown'
        : latestAssessment ===
            'timely'
          ? latestAdequate
            ? 'fast_adequate'
            : 'fast_inadequate'
          : latestAdequate
            ? 'slow_adequate'
            : 'slow_inadequate'

  // -------------------------------------------------------------------
  // Sinais para o Reasoning
  // -------------------------------------------------------------------
  const temporalSignals: string[] = []
  const temporalSituations: string[] = []

  switch (state) {
    case 'active':
      temporalSignals.push(
        'momentum_active',
      )
      break
    case 'awaiting_customer':
      temporalSignals.push(
        'awaiting_customer_within_rhythm',
      )
      break
    case 'awaiting_seller':
      temporalSignals.push(
        'customer_waiting_for_seller',
      )
      break
    case 'cooling':
      temporalSignals.push(
        'cooling_conversation',
      )
      break
    case 'dormant':
      temporalSignals.push(
        'dormant_opportunity',
      )
      break
    case 'closed':
      temporalSignals.push(
        'opportunity_closed_by_customer',
      )
      temporalSituations.push(
        'closed_by_customer',
      )

      if (contactOptOut) {
        temporalSignals.push(
          'customer_opted_out_of_contact',
        )
      }
      break
    default:
      break
  }

  if (
    stage !== 'no_history' &&
    stage !== 'closed'
  ) {
    temporalSignals.push(
      `momentum_stage_${stage}`,
    )
  }

  if (
    responsible ===
      'agreed_pause'
  ) {
    // Dentro do combinado a próxima ação é do cliente (ou do calendário):
    // espera disciplinada, sem nova mensagem.
    temporalSignals.push(
      'customer_future_action',
      'waiting_on_customer',
    )
    temporalSituations.push(
      'customer_commitment_pending',
    )
  }

  if (agreedPause) {
    temporalSignals.push(
      agreedPause.status ===
        'in_progress'
        ? 'agreed_pause_in_progress'
        : agreedPause.status === 'due'
          ? 'agreed_pause_due'
          : 'agreed_pause_elapsed',
    )
  }

  if (
    intent?.freshness ===
      'stale'
  ) {
    temporalSignals.push(
      'stale_customer_intent',
    )
  }

  if (
    intent?.time_window_expired
  ) {
    temporalSignals.push(
      'intent_time_window_expired',
    )
  }

  if (
    unansweredTurns.length >= 2 &&
    waitingOn === 'customer'
  ) {
    temporalSignals.push(
      'seller_outbound_streak',
    )
    temporalSituations.push(
      'follow_up_cadence',
    )
  }

  if (
    mode === 'recover_delay'
  ) {
    temporalSignals.push(
      'customer_waiting_for_seller',
      'seller_response_delayed',
    )
    temporalSituations.push(
      'delayed_response_recovery',
    )
  }

  if (
    mode === 'reactivate' ||
    mode === 'light_follow_up'
  ) {
    temporalSignals.push(
      'reactivation_needed',
    )
    temporalSituations.push(
      'reactivation',
    )
  }

  if (requalify) {
    temporalSignals.push(
      'requalification_needed',
    )
  }

  if (
    highIntent &&
    (
      highIntent.assessment ===
        'delayed' ||
      highIntent.assessment ===
        'very_delayed' ||
      highIntent.assessment ===
        'unanswered'
    )
  ) {
    temporalSignals.push(
      'high_intent_response_delayed',
    )
  }

  if (
    sla?.configured &&
    sla.applicable &&
    sla.risk === 'high'
  ) {
    temporalSignals.push(
      'stage_sla_risk_high',
    )
  }

  // -------------------------------------------------------------------
  // Narrativa seller-facing (determinística, sem jargão interno)
  // -------------------------------------------------------------------
  const factLines: string[] = []

  if (contactOptOut) {
    factLines.push(
      'O cliente pediu para não receber mais contato: nenhuma nova mensagem deve ser enviada, nem de agradecimento.',
    )
  }

  const conversationAge =
    since(first?.at ?? null)

  if (
    conversationAge !== null &&
    conversationAge >=
      COMMERCIAL_TEMPORAL_POLICY
        .active_exchange_window_ms
  ) {
    factLines.push(
      `Primeiro contato há ${formatCommercialDuration(conversationAge)}.`,
    )
  }

  const customerSilence =
    since(
      lastCustomer?.at ?? null,
    )

  if (customerSilence !== null) {
    factLines.push(
      `Última mensagem do cliente há ${formatCommercialDuration(customerSilence)}.`,
    )
  }

  if (sinceSeller !== null) {
    factLines.push(
      unansweredTurns.length >= 2 &&
      waitingOn === 'customer'
        ? `Última mensagem do vendedor há ${formatCommercialDuration(sinceSeller)} — ${unansweredTurns.length} tentativas seguidas sem resposta do cliente.`
        : `Última mensagem do vendedor há ${formatCommercialDuration(sinceSeller)}.`,
    )
  }

  if (
    responsible === 'customer' &&
    ratio !== null &&
    ratio >= 1.5 &&
    expectedBasis !== 'agreed_pause'
  ) {
    const rhythm =
      expectedBasis === 'observed'
        ? 'o ritmo de resposta deste cliente'
        : expectedBasis ===
            'time_sensitive_intent'
          ? 'a janela que o próprio pedido do cliente indicava'
          : 'o intervalo de resposta esperado'

    factLines.push(
      ratio < 2
        ? `O silêncio já passou de ${rhythm}.`
        : `O silêncio já é cerca de ${Math.round(ratio)} vezes ${rhythm}.`,
    )
  }

  if (agreedPause) {
    const requestedLabel =
      agreedPause.seller_owes_contact
        ? `O cliente pediu para ser chamado ${agreedPause.horizon_label}`
        : `O cliente pediu um prazo e disse que retomaria ${agreedPause.horizon_label}`

    factLines.push(
      agreedPause.status ===
        'in_progress'
        ? `${requestedLabel}; o combinado ainda está dentro do prazo.`
        : agreedPause.status === 'due'
          ? agreedPause.seller_owes_contact
            ? `${requestedLabel} — chegou o momento combinado de retomar.`
            : `${requestedLabel}; o período combinado está em curso.`
          : `${requestedLabel}; o prazo combinado passou há ${formatCommercialDuration(evaluatedAt - (pauseUntil ?? evaluatedAt))}.`,
    )
  }

  if (
    intent &&
    intent.needs_reconfirmation &&
    lastCustomer &&
    lastCustomer.at >
      (
        parse(
          intent.last_engagement_at,
        ) ?? lastCustomer.at
      )
  ) {
    factLines.push(
      `A última manifestação do cliente sobre este interesse foi há ${formatCommercialDuration(intent.related_age_ms)}; as mensagens depois disso não o reconfirmaram.`,
    )
  }

  if (
    highIntent &&
    highIntent.first_response_latency_ms !==
      null &&
    highIntent.assessment !==
      'timely'
  ) {
    const firstPart =
      highIntent.first_response_addressed ===
        false
        ? `A primeira resposta ao pedido do cliente veio após ${formatCommercialDuration(highIntent.first_response_latency_ms)} e não tratou o pedido`
        : `O pedido do cliente esperou ${formatCommercialDuration(highIntent.first_response_latency_ms)} pela primeira resposta`

    const effectivePart =
      highIntent.effective_response_latency_ms !==
        null &&
      highIntent.effective_response_message_id !==
        highIntent.first_response_message_id
        ? `; o pedido só foi efetivamente tratado ${formatCommercialDuration(highIntent.effective_response_latency_ms)} depois`
        : ''

    factLines.push(
      `${firstPart}${effectivePart}.`,
    )
  }

  if (
    intent?.time_window_expired
  ) {
    factLines.push(
      'O momento que o cliente havia indicado para o próximo passo já passou.',
    )
  }

  if (
    sla?.configured &&
    sla.applicable &&
    sla.risk &&
    sla.risk !== 'low' &&
    sla.elapsed_minutes !== null
  ) {
    factLines.push(
      `Tempo nesta etapa acima do limite de atenção configurado pela empresa (${formatCommercialDuration(sla.elapsed_minutes * 60_000)}).`,
    )
  }

  return {
    contract_version:
      COMMERCIAL_TEMPORAL_CONTEXT_VERSION,

    evaluated_at:
      new Date(
        evaluatedAt,
      ).toISOString(),

    facts: {
      first_contact_at:
        iso(first?.at ?? null),
      last_message_at:
        iso(last?.at ?? null),
      last_message_author:
        last?.author ?? null,
      last_customer_message_at:
        iso(
          lastCustomer?.at ?? null,
        ),
      last_seller_message_at:
        iso(
          lastSeller?.at ?? null,
        ),
      last_bidirectional_exchange_at:
        iso(transitionAt),
      last_customer_intent_at:
        intent?.demonstrated_at ??
        null,
      last_meaningful_commercial_event_at:
        intent?.last_engagement_at ??
        null,
      conversation_age_ms:
        conversationAge,
      silence_since_last_customer_message_ms:
        customerSilence,
      silence_since_last_seller_message_ms:
        sinceSeller,
      silence_since_last_bidirectional_exchange_ms:
        since(transitionAt),
      age_of_last_customer_intent_ms:
        intent
          ? since(
              parse(
                intent.demonstrated_at,
              ),
            )
          : null,
      seller_messages_since_last_customer_reply:
        sellerMessagesSinceCustomer,
      seller_turns_since_last_customer_reply:
        unansweredTurns.length,
      longest_relevant_gap:
        findLongestGap(messages),
    },

    cadence: {
      customer_reply_samples:
        customerLatencies.length,
      customer_median_reply_ms:
        customerMedian,
      seller_reply_samples:
        sellerLatencies.length,
      seller_median_reply_ms:
        median(sellerLatencies),
      expected_customer_reply_window_ms:
        customerExpected,
      dormancy_horizon_ms:
        Math.round(
          customerExpected *
            longDormancyRatio(),
        ),
      basis:
        cadenceBasis,
    },

    seller_timing: {
      high_intent_request:
        highIntent,
      latest_response:
        latestTurn
          ? {
              turn_id:
                latestTurn.turn_id,
              latency_ms:
                latestTurn.response_latency_ms,
              addressed:
                latestTurn
                  .addresses_customer_request,
              assessment:
                latestAssessment,
              quality_timing:
                latestQualityTiming,
            }
          : null,
      pending_customer_wait_ms:
        waitingOn === 'seller' &&
        !pauseGoverns
          ? since(
              pendingCustomerBurstStart,
            )
          : null,
    },

    intent,

    progression: {
      responsible,
      silence_ms: silenceMs,
      expected_window_ms:
        expectedMs,
      expected_window_basis:
        expectedBasis,
      elapsed_ratio:
        ratio === null
          ? null
          : round(ratio, 2),
      severity:
        round(severity, 3),
      stage,
      intent_vitality:
        intent?.vitality ?? null,
      intent_related_age_ms:
        intent?.related_age_ms ??
        null,
      bidirectional_inactivity_ms:
        since(transitionAt),
      unanswered_outbound:
        waitingOn === 'customer'
          ? unansweredTurns.length
          : 0,
      owed_response:
        owedResponse,
      agreed_pause:
        agreedPause,
      factors:
        unique(factors),
    },

    momentum: {
      state,
      waiting_on:
        waitingOn,
      since:
        iso(waitingSince),
      duration_ms:
        since(waitingSince),
      confidence,
      reason_codes:
        unique(reasonCodes),
    },

    reactivation: {
      mode,
      contact_allowed:
        !contactOptOut,
      requalify_before_continuing:
        requalify,
      outbound_unanswered_turns:
        waitingOn === 'customer'
          ? unansweredTurns.length
          : 0,
      last_unanswered_action_types:
        waitingOn === 'customer'
          ? lastUnansweredActions
          : [],
      reason_codes:
        unique(
          reactivationReasons,
        ),
    },

    sla,

    snapshot: {
      newer_activity_outside_snapshot:
        newerActivityOutsideSnapshot,
    },

    signals:
      unique(temporalSignals),

    situations:
      unique(
        temporalSituations,
      ),

    narrative: {
      momentum_label:
        momentumLabel({
          state,
          stage,
          responsible,
          agreedPause,
          contactOptOut,
        }),
      intent_label:
        intent
          ? intentFreshnessLabel(
              intent.freshness,
            )
          : null,
      facts:
        factLines,
    },
  }
}

// Momento que exige nova decisão por causa do tempo (reativação,
// recuperação de atraso ou encerramento) — não continuação cega do
// diálogo antigo.
export function temporalRequiresNewMove(
  temporal:
    CommercialTemporalContext | null | undefined,
): boolean {
  return Boolean(
    temporal &&
    (
      temporal.reactivation.mode ===
        'reactivate' ||
      temporal.reactivation.mode ===
        'light_follow_up' ||
      temporal.reactivation.mode ===
        'recover_delay' ||
      temporal.reactivation.mode ===
        'respect_closure'
    ),
  )
}
