import 'server-only'

// Leitura completa — execução de uma rodada.
//
// Lê a conversa inteira do ledger canônico, monta a transcrição legível,
// chama o Claude com raciocínio e grava o resultado em
// companion_full_reading_runs. Lê a etapa do ciclo em sales_cycles (só
// leitura) para comparar o kanban com a conversa. Não escreve em nenhuma
// tabela além de companion_full_reading_runs.
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
  type FullReadingKanbanContext,
} from '../companion/full-reading/prompt'

import {
  getSalesCycleLabel,
} from '../sales-cycle-status'

import type {
  LeadStatus,
} from '@/app/types/sales_cycles'

import {
  CLAUDE_EFFORT_LEVELS,
  ClaudeProviderError,
  callClaudeReading,
  type ClaudeEffort,
} from '../companion/full-reading/anthropic-client'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FullReadingOutputError,
  applyFullReadingCoherence,
  parseFullReadingOutput,
  type FullReadingStoredDecision,
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

// Colunas de sales_cycles lidas para o kanban. Só colunas que existem na
// tabela; os campos de fechamento só entram no prompt na etapa certa.
export const FULL_READING_KANBAN_COLUMNS =
  'id, status, stage_entered_at, next_action, next_action_date, ' +
  'won_at, won_total, product_id, payment_method, payment_type, installments_count, ' +
  'lost_at, lost_reason, paused_reason, canceled_at, canceled_reason'

type KanbanRow = {
  status?: unknown
  stage_entered_at?: unknown
  next_action?: unknown
  next_action_date?: unknown
  won_at?: unknown
  won_total?: unknown
  product_id?: unknown
  payment_method?: unknown
  payment_type?: unknown
  installments_count?: unknown
  lost_at?: unknown
  lost_reason?: unknown
  paused_reason?: unknown
  canceled_at?: unknown
  canceled_reason?: unknown
}

function rowText(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : null
}

function rowNumber(
  value: unknown,
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed =
      Number(value)

    return Number.isFinite(parsed)
      ? parsed
      : null
  }

  return null
}

export function buildKanbanContextFromRow(
  row: KanbanRow,
  productName: string | null,
): FullReadingKanbanContext | null {
  const status =
    rowText(row.status)

  if (!status) {
    return null
  }

  return {
    status,
    label: getSalesCycleLabel(status as LeadStatus),
    stage_entered_at: rowText(row.stage_entered_at),
    next_action: rowText(row.next_action),
    next_action_date: rowText(row.next_action_date),
    won:
      status === 'ganho'
        ? {
            won_at: rowText(row.won_at),
            won_total: rowNumber(row.won_total),
            product_name: productName,
            payment_method: rowText(row.payment_method),
            payment_type: rowText(row.payment_type),
            installments_count: rowNumber(row.installments_count),
          }
        : null,
    lost:
      status === 'perdido'
        ? {
            lost_at: rowText(row.lost_at),
            lost_reason: rowText(row.lost_reason),
          }
        : null,
    paused:
      status === 'pausado'
        ? {
            paused_reason: rowText(row.paused_reason),
          }
        : null,
    canceled:
      status === 'cancelado'
        ? {
            canceled_at: rowText(row.canceled_at),
            canceled_reason: rowText(row.canceled_reason),
          }
        : null,
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
  requireStructuredOutput?: boolean
  fetchImpl?: typeof fetch
  loadKanban?: (args: {
    admin: SupabaseClient
    companyId: string
    cycleId: string
  }) => Promise<FullReadingKanbanContext | null>
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

export async function loadFullReadingMessages({
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

export async function loadFullReadingKanban({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<FullReadingKanbanContext | null> {
  const { data, error } =
    await admin
      .from('sales_cycles')
      .select(FULL_READING_KANBAN_COLUMNS)
      .eq('id', cycleId)
      .eq('company_id', companyId)
      .maybeSingle()

  if (error) {
    throw Object.assign(
      new Error(`Falha ao ler a etapa do kanban (${error.code ?? 'sem código'}).`),
      { code: 'KANBAN_READ_FAILED' },
    )
  }

  if (!data) {
    return null
  }

  const row =
    data as KanbanRow

  let productName: string | null =
    null

  const productId =
    rowText(row.product_id)

  if (row.status === 'ganho' && productId) {
    const { data: product } =
      await admin
        .from('products')
        .select('name')
        .eq('id', productId)
        .eq('company_id', companyId)
        .maybeSingle()

    productName =
      rowText((product as { name?: unknown } | null)?.name)
  }

  return buildKanbanContextFromRow(row, productName)
}

export async function loadFullReadingConfig({
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
    input.loadMessages ?? loadFullReadingMessages

  const loadConfig =
    input.loadConfig ?? loadFullReadingConfig

  const loadKanban =
    input.loadKanban ?? loadFullReadingKanban

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

    let kanban: FullReadingKanbanContext | null =
      null

    try {
      kanban =
        await loadKanban({
          admin: input.admin,
          companyId: input.companyId,
          cycleId: input.cycleId,
        })
    } catch (error) {
      // Sem kanban a leitura ainda funciona; a etapa sugerida perde a
      // comparação e a coerência mantém a etapa atual.
      logEvent('kanban_unavailable', {
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
          kanban,
        }),
        maxTokens: FULL_READING_MAX_TOKENS,
        effort: input.effort,
        outputSchema:
          FULL_READING_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
        timeoutMs: FULL_READING_TIMEOUT_MS,
        requireStructuredOutput: input.requireStructuredOutput === true,
        fetchImpl: input.fetchImpl,
      })

    const output =
      parseFullReadingOutput(response.text)

    const coherence =
      applyFullReadingCoherence(
        output.decisao,
        { currentStatus: kanban?.status ?? null },
      )

    if (coherence.alerts.length > 0) {
      logEvent('stage_coherence_adjusted', {
        run_id: input.runId,
        alerts: coherence.alerts.map((alert) => alert.motivo),
      })
    }

    const storedDecision: FullReadingStoredDecision = {
      ...coherence.decision,
      sistema: {
        kanban_lido: {
          status: kanban?.status ?? null,
          stage_entered_at: kanban?.stage_entered_at ?? null,
        },
        alertas: coherence.alerts,
        saida_estruturada: response.used_structured_output,
      },
    }

    const { error: persistError } =
      await input.admin
        .from(FULL_READING_RUNS_TABLE)
        .update({
          status: 'succeeded',
          model: response.model ?? input.model,
          analysis_markdown: output.analise_markdown,
          decision: storedDecision,
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
