import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

import {
  STATEFUL_COPILOT_COMMITMENT_STATUSES,
  STATEFUL_COPILOT_CONFIDENCE_LEVELS,
  STATEFUL_COPILOT_CONTRACT_VERSION,
  STATEFUL_COPILOT_COMMERCIAL_RELEVANCES,
  STATEFUL_COPILOT_COMMERCIAL_ROLES,
  type StatefulCopilotAgendaSuggestion,
  type StatefulCopilotCommitmentPatch,
  type StatefulCopilotContextualEvidence,
  type StatefulCopilotCrmSuggestion,
  type StatefulCopilotEvidence,
  type StatefulCopilotInterpretation,
  type StatefulCopilotObservedItem,
  type StatefulCopilotOpenLoopCandidate,
  type StatefulCopilotOutput,
  type StatefulCopilotStatePatch,
  type StatefulCopilotStrategy,
  type StatefulCopilotValueItem,
} from './stateful-copilot-contract'

import {
  isCommerciallyActionable,
} from './commercial-relevance'

import {
  CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX,
  CLIENT_COMMERCIAL_OPEN_QUESTION_KIND,
  containsForbiddenPsychologicalProfile,
  isCommunicationBehavior,
  parseClientCommercialFactKind,
  parseMissingDiscoveryKind,
} from './client-commercial-intelligence-contract'

const LEAD_STATUSES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
] as const

type JsonRecord =
  Record<string, unknown>

export type StatefulCopilotNormalizationContext = {
  available_message_ids: string[]

  customer_message_ids: string[]

  pending_audio_message_ids: string[]

  available_products: Array<{
    product_id: string
    name: string | null
  }>

  previous_communication_observations: Array<{
    memory_id: string
    behavior: string
    evidence_count: number
  }>

  available_memory_ids: string[]

  active_memory_ids: string[]

  negotiation_evidence_detected:
    boolean

  expected_previous_state_version:
    number | null

  current_crm_status:
    DiagnosticLeadStatus | null

  prohibited_statuses:
    DiagnosticLeadStatus[]

  reference_time: string
}

function validateClientStatePatch(
  patch: StatefulCopilotStatePatch,
  context:
    StatefulCopilotNormalizationContext,
): void {
  const customerMessageIds =
    new Set(
      context.customer_message_ids,
    )

  const availableProducts =
    new Set(
      context.available_products.map(
        product =>
          product.product_id,
      ),
    )

  const rejectConflictingClosure = (
    label: string,
    code: string,
    idsToResolve: string[],
    idsToSupersede: string[],
  ) => {
    const resolvedIds =
      new Set(
        idsToResolve,
      )

    const duplicated =
      idsToSupersede.find(
        id =>
          resolvedIds.has(id),
      )

    if (duplicated) {
      fail(
        code,
        'output.state_patch',
        `${label} ${duplicated} não pode ser resolvido(a) e substituído(a) no mesmo ciclo.`,
      )
    }
  }

  rejectConflictingClosure(
    'A necessidade',
    'CONFLICTING_NEED_CLOSURE',
    patch.need_ids_to_resolve,
    patch.need_ids_to_supersede,
  )

  rejectConflictingClosure(
    'O loop aberto',
    'CONFLICTING_OPEN_LOOP_CLOSURE',
    patch.open_loop_ids_to_resolve,
    patch.open_loop_ids_to_supersede,
  )

  rejectConflictingClosure(
    'A objeção',
    'CONFLICTING_OBJECTION_CLOSURE',
    patch.objection_ids_to_resolve,
    patch.objection_ids_to_supersede,
  )

  rejectConflictingClosure(
    'A incerteza',
    'CONFLICTING_UNCERTAINTY_CLOSURE',
    patch.uncertainty_ids_to_resolve,
    patch.uncertainty_ids_to_supersede,
  )

  const requireCustomerEvidence = (
    evidenceMessageIds: string[],
    path: string,
  ) => {
    if (
      !evidenceMessageIds.some(
        id =>
          customerMessageIds.has(id),
      )
    ) {
      fail(
        'CUSTOMER_EVIDENCE_REQUIRED',
        path,
        'A inteligência do cliente precisa apontar para uma mensagem incoming do próprio cliente.',
      )
    }
  }

  let primaryProducts = 0

  patch.facts_to_add.forEach(
    (fact, index) => {
      const path =
        `output.state_patch.facts_to_add[${index}]`

      const descriptor =
        parseClientCommercialFactKind(
          fact.kind,
        )

      if (!descriptor) {
        if (
          fact.kind.startsWith(
            'client.',
          )
        ) {
          fail(
            'UNKNOWN_CLIENT_FACT_KIND',
            `${path}.kind`,
            'O tipo de inteligência comercial do cliente não é canônico.',
          )
        }

        return
      }

      requireCustomerEvidence(
        fact.evidence_message_ids,
        `${path}.evidence_message_ids`,
      )

      if (
        descriptor.category ===
          'objective' ||
        descriptor.category ===
          'problem' ||
        descriptor.category ===
          'impact' ||
        descriptor.category ===
          'interest' ||
        descriptor.category ===
          'decision_criterion' ||
        descriptor.category ===
          'preference'
      ) {
        if (fact.value !== null) {
          fail(
            'CLIENT_FACT_VALUE_NOT_ALLOWED',
            `${path}.value`,
            'Objetivo, problema, impacto, interesse, critério e preferência usam summary e value=null.',
          )
        }

        return
      }

      if (
        descriptor.category ===
        'product'
      ) {
        if (!fact.value) {
          fail(
            'PRODUCT_REFERENCE_REQUIRED',
            `${path}.value`,
            'Produto discutido precisa preservar o product_id canônico ou o nome observado.',
          )
        }

        if (
          descriptor.source ===
            'catalog' &&
          !availableProducts.has(
            fact.value,
          )
        ) {
          fail(
            'UNKNOWN_CANONICAL_PRODUCT',
            `${path}.value`,
            'O product_id informado não pertence ao catálogo canônico disponível.',
          )
        }

        if (
          descriptor.interest_level ===
          'primary'
        ) {
          primaryProducts += 1
        }

        return
      }

      if (
        descriptor.category ===
          'competitor'
      ) {
        if (
          (
            descriptor.mention_type ===
              'named' &&
            !fact.value
          ) ||
          (
            descriptor.mention_type ===
              'unnamed_alternative' &&
            fact.value !== null
          )
        ) {
          fail(
            'COMPETITOR_REFERENCE_MISMATCH',
            `${path}.value`,
            'Concorrente nominal exige nome; alternativa sem nome precisa usar value=null.',
          )
        }

        return
      }

      if (
        descriptor.category !==
        'communication'
      ) {
        return
      }

      if (
        !isCommunicationBehavior(
          fact.value,
        )
      ) {
        fail(
          'INVALID_COMMUNICATION_BEHAVIOR',
          `${path}.value`,
          'A comunicação observada precisa usar um comportamento permitido.',
        )
      }

      if (
        containsForbiddenPsychologicalProfile(
          fact.summary,
        )
      ) {
        fail(
          'PSYCHOLOGICAL_PROFILE_NOT_ALLOWED',
          `${path}.summary`,
          'Comunicação observada não pode afirmar psicologia ou personalidade.',
        )
      }

      if (
        descriptor.observation_type ===
        'pattern'
      ) {
        const currentEvidenceCount =
          new Set(
            fact.evidence_message_ids
              .filter(
                id =>
                  customerMessageIds.has(id),
              ),
          ).size

        const previousEvidenceCount =
          context
            .previous_communication_observations
            .filter(
              observation =>
                observation.behavior ===
                  fact.value &&
                patch
                  .fact_ids_to_supersede
                  .includes(
                    observation.memory_id,
                  ),
            )
            .reduce(
              (
                total,
                observation,
              ) =>
                total +
                observation
                  .evidence_count,
              0,
            )

        if (
          currentEvidenceCount +
          previousEvidenceCount <
          2
        ) {
          fail(
            'COMMUNICATION_PATTERN_EVIDENCE_REQUIRED',
            `${path}.evidence_message_ids`,
            'Padrão de comunicação exige pelo menos duas evidências incoming, atuais ou acumuladas por memória substituída.',
          )
        }
      }
    },
  )

  if (primaryProducts > 1) {
    fail(
      'MULTIPLE_PRIMARY_PRODUCTS',
      'output.state_patch.facts_to_add',
      'Somente um produto pode ser o maior interesse atual do cliente.',
    )
  }

  patch.needs_to_add.forEach(
    (item, index) =>
      requireCustomerEvidence(
        item.evidence_message_ids,
        `output.state_patch.needs_to_add[${index}].evidence_message_ids`,
      ),
  )

  patch.objections_to_add.forEach(
    (item, index) =>
      requireCustomerEvidence(
        item.evidence_message_ids,
        `output.state_patch.objections_to_add[${index}].evidence_message_ids`,
      ),
  )

  patch.open_loops_to_add.forEach(
    (item, index) => {
      if (
        item.kind ===
        CLIENT_COMMERCIAL_OPEN_QUESTION_KIND
      ) {
        requireCustomerEvidence(
          item.evidence_message_ids,
          `output.state_patch.open_loops_to_add[${index}].evidence_message_ids`,
        )
      }
    },
  )

  patch.uncertainties_to_add.forEach(
    (item, index) => {
      const path =
        `output.state_patch.uncertainties_to_add[${index}]`

      if (
        item.kind.startsWith(
          CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX,
        ) &&
        parseMissingDiscoveryKind(
          item.kind,
        ) === null
      ) {
        fail(
          'INVALID_MISSING_DISCOVERY_TOPIC',
          `${path}.kind`,
          'Missing discovery precisa usar um tópico canônico.',
        )
      }

      requireCustomerEvidence(
        item.evidence_message_ids,
        `${path}.evidence_message_ids`,
      )
    },
  )

  const semanticStatements = [
    ...patch.facts_to_add
      .map(
        fact => ({
          category:
            parseClientCommercialFactKind(
              fact.kind,
            )?.category,
          summary:
            fact.summary
              .trim()
              .toLocaleLowerCase(
                'pt-BR',
              ),
        }),
      )
      .filter(
        item =>
          [
            'objective',
            'problem',
            'impact',
          ].includes(
            item.category ?? '',
          ),
      ),
    ...patch.needs_to_add.map(
      need => ({
        category:
          'need',
        summary:
          need.summary
            .trim()
            .toLocaleLowerCase(
              'pt-BR',
            ),
      }),
    ),
  ]

  for (
    let index = 0;
    index < semanticStatements.length;
    index += 1
  ) {
    const statement =
      semanticStatements[index]

    if (
      semanticStatements.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          candidate.category !==
            statement.category &&
          candidate.summary ===
            statement.summary,
      )
    ) {
      fail(
        'CLIENT_CONCEPT_DUPLICATION',
        'output.state_patch',
        'Objetivo, problema, impacto e necessidade não podem repetir a mesma afirmação.',
      )
    }
  }
}

export class StatefulCopilotContractError
  extends Error {
  readonly code: string
  readonly path: string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)

    this.name =
      'StatefulCopilotContractError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new StatefulCopilotContractError(
    code,
    path,
    message,
  )
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

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (!isRecord(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser um objeto.`,
    )
  }

  return value
}

function requireArray(
  value: unknown,
  path: string,
): unknown[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  return value
}

function requireString(
  value: unknown,
  path: string,
  maximumLength = 4000,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser um texto.`,
    )
  }

  const normalized =
    value.trim()

  if (!normalized) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  if (
    normalized.length >
    maximumLength
  ) {
    fail(
      'VALUE_TOO_LONG',
      path,
      `${path} excede o limite permitido.`,
    )
  }

  return normalized
}

function requireNullableString(
  value: unknown,
  path: string,
  maximumLength = 4000,
): string | null {
  if (value === null) {
    return null
  }

  return requireString(
    value,
    path,
    maximumLength,
  )
}

function requireBoolean(
  value: unknown,
  path: string,
): boolean {
  if (typeof value !== 'boolean') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser booleano.`,
    )
  }

  return value
}

function requireLiteralTrue(
  value: unknown,
  path: string,
): true {
  if (value !== true) {
    fail(
      'HUMAN_CONFIRMATION_REQUIRED',
      path,
      `${path} precisa ser true.`,
    )
  }

  return true
}

function requireNullableVersion(
  value: unknown,
  path: string,
): number | null {
  if (value === null) {
    return null
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    fail(
      'INVALID_STATE_VERSION',
      path,
      `${path} precisa ser null ou um inteiro positivo.`,
    )
  }

  return value
}

function requireUniqueStringArray(
  value: unknown,
  path: string,
  allowEmpty = true,
): string[] {
  const values =
    requireArray(
      value,
      path,
    )

  const normalized =
    values.map(
      (item, index) =>
        requireString(
          item,
          `${path}[${index}]`,
          500,
        ),
    )

  if (
    !allowEmpty &&
    normalized.length === 0
  ) {
    fail(
      'EMPTY_LIST',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  const unique =
    new Set(normalized)

  if (
    unique.size !==
    normalized.length
  ) {
    fail(
      'DUPLICATE_VALUE',
      path,
      `${path} não pode conter valores duplicados.`,
    )
  }

  return normalized
}

function requireNullableDateTime(
  value: unknown,
  path: string,
): string | null {
  if (value === null) {
    return null
  }

  const normalized =
    requireString(
      value,
      path,
      100,
    )

  const timestamp =
    Date.parse(normalized)

  if (!Number.isFinite(timestamp)) {
    fail(
      'INVALID_DATETIME',
      path,
      `${path} precisa possuir uma data válida.`,
    )
  }

  return normalized
}

function requireLeadStatus(
  value: unknown,
  path: string,
): DiagnosticLeadStatus {
  if (
    typeof value !== 'string' ||
    !LEAD_STATUSES.includes(
      value as DiagnosticLeadStatus,
    )
  ) {
    fail(
      'INVALID_CRM_STATUS',
      path,
      `${path} possui uma etapa inválida.`,
    )
  }

  return value as DiagnosticLeadStatus
}

function requireNullableLeadStatus(
  value: unknown,
  path: string,
): DiagnosticLeadStatus | null {
  if (value === null) {
    return null
  }

  return requireLeadStatus(
    value,
    path,
  )
}

function requireCommercialRole(
  value: unknown,
  path: string,
): StatefulCopilotOutput['commercial_role'] {
  if (
    typeof value !== 'string' ||
    !STATEFUL_COPILOT_COMMERCIAL_ROLES
      .includes(
        value as StatefulCopilotOutput[
          'commercial_role'
        ],
      )
  ) {
    fail(
      'INVALID_COMMERCIAL_ROLE',
      path,
      `${path} possui um papel inválido.`,
    )
  }

  return value as StatefulCopilotOutput[
    'commercial_role'
  ]
}

function requireCommercialRelevance(
  value: unknown,
  path: string,
): StatefulCopilotOutput['commercial_relevance'] {
  if (
    typeof value !== 'string' ||
    !STATEFUL_COPILOT_COMMERCIAL_RELEVANCES
      .includes(
        value as StatefulCopilotOutput[
          'commercial_relevance'
        ],
      )
  ) {
    fail(
      'INVALID_COMMERCIAL_RELEVANCE',
      path,
      `${path} possui uma relevância comercial inválida.`,
    )
  }

  return value as StatefulCopilotOutput[
    'commercial_relevance'
  ]
}

function clearStatePatch(
  statePatch: StatefulCopilotStatePatch,
): void {
  for (
    const key of
    Object.keys(
      statePatch,
    ) as Array<keyof StatefulCopilotStatePatch>
  ) {
    statePatch[key] = []
  }
}

function requireConfidence(
  value: unknown,
  path: string,
): StatefulCopilotObservedItem['confidence'] {
  if (
    typeof value !== 'string' ||
    !STATEFUL_COPILOT_CONFIDENCE_LEVELS
      .includes(
        value as StatefulCopilotObservedItem[
          'confidence'
        ],
      )
  ) {
    fail(
      'INVALID_CONFIDENCE',
      path,
      `${path} possui uma confiança inválida.`,
    )
  }

  return value as StatefulCopilotObservedItem[
    'confidence'
  ]
}

function requireCommitmentStatus(
  value: unknown,
  path: string,
): StatefulCopilotCommitmentPatch['status'] {
  if (
    typeof value !== 'string' ||
    !STATEFUL_COPILOT_COMMITMENT_STATUSES
      .includes(
        value as StatefulCopilotCommitmentPatch[
          'status'
        ],
      )
  ) {
    fail(
      'INVALID_COMMITMENT_STATUS',
      path,
      `${path} possui um estado inválido.`,
    )
  }

  return value as StatefulCopilotCommitmentPatch[
    'status'
  ]
}

function normalizeEvidenceIds(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
  allowEmpty = false,
): string[] {
  const ids =
    requireUniqueStringArray(
      value,
      path,
      allowEmpty,
    )

  for (const id of ids) {
    if (
      !analyzedMessageIds.has(id)
    ) {
      fail(
        'UNKNOWN_EVIDENCE',
        path,
        `${path} referencia a mensagem não analisada ${id}.`,
      )
    }

    collectedEvidenceIds.add(id)
  }

  return ids
}

function normalizeEvidence(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
): StatefulCopilotEvidence {
  const record =
    requireRecord(
      value,
      path,
    )

  return {
    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    evidence_message_ids:
      normalizeEvidenceIds(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
        analyzedMessageIds,
        collectedEvidenceIds,
      ),
  }
}

function normalizeMemoryIds(
  value: unknown,
  path: string,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): string[] {
  const ids =
    requireUniqueStringArray(
      value,
      path,
    )

  for (const id of ids) {
    if (
      !availableMemoryIds.has(id)
    ) {
      fail(
        'UNKNOWN_MEMORY_REFERENCE',
        path,
        `${path} referencia a memória indisponível ${id}.`,
      )
    }

    if (
      !activeMemoryIds.has(id)
    ) {
      fail(
        'INACTIVE_MEMORY_REFERENCE',
        path,
        `${path} referencia a memória inativa ${id}.`,
      )
    }

    collectedMemoryIds.add(id)
  }

  return ids
}

function normalizeNullablePatchMemoryId(
  value: unknown,
  path: string,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): string | null {
  if (value === null) {
    return null
  }

  const memoryId =
    requireString(
      value,
      path,
      500,
    )

  if (
    !availableMemoryIds.has(
      memoryId,
    )
  ) {
    fail(
      'UNKNOWN_MEMORY_REFERENCE',
      path,
      `${path} referencia a memória indisponível ${memoryId}.`,
    )
  }

  if (
    !activeMemoryIds.has(
      memoryId,
    )
  ) {
    fail(
      'INACTIVE_MEMORY_REFERENCE',
      path,
      `${path} referencia a memória inativa ${memoryId}.`,
    )
  }

  collectedMemoryIds.add(
    memoryId,
  )

  return memoryId
}

function requireContextualGrounding(
  evidenceMessageIds: string[],
  memoryIds: string[],
  path: string,
): void {
  if (
    evidenceMessageIds.length === 0 &&
    memoryIds.length === 0
  ) {
    fail(
      'EMPTY_CONTEXTUAL_GROUNDING',
      path,
      'A conclusão contextual precisa possuir evidência atual ou referência à memória anterior.',
    )
  }
}

function normalizeContextualEvidence(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): StatefulCopilotContextualEvidence {
  const record =
    requireRecord(
      value,
      path,
    )

  const evidenceMessageIds =
    normalizeEvidenceIds(
      record.evidence_message_ids,
      `${path}.evidence_message_ids`,
      analyzedMessageIds,
      collectedEvidenceIds,
      true,
    )

  const memoryIds =
    normalizeMemoryIds(
      record.memory_ids,
      `${path}.memory_ids`,
      availableMemoryIds,
      activeMemoryIds,
      collectedMemoryIds,
    )

  requireContextualGrounding(
    evidenceMessageIds,
    memoryIds,
    path,
  )

  return {
    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    evidence_message_ids:
      evidenceMessageIds,

    memory_ids:
      memoryIds,
  }
}

function normalizeNullableContextualEvidence(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): StatefulCopilotContextualEvidence | null {
  if (value === null) {
    return null
  }

  return normalizeContextualEvidence(
    value,
    path,
    analyzedMessageIds,
    collectedEvidenceIds,
    availableMemoryIds,
    activeMemoryIds,
    collectedMemoryIds,
  )
}

function normalizeNullableEvidence(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
): StatefulCopilotEvidence | null {
  if (value === null) {
    return null
  }

  return normalizeEvidence(
    value,
    path,
    analyzedMessageIds,
    collectedEvidenceIds,
  )
}

function normalizeObservedItem(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
): StatefulCopilotObservedItem {
  const record =
    requireRecord(
      value,
      path,
    )

  const evidence =
    normalizeEvidence(
      record,
      path,
      analyzedMessageIds,
      collectedEvidenceIds,
    )

  return {
    ...evidence,

    kind:
      requireString(
        record.kind,
        `${path}.kind`,
        200,
      ),

    confidence:
      requireConfidence(
        record.confidence,
        `${path}.confidence`,
      ),
  }
}

function normalizeValueItem(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
): StatefulCopilotValueItem {
  const record =
    requireRecord(
      value,
      path,
    )

  const item =
    normalizeObservedItem(
      record,
      path,
      analyzedMessageIds,
      collectedEvidenceIds,
    )

  return {
    ...item,

    value:
      requireNullableString(
        record.value,
        `${path}.value`,
      ),
  }
}

function normalizeOpenLoop(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
): StatefulCopilotOpenLoopCandidate {
  const record =
    requireRecord(
      value,
      path,
    )

  const evidence =
    normalizeEvidence(
      record,
      path,
      analyzedMessageIds,
      collectedEvidenceIds,
    )

  return {
    ...evidence,

    kind:
      requireString(
        record.kind,
        `${path}.kind`,
        200,
      ),
  }
}

function normalizeCommitmentPatch(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): StatefulCopilotCommitmentPatch {
  const record =
    requireRecord(
      value,
      path,
    )

  const evidence =
    normalizeEvidence(
      record,
      path,
      analyzedMessageIds,
      collectedEvidenceIds,
    )

  return {
    ...evidence,

    commitment_id:
      normalizeNullablePatchMemoryId(
        record.commitment_id,
        `${path}.commitment_id`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    kind:
      requireString(
        record.kind,
        `${path}.kind`,
        200,
      ),

    status:
      requireCommitmentStatus(
        record.status,
        `${path}.status`,
      ),

    scheduled_at:
      requireNullableDateTime(
        record.scheduled_at,
        `${path}.scheduled_at`,
      ),

    proposed_at:
      requireNullableDateTime(
        record.proposed_at,
        `${path}.proposed_at`,
      ),
  }
}

function normalizeList<T>(
  value: unknown,
  path: string,
  normalizer: (
    item: unknown,
    itemPath: string,
  ) => T,
): T[] {
  return requireArray(
    value,
    path,
  ).map(
    (item, index) =>
      normalizer(
        item,
        `${path}[${index}]`,
      ),
  )
}

function normalizeStatePatch(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): StatefulCopilotStatePatch {
  const record =
    requireRecord(
      value,
      path,
    )

  return {
    facts_to_add:
      normalizeList(
        record.facts_to_add,
        `${path}.facts_to_add`,
        (item, itemPath) =>
          normalizeValueItem(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
          ),
      ),

    fact_ids_to_supersede:
      normalizeMemoryIds(
        record.fact_ids_to_supersede,
        `${path}.fact_ids_to_supersede`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    needs_to_add:
      normalizeList(
        record.needs_to_add,
        `${path}.needs_to_add`,
        (item, itemPath) =>
          normalizeObservedItem(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
          ),
      ),

    need_ids_to_resolve:
      normalizeMemoryIds(
        record.need_ids_to_resolve,
        `${path}.need_ids_to_resolve`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    need_ids_to_supersede:
      normalizeMemoryIds(
        record.need_ids_to_supersede,
        `${path}.need_ids_to_supersede`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    open_loops_to_add:
      normalizeList(
        record.open_loops_to_add,
        `${path}.open_loops_to_add`,
        (item, itemPath) =>
          normalizeOpenLoop(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
          ),
      ),

    open_loop_ids_to_resolve:
      normalizeMemoryIds(
        record.open_loop_ids_to_resolve,
        `${path}.open_loop_ids_to_resolve`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    open_loop_ids_to_supersede:
      normalizeMemoryIds(
        record.open_loop_ids_to_supersede,
        `${path}.open_loop_ids_to_supersede`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    objections_to_add:
      normalizeList(
        record.objections_to_add,
        `${path}.objections_to_add`,
        (item, itemPath) =>
          normalizeObservedItem(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
          ),
      ),

    objection_ids_to_resolve:
      normalizeMemoryIds(
        record.objection_ids_to_resolve,
        `${path}.objection_ids_to_resolve`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    objection_ids_to_supersede:
      normalizeMemoryIds(
        record.objection_ids_to_supersede,
        `${path}.objection_ids_to_supersede`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    commitments_to_upsert:
      normalizeList(
        record.commitments_to_upsert,
        `${path}.commitments_to_upsert`,
        (item, itemPath) =>
          normalizeCommitmentPatch(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
            availableMemoryIds,
            activeMemoryIds,
            collectedMemoryIds,
          ),
      ),

    signals_to_add:
      normalizeList(
        record.signals_to_add,
        `${path}.signals_to_add`,
        (item, itemPath) =>
          normalizeObservedItem(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
          ),
      ),

    signal_ids_to_resolve:
      normalizeMemoryIds(
        record.signal_ids_to_resolve,
        `${path}.signal_ids_to_resolve`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    uncertainties_to_add:
      normalizeList(
        record.uncertainties_to_add,
        `${path}.uncertainties_to_add`,
        (item, itemPath) =>
          normalizeObservedItem(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
          ),
      ),

    uncertainty_ids_to_resolve:
      normalizeMemoryIds(
        record.uncertainty_ids_to_resolve,
        `${path}.uncertainty_ids_to_resolve`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    uncertainty_ids_to_supersede:
      normalizeMemoryIds(
        record.uncertainty_ids_to_supersede,
        `${path}.uncertainty_ids_to_supersede`,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),
  }
}

function normalizeInterpretation(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): StatefulCopilotInterpretation {
  const record =
    requireRecord(
      value,
      path,
    )

  const currentMoment =
    normalizeContextualEvidence(
      record.current_moment,
      `${path}.current_moment`,
      analyzedMessageIds,
      collectedEvidenceIds,
      availableMemoryIds,
      activeMemoryIds,
      collectedMemoryIds,
    )

  if (
    currentMoment
      .evidence_message_ids
      .length === 0
  ) {
    fail(
      'CURRENT_MESSAGE_EVIDENCE_REQUIRED',
      `${path}.current_moment.evidence_message_ids`,
      'O momento atual precisa possuir evidência da sessão temporal atual.',
    )
  }

  return {
    what_changed:
      normalizeNullableEvidence(
        record.what_changed,
        `${path}.what_changed`,
        analyzedMessageIds,
        collectedEvidenceIds,
      ),

    what_remains_valid:
      normalizeList(
        record.what_remains_valid,
        `${path}.what_remains_valid`,
        (item, itemPath) =>
          normalizeContextualEvidence(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
            availableMemoryIds,
            activeMemoryIds,
            collectedMemoryIds,
          ),
      ),

    current_moment:
      currentMoment,

    customer_need:
      normalizeNullableContextualEvidence(
        record.customer_need,
        `${path}.customer_need`,
        analyzedMessageIds,
        collectedEvidenceIds,
        availableMemoryIds,
        activeMemoryIds,
        collectedMemoryIds,
      ),

    uncertainties:
      normalizeList(
        record.uncertainties,
        `${path}.uncertainties`,
        (item, itemPath) =>
          normalizeContextualEvidence(
            item,
            itemPath,
            analyzedMessageIds,
            collectedEvidenceIds,
            availableMemoryIds,
            activeMemoryIds,
            collectedMemoryIds,
          ),
      ),
  }
}

function normalizeStrategy(
  value: unknown,
  path: string,
  analyzedMessageIds: Set<string>,
  collectedEvidenceIds: Set<string>,
  availableMemoryIds: Set<string>,
  activeMemoryIds: Set<string>,
  collectedMemoryIds: Set<string>,
): StatefulCopilotStrategy {
  const record =
    requireRecord(
      value,
      path,
    )

  const evidenceMessageIds =
    normalizeEvidenceIds(
      record.evidence_message_ids,
      `${path}.evidence_message_ids`,
      analyzedMessageIds,
      collectedEvidenceIds,
      true,
    )

  const memoryIds =
    normalizeMemoryIds(
      record.memory_ids,
      `${path}.memory_ids`,
      availableMemoryIds,
      activeMemoryIds,
      collectedMemoryIds,
    )

  requireContextualGrounding(
    evidenceMessageIds,
    memoryIds,
    path,
  )

  if (
    evidenceMessageIds.length === 0
  ) {
    fail(
      'CURRENT_MESSAGE_EVIDENCE_REQUIRED',
      `${path}.evidence_message_ids`,
      'A estratégia precisa possuir evidência da sessão temporal atual.',
    )
  }

  return {
    method_application:
      requireString(
        record.method_application,
        `${path}.method_application`,
      ),

    rationale:
      requireString(
        record.rationale,
        `${path}.rationale`,
      ),

    next_move:
      requireString(
        record.next_move,
        `${path}.next_move`,
      ),

    recommended_question:
      requireNullableString(
        record.recommended_question,
        `${path}.recommended_question`,
      ),

    suggested_message:
      requireNullableString(
        record.suggested_message,
        `${path}.suggested_message`,
      ),

    evidence_message_ids:
      evidenceMessageIds,

    memory_ids:
      memoryIds,
  }
}

function normalizeCrmSuggestion(
  value: unknown,
  path: string,
  context: StatefulCopilotNormalizationContext,
): StatefulCopilotCrmSuggestion {
  const record =
    requireRecord(
      value,
      path,
    )

  const shouldChange =
    requireBoolean(
      record.should_change_crm_stage,
      `${path}.should_change_crm_stage`,
    )

  const recommendedStatus =
    requireNullableLeadStatus(
      record.recommended_status,
      `${path}.recommended_status`,
    )

  const rationale =
    requireNullableString(
      record.rationale,
      `${path}.rationale`,
    )

  if (
    shouldChange &&
    recommendedStatus === null
  ) {
    fail(
      'CRM_STATUS_REQUIRED',
      `${path}.recommended_status`,
      'Mudança de CRM exige etapa recomendada.',
    )
  }

  if (
    !shouldChange &&
    recommendedStatus !== null
  ) {
    fail(
      'CRM_STATUS_NOT_ALLOWED',
      `${path}.recommended_status`,
      'CRM sem mudança não pode recomendar uma etapa.',
    )
  }

  if (
    shouldChange &&
    recommendedStatus ===
      'negociacao' &&
    context
      .current_crm_status !==
      'negociacao' &&
    !context
      .negotiation_evidence_detected
  ) {
    return {
      should_change_crm_stage:
        false,

      recommended_status:
        null,

      rationale:
        null,

      requires_human_confirmation:
        requireLiteralTrue(
          record.requires_human_confirmation,
          `${path}.requires_human_confirmation`,
        ),
    }
  }

  if (
    shouldChange &&
    rationale === null
  ) {
    fail(
      'CRM_RATIONALE_REQUIRED',
      `${path}.rationale`,
      'Mudança de CRM exige justificativa.',
    )
  }

  if (
    shouldChange &&
    recommendedStatus ===
      context.current_crm_status
  ) {
    fail(
      'CRM_STATUS_UNCHANGED',
      `${path}.recommended_status`,
      'A etapa recomendada precisa ser diferente da etapa atual.',
    )
  }

  if (
    recommendedStatus !== null &&
    context.prohibited_statuses
      .includes(recommendedStatus)
  ) {
    fail(
      'CRM_STATUS_PROHIBITED',
      `${path}.recommended_status`,
      'A etapa recomendada está proibida pelo contexto comercial.',
    )
  }

  return {
    should_change_crm_stage:
      shouldChange,

    recommended_status:
      recommendedStatus,

    rationale,

    requires_human_confirmation:
      requireLiteralTrue(
        record.requires_human_confirmation,
        `${path}.requires_human_confirmation`,
      ),
  }
}

function normalizeAgendaSuggestion(
  value: unknown,
  path: string,
  context: StatefulCopilotNormalizationContext,
): StatefulCopilotAgendaSuggestion {
  const record =
    requireRecord(
      value,
      path,
    )

  const shouldChange =
    requireBoolean(
      record.should_change_agenda,
      `${path}.should_change_agenda`,
    )

  const expectedAt =
    requireNullableDateTime(
      record.expected_next_action_at,
      `${path}.expected_next_action_at`,
    )

  const rationale =
    requireNullableString(
      record.rationale,
      `${path}.rationale`,
    )

  if (
    shouldChange &&
    expectedAt === null
  ) {
    fail(
      'AGENDA_DATE_REQUIRED',
      `${path}.expected_next_action_at`,
      'Mudança de Agenda exige uma data.',
    )
  }

  if (
    !shouldChange &&
    expectedAt !== null
  ) {
    fail(
      'AGENDA_DATE_NOT_ALLOWED',
      `${path}.expected_next_action_at`,
      'Agenda sem mudança não pode informar uma nova data.',
    )
  }

  if (
    shouldChange &&
    rationale === null
  ) {
    fail(
      'AGENDA_RATIONALE_REQUIRED',
      `${path}.rationale`,
      'Mudança de Agenda exige justificativa.',
    )
  }

  if (
    expectedAt !== null &&
    Date.parse(expectedAt) <=
      Date.parse(context.reference_time)
  ) {
    fail(
      'AGENDA_DATE_NOT_FUTURE',
      `${path}.expected_next_action_at`,
      'A próxima ação precisa estar no futuro.',
    )
  }

  return {
    should_change_agenda:
      shouldChange,

    expected_next_action_at:
      expectedAt,

    rationale,

    requires_human_confirmation:
      requireLiteralTrue(
        record.requires_human_confirmation,
        `${path}.requires_human_confirmation`,
      ),
  }
}

export function normalizeStatefulCopilotOutput(
  value: unknown,
  context: StatefulCopilotNormalizationContext,
): StatefulCopilotOutput {
  if (
    !Number.isFinite(
      Date.parse(
        context.reference_time,
      ),
    )
  ) {
    fail(
      'INVALID_REFERENCE_TIME',
      'context.reference_time',
      'O horário de referência do diagnóstico é inválido.',
    )
  }

  const root =
    requireRecord(
      value,
      'output',
    )

  if (
    root.contract_version !==
    STATEFUL_COPILOT_CONTRACT_VERSION
  ) {
    fail(
      'CONTRACT_VERSION_MISMATCH',
      'output.contract_version',
      'A versão do contrato stateful é incompatível.',
    )
  }

  const previousStateVersion =
    requireNullableVersion(
      root.previous_state_version,
      'output.previous_state_version',
    )

  if (
    previousStateVersion !==
    context.expected_previous_state_version
  ) {
    fail(
      'STALE_STATE_VERSION',
      'output.previous_state_version',
      'A análise foi produzida para uma versão diferente do estado comercial.',
    )
  }

  const availableMessageIds =
    new Set(
      context.available_message_ids,
    )

  const customerMessageIds =
    new Set(
      context.customer_message_ids,
    )

  for (const messageId of customerMessageIds) {
    if (
      !availableMessageIds.has(
        messageId,
      )
    ) {
      fail(
        'CUSTOMER_MESSAGE_NOT_AVAILABLE',
        'context.customer_message_ids',
        `A mensagem incoming ${messageId} não pertence à fotografia analisada.`,
      )
    }
  }

  const availableMemoryIds =
    new Set(
      context.available_memory_ids,
    )

  const activeMemoryIds =
    new Set(
      context.active_memory_ids,
    )

  for (
    const memoryId of
    activeMemoryIds
  ) {
    if (
      !availableMemoryIds.has(
        memoryId,
      )
    ) {
      fail(
        'ACTIVE_MEMORY_NOT_AVAILABLE',
        'context.active_memory_ids',
        `A memória ativa ${memoryId} não pertence ao estado comercial disponível.`,
      )
    }
  }

  const analyzedMessageIds =
    requireUniqueStringArray(
      root.analyzed_message_ids,
      'output.analyzed_message_ids',
      false,
    )

  for (
    const messageId of
    analyzedMessageIds
  ) {
    if (
      !availableMessageIds.has(
        messageId,
      )
    ) {
      fail(
        'UNKNOWN_ANALYZED_MESSAGE',
        'output.analyzed_message_ids',
        `A mensagem ${messageId} não pertence à fotografia disponível.`,
      )
    }
  }

  const analyzedMessageIdSet =
    new Set(analyzedMessageIds)

  if (
    analyzedMessageIdSet.size !==
    availableMessageIds.size
  ) {
    fail(
      'ANALYZED_MESSAGE_SET_MISMATCH',
      'output.analyzed_message_ids',
      'As mensagens analisadas precisam coincidir com a fotografia atual.',
    )
  }

  for (
    const messageId of
    availableMessageIds
  ) {
    if (
      !analyzedMessageIdSet.has(
        messageId,
      )
    ) {
      fail(
        'ANALYZED_MESSAGE_SET_MISMATCH',
        'output.analyzed_message_ids',
        `A mensagem atual ${messageId} não foi analisada.`,
      )
    }
  }

  const collectedEvidenceIds =
    new Set<string>()

  const collectedMemoryIds =
    new Set<string>()

  const commercialRole =
    requireCommercialRole(
      root.commercial_role,
      'output.commercial_role',
    )

  const commercialRelevance =
    requireCommercialRelevance(
      root.commercial_relevance,
      'output.commercial_relevance',
    )

  const interpretation =
    normalizeInterpretation(
      root.interpretation,
      'output.interpretation',
      analyzedMessageIdSet,
      collectedEvidenceIds,
      availableMemoryIds,
      activeMemoryIds,
      collectedMemoryIds,
    )

  const statePatch =
    normalizeStatePatch(
      root.state_patch,
      'output.state_patch',
      analyzedMessageIdSet,
      collectedEvidenceIds,
      availableMemoryIds,
      activeMemoryIds,
      collectedMemoryIds,
    )

  validateClientStatePatch(
    statePatch,
    context,
  )

  const strategy =
    normalizeStrategy(
      root.strategy,
      'output.strategy',
      analyzedMessageIdSet,
      collectedEvidenceIds,
      availableMemoryIds,
      activeMemoryIds,
      collectedMemoryIds,
    )

  const operationalRecord =
    requireRecord(
      root.operational_suggestions,
      'output.operational_suggestions',
    )

  const crm =
    normalizeCrmSuggestion(
      operationalRecord.crm,
      'output.operational_suggestions.crm',
      context,
    )

  const agenda =
    normalizeAgendaSuggestion(
      operationalRecord.agenda,
      'output.operational_suggestions.agenda',
      context,
    )

  const commercialActionAllowed =
    commercialRole === 'buyer' &&
    isCommerciallyActionable(
      commercialRelevance,
    )

  // Papel e assunto atual são gates independentes. Mesmo um comprador
  // histórico não pode gerar efeito comercial quando a sessão atual é
  // não comercial ou incerta. O normalizador aplica o fail-closed antes de
  // o patch chegar ao redutor ou às camadas de CRM, Agenda e comunicação.
  if (!commercialActionAllowed) {
    clearStatePatch(
      statePatch,
    )

    crm.should_change_crm_stage = false
    crm.recommended_status = null
    crm.rationale = null

    agenda.should_change_agenda = false
    agenda.expected_next_action_at = null
    agenda.rationale = null

    interpretation.what_changed = null
    interpretation.customer_need = null
    interpretation.uncertainties = []
    interpretation.current_moment.summary =
      commercialRelevance ===
        'non_commercial'
        ? 'Conversa sem evidência comercial relevante para este ciclo.'
        : 'Momento atual sem relevância comercial confirmada.'
    interpretation.current_moment.memory_ids = []

    strategy.method_application =
      'Nenhuma aplicação comercial ao assunto atual.'
    strategy.rationale =
      commercialRelevance ===
        'non_commercial'
        ? 'A sessão atual não possui relevância comercial.'
        : 'A relevância comercial da sessão atual não pôde ser confirmada.'
    strategy.next_move =
      'Nenhuma ação comercial necessária.'
    strategy.recommended_question = null
    strategy.suggested_message = null
    strategy.memory_ids = []
  }

  const globalEvidenceIds =
    requireUniqueStringArray(
      root.evidence_message_ids,
      'output.evidence_message_ids',
      false,
    )

  for (
    const messageId of
    globalEvidenceIds
  ) {
    if (
      !analyzedMessageIdSet.has(
        messageId,
      )
    ) {
      fail(
        'UNKNOWN_GLOBAL_EVIDENCE',
        'output.evidence_message_ids',
        `A evidência global ${messageId} não pertence às mensagens analisadas.`,
      )
    }
  }

  const globalEvidenceIdSet =
    new Set(globalEvidenceIds)

  for (
    const messageId of
    collectedEvidenceIds
  ) {
    if (
      !globalEvidenceIdSet.has(
        messageId,
      )
    ) {
      fail(
        'MISSING_GLOBAL_EVIDENCE',
        'output.evidence_message_ids',
        `A evidência ${messageId} foi usada, mas não está declarada no conjunto global.`,
      )
    }
  }

  const pendingAudioMessageIds =
    new Set(
      context.pending_audio_message_ids ??
        [],
    )

  for (
    const messageId of
    collectedEvidenceIds
  ) {
    if (
      pendingAudioMessageIds.has(
        messageId,
      )
    ) {
      fail(
        'AUDIO_EVIDENCE_NOT_TRANSCRIBED',
        'output.evidence_message_ids',
        `A mensagem ${messageId} é um áudio ainda sem transcrição e não pode ser usada como evidência.`,
      )
    }
  }

  const declaredGlobalMemoryIds =
    requireUniqueStringArray(
      root.memory_ids,
      'output.memory_ids',
    )

  for (
    const memoryId of
    declaredGlobalMemoryIds
  ) {
    if (
      !availableMemoryIds.has(
        memoryId,
      )
    ) {
      fail(
        'UNKNOWN_GLOBAL_MEMORY_REFERENCE',
        'output.memory_ids',
        `A memória global ${memoryId} não pertence ao estado comercial disponível.`,
      )
    }

    if (
      !activeMemoryIds.has(
        memoryId,
      )
    ) {
      fail(
        'INACTIVE_GLOBAL_MEMORY_REFERENCE',
        'output.memory_ids',
        `A memória global ${memoryId} não está ativa no estado comercial.`,
      )
    }
  }

  const normalizedGlobalMemoryIdSet =
    new Set(
      declaredGlobalMemoryIds,
    )

  for (
    const memoryId of
    collectedMemoryIds
  ) {
    normalizedGlobalMemoryIdSet.add(
      memoryId,
    )
  }

  const globalMemoryIds =
    Array.from(
      normalizedGlobalMemoryIdSet,
    )

  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      previousStateVersion,

    analyzed_message_ids:
      analyzedMessageIds,

    commercial_role:
      commercialRole,

    commercial_relevance:
      commercialRelevance,

    interpretation,

    state_patch:
      statePatch,

    strategy,

    operational_suggestions: {
      crm,
      agenda,
    },

    evidence_message_ids:
      globalEvidenceIds,

    memory_ids:
      globalMemoryIds,
  }
}
