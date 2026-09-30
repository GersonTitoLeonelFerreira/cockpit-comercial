import 'server-only'

// Leitura completa — execução de uma rodada.
//
// Lê a conversa inteira do ledger canônico, monta a transcrição legível,
// chama o Claude com raciocínio e grava o resultado em
// companion_full_reading_runs. Não lê nem escreve nenhuma tabela do
// pipeline atual (estado comercial, jobs, método): é modo de teste puro.
//
// REGRA: executeFullReadingRun nunca lança. Toda falha vira status
// 'failed' com um código, para a rodada nunca ficar presa em 'running'.

import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

import {
  loadCanonicalLedgerAtReferenceTime,
  type NormalizedLedgerMessage,
  type StatefulCopilotRealContextSupabaseClient,
} from '../companion/stateful-copilot-real-context-loader'

import {
  loadCommercialConfig,
} from './companion-diagnostic-snapshot'

import {
  buildFullReadingTranscript,
} from '../companion/full-reading/transcript'

import {
  buildFullReadingSystemPrompt,
  buildFullReadingUserPrompt,
  type FullReadingCommercialContext,
} from '../companion/full-reading/prompt'

import {
  CLAUDE_EFFORT_LEVELS,
  ClaudeProviderError,
  callClaudeReading,
  type ClaudeEffort,
} from '../companion/full-reading/anthropic-client'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FullReadingOutputError,
  parseFullReadingOutput,
} from '../companion/full-reading/output'

export const FULL_READING_RUNS_TABLE =
  'companion_full_reading_runs'

export const DEFAULT_FULL_READING_MODEL =
  'claude-sonnet-5-5'

export const DEFAULT_FULL_READING_EFFORT: ClaudeEffort =
  'high'

// Limite total de saída (raciocínio + resposta). Com esforço alto o
// raciocínio pode ser longo; a análise em si fica em poucos milhares.
export const FULL_READING_MAX_TOKENS =
  24_000

// A função da rota tem 300 s; a chamada precisa terminar antes.
export const FULL_READING_TIMEOUT_MS =
  240_000

const MAX_FAILURE_DETAIL_LENGTH =
  500

type EnvLike =
  Record<string, string | undefined>

export function resolveFullReadingModel(
  env: EnvLike = process.env,
): string {
  const configured =
    env.COMPANION_FULL_READING_MODEL?.trim()

  return configured && configured.length > 0
    ? configured
    : DEFAULT_FULL_READING_MODEL
}

export function resolveFullReadingEffort(
  env: EnvLike = process.env,
): ClaudeEffort {
  const configured =
    env.COMPANION_FULL_READING_EFFORT?.trim().toLowerCase()

  const match =
    CLAUDE_EFFORT_LEVELS.find(
      (level) => level === configured,
    )

  return match ?? DEFAULT_FULL_READING_EFFORT
}

export function createFullReadingAdminClient(): SupabaseClient | null {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

type LoadedCommercialConfig =
  Awaited<ReturnType<typeof loadCommercialConfig>>

export function buildCommercialContextFromConfig(
  config: LoadedCommercialConfig,
): FullReadingCommercialContext | null {
  const bundle =
    config.bundle

  const products =
    config.products
      .filter((product) => product.active)
      .map((product) => ({
        name: product.name,
        category: product.category ?? '',
      }))

  if (!bundle && products.length === 0) {
    return null
  }

  const businessDescription =
    bundle?.version.business_description?.trim() ?? ''

  const methodName =
    bundle?.version.commercial_method_name?.trim() ?? ''

  return {
    business_description:
      businessDescription.length > 0
        ? businessDescription
        : null,
    method_name:
      methodName.length > 0
        ? methodName
        : null,
    method_steps:
      [...(bundle?.method_steps ?? [])]
        .sort((left, right) => left.step_order - right.step_order)
        .map((step) => ({
          name: step.name,
          objective: step.objective,
        })),
    products,
    facts:
      (bundle?.facts ?? [])
        .filter((fact) => fact.is_active)
        .map((fact) => fact.fact_value)
        .filter((value) => value.trim().length > 0),
  }
}

export type FullReadingRunInput = {
  admin: SupabaseClient
  runId: string
  companyId: string
  cycleId: string
  conversationKey: string
  referenceTime: string
  model: string
  effort: ClaudeEffort
  apiKey: string
  fetchImpl?: typeof fetch
  loadMessages?: (args: {
    admin: SupabaseClient
    companyId: string
    cycleId: string
    conversationKey: string
    referenceTime: string
  }) => Promise<NormalizedLedgerMessage[]>
  loadConfig?: (args: {
    admin: SupabaseClient
    companyId: string
  }) => Promise<LoadedCommercialConfig>
}

export type FullReadingRunResult =
  | { status: 'succeeded' }
  | { status: 'failed'; failure_code: string }

async function defaultLoadMessages({
  admin,
  companyId,
  cycleId,
  conversationKey,
  referenceTime,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
  referenceTime: string
}): Promise<NormalizedLedgerMessage[]> {
  const ledger =
    await loadCanonicalLedgerAtReferenceTime({
      client:
        admin as unknown as StatefulCopilotRealContextSupabaseClient,
      companyId,
      cycleId,
      conversationKey,
      referenceTime,
    })

  return ledger.canonicalMessages
}

async function defaultLoadConfig({
  admin,
  companyId,
}: {
  admin: SupabaseClient
  companyId: string
}): Promise<LoadedCommercialConfig> {
  return loadCommercialConfig({
    admin,
    companyId,
  })
}

function describeFailure(
  error: unknown,
): { code: string; detail: string } {
  if (error instanceof ClaudeProviderError) {
    return {
      code: error.code,
      detail: error.message,
    }
  }

  if (error instanceof FullReadingOutputError) {
    return {
      code: error.code,
      detail: error.message,
    }
  }

  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return {
      code: (error as { code: string }).code,
      detail:
        error instanceof Error
          ? error.message
          : 'erro sem detalhe',
    }
  }

  return {
    code: 'FULL_READING_UNEXPECTED_ERROR',
    detail:
      error instanceof Error
        ? error.message
        : 'erro sem detalhe',
  }
}

function logEvent(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.info(
    'YOLEN_FULL_READING',
    JSON.stringify({
      event,
      ...fields,
    }),
  )
}

export async function executeFullReadingRun(
  input: FullReadingRunInput,
): Promise<FullReadingRunResult> {
  const startedAt =
    Date.now()

  const loadMessages =
    input.loadMessages ?? defaultLoadMessages

  const loadConfig =
    input.loadConfig ?? defaultLoadConfig

  let transcriptMessageCount: number | null =
    null

  try {
    await input.admin
      .from(FULL_READING_RUNS_TABLE)
      .update({
        status: 'running',
        started_at: new Date(startedAt).toISOString(),
      })
      .eq('run_id', input.runId)
      .eq('status', 'queued')

    const messages =
      await loadMessages({
        admin: input.admin,
        companyId: input.companyId,
        cycleId: input.cycleId,
        conversationKey: input.conversationKey,
        referenceTime: input.referenceTime,
      })

    const transcript =
      buildFullReadingTranscript(messages)

    transcriptMessageCount =
      transcript.message_count

    if (transcript.message_count === 0) {
      throw Object.assign(
        new Error('A conversa não tem mensagens até o momento de referência.'),
        { code: 'EMPTY_CONVERSATION' },
      )
    }

    let commercialContext: FullReadingCommercialContext | null =
      null

    try {
      commercialContext =
        buildCommercialContextFromConfig(
          await loadConfig({
            admin: input.admin,
            companyId: input.companyId,
          }),
        )
    } catch (error) {
      // Sem cadastro a leitura ainda funciona; só perde contexto.
      logEvent('commercial_config_unavailable', {
        run_id: input.runId,
        failure: describeFailure(error).code,
      })
    }

    const response =
      await callClaudeReading({
        apiKey: input.apiKey,
        model: input.model,
        system: buildFullReadingSystemPrompt(),
        userText: buildFullReadingUserPrompt({
          transcriptText: transcript.text,
          referenceTime: input.referenceTime,
          commercialContext,
        }),
        maxTokens: FULL_READING_MAX_TOKENS,
        effort: input.effort,
        outputSchema:
          FULL_READING_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
        timeoutMs: FULL_READING_TIMEOUT_MS,
        fetchImpl: input.fetchImpl,
      })

    const output =
      parseFullReadingOutput(response.text)

    const { error: persistError } =
      await input.admin
        .from(FULL_READING_RUNS_TABLE)
        .update({
          status: 'succeeded',
          model: response.model ?? input.model,
          analysis_markdown: output.analise_markdown,
          decision: output.decisao,
          input_tokens: response.input_tokens,
          output_tokens: response.output_tokens,
          transcript_message_count: transcriptMessageCount,
          duration_ms: Date.now() - startedAt,
          completed_at: new Date().toISOString(),
        })
        .eq('run_id', input.runId)

    if (persistError) {
      throw Object.assign(
        new Error(`Falha ao gravar o resultado (${persistError.code ?? 'sem código'}).`),
        { code: 'RUN_PERSIST_FAILED' },
      )
    }

    logEvent('run_succeeded', {
      run_id: input.runId,
      duration_ms: Date.now() - startedAt,
      input_tokens: response.input_tokens,
      output_tokens: response.output_tokens,
      structured_output: response.used_structured_output,
    })

    return { status: 'succeeded' }
  } catch (error) {
    const failure =
      describeFailure(error)

    logEvent('run_failed', {
      run_id: input.runId,
      failure_code: failure.code,
    })

    try {
      await input.admin
        .from(FULL_READING_RUNS_TABLE)
        .update({
          status: 'failed',
          failure_code: failure.code,
          failure_detail: failure.detail.slice(0, MAX_FAILURE_DETAIL_LENGTH),
          transcript_message_count: transcriptMessageCount,
          duration_ms: Date.now() - startedAt,
          completed_at: new Date().toISOString(),
        })
        .eq('run_id', input.runId)
    } catch {
      // Melhor esforço: o registro da falha não pode derrubar nada.
    }

    return {
      status: 'failed',
      failure_code: failure.code,
    }
  }
}
