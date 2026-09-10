import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
  COMMERCIAL_READING_IMPROVEMENT_KINDS,
  COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
  type CommercialReadingImprovementPoint,
  type CommercialReadingMethod,
  type CommercialReadingRecoveryGuidance,
  type CommercialReadingSellerStrength,
} from '@/app/lib/companion/commercial-reading-contract'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from '@/app/lib/companion/stateful-copilot-contract'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from '@/app/lib/companion/stateful-commercial-state'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from '@/app/lib/companion/stateful-communication-contract'

import {
  loadCompanionMethodStage,
  type CompanionMethodStageRecord,
} from './companion-method-stage-store'

import {
  loadCanonicalCycleCommercialMemory,
} from './canonical-cycle-commercial-memory-source'

import type {
  CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

const CROSS_CONVERSATION_EVENT_FIELDS = [
  'id',
  'company_id',
  'cycle_id',
  'conversation_key',
  'state_record_id',
  'candidate_state_version',
  'state_contract_version',
  'output_contract_version',
  'state_snapshot',
  'normalized_output',
  'generated_at',
].join(',')

const CROSS_CONVERSATION_EVENT_PAGE_SIZE =
  500

const MAX_CROSS_CONVERSATION_EVENT_ROWS =
  10000

type JsonRecord =
  Record<string, unknown>

type SupabasePageResult = {
  data: unknown
  error: unknown
}

type CurrentPublishedMethodConfig = {
  id: string
  published_at: string
}

export type CanonicalMethodCoachingAgoraStage = {
  source: 'agora_persisted'

  stage_key: string
  stage_name: string
  stage_display_order: number
  method_config_version_id: string
  updated_at: string
}

export type CanonicalMethodCoachingAnaliseStage = {
  source: 'analise_commercial_reading'

  stage_key: string | null
  step_order: number
  name: string
}

export type CanonicalMethodCoachingCrossConversationSignal = {
  conversation_key: string
  source_event_id: string
  generated_at: string

  seller_strengths:
    CommercialReadingSellerStrength[]

  improvement_points:
    CommercialReadingImprovementPoint[]
}

export type CanonicalMethodCoachingSource = {
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  method: {
    configured: boolean
    name: string | null

    stages:
      CommercialReadingMethod['stages']

    agora_stage:
      CanonicalMethodCoachingAgoraStage | null

    analise_stage:
      CanonicalMethodCoachingAnaliseStage | null

    // true SOMENTE quando os dois lados existem, vêm da MESMA versão
    // publicada do método (ver stage_comparison_reliable) e discordam
    // explicitamente sobre stage_key — nunca inferido quando um dos
    // dois está ausente (achado da FASE 16.2: os dois mecanismos são
    // "diferentes, não coordenados", não "um substitui o outro").
    stage_divergence: boolean

    // false quando a comparação acima não é segura — AGORA e ANÁLISE
    // vêm de revisões diferentes do método publicado (ou a versão
    // atual não pôde ser determinada). Quando false, stage_divergence
    // é sempre false, mas isso não significa concordância: significa
    // que a comparação não pôde ser feita com segurança (achado do
    // Codex, PR #278, rodada 1 — mesmo tratamento que
    // lead-seller-guidance.ts já dá a uma etapa anterior de versão
    // diferente: ignorada, não comparada).
    stage_comparison_reliable: boolean

    adherence:
      CommercialReadingMethod['adherence'] | null

    recovery_guidance:
      CommercialReadingRecoveryGuidance | null
  }

  coaching: {
    seller_strengths:
      CommercialReadingSellerStrength[]

    improvement_points:
      CommercialReadingImprovementPoint[]

    source_event_id: string | null
    generated_at: string | null
  }

  // Sinais de coaching de OUTRAS conversas do mesmo ciclo, canonicamente
  // relevantes por pertencerem à mesma oportunidade — nunca substituem
  // `coaching` (a leitura da conversa atual), apenas a complementam.
  cross_conversation_coaching:
    CanonicalMethodCoachingCrossConversationSignal[]

  provenance: {
    conversation_key: string
    agora_updated_at: string | null
    analise_source_event_id: string | null
    analise_state_record_id: string | null
    analise_state_version: number | null
  }
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function readNonEmptyString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

const VALID_SELLER_STRENGTH_KINDS =
  new Set<string>(
    COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
  )

const VALID_IMPROVEMENT_KINDS =
  new Set<string>(
    COMMERCIAL_READING_IMPROVEMENT_KINDS,
  )

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      item => typeof item === 'string',
    )
  )
}

// As duas normalizações canônicas de coaching chamam
// normalizeReferences(..., true, true) (commercial-reading-contract.ts,
// normalizeSellerStrengths/normalizeImprovementPoints) — o segundo
// `true` é requireDirectMessage, que exige pelo menos uma
// evidence_message_ids não vazia mesmo quando memory_ids está
// populado (achado do Codex, PR #278, rodada 5). Um item sem evidência
// direta é ungrounded pelo próprio contrato canônico, então esta
// validação estrutural precisa da mesma exigência.
function hasDirectEvidence(
  value: unknown,
): value is string[] {
  return (
    isStringArray(value) &&
    value.length > 0 &&
    value.every(
      id => id.trim() !== '',
    )
  )
}

// A restrição do banco valida apenas a versão do contrato de saída, não
// o formato dos arrays aninhados de coaching — um evento persistido por
// um writer antigo/quebrado pode ter contract_version correto e ainda
// assim carregar `[null]` ou objetos sem os campos obrigatórios (achado
// do Codex, PR #278, rodada 4). Validar item a item antes de expor como
// CommercialReadingSellerStrength/CommercialReadingImprovementPoint.
function isValidSellerStrength(
  value: unknown,
): value is CommercialReadingSellerStrength {
  return (
    isRecord(value) &&
    typeof value.kind === 'string' &&
    VALID_SELLER_STRENGTH_KINDS.has(
      value.kind,
    ) &&
    readNonEmptyString(value.summary) !==
      null &&
    readNonEmptyString(
      value.why_it_matters,
    ) !== null &&
    hasDirectEvidence(
      value.evidence_message_ids,
    ) &&
    isStringArray(value.memory_ids)
  )
}

function isValidImprovementPoint(
  value: unknown,
): value is CommercialReadingImprovementPoint {
  return (
    isRecord(value) &&
    typeof value.kind === 'string' &&
    VALID_IMPROVEMENT_KINDS.has(
      value.kind,
    ) &&
    readNonEmptyString(value.summary) !==
      null &&
    readNonEmptyString(
      value.why_it_matters,
    ) !== null &&
    readNonEmptyString(value.impact) !==
      null &&
    readNonEmptyString(
      value.how_to_improve,
    ) !== null &&
    hasDirectEvidence(
      value.evidence_message_ids,
    ) &&
    isStringArray(value.memory_ids)
  )
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

async function readAllPages({
  pageSize,
  maxRows,
  fetchPage,
}: {
  pageSize: number
  maxRows: number
  fetchPage: (
    offset: number,
    limit: number,
  ) => PromiseLike<SupabasePageResult>
}): Promise<unknown[] | null> {
  const rows: unknown[] = []

  let offset = 0

  while (true) {
    const {
      data,
      error,
    } =
      await fetchPage(
        offset,
        pageSize,
      )

    if (
      error ||
      !Array.isArray(data)
    ) {
      return null
    }

    rows.push(
      ...data,
    )

    if (rows.length > maxRows) {
      return null
    }

    if (data.length < pageSize) {
      break
    }

    offset += pageSize
  }

  return rows
}

/**
 * Carrega a versão do método atualmente `published` para a empresa
 * (no máximo uma, garantida por
 * `company_commercial_config_one_published_uidx`), com seu
 * `published_at` — a base da prova temporal em
 * computeStageComparison. `null` quando não há método publicado ou a
 * leitura falha (best-effort: uma falha aqui só torna a comparação
 * AGORA×ANÁLISE não confiável, nunca derruba o restante da leitura).
 */
async function loadCurrentPublishedMethodConfig({
  admin,
  companyId,
}: {
  admin: SupabaseClient
  companyId: string
}): Promise<CurrentPublishedMethodConfig | null> {
  const {
    data,
    error,
  } =
    await admin
      .from(
        'company_commercial_config_versions',
      )
      .select('id, published_at')
      .eq('company_id', companyId)
      .eq('status', 'published')
      .maybeSingle()

  if (
    error ||
    !isRecord(data)
  ) {
    return null
  }

  const id =
    readNonEmptyString(data.id)

  const publishedAt =
    readNonEmptyString(
      data.published_at,
    )

  if (
    !id ||
    !publishedAt ||
    !Number.isFinite(
      Date.parse(publishedAt),
    )
  ) {
    return null
  }

  return {
    id,
    published_at: publishedAt,
  }
}

function buildAgoraStage(
  record: CompanionMethodStageRecord | null,
): CanonicalMethodCoachingAgoraStage | null {
  if (!record) {
    return null
  }

  return {
    source: 'agora_persisted',
    stage_key: record.stage_key,
    stage_name: record.stage_name,
    stage_display_order:
      record.stage_display_order,
    method_config_version_id:
      record.method_config_version_id,
    updated_at: record.updated_at,
  }
}

function buildAnaliseStage(
  method: CommercialReadingMethod | null,
): CanonicalMethodCoachingAnaliseStage | null {
  if (!method?.current_stage) {
    return null
  }

  return {
    source: 'analise_commercial_reading',
    stage_key: method.current_stage.stage_key,
    step_order: method.current_stage.step_order,
    name: method.current_stage.name,
  }
}

/**
 * Compara AGORA e ANÁLISE só quando é PROVÁVEL que os dois foram
 * computados sob a MESMA versão publicada do método — não apenas
 * quando `agora_stage.method_config_version_id` bate com algum id
 * fornecido pelo chamador. `CanonicalCommercialReadingSource` (FASE
 * 16.3B) não seleciona nem expõe qual revisão do método gerou a
 * leitura persistida (`canonical-commercial-reading-source.ts`), e
 * `current_reading` pode ser uma leitura antiga cujo `generated_at`
 * antecede uma republicação do método — nesse caso, um id "atual"
 * fornecido pelo chamador bateria com `agora_stage` por coincidência,
 * sem provar que `analise_stage` veio da mesma revisão (achado do
 * Codex, PR #278, rodada 2, refinando a rodada 1).
 *
 * Prova temporal, não invenção de mapeamento: `company_commercial_-
 * config_one_published_uidx` garante no máximo UMA versão `published`
 * por empresa a qualquer instante. Se `agora_stage.updated_at` E o
 * instante semântico REAL da análise (`current_reading.state_updated_at`
 * — não `current_reading.generated_at`, que é quando o evento foi
 * GRAVADO e pode atrasar por fila/retry, e não o `reference_time` desta
 * própria chamada, que também não prova nada sobre quando a análise
 * considerou "agora": achado do Codex, PR #278, rodada 7) são ambos
 * `>= currentPublishedMethod.published_at`, nenhum dos dois pôde ter
 * sido computado sob uma versão anterior — a versão atual é a única
 * que esteve "published" durante toda essa janela.
 * `state_updated_at` é repassado por `loadCanonicalCommercialReadingSource`
 * (FASE 16.3B) direto de `state_read.state_updated_at`, garantido pela
 * CHECK constraint de `companion_commercial_states`
 * (`state_updated_at = (state_snapshot->>'updated_at')::timestamptz`)
 * — o mesmo instante que a análise CONSIDERA como "agora", sem a
 * ambiguidade de `generated_at` (`stateful-copilot-persistence-plan.ts:
 * 568-578` só exige `generated_at >= reference_time`, nunca `=`). Isso
 * é comparável a `previousStage.method_config_version_id === method.id`
 * em `lead-seller-guidance.ts`, só que provado pelo tempo em vez de por
 * um id que `current_reading` não carrega.
 */
function computeStageComparison({
  agoraStage,
  analiseStage,
  currentReadingStateUpdatedAt,
  currentPublishedMethod,
}: {
  agoraStage:
    CanonicalMethodCoachingAgoraStage | null
  analiseStage:
    CanonicalMethodCoachingAnaliseStage | null
  currentReadingStateUpdatedAt:
    string | null
  currentPublishedMethod:
    CurrentPublishedMethodConfig | null
}): {
  reliable: boolean
  divergence: boolean
} {
  if (!agoraStage || !analiseStage) {
    return {
      reliable: false,
      divergence: false,
    }
  }

  if (analiseStage.stage_key === null) {
    return {
      reliable: false,
      divergence: false,
    }
  }

  if (
    !currentPublishedMethod ||
    !currentReadingStateUpdatedAt ||
    agoraStage.method_config_version_id !==
      currentPublishedMethod.id
  ) {
    return {
      reliable: false,
      divergence: false,
    }
  }

  const publishedAtInstant =
    Date.parse(
      currentPublishedMethod.published_at,
    )

  const agoraUpdatedAtInstant =
    Date.parse(agoraStage.updated_at)

  const readingStateUpdatedAtInstant =
    Date.parse(
      currentReadingStateUpdatedAt,
    )

  const reliable =
    Number.isFinite(publishedAtInstant) &&
    Number.isFinite(
      agoraUpdatedAtInstant,
    ) &&
    Number.isFinite(
      readingStateUpdatedAtInstant,
    ) &&
    agoraUpdatedAtInstant >=
      publishedAtInstant &&
    readingStateUpdatedAtInstant >=
      publishedAtInstant

  if (!reliable) {
    return {
      reliable: false,
      divergence: false,
    }
  }

  return {
    reliable: true,
    divergence:
      agoraStage.stage_key !==
      analiseStage.stage_key,
  }
}

/**
 * Extrai method/coaching de um evento de
 * companion_commercial_state_events com validação ESTRUTURAL apenas
 * (contract_version, escopo company/cycle/conversation) — não a
 * revalidação completa de normalizeCommercialReading() (que exige o
 * ledger de mensagens/memory ids daquela conversa específica). Mesmo
 * limite deliberado documentado em canonical-cycle-commercial-memory-
 * source.ts: usado só para sinalizar coaching relevante de OUTRAS
 * conversas do ciclo, nunca como a leitura autoritativa da conversa
 * atual (essa vem de loadCanonicalCommercialReadingSource, com
 * revalidação completa, via `current_reading`).
 */
function parseCrossConversationEvent({
  row,
  companyId,
  cycleId,
  excludeConversationKey,
}: {
  row: unknown
  companyId: string
  cycleId: string
  excludeConversationKey: string
}): {
  conversationKey: string
  eventId: string
  stateRecordId: string
  candidateStateVersion: number
  snapshotUpdatedAt: string | null
  generatedAt: string
  method: CommercialReadingMethod | null
  sellerStrengths: CommercialReadingSellerStrength[]
  improvementPoints: CommercialReadingImprovementPoint[]
} | null {
  if (!isRecord(row)) {
    return null
  }

  const eventId =
    readNonEmptyString(row.id)

  const generatedAt =
    readNonEmptyString(
      row.generated_at,
    )

  const rowCompanyId =
    readNonEmptyString(row.company_id)

  const rowCycleId =
    readNonEmptyString(row.cycle_id)

  const conversationKey =
    readNonEmptyString(
      row.conversation_key,
    )

  const stateRecordId =
    readNonEmptyString(
      row.state_record_id,
    )

  const stateContractVersion =
    readNonEmptyString(
      row.state_contract_version,
    )

  const outputContractVersion =
    readNonEmptyString(
      row.output_contract_version,
    )

  const candidateStateVersion =
    row.candidate_state_version

  if (
    !eventId ||
    !generatedAt ||
    !rowCompanyId ||
    !rowCycleId ||
    !conversationKey ||
    !stateRecordId ||
    !stateContractVersion ||
    !outputContractVersion ||
    rowCompanyId !== companyId ||
    rowCycleId !== cycleId ||
    conversationKey ===
      excludeConversationKey ||
    stateContractVersion !==
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION ||
    outputContractVersion !==
      STATEFUL_COPILOT_CONTRACT_VERSION ||
    typeof candidateStateVersion !== 'number' ||
    !Number.isInteger(
      candidateStateVersion,
    ) ||
    candidateStateVersion <= 0
  ) {
    return null
  }

  const stateSnapshot =
    row.state_snapshot

  if (
    !isRecord(stateSnapshot) ||
    stateSnapshot.contract_version !==
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION ||
    stateSnapshot.cycle_id !== cycleId
  ) {
    return null
  }

  const snapshotUpdatedAt =
    typeof stateSnapshot.updated_at ===
      'string'
      ? stateSnapshot.updated_at
      : null

  const normalizedOutput =
    row.normalized_output

  if (
    !isRecord(normalizedOutput) ||
    normalizedOutput.contract_version !==
      STATEFUL_COPILOT_CONTRACT_VERSION
  ) {
    return null
  }

  const communication =
    normalizedOutput.communication

  if (
    !isRecord(communication) ||
    communication.contract_version !==
      STATEFUL_COMMUNICATION_CONTRACT_VERSION
  ) {
    return null
  }

  const commercialReading =
    communication.commercial_reading

  if (
    !isRecord(commercialReading) ||
    commercialReading.contract_version !==
      COMMERCIAL_READING_CONTRACT_VERSION
  ) {
    return null
  }

  const method =
    isRecord(commercialReading.method)
      ? (
        commercialReading.method as unknown as CommercialReadingMethod
      )
      : null

  const sellerStrengthsRaw =
    commercialReading.seller_strengths

  if (
    !Array.isArray(sellerStrengthsRaw) ||
    !sellerStrengthsRaw.every(
      isValidSellerStrength,
    )
  ) {
    return null
  }

  const sellerStrengths =
    sellerStrengthsRaw

  const improvementPointsRaw =
    commercialReading.improvement_points

  if (
    !Array.isArray(
      improvementPointsRaw,
    ) ||
    !improvementPointsRaw.every(
      isValidImprovementPoint,
    )
  ) {
    return null
  }

  const improvementPoints =
    improvementPointsRaw

  return {
    conversationKey,
    eventId,
    stateRecordId,
    candidateStateVersion,
    snapshotUpdatedAt,
    generatedAt,
    method,
    sellerStrengths,
    improvementPoints,
  }
}

/**
 * Para cada conversation_key do ciclo (exceto a atual), busca o evento
 * mais recente cujo instante semântico (`state_snapshot.updated_at` —
 * forçado a igualar reference_time pela persistence plan) é
 * `<= reference_time`. Mesma lição da FASE 16.3C: nunca usar
 * `generated_at` (quando foi gravado) como corte semântico, nunca
 * `.range()` sem uma coluna única para paginar, sempre desempatar por
 * versão quando o instante empata entre duas versões da mesma
 * conversa.
 *
 * `state_snapshot.updated_at` decide QUAL evento é o mais recente
 * válido; a coluna real `generated_at` do evento (quando foi
 * efetivamente gravado, podendo ser posterior por fila/retry) é
 * exposta separadamente no resultado, sem ser confundida com o
 * instante semântico usado para selecioná-lo — achado do Codex, PR
 * #278, rodada 1: publicar o instante semântico sob o nome
 * `generated_at` tornaria esse campo inconsistente com
 * `coaching.generated_at` (que já é o `generated_at` real, vindo de
 * `current_reading`).
 */
async function loadCrossConversationCoaching({
  admin,
  companyId,
  cycleId,
  conversationKey,
  referenceTime,
  otherConversationKeys,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
  referenceTime: string
  otherConversationKeys: string[]
}): Promise<
  CanonicalMethodCoachingCrossConversationSignal[] | null
> {
  if (otherConversationKeys.length === 0) {
    return []
  }

  const rows =
    await readAllPages({
      pageSize:
        CROSS_CONVERSATION_EVENT_PAGE_SIZE,

      maxRows:
        MAX_CROSS_CONVERSATION_EVENT_ROWS,

      fetchPage: (offset, limit) =>
        admin
          .from(
            'companion_commercial_state_events',
          )
          .select(
            CROSS_CONVERSATION_EVENT_FIELDS,
          )
          .eq(
            'company_id',
            companyId,
          )
          .eq(
            'cycle_id',
            cycleId,
          )
          .in(
            'conversation_key',
            otherConversationKeys,
          )
          .order(
            'id',
            { ascending: true },
          )
          .range(
            offset,
            offset + limit - 1,
          ),
    })

  if (rows === null) {
    return null
  }

  const referenceInstant =
    Date.parse(referenceTime)

  const latestPerConversationKey =
    new Map<
      string,
      {
        eventId: string
        generatedAt: string
        updatedAtInstant: number
        candidateStateVersion: number
        sellerStrengths: CommercialReadingSellerStrength[]
        improvementPoints: CommercialReadingImprovementPoint[]
      }
    >()

  for (const row of rows) {
    const parsed =
      parseCrossConversationEvent({
        row,
        companyId,
        cycleId,
        excludeConversationKey:
          conversationKey,
      })

    if (
      !parsed ||
      typeof parsed.snapshotUpdatedAt !==
        'string'
    ) {
      continue
    }

    const updatedAtInstant =
      Date.parse(
        parsed.snapshotUpdatedAt,
      )

    if (
      !Number.isFinite(
        updatedAtInstant,
      ) ||
      updatedAtInstant > referenceInstant
    ) {
      continue
    }

    const existing =
      latestPerConversationKey.get(
        parsed.conversationKey,
      )

    const isBetterCandidate =
      !existing ||
      updatedAtInstant >
        existing.updatedAtInstant ||
      (
        updatedAtInstant ===
          existing.updatedAtInstant &&
        parsed.candidateStateVersion >
          existing.candidateStateVersion
      )

    if (isBetterCandidate) {
      latestPerConversationKey.set(
        parsed.conversationKey,
        {
          eventId: parsed.eventId,
          generatedAt: parsed.generatedAt,
          updatedAtInstant,
          candidateStateVersion:
            parsed.candidateStateVersion,
          sellerStrengths:
            parsed.sellerStrengths,
          improvementPoints:
            parsed.improvementPoints,
        },
      )
    }
  }

  return [
    ...latestPerConversationKey.entries(),
  ]
    .map(
      ([
        conversationKeyEntry,
        entry,
      ]) => ({
        conversation_key:
          conversationKeyEntry,

        source_event_id:
          entry.eventId,

        generated_at:
          entry.generatedAt,

        seller_strengths:
          entry.sellerStrengths,

        improvement_points:
          entry.improvementPoints,
      }),
    )
    .sort(
      (a, b) =>
        a.conversation_key <
        b.conversation_key
          ? -1
          : a.conversation_key >
            b.conversation_key
            ? 1
            : 0,
    )
}

/**
 * Combina, para uma conversa específica, os dois mecanismos de estágio
 * de método hoje divergentes e não coordenados (achado crítico da
 * FASE 16.2, §16/§17 de phase16-source-of-truth-audit.md):
 *
 * - AGORA: `companion_method_stage_state` — persistido, com gate
 *   anti-regressão (`validateStageContinuity`/`composeSellerFacing-
 *   Guidance`, em lead-seller-guidance.ts), só avança sem evidência
 *   explícita do cliente.
 * - ANÁLISE: `CommercialReading.method.current_stage` — recalculado a
 *   cada turno por `deriveCurrentMethodStage(stages, adherenceStatus)`
 *   (commercial-reading-contract.ts), nunca persistido, sem proteção
 *   contra regressão.
 *
 * Esta função NÃO escolhe um vencedor por adivinhação nem funde os
 * dois valores: expõe ambos explicitamente (`agora_stage`/
 * `analise_stage`) e computa `stage_divergence` só quando os dois
 * existem, vêm da MESMA versão publicada do método (ver
 * `stage_comparison_reliable`/`computeStageComparison` — mesma guarda
 * que `lead-seller-guidance.ts` já aplica à etapa anterior, achado do
 * Codex, PR #278, rodada 1) e discordam. Escolher qual estágio deve
 * "vencer" quando divergem é uma decisão de produto sobre o
 * comportamento de AGORA — território da FASE 16.3E, fora do escopo
 * aqui. Este módulo não escreve em `companion_method_stage_state` nem
 * em nenhuma tabela — é somente leitura, e não altera o gate
 * anti-regressão existente.
 *
 * `coaching` (seller_strengths/improvement_points/recovery_guidance)
 * reaproveita o shape já existente de CommercialReading — a mission
 * (FASE 16.3D) e o achado #34 do próprio audit confirmam que
 * `CommercialReadingImprovementPoint` já tem o formato Observação
 * (summary) → Diagnóstico (why_it_matters) → Impacto (impact) → Ação
 * (how_to_improve); não foi criado um shape novo.
 *
 * `current_reading` é o resultado JÁ CALCULADO de
 * loadCanonicalCommercialReadingSource() (FASE 16.3B) para a conversa
 * atual — este módulo não o recalcula (evita reconstruir
 * validation_context/state_read aqui, que só o chamador já tem
 * montado corretamente) e nunca amplia o contrato de 16.3B.
 *
 * `cross_conversation_coaching` reaproveita `conversation_keys` de
 * loadCanonicalCycleCommercialMemory() (FASE 16.3C, chamado aqui sem
 * nenhuma alteração) para descobrir as demais conversas do ciclo, e
 * lê o coaching mais recente válido em reference_time de cada uma —
 * ver loadCrossConversationCoaching para o contrato de validação
 * estrutural (não revalidação completa por ledger).
 *
 * Best-effort: `agora_stage`, `stage_comparison_reliable` e
 * `cross_conversation_coaching` são enriquecimentos, não a entrega
 * principal — uma falha isolada em qualquer leitura auxiliar (
 * `companion_method_stage_state`, a versão publicada do método via
 * loadCurrentPublishedMethodConfig, descoberta de conversation_keys
 * via loadCanonicalCycleCommercialMemory, ou a consulta de eventos
 * cross-conversation) degrada para `agora_stage: null`/
 * `stage_comparison_reliable: false`/`cross_conversation_coaching: []`,
 * sem derrubar a leitura de method/coaching da conversa atual (que já
 * veio pronta em `current_reading`). A função só retorna `null` por
 * completo para seus próprios problemas estruturais: `reference_time`
 * inválido, `current_reading` de outro escopo (company/cycle/
 * conversation), ou uma exceção genuinamente inesperada.
 */
export async function loadCanonicalMethodCoachingSource({
  admin,
  company_id,
  cycle_id,
  conversation_key,
  reference_time,
  current_reading,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  current_reading:
    CanonicalCommercialReadingSource | null
}): Promise<CanonicalMethodCoachingSource | null> {
  const referenceTime =
    normalizeDateOrNull(reference_time)

  if (!referenceTime) {
    return null
  }

  if (
    current_reading &&
    (
      current_reading.company_id !==
        company_id ||
      current_reading.cycle_id !==
        cycle_id ||
      current_reading.conversation_key !==
        conversation_key
    )
  ) {
    return null
  }

  // loadCanonicalCommercialReadingSource() aplica o corte por
  // reference_time apenas durante a própria carga — o objeto que ele
  // devolve não retém esse reference_time. Um chamador pode reusar um
  // current_reading carregado com um reference_time posterior (achado
  // do Codex, PR #278, rodada 3); sem esta checagem, este agregador
  // exporia method/coaching do futuro e compararia sua fase ANÁLISE
  // contra o corte histórico já aplicado ao AGORA. Trata-se como
  // escopo inválido para este reference_time, não como leitura atual.
  if (
    current_reading &&
    Date.parse(
      current_reading.generated_at,
    ) >
      Date.parse(referenceTime)
  ) {
    return null
  }

  try {
    let agoraRecord:
      CompanionMethodStageRecord | null

    try {
      agoraRecord =
        await loadCompanionMethodStage({
          admin,
          companyId: company_id,
          cycleId: cycle_id,
          conversationKey:
            conversation_key,
        })

      // companion_method_stage_state é uma linha viva (upsert, sem
      // histórico) — ao contrário de Commercial Reading, não existe
      // um evento passado para "voltar no tempo". Se ela já avançou
      // para depois de reference_time, expor esse valor seria
      // promover um estado do futuro (achado do Codex, PR #278,
      // rodada 2) — o único comportamento seguro é tratá-la como
      // indisponível para este reference_time, não como "atual".
      if (
        agoraRecord &&
        Date.parse(
          agoraRecord.updated_at,
        ) >
          Date.parse(referenceTime)
      ) {
        agoraRecord = null
      }
    } catch (error) {
      console.error(
        '[CANONICAL_METHOD_COACHING] agora stage lookup failed, continuing without it',
        {
          company_id,
          cycle_id,
          conversation_key,
          error,
        },
      )

      agoraRecord = null
    }

    let currentPublishedMethod:
      CurrentPublishedMethodConfig | null

    try {
      currentPublishedMethod =
        await loadCurrentPublishedMethodConfig(
          {
            admin,
            companyId: company_id,
          },
        )
    } catch (error) {
      console.error(
        '[CANONICAL_METHOD_COACHING] published method config lookup failed, stage comparison will be unreliable',
        {
          company_id,
          error,
        },
      )

      currentPublishedMethod = null
    }

    const cycleMemory =
      await loadCanonicalCycleCommercialMemory(
        {
          admin,
          company_id,
          cycle_id,
          reference_time:
            referenceTime,
        },
      )

    const otherConversationKeys =
      (
        cycleMemory?.conversation_keys ??
        []
      ).filter(
        (key) =>
          key !== conversation_key,
      )

    const crossConversationCoaching =
      (
        await loadCrossConversationCoaching(
          {
            admin,
            companyId: company_id,
            cycleId: cycle_id,
            conversationKey:
              conversation_key,
            referenceTime,
            otherConversationKeys,
          },
        )
      ) ?? []

    const method =
      current_reading?.reading.method ??
      null

    const agoraStage =
      buildAgoraStage(agoraRecord)

    const analiseStage =
      buildAnaliseStage(method)

    const stageComparison =
      computeStageComparison({
        agoraStage,
        analiseStage,
        currentReadingStateUpdatedAt:
          current_reading?.state_updated_at ??
          null,
        currentPublishedMethod,
      })

    return {
      company_id,
      cycle_id,
      conversation_key,
      reference_time: referenceTime,

      method: {
        configured:
          method?.configured ?? false,

        name:
          method?.name ?? null,

        stages:
          method?.stages ?? [],

        agora_stage: agoraStage,
        analise_stage: analiseStage,

        stage_divergence:
          stageComparison.divergence,

        stage_comparison_reliable:
          stageComparison.reliable,

        adherence:
          method?.adherence ?? null,

        recovery_guidance:
          method?.recovery_guidance ??
          null,
      },

      coaching: {
        seller_strengths:
          current_reading?.reading
            .seller_strengths ?? [],

        improvement_points:
          current_reading?.reading
            .improvement_points ?? [],

        source_event_id:
          current_reading
            ?.source_event_id ?? null,

        generated_at:
          current_reading
            ?.generated_at ?? null,
      },

      cross_conversation_coaching:
        crossConversationCoaching,

      provenance: {
        conversation_key,

        agora_updated_at:
          agoraRecord?.updated_at ??
          null,

        analise_source_event_id:
          current_reading
            ?.source_event_id ?? null,

        analise_state_record_id:
          current_reading
            ?.state_record_id ?? null,

        analise_state_version:
          current_reading
            ?.state_version ?? null,
      },
    }
  } catch (error) {
    console.error(
      '[CANONICAL_METHOD_COACHING] lookup or aggregation failed, continuing without method/coaching',
      {
        company_id,
        cycle_id,
        conversation_key,
        error,
      },
    )

    return null
  }
}
