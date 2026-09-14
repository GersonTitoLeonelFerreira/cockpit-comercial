import {
  COMMERCIAL_READING_IMPROVEMENT_KINDS,
  COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
  normalizeCommercialReadingModelOutput,
  type CommercialReading,
  type CommercialReadingChannel,
  type CommercialReadingCustomer,
  type CommercialReadingImprovementKind,
  type CommercialReadingSellerStrengthKind,
} from './commercial-reading-contract'

import {
  buildCommercialReadingCustomerFromState,
} from './client-commercial-intelligence-contract'

import type {
  StatefulCopilotInput,
} from './stateful-copilot-input'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

import type {
  CommercialReasoningCoreV2MemoryReductionResult,
} from './commercial-reasoning-core-v2-memory-reducer'

import type {
  CommercialReasoningCoreV2Output,
} from './commercial-reasoning-core-v2-contract'

import {
  buildCommercialReasoningCoreV2SellerProjection,
  isCommercialReasoningCoreV2SellerActionable,
} from './commercial-reasoning-core-v2-seller-adapter'

export const COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_READING_ADAPTER_VERSION =
  'commercial-reasoning-core-v2-commercial-reading-adapter-v1' as const

export type CommercialReasoningCoreV2CommercialReadingAdapterReport = {
  adapter_version:
    typeof COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_READING_ADAPTER_VERSION

  customer_memory_mode:
    | 'reduced_state_applied'
    | 'previous_state_preserved'
    | 'empty_initial_state'

  writes_new_customer_memory:
    boolean

  method_projection:
    | 'mapped'
    | 'not_configured'
    | 'not_actionable'
    | 'insufficient_evidence'

  dropped_seller_strengths:
    number

  dropped_improvement_points:
    number
}

export type CommercialReasoningCoreV2CommercialReadingAdapterResult = {
  reading:
    CommercialReading

  report:
    CommercialReasoningCoreV2CommercialReadingAdapterReport
}

export class CommercialReasoningCoreV2CommercialReadingAdapterError
  extends Error {
  readonly code: string
  readonly path: string

  constructor({
    code,
    path,
    message,
  }: {
    code: string
    path: string
    message: string
  }) {
    super(message)

    this.name =
      'CommercialReasoningCoreV2CommercialReadingAdapterError'

    this.code =
      code

    this.path =
      path
  }
}

function fail({
  code,
  path,
  message,
}: {
  code: string
  path: string
  message: string
}): never {
  throw new CommercialReasoningCoreV2CommercialReadingAdapterError({
    code,
    path,
    message,
  })
}

function uniqueStrings(
  values: string[],
): string[] {
  return [
    ...new Set(
      values.filter(
        value =>
          typeof value ===
            'string' &&
          Boolean(
            value.trim(),
          ),
      ),
    ),
  ]
}

function normalizeKey(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '_',
    )
    .replace(
      /^_+|_+$/g,
      '',
    )
}

function buildEmptyCustomer():
  CommercialReadingCustomer {
  return {
    objectives: [],
    problems: [],
    impacts: [],
    needs: [],
    interests: [],
    decision_criteria: [],
    preferences: [],
    open_questions: [],
    objections: [],
    uncertainties: [],
    discussed_products: [],
    primary_product_interest:
      null,
    competitors: [],
    commitments: [],
    missing_discovery: [],
    resolved_information: [],
    superseded_information: [],
    communication: {
      events: [],
      patterns: [],
    },
  }
}

function collectMemoryIds(
  state:
    StatefulCommercialState | null,
): string[] {
  if (!state) {
    return []
  }

  return uniqueStrings([
    ...state.facts.map(
      item => item.id,
    ),
    ...state.needs.map(
      item => item.id,
    ),
    ...state.open_loops.map(
      item => item.id,
    ),
    ...state.objections.map(
      item => item.id,
    ),
    ...state.commitments.map(
      item => item.id,
    ),
    ...state.signals.map(
      item => item.id,
    ),
    ...state.uncertainties.map(
      item => item.id,
    ),
  ])
}

function buildCustomer({
  input,
  state,
}: {
  input:
    StatefulCopilotInput

  state:
    StatefulCommercialState | null
}): CommercialReadingCustomer {
  if (!state) {
    return buildEmptyCustomer()
  }

  return buildCommercialReadingCustomerFromState({
    state,

    products:
      input
        .diagnostic_input
        .commercial_context
        .products,
  })
}

function memoryReductionHasChanges(
  memoryReduction:
    CommercialReasoningCoreV2MemoryReductionResult,
): boolean {
  return Object
    .values(
      memoryReduction
        .applied_patch,
    )
    .some(
      value =>
        Array.isArray(
          value,
        ) &&
        value.length > 0,
    )
}

function validateMemoryReductionForInput({
  input,
  memoryReduction,
}: {
  input:
    StatefulCopilotInput

  memoryReduction:
    CommercialReasoningCoreV2MemoryReductionResult
}): void {
  if (
    memoryReduction
      .state
      .cycle_id !==
    input
      .diagnostic_input
      .cycle_id
  ) {
    fail({
      code:
        'MEMORY_REDUCTION_CYCLE_MISMATCH',

      path:
        'memory_reduction.state.cycle_id',

      message:
        'O estado reduzido pertence a outro ciclo comercial.',
    })
  }

  if (
    memoryReduction
      .state
      .version !==
    input
      .state_context
      .target_state_version
  ) {
    fail({
      code:
        'MEMORY_REDUCTION_VERSION_MISMATCH',

      path:
        'memory_reduction.state.version',

      message:
        'O estado reduzido não corresponde à versão alvo desta análise.',
    })
  }
}

function buildKnownEvidenceFilter(
  input:
    StatefulCopilotInput,
) {
  const known =
    new Set(
      input
        .diagnostic_input
        .conversation
        .active_message_ids,
    )

  return (
    values: string[],
  ) =>
    uniqueStrings(
      values.filter(
        value =>
          known.has(
            value,
          ),
      ),
    )
}

function mapSellerStrengthKind(
  value: string,
): CommercialReadingSellerStrengthKind {
  const normalized =
    normalizeKey(
      value,
    )

  return COMMERCIAL_READING_SELLER_STRENGTH_KINDS
    .includes(
      normalized as
        CommercialReadingSellerStrengthKind,
    )
    ? normalized as
        CommercialReadingSellerStrengthKind
    : 'other'
}

function mapImprovementKind(
  value: string,
): CommercialReadingImprovementKind {
  const normalized =
    normalizeKey(
      value,
    )

  return COMMERCIAL_READING_IMPROVEMENT_KINDS
    .includes(
      normalized as
        CommercialReadingImprovementKind,
    )
    ? normalized as
        CommercialReadingImprovementKind
    : 'other'
}

function buildAnalysisState(
  output:
    CommercialReasoningCoreV2Output,
): {
  status:
    CommercialReading[
      'analysis_status'
    ]

  limitations:
    string[]
} {
  if (
    output.status !==
    'limited'
  ) {
    return {
      status:
        'complete',

      limitations:
        [],
    }
  }

  const limitations =
    uniqueStrings(
      output
        .factuality
        .unknowns,
    )

  return {
    status:
      'limited',

    limitations:
      limitations.length > 0
        ? limitations
        : [
            'A análise foi marcada como limitada pelo Commercial Reasoning Core V2.',
          ],
  }
}

type CanonicalMethodStageReference = {
  step_order: number
  stage_key: string | null
  name: string
}

function buildCanonicalMethodStageReferences(
  input:
    StatefulCopilotInput,
): CanonicalMethodStageReference[] {
  const salesMethod =
    input
      .diagnostic_input
      .commercial_context
      .sales_method

  if (!salesMethod.configured) {
    return []
  }

  if (
    salesMethod
      .contract_version ===
      'commercial-method-v2' &&
    salesMethod.definition
  ) {
    return [
      ...salesMethod
        .definition
        .stages,
    ]
      .sort(
        (a, b) =>
          a.display_order -
          b.display_order,
      )
      .map(
        stage => ({
          step_order:
            stage.display_order,

          stage_key:
            stage.key,

          name:
            stage.name,
        }),
      )
  }

  return [
    ...salesMethod.steps,
  ]
    .sort(
      (a, b) =>
        a.step_order -
        b.step_order,
    )
    .map(
      stage => ({
        step_order:
          stage.step_order,

        stage_key:
          null,

        name:
          stage.name,
      }),
    )
}

function buildMethodProjection({
  input,
  output,
  sellerActionable,
  filterEvidence,
}: {
  input:
    StatefulCopilotInput

  output:
    CommercialReasoningCoreV2Output

  sellerActionable:
    boolean

  filterEvidence:
    (
      values: string[],
    ) => string[]
}): {
  value: unknown
  mode:
    CommercialReasoningCoreV2CommercialReadingAdapterReport[
      'method_projection'
    ]
} {
  const salesMethod =
    input
      .diagnostic_input
      .commercial_context
      .sales_method

  if (!salesMethod.configured) {
    return {
      value:
        null,

      mode:
        'not_configured',
    }
  }

  if (!sellerActionable) {
    return {
      value:
        null,

      mode:
        'not_actionable',
    }
  }

  const stages =
    buildCanonicalMethodStageReferences(
      input,
    )

  const methodEvidence =
    filterEvidence(
      output
        .method
        .evidence_message_ids,
    )

  const currentStageKey =
    output
      .method
      .current_stage
      ? normalizeKey(
          output
            .method
            .current_stage,
        )
      : null

  const currentStage =
    currentStageKey
      ? stages.find(
          stage =>
            normalizeKey(
              stage.name,
            ) ===
              currentStageKey ||
            (
              stage.stage_key !==
                null &&
              normalizeKey(
                stage.stage_key,
              ) ===
                currentStageKey
            ),
        ) ?? null
      : null

  const declaredAdherence =
    output
      .method
      .adherence

  const canMapAssessment =
    currentStage !== null &&
    methodEvidence.length > 0 &&
    ![
      'not_configured',
      'insufficient_evidence',
    ].includes(
      declaredAdherence,
    )

  if (!canMapAssessment) {
    return {
      value: {
        stages: [],

        adherence: {
          status:
            'insufficient_evidence',

          summary:
            'Não há evidência canônica suficiente para projetar a etapa atual do método.',

          deviation_stage_order:
            null,

          what_happened:
            null,

          missing_information:
            [],

          why_it_matters:
            null,

          evidence_message_ids:
            [],

          memory_ids:
            [],
        },

        recovery_guidance:
          null,
      },

      mode:
        'insufficient_evidence',
    }
  }

  const stageStatus =
    declaredAdherence ===
      'on_method'
      ? 'active'
      : 'partial'

  const adherenceSummary =
    declaredAdherence ===
      'on_method'
      ? 'A condução está alinhada ao método comercial configurado.'
      : declaredAdherence ===
          'partially_on_method'
        ? 'A condução está parcialmente alinhada ao método comercial configurado.'
        : output
              .method
              .deviation ??
          'A condução atual apresenta desvio do método comercial configurado.'

  const recoveryGuidance =
    declaredAdherence ===
      'off_method' &&
    output
      .method
      .recovery_move
      ? {
          objective:
            output
              .decision
              .objective,

          missing_information:
            [],

          recommended_move:
            output
              .method
              .recovery_move,

          optional_question:
            output
              .communication
              .recommended_question,

          evidence_message_ids:
            methodEvidence,

          memory_ids:
            [],
        }
      : null

  return {
    value: {
      stages: [
        {
          step_order:
            currentStage
              .step_order,

          status:
            stageStatus,

          explanation:
            'Etapa atual identificada pelo Commercial Reasoning Core V2 a partir da conversa.',

          evidence_message_ids:
            methodEvidence,

          memory_ids:
            [],
        },
      ],

      adherence: {
        status:
          declaredAdherence,

        summary:
          adherenceSummary,

        deviation_stage_order:
          declaredAdherence ===
            'off_method'
            ? currentStage
                .step_order
            : null,

        what_happened:
          declaredAdherence ===
            'off_method'
            ? output
                .method
                .deviation
            : null,

        missing_information:
          [],

        why_it_matters:
          null,

        evidence_message_ids:
          methodEvidence,

        memory_ids:
          [],
      },

      recovery_guidance:
        recoveryGuidance,
    },

    mode:
      'mapped',
  }
}

function channelForProjection({
  decision,
  interventionNeeded,
}: {
  decision:
    CommercialReading[
      'best_approach'
    ]['decision']

  interventionNeeded:
    boolean
}): CommercialReadingChannel {
  if (
    decision ===
    'wait'
  ) {
    return 'wait'
  }

  if (
    decision ===
      'no_intervention' ||
    decision ===
      'give_space' ||
    !interventionNeeded
  ) {
    return 'none'
  }

  return 'text'
}

export function buildCommercialReasoningCoreV2CommercialReading({
  input,
  output,
  memory_reduction = null,
}: {
  input:
    StatefulCopilotInput

  output:
    CommercialReasoningCoreV2Output

  memory_reduction?:
    CommercialReasoningCoreV2MemoryReductionResult | null
}): CommercialReasoningCoreV2CommercialReadingAdapterResult {
  if (memory_reduction) {
    validateMemoryReductionForInput({
      input,

      memoryReduction:
        memory_reduction,
    })
  }

  const customerState =
    memory_reduction
      ?.state ??
    input
      .state_context
      .previous_state

  const writesNewCustomerMemory =
    memory_reduction
      ? memoryReductionHasChanges(
          memory_reduction,
        )
      : false

  const projection =
    buildCommercialReasoningCoreV2SellerProjection(
      output,
    )

  const sellerActionable =
    isCommercialReasoningCoreV2SellerActionable(
      output,
    )

  const filterEvidence =
    buildKnownEvidenceFilter(
      input,
    )

  const sellerMessageIds =
    new Set(
      input
        .diagnostic_input
        .conversation
        .messages
        .filter(
          message =>
            message.direction ===
            'outgoing',
        )
        .map(
          message =>
            message.id,
        ),
    )

  const currentStateEvidence =
    filterEvidence([
      ...output
        .situation
        .evidence_message_ids,

      ...output
        .evidence_message_ids,
    ])

  if (
    currentStateEvidence
      .length === 0
  ) {
    fail({
      code:
        'MISSING_CURRENT_STATE_EVIDENCE',

      path:
        'output.situation.evidence_message_ids',

      message:
        'A Commercial Reading precisa de evidência canônica para representar o momento atual.',
    })
  }

  const bestApproachEvidence =
    filterEvidence([
      ...projection
        .evidence_message_ids,

      ...output
        .responsibility
        .evidence_message_ids,

      ...currentStateEvidence,
    ])

  const importantEvents =
    output
      .factuality
      .facts_used
      .map(
        fact => ({
          summary:
            fact.summary,

          evidence_message_ids:
            filterEvidence(
              fact
                .evidence_message_ids,
            ),

          memory_ids:
            [],
        }),
      )
      .filter(
        item =>
          item
            .evidence_message_ids
            .length > 0,
      )

  let droppedSellerStrengths =
    0

  const sellerStrengths =
    output
      .coaching
      .strengths
      .map(
        strength => {
          const evidence =
            filterEvidence(
              strength
                .evidence_message_ids,
            )

          const hasSellerEvidence =
            evidence.some(
              id =>
                sellerMessageIds.has(
                  id,
                ),
            )

          if (!hasSellerEvidence) {
            droppedSellerStrengths +=
              1

            return null
          }

          return {
            kind:
              mapSellerStrengthKind(
                strength.kind,
              ),

            summary:
              strength.summary,

            why_it_matters:
              strength
                .why_it_matters,

            evidence_message_ids:
              evidence,

            memory_ids:
              [],
          }
        },
      )
      .filter(
        item =>
          item !== null,
      )

  let droppedImprovementPoints =
    0

  const improvementPoints =
    output
      .coaching
      .improvement_points
      .map(
        point => {
          const evidence =
            filterEvidence(
              point
                .evidence_message_ids,
            )

          if (
            evidence.length ===
            0
          ) {
            droppedImprovementPoints +=
              1

            return null
          }

          return {
            kind:
              mapImprovementKind(
                point.kind,
              ),

            summary:
              point.summary,

            why_it_matters:
              point
                .why_it_matters,

            impact:
              point.impact,

            how_to_improve:
              point
                .how_to_improve,

            evidence_message_ids:
              evidence,

            memory_ids:
              [],
          }
        },
      )
      .filter(
        item =>
          item !== null,
      )

  const methodProjection =
    buildMethodProjection({
      input,
      output,
      sellerActionable,
      filterEvidence,
    })

  const analysis =
    buildAnalysisState(
      output,
    )

  const customer =
    buildCustomer({
      input,

      state:
        customerState,
    })

  const availableMemoryIds =
    collectMemoryIds(
      customerState,
    )

  const modelOutput = {
    conversation_summary: {
      initial_context:
        null,

      evolution:
        null,

      important_events:
        importantEvents,

      current_state: {
        summary:
          output
            .situation
            .summary,

        evidence_message_ids:
          currentStateEvidence,

        memory_ids:
          [],
      },

      last_customer_request_or_decision:
        output
          .commercial_role ===
          'buyer' &&
        output
          .situation
          .customer_intent
          ? {
              summary:
                output
                  .situation
                  .customer_intent,

              evidence_message_ids:
                currentStateEvidence,

              memory_ids:
                [],
            }
          : null,
    },

    commercial_evolution:
      [],

    method:
      methodProjection.value,

    seller_strengths:
      sellerStrengths,

    improvement_points:
      improvementPoints,

    risks: {
      customer_objections:
        [],

      service_risks:
        [],
    },

    best_approach: {
      decision:
        projection.decision,

      reason:
        projection.reason,

      channel:
        channelForProjection({
          decision:
            projection.decision,

          interventionNeeded:
            projection
              .intervention_needed,
        }),

      evidence_message_ids:
        bestApproachEvidence,

      memory_ids:
        [],
    },
  }

  const reading =
    normalizeCommercialReadingModelOutput({
      value:
        modelOutput,

      context: {
        available_message_ids:
          [
            ...input
              .diagnostic_input
              .conversation
              .active_message_ids,
          ],

        seller_message_ids:
          [
            ...sellerMessageIds,
          ],

        available_memory_ids:
          availableMemoryIds,

        current_crm_status:
          input
            .diagnostic_input
            .current_crm_status,

        reference_time:
          input
            .diagnostic_input
            .reference_time,
      },

      derived: {
        analysis_status:
          analysis.status,

        analysis_limitations:
          analysis.limitations,

        commercial_role:
          output
            .commercial_role,

        commercial_relevance:
          output
            .commercial_relevance,

        customer,

        communication: {
          intervention_needed:
            projection
              .intervention_needed,

          recommended_question:
            projection
              .recommended_question,

          recommended_message:
            projection
              .suggested_message,
        },

        operations: {
          crm: {
            should_change_crm_stage:
              false,

            recommended_status:
              null,

            rationale:
              null,

            requires_human_confirmation:
              true,
          },

          agenda: {
            should_change_agenda:
              false,

            expected_next_action_at:
              null,

            rationale:
              null,

            requires_human_confirmation:
              true,
          },
        },

        sales_method:
          input
            .diagnostic_input
            .commercial_context
            .sales_method,
      },
    })

  return {
    reading,

    report: {
      adapter_version:
        COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_READING_ADAPTER_VERSION,

      customer_memory_mode:
        memory_reduction
          ? 'reduced_state_applied'
          : input
              .state_context
              .previous_state
            ? 'previous_state_preserved'
            : 'empty_initial_state',

      writes_new_customer_memory:
        writesNewCustomerMemory,

      method_projection:
        methodProjection.mode,

      dropped_seller_strengths:
        droppedSellerStrengths,

      dropped_improvement_points:
        droppedImprovementPoints,
    },
  }
}
