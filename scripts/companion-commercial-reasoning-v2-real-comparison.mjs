import { createClient } from '@supabase/supabase-js'

import {
  createStatefulCopilotOpenAIProvider,
  STATEFUL_COPILOT_OPENAI_REASONING_EFFORTS,
} from '../app/lib/companion/stateful-copilot-openai-provider.ts'

import {
  createDeterministicStatefulCommercialMemoryId,
} from '../app/lib/companion/stateful-copilot-composition.ts'

import {
  runCommercialReasoningCoreV2Comparison,
} from '../app/lib/companion/commercial-reasoning-core-v2-comparison-harness.ts'

import {
  runCommercialReasoningCoreV2,
} from '../app/lib/companion/commercial-reasoning-core-v2.ts'

import {
  buildStatefulCopilotInput,
} from '../app/lib/companion/stateful-copilot-input.ts'

import {
  createStatefulCopilotServerRealContextLoader,
} from '../app/lib/server/stateful-copilot-real-context-loader.ts'

const LEGACY_DIAGNOSTIC_MODEL =
  'gpt-4.1-mini-2025-04-14'

const LEGACY_COMMUNICATION_MODEL =
  'gpt-5.6'

const DEFAULT_CORE_V2_MODEL =
  'gpt-5.6'

const DEFAULT_CORE_V2_REASONING_EFFORT =
  'medium'

function parseArgs(argv) {
  const get = (flag) => {
    const index = argv.indexOf(flag)
    return index >= 0
      ? argv[index + 1]
      : null
  }

  return {
    cycleId:
      get('--cycle-id'),
    conversationKey:
      get('--conversation-key'),
    v2Only:
      argv.includes(
        '--v2-only',
      ),
  }
}

function requireEnvironment() {
  const required = [
    'OPENAI_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]

  const missing =
    required.filter(
      (key) =>
        typeof process.env[key] !== 'string' ||
        process.env[key].trim() === '',
    )

  if (missing.length > 0) {
    throw new Error(
      `Variáveis ausentes: ${missing.join(', ')}. Rode com --env-file=.env.local.`,
    )
  }
}

function resolveCoreV2Model() {
  const configured =
    process.env
      .OPENAI_COMMERCIAL_REASONING_CORE_V2_MODEL
      ?.trim()

  return configured ||
    DEFAULT_CORE_V2_MODEL
}

function resolveCoreV2ReasoningEffort() {
  const configured =
    process.env
      .OPENAI_COMMERCIAL_REASONING_CORE_V2_REASONING_EFFORT
      ?.trim()

  const value =
    configured ||
    DEFAULT_CORE_V2_REASONING_EFFORT

  if (
    !STATEFUL_COPILOT_OPENAI_REASONING_EFFORTS
      .includes(value)
  ) {
    throw new Error(
      `OPENAI_COMMERCIAL_REASONING_CORE_V2_REASONING_EFFORT inválido: ${value}.`,
    )
  }

  return value
}

function createReadClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

async function resolveConversationScope(
  client,
  cycleId,
) {
  const { data, error } =
    await client
      .from('conversation_messages')
      .select(
        'company_id, conversation_key, message_key, version, occurred_at, observed_at, is_deleted',
      )
      .eq(
        'cycle_id',
        cycleId,
      )
      .limit(1000)

  if (error) {
    throw new Error(
      `Falha ao consultar conversation_messages: ${error.message}`,
    )
  }

  if (!data || data.length === 0) {
    throw new Error(
      `Nenhuma mensagem encontrada para cycle_id ${cycleId}.`,
    )
  }

  const companyIds =
    new Set(
      data.map(
        (row) => row.company_id,
      ),
    )

  const conversationKeys =
    new Set(
      data.map(
        (row) => row.conversation_key,
      ),
    )

  if (companyIds.size !== 1) {
    throw new Error(
      `cycle_id ${cycleId} não possui uma company_id única.`,
    )
  }

  return {
    companyId:
      [...companyIds][0],
    conversationKeys:
      [...conversationKeys],
    rows:
      data,
  }
}

function resolveReferenceTime(
  rows,
  conversationKey,
) {
  const canonicalByMessageKey =
    new Map()

  for (const row of rows) {
    if (
      row.conversation_key !==
      conversationKey
    ) {
      continue
    }

    const key =
      typeof row.message_key === 'string'
        ? row.message_key.trim()
        : ''

    const version =
      Number(row.version)

    if (
      !key ||
      !Number.isSafeInteger(version) ||
      version <= 0
    ) {
      throw new Error(
        'Ledger inválido ao resolver reference_time do replay.',
      )
    }

    const current =
      canonicalByMessageKey.get(key)

    if (
      !current ||
      version > Number(current.version)
    ) {
      canonicalByMessageKey.set(
        key,
        row,
      )
      continue
    }

    if (
      version === Number(current.version)
    ) {
      const currentObservedAt =
        Date.parse(
          current.observed_at ?? '',
        )

      const candidateObservedAt =
        Date.parse(
          row.observed_at ?? '',
        )

      if (
        Number.isFinite(candidateObservedAt) &&
        (
          !Number.isFinite(currentObservedAt) ||
          candidateObservedAt > currentObservedAt
        )
      ) {
        canonicalByMessageKey.set(
          key,
          row,
        )
      }
    }
  }

  const activeRows =
    [...canonicalByMessageKey.values()]
      .filter(
        (row) =>
          row.is_deleted !== true,
      )

  if (activeRows.length === 0) {
    throw new Error(
      'Nenhuma mensagem canônica ativa encontrada para o replay.',
    )
  }

  let latestTimestamp =
    Number.NEGATIVE_INFINITY

  for (const row of activeRows) {
    const occurredTimestamp =
      Date.parse(
        row.occurred_at ?? '',
      )

    const observedTimestamp =
      Date.parse(
        row.observed_at ?? '',
      )

    if (
      !Number.isFinite(
        occurredTimestamp,
      ) ||
      !Number.isFinite(
        observedTimestamp,
      )
    ) {
      throw new Error(
        'Ledger retornou occurred_at ou observed_at inválido para o replay.',
      )
    }

    // O loader real usa observed_at <= reference_time.
    // Portanto, o replay precisa respeitar a fronteira causal em que
    // a mensagem já era conhecida pelo sistema, e não apenas o horário
    // em que ela ocorreu no WhatsApp.
    const activityTimestamp =
      Math.max(
        occurredTimestamp,
        observedTimestamp,
      )

    latestTimestamp =
      Math.max(
        latestTimestamp,
        activityTimestamp,
      )
  }

  return new Date(
    latestTimestamp,
  ).toISOString()
}

async function loadReplayCheckpoint(
  client,
  companyId,
  cycleId,
  conversationKey,
) {
  const {
    data: targetRows,
    error: targetError,
  } =
    await client
      .from(
        'companion_commercial_state_events',
      )
      .select(
        'candidate_state_version, previous_state_version, generated_at, persisted_at',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        cycleId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .order(
        'candidate_state_version',
        {
          ascending: false,
        },
      )
      .limit(1)

  if (targetError) {
    throw new Error(
      `Falha ao localizar checkpoint histórico: ${targetError.message}`,
    )
  }

  const target =
    targetRows?.[0] ?? null

  if (!target) {
    return null
  }

  const targetVersion =
    Number(
      target.candidate_state_version,
    )

  const previousVersion =
    Number(
      target.previous_state_version,
    )

  const generatedTimestamp =
    Date.parse(
      target.generated_at ?? '',
    )

  if (
    !Number.isSafeInteger(
      targetVersion,
    ) ||
    targetVersion <= 0 ||
    !Number.isFinite(
      generatedTimestamp,
    )
  ) {
    throw new Error(
      'Checkpoint histórico possui dados inválidos.',
    )
  }

  if (
    !Number.isSafeInteger(
      previousVersion,
    ) ||
    previousVersion <= 0
  ) {
    return {
      target_state_version:
        targetVersion,
      previous_state_version:
        null,
      generated_at:
        new Date(
          generatedTimestamp,
        ).toISOString(),
      previous_state:
        null,
      previous_persisted_at:
        null,
    }
  }

  const {
    data: previousRows,
    error: previousError,
  } =
    await client
      .from(
        'companion_commercial_state_events',
      )
      .select(
        'candidate_state_version, state_snapshot, generated_at, persisted_at',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        cycleId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .eq(
        'candidate_state_version',
        previousVersion,
      )
      .limit(1)

  if (previousError) {
    throw new Error(
      `Falha ao carregar estado predecessor: ${previousError.message}`,
    )
  }

  const previous =
    previousRows?.[0] ?? null

  if (
    !previous ||
    !previous.state_snapshot
  ) {
    throw new Error(
      `Estado predecessor v${previousVersion} não foi encontrado no histórico.`,
    )
  }

  const previousPersistedTimestamp =
    Date.parse(
      previous.persisted_at ?? '',
    )

  if (
    !Number.isFinite(
      previousPersistedTimestamp,
    )
  ) {
    throw new Error(
      'Checkpoint predecessor possui persisted_at inválido.',
    )
  }

  return {
    target_state_version:
      targetVersion,
    previous_state_version:
      previousVersion,
    generated_at:
      new Date(
        generatedTimestamp,
      ).toISOString(),
    previous_state:
      previous.state_snapshot,
    previous_persisted_at:
      new Date(
        previousPersistedTimestamp,
      ).toISOString(),
  }
}

function resolveConversationKey({
  explicitConversationKey,
  conversationKeys,
}) {
  if (explicitConversationKey) {
    if (
      !conversationKeys.includes(
        explicitConversationKey,
      )
    ) {
      throw new Error(
        'A conversation_key informada não pertence ao cycle_id.',
      )
    }

    return explicitConversationKey
  }

  if (conversationKeys.length !== 1) {
    throw new Error(
      'O cycle_id possui mais de uma conversation_key. Informe --conversation-key explicitamente.',
    )
  }

  return conversationKeys[0]
}

function getPreviousState(
  stateRead,
) {
  return stateRead.mode === 'found'
    ? stateRead.state
    : null
}

function compactLegacyResult(
  legacy,
) {
  if (!legacy.result) {
    return {
      mode:
        legacy.mode,
      duration_ms:
        legacy.duration_ms,
      diagnostic_attempts:
        legacy.diagnostic_attempts,
      communication_attempts:
        legacy.communication_attempts,
      total_model_attempts:
        legacy.total_model_attempts,
      error:
        legacy.error,
    }
  }

  const result =
    legacy.result

  if (result.mode !== 'model') {
    return {
      mode:
        result.mode,
      duration_ms:
        legacy.duration_ms,
      limitations:
        result.limitations,
    }
  }

  return {
    mode:
      result.mode,
    duration_ms:
      legacy.duration_ms,
    diagnostic_model:
      result.execution.model,
    diagnostic_attempts:
      result.execution.attempts,
    communication_model:
      result.communication_execution.model,
    communication_attempts:
      result.communication_execution.attempts,
    diagnostic_output:
      result.output,
    communication_output:
      result.communication_output,
  }
}

function compactV2Result(
  result,
) {
  return {
    model:
      result.execution.model,
    attempts:
      result.execution.attempts,
    duration_ms:
      result.execution.duration_ms,
    usage:
      result.execution.usage,
    factual_guard:
      result.factual_guard,
    output:
      result.output,
  }
}

async function main() {
  requireEnvironment()

  const {
    cycleId,
    conversationKey:
      explicitConversationKey,
    v2Only,
  } = parseArgs(
    process.argv.slice(2),
  )

  if (!cycleId) {
    throw new Error(
      'Uso: --cycle-id <uuid> [--conversation-key <key>]',
    )
  }

  const client =
    createReadClient()

  const scope =
    await resolveConversationScope(
      client,
      cycleId,
    )

  const conversationKey =
    resolveConversationKey({
      explicitConversationKey,
      conversationKeys:
        scope.conversationKeys,
    })

  const ledgerReferenceTime =
    resolveReferenceTime(
      scope.rows,
      conversationKey,
    )

  const replayCheckpoint =
    await loadReplayCheckpoint(
      client,
      scope.companyId,
      cycleId,
      conversationKey,
    )

  const referenceTime =
    replayCheckpoint?.generated_at ??
    ledgerReferenceTime

  const contextLoader =
    createStatefulCopilotServerRealContextLoader(
      replayCheckpoint?.previous_state
        ? {
            loader_dependencies: {
              state_reader:
                async (request) => ({
                  mode:
                    'found',
                  found:
                    true,
                  company_id:
                    request.company_id,
                  cycle_id:
                    request.cycle_id,
                  conversation_key:
                    request.conversation_key,
                  state_record_id:
                    `replay-history-v${replayCheckpoint.previous_state_version}`,
                  state_version:
                    replayCheckpoint.previous_state_version,
                  state_updated_at:
                    replayCheckpoint
                      .previous_state
                      .updated_at,
                  persisted_at:
                    replayCheckpoint
                      .previous_persisted_at,
                  state:
                    replayCheckpoint
                      .previous_state,
                }),
            },
          }
        : {},
    )

  const context =
    await contextLoader({
      company_id:
        scope.companyId,
      cycle_id:
        cycleId,
      conversation_key:
        conversationKey,
      device_key:
        'commercial-reasoning-v2-real-comparison',
      reference_time:
        referenceTime,
    })

  const coreV2Model =
    resolveCoreV2Model()

  const coreV2ReasoningEffort =
    resolveCoreV2ReasoningEffort()

  const legacyProvider =
    createStatefulCopilotOpenAIProvider({
      model:
        LEGACY_DIAGNOSTIC_MODEL,
      communication_model:
        LEGACY_COMMUNICATION_MODEL,
    })

  const v2Provider =
    createStatefulCopilotOpenAIProvider({
      model:
        coreV2Model,
      diagnostic_reasoning_effort:
        coreV2ReasoningEffort,
    })

  console.log(
    '\n=== YOLEN — COMPARATIVO REAL COMMERCIAL REASONING CORE V2 ===',
  )

  console.log(
    JSON.stringify(
      {
        mode:
          v2Only
            ? 'read_only_v2_only'
            : 'read_only',
        reference_time:
          referenceTime,
        active_message_count:
          context.active_message_ids.length,
        known_message_count:
          context.known_message_ids.length,
        previous_state_version:
          context.state_read.mode === 'found'
            ? context.state_read.state_version
            : null,
        commercial_config_status:
          context.commercial_config_status,
        analysis_precondition:
          context.diagnostic_input
            .analysis_precondition,
        legacy_models: {
          diagnostic:
            LEGACY_DIAGNOSTIC_MODEL,
          communication:
            LEGACY_COMMUNICATION_MODEL,
        },
        core_v2: {
          model:
            coreV2Model,
          reasoning_effort:
            coreV2ReasoningEffort,
        },
      },
      null,
      2,
    ),
  )

  if (v2Only) {
    const v2Input =
      buildStatefulCopilotInput({
        diagnostic_input:
          context.diagnostic_input,
        previous_state:
          getPreviousState(
            context.state_read,
          ),
        known_message_ids:
          context.known_message_ids,
      })

    const v2Result =
      await runCommercialReasoningCoreV2({
        input:
          v2Input,
        provider:
          v2Provider,
      })

    console.log(
      '\n=== MÉTRICAS V2 ONLY ===',
    )

    console.log(
      JSON.stringify(
        {
          v2_duration_ms:
            v2Result
              .execution
              .duration_ms,
          v2_model_attempts:
            v2Result
              .execution
              .attempts,
          usage:
            v2Result
              .execution
              .usage,
          factual_guard_adjusted:
            v2Result
              .factual_guard
              .adjusted,
          factual_guard_adjustment_codes:
            v2Result
              .factual_guard
              .adjustment_codes,
        },
        null,
        2,
      ),
    )

    console.log(
      '\n=== CORE V2 ===',
    )

    console.log(
      JSON.stringify(
        compactV2Result(
          v2Result,
        ),
        null,
        2,
      ),
    )

    return
  }

  const comparison =
    await runCommercialReasoningCoreV2Comparison({
      diagnostic_input:
        context.diagnostic_input,
      previous_state:
        getPreviousState(
          context.state_read,
        ),
      known_message_ids:
        context.known_message_ids,
      provider:
        legacyProvider,
      legacy_provider:
        legacyProvider,
      v2_provider:
        v2Provider,
      create_memory_id:
        createDeterministicStatefulCommercialMemoryId,
      durable_memory_seed:
        context.durable_memory_seed,
    })

  console.log(
    '\n=== MÉTRICAS ===',
  )

  console.log(
    JSON.stringify(
      {
        legacy_duration_ms:
          comparison.legacy.duration_ms,
        v2_duration_ms:
          comparison.v2.duration_ms,
        duration_delta_ms:
          comparison.delta.duration_ms,
        legacy_total_model_attempts:
          comparison.legacy.total_model_attempts,
        v2_model_attempts:
          comparison.v2.attempts,
        model_attempt_delta:
          comparison.delta.model_attempts,
        factual_guard_adjusted:
          comparison.v2
            .factual_guard_adjusted,
        factual_guard_adjustment_codes:
          comparison.v2
            .factual_guard_adjustment_codes,
      },
      null,
      2,
    ),
  )

  console.log(
    '\n=== LEGADO ===',
  )

  console.log(
    JSON.stringify(
      compactLegacyResult(
        comparison.legacy,
      ),
      null,
      2,
    ),
  )

  console.log(
    '\n=== CORE V2 ===',
  )

  console.log(
    JSON.stringify(
      compactV2Result(
        comparison.v2.result,
      ),
      null,
      2,
    ),
  )
}

main().catch(
  (error) => {
    console.error(
      '\nCOMPARISON_FAILED',
      error,
    )

    process.exitCode = 1
  },
)
