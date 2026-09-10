import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  type CommercialReadingDecision,
  type CommercialReadingCommercialRelevance,
  type CommercialReadingImprovementKind,
  type CommercialReadingMethodAdherenceStatus,
} from '@/app/lib/companion/commercial-reading-contract'

import type {
  CompanionClientContext,
} from '@/app/lib/companion/companion-client-context-contract'

import {
  loadCanonicalMethodCoachingSource,
} from './canonical-method-coaching-source'

import {
  loadCanonicalCycleCommercialMemory,
} from './canonical-cycle-commercial-memory-source'

import type {
  CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

/**
 * FASE 16.3E — Decision State / AGORA canônico.
 *
 * Combina, sem inventar mapeamento implícito e sem duplicar verdade:
 * - Commercial Reading (FASE 16.3B, `current_reading`, caller-supplied —
 *   este módulo nunca recalcula validation_context/state_read, mesma
 *   disciplina de 16.3D);
 * - Canonical Method/Coaching (FASE 16.3D, chamado aqui internamente,
 *   recebendo o mesmo `current_reading`);
 * - Canonical Cycle Commercial Memory (FASE 16.3C, chamado aqui
 *   internamente, para `commitments`/`open_loops`);
 * - Sinais operacionais determinísticos de
 *   `companion-client-context-contract.ts` (relacionamento/waiting/SLA/
 *   estágio de CRM) — `client_context`, caller-supplied. Esse loader é
 *   auth-gated (exige token de usuário para validar vínculo com a
 *   empresa) e por isso não é chamado internamente por este módulo,
 *   que é puramente server-side e não tem sessão de usuário; o
 *   chamador (rota autenticada) já o carrega e repassa aqui.
 *
 * Nunca cria uma nova fonte de verdade: cada campo material do
 * resultado é rastreável até uma das fontes acima. Não persiste nada —
 * runtime-only (ver docstring de loadCanonicalDecisionState).
 */

export const DECISION_STATE_INTERVENTION_PRIORITIES = [
  'critical',
  'high',
  'medium',
  'low',
] as const

export type DecisionStateInterventionPriority =
  (typeof DECISION_STATE_INTERVENTION_PRIORITIES)[number]

export const DECISION_STATE_INTERVENTION_SOURCES = [
  'client_sla',
  'customer_waiting',
  'cycle_commitment',
  'commercial_risk',
  'method_adherence',
  'seller_coaching',
  'insufficient_information',
] as const

export type DecisionStateInterventionSource =
  (typeof DECISION_STATE_INTERVENTION_SOURCES)[number]

export const DECISION_STATE_OPERATIONAL_SIGNAL_AVAILABILITIES = [
  'AVAILABLE_NOW',
  'PARTIAL',
  'NOT_AVAILABLE',
] as const

export type DecisionStateOperationalSignalAvailability =
  (typeof DECISION_STATE_OPERATIONAL_SIGNAL_AVAILABILITIES)[number]

// Ordem estável de desempate entre fontes na mesma prioridade — fatos
// determinísticos do banco (SLA, compromisso) vêm antes de sinais
// interpretados pela IA (risco, método), que vêm antes do gap de
// descoberta (o mais indireto). Documentada aqui porque a ordem de
// array/banco nunca é uma garantia (achado do mandato §26).
const DECISION_STATE_SOURCE_TIEBREAK_ORDER: readonly DecisionStateInterventionSource[] = [
  'client_sla',
  'customer_waiting',
  'cycle_commitment',
  'commercial_risk',
  'method_adherence',
  'seller_coaching',
  'insufficient_information',
]

// Gap de sessão: mesma janela de 4h já usada em
// stateful-copilot-execution-plan.ts (CURRENT_SESSION_GAP_MS),
// stateful-copilot-real-context-loader.ts
// (STATEFUL_DIAGNOSTIC_SESSION_GAP_MS) e
// message-intelligence/context-assembler.ts
// (MESSAGE_CONTEXT_CURRENT_INTERACTION_GAP_MS). Não centralizado nesses
// três arquivos já aprovados — seria refatoração cosmética fora do
// escopo desta fase; documentado como a mesma janela, não uma nova.
export const DECISION_STATE_SESSION_GAP_MS =
  4 * 60 * 60 * 1000

// Candidatos "de avanço de venda" — método/descoberta/decisão padrão da
// análise. Suprimidos da decisão principal quando a sessão atual não é
// comercial (mandato §7: sessão pessoal não deve forçar venda, mas não
// apaga a oportunidade — sinais operacionais objetivos como SLA e
// compromisso continuam elegíveis).
//
// `seller_coaching` é ambíguo por si só: os kinds sempre-urgentes
// (incorrect_information/poor_objection_handling/missed_commitment/
// promise_risk, kind='clarify') são corretivos/defensivos, não avançam
// venda — mas os kinds de risco-no-próximo-passo
// (premature_price/premature_presentation/advance_without_confirmation,
// kind='deepen_discovery') só existem quando best_approach já recomenda
// avançar, então reproduzem o mesmo problema de forçar venda que este
// filtro existe para evitar (achado do Codex, PR #280, rodada 1).
// Checar `kind === 'deepen_discovery'` distingue os dois sem precisar
// de uma nova fonte no enum público.
//
// `commercial_risk` também é ambíguo: uma objeção do cliente
// (kind='handle_objection') é sobre retomar/avançar a negociação — a
// mesma classe de comportamento que este filtro existe para evitar
// durante uma sessão pessoal (achado do Codex, PR #280, rodada 2). Já
// um risco de atendimento (kind='confirm_information', ex.: uma
// promessa em risco) é defensivo/operacional, não sobre avançar venda
// — continua elegível, igual a SLA e compromisso.
function isPitchAdvancingCandidate(
  candidate: Candidate,
): boolean {
  return (
    candidate.source === 'method_adherence' ||
    candidate.source === 'insufficient_information' ||
    candidate.kind === 'deepen_discovery' ||
    candidate.kind === 'handle_objection'
  )
}

const PRIORITY_RANK: Record<
  DecisionStateInterventionPriority,
  number
> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export type DecisionStateCurrentMoment = {
  commercial_relevance:
    CommercialReadingCommercialRelevance | null

  is_active_session:
    boolean | null

  last_interaction_at:
    string | null

  session_gap_ms:
    number
}

export type DecisionStatePrimaryDecision = {
  kind: CommercialReadingDecision

  // Fonte do candidato que originou esta decisão — `null` quando a
  // decisão não veio de um candidato priorizado (síntese de
  // `give_space` em sessão pessoal, passthrough de `best_approach` da
  // leitura atual sem nenhum candidato elegível, ou o fallback de
  // `no_intervention` sem nenhuma fonte disponível). Adicionado na
  // FASE 16.3F (Communication Context) para permitir que um
  // consumidor resolva o candidato original (compromisso, objeção,
  // método) contra as fontes suplementares sem reinterpretar/adivinhar
  // a origem por correspondência de texto — extensão aditiva,
  // comportamento de todo consumidor existente inalterado.
  source: DecisionStateInterventionSource | null

  summary: string
  reason: string
  recommended_action: string

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type DecisionStateInterventionCard = {
  source: DecisionStateInterventionSource
  priority: DecisionStateInterventionPriority

  // O assunto concreto do candidato (ex.: qual compromisso, qual
  // objeção) — sem isso, dois cards do mesmo `source` ficam
  // indistinguíveis para o vendedor (achado do Codex, PR #280,
  // rodada 2).
  summary: string

  reason: string
  recommended_action: string

  evidence_message_ids: string[]
  memory_ids: string[]

  observed_at: string
  resolve_condition: string
}

export type DecisionStateOperationalSignalAvailabilityMap = {
  crm_pipeline: DecisionStateOperationalSignalAvailability
  agenda: DecisionStateOperationalSignalAvailability
  sla: DecisionStateOperationalSignalAvailability
  waiting: DecisionStateOperationalSignalAvailability
  commitments: DecisionStateOperationalSignalAvailability

  // Nenhuma fonte canônica de "dias desde a última atividade" por
  // oportunidade existe hoje (só há um agregado por vendedor, achado do
  // audit da FASE 16.3E) — sempre NOT_AVAILABLE, nunca simulado.
  opportunity_inactivity: DecisionStateOperationalSignalAvailability
}

export type DecisionState = {
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  current_moment: DecisionStateCurrentMoment
  primary_decision: DecisionStatePrimaryDecision

  // Máximo 2 — densidade seller-facing (mandato §10): priorizar, nunca
  // empilhar.
  interventions: DecisionStateInterventionCard[]

  operational_signal_availability:
    DecisionStateOperationalSignalAvailabilityMap

  provenance: {
    conversation_key: string
    cycle_id: string

    analise_source_event_id: string | null
    analise_state_record_id: string | null
    analise_state_version: number | null
    analise_state_updated_at: string | null

    agora_updated_at: string | null

    client_context_generated_at: string | null
  }
}

function normalizeDateOrNull(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp =
    Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp).toISOString()
}

type Candidate = {
  source: DecisionStateInterventionSource
  priority: DecisionStateInterventionPriority
  kind: CommercialReadingDecision

  summary: string
  reason: string
  recommended_action: string

  evidence_message_ids: string[]
  memory_ids: string[]

  observed_at: string
  resolve_condition: string
}

function compareCandidates(
  left: Candidate,
  right: Candidate,
): number {
  const priorityDelta =
    PRIORITY_RANK[left.priority] -
    PRIORITY_RANK[right.priority]

  if (priorityDelta !== 0) {
    return priorityDelta
  }

  const sourceDelta =
    DECISION_STATE_SOURCE_TIEBREAK_ORDER.indexOf(
      left.source,
    ) -
    DECISION_STATE_SOURCE_TIEBREAK_ORDER.indexOf(
      right.source,
    )

  if (sourceDelta !== 0) {
    return sourceDelta
  }

  const leftInstant =
    Date.parse(left.observed_at)

  const rightInstant =
    Date.parse(right.observed_at)

  if (
    Number.isFinite(leftInstant) &&
    Number.isFinite(rightInstant) &&
    leftInstant !== rightInstant
  ) {
    // Sinal mais antigo (pendente há mais tempo) vence — vira
    // relevante primeiro.
    return leftInstant - rightInstant
  }

  const leftKey =
    `${left.source}:${left.summary}`

  const rightKey =
    `${right.source}:${right.summary}`

  return leftKey < rightKey
    ? -1
    : leftKey > rightKey
      ? 1
      : 0
}

// SLA (companion-client-sla.ts) mede tempo NA ETAPA DE CRM
// (stage_entered_at até agora) — é um sinal DIFERENTE de "cliente
// aguardando resposta" (companion-client-relationship.ts), que mede a
// última mensagem da conversa. Um SLA em risco alto pode coexistir com
// `waiting.state !== 'customer_waiting_for_seller'` (o vendedor já
// respondeu, ou não há mensagem pendente de nenhum lado) — nesse caso,
// recomendar "responder o cliente" inventaria uma mensagem pendente que
// não existe (achado do Codex, PR #280, rodada 1). Só usa `respond`
// quando o waiting real confirma o cliente aguardando; caso contrário,
// descreve o risco de estagnação na etapa sem inventar uma mensagem
// pendente.
function buildClientSlaCandidate(
  clientContext: CompanionClientContext | null,
): Candidate | null {
  if (!clientContext) {
    return null
  }

  const sla =
    clientContext.sla

  if (
    !sla.configured ||
    !sla.applicable ||
    sla.risk !== 'high'
  ) {
    return null
  }

  const stageDescription =
    sla.stage_label
      ? `etapa "${sla.stage_label}"`
      : 'etapa atual do ciclo'

  const isCustomerWaiting =
    clientContext.waiting.state ===
    'customer_waiting_for_seller'

  if (isCustomerWaiting) {
    return {
      source: 'client_sla',
      priority: 'critical',
      kind: 'respond',

      summary:
        'Cliente aguardando resposta acima do limite de SLA.',

      reason:
        `SLA da ${stageDescription} em risco alto (${sla.elapsed_minutes ?? '?'} min decorridos) e o cliente ainda aguarda resposta.`,

      recommended_action:
        'Responder o cliente agora para não violar o SLA.',

      evidence_message_ids: [],
      memory_ids: [],

      observed_at:
        clientContext.generated_at,

      resolve_condition:
        'Resolve quando o vendedor responder ao cliente.',
    }
  }

  // Lead nunca contatado (nenhuma interação conhecida) é um caso
  // distinto de "oportunidade estagnada" genérica — recomendar
  // "avaliar o próximo passo" para um lead com zero interações omite a
  // ação óbvia e concreta: fazer o primeiro contato (achado do Codex,
  // PR #280, rodada 3).
  if (clientContext.relationship.known_interaction_count === 0) {
    return {
      source: 'client_sla',
      priority: 'critical',
      kind: 'respond',

      summary:
        'Lead sem nenhum contato registrado, acima do limite de SLA.',

      reason:
        `SLA da ${stageDescription} em risco alto (${sla.elapsed_minutes ?? '?'} min decorridos) e nenhuma interação foi registrada com este lead ainda.`,

      recommended_action:
        'Fazer o primeiro contato com o lead.',

      evidence_message_ids: [],
      memory_ids: [],

      observed_at:
        clientContext.generated_at,

      resolve_condition:
        'Resolve quando o primeiro contato com o lead for registrado.',
    }
  }

  return {
    source: 'client_sla',
    priority: 'critical',
    kind: 'escalate',

    summary:
      'Oportunidade estagnada na etapa acima do limite de SLA.',

    reason:
      `SLA da ${stageDescription} em risco alto (${sla.elapsed_minutes ?? '?'} min decorridos), sem mensagem do cliente pendente de resposta.`,

    recommended_action:
      'Avaliar a oportunidade e decidir o próximo passo para avançar de etapa — não é uma mensagem do cliente aguardando resposta.',

    evidence_message_ids: [],
    memory_ids: [],

    observed_at:
      clientContext.generated_at,

    resolve_condition:
      'Resolve quando a etapa avançar ou o SLA for reconfigurado/atendido.',
  }
}

// Waiting (companion-client-relationship.ts) é um sinal independente
// de SLA (companion-client-sla.ts) — uma empresa sem SLA configurado,
// ou com SLA não crítico, ainda pode ter um cliente aguardando
// resposta há horas. Antes, esse sinal só era considerado DENTRO do
// gate de SLA crítico, então nenhuma empresa sem SLA configurado
// produzia intervenção nenhuma para um cliente esperando (achado do
// Codex, PR #280, rodada 3). Não invento um limiar de "quanto tempo é
// demais" (mandato §11: sem thresholds operacionais arbitrários) —
// prioridade 'high', igual à classificação explícita de "cliente
// aguardando" em companion-seller-product-contract.md:375-379 (seção
// 4.4, categoria ALTA). Usar 'medium' aqui subestimava o sinal e
// arriscava perder a vaga de card para candidatos menos urgentes
// (achado do Codex, PR #280, rodada 4).
function buildCustomerWaitingCandidate(
  clientContext: CompanionClientContext | null,
): Candidate | null {
  if (!clientContext) {
    return null
  }

  if (
    clientContext.waiting.state !==
    'customer_waiting_for_seller'
  ) {
    return null
  }

  const slaAlreadyCovers =
    clientContext.sla.configured &&
    clientContext.sla.applicable &&
    clientContext.sla.risk === 'high'

  if (slaAlreadyCovers) {
    return null
  }

  return {
    source: 'customer_waiting',
    priority: 'high',
    kind: 'respond',

    summary:
      'Cliente aguardando resposta.',

    reason:
      clientContext.waiting.waiting_since
        ? `Cliente aguarda resposta desde ${clientContext.waiting.waiting_since}.`
        : 'Cliente aguarda resposta.',

    recommended_action:
      'Responder o cliente.',

    evidence_message_ids: [],
    memory_ids: [],

    observed_at:
      clientContext.waiting.waiting_since ??
      clientContext.generated_at,

    resolve_condition:
      'Resolve quando o vendedor responder ao cliente.',
  }
}

// Fuso comercial usado para interpretar "hoje" em datas de negócio —
// o mesmo fuso que o próprio produtor de compromissos usa para
// interpretar `scheduled_at`/`proposed_at`
// (stateful-copilot-execution-plan.ts:1129: "Interprete datas
// comerciais no fuso America/Sao_Paulo"), e o mesmo padrão já usado
// em `sales-copilot-transcript.ts` para resolver datas relativas
// ("hoje", "amanhã") em texto de vendedor. Comparar em UTC (versão
// anterior) confundia "hoje" perto da virada de dia em UTC que ainda
// é o mesmo dia em São Paulo, ou vice-versa (achado do Codex, PR
// #280, rodada 5).
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

// Dois instantes ISO caem no mesmo dia-calendário no fuso comercial.
// Usado apenas para decidir se um compromisso confirmado ainda não
// vencido é "hoje" (mandato §35, Cenário 3 do roadmap: um retorno
// agendado para mais tarde no mesmo dia deve virar card mesmo sem
// estar vencido).
function isSameBusinessCalendarDay(
  instantA: number,
  instantB: number,
): boolean {
  const formatter = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  )

  return (
    formatter.format(new Date(instantA)) ===
    formatter.format(new Date(instantB))
  )
}

function buildCycleCommitmentCandidates(
  cycleMemory: Awaited<
    ReturnType<typeof loadCanonicalCycleCommercialMemory>
  >,
  referenceTime: string,
): Candidate[] {
  if (!cycleMemory) {
    return []
  }

  const referenceInstant =
    Date.parse(referenceTime)

  // Só 'confirmed' representa aceite bilateral comprovado
  // (stateful-copilot-execution-plan.ts:1031-1033: uma proposta
  // permanece 'proposed' até a outra parte aceitar explicitamente).
  // Tratar um compromisso ainda 'proposed' como vencido ou próximo
  // inventaria uma obrigação firme que nunca foi aceita pelo cliente
  // (achado do Codex, PR #280, rodada 1).
  const confirmedActiveCommitmentsWithValidSchedule =
    cycleMemory.commitments.filter(
      (commitment) =>
        commitment.memory_status === 'active' &&
        commitment.commitment_status === 'confirmed' &&
        typeof commitment.scheduled_at === 'string' &&
        Number.isFinite(
          Date.parse(commitment.scheduled_at),
        ),
    )

  const overdueCandidates =
    confirmedActiveCommitmentsWithValidSchedule
      .filter(
        (commitment) =>
          Date.parse(
            commitment.scheduled_at as string,
          ) < referenceInstant,
      )
      .map(
        (commitment): Candidate => ({
          source: 'cycle_commitment',
          priority: 'high',
          kind: 'follow_up',

          summary:
            commitment.summary,

          reason:
            `Compromisso agendado para ${commitment.scheduled_at} já venceu.`,

          // O contrato de estado registra aceite bilateral, mas não
          // QUAL parte assumiu a obrigação — um compromisso confirmado
          // pode ser do vendedor ou do cliente (ex.: "cliente enviará
          // os documentos amanhã"). Ação neutra, sem presumir que cabe
          // ao vendedor cumpri-lo (achado do Codex, PR #280, rodada 2).
          recommended_action:
            'Confirmar com o cliente o andamento do compromisso e reagendar explicitamente se necessário.',

          evidence_message_ids:
            commitment.evidence_message_ids,

          memory_ids: [
            commitment.memory_id,
          ],

          observed_at:
            commitment.scheduled_at as string,

          resolve_condition:
            'Resolve quando o compromisso for cumprido ou reagendado.',
        }),
      )

  // Um compromisso confirmado ainda NÃO vencido, mas previsto para
  // hoje, também muda a decisão imediata do vendedor — é o Cenário 3
  // do roadmap (sessão pessoal + agenda comercial próxima): sem este
  // candidato, uma sessão sem sinal comercial na conversa atual
  // resolvia para `give_space` com zero cards, mesmo havendo um
  // retorno comercial previsto para o mesmo dia (achado do Codex,
  // PR #280, rodada 4). `>=` aqui (em vez de `>`) fecha a partição com
  // o filtro de vencidos acima (`<`), sem lacuna nem sobreposição no
  // instante exato do vencimento.
  const upcomingTodayCandidates =
    confirmedActiveCommitmentsWithValidSchedule
      .filter((commitment) => {
        const scheduledInstant = Date.parse(
          commitment.scheduled_at as string,
        )

        return (
          scheduledInstant >= referenceInstant &&
          isSameBusinessCalendarDay(
            scheduledInstant,
            referenceInstant,
          )
        )
      })
      .map(
        (commitment): Candidate => ({
          source: 'cycle_commitment',
          priority: 'high',
          kind: 'follow_up',

          summary:
            commitment.summary,

          reason:
            `Compromisso confirmado previsto para hoje (${commitment.scheduled_at}).`,

          recommended_action:
            'Confirmar com o cliente a agenda do compromisso previsto para hoje.',

          evidence_message_ids:
            commitment.evidence_message_ids,

          memory_ids: [
            commitment.memory_id,
          ],

          observed_at:
            commitment.scheduled_at as string,

          resolve_condition:
            'Resolve quando o compromisso for cumprido, reagendado, ou passar a estar vencido.',
        }),
      )

  // `reschedule_requested` não é "cancelado" nem uma proposta nunca
  // aceita — é um compromisso que já teve aceite bilateral, mas uma
  // das partes pediu para mudar o horário; o horário original não
  // pode mais ser tratado como confirmado, mas o compromisso continua
  // pendente de reconciliação (contrato de mensagens, "reschedule_requested
  // não confirma o horário original — trate como pendente de
  // reconciliação", message-intelligence/v2/execution-plan.ts:153).
  // Antes, o filtro `=== 'confirmed'` das duas listas acima excluía
  // esses itens por completo — um compromisso vencido ou previsto
  // para hoje desaparecia exatamente quando alguém pedia para mudar o
  // horário (achado do Codex, PR #280, rodada 5). Prioridade 'medium':
  // não é uma obrigação vencida com data certa (não inflaciono para
  // 'high' como o vencido), mas também não é só "descoberta
  // incompleta" — precisa de reconciliação ativa com o cliente.
  const rescheduleRequestedCandidates: Candidate[] =
    cycleMemory.commitments
      .filter(
        (commitment) =>
          commitment.memory_status === 'active' &&
          commitment.commitment_status ===
            'reschedule_requested',
      )
      .map(
        (commitment): Candidate => ({
          source: 'cycle_commitment',
          priority: 'medium',
          kind: 'follow_up',

          summary:
            commitment.summary,

          reason:
            'Pedido de reagendamento pendente — o horário original deste compromisso não está mais confirmado.',

          recommended_action:
            'Confirmar com o cliente o novo horário do compromisso.',

          evidence_message_ids:
            commitment.evidence_message_ids,

          memory_ids: [
            commitment.memory_id,
          ],

          observed_at:
            commitment.scheduled_at ??
            commitment.proposed_at ??
            referenceTime,

          resolve_condition:
            'Resolve quando um novo horário for confirmado ou o compromisso for cancelado.',
        }),
      )

  return [
    ...overdueCandidates,
    ...upcomingTodayCandidates,
    ...rescheduleRequestedCandidates,
  ]
}

function buildCommercialRiskCandidates(
  currentReading: CanonicalCommercialReadingSource | null,
): Candidate[] {
  if (!currentReading) {
    return []
  }

  const risks =
    currentReading.reading.risks

  const candidates: Candidate[] = []

  for (const objection of risks.customer_objections) {
    if (objection.severity === 'low') {
      continue
    }

    candidates.push({
      source: 'commercial_risk',
      priority:
        objection.severity === 'high'
          ? 'high'
          : 'medium',
      kind: 'handle_objection',

      summary:
        objection.summary,

      reason:
        'Objeção do cliente ainda em aberto na leitura atual.',

      recommended_action:
        'Tratar a objeção antes de avançar a conversa.',

      evidence_message_ids:
        objection.evidence_message_ids,

      memory_ids:
        objection.memory_ids,

      observed_at:
        currentReading.state_updated_at,

      resolve_condition:
        'Resolve quando a objeção for tratada e a próxima leitura não mais listá-la.',
    })
  }

  for (const risk of risks.service_risks) {
    if (risk.severity === 'low') {
      continue
    }

    candidates.push({
      source: 'commercial_risk',
      priority:
        risk.severity === 'high'
          ? 'high'
          : 'medium',
      kind: 'confirm_information',

      summary:
        risk.summary,

      reason:
        'Risco de atendimento identificado na leitura atual.',

      recommended_action:
        'Confirmar a informação/promessa antes de seguir.',

      evidence_message_ids:
        risk.evidence_message_ids,

      memory_ids:
        risk.memory_ids,

      observed_at:
        currentReading.state_updated_at,

      resolve_condition:
        'Resolve quando o risco for confirmado/mitigado e a próxima leitura não mais listá-lo.',
    })
  }

  return candidates
}

// Só um sinal de adherence por leitura atual (não por leitura
// cross-conversation, que é sempre histórica e nunca sobe — mandato
// §14, cenário #9). `off_method`/`partially_on_method` da leitura
// ATUAL já significam, por construção, que o desvio está acontecendo
// na interação corrente — não é preciso reconstruir "está prestes a
// avançar" separadamente.
function buildMethodAdherenceCandidate(
  currentReading: CanonicalCommercialReadingSource | null,
): Candidate | null {
  if (!currentReading) {
    return null
  }

  const adherence =
    currentReading.reading.method.adherence

  if (
    adherence.status !== 'off_method' &&
    adherence.status !== 'partially_on_method'
  ) {
    return null
  }

  const recovery =
    currentReading.reading.method.recovery_guidance

  const adherenceStatus:
    CommercialReadingMethodAdherenceStatus =
    adherence.status

  return {
    source: 'method_adherence',
    priority:
      adherenceStatus === 'off_method'
        ? 'high'
        : 'medium',
    kind:
      recovery && recovery.missing_information.length > 0
        ? 'deepen_discovery'
        : 'clarify',

    summary:
      adherence.summary,

    reason:
      adherence.what_happened ??
      adherence.summary,

    recommended_action:
      recovery?.recommended_move ??
      'Retomar a etapa adequada do método antes de avançar.',

    evidence_message_ids:
      adherence.evidence_message_ids,

    memory_ids:
      adherence.memory_ids,

    observed_at:
      currentReading.state_updated_at,

    resolve_condition:
      'Resolve quando a próxima interação retomar a etapa adequada do método.',
  }
}

// Seller coaching pertence à ANÁLISE por padrão (mandato §14) — só sobe
// para AGORA quando exige correção agora. Nunca a partir de
// cross_conversation_coaching (sempre histórico, de outra conversa, e
// nunca a interação atual — cenário #9). Dois caminhos, ambos só a
// partir de `current_reading.reading.improvement_points` (a leitura da
// interação atual, nunca da leitura de outra conversa):
// - kinds sempre urgentes: representam um erro/risco ativo
//   independente do próximo passo (informação incorreta, objeção mal
//   tratada, compromisso perdido, risco de promessa);
// - kinds de risco-no-próximo-passo: só sobem quando a própria análise
//   recomenda avançar de novo (negociar/apresentar/pedir decisão/etc)
//   — exatamente o exemplo do mandato: "apresentou preço antes de
//   entender impacto" só é intervenção se o vendedor está no meio da
//   negociação de preço agora.
const SELLER_COACHING_ALWAYS_URGENT_KINDS: readonly CommercialReadingImprovementKind[] = [
  'incorrect_information',
  'poor_objection_handling',
  'missed_commitment',
  'promise_risk',
]

const SELLER_COACHING_NEXT_STEP_RISK_KINDS: readonly CommercialReadingImprovementKind[] = [
  'premature_price',
  'premature_presentation',
  'advance_without_confirmation',
]

const SELLER_COACHING_ADVANCING_DECISIONS: readonly CommercialReadingDecision[] = [
  'negotiate',
  'ask_for_decision',
  'present_solution',
  'send_material',
  'propose_call',
  'propose_meeting',
  'propose_visit',
  'close',
]

function buildSellerCoachingCandidate(
  currentReading: CanonicalCommercialReadingSource | null,
): Candidate | null {
  if (!currentReading) {
    return null
  }

  const bestApproachDecision =
    currentReading.reading.best_approach.decision

  const improvementPoints =
    currentReading.reading.improvement_points

  // Busca os kinds sempre-urgentes PRIMEIRO — a ordem do array de
  // improvement_points não é uma garantia de prioridade (achado do
  // Codex, PR #280, rodada 2). Um `.find()` único na ordem do array
  // poderia escolher um risco de próximo-passo (medium) antes de um
  // problema sempre-urgente (high) presente mais adiante no mesmo
  // array, descartando silenciosamente o mais importante.
  const relevantPoint =
    improvementPoints.find(
      (point) =>
        SELLER_COACHING_ALWAYS_URGENT_KINDS.includes(
          point.kind,
        ),
    ) ??
    improvementPoints.find(
      (point) =>
        SELLER_COACHING_NEXT_STEP_RISK_KINDS.includes(
          point.kind,
        ) &&
        SELLER_COACHING_ADVANCING_DECISIONS.includes(
          bestApproachDecision,
        ),
    )

  if (!relevantPoint) {
    return null
  }

  const isAlwaysUrgent =
    SELLER_COACHING_ALWAYS_URGENT_KINDS.includes(
      relevantPoint.kind,
    )

  return {
    source: 'seller_coaching',
    priority:
      isAlwaysUrgent
        ? 'high'
        : 'medium',
    kind:
      isAlwaysUrgent
        ? 'clarify'
        : 'deepen_discovery',

    summary:
      relevantPoint.summary,

    reason:
      relevantPoint.why_it_matters,

    recommended_action:
      relevantPoint.how_to_improve,

    evidence_message_ids:
      relevantPoint.evidence_message_ids,

    memory_ids:
      relevantPoint.memory_ids,

    observed_at:
      currentReading.state_updated_at,

    resolve_condition:
      'Resolve quando a próxima interação corrigir a condução apontada.',
  }
}

function buildInsufficientInformationCandidate(
  currentReading: CanonicalCommercialReadingSource | null,
): Candidate | null {
  if (!currentReading) {
    return null
  }

  const bestApproach =
    currentReading.reading.best_approach

  if (bestApproach.decision !== 'insufficient_information') {
    return null
  }

  return {
    source: 'insufficient_information',
    priority: 'medium',
    kind: 'insufficient_information',

    summary:
      'Descoberta insuficiente para decidir o próximo passo.',

    reason:
      bestApproach.reason,

    recommended_action:
      'Aprofundar a descoberta antes de avançar para a próxima etapa.',

    evidence_message_ids:
      bestApproach.evidence_message_ids,

    memory_ids:
      bestApproach.memory_ids,

    observed_at:
      currentReading.state_updated_at,

    resolve_condition:
      'Resolve quando a informação faltante for obtida.',
  }
}

function buildCurrentMoment({
  currentReading,
  clientContext,
  referenceTime,
}: {
  currentReading: CanonicalCommercialReadingSource | null
  clientContext: CompanionClientContext | null
  referenceTime: string
}): DecisionStateCurrentMoment {
  const commercialRelevance =
    currentReading?.reading.commercial_relevance ??
    null

  const lastInteractionAt =
    clientContext?.relationship.last_interaction_at ??
    null

  // `last_interaction_at` (client_context) é a evidência primária de
  // atividade de sessão — reflete diretamente quando o cliente/vendedor
  // interagiu por último. Quando ela existe, é usada sozinha (mesmo
  // comportamento desde a rodada 3): uma leitura `non_commercial`
  // recém-computada não prova sessão ativa se a própria relação já
  // está fora da janela.
  //
  // Quando `client_context` está indisponível (nulo ou rejeitado por
  // escopo/instante), não há evidência primária nenhuma — mas
  // `current_reading` ainda é aceito mesmo antigo pelo caminho
  // best-effort (só é rejeitado por escopo ou por ser do futuro,
  // nunca por estar simplesmente desatualizado). Sem um fallback, uma
  // leitura `non_commercial` de dias atrás com `client_context: null`
  // fazia `is_active_session` cair em `null` — tratado como "sessão
  // ainda pode estar ativa" — suprimindo sinais operacionais frescos
  // indefinidamente para uma sessão pessoal que já não existe mais
  // (achado do Codex, PR #280, rodada 5). Nesse caso (só nesse),
  // `state_updated_at` da própria leitura serve de evidência
  // secundária: se a leitura que classificou `non_commercial` já é
  // antiga, isso já é evidência de que não é uma sessão pessoal
  // acontecendo agora.
  const referenceInstant =
    Date.parse(referenceTime)

  const freshnessEvidenceInstant: number | null =
    (() => {
      if (lastInteractionAt) {
        const lastInstant =
          Date.parse(lastInteractionAt)

        return Number.isFinite(lastInstant)
          ? lastInstant
          : null
      }

      if (currentReading?.state_updated_at) {
        const stateUpdatedInstant = Date.parse(
          currentReading.state_updated_at,
        )

        return Number.isFinite(
          stateUpdatedInstant,
        )
          ? stateUpdatedInstant
          : null
      }

      return null
    })()

  let isActiveSession: boolean | null =
    null

  if (
    freshnessEvidenceInstant !== null &&
    Number.isFinite(referenceInstant)
  ) {
    isActiveSession =
      referenceInstant -
        freshnessEvidenceInstant <=
      DECISION_STATE_SESSION_GAP_MS
  }

  return {
    commercial_relevance:
      commercialRelevance,

    is_active_session:
      isActiveSession,

    last_interaction_at:
      lastInteractionAt,

    session_gap_ms:
      DECISION_STATE_SESSION_GAP_MS,
  }
}

function buildOperationalSignalAvailability({
  clientContext,
  cycleMemoryAvailable,
}: {
  clientContext: CompanionClientContext | null
  cycleMemoryAvailable: boolean
}): DecisionStateOperationalSignalAvailabilityMap {
  return {
    crm_pipeline:
      clientContext
        ? 'AVAILABLE_NOW'
        : 'NOT_AVAILABLE',

    // Não existe integração real de agenda/calendário (achado do
    // audit) — a única aproximação real é a sugestão de agenda da
    // própria leitura comercial (IA, requer confirmação humana), nunca
    // um compromisso de calendário de fato.
    agenda: 'PARTIAL',

    sla:
      clientContext?.sla.configured
        ? 'AVAILABLE_NOW'
        : 'NOT_AVAILABLE',

    waiting:
      clientContext
        ? 'AVAILABLE_NOW'
        : 'NOT_AVAILABLE',

    commitments:
      cycleMemoryAvailable
        ? 'AVAILABLE_NOW'
        : 'NOT_AVAILABLE',

    // Não existe fonte canônica de inatividade por oportunidade (só
    // agregado por vendedor) — sempre indisponível, nunca simulado.
    opportunity_inactivity: 'NOT_AVAILABLE',
  }
}

/**
 * Carrega o Decision State canônico para uma conversa em um dado
 * `reference_time`.
 *
 * Persistência: runtime-only (nenhuma tabela, nenhum evento novo). Cada
 * chamada é recomputada a partir das fontes canônicas já persistidas —
 * Decision State em si nunca é a fonte de verdade de nada, apenas
 * combina e prioriza. Ver relatório da FASE 16.3E para a justificativa
 * completa (menor arquitetura seg
 * ura suficiente; nenhum julgamento novo que precise de trilha de
 * auditoria própria além da provenance já carregada das fontes).
 *
 * Replay-safe: `current_reading` e `client_context` são validados
 * contra escopo (company/cycle/conversation) e contra `reference_time`
 * antes de uso — nunca promove leitura futura. `client_context`
 * (opcional, fornecido pelo chamador autenticado) degrada para
 * indisponível em qualquer mismatch, sem derrubar o restante. Nenhuma
 * prova temporal usa `generated_at` como instante semântico — sempre
 * `state_updated_at` (lição do HOTFIX 16.3D.1).
 */
export async function loadCanonicalDecisionState({
  admin,
  company_id,
  cycle_id,
  conversation_key,
  reference_time,
  current_reading,
  client_context,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  current_reading:
    CanonicalCommercialReadingSource | null

  client_context:
    CompanionClientContext | null
}): Promise<DecisionState | null> {
  const referenceTime =
    normalizeDateOrNull(reference_time)

  if (!referenceTime) {
    return null
  }

  if (
    current_reading &&
    (
      current_reading.company_id !== company_id ||
      current_reading.cycle_id !== cycle_id ||
      current_reading.conversation_key !== conversation_key
    )
  ) {
    return null
  }

  // Mesma disciplina de FASE 16.3D (achado do Codex, PR #278, rodada
  // 3): loadCanonicalCommercialReadingSource() aplica seu corte por
  // reference_time só durante a própria carga — o objeto devolvido não
  // retém esse reference_time. Um current_reading reusado de uma
  // chamada com reference_time posterior é tratado como escopo
  // inválido, não como leitura atual.
  if (
    current_reading &&
    Date.parse(current_reading.generated_at) >
      Date.parse(referenceTime)
  ) {
    return null
  }

  // client_context é suplementar (fornecido pelo chamador
  // autenticado) — um mismatch de escopo o torna indisponível para
  // esta chamada, mas nunca derruba o restante do Decision State.
  //
  // `loadCompanionClientContext` grava `generated_at` como o próprio
  // `reference_time` usado para computar waiting/SLA/CRM
  // (companion-client-context-loader.ts:1029-1030) — não é um
  // timestamp de escrita, é o instante EXATO que essas leituras
  // consideram "agora". Um client_context reusado de OUTRO
  // reference_time (não só um futuro) já é uma fotografia diferente:
  // pode ter perdido um limiar de SLA cruzado ou reter um estágio de
  // CRM já superado. Exigir igualdade exata, não apenas "não é do
  // futuro" (achado do Codex, PR #280, rodada 1).
  let clientContext = client_context

  if (
    clientContext &&
    (
      clientContext.identity.company_id !== company_id ||
      clientContext.identity.cycle_id !== cycle_id ||
      clientContext.identity.conversation_key !==
        conversation_key ||
      Date.parse(clientContext.generated_at) !==
        Date.parse(referenceTime)
    )
  ) {
    clientContext = null
  }

  // Carregada UMA vez aqui e repassada para
  // loadCanonicalMethodCoachingSource() abaixo — esse agregador também
  // precisa de conversation_keys do ciclo para descobrir coaching
  // cross-conversation, e sem repasse ele paginaria a mesma consulta
  // de novo internamente (achado do Codex, PR #280, rodada 3).
  let cycleMemory:
    Awaited<ReturnType<typeof loadCanonicalCycleCommercialMemory>> =
      null

  try {
    cycleMemory =
      await loadCanonicalCycleCommercialMemory({
        admin,
        company_id,
        cycle_id,
        reference_time: referenceTime,
      })
  } catch (error) {
    console.error(
      '[CANONICAL_DECISION_STATE] cycle memory lookup failed, continuing without it',
      { company_id, cycle_id, error },
    )

    cycleMemory = null
  }

  let methodCoaching:
    Awaited<ReturnType<typeof loadCanonicalMethodCoachingSource>> =
      null

  try {
    methodCoaching =
      await loadCanonicalMethodCoachingSource({
        admin,
        company_id,
        cycle_id,
        conversation_key,
        reference_time: referenceTime,
        current_reading,
        cycle_memory: cycleMemory,
      })
  } catch (error) {
    console.error(
      '[CANONICAL_DECISION_STATE] method/coaching lookup failed, continuing without it',
      { company_id, cycle_id, conversation_key, error },
    )

    methodCoaching = null
  }

  const currentMoment =
    buildCurrentMoment({
      currentReading: current_reading,
      clientContext,
      referenceTime,
    })

  let candidates: Candidate[] = [
    buildClientSlaCandidate(clientContext),
    buildCustomerWaitingCandidate(clientContext),
    ...buildCycleCommitmentCandidates(
      cycleMemory,
      referenceTime,
    ),
    ...buildCommercialRiskCandidates(current_reading),
    buildMethodAdherenceCandidate(current_reading),
    buildSellerCoachingCandidate(current_reading),
    buildInsufficientInformationCandidate(current_reading),
  ].filter(
    (candidate): candidate is Candidate =>
      candidate !== null,
  )

  // Achado do Codex (PR #280, rodada 3): `commercial_relevance`
  // reflete a leitura atual, mas se a sessão de fato expirou
  // (`is_active_session === false` — mais de
  // DECISION_STATE_SESSION_GAP_MS desde a última interação), não há
  // conversa pessoal acontecendo agora para preservar naturalidade —
  // suprimir/rebaixar um sinal operacional fresco (SLA, compromisso)
  // por causa de uma sessão pessoal já encerrada seria o comportamento
  // errado. `null` (sem client_context, sem evidência de frescor)
  // mantém o comportamento conservador anterior.
  const isNonCommercialMoment =
    currentMoment.commercial_relevance ===
      'non_commercial' &&
    currentMoment.is_active_session !== false

  if (isNonCommercialMoment) {
    candidates = candidates.filter(
      (candidate) =>
        !isPitchAdvancingCandidate(candidate),
    )
  }

  candidates.sort(compareCandidates)

  const bestApproach =
    current_reading?.reading.best_approach ??
    null

  function toInterventionCard(
    candidate: Candidate,
  ): DecisionStateInterventionCard {
    return {
      source: candidate.source,
      priority: candidate.priority,
      summary: candidate.summary,
      reason: candidate.reason,
      recommended_action: candidate.recommended_action,
      evidence_message_ids: candidate.evidence_message_ids,
      memory_ids: candidate.memory_ids,
      observed_at: candidate.observed_at,
      resolve_condition: candidate.resolve_condition,
    }
  }

  let primaryDecision: DecisionStatePrimaryDecision
  let interventions: DecisionStateInterventionCard[]

  if (isNonCommercialMoment) {
    // Mandato §7: `give_space` é sempre a decisão principal numa
    // sessão pessoal — nunca é superada por um candidato operacional
    // sobrevivente (SLA/compromisso/risco defensivo, já filtrados de
    // sinais "de avanço de venda" acima). Esses candidatos não
    // desaparecem: continuam visíveis como intervenção, só nunca como
    // decisão principal (achado do Codex, PR #280, rodada 2 — antes,
    // um candidato operacional de prioridade alta virava a decisão
    // principal e era removido de `interventions` pelo `slice(1, 3)`,
    // fazendo AGORA parecer que a sessão pessoal nunca existiu).
    primaryDecision = {
      kind: 'give_space',
      source: null,

      summary:
        'Sessão atual não é comercial.',

      reason:
        'Preservar naturalidade — não forçar avanço de venda nesta interação.',

      recommended_action:
        'Responder no tom da conversa atual sem empurrar a venda; a oportunidade comercial permanece preservada em ANÁLISE.',

      evidence_message_ids: [],
      memory_ids: [],
    }

    interventions =
      candidates.slice(0, 2).map(toInterventionCard)
  } else if (candidates.length > 0) {
    const top =
      candidates[0]

    primaryDecision = {
      kind: top.kind,
      source: top.source,
      summary: top.summary,
      reason: top.reason,
      recommended_action: top.recommended_action,
      evidence_message_ids: top.evidence_message_ids,
      memory_ids: top.memory_ids,
    }

    interventions =
      candidates.slice(1, 3).map(toInterventionCard)
  } else if (bestApproach) {
    primaryDecision = {
      kind: bestApproach.decision,
      source: null,
      summary: bestApproach.reason,
      reason: bestApproach.reason,

      recommended_action:
        bestApproach.decision === 'no_intervention'
          ? 'Nenhuma ação necessária agora.'
          : `Canal recomendado: ${bestApproach.channel}.`,

      evidence_message_ids:
        bestApproach.evidence_message_ids,

      memory_ids:
        bestApproach.memory_ids,
    }

    interventions = []
  } else {
    primaryDecision = {
      kind: 'no_intervention',
      source: null,

      summary:
        'Nenhuma leitura comercial disponível e nenhum sinal operacional pendente.',

      reason:
        'Sem evidência suficiente para recomendar qualquer ação agora.',

      recommended_action:
        'Nenhuma ação necessária agora.',

      evidence_message_ids: [],
      memory_ids: [],
    }

    interventions = []
  }

  return {
    company_id,
    cycle_id,
    conversation_key,
    reference_time: referenceTime,

    current_moment: currentMoment,
    primary_decision: primaryDecision,
    interventions,

    operational_signal_availability:
      buildOperationalSignalAvailability({
        clientContext,
        cycleMemoryAvailable: cycleMemory !== null,
      }),

    provenance: {
      conversation_key,
      cycle_id,

      analise_source_event_id:
        current_reading?.source_event_id ??
        null,

      analise_state_record_id:
        current_reading?.state_record_id ??
        null,

      analise_state_version:
        current_reading?.state_version ??
        null,

      analise_state_updated_at:
        current_reading?.state_updated_at ??
        null,

      agora_updated_at:
        methodCoaching?.method.agora_stage?.updated_at ??
        null,

      client_context_generated_at:
        clientContext?.generated_at ??
        null,
    },
  }
}
