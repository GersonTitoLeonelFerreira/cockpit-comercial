import type {
  StatefulCopilotCommitmentPatch,
  StatefulCopilotObservedItem,
  StatefulCopilotOpenLoopCandidate,
  StatefulCopilotOutput,
  StatefulCopilotValueItem,
} from './stateful-copilot-contract'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
  isPositiveStateVersion,
  type StatefulCommercialCollectionName,
  type StatefulCommercialCommitment,
  type StatefulCommercialFact,
  type StatefulCommercialMemoryBase,
  type StatefulCommercialObservedItem,
  type StatefulCommercialOpenLoop,
  type StatefulCommercialState,
} from './stateful-commercial-state'

import {
  validateClientCommercialState,
} from './client-commercial-intelligence-contract'

export type StatefulCommercialMemoryIdInput = {
  cycle_id: string

  collection:
    StatefulCommercialCollectionName

  state_version: number

  item_index: number
}

export type StatefulCommercialMemoryIdFactory = (
  input: StatefulCommercialMemoryIdInput,
) => string

export type ReduceStatefulCommercialStateArgs = {
  previous_state:
    StatefulCommercialState | null

  output:
    StatefulCopilotOutput

  cycle_id:
    string

  applied_at:
    string

  create_memory_id:
    StatefulCommercialMemoryIdFactory
}

export class StatefulCommercialStateReductionError
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
      'StatefulCommercialStateReductionError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new StatefulCommercialStateReductionError(
    code,
    path,
    message,
  )
}

function requireText(
  value: unknown,
  path: string,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_TEXT',
      path,
      `${path} precisa ser um texto.`,
    )
  }

  const normalized =
    value.trim()

  if (!normalized) {
    fail(
      'INVALID_TEXT',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  return normalized
}

function requireDateTime(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireText(
      value,
      path,
    )

  if (
    !Number.isFinite(
      Date.parse(normalized),
    )
  ) {
    fail(
      'INVALID_DATETIME',
      path,
      `${path} precisa possuir uma data válida.`,
    )
  }

  return normalized
}

function uniqueStrings(
  values: string[],
): string[] {
  const result: string[] = []

  for (const value of values) {
    if (
      value &&
      !result.includes(value)
    ) {
      result.push(value)
    }
  }

  return result
}

function cloneMemoryItem<
  T extends StatefulCommercialMemoryBase,
>(
  item: T,
): T {
  return {
    ...item,

    evidence_message_ids: [
      ...item.evidence_message_ids,
    ],
  } as T
}

function collectMemoryIds(
  state: StatefulCommercialState | null,
): Set<string> {
  const ids =
    new Set<string>()

  if (!state) {
    return ids
  }

  const collections: Array<[
    StatefulCommercialCollectionName,
    StatefulCommercialMemoryBase[],
  ]> = [
    [
      'facts',
      state.facts,
    ],
    [
      'needs',
      state.needs,
    ],
    [
      'open_loops',
      state.open_loops,
    ],
    [
      'objections',
      state.objections,
    ],
    [
      'commitments',
      state.commitments,
    ],
    [
      'signals',
      state.signals,
    ],
    [
      'uncertainties',
      state.uncertainties,
    ],
  ]

  for (
    const [
      collection,
      items,
    ] of collections
  ) {
    for (const item of items) {
      if (ids.has(item.id)) {
        fail(
          'DUPLICATE_MEMORY_ID',
          `previous_state.${collection}`,
          `O identificador ${item.id} está duplicado no estado anterior.`,
        )
      }

      ids.add(item.id)
    }
  }

  return ids
}

function createMemoryId(
  args: {
    cycle_id: string
    collection:
      StatefulCommercialCollectionName
    state_version: number
    item_index: number
    create_memory_id:
      StatefulCommercialMemoryIdFactory
    used_ids: Set<string>
  },
): string {
  const id =
    requireText(
      args.create_memory_id({
        cycle_id:
          args.cycle_id,

        collection:
          args.collection,

        state_version:
          args.state_version,

        item_index:
          args.item_index,
      }),
      `create_memory_id.${args.collection}`,
    )

  if (args.used_ids.has(id)) {
    fail(
      'DUPLICATE_MEMORY_ID',
      `create_memory_id.${args.collection}`,
      `O identificador ${id} já existe no estado comercial.`,
    )
  }

  args.used_ids.add(id)

  return id
}

function closeMemoryItems<
  T extends StatefulCommercialMemoryBase,
>(
  items: T[],
  idsToClose: string[],
  targetStatus:
    | 'resolved'
    | 'superseded',
  collection:
    StatefulCommercialCollectionName,
  nextVersion: number,
): T[] {
  const targetIds =
    new Set(idsToClose)

  for (const id of targetIds) {
    const existing =
      items.find(
        (item) =>
          item.id === id,
      )

    if (!existing) {
      fail(
        'UNKNOWN_MEMORY_ID',
        `state_patch.${collection}`,
        `O item ${id} não existe em ${collection}.`,
      )
    }

    if (
      existing.memory_status !==
      'active'
    ) {
      fail(
        'MEMORY_ALREADY_CLOSED',
        `state_patch.${collection}`,
        `O item ${id} já está ${existing.memory_status}.`,
      )
    }
  }

  return items.map(
    (item) => {
      const cloned =
        cloneMemoryItem(item)

      if (!targetIds.has(item.id)) {
        return cloned
      }

      return {
        ...cloned,

        memory_status:
          targetStatus,

        updated_in_state_version:
          nextVersion,

        closed_in_state_version:
          nextVersion,
      }
    },
  )
}

function appendFacts(
  items: StatefulCommercialFact[],
  additions: StatefulCopilotValueItem[],
  args: {
    cycle_id: string
    next_version: number
    create_memory_id:
      StatefulCommercialMemoryIdFactory
    used_ids: Set<string>
  },
): StatefulCommercialFact[] {
  const result =
    items.map(
      cloneMemoryItem,
    )

  additions.forEach(
    (
      addition,
      index,
    ) => {
      result.push({
        id:
          createMemoryId({
            cycle_id:
              args.cycle_id,

            collection:
              'facts',

            state_version:
              args.next_version,

            item_index:
              index + 1,

            create_memory_id:
              args.create_memory_id,

            used_ids:
              args.used_ids,
          }),

        kind:
          addition.kind,

        value:
          addition.value,

        summary:
          addition.summary,

        confidence:
          addition.confidence,

        evidence_message_ids: [
          ...addition
            .evidence_message_ids,
        ],

        memory_status:
          'active',

        created_in_state_version:
          args.next_version,

        updated_in_state_version:
          args.next_version,

        closed_in_state_version:
          null,
      })
    },
  )

  return result
}

function appendObservedItems(
  items: StatefulCommercialObservedItem[],
  additions: StatefulCopilotObservedItem[],
  collection:
    | 'needs'
    | 'objections'
    | 'signals'
    | 'uncertainties',
  args: {
    cycle_id: string
    next_version: number
    create_memory_id:
      StatefulCommercialMemoryIdFactory
    used_ids: Set<string>
  },
): StatefulCommercialObservedItem[] {
  const result =
    items.map(
      cloneMemoryItem,
    )

  additions.forEach(
    (
      addition,
      index,
    ) => {
      result.push({
        id:
          createMemoryId({
            cycle_id:
              args.cycle_id,

            collection,

            state_version:
              args.next_version,

            item_index:
              index + 1,

            create_memory_id:
              args.create_memory_id,

            used_ids:
              args.used_ids,
          }),

        kind:
          addition.kind,

        summary:
          addition.summary,

        confidence:
          addition.confidence,

        evidence_message_ids: [
          ...addition
            .evidence_message_ids,
        ],

        memory_status:
          'active',

        created_in_state_version:
          args.next_version,

        updated_in_state_version:
          args.next_version,

        closed_in_state_version:
          null,
      })
    },
  )

  return result
}

function appendOpenLoops(
  items: StatefulCommercialOpenLoop[],
  additions:
    StatefulCopilotOpenLoopCandidate[],
  args: {
    cycle_id: string
    next_version: number
    create_memory_id:
      StatefulCommercialMemoryIdFactory
    used_ids: Set<string>
  },
): StatefulCommercialOpenLoop[] {
  const result =
    items.map(
      cloneMemoryItem,
    )

  additions.forEach(
    (
      addition,
      index,
    ) => {
      result.push({
        id:
          createMemoryId({
            cycle_id:
              args.cycle_id,

            collection:
              'open_loops',

            state_version:
              args.next_version,

            item_index:
              index + 1,

            create_memory_id:
              args.create_memory_id,

            used_ids:
              args.used_ids,
          }),

        kind:
          addition.kind,

        summary:
          addition.summary,

        evidence_message_ids: [
          ...addition
            .evidence_message_ids,
        ],

        memory_status:
          'active',

        created_in_state_version:
          args.next_version,

        updated_in_state_version:
          args.next_version,

        closed_in_state_version:
          null,
      })
    },
  )

  return result
}

function isTerminalCommitmentStatus(
  value:
    StatefulCopilotCommitmentPatch[
      'status'
    ],
): boolean {
  return (
    value === 'cancelled' ||
    value === 'completed'
  )
}

function applyCommitmentPatches(
  items: StatefulCommercialCommitment[],
  patches:
    StatefulCopilotCommitmentPatch[],
  args: {
    cycle_id: string
    next_version: number
    create_memory_id:
      StatefulCommercialMemoryIdFactory
    used_ids: Set<string>
  },
): StatefulCommercialCommitment[] {
  const result =
    items.map(
      cloneMemoryItem,
    )

  const patchedIds =
    new Set<string>()

  patches.forEach(
    (
      patch,
      index,
    ) => {
      const isTerminal =
        isTerminalCommitmentStatus(
          patch.status,
        )

      if (patch.commitment_id === null) {
        result.push({
          id:
            createMemoryId({
              cycle_id:
                args.cycle_id,

              collection:
                'commitments',

              state_version:
                args.next_version,

              item_index:
                index + 1,

              create_memory_id:
                args.create_memory_id,

              used_ids:
                args.used_ids,
            }),

          kind:
            patch.kind,

          summary:
            patch.summary,

          commitment_status:
            patch.status,

          scheduled_at:
            patch.scheduled_at,

          proposed_at:
            patch.proposed_at,

          evidence_message_ids: [
            ...patch
              .evidence_message_ids,
          ],

          memory_status:
            isTerminal
              ? 'resolved'
              : 'active',

          created_in_state_version:
            args.next_version,

          updated_in_state_version:
            args.next_version,

          closed_in_state_version:
            isTerminal
              ? args.next_version
              : null,
        })

        return
      }

      if (
        patchedIds.has(
          patch.commitment_id,
        )
      ) {
        fail(
          'DUPLICATE_COMMITMENT_PATCH',
          'state_patch.commitments_to_upsert',
          `O compromisso ${patch.commitment_id} foi alterado mais de uma vez no mesmo patch.`,
        )
      }

      patchedIds.add(
        patch.commitment_id,
      )

      const existingIndex =
        result.findIndex(
          (item) =>
            item.id ===
            patch.commitment_id,
        )

      if (existingIndex < 0) {
        fail(
          'UNKNOWN_COMMITMENT_ID',
          'state_patch.commitments_to_upsert',
          `O compromisso ${patch.commitment_id} não existe no estado anterior.`,
        )
      }

      const existing =
        result[existingIndex]

      if (
        existing.memory_status !==
        'active'
      ) {
        fail(
          'COMMITMENT_ALREADY_CLOSED',
          'state_patch.commitments_to_upsert',
          `O compromisso ${patch.commitment_id} já está ${existing.memory_status}.`,
        )
      }

      if (
        existing.kind !==
        patch.kind
      ) {
        fail(
          'COMMITMENT_KIND_MISMATCH',
          'state_patch.commitments_to_upsert',
          `O compromisso ${patch.commitment_id} não pode mudar de tipo.`,
        )
      }

      result[existingIndex] = {
        ...existing,

        summary:
          patch.summary,

        commitment_status:
          patch.status,

        scheduled_at:
          patch.scheduled_at ??
          existing.scheduled_at,

        proposed_at:
          patch.proposed_at ??
          existing.proposed_at,

        evidence_message_ids:
          uniqueStrings([
            ...existing
              .evidence_message_ids,

            ...patch
              .evidence_message_ids,
          ]),

        memory_status:
          isTerminal
            ? 'resolved'
            : 'active',

        updated_in_state_version:
          args.next_version,

        closed_in_state_version:
          isTerminal
            ? args.next_version
            : null,
      }
    },
  )

  return result
}

function validatePreviousState(
  state: StatefulCommercialState,
  cycleId: string,
): void {
  if (
    state.contract_version !==
    STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION
  ) {
    fail(
      'STATE_CONTRACT_VERSION_MISMATCH',
      'previous_state.contract_version',
      'A versão do estado comercial anterior é incompatível.',
    )
  }

  if (state.cycle_id !== cycleId) {
    fail(
      'STATE_CYCLE_MISMATCH',
      'previous_state.cycle_id',
      'O estado comercial pertence a outro ciclo.',
    )
  }

  if (
    !isPositiveStateVersion(
      state.version,
    )
  ) {
    fail(
      'INVALID_STATE_VERSION',
      'previous_state.version',
      'A versão do estado comercial anterior é inválida.',
    )
  }

  const createdAt =
    requireDateTime(
      state.created_at,
      'previous_state.created_at',
    )

  const updatedAt =
    requireDateTime(
      state.updated_at,
      'previous_state.updated_at',
    )

  if (
    Date.parse(updatedAt) <
    Date.parse(createdAt)
  ) {
    fail(
      'INVALID_STATE_CHRONOLOGY',
      'previous_state.updated_at',
      'A atualização do estado não pode ser anterior à sua criação.',
    )
  }
}

export function reduceStatefulCommercialState(
  args: ReduceStatefulCommercialStateArgs,
): StatefulCommercialState {
  const cycleId =
    requireText(
      args.cycle_id,
      'cycle_id',
    )

  const appliedAt =
    requireDateTime(
      args.applied_at,
      'applied_at',
    )

  const previousState =
    args.previous_state

  if (previousState) {
    validatePreviousState(
      previousState,
      cycleId,
    )

    if (
      Date.parse(appliedAt) <
      Date.parse(previousState.updated_at)
    ) {
      fail(
        'APPLIED_AT_BEFORE_STATE',
        'applied_at',
        'A nova versão não pode ser aplicada antes da atualização do estado anterior.',
      )
    }

    if (
      args.output
        .previous_state_version !==
      previousState.version
    ) {
      fail(
        'STALE_STATE_VERSION',
        'output.previous_state_version',
        'O patch foi produzido para uma versão diferente do estado comercial.',
      )
    }
  } else if (
    args.output
      .previous_state_version !==
    null
  ) {
    fail(
      'INITIAL_STATE_VERSION_REQUIRED',
      'output.previous_state_version',
      'O primeiro estado comercial precisa partir de versão anterior nula.',
    )
  }

  const nextVersion =
    previousState
      ? previousState.version + 1
      : 1

  const usedIds =
    collectMemoryIds(
      previousState,
    )

  const commonAdditionArgs = {
    cycle_id:
      cycleId,

    next_version:
      nextVersion,

    create_memory_id:
      args.create_memory_id,

    used_ids:
      usedIds,
  }

  const facts =
    appendFacts(
      closeMemoryItems(
        previousState?.facts ?? [],
        args.output
          .state_patch
          .fact_ids_to_supersede,
        'superseded',
        'facts',
        nextVersion,
      ),
      args.output
        .state_patch
        .facts_to_add,
      commonAdditionArgs,
    )

  const needs =
    appendObservedItems(
      closeMemoryItems(
        closeMemoryItems(
          previousState?.needs ?? [],
          args.output
            .state_patch
            .need_ids_to_resolve,
          'resolved',
          'needs',
          nextVersion,
        ),
        args.output
          .state_patch
          .need_ids_to_supersede,
        'superseded',
        'needs',
        nextVersion,
      ),
      args.output
        .state_patch
        .needs_to_add,
      'needs',
      commonAdditionArgs,
    )

  const openLoops =
    appendOpenLoops(
      closeMemoryItems(
        closeMemoryItems(
          previousState?.open_loops ?? [],
          args.output
            .state_patch
            .open_loop_ids_to_resolve,
          'resolved',
          'open_loops',
          nextVersion,
        ),
        args.output
          .state_patch
          .open_loop_ids_to_supersede,
        'superseded',
        'open_loops',
        nextVersion,
      ),
      args.output
        .state_patch
        .open_loops_to_add,
      commonAdditionArgs,
    )

  const objections =
    appendObservedItems(
      closeMemoryItems(
        closeMemoryItems(
          previousState?.objections ?? [],
          args.output
            .state_patch
            .objection_ids_to_resolve,
          'resolved',
          'objections',
          nextVersion,
        ),
        args.output
          .state_patch
          .objection_ids_to_supersede,
        'superseded',
        'objections',
        nextVersion,
      ),
      args.output
        .state_patch
        .objections_to_add,
      'objections',
      commonAdditionArgs,
    )

  const commitments =
    applyCommitmentPatches(
      previousState?.commitments ?? [],
      args.output
        .state_patch
        .commitments_to_upsert,
      commonAdditionArgs,
    )

  const signals =
    appendObservedItems(
      closeMemoryItems(
        previousState?.signals ?? [],
        args.output
          .state_patch
          .signal_ids_to_resolve,
        'resolved',
        'signals',
        nextVersion,
      ),
      args.output
        .state_patch
        .signals_to_add,
      'signals',
      commonAdditionArgs,
    )

  const uncertainties =
    appendObservedItems(
      closeMemoryItems(
        closeMemoryItems(
          previousState?.uncertainties ?? [],
          args.output
            .state_patch
            .uncertainty_ids_to_resolve,
          'resolved',
          'uncertainties',
          nextVersion,
        ),
        args.output
          .state_patch
          .uncertainty_ids_to_supersede,
        'superseded',
        'uncertainties',
        nextVersion,
      ),
      args.output
        .state_patch
        .uncertainties_to_add,
      'uncertainties',
      commonAdditionArgs,
    )

  const nextState:
    StatefulCommercialState = {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      cycleId,

    version:
      nextVersion,

    commercial_role:
      args.output
        .commercial_role,

    current_moment: {
      summary:
        args.output
          .interpretation
          .current_moment
          .summary,

      evidence_message_ids: [
        ...args.output
          .interpretation
          .current_moment
          .evidence_message_ids,
      ],
    },

    current_priority: {
      summary:
        args.output
          .strategy
          .next_move,

      evidence_message_ids: [
        ...args.output
          .strategy
          .evidence_message_ids,
      ],
    },

    last_analyzed_message_ids: [
      ...args.output
        .analyzed_message_ids,
    ],

    last_evidence_message_ids: [
      ...args.output
        .evidence_message_ids,
    ],

    facts,
    needs,

    open_loops:
      openLoops,

    objections,
    commitments,
    signals,
    uncertainties,

    created_at:
      previousState
        ? previousState.created_at
        : appliedAt,

    updated_at:
      appliedAt,
  }

  const clientStateIssue =
    validateClientCommercialState(
      nextState,
    )[0]

  if (clientStateIssue) {
    fail(
      clientStateIssue.code,
      clientStateIssue.path,
      clientStateIssue.message,
    )
  }

  return nextState
}
