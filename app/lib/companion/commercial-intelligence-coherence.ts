import type {
  SellerExecutionActionType,
  SellerExecutionTrace,
  SellerExecutionTurn,
} from './seller-execution-trace'

import type {
  CommercialTemporalContext,
} from './commercial-temporal-context'

// ============================================================================
// Coerência da inteligência canônica (arbitragem antes da superfície
// seller-facing).
//
// Não é outro cérebro: não cria leitura, técnica nem decisão. Recebe as
// conclusões já produzidas (Commercial Reading, Seller Execution Trace,
// Temporal Context, Reasoning, Coaching) e impede que conclusões localmente
// corretas formem uma saída globalmente absurda — por exemplo elogiar como
// "Principal acerto" a mesma ação que causou a quebra de sequência.
//
// Unidade de julgamento = TURNO do vendedor (rajada de bolhas), não a
// última mensagem isolada. Uma oferta em várias bolhas é uma ação só.
// ============================================================================

export type CommercialActionFamily =
  | 'presentation'
  | 'scheduling'
  | 'discovery'
  | 'follow_up'
  | 'responsiveness'
  | 'objection'
  | 'close'

export type NegativeExecutionUnitKind =
  | 'sequence_break'
  | 'premature_offer'
  | 'duplicate_followup'
  | 'late_discovery'
  | 'request_not_addressed'
  | 'slow_high_intent_response'
  | 'pressure'
  | 'push_after_closure'

export type NegativeExecutionUnit = {
  kind: NegativeExecutionUnitKind
  turn_id: string
  // Mensagens do vendedor que SÃO a ação negativa (nunca o ID da fala do
  // cliente que motivou a ação — citar o pedido do cliente num elogio não
  // pode ser confundido com elogiar a ação que quebrou a sequência).
  seller_message_ids: string[]
  // Demais mensagens do mesmo turno (conflito só por família semântica).
  turn_message_ids: string[]
  families: CommercialActionFamily[]
}

export type CoherenceAdjustment = {
  code: string
  detail: string
}

const ACTION_FAMILY:
  Partial<
    Record<
      SellerExecutionActionType,
      CommercialActionFamily
    >
  > = {
    product_presentation:
      'presentation',
    price_presentation:
      'presentation',
    stage_jump_unrelated_offer:
      'presentation',
    value_explanation:
      'presentation',
    factual_proof:
      'presentation',
    scheduling_open_question:
      'scheduling',
    scheduling_guided_choice:
      'scheduling',
    commitment_request:
      'scheduling',
    discovery_question:
      'discovery',
    qualification_question:
      'discovery',
    clarification_question:
      'discovery',
    follow_up:
      'follow_up',
    reengagement:
      'follow_up',
    rapport_opening:
      'responsiveness',
    confirmation:
      'responsiveness',
    objection_probe:
      'objection',
    objection_response:
      'objection',
    close_request:
      'close',
    pressure_or_false_urgency:
      'close',
  }

export function actionFamily(
  action: SellerExecutionActionType,
): CommercialActionFamily | null {
  return ACTION_FAMILY[action] ?? null
}

function comparable(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[̀-ͯ]/g,
      '',
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

const PRAISE_FAMILY_PATTERNS:
  ReadonlyArray<[
    CommercialActionFamily,
    RegExp,
  ]> = [
    [
      'presentation',
      /\b(ofert\w*|plano\w*|preco\w*|valor(es)?|promoc\w*|promocional|produto\w*|link\w*|apresent\w*|proposta\w*|beneficio\w*|condic\w*|pacote\w*|matricul\w*|catalogo\w*|orcamento\w*|detalhad\w*)\b/,
    ],
    [
      'scheduling',
      /\b(agend\w*|horario\w*|disponibilidad\w*|marca\w*|visita\w*|reuniao|reunioes|demonstrac\w*|compromisso\w*)\b/,
    ],
    [
      'discovery',
      /\b(descobr\w*|necessidad\w*|entend\w*|investig\w*|qualific\w*|pergunt\w*)\b/,
    ],
    [
      'follow_up',
      /\b(retom\w*|follow|acompanh\w*|lembr\w*|reativ\w*)\b/,
    ],
    [
      'responsiveness',
      /\b(rapid\w*|agil\w*|prontament\w*|imediat\w*|cordial\w*|educad\w*|simpat\w*|acolh\w*|respondeu|atencios\w*)\b/,
    ],
    [
      'objection',
      /\b(objec\w*|resistenc\w*|preocupac\w*|duvida\w*)\b/,
    ],
    [
      'close',
      /\b(fech\w*|pagamento\w*|contrat\w*|assinatur\w*)\b/,
    ],
  ]

export function praiseFamilies(
  text: string,
): CommercialActionFamily[] {
  const normalized =
    comparable(text)

  return PRAISE_FAMILY_PATTERNS
    .filter(
      ([, pattern]) =>
        pattern.test(normalized),
    )
    .map(
      ([family]) => family,
    )
}

function turnFamilies(
  turn: SellerExecutionTurn,
  actions?: SellerExecutionActionType[],
): CommercialActionFamily[] {
  return Array.from(
    new Set(
      (actions ?? turn.action_types)
        .map(actionFamily)
        .filter(
          (
            value,
          ): value is CommercialActionFamily =>
            value !== null,
        ),
    ),
  )
}

export function buildNegativeExecutionUnits({
  trace,
  temporal,
}: {
  trace: SellerExecutionTrace
  temporal:
    CommercialTemporalContext | null
}): NegativeExecutionUnit[] {
  const units: NegativeExecutionUnit[] = []

  const eventsByTurn =
    new Map<
      string,
      SellerExecutionTrace['events']
    >()

  for (const event of trace.events) {
    const list =
      eventsByTurn.get(
        event.turn_id,
      ) ?? []

    list.push(event)

    eventsByTurn.set(
      event.turn_id,
      list,
    )
  }

  const closedAt =
    temporal?.momentum.state ===
      'closed' &&
    temporal.momentum.since
      ? Date.parse(
          temporal.momentum.since,
        )
      : null

  for (const turn of trace.turns) {
    const turnEvents =
      eventsByTurn.get(
        turn.turn_id,
      ) ?? []

    const add = (
      kind: NegativeExecutionUnitKind,
      predicate: (
        event: SellerExecutionTrace['events'][number],
      ) => boolean,
    ) => {
      const matching =
        turnEvents.filter(
          predicate,
        )

      if (
        matching.length === 0
      ) {
        return
      }

      units.push({
        kind,
        turn_id:
          turn.turn_id,
        seller_message_ids:
          matching.map(
            event =>
              event.message_id,
          ),
        turn_message_ids: [
          ...turn.message_ids,
        ],
        families:
          turnFamilies(
            turn,
            matching.map(
              event =>
                event.action_type,
            ),
          ),
      })
    }

    add(
      'sequence_break',
      event =>
        event.sequence
          .breaks_active_customer_goal,
    )

    add(
      'premature_offer',
      event =>
        event.signals.includes(
          'premature_product_offer',
        ),
    )

    add(
      'duplicate_followup',
      event =>
        event.signals.includes(
          'duplicate_followup',
        ),
    )

    add(
      'late_discovery',
      event =>
        event.signals.includes(
          'late_discovery_after_close_intent',
        ),
    )

    add(
      'pressure',
      event =>
        event.quality
          .pressure_risk ===
          'high',
    )

    if (
      turn.negative_signals.includes(
        'request_not_addressed',
      )
    ) {
      units.push({
        kind:
          'request_not_addressed',
        turn_id:
          turn.turn_id,
        seller_message_ids: [
          ...turn.message_ids,
        ],
        turn_message_ids: [
          ...turn.message_ids,
        ],
        families: [
          'responsiveness',
        ],
      })
    }

    if (
      closedAt !== null &&
      Date.parse(
        turn.started_at,
      ) > closedAt &&
      turnFamilies(turn).some(
        family =>
          family ===
            'presentation' ||
          family === 'close' ||
          family === 'scheduling',
      )
    ) {
      units.push({
        kind:
          'push_after_closure',
        turn_id:
          turn.turn_id,
        seller_message_ids: [
          ...turn.message_ids,
        ],
        turn_message_ids: [
          ...turn.message_ids,
        ],
        families:
          turnFamilies(turn),
      })
    }
  }

  const highIntent =
    temporal?.seller_timing
      .high_intent_request

  if (
    highIntent &&
    highIntent.first_response_message_id &&
    (
      highIntent.assessment ===
        'delayed' ||
      highIntent.assessment ===
        'very_delayed' ||
      highIntent.assessment ===
        'unanswered'
    )
  ) {
    const turn =
      trace.turns.find(
        item =>
          item.message_ids.includes(
            highIntent.first_response_message_id!,
          ),
      )

    if (turn) {
      units.push({
        kind:
          'slow_high_intent_response',
        turn_id:
          turn.turn_id,
        seller_message_ids: [
          ...turn.message_ids,
        ],
        turn_message_ids: [
          ...turn.message_ids,
        ],
        families: [
          'responsiveness',
        ],
      })
    }
  }

  return units
}

export type CoherenceStrengthCandidate = {
  summary: string
  why_it_matters: string
  evidence_message_ids: string[]
}

// Um elogio conflita com uma ação negativa quando:
// 1. cita diretamente uma mensagem que É a ação negativa; ou
// 2. cita outra bolha do mesmo turno negativo e fala da mesma família de
//    ação (ex.: elogio de "oferta" citando o link da mesma oferta); ou
// 3. não cita a ação, mas elogia exatamente a família de ação que causou
//    a quebra/erro principal (ex.: "enviou oferta detalhada" quando a
//    quebra foi a apresentação de oferta).
export function strengthConflictsWithNegativeUnits({
  strength,
  units,
  primaryMistakeMessageIds = [],
  primaryMistakeFamilies = [],
}: {
  strength:
    CoherenceStrengthCandidate
  units: NegativeExecutionUnit[]
  primaryMistakeMessageIds?: string[]
  primaryMistakeFamilies?: CommercialActionFamily[]
}): boolean {
  const evidence =
    new Set(
      strength.evidence_message_ids,
    )

  const families =
    praiseFamilies(
      `${strength.summary} ${strength.why_it_matters}`,
    )

  if (
    primaryMistakeMessageIds.some(
      id =>
        evidence.has(id),
    )
  ) {
    return true
  }

  if (
    families.some(
      family =>
        primaryMistakeFamilies.includes(
          family,
        ),
    )
  ) {
    return true
  }

  return units.some(unit => {
    if (
      unit.seller_message_ids.some(
        id =>
          evidence.has(id),
      )
    ) {
      return true
    }

    const sharesFamily =
      families.some(
        family =>
          unit.families.includes(
            family,
          ),
      )

    if (!sharesFamily) {
      return false
    }

    if (
      unit.turn_message_ids.some(
        id =>
          evidence.has(id),
      )
    ) {
      return true
    }

    // Elogio sem ancoragem na ação: só conflita com as ações que mudam o
    // rumo da venda (quebra, oferta prematura, pedido ignorado, demora,
    // insistência pós-encerramento).
    return [
      'sequence_break',
      'premature_offer',
      'request_not_addressed',
      'slow_high_intent_response',
      'push_after_closure',
    ].includes(unit.kind)
  })
}
