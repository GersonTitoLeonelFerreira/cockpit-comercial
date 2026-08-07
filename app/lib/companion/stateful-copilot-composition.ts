import {
  createHash,
} from 'node:crypto'

import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  StatefulCommercialCollectionName,
} from './stateful-commercial-state'

import type {
  StatefulCommercialMemoryIdFactory,
  StatefulCommercialMemoryIdInput,
} from './stateful-commercial-state-reducer'

import {
  runStatefulCopilotIntegratedService,
  type StatefulCopilotIntegratedServiceDependencies,
  type StatefulCopilotIntegratedServiceResult,
} from './stateful-copilot-integrated-service'

import {
  createStatefulCopilotOpenAIProvider,
  type StatefulCopilotOpenAIProviderOptions,
} from './stateful-copilot-openai-provider'

import {
  createStatefulCopilotSupabaseReader,
  type StatefulCopilotStateReader,
  type StatefulCopilotSupabaseReadClient,
} from './stateful-copilot-supabase-reader'

import {
  createStatefulCopilotSupabaseWriter,
  type StatefulCopilotSupabaseRpcClient,
} from './stateful-copilot-supabase-writer'

import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import type {
  StatefulCopilotPersistenceWriter,
} from './stateful-copilot-persistence-executor'

const STATEFUL_COMMERCIAL_COLLECTIONS:
  StatefulCommercialCollectionName[] = [
    'facts',
    'needs',
    'open_loops',
    'objections',
    'commitments',
    'signals',
    'uncertainties',
  ]

export type StatefulCopilotSupabaseClient =
  StatefulCopilotSupabaseReadClient &
  StatefulCopilotSupabaseRpcClient

export type StatefulCopilotCompositionRunArgs = {
  diagnostic_input:
    CompanionDiagnosticInput

  known_message_ids:
    unknown

  generated_at:
    unknown

  dependencies?:
    StatefulCopilotIntegratedServiceDependencies
}

export type StatefulCopilotComposition = {
  reader:
    StatefulCopilotStateReader

  writer:
    StatefulCopilotPersistenceWriter

  provider:
    StatefulCopilotProvider

  create_memory_id:
    StatefulCommercialMemoryIdFactory

  run: (
    args:
      StatefulCopilotCompositionRunArgs,
  ) => Promise<StatefulCopilotIntegratedServiceResult>
}

type StatefulCopilotReaderFactory =
  typeof createStatefulCopilotSupabaseReader

type StatefulCopilotWriterFactory =
  typeof createStatefulCopilotSupabaseWriter

type StatefulCopilotProviderFactory =
  typeof createStatefulCopilotOpenAIProvider

type StatefulCopilotIntegratedServiceRunner =
  typeof runStatefulCopilotIntegratedService

export type StatefulCopilotCompositionFactoryDependencies = {
  create_reader?:
    StatefulCopilotReaderFactory

  create_writer?:
    StatefulCopilotWriterFactory

  create_provider?:
    StatefulCopilotProviderFactory

  run_service?:
    StatefulCopilotIntegratedServiceRunner
}

export type CreateStatefulCopilotCompositionArgs = {
  client:
    StatefulCopilotSupabaseClient

  openai_options?:
    StatefulCopilotOpenAIProviderOptions

  create_memory_id?:
    StatefulCommercialMemoryIdFactory

  dependencies?:
    StatefulCopilotCompositionFactoryDependencies
}

export class StatefulCopilotCompositionError
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
      'StatefulCopilotCompositionError'

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
  throw new StatefulCopilotCompositionError({
    code,
    path,
    message,
  })
}

function requireText(
  value: unknown,
  path: string,
  maximumLength = 500,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_MEMORY_ID_INPUT',

      path,

      message:
        `${path} precisa ser um texto.`,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized !== value ||
    normalized.length > maximumLength
  ) {
    fail({
      code:
        'INVALID_MEMORY_ID_INPUT',

      path,

      message:
        `${path} possui um valor inválido.`,
    })
  }

  return normalized
}

function requireCollection(
  value: unknown,
): StatefulCommercialCollectionName {
  if (
    typeof value !== 'string' ||
    !STATEFUL_COMMERCIAL_COLLECTIONS.includes(
      value as StatefulCommercialCollectionName,
    )
  ) {
    fail({
      code:
        'INVALID_MEMORY_ID_INPUT',

      path:
        'input.collection',

      message:
        'input.collection possui uma coleção inválida.',
    })
  }

  return value as StatefulCommercialCollectionName
}

function requirePositiveInteger(
  value: unknown,
  path: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    fail({
      code:
        'INVALID_MEMORY_ID_INPUT',

      path,

      message:
        `${path} precisa ser um inteiro positivo.`,
    })
  }

  return value
}

function requireNonNegativeInteger(
  value: unknown,
  path: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    fail({
      code:
        'INVALID_MEMORY_ID_INPUT',

      path,

      message:
        `${path} precisa ser um inteiro não negativo.`,
    })
  }

  return value
}

export function createDeterministicStatefulCommercialMemoryId(
  input:
    StatefulCommercialMemoryIdInput,
): string {
  const cycleId =
    requireText(
      input.cycle_id,
      'input.cycle_id',
    )

  const collection =
    requireCollection(
      input.collection,
    )

  const stateVersion =
    requirePositiveInteger(
      input.state_version,
      'input.state_version',
    )

  const itemIndex =
    requireNonNegativeInteger(
      input.item_index,
      'input.item_index',
    )

  const canonicalInput =
    JSON.stringify([
      'stateful-commercial-memory-v1',
      cycleId,
      collection,
      stateVersion,
      itemIndex,
    ])

  const digest =
    createHash(
      'sha256',
    )
      .update(
        canonicalInput,
        'utf8',
      )
      .digest(
        'hex',
      )

  return `stateful-memory-${digest}`
}

export function createStatefulCopilotComposition({
  client,
  openai_options = {},
  create_memory_id =
    createDeterministicStatefulCommercialMemoryId,
  dependencies = {},
}: CreateStatefulCopilotCompositionArgs): StatefulCopilotComposition {
  const createReader =
    dependencies.create_reader ??
    createStatefulCopilotSupabaseReader

  const createWriter =
    dependencies.create_writer ??
    createStatefulCopilotSupabaseWriter

  const createProvider =
    dependencies.create_provider ??
    createStatefulCopilotOpenAIProvider

  const runService =
    dependencies.run_service ??
    runStatefulCopilotIntegratedService

  const reader =
    createReader({
      client,
    })

  const writer =
    createWriter({
      client,
    })

  const provider =
    createProvider(
      openai_options,
    )

  return {
    reader,
    writer,
    provider,

    create_memory_id,

    async run(
      args,
    ) {
      return runService({
        diagnostic_input:
          args.diagnostic_input,

        known_message_ids:
          args.known_message_ids,

        generated_at:
          args.generated_at,

        reader,
        writer,
        provider,

        create_memory_id,

        dependencies:
          args.dependencies,
      })
    },
  }
}
