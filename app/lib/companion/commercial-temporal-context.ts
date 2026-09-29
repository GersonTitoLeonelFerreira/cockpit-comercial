import type {
  CompanionDiagnosticInput,
  DiagnosticInputMessage,
} from './diagnostic-input'

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

  // Piso do horizonte de dormência e multiplicador sobre a janela esperada.
  dormancy_floor_ms:
    7 * 24 * 60 * 60 * 1000,

  dormancy_window_multiplier: 4,

  // Avaliação de latência do vendedor (sem SLA configurado não se fala em
  // "violação": apenas em rapidez relativa ao tipo de pedido).
  high_intent_timely_response_ms:
    60 * 60 * 1000,

  timely_response_ms:
    4 * 60 * 60 * 1000,

  delayed_response_ms:
    24 * 60 * 60 * 1000,
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
  } | null

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

function timeWindowExpired({
  reference,
  demonstratedAt,
  evaluatedAt,
}: {
  reference:
    SellerExecutionTimeReference
  demonstratedAt: number
  evaluatedAt: number
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
      return days >= 7
  }
}

// Horizonte declarado pelo cliente num adiamento. Só texto explícito.
function deferralHorizonMs(
  text: string,
): number {
  const normalized =
    normalizeText(text)

  if (
    /\b(mes que vem|proximo mes|fim do mes|final do mes|depois das ferias|depois das festas)\b/.test(
      normalized,
    )
  ) {
    return 30 * DAY_MS
  }

  if (
    /\b(semana que vem|proxima semana|mais (pra|para) frente)\b/.test(
      normalized,
    )
  ) {
    return 10 * DAY_MS
  }

  return 3 * DAY_MS
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

function momentumLabel(
  state: CommercialMomentumState,
): string {
  switch (state) {
    case 'active':
      return 'Conversa ativa'
    case 'awaiting_seller':
      return 'Cliente aguardando resposta do vendedor'
    case 'awaiting_customer':
      return 'Aguardando o cliente, dentro do ritmo normal'
    case 'cooling':
      return 'Conversa esfriando'
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
  // Ritmo observado e horizontes
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

  let expectedWindow:
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
    expectedWindow =
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

  let dormancyHorizon =
    Math.max(
      COMMERCIAL_TEMPORAL_POLICY
        .dormancy_floor_ms,
      expectedWindow *
        COMMERCIAL_TEMPORAL_POLICY
          .dormancy_window_multiplier,
    )

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

  const deferral =
    latestKindSignal?.kind ===
      'deferral'
      ? latestKindSignal
      : null

  let deferralEndsAt:
    number | null =
      null

  if (deferral) {
    const deferralMessage =
      customerMessages.find(
        item =>
          item.message.id ===
            deferral.message_id,
      )

    const deferralAt =
      parse(
        deferral.occurred_at,
      )

    if (
      deferralMessage &&
      deferralAt !== null
    ) {
      deferralEndsAt =
        deferralAt +
        deferralHorizonMs(
          messageText(
            deferralMessage.message,
          ),
        )

      dormancyHorizon =
        Math.max(
          dormancyHorizon,
          deferralEndsAt -
            deferralAt +
            expectedWindow,
        )

      cadenceBasis =
        'deferral'
    }
  }

  // -------------------------------------------------------------------
  // Intenção: histórica vs atual
  // -------------------------------------------------------------------
  const intentSignal =
    [...signals]
      .reverse()
      .find(
        signal =>
          COMMERCIAL_INTENT_KINDS.has(
            signal.kind,
          ),
      ) ?? null

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

  let intent:
    CommercialTemporalContext['intent'] =
      null

  if (intentSignal) {
    const demonstratedAt =
      parse(
        intentSignal.occurred_at,
      ) ?? evaluatedAt

    // Qualquer resposta posterior do cliente na mesma linha mantém o tema
    // vivo (ex.: "Não fiz ainda" depois de pedir uma experiência). Um
    // encerramento explícito posterior fecha a intenção.
    const lastEngagement =
      closed
        ? demonstratedAt
        : Math.max(
            demonstratedAt,
            lastCustomer?.at ??
              demonstratedAt,
          )

    const engagementAge =
      Math.max(
        0,
        evaluatedAt -
          lastEngagement,
      )

    const recentExchange =
      transitionAt !== null &&
      evaluatedAt - transitionAt <=
        COMMERCIAL_TEMPORAL_POLICY
          .active_exchange_window_ms

    const freshness:
      CommercialIntentFreshness =
        closed
          ? 'closed'
          : recentExchange ||
              engagementAge <=
                expectedWindow
            ? 'current'
            : engagementAge <=
                dormancyHorizon
              ? 'aging'
              : 'stale'

    const expired =
      timeWindowExpired({
        reference:
          intentSignal.time_reference,
        demonstratedAt,
        evaluatedAt,
      })

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
          lastEngagement,
        ).toISOString(),
      freshness,
      time_reference:
        intentSignal.time_reference,
      time_window_expired:
        expired,
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
          freshness === 'stale' ||
          (
            freshness === 'aging' &&
            (
              expired ||
              unansweredTurns.length >= 2
            )
          )
        ),
    }
  }

  // -------------------------------------------------------------------
  // Momentum e responsabilidade
  // -------------------------------------------------------------------
  const reasonCodes: string[] = []

  let state:
    CommercialMomentumState =
      'no_history'

  let waitingOn:
    CommercialTemporalWaitingOn =
      'unknown'

  let waitingSince:
    number | null =
      null

  let confidence:
    SellerExecutionConfidence =
      cadenceBasis === 'observed'
        ? 'high'
        : 'medium'

  const pendingCustomerBurstStart =
    (() => {
      if (
        !last ||
        last.author !==
          'customer'
      ) {
        return null
      }

      let start =
        last.at

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

        start =
          messages[index].at
      }

      return start
    })()

  if (!last) {
    state = 'no_history'
    confidence = 'low'
  } else if (closed) {
    state = 'closed'
    waitingOn = 'none'
    waitingSince =
      parse(
        latestKindSignal?.occurred_at,
      )
    reasonCodes.push(
      'customer_explicitly_disengaged',
    )
  } else if (
    last.author ===
      'customer'
  ) {
    waitingOn = 'seller'
    waitingSince =
      pendingCustomerBurstStart

    const wait =
      since(waitingSince) ?? 0

    if (
      wait <=
      COMMERCIAL_TEMPORAL_POLICY
        .active_exchange_window_ms
    ) {
      state = 'awaiting_seller'
      reasonCodes.push(
        'customer_spoke_last_recently',
      )
    } else if (
      wait <= expectedWindow
    ) {
      state = 'awaiting_seller'
      reasonCodes.push(
        'seller_response_late',
      )
    } else if (
      wait <= dormancyHorizon
    ) {
      state = 'cooling'
      reasonCodes.push(
        'customer_waiting_long_for_seller',
      )
    } else {
      state = 'dormant'
      reasonCodes.push(
        'seller_left_customer_without_response',
      )
    }
  } else {
    waitingOn = 'customer'
    waitingSince =
      lastSeller?.at ?? null

    const customerSilence =
      lastCustomer
        ? since(lastCustomer.at) ?? 0
        : since(
            sellerMessages[0]?.at ??
              null,
          ) ?? 0

    if (!lastCustomer) {
      reasonCodes.push(
        'customer_never_replied',
      )
    }

    if (
      deferralEndsAt !== null &&
      evaluatedAt <=
        deferralEndsAt +
          expectedWindow
    ) {
      state = 'awaiting_customer'
      reasonCodes.push(
        'customer_deferral_in_progress',
      )
    } else if (
      customerSilence <=
      expectedWindow
    ) {
      state = 'awaiting_customer'
      reasonCodes.push(
        'within_expected_reply_window',
      )
    } else if (
      customerSilence <=
      dormancyHorizon
    ) {
      state = 'cooling'
      reasonCodes.push(
        'customer_silence_beyond_expected_window',
      )
    } else {
      state = 'dormant'
      reasonCodes.push(
        'customer_silence_beyond_dormancy_horizon',
      )
    }

    if (
      unansweredTurns.length >= 2
    ) {
      reasonCodes.push(
        'seller_outbound_streak_without_reply',
      )

      if (
        state ===
        'awaiting_customer'
      ) {
        state = 'cooling'
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
      'customer_closed_opportunity',
    )
  } else if (
    state === 'active'
  ) {
    mode =
      waitingOn === 'seller'
        ? 'respond_now'
        : 'none'
  } else if (
    waitingOn === 'seller'
  ) {
    const wait =
      since(waitingSince) ?? 0

    if (
      wait <=
      COMMERCIAL_TEMPORAL_POLICY
        .active_exchange_window_ms
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
        expectedWindow &&
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
      state === 'dormant' ||
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
    state === 'dormant' &&
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
      break
    default:
      break
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

  const sla =
    operational?.sla ?? null

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
        expectedWindow,
      dormancy_horizon_ms:
        dormancyHorizon,
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
        waitingOn === 'seller'
          ? since(waitingSince)
          : null,
    },

    intent,

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
        momentumLabel(state),
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
