import {
  isCommerciallyActionable,
} from './commercial-relevance'

import {
  createEmptyCommercialReasoningCoreV2MemoryDelta,
  type CommercialReasoningCoreV2MemoryDelta,
  type CommercialReasoningCoreV2Output,
} from './commercial-reasoning-core-v2-contract'

import type {
  StatefulCopilotInput,
} from './stateful-copilot-input'

import type {
  StatefulCopilotStatePatch,
} from './stateful-copilot-contract'

import {
  buildStatefulCopilotNormalizationContext,
} from './stateful-copilot-execution-plan'

import {
  validateClientStatePatch,
  type StatefulCopilotNormalizationContext,
} from './stateful-copilot-normalizer'

import {
  reduceStatefulCommercialState,
  type StatefulCommercialMemoryIdFactory,
  type StatefulCommercialStateReductionOutput,
} from './stateful-commercial-state-reducer'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

export const COMMERCIAL_REASONING_CORE_V2_MEMORY_REDUCER_VERSION =
  'commercial-reasoning-core-v2-memory-reducer-v1' as const

export type CommercialReasoningCoreV2MemoryReductionResult = {
  reducer_version:
    typeof COMMERCIAL_REASONING_CORE_V2_MEMORY_REDUCER_VERSION

  state:
    StatefulCommercialState

  normalization_context:
    StatefulCopilotNormalizationContext

  applied_patch:
    StatefulCopilotStatePatch

  preserved_previous_commercial_state:
    boolean
}

export class CommercialReasoningCoreV2MemoryReductionError
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
    super(
      message,
    )

    this.name =
      'CommercialReasoningCoreV2MemoryReductionError'

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
  throw new CommercialReasoningCoreV2MemoryReductionError({
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

function memoryDeltaHasChanges(
  delta:
    CommercialReasoningCoreV2MemoryDelta,
): boolean {
  return Object
    .values(
      delta,
    )
    .some(
      value =>
        Array.isArray(
          value,
        ) &&
        value.length > 0,
    )
}

function collectPatchEvidence(
  patch:
    StatefulCopilotStatePatch,
): string[] {
  return uniqueStrings([
    ...patch
      .facts_to_add
      .flatMap(
        item =>
          item
            .evidence_message_ids,
      ),

    ...patch
      .needs_to_add
      .flatMap(
        item =>
          item
            .evidence_message_ids,
      ),

    ...patch
      .open_loops_to_add
      .flatMap(
        item =>
          item
            .evidence_message_ids,
      ),

    ...patch
      .objections_to_add
      .flatMap(
        item =>
          item
            .evidence_message_ids,
      ),

    ...patch
      .commitments_to_upsert
      .flatMap(
        item =>
          item
            .evidence_message_ids,
      ),

    ...patch
      .signals_to_add
      .flatMap(
        item =>
          item
            .evidence_message_ids,
      ),

    ...patch
      .uncertainties_to_add
      .flatMap(
        item =>
          item
            .evidence_message_ids,
      ),
  ])
}

function validatePatchEvidence({
  patch,
  context,
}: {
  patch:
    StatefulCopilotStatePatch

  context:
    StatefulCopilotNormalizationContext
}): void {
  const availableMessageIds =
    new Set(
      context
        .available_message_ids,
    )

  const pendingAudioIds =
    new Set(
      context
        .pending_audio_message_ids,
    )

  const groups = [
    ...patch
      .facts_to_add
      .map(
        (item, index) => ({
          path:
            `memory_delta.facts_to_add[${index}]`,
          evidence:
            item.evidence_message_ids,
        }),
      ),

    ...patch
      .needs_to_add
      .map(
        (item, index) => ({
          path:
            `memory_delta.needs_to_add[${index}]`,
          evidence:
            item.evidence_message_ids,
        }),
      ),

    ...patch
      .open_loops_to_add
      .map(
        (item, index) => ({
          path:
            `memory_delta.open_loops_to_add[${index}]`,
          evidence:
            item.evidence_message_ids,
        }),
      ),

    ...patch
      .objections_to_add
      .map(
        (item, index) => ({
          path:
            `memory_delta.objections_to_add[${index}]`,
          evidence:
            item.evidence_message_ids,
        }),
      ),

    ...patch
      .commitments_to_upsert
      .map(
        (item, index) => ({
          path:
            `memory_delta.commitments_to_upsert[${index}]`,
          evidence:
            item.evidence_message_ids,
        }),
      ),

    ...patch
      .signals_to_add
      .map(
        (item, index) => ({
          path:
            `memory_delta.signals_to_add[${index}]`,
          evidence:
            item.evidence_message_ids,
        }),
      ),

    ...patch
      .uncertainties_to_add
      .map(
        (item, index) => ({
          path:
            `memory_delta.uncertainties_to_add[${index}]`,
          evidence:
            item.evidence_message_ids,
        }),
      ),
  ]

  for (const group of groups) {
    if (
      group
        .evidence
        .length === 0
    ) {
      fail({
        code:
          'MEMORY_EVIDENCE_REQUIRED',

        path:
          `${group.path}.evidence_message_ids`,

        message:
          'Toda nova memória precisa possuir evidência da fotografia atual.',
      })
    }

    for (
      const evidenceId of
      group.evidence
    ) {
      if (
        !availableMessageIds.has(
          evidenceId,
        )
      ) {
        fail({
          code:
            'MEMORY_EVIDENCE_NOT_CURRENT',

          path:
            `${group.path}.evidence_message_ids`,

          message:
            `A evidência ${evidenceId} não pertence às mensagens atuais desta redução.`,
        })
      }

      if (
        pendingAudioIds.has(
          evidenceId,
        )
      ) {
        fail({
          code:
            'AUDIO_EVIDENCE_NOT_TRANSCRIBED',

          path:
            `${group.path}.evidence_message_ids`,

          message:
            `A mensagem ${evidenceId} é áudio sem transcrição e não pode criar memória comercial.`,
        })
      }
    }
  }
}

function validatePatchMemoryReferences({
  patch,
  context,
}: {
  patch:
    StatefulCopilotStatePatch

  context:
    StatefulCopilotNormalizationContext
}): void {
  const activeMemoryIds =
    new Set(
      context
        .active_memory_ids,
    )

  const references = [
    ...patch
      .fact_ids_to_supersede
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.fact_ids_to_supersede[${index}]`,
        }),
      ),

    ...patch
      .need_ids_to_resolve
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.need_ids_to_resolve[${index}]`,
        }),
      ),

    ...patch
      .need_ids_to_supersede
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.need_ids_to_supersede[${index}]`,
        }),
      ),

    ...patch
      .open_loop_ids_to_resolve
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.open_loop_ids_to_resolve[${index}]`,
        }),
      ),

    ...patch
      .open_loop_ids_to_supersede
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.open_loop_ids_to_supersede[${index}]`,
        }),
      ),

    ...patch
      .objection_ids_to_resolve
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.objection_ids_to_resolve[${index}]`,
        }),
      ),

    ...patch
      .objection_ids_to_supersede
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.objection_ids_to_supersede[${index}]`,
        }),
      ),

    ...patch
      .signal_ids_to_resolve
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.signal_ids_to_resolve[${index}]`,
        }),
      ),

    ...patch
      .uncertainty_ids_to_resolve
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.uncertainty_ids_to_resolve[${index}]`,
        }),
      ),

    ...patch
      .uncertainty_ids_to_supersede
      .map(
        (id, index) => ({
          id,
          path:
            `memory_delta.uncertainty_ids_to_supersede[${index}]`,
        }),
      ),

    ...patch
      .commitments_to_upsert
      .flatMap(
        (item, index) =>
          item.commitment_id
            ? [
                {
                  id:
                    item
                      .commitment_id,

                  path:
                    `memory_delta.commitments_to_upsert[${index}].commitment_id`,
                },
              ]
            : [],
      ),
  ]

  for (const reference of references) {
    if (
      !activeMemoryIds.has(
        reference.id,
      )
    ) {
      fail({
        code:
          'INACTIVE_MEMORY_REFERENCE',

        path:
          reference.path,

        message:
          `A memória ${reference.id} não existe como item ativo no estado anterior.`,
      })
    }
  }
}

function selectCurrentUsableEvidence({
  ids,
  context,
}: {
  ids: string[]

  context:
    StatefulCopilotNormalizationContext
}): string[] {
  const availableIds =
    new Set(
      context
        .available_message_ids,
    )

  const pendingAudioIds =
    new Set(
      context
        .pending_audio_message_ids,
    )

  return uniqueStrings(
    ids.filter(
      id =>
        availableIds.has(
          id,
        ) &&
        !pendingAudioIds.has(
          id,
        ),
    ),
  )
}

function requireCurrentEvidence({
  ids,
  context,
  path,
}: {
  ids: string[]

  context:
    StatefulCopilotNormalizationContext

  path: string
}): string[] {
  const currentEvidence =
    selectCurrentUsableEvidence({
      ids,
      context,
    })

  if (
    currentEvidence.length ===
    0
  ) {
    fail({
      code:
        'CURRENT_MESSAGE_EVIDENCE_REQUIRED',

      path,

      message:
        `${path} precisa possuir ao menos uma evidência atual e utilizável.`,
    })
  }

  return currentEvidence
}

function buildPreservedProjection({
  previousState,
  previousStateVersion,
  currentAnalyzedMessageIds,
}: {
  previousState:
    StatefulCommercialState

  previousStateVersion:
    number

  currentAnalyzedMessageIds:
    string[]
}): StatefulCommercialStateReductionOutput {
  const emptyPatch:
    StatefulCopilotStatePatch =
      createEmptyCommercialReasoningCoreV2MemoryDelta()

  return {
    previous_state_version:
      previousStateVersion,

    commercial_role:
      previousState
        .commercial_role,

    analyzed_message_ids:
      uniqueStrings([
        ...previousState
          .last_evidence_message_ids,

        ...currentAnalyzedMessageIds,
      ]),

    evidence_message_ids: [
      ...previousState
        .last_evidence_message_ids,
    ],

    state_patch:
      emptyPatch,

    interpretation: {
      current_moment: {
        summary:
          previousState
            .current_moment
            .summary,

        evidence_message_ids: [
          ...previousState
            .current_moment
            .evidence_message_ids,
        ],

        memory_ids:
          [],
      },
    },

    strategy: {
      next_move:
        previousState
          .current_priority
          .summary,

      evidence_message_ids: [
        ...previousState
          .current_priority
          .evidence_message_ids,
      ],
    },
  }
}

export function reduceCommercialReasoningCoreV2Memory({
  input,
  output,
  applied_at,
  create_memory_id,
}: {
  input:
    StatefulCopilotInput

  output:
    CommercialReasoningCoreV2Output

  applied_at:
    string

  create_memory_id:
    StatefulCommercialMemoryIdFactory
}): CommercialReasoningCoreV2MemoryReductionResult {
  const normalizationContext =
    buildStatefulCopilotNormalizationContext(
      input,
    )

  if (
    normalizationContext
      .available_message_ids
      .length === 0
  ) {
    fail({
      code:
        'MEMORY_REDUCTION_WITHOUT_MESSAGES',

      path:
        'normalization_context.available_message_ids',

      message:
        'Uma redução de memória precisa possuir mensagens atuais.',
    })
  }

  const commerciallyActionable =
    output.commercial_role ===
      'buyer' &&
    isCommerciallyActionable(
      output
        .commercial_relevance,
    )

  if (
    !commerciallyActionable &&
    memoryDeltaHasChanges(
      output
        .memory_delta,
    )
  ) {
    fail({
      code:
        'NON_ACTIONABLE_MEMORY_DELTA',

      path:
        'output.memory_delta',

      message:
        'Sessão não acionável não pode alterar memória comercial do cliente.',
    })
  }

  const statePatch:
    StatefulCopilotStatePatch =
      output.memory_delta

  validatePatchEvidence({
    patch:
      statePatch,

    context:
      normalizationContext,
  })

  validatePatchMemoryReferences({
    patch:
      statePatch,

    context:
      normalizationContext,
  })

  validateClientStatePatch(
    statePatch,
    normalizationContext,
  )

  const previousState =
    input
      .state_context
      .previous_state

  const previousStateVersion =
    input
      .state_context
      .previous_state_version

  if (
    !commerciallyActionable &&
    previousState !== null
  ) {
    if (
      previousStateVersion ===
      null
    ) {
      fail({
        code:
          'PREVIOUS_STATE_VERSION_REQUIRED',

        path:
          'input.state_context.previous_state_version',

        message:
          'Estado anterior exige versão anterior declarada.',
      })
    }

    const projection =
      buildPreservedProjection({
        previousState,

        previousStateVersion,

        currentAnalyzedMessageIds:
          normalizationContext
            .available_message_ids,
      })

    return {
      reducer_version:
        COMMERCIAL_REASONING_CORE_V2_MEMORY_REDUCER_VERSION,

      state:
        reduceStatefulCommercialState({
          previous_state:
            previousState,

          output:
            projection,

          cycle_id:
            input
              .diagnostic_input
              .cycle_id,

          applied_at,

          create_memory_id,
        }),

      normalization_context:
        normalizationContext,

      applied_patch:
        projection
          .state_patch,

      preserved_previous_commercial_state:
        true,
    }
  }

  const currentMomentEvidence =
    requireCurrentEvidence({
      ids:
        output
          .situation
          .evidence_message_ids,

      context:
        normalizationContext,

      path:
        'output.situation.evidence_message_ids',
    })

  const currentPriorityEvidence =
    requireCurrentEvidence({
      ids: [
        ...output
          .decision
          .evidence_message_ids,

        ...output
          .responsibility
          .evidence_message_ids,
      ],

      context:
        normalizationContext,

      path:
        'output.decision.evidence_message_ids',
    })

  const globalEvidence =
    requireCurrentEvidence({
      ids: [
        ...output
          .evidence_message_ids,

        ...currentMomentEvidence,

        ...currentPriorityEvidence,

        ...collectPatchEvidence(
          statePatch,
        ),
      ],

      context:
        normalizationContext,

      path:
        'output.evidence_message_ids',
    })

  const projection:
    StatefulCommercialStateReductionOutput = {
    previous_state_version:
      previousStateVersion,

    commercial_role:
      output
        .commercial_role,

    analyzed_message_ids: [
      ...normalizationContext
        .available_message_ids,
    ],

    evidence_message_ids:
      globalEvidence,

    state_patch:
      statePatch,

    interpretation: {
      current_moment: {
        summary:
          output
            .situation
            .summary,

        evidence_message_ids:
          currentMomentEvidence,

        memory_ids:
          [],
      },
    },

    strategy: {
      next_move:
        output
          .decision
          .objective,

      evidence_message_ids:
        currentPriorityEvidence,
    },
  }

  return {
    reducer_version:
      COMMERCIAL_REASONING_CORE_V2_MEMORY_REDUCER_VERSION,

    state:
      reduceStatefulCommercialState({
        previous_state:
          previousState,

        output:
          projection,

        cycle_id:
          input
            .diagnostic_input
            .cycle_id,

        applied_at,

        create_memory_id,
      }),

    normalization_context:
      normalizationContext,

    applied_patch:
      statePatch,

    preserved_previous_commercial_state:
      false,
  }
}
