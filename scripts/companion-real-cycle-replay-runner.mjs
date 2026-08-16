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
// Uso:
//   node --env-file=.env.local --conditions=react-server \
//     --import ./scripts/register-typescript-test-loader.mjs \
//     scripts/companion-real-cycle-replay-runner.mjs --cycle-id <uuid> [--conversation-key <key>]

import { createClient } from '@supabase/supabase-js'

import { createStatefulCopilotServerRealContextLoader } from '../app/lib/server/stateful-copilot-real-context-loader.ts'
import { createStatefulCopilotServerComposition } from '../app/lib/server/stateful-copilot-composition.ts'

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
    .select('company_id, conversation_key')
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
  }
}

function createReadOnlyComposition() {
  return createStatefulCopilotServerComposition({
    composition_dependencies: {
      // Sem override de create_reader: usa o leitor real (padrão), que só
      // faz SELECT no estado comercial já persistido — ler não escreve nada.
      create_writer:
        () => async (args) => ({
          status: 'persisted',
          persisted_state_version:
            args.plan.write_guard.candidate_state_version,
          persisted_at: new Date().toISOString(),
          state_record_id: `replay-readonly-${args.operation_key}`,
          audit_event_id: `replay-readonly-${args.operation_key}`,
        }),
    },
  })
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

  const { companyId, conversationKeys } =
    await resolveConversationScope(readClient, cycleId)

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

  console.log(
    `Reprocessando (somente leitura, sem persistir) cycle_id=${cycleId} ` +
    `company_id=${companyId} conversation_key=${conversationKey}\n`,
  )

  const contextLoader =
    createStatefulCopilotServerRealContextLoader()

  const context = await contextLoader({
    company_id: companyId,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    device_key: 'companion-real-cycle-replay',
    reference_time: new Date().toISOString(),
  })

  console.log('--- Contexto carregado (real, somente leitura) ---')
  console.log('Lead:', context.scope.lead.name)
  console.log('Etapa atual do CRM:', context.scope.cycle.status)
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
    generated_at: new Date().toISOString(),
  })

  console.log(
    '\n--- Resultado do motor (nada foi persistido de verdade) ---',
  )
  console.log(JSON.stringify(result.engine_result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
