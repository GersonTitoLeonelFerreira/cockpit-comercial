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
//
// Rodada 9: com uma leitura anterior válida (baseRun), a rodada é de
// continuação — decisão anterior + 10 mensagens de contexto + as novas —,
// a menos que um gatilho peça a conversa inteira (continuation.ts e os
// motivos que o painel passa). A parte fixa do pedido vai para o cache de
// prompt; o caminho sem formato fixo é o padrão; JSON inválido repete a
// chamada uma vez. A decisão gravada registra sistema.modo,
// sistema.leitura_base, o motivo e o uso de tokens.

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
  type FullReadingTranscriptMarker,
} from '../companion/full-reading/transcript'

import {
  buildSuccessorMarkers,
  loadFullReadingCycleChain,
  loadSuccessorNotes,
  mergeChainMessages,
} from './full-reading-cycle-chain'

import {
  buildFullReadingContinuationUserPrompt,
  buildFullReadingSystemPrompt,
  buildFullReadingUserPrompt,
  type FullReadingCommercialContext,
  type FullReadingKanbanContext,
} from '../companion/full-reading/prompt'

import {
  CONTINUATION_MAX_CONSECUTIVE,
  buildContinuationTranscripts,
  continuationFullReason,
  splitContinuationMessages,
  type FullReadingFullReason,
} from '../companion/full-reading/continuation'

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
  type ClaudeReadingResponse,
} from '../companion/full-reading/anthropic-client'

import {
  attachmentSummariesAt,
  loadConversationAttachments,
  type AttachmentRecord,
} from './full-reading-attachments'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FullReadingOutputError,
  applyFullReadingCoherence,
  applyFullReadingLimits,
  countFullReadingOverflow,
  findRegistryContradictionAlerts,
  parseFullReadingOutput,
  type FullReadingMode,
  type FullReadingOutput,
  type FullReadingStoredDecision,
  type FullReadingUsage,
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
        base_price:
          typeof product.base_price === 'number' && Number.isFinite(product.base_price)
            ? product.base_price
            : null,
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
  'lost_at, lost_reason, paused_reason, canceled_at, canceled_reason, ' +
  'created_at, origin_cycle_id, lead_id'

// leads.source gravado pelo Companion ao criar o lead.
const COMPANION_LEAD_SOURCE =
  'whatsapp_companion'

type KanbanRow = {
  created_at?: unknown
  origin_cycle_id?: unknown
  lead_id?: unknown
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
  leadSource: string | null | undefined = undefined,
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
    created_at: rowText(row.created_at),
    // undefined = origem não lida (nada é dito sobre por onde).
    created_via:
      leadSource === undefined
        ? null
        : leadSource === COMPANION_LEAD_SOURCE
          ? 'companion'
          : 'yolen',
    successor: Boolean(rowText(row.origin_cycle_id)),
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

// Sem rota informada (chamada interna), o log usa esta.
export const FULL_READING_DEFAULT_TRIGGER_ROUTE =
  'full-reading-runner'

// Leitura anterior usada como base da continuação (mesma versão do prompt).
export type FullReadingBaseRun = {
  run_id: string
  reference_time: string
  completed_at: string | null
  decision: Record<string, unknown>
}

export type FullReadingRequestedMode =
  | 'auto'
  | 'completa'
  | 'continuacao'

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
  // Rota que levou à rodada (log de tokens por chamada, rodada 7).
  triggerRoute?: string
  logger?: (line: string) => void
  // Rodada 9: leitura anterior para a continuação; sem ela, completa.
  baseRun?: FullReadingBaseRun | null
  // 'auto' (padrão com base): continuação, salvo gatilho de completa.
  mode?: FullReadingRequestedMode
  // Gatilhos de completa decididos por quem chama (ex.: pedido do vendedor).
  fullReasons?: FullReadingFullReason[]
  // Por que a leitura foi pedida (mensagem_nova, horario_passou...).
  reasons?: string[]
  loadChain?: (args: {
    admin: SupabaseClient
    companyId: string
    cycleId: string
  }) => Promise<string[]>
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
  loadMarkers?: (args: {
    admin: SupabaseClient
    companyId: string
    cycleId: string
  }) => Promise<FullReadingTranscriptMarker[]>
  loadConfig?: (args: {
    admin: SupabaseClient
    companyId: string
  }) => Promise<LoadedCommercialConfig>
  // Rodada 11: arquivos incluídos pelo vendedor (resumos).
  loadAttachments?: (args: {
    admin: SupabaseClient
    companyId: string
    conversationKey: string
  }) => Promise<AttachmentRecord[]>
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
  // Oportunidade nova: a mesma conversa nos ciclos de origem entra como
  // histórico (as mensagens antigas continuam gravadas no ciclo fechado).
  const chain =
    await loadFullReadingCycleChain({
      admin,
      companyId,
      cycleId,
    })

  const cycleIds =
    chain.length > 0
      ? chain.map((link) => link.id)
      : [cycleId]

  const lists: NormalizedLedgerMessage[][] = []

  for (const chainCycleId of cycleIds) {
    const ledger =
      await loadCanonicalLedgerAtReferenceTime({
        client:
          admin as unknown as StatefulCopilotRealContextSupabaseClient,
        companyId,
        cycleId: chainCycleId,
        conversationKey,
        referenceTime,
      })

    lists.push(ledger.canonicalMessages)
  }

  return mergeChainMessages(lists)
}

// Marco "Nova oportunidade aberta em ..." para cada elo da cadeia.
export async function loadFullReadingTranscriptMarkers({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<FullReadingTranscriptMarker[]> {
  const chain =
    await loadFullReadingCycleChain({
      admin,
      companyId,
      cycleId,
    })

  const successors =
    chain.filter((link) => link.origin_cycle_id)

  if (successors.length === 0) {
    return []
  }

  const notes =
    await loadSuccessorNotes({
      admin,
      companyId,
      cycleIds: successors.map((link) => link.id),
    })

  return buildSuccessorMarkers(successors, notes)
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

  // Por onde a oportunidade foi criada (v5, F3). Sem a leitura do lead, a
  // linha só diz quando.
  let leadSource: string | null | undefined =
    undefined

  const leadId =
    rowText(row.lead_id)

  if (leadId) {
    try {
      const { data: lead, error: leadError } =
        await admin
          .from('leads')
          .select('source')
          .eq('id', leadId)
          .eq('company_id', companyId)
          .maybeSingle()

      if (!leadError && lead) {
        leadSource =
          rowText((lead as { source?: unknown }).source)
      }
    } catch {
      leadSource = undefined
    }
  }

  return buildKanbanContextFromRow(row, productName, leadSource)
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

export async function loadFullReadingChainIds({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<string[]> {
  const chain =
    await loadFullReadingCycleChain({
      admin,
      companyId,
      cycleId,
    })

  return chain.length > 0
    ? chain.map((link) => link.id)
    : [cycleId]
}

const CLOSED_KANBAN_STATUSES =
  new Set(['ganho', 'perdido'])

function readSystem(
  decision: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const system =
    decision?.sistema

  return system && typeof system === 'object' && !Array.isArray(system)
    ? system as Record<string, unknown>
    : {}
}

function sameList(
  left: string[],
  right: string[],
): boolean {
  return (
    left.length === right.length &&
    [...left].sort().join('|') === [...right].sort().join('|')
  )
}

// Gatilhos de leitura completa que dependem só da leitura anterior.
export function baseRunFullReason({
  baseRun,
  chainIds,
  kanbanStatus,
}: {
  baseRun: FullReadingBaseRun
  chainIds: string[]
  kanbanStatus: string | null
}): FullReadingFullReason | null {
  const system =
    readSystem(baseRun.decision)

  const baseChain =
    Array.isArray(system.cadeia)
      ? (system.cadeia as unknown[]).filter((item): item is string => typeof item === 'string')
      : null

  if (baseChain && baseChain.length > 0 && !sameList(baseChain, chainIds)) {
    return 'cadeia_mudou'
  }

  const kanbanRead =
    system.kanban_lido && typeof system.kanban_lido === 'object'
      ? (system.kanban_lido as { status?: unknown }).status
      : null

  if (
    typeof kanbanRead === 'string' &&
    CLOSED_KANBAN_STATUSES.has(kanbanRead) &&
    kanbanStatus !== null &&
    kanbanStatus !== kanbanRead &&
    !CLOSED_KANBAN_STATUSES.has(kanbanStatus) &&
    kanbanStatus !== 'cancelado'
  ) {
    return 'kanban_reaberto'
  }

  const consecutive =
    system.modo === 'continuacao' && typeof system.continuacoes_seguidas === 'number'
      ? system.continuacoes_seguidas
      : 0

  if (consecutive >= CONTINUATION_MAX_CONSECUTIVE) {
    return 'continuacoes_seguidas'
  }

  return null
}

function baseConsecutive(
  baseRun: FullReadingBaseRun,
): number {
  const system =
    readSystem(baseRun.decision)

  return system.modo === 'continuacao' && typeof system.continuacoes_seguidas === 'number'
    ? system.continuacoes_seguidas
    : 0
}

function addUsage(
  usage: FullReadingUsage,
  response: ClaudeReadingResponse,
): FullReadingUsage {
  const add = (left: number | null, right: number | null) =>
    left === null && right === null
      ? null
      : (left ?? 0) + (right ?? 0)

  return {
    chamadas: usage.chamadas + 1,
    entrada: add(usage.entrada, response.input_tokens),
    saida: add(usage.saida, response.output_tokens),
    cache_lido: add(usage.cache_lido, response.cache_read_input_tokens),
    cache_gravado: add(usage.cache_gravado, response.cache_creation_input_tokens),
  }
}

// Entrada total (sem cache + lida do cache + gravada no cache): a mesma
// conta das rodadas anteriores ao cache.
function totalInput(
  usage: FullReadingUsage,
): number | null {
  if (usage.entrada === null && usage.cache_lido === null && usage.cache_gravado === null) {
    return null
  }

  return (usage.entrada ?? 0) + (usage.cache_lido ?? 0) + (usage.cache_gravado ?? 0)
}

// Rodada 10 (C1): a continuação só vale quando a entrada dela é claramente
// menor que a da leitura completa (a decisão anterior pode pesar mais que
// a conversa inteira numa conversa curta). Estimativa por caracteres; o
// system é o mesmo nos dois modos (e vem do cache), por isso fica de fora.
export const CONTINUATION_MAX_INPUT_RATIO =
  0.7

const CHARS_PER_TOKEN_ESTIMATE =
  3.5

export function estimateInputTokens(
  text: string,
): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

// Saída que não é JSON válido (ou vem incompleta): a chamada repete uma vez.
const OUTPUT_RETRY_CODES =
  new Set(['INVALID_MODEL_OUTPUT', 'EMPTY_PROVIDER_RESPONSE'])

export async function executeFullReadingRun(
  input: FullReadingRunInput,
): Promise<FullReadingRunResult> {
  const startedAt =
    Date.now()

  const loadMessages =
    input.loadMessages ?? loadFullReadingMessages

  const loadMarkers =
    input.loadMarkers ??
    (input.loadMessages ? async () => [] : loadFullReadingTranscriptMarkers)

  const loadConfig =
    input.loadConfig ?? loadFullReadingConfig

  const loadKanban =
    input.loadKanban ?? loadFullReadingKanban

  const loadAttachments =
    input.loadAttachments ??
    (input.loadMessages
      ? async () => [] as AttachmentRecord[]
      : async (args: { admin: SupabaseClient; companyId: string; conversationKey: string }) =>
          (await loadConversationAttachments(args)).records)

  const loadChain =
    input.loadChain ??
    (input.loadMessages
      ? async ({ cycleId }: { cycleId: string }) => [cycleId]
      : loadFullReadingChainIds)

  let transcriptMessageCount: number | null =
    null

  let mode: FullReadingMode =
    'completa'

  const reasons: string[] =
    [...(input.reasons ?? [])]

  let usage: FullReadingUsage = {
    chamadas: 0,
    entrada: null,
    saida: null,
    cache_lido: null,
    cache_gravado: null,
  }

  try {
    await input.admin
      .from(FULL_READING_RUNS_TABLE)
      .update({
        status: 'running',
        started_at: new Date(startedAt).toISOString(),
      })
      .eq('run_id', input.runId)
      .eq('status', 'queued')

    const messageArgs = {
      admin: input.admin,
      companyId: input.companyId,
      cycleId: input.cycleId,
      conversationKey: input.conversationKey,
    }

    // Rodada 11: o resumo do arquivo incluído entra na mensagem do arquivo
    // (só o que já existia no momento de referência da leitura).
    let attachmentRecords: AttachmentRecord[] = []

    try {
      attachmentRecords =
        await loadAttachments({
          admin: input.admin,
          companyId: input.companyId,
          conversationKey: input.conversationKey,
        })
    } catch {
      attachmentRecords = []
    }

    const withAttachmentSummaries = (
      list: NormalizedLedgerMessage[],
      referenceTime: string,
    ): NormalizedLedgerMessage[] => {
      const summaries =
        attachmentSummariesAt(attachmentRecords, referenceTime)

      if (summaries.size === 0) {
        return list
      }

      return list.map((message) =>
        summaries.has(message.message_key)
          ? { ...message, attachment_summary: summaries.get(message.message_key) }
          : message)
    }

    const messages =
      withAttachmentSummaries(
        await loadMessages({
          ...messageArgs,
          referenceTime: input.referenceTime,
        }),
        input.referenceTime,
      )

    let markers: FullReadingTranscriptMarker[] = []

    try {
      markers =
        await loadMarkers({
          admin: input.admin,
          companyId: input.companyId,
          cycleId: input.cycleId,
        })
    } catch {
      // Sem o marco a leitura continua; só perde o aviso da oportunidade nova.
      markers = []
    }

    let chainIds: string[] =
      [input.cycleId]

    try {
      chainIds =
        await loadChain({
          admin: input.admin,
          companyId: input.companyId,
          cycleId: input.cycleId,
        })
    } catch {
      chainIds = [input.cycleId]
    }

    const transcript =
      buildFullReadingTranscript(messages, { markers })

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

    // Completa ou continuação (rodada 9, E).
    const requested: FullReadingRequestedMode =
      input.mode ?? 'auto'

    const baseRun =
      input.baseRun ?? null

    let fullReason: FullReadingFullReason | null =
      requested === 'completa'
        ? (input.fullReasons?.[0] ?? 'modo_pedido')
        : !baseRun
          ? 'sem_leitura_anterior'
          : requested === 'auto'
            ? (input.fullReasons?.[0] ??
              baseRunFullReason({
                baseRun,
                chainIds,
                kanbanStatus: kanban?.status ?? null,
              }))
            : null

    let continuationPrompt: string | null =
      null

    if (fullReason === null && baseRun) {
      const previous =
        withAttachmentSummaries(
          await loadMessages({
            ...messageArgs,
            referenceTime: baseRun.reference_time,
          }),
          baseRun.reference_time,
        )

      const split =
        splitContinuationMessages({
          previous,
          current: messages,
        })

      const splitReason =
        continuationFullReason(split)

      // modo=continuacao (rota de teste) só cai na completa sem contexto.
      fullReason =
        requested === 'continuacao'
          ? (split.context.length === 0 ? 'sem_leitura_anterior' : null)
          : splitReason

      if (fullReason === null) {
        const parts =
          buildContinuationTranscripts(split, { markers })

        transcriptMessageCount =
          parts.context_message_count + parts.new_message_count

        continuationPrompt =
          buildFullReadingContinuationUserPrompt({
            referenceTime: input.referenceTime,
            commercialContext,
            kanban,
            previousDecision: baseRun.decision,
            previousReadingAt: baseRun.reference_time,
            contextText: parts.context_text,
            newText: parts.new_text,
          })
      }
    }

    const fullPrompt = () =>
      buildFullReadingUserPrompt({
        transcriptText: transcript.text,
        referenceTime: input.referenceTime,
        commercialContext,
        kanban,
      })

    // C1: continuação só quando sai claramente mais barata.
    let estimate: {
      completa: number
      continuacao: number | null
      proporcao: number | null
      escolha: FullReadingMode
    } | null = null

    if (continuationPrompt) {
      const fullTokens =
        estimateInputTokens(fullPrompt())

      const continuationTokens =
        estimateInputTokens(continuationPrompt)

      const ratio =
        fullTokens > 0
          ? Math.round((continuationTokens / fullTokens) * 100) / 100
          : 1

      const cheaper =
        requested === 'continuacao' ||
        continuationTokens < fullTokens * CONTINUATION_MAX_INPUT_RATIO

      estimate = {
        completa: fullTokens,
        continuacao: continuationTokens,
        proporcao: ratio,
        escolha: cheaper ? 'continuacao' : 'completa',
      }

      logEvent('mode_estimate', {
        run_id: input.runId,
        full_input_tokens: fullTokens,
        continuation_input_tokens: continuationTokens,
        ratio,
        choice: estimate.escolha,
      })

      if (!cheaper) {
        continuationPrompt = null
        fullReason = 'continuacao_mais_cara'
        transcriptMessageCount = transcript.message_count
      }
    }

    mode =
      continuationPrompt ? 'continuacao' : 'completa'

    if (fullReason) {
      reasons.push(fullReason)
    }

    const callAndParse = async (
      userText: string,
      callMode: FullReadingMode,
    ): Promise<{ output: FullReadingOutput; response: ClaudeReadingResponse }> => {
      let attempt = 0

      while (true) {
        attempt += 1

        const response =
          await callClaudeReading({
            apiKey: input.apiKey,
            model: input.model,
            system: buildFullReadingSystemPrompt(),
            userText,
            maxTokens: FULL_READING_MAX_TOKENS,
            effort: input.effort,
            outputSchema:
              FULL_READING_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
            timeoutMs: FULL_READING_TIMEOUT_MS,
            requireStructuredOutput: input.requireStructuredOutput === true,
            // A1: o formato fixo só na rota de teste estrita.
            preferStructuredOutput: input.requireStructuredOutput === true,
            cacheSystemPrompt: true,
            fetchImpl: input.fetchImpl,
            usageLog: {
              route: input.triggerRoute ?? FULL_READING_DEFAULT_TRIGGER_ROUTE,
              purpose: 'full_reading',
              run_id: input.runId,
              mode: callMode,
            },
            logger: input.logger,
          }).catch((error: unknown) => {
            if (
              attempt === 1 &&
              error instanceof ClaudeProviderError &&
              OUTPUT_RETRY_CODES.has(error.code)
            ) {
              return { retry: error.code } as const
            }

            throw error
          })

        if ('retry' in response) {
          logEvent('output_retry', {
            run_id: input.runId,
            mode: callMode,
            failure_code: response.retry,
          })

          continue
        }

        usage =
          addUsage(usage, response)

        try {
          return {
            output: parseFullReadingOutput(response.text, { format: 'v6' }),
            response,
          }
        } catch (error) {
          if (
            attempt === 1 &&
            error instanceof FullReadingOutputError &&
            OUTPUT_RETRY_CODES.has(error.code)
          ) {
            logEvent('output_retry', {
              run_id: input.runId,
              mode: callMode,
              failure_code: error.code,
            })

            continue
          }

          throw error
        }
      }
    }

    let result =
      await callAndParse(continuationPrompt ?? fullPrompt(), mode)

    let continuationAskedFull: string | null =
      null

    // A continuação pediu a conversa inteira: uma completa logo depois, uma
    // vez só.
    if (mode === 'continuacao' && result.output.decisao.precisa_ler_inteira === true) {
      continuationAskedFull =
        result.output.decisao.precisa_ler_inteira_motivo || 'sem motivo informado'

      logEvent('continuation_asked_full', {
        run_id: input.runId,
      })

      mode = 'completa'
      reasons.push('continuacao_pediu')
      transcriptMessageCount = transcript.message_count

      result =
        await callAndParse(fullPrompt(), 'completa')
    }

    const { output, response } =
      result

    // D3 (rodada 10): limites da v7; o excesso sai sem falhar e vai para o
    // log.
    const limited =
      applyFullReadingLimits(output.decisao)

    // O que o modelo escreveu além de cada limite (inclui o que o parser já
    // cortava sem registrar).
    const cuts: Record<string, number> = {
      ...countFullReadingOverflow(response.text),
    }

    for (const [field, count] of Object.entries(limited.cuts)) {
      cuts[field] = Math.max(cuts[field] ?? 0, count)
    }

    if (Object.keys(cuts).length > 0) {
      logEvent('output_trimmed', {
        run_id: input.runId,
        cuts,
      })
    }

    // Na completa, o pedido de ler inteira não se aplica.
    const decision = {
      ...limited.decision,
      precisa_ler_inteira: false,
      precisa_ler_inteira_motivo: '',
    }

    const coherence =
      applyFullReadingCoherence(
        decision,
        { currentStatus: kanban?.status ?? null },
      )

    if (coherence.alerts.length > 0) {
      logEvent('stage_coherence_adjusted', {
        run_id: input.runId,
        alerts: coherence.alerts.map((alert) => alert.motivo),
      })
    }

    // F2: contradição com o cadastro que muda o que o cliente paga ou
    // recebe sem verificação interna vira alerta (o texto não muda).
    const registryAlerts =
      findRegistryContradictionAlerts(coherence.decision)

    if (registryAlerts.length > 0) {
      logEvent('registry_contradiction_without_check', {
        run_id: input.runId,
        acao_agora: coherence.decision.acao_agora,
      })
    }

    const storedDecision: FullReadingStoredDecision = {
      ...coherence.decision,
      sistema: {
        kanban_lido: {
          status: kanban?.status ?? null,
          stage_entered_at: kanban?.stage_entered_at ?? null,
        },
        alertas: [
          ...coherence.alerts,
          ...registryAlerts,
        ],
        saida_estruturada: response.used_structured_output,
        modo: mode,
        leitura_base:
          mode === 'continuacao' && baseRun
            ? baseRun.run_id
            : null,
        motivo: [...new Set(reasons)],
        continuacoes_seguidas:
          mode === 'continuacao' && baseRun
            ? baseConsecutive(baseRun) + 1
            : 0,
        cadeia: chainIds,
        continuacao_pediu_inteira: continuationAskedFull,
        ciclo_encerrado:
          kanban && ['ganho', 'perdido', 'cancelado'].includes(kanban.status)
            ? kanban.status
            : null,
        uso: usage,
        estimativa: estimate,
        cortes:
          Object.keys(cuts).length > 0
            ? cuts
            : null,
      },
    }

    const durationMs =
      Date.now() - startedAt

    const { error: persistError } =
      await input.admin
        .from(FULL_READING_RUNS_TABLE)
        .update({
          status: 'succeeded',
          model: response.model ?? input.model,
          // v5+: null (a decisão traz tudo o que o painel mostra).
          analysis_markdown: output.analise_markdown,
          decision: storedDecision,
          input_tokens: totalInput(usage),
          output_tokens: usage.saida,
          transcript_message_count: transcriptMessageCount,
          duration_ms: durationMs,
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
      mode,
      reasons: [...new Set(reasons)],
      base_run_id: storedDecision.sistema.leitura_base ?? null,
      duration_ms: durationMs,
      calls: usage.chamadas,
      input_tokens: usage.entrada,
      output_tokens: usage.saida,
      cache_read_input_tokens: usage.cache_lido,
      cache_creation_input_tokens: usage.cache_gravado,
      structured_output: response.used_structured_output,
    })

    return { status: 'succeeded' }
  } catch (error) {
    const failure =
      describeFailure(error)

    logEvent('run_failed', {
      run_id: input.runId,
      failure_code: failure.code,
      mode,
      reasons: [...new Set(reasons)],
      duration_ms: Date.now() - startedAt,
      calls: usage.chamadas,
      input_tokens: usage.entrada,
      output_tokens: usage.saida,
      cache_read_input_tokens: usage.cache_lido,
      cache_creation_input_tokens: usage.cache_gravado,
    })

    try {
      await input.admin
        .from(FULL_READING_RUNS_TABLE)
        .update({
          status: 'failed',
          failure_code: failure.code,
          failure_detail: failure.detail.slice(0, MAX_FAILURE_DETAIL_LENGTH),
          transcript_message_count: transcriptMessageCount,
          input_tokens: totalInput(usage),
          output_tokens: usage.saida,
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
