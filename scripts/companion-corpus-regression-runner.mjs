// Executa o corpus sintético de 30 conversas (docs/companion-v2/corpus/cases.json)
// contra o motor real do Companion (diagnóstico + comunicação GPT-5.6), sem
// tocar Supabase, CRM ou Agenda.
//
// O leitor e o gravador de estado são substituídos por versões falsas em
// memória: o motor sempre parte de "sem memória comercial anterior" e a
// "persistência" apenas confirma sucesso sem gravar nada de verdade. Somente
// a chamada à OpenAI é real.
//
// Uso:
//   node --env-file=.env.local --conditions=react-server \
//     --import ./scripts/register-typescript-test-loader.mjs \
//     scripts/companion-corpus-regression-runner.mjs [--only <case-id>] [--limit N]

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCompanionDiagnosticInput } from '../app/lib/companion/diagnostic-input.ts'
import { createStatefulCopilotComposition } from '../app/lib/companion/stateful-copilot-composition.ts'

const here =
  path.dirname(fileURLToPath(import.meta.url))

const corpusPath =
  path.resolve(here, '../docs/companion-v2/corpus/cases.json')

const outputPath =
  path.resolve(here, 'output/companion-corpus-regression-report.json')

// Identidade sintética fixa, compartilhada por todos os casos do corpus.
// Não representa nenhuma empresa real.
const COMPANY_ID = 'corpus-synthetic-company'
const CONFIG_VERSION_ID = 'corpus-synthetic-config-v1'
const PRODUCT_ID = 'corpus-synthetic-product-1'
const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z'

function buildSyntheticCommercialConfig() {
  return {
    version: {
      id: CONFIG_VERSION_ID,
      company_id: COMPANY_ID,
      version_number: 1,
      contract_version: 'phase-2-v1',
      status: 'published',

      business_description:
        'Empresa sintética usada apenas para o corpus de regressão do Companion.',

      target_audience:
        'Público sintético coberto pelo corpus de regressão.',

      value_proposition:
        'Proposta de valor sintética usada apenas para testes de raciocínio.',

      commercial_method_name:
        'Método sintético de venda consultiva',

      commercial_method_description:
        'Acolher, diagnosticar, apresentar e avançar, nessa ordem.',

      communication_tone:
        'Direto, consultivo e honesto.',

      required_behaviors: [
        'Responder com base apenas em evidência real da conversa.',
      ],

      prohibited_behaviors: [
        'Inventar compromisso, ligação ou dado que o cliente não mencionou.',
      ],

      created_by: 'corpus-synthetic-user',
      published_by: 'corpus-synthetic-user',
      archived_by: null,

      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
      published_at: FIXED_TIMESTAMP,
      archived_at: null,
    },

    method_steps: [
      {
        id: 'corpus-synthetic-step-acolher',
        company_id: COMPANY_ID,
        config_version_id: CONFIG_VERSION_ID,
        step_order: 1,
        name: 'acolher',
        objective: 'Acolher o cliente e entender o motivo do contato.',
        completion_criteria: ['Motivo do contato identificado.'],
        recommended_questions: ['Como posso te ajudar hoje?'],
        is_required: true,
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      },
      {
        id: 'corpus-synthetic-step-diagnosticar',
        company_id: COMPANY_ID,
        config_version_id: CONFIG_VERSION_ID,
        step_order: 2,
        name: 'diagnosticar',
        objective: 'Diagnosticar necessidade, contexto e restrições do cliente.',
        completion_criteria: ['Necessidade principal identificada.'],
        recommended_questions: ['O que você está buscando resolver?'],
        is_required: true,
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      },
      {
        id: 'corpus-synthetic-step-apresentar',
        company_id: COMPANY_ID,
        config_version_id: CONFIG_VERSION_ID,
        step_order: 3,
        name: 'apresentar',
        objective: 'Apresentar a solução conectada à necessidade identificada.',
        completion_criteria: ['Solução apresentada conectada à necessidade.'],
        recommended_questions: ['Isso faz sentido pra você?'],
        is_required: true,
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      },
      {
        id: 'corpus-synthetic-step-avancar',
        company_id: COMPANY_ID,
        config_version_id: CONFIG_VERSION_ID,
        step_order: 4,
        name: 'avancar',
        objective: 'Avançar para o próximo passo comercial concreto.',
        completion_criteria: ['Próximo passo comercial definido.'],
        recommended_questions: ['Podemos seguir com o próximo passo?'],
        is_required: false,
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      },
    ],

    product_profiles: [
      {
        id: 'corpus-synthetic-product-profile-1',
        company_id: COMPANY_ID,
        config_version_id: CONFIG_VERSION_ID,
        product_id: PRODUCT_ID,

        indicated_audiences: ['Público sintético do corpus.'],
        needs_addressed: ['Necessidade sintética coberta pelo corpus.'],

        benefits: [
          'Acesso à estrutura.',
          'Acompanhamento inicial.',
          'Opções mensal e anual.',
        ],

        verified_differentiators: ['Acompanhamento inicial incluso.'],
        limitations: ['Uso restrito ao escopo sintético do corpus.'],
        contract_conditions: ['Conforme corpus sintético.'],
        payment_conditions: ['Mensal ou anual, conforme corpus sintético.'],
        allowed_claims: ['Estrutura disponível conforme corpus sintético.'],
        forbidden_claims: ['Resultado garantido.'],

        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      },
    ],

    facts: [
      {
        id: 'corpus-synthetic-fact-1',
        company_id: COMPANY_ID,
        config_version_id: CONFIG_VERSION_ID,
        category: 'operacional',
        fact_key: 'observacao',
        fact_value: 'Dados sintéticos do corpus de regressão.',
        source_note: 'Corpus sintético',
        is_active: true,
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      },
    ],

    objection_guides: [
      {
        id: 'corpus-synthetic-objection-preco',
        company_id: COMPANY_ID,
        config_version_id: CONFIG_VERSION_ID,
        sort_order: 1,
        objection: 'Preço',
        signals: ['Está caro'],
        discovery_questions: ['O que você está comparando?'],
        recommended_approach: 'Entender a comparação antes de responder.',
        response_limits: ['Não prometer desconto inexistente.'],
        is_active: true,
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP,
      },
    ],
  }
}

function buildSyntheticProducts() {
  return [
    {
      id: PRODUCT_ID,
      company_id: COMPANY_ID,
      name: 'Plano sintético',
      category: 'plano',
      base_price: 199.9,
      active: true,
    },
  ]
}

// O corpus registra o histórico completo de versões de cada mensagem
// (edição/exclusão). buildCompanionDiagnosticInput espera o estado canônico
// já colapsado: uma linha por id, na versão mais recente.
function collapseCorpusMessages(rawMessages) {
  const latestById = new Map()

  for (const message of rawMessages) {
    const existing = latestById.get(message.id)

    if (!existing || message.version > existing.version) {
      latestById.set(message.id, message)
    }
  }

  // buildCompanionDiagnosticInput exige que "id" seja um inteiro positivo
  // (como o id real do banco). O corpus usa ids de texto (ex: "won-1"), então
  // geramos um id numérico sequencial e preservamos o id original do corpus
  // em message_key, que é o campo de texto livre.
  return [...latestById.values()]
    .sort((a, b) => a.sequence - b.sequence)
    .map((message, index) => {
      const isDeleted = message.state === 'deleted'

      return {
        id: String(index + 1),
        message_key: message.id,
        version: message.version,
        direction: message.direction,
        occurred_at: message.captured_at,
        observed_at: message.captured_at,
        content_type: message.content_type,
        text_content: isDeleted ? null : message.text,
        audio_transcription: isDeleted ? null : message.audio_transcription,
        is_deleted: isDeleted,
      }
    })
}

function buildDiagnosticInputForCase(corpusCase) {
  const canonicalMessages =
    collapseCorpusMessages(corpusCase.messages)

  const diagnosticInput =
    buildCompanionDiagnosticInput({
      company_id: COMPANY_ID,
      cycle_id: `corpus-${corpusCase.id}`,
      conversation_key: `corpus:${corpusCase.id}`,
      current_crm_status: corpusCase.initial_status,
      reference_time: corpusCase.reference_time,
      messages: canonicalMessages,
      commercial_config: buildSyntheticCommercialConfig(),
      products: buildSyntheticProducts(),
    })

  const knownMessageIds =
    canonicalMessages.map((message) => message.id)

  return { diagnosticInput, knownMessageIds }
}

function createInMemoryComposition() {
  return createStatefulCopilotComposition({
    // O client nunca é usado de verdade: create_reader e create_writer
    // abaixo o ignoram e nunca chamam Supabase.
    client: {},

    // Sem overrides: usa OPENAI_API_KEY, OPENAI_STATEFUL_COPILOT_MODEL e
    // OPENAI_STATEFUL_COMMUNICATION_MODEL do ambiente, exatamente como em
    // produção/preview.
    openai_options: {},

    dependencies: {
      create_reader:
        () => async (args) => ({
          mode: 'missing',
          found: false,
          state: null,
          state_version: null,
          state_updated_at: null,
          company_id: args.company_id,
          cycle_id: args.cycle_id,
          conversation_key: args.conversation_key,
        }),

      create_writer:
        () => async (args) => ({
          persisted_state_version:
            args.plan.write_guard.candidate_state_version,
          persisted_at: new Date().toISOString(),
          state_record_id: `corpus-synthetic-record-${args.operation_key}`,
          audit_event_id: `corpus-synthetic-audit-${args.operation_key}`,
        }),
    },
  })
}

async function runCase(composition, corpusCase) {
  const { diagnosticInput, knownMessageIds } =
    buildDiagnosticInputForCase(corpusCase)

  const startedAt = Date.now()

  try {
    const result = await composition.run({
      diagnostic_input: diagnosticInput,
      known_message_ids: knownMessageIds,
      generated_at: new Date().toISOString(),
    })

    const durationMs = Date.now() - startedAt
    const engine = result.engine_result

    return {
      id: corpusCase.id,
      coverage: corpusCase.coverage,
      ok: true,
      duration_ms: durationMs,
      mode: engine.mode,
      limitations: engine.limitations ?? [],
      diagnostic_output: engine.output,
      communication_output: engine.communication_output,
      phase1_oracle_reference: corpusCase.oracle,
    }
  } catch (error) {
    return {
      id: corpusCase.id,
      coverage: corpusCase.coverage,
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: {
        name: error?.name ?? null,
        code: error?.code ?? null,
        message: error?.message ?? String(error),
      },
    }
  }
}

function summarizeForConsole(result) {
  if (!result.ok) {
    return `ERRO ${result.error.code ?? result.error.name} — ${result.error.message}`
  }

  if (result.mode === 'blocked') {
    return `bloqueado (${result.limitations.join(', ') || 'sem detalhe'})`
  }

  const communication = result.communication_output

  if (!communication) {
    return `modo ${result.mode} sem saída de comunicação`
  }

  const pieces = [
    communication.intervention_needed
      ? 'intervenção: sim'
      : 'intervenção: não',
  ]

  if (communication.recommended_question) {
    pieces.push(`pergunta: "${communication.recommended_question}"`)
  }

  if (communication.suggested_message) {
    pieces.push(`mensagem sugerida: "${communication.suggested_message}"`)
  }

  return pieces.join(' | ')
}

function parseArgs(argv) {
  const onlyIndex = argv.indexOf('--only')
  const limitIndex = argv.indexOf('--limit')

  return {
    only: onlyIndex >= 0 ? argv[onlyIndex + 1] : null,
    limit: limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null,
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      'OPENAI_API_KEY não está definida. Rode com --env-file=.env.local ' +
      'ou exporte a variável antes de continuar. Nenhuma chamada foi feita.',
    )

    process.exitCode = 1
    return
  }

  const corpus =
    JSON.parse(await readFile(corpusPath, 'utf8'))

  const { only, limit } =
    parseArgs(process.argv.slice(2))

  let cases = only
    ? corpus.cases.filter((item) => item.id === only)
    : corpus.cases

  if (only && cases.length === 0) {
    console.error(`Nenhum caso encontrado com id "${only}".`)
    process.exitCode = 1
    return
  }

  if (limit && Number.isFinite(limit) && limit > 0) {
    cases = cases.slice(0, limit)
  }

  console.log(
    `Executando ${cases.length} conversa(s) do corpus contra o motor real ` +
    '(diagnóstico + comunicação). Nenhuma escrita em Supabase, CRM ou Agenda ' +
    'ocorre nesta execução.\n',
  )

  const composition = createInMemoryComposition()
  const results = []

  for (const [index, corpusCase] of cases.entries()) {
    process.stdout.write(
      `[${index + 1}/${cases.length}] ${corpusCase.id} ... `,
    )

    const result = await runCase(composition, corpusCase)
    results.push(result)

    console.log(summarizeForConsole(result))
  }

  await mkdir(path.dirname(outputPath), { recursive: true })

  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        corpus_version: corpus.corpus_version,
        total_cases: results.length,
        failed_cases: results.filter((item) => !item.ok).length,
        results,
      },
      null,
      2,
    ),
  )

  console.log(`\nRelatório completo salvo em ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
