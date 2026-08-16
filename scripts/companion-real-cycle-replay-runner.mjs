// Reexecuta uma conversa real já capturada no ledger contra o motor stateful
// atual (diagnóstico + comunicação), de forma somente leitura.
//
// Usa o mesmo carregador de contexto real da produção
// (app/lib/server/stateful-copilot-real-context-loader.ts) para montar o
// diagnostic_input a partir do ledger e da configuração comercial reais —
// isso já resolve versões canônicas, exclusão e a janela temporal da sessão
// exatamente como a produção faz. Só o gravador de estado é substituído por
// uma versão falsa em memória: nenhuma escrita acontece em
// companion_commercial_states, CRM ou Agenda. A leitura (ledger, config
// comercial, estado comercial anterior) é sempre real, porque ler não
// escreve nada.
//
// Importante: este replay usa o ledger histórico real com o motor e a
// configuração comercial atuais. Ele não reconstrói uma fotografia histórica
// perfeita do CRM/configuração. O objetivo é reavaliar qualitativamente uma
// conversa real já capturada contra o motor atual sem persistir nada.
//
// Uso:
//   node --env-file=.env.local --conditions=react-server \
//     --import ./scripts/register-typescript-test-loader.mjs \
//     scripts/companion-real-cycle-replay-runner.mjs --cycle-id <uuid> [--conversation-key <key>]

import { createClient } from '@supabase/supabase-js'

import { createStatefulCopilotServerRealContextLoader } from '../app/lib/server/stateful-copilot-real-context-loader.ts'
import { createStatefulCopilotServerComposition } from '../app/lib/server/stateful-copilot-composition.ts'

const REPLAY_DIAGNOSTIC_MODEL =
  'gpt-4.1-mini-2025-04-14'

const REPLAY_COMMUNICATION_MODEL =
  'gpt-5.6'

function parseArgs(argv) {
  const get = (flag) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : null
  }

  return {
    cycleId: get('--cycle-id'),
    conversationKey: get('--conversation-key'),
  }
}

async function resolveConversationScope(client, cycleId) {
  const { data, error } = await client
    .from('conversation_messages')
    .select(
      'company_id, conversation_key, message_key, version, occurred_at, observed_at, is_deleted',
    )
    .eq('cycle_id', cycleId)
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

  const companyIds = new Set(data.map((row) => row.company_id))
  const conversationKeys = new Set(data.map((row) => row.conversation_key))

  if (companyIds.size > 1) {
    throw new Error(
      `cycle_id ${cycleId} aparece em mais de uma company_id (${[...companyIds].join(', ')}) — isso não deveria acontecer.`,
    )
  }

  return {
    companyId: [...companyIds][0],
    conversationKeys: [...conversationKeys],
    rows: data,
  }
}

function resolveReplayReferenceTime(rows, conversationKey) {
  const canonicalByMessageKey = new Map()

  for (const row of rows) {
    if (row.conversation_key !== conversationKey) {
      continue
    }

    if (
      typeof row.message_key !== 'string' ||
      row.message_key.trim() === ''
    ) {
      throw new Error(
        'conversation_messages retornou message_key inválida para o replay.',
      )
    }

    const version = Number(row.version)

    if (!Number.isSafeInteger(version) || version <= 0) {
      throw new Error(
        `conversation_messages retornou version inválida para message_key ${row.message_key}.`,
      )
    }

    const current = canonicalByMessageKey.get(row.message_key)

    if (!current || version > Number(current.version)) {
      canonicalByMessageKey.set(row.message_key, row)
      continue
    }

    if (version === Number(current.version)) {
      const currentObservedAt = Date.parse(current.observed_at ?? '')
      const candidateObservedAt = Date.parse(row.observed_at ?? '')

      if (
        Number.isFinite(candidateObservedAt) &&
        (
          !Number.isFinite(currentObservedAt) ||
          candidateObservedAt > currentObservedAt
        )
      ) {
        canonicalByMessageKey.set(row.message_key, row)
      }
    }
  }

  const activeCanonicalRows =
    [...canonicalByMessageKey.values()]
      .filter((row) => row.is_deleted !== true)

  if (activeCanonicalRows.length === 0) {
    throw new Error(
      `Nenhuma mensagem canônica ativa encontrada para conversation_key ${conversationKey}.`,
    )
  }

  let latestTimestamp = Number.NEGATIVE_INFINITY

  for (const row of activeCanonicalRows) {
    const timestamp = Date.parse(row.occurred_at ?? '')

    if (!Number.isFinite(timestamp)) {
      throw new Error(
        `conversation_messages retornou occurred_at inválido para message_key ${row.message_key}.`,
      )
    }

    latestTimestamp = Math.max(latestTimestamp, timestamp)
  }

  return new Date(latestTimestamp).toISOString()
}

function createReadOnlyComposition() {
  return createStatefulCopilotServerComposition({
    openai_model:
      REPLAY_DIAGNOSTIC_MODEL,

    openai_communication_model:
      REPLAY_COMMUNICATION_MODEL,

    composition_dependencies: {
      // Sem override de create_reader: usa o leitor real (padrão), que só
      // faz SELECT no estado comercial já persistido — ler não escreve nada.
      create_writer:
        () => async (args) => ({
          status: 'persisted',
          persisted_state_version:
            args.plan.write_guard.candidate_state_version,
          persisted_at:
            args.plan.generated_at,
          state_record_id: `replay-readonly-${args.operation_key}`,
          audit_event_id: `replay-readonly-${args.operation_key}`,
        }),
    },
  })
}

function printModelExecution(engineResult) {
  console.log('\n--- Modelos do replay ---')
  console.log(
    'Diagnóstico solicitado:',
    REPLAY_DIAGNOSTIC_MODEL,
  )
  console.log(
    'Comunicação solicitada:',
    REPLAY_COMMUNICATION_MODEL,
  )

  if (engineResult.mode !== 'model') {
    console.log(
      'Execução do motor:',
      'blocked (nenhuma chamada de modelo foi necessária)',
    )
    return
  }

  console.log(
    'Diagnóstico usado:',
    engineResult.execution.model,
  )
  console.log(
    'Comunicação usada:',
    engineResult.communication_execution?.model ?? null,
  )
}

async function main() {
  const { cycleId, conversationKey: explicitConversationKey } =
    parseArgs(process.argv.slice(2))

  if (!cycleId) {
    console.error(
      'Uso: --cycle-id <uuid> [--conversation-key <key>]',
    )
    process.exitCode = 1
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      'OPENAI_API_KEY não está definida. Rode com --env-file=.env.local.',
    )
    process.exitCode = 1
    return
  }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    console.error(
      'Credenciais do Supabase não estão definidas. Rode com --env-file=.env.local.',
    )
    process.exitCode = 1
    return
  }

  const readClient = createClient(
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

  const {
    companyId,
    conversationKeys,
    rows,
  } = await resolveConversationScope(
    readClient,
    cycleId,
  )

  let conversationKey = explicitConversationKey

  if (!conversationKey) {
    if (conversationKeys.length > 1) {
      console.error(
        `O cycle_id ${cycleId} tem mais de uma conversation_key: ` +
        `${conversationKeys.join(', ')}. Rode de novo passando ` +
        '--conversation-key <uma delas>.',
      )
      process.exitCode = 1
      return
    }

    conversationKey = conversationKeys[0]
  }

  if (!conversationKeys.includes(conversationKey)) {
    console.error(
      `A conversation_key ${conversationKey} não pertence ao cycle_id ${cycleId}.`,
    )
    process.exitCode = 1
    return
  }

  const replayReferenceTime =
    resolveReplayReferenceTime(
      rows,
      conversationKey,
    )

  console.log(
    `Reprocessando (somente leitura, sem persistir) cycle_id=${cycleId} ` +
    `company_id=${companyId} conversation_key=${conversationKey}\n`,
  )

  console.log(
    'Reference time histórico do replay:',
    replayReferenceTime,
  )
  console.log(
    'Limitação conhecida: ledger histórico real + motor/configuração/CRM atualmente disponíveis; ' +
    'isto não é uma reconstrução perfeita do estado histórico.',
  )
  console.log(
    'Modelos fixados para reproduzir a arquitetura atual do Preview:',
  )
  console.log(
    `  diagnóstico=${REPLAY_DIAGNOSTIC_MODEL}`,
  )
  console.log(
    `  comunicação=${REPLAY_COMMUNICATION_MODEL}`,
  )

  const contextLoader =
    createStatefulCopilotServerRealContextLoader()

  const context = await contextLoader({
    company_id: companyId,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    device_key: 'companion-real-cycle-replay',
    reference_time: replayReferenceTime,
  })

  console.log('\n--- Contexto carregado (real, somente leitura) ---')
  console.log('Lead:', context.scope.lead.name)
  console.log('Etapa atual do CRM:', context.scope.cycle.status)
  console.log('Próxima ação atual do CRM:', context.scope.cycle.next_action)
  console.log(
    'Data da próxima ação atual do CRM:',
    context.scope.cycle.next_action_date,
  )
  console.log('Config comercial:', context.commercial_config_status)
  console.log(
    'Mensagens ativas na sessão atual:',
    context.active_message_ids.length,
  )
  console.log(
    'Mensagens conhecidas no total:',
    context.known_message_ids.length,
  )
  console.log(
    'Memória comercial anterior encontrada:',
    context.state_read.mode !== 'missing',
  )
  console.log(
    'analysis_precondition.status:',
    context.diagnostic_input.analysis_precondition.status,
  )

  const composition = createReadOnlyComposition()

  const result = await composition.run({
    diagnostic_input: context.diagnostic_input,
    known_message_ids: context.known_message_ids,
    generated_at: replayReferenceTime,
  })

  printModelExecution(
    result.engine_result,
  )

  console.log(
    '\n--- Resultado do motor (nada foi persistido de verdade) ---',
  )
  console.log(JSON.stringify(result.engine_result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
