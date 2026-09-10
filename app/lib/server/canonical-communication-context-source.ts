import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CommercialReadingDecision,
  CommercialReadingEvidenceItem,
  CommercialReadingRisk,
} from '@/app/lib/companion/commercial-reading-contract'

import type {
  CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

import {
  loadCanonicalCycleCommercialMemory,
  type CanonicalCycleCommercialMemory,
} from './canonical-cycle-commercial-memory-source'

import {
  loadCanonicalMethodCoachingSource,
  type CanonicalMethodCoachingSource,
} from './canonical-method-coaching-source'

import type {
  DecisionState,
  DecisionStateCurrentMoment,
  DecisionStateInterventionCard,
  DecisionStatePrimaryDecision,
} from './canonical-decision-state-source'

// ---------------------------------------------------------------------------
// FASE 16.3F — Communication Context
//
// Camada canônica que responde: "qual contexto o motor de mensagem precisa
// para executar a decisão já tomada, sem reconstruir a venda?"
//
// Contrato de autoridade (mandato §8, respeitado por construção neste
// arquivo — nunca reinterpretado):
//   - Decision State (16.3E) é a ÚNICA autoridade sobre decisão/prioridade/
//     intervenção/silêncio. Este módulo NUNCA promove um candidato próprio
//     nem recalcula prioridade — `dominant_intent`/`supporting_context` são
//     `decision_state.primary_decision`/`decision_state.interventions`
//     reaproveitados verbatim (Decision State já aplica supressão de
//     avanço-de-venda e densidade máxima de 2, não há motivo para refiltrar).
//   - Commercial Reading (16.3B) é autoridade sobre a leitura da venda
//     (objeções/riscos/abordagem/preferências do cliente).
//   - Cycle Memory (16.3C) é autoridade sobre memória comercial ativa
//     (compromissos/fatos do ciclo).
//   - Method/Coaching (16.3D) é autoridade sobre aderência/etapa/coaching.
//
// Este módulo só RESOLVE detalhe: dado que Decision State já apontou QUAL
// candidato decide (via `source`, mandato 16.3F — extensão aditiva de
// `DecisionStatePrimaryDecision`), busca o objeto completo correspondente
// nas fontes suplementares (por `memory_id`/`summary` já copiados
// verbatim pelos próprios candidatos do Decision State) — nunca escaneia
// essas fontes procurando candidatos novos por conta própria.
// ---------------------------------------------------------------------------

export const COMMUNICATION_CONTEXT_NON_EXECUTABLE_REASONS = [
  'no_decision_state',
  'decision_state_scope_mismatch',
] as const

export type CommunicationContextNonExecutableReason =
  (typeof COMMUNICATION_CONTEXT_NON_EXECUTABLE_REASONS)[number]

// Objetivo dominante por `decision_kind` — restatement determinístico do
// que o próprio Decision State já decidiu (mandato §10: "não inventar um
// novo objetivo que contradiga Decision State"). Exaustivo sobre
// `CommercialReadingDecision` para nunca deixar um decision_kind sem
// communication_goal.
const COMMUNICATION_GOAL_BY_DECISION: Record<
  CommercialReadingDecision,
  string
> = {
  respond: 'Responder ao cliente.',
  clarify: 'Corrigir informação ou condução equivocada.',
  ask: 'Fazer uma pergunta ao cliente.',
  deepen_discovery: 'Aprofundar a descoberta antes de avançar.',
  present_solution: 'Apresentar a solução/proposta.',
  compare: 'Comparar alternativas com o cliente.',
  demonstrate_value: 'Demonstrar valor da solução.',
  handle_objection: 'Tratar a objeção específica do cliente.',
  send_material: 'Enviar material de apoio ao cliente.',
  confirm_information: 'Confirmar informação com o cliente.',
  propose_call: 'Propor uma ligação.',
  propose_meeting: 'Propor uma reunião.',
  propose_visit: 'Propor uma visita.',
  negotiate: 'Negociar condições com o cliente.',
  ask_for_decision: 'Pedir a decisão do cliente.',
  set_commitment: 'Confirmar um compromisso com o cliente.',
  wait: 'Aguardar antes de agir.',
  give_space: 'Preservar naturalidade; não avançar a venda.',
  follow_up: 'Retomar compromisso ou contato pendente.',
  escalate: 'Agir sobre a estagnação operacional.',
  close: 'Conduzir o fechamento.',
  no_intervention: 'Nenhuma comunicação necessária.',
  insufficient_information:
    'Aprofundar a descoberta para decidir o próximo passo.',
}

export type CommunicationContextConstraintSource =
  | 'give_space'
  | 'method_adherence'
  | 'seller_coaching'
  | 'insufficient_information'
  | 'reschedule_pending'

export type CommunicationContextConstraint = {
  source: CommunicationContextConstraintSource

  statement: string
  reason: string

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type CommunicationContextCustomerContext = {
  // Preferências do cliente já capturadas pela leitura ATUAL
  // (`current_reading.reading.customer.preferences`) — nunca minerado de
  // memória antiga/cycle memory por conta própria (mandato §13/§14: só
  // entra por já ter sido considerada relevante pela IA na leitura atual,
  // nunca "só porque existe").
  preferences: CommercialReadingEvidenceItem[]

  // FASE 16.4 é o território oficial de "memória durável" (mandato §34).
  // Nenhuma fonte canônica de memória cross-cycle da PESSOA (distinta da
  // Cycle Memory, que é escopada à oportunidade atual) existe hoje —
  // sempre NOT_AVAILABLE, nunca simulada ou promovida a partir de cycle
  // memory (mandato §23: não promover fato de ciclo a fato de pessoa).
  person_memory_availability: 'NOT_AVAILABLE'
}

export type CommunicationContextResolvedCommitment = {
  origin: 'cycle_memory'
  commitment: CanonicalCycleCommercialMemory['commitments'][number]
}

export type CommunicationContextResolvedObjection = {
  origin: 'commercial_reading'
  risk: CommercialReadingRisk
}

export type CommunicationContextOpportunityContext = {
  referenced_commitment:
    CommunicationContextResolvedCommitment | null

  referenced_objection:
    CommunicationContextResolvedObjection | null
}

export type CommunicationContextMethodContext = {
  // Tradução do candidato de método/coaching/descoberta em restrição de
  // ABORDAGEM — o texto já vem de `recommended_action`, escrito
  // seller-facing desde a FASE 16.3E (ex.: "Aprofundar a descoberta antes
  // de avançar"), nunca jargão de método para o cliente (mandato §14).
  approach_constraint: string | null

  missing_information: string[]
}

export type CommunicationContextEvidence = {
  evidence_message_ids: string[]
  memory_ids: string[]
}

export type CommunicationContextProvenance = {
  conversation_key: string
  cycle_id: string

  decision_state_reference_time: string | null
  decision_state_provenance: DecisionState['provenance'] | null

  // Nunca `generated_at` — mesma disciplina do HOTFIX 16.3D.1.
  commercial_reading_state_updated_at: string | null

  method_coaching_provenance:
    CanonicalMethodCoachingSource['provenance'] | null
}

export type CommunicationContext = {
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  executable: boolean
  non_executable_reason:
    CommunicationContextNonExecutableReason | null

  decision_kind: CommercialReadingDecision | null
  communication_goal: string | null
  do_not_generate: boolean

  current_moment: DecisionStateCurrentMoment | null
  dominant_intent: DecisionStatePrimaryDecision | null

  // Reaproveitado verbatim de `decision_state.interventions` — já
  // priorizado e limitado a 2 pelo próprio Decision State, nunca
  // refiltrado aqui (mandato §8: "não reinterpreta nenhum deles").
  supporting_context: DecisionStateInterventionCard[]

  customer_context: CommunicationContextCustomerContext
  opportunity_context: CommunicationContextOpportunityContext
  method_context: CommunicationContextMethodContext

  constraints: CommunicationContextConstraint[]

  // Mantido deliberadamente mínimo — só os movimentos exclusivamente
  // autorizados pela SUPRESSÃO de avanço-de-venda do Decision State
  // (`give_space`) e pela reconciliação de reagendamento, que nenhum dos
  // 45 hard-gate codes já existentes no MIE cobre (eles cobrem invenção de
  // fato/preço/prazo, não "isto é uma sessão pessoal"). Regras genéricas
  // de anti-invenção NÃO são duplicadas aqui — já são hard-gate do MIE
  // (mandato §17, classificação C).
  allowed_moves: string[]
  prohibited_moves: string[]

  evidence: CommunicationContextEvidence

  provenance: CommunicationContextProvenance
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

function buildNonExecutableContext({
  company_id,
  cycle_id,
  conversation_key,
  referenceTime,
  reason,
}: {
  company_id: string
  cycle_id: string
  conversation_key: string
  referenceTime: string
  reason: CommunicationContextNonExecutableReason
}): CommunicationContext {
  return {
    company_id,
    cycle_id,
    conversation_key,
    reference_time: referenceTime,

    executable: false,
    non_executable_reason: reason,

    decision_kind: null,
    communication_goal: null,
    do_not_generate: true,

    current_moment: null,
    dominant_intent: null,
    supporting_context: [],

    customer_context: {
      preferences: [],
      person_memory_availability: 'NOT_AVAILABLE',
    },

    opportunity_context: {
      referenced_commitment: null,
      referenced_objection: null,
    },

    method_context: {
      approach_constraint: null,
      missing_information: [],
    },

    constraints: [],
    allowed_moves: [],
    prohibited_moves: [],

    evidence: {
      evidence_message_ids: [],
      memory_ids: [],
    },

    provenance: {
      conversation_key,
      cycle_id,
      decision_state_reference_time: null,
      decision_state_provenance: null,
      commercial_reading_state_updated_at: null,
      method_coaching_provenance: null,
    },
  }
}

// Um "candidato" resolvível é qualquer item com `source` — a decisão
// principal (após a extensão aditiva da FASE 16.3F) ou uma intervenção
// secundária. Unifica a resolução de compromisso/objeção/método num único
// percurso, na ordem de prioridade que o próprio Decision State já
// estabeleceu (principal primeiro, depois intervenções na ordem em que
// aparecem).
function allSourcedCandidates(
  decisionState: DecisionState,
): Array<
  DecisionStatePrimaryDecision | DecisionStateInterventionCard
> {
  return [
    decisionState.primary_decision,
    ...decisionState.interventions,
  ]
}

// Resolve TODOS os compromissos referenciados por candidatos
// `cycle_commitment` selecionados (decisão principal + intervenções) —
// não só o primeiro. Necessário porque a decisão principal e uma
// intervenção secundária podem referenciar compromissos DIFERENTES (ex.:
// principal aponta um compromisso confirmado vencido, intervenção aponta
// outro com pedido de reagendamento); parar no primeiro match faria
// `buildConstraints` nunca enxergar o segundo (achado do Codex, PR #281,
// rodada 1).
function resolveAllReferencedCommitments(
  decisionState: DecisionState,
  cycleMemory: CanonicalCycleCommercialMemory | null,
): CommunicationContextResolvedCommitment[] {
  if (
    !cycleMemory ||
    !Array.isArray(cycleMemory.commitments)
  ) {
    return []
  }

  const resolved: CommunicationContextResolvedCommitment[] =
    []

  for (const candidate of allSourcedCandidates(
    decisionState,
  )) {
    if (candidate.source !== 'cycle_commitment') {
      continue
    }

    for (const memoryId of candidate.memory_ids) {
      const match = cycleMemory.commitments.find(
        (commitment) =>
          commitment.memory_id === memoryId,
      )

      if (
        match &&
        !resolved.some(
          (item) =>
            item.commitment.memory_id ===
            match.memory_id,
        )
      ) {
        resolved.push({
          origin: 'cycle_memory',
          commitment: match,
        })
      }
    }
  }

  return resolved
}

function resolveReferencedObjection(
  decisionState: DecisionState,
  currentReading:
    CanonicalCommercialReadingSource | null,
): CommunicationContextResolvedObjection | null {
  const objections =
    currentReading?.reading.risks.customer_objections

  if (!Array.isArray(objections)) {
    return null
  }

  for (const candidate of allSourcedCandidates(
    decisionState,
  )) {
    if (candidate.source !== 'commercial_risk') {
      continue
    }

    const match = objections.find(
      (objection) =>
        objection.summary === candidate.summary,
    )

    if (match) {
      return {
        origin: 'commercial_reading',
        risk: match,
      }
    }
  }

  return null
}

function resolveMethodContext(
  decisionState: DecisionState,
  methodCoaching:
    CanonicalMethodCoachingSource | null,
): CommunicationContextMethodContext {
  const candidate = allSourcedCandidates(
    decisionState,
  ).find(
    (item) =>
      item.source === 'method_adherence' ||
      item.source === 'seller_coaching' ||
      item.source === 'insufficient_information',
  )

  // `missing_information` só é exposta quando existe um candidato
  // SELECIONADO pelo Decision State que semanticamente corresponde a
  // `recovery_guidance` — `method_adherence` (desvio de método,
  // recovery_guidance existe justamente para orientar a recuperação) e
  // `insufficient_information` (descoberta insuficiente, mesma
  // recovery_guidance). `seller_coaching` NÃO conta: seus kinds
  // sempre-urgentes (correção defensiva) sobrevivem mesmo quando
  // `method_adherence` foi suprimido (ex.: sessão não comercial — mandato
  // §7/16.3E), então tratá-lo como autorização para expor
  // `recovery_guidance.missing_information` vazaria o detalhe de um
  // candidato que o Decision State explicitamente NÃO selecionou (achado
  // do Codex, PR #281, rodada 2 — a mesma classe do achado da rodada 1,
  // meu gate por `candidate` genérico ainda era amplo demais).
  const recoveryCandidate = allSourcedCandidates(
    decisionState,
  ).find(
    (item) =>
      item.source === 'method_adherence' ||
      item.source === 'insufficient_information',
  )

  const missingInformation = recoveryCandidate
    ? methodCoaching?.method.recovery_guidance
      ?.missing_information ?? []
    : []

  return {
    approach_constraint:
      candidate?.recommended_action ?? null,

    missing_information: Array.isArray(
      missingInformation,
    )
      ? missingInformation
      : [],
  }
}

function buildConstraints({
  decisionState,
  referencedCommitments,
}: {
  decisionState: DecisionState
  referencedCommitments:
    CommunicationContextResolvedCommitment[]
}): CommunicationContextConstraint[] {
  const constraints: CommunicationContextConstraint[] =
    []

  // Mandato §12: give_space nunca autoriza pitch, objeção comercial
  // histórica, retomada forçada, CTA comercial, pressão de fechamento ou
  // mudança artificial de assunto — mas permite continuidade humana e
  // resposta factual necessária.
  if (
    decisionState.primary_decision.kind ===
    'give_space'
  ) {
    constraints.push({
      source: 'give_space',

      statement:
        'Não avançar a venda nesta interação: sem pitch, sem retomar objeção comercial histórica, sem call-to-action comercial, sem pressão de fechamento, sem mudança artificial de assunto. Continuidade humana e resposta factual necessária permanecem permitidas.',

      reason:
        decisionState.primary_decision.reason,

      evidence_message_ids: [],
      memory_ids: [],
    })
  }

  // Mandato §14: método/coaching viram restrição de ABORDAGEM, nunca
  // texto/jargão para o cliente.
  const methodCandidate = allSourcedCandidates(
    decisionState,
  ).find(
    (item) =>
      item.source === 'method_adherence' ||
      item.source === 'seller_coaching' ||
      item.source === 'insufficient_information',
  )

  if (methodCandidate) {
    constraints.push({
      source: methodCandidate.source as Exclude<
        CommunicationContextConstraintSource,
        'give_space' | 'reschedule_pending'
      >,

      statement:
        methodCandidate.recommended_action,

      reason: methodCandidate.reason,

      evidence_message_ids:
        methodCandidate.evidence_message_ids,

      memory_ids: methodCandidate.memory_ids,
    })
  }

  // Achado da FASE 16.3E (rodada 5, PR #280): `reschedule_requested` não
  // confirma o horário original — o compromisso segue pendente de
  // reconciliação, nunca tratado como vencido/confirmado. Inspeciona
  // TODOS os compromissos referenciados por candidatos selecionados
  // (principal + intervenções), não só o primeiro — a decisão principal
  // pode referenciar um compromisso diferente do de uma intervenção
  // secundária (achado do Codex, PR #281, rodada 1).
  for (const referencedCommitment of referencedCommitments) {
    if (
      referencedCommitment.commitment
        .commitment_status !== 'reschedule_requested'
    ) {
      continue
    }

    constraints.push({
      source: 'reschedule_pending',

      statement:
        'Não tratar o horário original deste compromisso como confirmado — orientar a reconciliação de um novo horário com o cliente.',

      reason:
        'Compromisso com pedido de reagendamento pendente.',

      evidence_message_ids:
        referencedCommitment.commitment
          .evidence_message_ids,

      memory_ids: [
        referencedCommitment.commitment.memory_id,
      ],
    })
  }

  return constraints
}

function buildMoves({
  executable,
  doNotGenerate,
  decisionKind,
  hasReschedulePendingConstraint,
}: {
  executable: boolean
  doNotGenerate: boolean
  decisionKind: CommercialReadingDecision
  hasReschedulePendingConstraint: boolean
}): {
  allowed_moves: string[]
  prohibited_moves: string[]
} {
  if (!executable || doNotGenerate) {
    return { allowed_moves: [], prohibited_moves: [] }
  }

  if (decisionKind === 'give_space') {
    return {
      allowed_moves: [
        'natural_continuity',
        'acknowledge',
        'factual_response',
      ],

      // give_space não impede um sinal operacional (ex.: compromisso com
      // pedido de reagendamento) de sobreviver como supporting_context
      // (mandato §12) — a proibição de reschedule precisa se aplicar aqui
      // também, não só no ramo genérico abaixo (achado do Codex, PR #281,
      // rodada 3).
      prohibited_moves: [
        'introduce_pitch',
        'resurface_commercial_objection',
        'commercial_cta',
        'closing_pressure',
        'forced_topic_change',
        ...(hasReschedulePendingConstraint
          ? ['treat_original_time_as_confirmed']
          : []),
      ],
    }
  }

  return {
    allowed_moves: [],

    prohibited_moves:
      hasReschedulePendingConstraint
        ? ['treat_original_time_as_confirmed']
        : [],
  }
}

function mergeEvidence(
  ...items: Array<{
    evidence_message_ids: string[]
    memory_ids: string[]
  }>
): CommunicationContextEvidence {
  const evidenceMessageIds = new Set<string>()
  const memoryIds = new Set<string>()

  for (const item of items) {
    for (const id of item.evidence_message_ids) {
      evidenceMessageIds.add(id)
    }

    for (const id of item.memory_ids) {
      memoryIds.add(id)
    }
  }

  return {
    evidence_message_ids: Array.from(
      evidenceMessageIds,
    ),

    memory_ids: Array.from(memoryIds),
  }
}

// Três casos distintos para cada parâmetro suplementar opcional — mesma
// disciplina estabelecida na FASE 16.3E (rodada 3/rodada 5, PR #280):
// - não fornecido (`undefined`): carga interna best-effort.
// - fornecido mas de escopo/instante divergente (não-nulo): carga interna
//   best-effort (nunca vira `null` direto).
// - fornecido explicitamente como `null` (o chamador já tentou e falhou):
//   respeitado como "confirmadamente indisponível", nunca retry.
async function resolveSupplementalSource<
  T extends { company_id: string; cycle_id: string },
>(
  supplied: T | null | undefined,
  matchesScope: (value: T) => boolean,
  loadInternal: () => Promise<T | null>,
): Promise<T | null> {
  if (supplied === undefined) {
    return loadInternal()
  }

  if (supplied === null) {
    return null
  }

  if (matchesScope(supplied)) {
    return supplied
  }

  return loadInternal()
}

async function loadInternalBestEffort<T>(
  loader: () => Promise<T>,
  label: string,
  context: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await loader()
  } catch (error) {
    console.error(
      `[CANONICAL_COMMUNICATION_CONTEXT] ${label} lookup failed, degrading to unavailable`,
      { ...context, error },
    )

    return null
  }
}

export async function loadCanonicalCommunicationContext({
  admin,
  company_id,
  cycle_id,
  conversation_key,
  reference_time,
  decision_state,
  current_reading,
  cycle_memory,
  method_coaching,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  // OBRIGATÓRIO (mandato §29): sem Decision State válido, não há
  // Communication Context executável — nunca cai silenciosamente para
  // `current_reading.best_approach` como substituto da decisão (isso
  // recriaria um segundo Commercial Brain).
  decision_state: DecisionState | null

  current_reading?:
    CanonicalCommercialReadingSource | null

  cycle_memory?:
    CanonicalCycleCommercialMemory | null

  method_coaching?:
    CanonicalMethodCoachingSource | null
}): Promise<CommunicationContext | null> {
  const referenceTime =
    normalizeDateOrNull(reference_time)

  if (!referenceTime) {
    return null
  }

  if (!decision_state) {
    return buildNonExecutableContext({
      company_id,
      cycle_id,
      conversation_key,
      referenceTime,
      reason: 'no_decision_state',
    })
  }

  // Cross-company/cross-cycle/cross-conversation (mandato §30, cenários
  // 18-20) e cross-instante (mandato §21/§24 — um Decision State de outro
  // reference_time é uma fotografia diferente, mesma disciplina de
  // `client_context.generated_at` na FASE 16.3E) — fail-closed, nunca
  // best-effort, porque Decision State é a única fonte de decisão.
  if (
    decision_state.company_id !== company_id ||
    decision_state.cycle_id !== cycle_id ||
    decision_state.conversation_key !==
      conversation_key ||
    Date.parse(decision_state.reference_time) !==
      Date.parse(referenceTime)
  ) {
    return buildNonExecutableContext({
      company_id,
      cycle_id,
      conversation_key,
      referenceTime,
      reason: 'decision_state_scope_mismatch',
    })
  }

  // current_reading é suplementar (mesma disciplina de FASE 16.3D/16.3E):
  // mismatch de escopo ou leitura do futuro o torna indisponível para
  // enriquecimento, mas nunca derruba a executabilidade — a decisão já
  // foi tomada pelo Decision State.
  //
  // Além do escopo, precisa ser LITERALMENTE a mesma leitura que o
  // Decision State usou para decidir — `decision_state.provenance` já
  // identifica exatamente `analise_source_event_id`/
  // `analise_state_record_id`/`analise_state_version`. Sem essa
  // amarração, um `current_reading` de outra versão (mesmo escopo certo,
  // mesmo não sendo do futuro) poderia expor preferências ou resolver uma
  // objeção contra uma fotografia diferente da que produziu a decisão —
  // um `client_context`/`current_reading` "atual" mas não o MESMO que
  // decidiu (achado do Codex, PR #281, rodada 1). Quando o Decision State
  // foi computado SEM nenhuma leitura (`analise_source_event_id: null`),
  // qualquer `current_reading` fornecido agora não é o que decidiu —
  // também descartado.
  let currentReading = current_reading ?? null

  if (
    currentReading &&
    (
      currentReading.company_id !== company_id ||
      currentReading.cycle_id !== cycle_id ||
      currentReading.conversation_key !==
        conversation_key ||
      Date.parse(currentReading.generated_at) >
        Date.parse(referenceTime) ||
      currentReading.source_event_id !==
        decision_state.provenance
          .analise_source_event_id ||
      currentReading.state_record_id !==
        decision_state.provenance
          .analise_state_record_id ||
      currentReading.state_version !==
        decision_state.provenance
          .analise_state_version
    )
  ) {
    currentReading = null
  }

  const cycleMemory =
    await resolveSupplementalSource(
      cycle_memory,
      (value) =>
        value.company_id === company_id &&
        value.cycle_id === cycle_id &&
        value.reference_time === referenceTime,
      () =>
        loadInternalBestEffort(
          () =>
            loadCanonicalCycleCommercialMemory({
              admin,
              company_id,
              cycle_id,
              reference_time: referenceTime,
            }),
          'cycle memory',
          { company_id, cycle_id },
        ),
    )

  // Mesma amarração exigida de `current_reading` (achado do Codex, PR
  // #281, rodada 1) também precisa valer para `method_coaching` — escopo
  // + `reference_time` batendo não prova que veio da MESMA análise que
  // produziu a decisão; só `provenance.analise_*` prova isso (achado do
  // Codex, PR #281, rodada 2). Em caso de divergência, cai para a carga
  // interna best-effort — mesmo comportamento de qualquer outro mismatch
  // de escopo suplementar.
  const methodCoaching =
    await resolveSupplementalSource(
      method_coaching,
      (value) =>
        value.company_id === company_id &&
        value.cycle_id === cycle_id &&
        value.conversation_key ===
          conversation_key &&
        value.reference_time === referenceTime &&
        value.provenance
          .analise_source_event_id ===
          decision_state.provenance
            .analise_source_event_id &&
        value.provenance
          .analise_state_record_id ===
          decision_state.provenance
            .analise_state_record_id &&
        value.provenance.analise_state_version ===
          decision_state.provenance
            .analise_state_version,
      () =>
        loadInternalBestEffort(
          () =>
            loadCanonicalMethodCoachingSource({
              admin,
              company_id,
              cycle_id,
              conversation_key,
              reference_time: referenceTime,
              current_reading: currentReading,
              cycle_memory: cycleMemory,
            }),
          'method coaching',
          { company_id, cycle_id, conversation_key },
        ),
    )

  const decisionKind =
    decision_state.primary_decision.kind

  // `wait` (mandato: "aguardar antes de agir") é, assim como
  // `no_intervention`, uma decisão de NÃO comunicar agora — deixar
  // `do_not_generate` falso permitiria a um gerador futuro produzir uma
  // mensagem contrariando a própria decisão do Decision State (achado do
  // Codex, PR #281, rodada 1).
  const doNotGenerate =
    decisionKind === 'no_intervention' ||
    decisionKind === 'wait'

  const referencedCommitments =
    resolveAllReferencedCommitments(
      decision_state,
      cycleMemory,
    )

  const referencedCommitment =
    referencedCommitments[0] ?? null

  const referencedObjection =
    resolveReferencedObjection(
      decision_state,
      currentReading,
    )

  const methodContext = resolveMethodContext(
    decision_state,
    methodCoaching,
  )

  const constraints = buildConstraints({
    decisionState: decision_state,
    referencedCommitments,
  })

  const moves = buildMoves({
    executable: true,
    doNotGenerate,
    decisionKind,

    hasReschedulePendingConstraint:
      constraints.some(
        (constraint) =>
          constraint.source ===
          'reschedule_pending',
      ),
  })

  const customerPreferences =
    currentReading?.reading.customer
      .preferences ?? []

  const evidence = mergeEvidence(
    decision_state.primary_decision,
    ...decision_state.interventions,
    ...constraints,
  )

  return {
    company_id,
    cycle_id,
    conversation_key,
    reference_time: referenceTime,

    executable: true,
    non_executable_reason: null,

    decision_kind: decisionKind,
    communication_goal:
      COMMUNICATION_GOAL_BY_DECISION[decisionKind],
    do_not_generate: doNotGenerate,

    current_moment: decision_state.current_moment,
    dominant_intent: decision_state.primary_decision,
    supporting_context:
      decision_state.interventions,

    customer_context: {
      preferences: Array.isArray(
        customerPreferences,
      )
        ? customerPreferences
        : [],

      person_memory_availability:
        'NOT_AVAILABLE',
    },

    opportunity_context: {
      referenced_commitment:
        referencedCommitment,
      referenced_objection: referencedObjection,
    },

    method_context: methodContext,

    constraints,

    allowed_moves: moves.allowed_moves,
    prohibited_moves: moves.prohibited_moves,

    evidence,

    provenance: {
      conversation_key,
      cycle_id,

      decision_state_reference_time:
        decision_state.reference_time,
      decision_state_provenance:
        decision_state.provenance,

      commercial_reading_state_updated_at:
        currentReading?.state_updated_at ?? null,

      method_coaching_provenance:
        methodCoaching?.provenance ?? null,
    },
  }
}
