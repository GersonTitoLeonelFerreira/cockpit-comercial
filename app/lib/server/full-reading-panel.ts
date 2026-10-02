import 'server-only'

// Leitura completa no painel (AGORA e ANÁLISE) — orquestração.
//
// Só roda com COMPANION_FULL_READING_PANEL=on E VERCEL_ENV=preview. Com a
// flag desligada as rotas nem chamam este módulo: a resposta do painel é
// a de hoje, byte a byte.
//
// A cada pedido do painel:
// 1. usa a última rodada concluída (prompt atual) deste ciclo, se ela
//    estiver fresca;
// 2. a rodada fica velha quando entrou mensagem no ledger depois do
//    reference_time dela, quando o ciclo mudou de etapa depois dela
//    (status ou stage_entered_at) ou quando o vendedor pediu "Atualizar
//    análise" (force_reanalysis);
// 3. velha ou ausente: cria uma rodada e a executa depois da resposta
//    (after). No máximo uma rodada na fila ou rodando por conversa; o
//    polling nunca dispara rodadas em série (uma falha determinística só é
//    repetida se algo mudou desde ela, ou com force);
// 4. rodada na fila/rodando há mais de 5 minutos conta como falha.
//
// Rodada 8: falta de crédito e falhas passageiras (tempo esgotado, rede,
// API indisponível ou limite de uso) não grudam. O painel tenta de novo
// sozinho quando houve uma leitura com sucesso depois da falha (em
// qualquer conversa: prova que a API voltou) ou quando passa a espera (5
// min para crédito, 2 min para falha passageira), no máximo 3 vezes por
// conversa por hora. A espera global de crédito acaba no primeiro sucesso
// depois da última falha de crédito.
//
// Escreve SOMENTE em companion_full_reading_runs. sales_cycles e o
// ledger são só lidos.

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  FULL_READING_RUNS_TABLE,
  executeFullReadingRun,
  resolveFullReadingEffort,
  resolveFullReadingModel,
} from './full-reading-runner'

import {
  FULL_READING_PROMPT_VERSION,
} from '../companion/full-reading/prompt'

import {
  isFullReadingPanelEnabled,
} from './full-reading-flag'

import {
  PROVIDER_CREDIT_EXHAUSTED_CODE,
  isCreditExhaustedMessage,
} from '../companion/full-reading/anthropic-client'

import {
  loadFullReadingCycleChain,
} from './full-reading-cycle-chain'

import {
  RESUME_WORDING,
  buildFullReadingAgoraView,
  buildFullReadingAnalysisView,
  isUsableStoredDecision,
  type FullReadingAgoraView,
  type FullReadingAnalysisView,
  type FullReadingPanelKanban,
  type FullReadingPanelReading,
  type FullReadingPanelState,
  type FullReadingPanelStatusInput,
} from './full-reading-panel-view'

// A constraint de trigger_source só aceita 'manual_preview' e
// 'analysis_job'. 'panel' depende da migração
// 20261001090000_allow_panel_full_reading_trigger.sql, que NÃO foi
// aplicada: até lá, as rodadas do painel gravam 'analysis_job'.
export const FULL_READING_PANEL_TRIGGER_SOURCE =
  'analysis_job'

export const FULL_READING_RUN_EXPIRY_MS =
  5 * 60 * 1000

// "Atualizar análise" chega pelas duas abas (AGORA e ANÁLISE) quase ao
// mesmo tempo: uma rodada criada há menos que isso já atende o pedido.
export const FULL_READING_FORCE_DEBOUNCE_MS =
  60 * 1000

export const RUN_EXPIRED_FAILURE_CODE =
  'RUN_EXPIRED'

export const DUPLICATE_RUN_FAILURE_CODE =
  'DUPLICATE_RUN_DISCARDED'

// A leitura só chama o Claude quando o painel vai mostrá-la: ciclo
// fechado não tem workspace (CLOSED_CYCLE) e conversa sem mensagem no
// ledger não tem o que ler. Nesses casos nenhuma rodada é criada.
export const CLOSED_CYCLE_SKIP_CODE =
  'CLOSED_CYCLE'

export const EMPTY_CONVERSATION_SKIP_CODE =
  'EMPTY_CONVERSATION'

const TERMINAL_CYCLE_STATUSES =
  new Set(['ganho', 'perdido', 'cancelado'])

const RUN_COLUMNS =
  'run_id, cycle_id, status, prompt_version, reference_time, created_at, ' +
  'started_at, completed_at, failure_code, failure_detail, analysis_markdown, decision'

// Sem crédito na API, nenhuma rodada nova por este tempo (em nenhuma
// conversa: o crédito é da chave), a menos que uma leitura dê certo depois
// da falha. "Tentar de novo" sempre tenta.
export const FULL_READING_CREDIT_COOLDOWN_MS =
  5 * 60 * 1000

// Falha passageira: nova tentativa sozinha depois disso.
export const FULL_READING_TRANSIENT_RETRY_MS =
  2 * 60 * 1000

// Tentativas automáticas por conversa por hora.
export const FULL_READING_AUTO_RETRY_LIMIT =
  3

export const FULL_READING_AUTO_RETRY_WINDOW_MS =
  60 * 60 * 1000

// Rodada presa (RUN_EXPIRED) fica fora: uma conversa que sempre estoura o
// tempo repetiria sozinha gastando crédito.
export const FULL_READING_TRANSIENT_FAILURE_CODES =
  new Set([
    'PROVIDER_TIMEOUT',
    'PROVIDER_NETWORK_ERROR',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_RATE_LIMITED',
  ])

export type FullReadingFailureKind =
  | 'credit'
  | 'transient'
  | 'deterministic'

export function classifyRunFailure(
  failureCode: string | null | undefined,
): FullReadingFailureKind {
  if (failureCode === PROVIDER_CREDIT_EXHAUSTED_CODE) {
    return 'credit'
  }

  return failureCode && FULL_READING_TRANSIENT_FAILURE_CODES.has(failureCode)
    ? 'transient'
    : 'deterministic'
}

// Rodadas gravadas antes do código próprio: 400 com o texto da Anthropic.
export function normalizeRunFailureCode(
  failureCode: string | null,
  failureDetail: string | null | undefined,
): string | null {
  if (
    failureCode === 'PROVIDER_REQUEST_REJECTED' &&
    typeof failureDetail === 'string' &&
    isCreditExhaustedMessage(failureDetail)
  ) {
    return PROVIDER_CREDIT_EXHAUSTED_CODE
  }

  return failureCode
}

const RECENT_RUNS_LIMIT =
  20

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type EnvLike =
  Record<string, string | undefined>

// A flag mora num módulo leve (rotas que só precisam dela não carregam a
// leitura inteira); daqui ela continua exportada.
export { isFullReadingPanelEnabled }

export type FullReadingPanelRunRow = {
  run_id: string
  cycle_id: string
  status: string
  prompt_version: string | null
  reference_time: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  failure_code: string | null
  failure_detail?: string | null
  analysis_markdown: string | null
  decision: unknown
}

export type FullReadingPanelPlan = {
  action: 'use' | 'wait' | 'start' | 'show_failure' | 'skip'
  reading: FullReadingPanelRunRow | null
  // Rodada 8: última leitura boa de uma versão anterior do prompt. Só para
  // mostrar enquanto a leitura atual roda ou falhou; nunca conta como
  // leitura fresca.
  fallback_reading?: FullReadingPanelRunRow | null
  active_run: FullReadingPanelRunRow | null
  failed_run: FullReadingPanelRunRow | null
  expired_run_ids: string[]
  stale_reasons: string[]
  skip_reason?: string
  failure_kind?: FullReadingFailureKind | null
  // Quando a falha aconteceu (para o aviso "às HH:MM").
  failure_at?: string | null
  // Quando o painel tenta de novo sozinho (null: não tenta).
  retry_at?: string | null
  // O aviso de crédito só aparece se a falha de crédito não teve nenhum
  // sucesso depois.
  credit_notice?: boolean
  // "Atualizar" caiu na espera de 60 s depois da última rodada.
  force_debounced?: boolean
  force_available_at?: string | null
  // "Atualizar" sem nada novo desde a leitura (rodada 8, B4).
  nothing_new?: boolean
}

function toTime(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null
  }

  const parsed =
    Date.parse(value)

  return Number.isNaN(parsed)
    ? null
    : parsed
}

function isActive(
  run: FullReadingPanelRunRow,
): boolean {
  return run.status === 'queued' || run.status === 'running'
}

// Rodada com leitura que o painel sabe mostrar: v5 grava só a decisão
// (analysis_markdown nulo); v4 e anteriores têm o texto.
export function isUsableReadingRun(
  run: FullReadingPanelRunRow,
): boolean {
  if (
    run.status !== 'succeeded' ||
    !isUsableStoredDecision(run.decision)
  ) {
    return false
  }

  return (
    typeof run.analysis_markdown === 'string' ||
    typeof (run.decision as { mensagem_sugerida?: unknown }).mensagem_sugerida === 'string'
  )
}

// Rodadas de medição (prompt_version "...-eval") nunca aparecem no painel.
function isEvalRun(
  run: FullReadingPanelRunRow,
): boolean {
  return typeof run.prompt_version === 'string' && run.prompt_version.endsWith('-eval')
}

function failedAt(
  run: FullReadingPanelRunRow,
): number | null {
  return toTime(run.completed_at) ?? toTime(run.created_at)
}

function toIso(
  value: number | null,
): string | null {
  return value === null
    ? null
    : new Date(value).toISOString()
}

function readKanbanAtRun(
  run: FullReadingPanelRunRow,
): { status: string | null } | null {
  const decision =
    run.decision as { sistema?: { kanban_lido?: { status?: unknown } } } | null

  const status =
    decision?.sistema?.kanban_lido?.status

  return decision?.sistema?.kanban_lido
    ? { status: typeof status === 'string' ? status : null }
    : null
}

function changedAfter({
  referenceTime,
  latestObservedAt,
  kanban,
}: {
  referenceTime: string
  latestObservedAt: string | null
  kanban: FullReadingPanelKanban
}): string[] {
  const reasons: string[] = []
  const reference =
    toTime(referenceTime)

  const observed =
    toTime(latestObservedAt)

  if (reference !== null && observed !== null && observed > reference) {
    reasons.push('mensagem_nova')
  }

  const stageEntered =
    toTime(kanban.stage_entered_at)

  if (reference !== null && stageEntered !== null && stageEntered > reference) {
    reasons.push('kanban_mudou')
  }

  return reasons
}

// Decide, sem IO, o que o painel faz com as rodadas que existem.
export function planFullReadingPanel({
  runs,
  cycleId,
  kanban,
  latestObservedAt,
  force,
  forceMode = 'always',
  now,
  promptVersion = FULL_READING_PROMPT_VERSION,
  creditExhaustedAt = null,
  lastClaudeSuccessAt = null,
}: {
  runs: FullReadingPanelRunRow[]
  cycleId: string
  kanban: FullReadingPanelKanban
  latestObservedAt: string | null
  force: boolean
  // 'if_changed' (rodada 8, B4): "Atualizar" sem nada novo desde a
  // leitura não relê; o painel diz "Nada novo desde HH:MM".
  forceMode?: 'always' | 'if_changed'
  now: string
  promptVersion?: string
  // Última falha por falta de crédito na API (qualquer conversa).
  creditExhaustedAt?: string | null
  // Última leitura com sucesso (qualquer conversa).
  lastClaudeSuccessAt?: string | null
}): FullReadingPanelPlan {
  const nowTime =
    toTime(now) ?? Date.now()

  const ordered =
    [...runs]
      .filter((run) => !isEvalRun(run))
      .sort(
        (left, right) =>
          (toTime(right.created_at) ?? 0) - (toTime(left.created_at) ?? 0),
      )

  const expired =
    ordered.filter(
      (run) =>
        isActive(run) &&
        nowTime - (toTime(run.started_at ?? run.created_at) ?? nowTime) >
          FULL_READING_RUN_EXPIRY_MS,
    )

  const expiredIds =
    new Set(expired.map((run) => run.run_id))

  // Uma rodada viva por CONVERSA (qualquer ciclo).
  const active =
    ordered.find(
      (run) => isActive(run) && !expiredIds.has(run.run_id),
    ) ?? null

  const withExpiry = (run: FullReadingPanelRunRow) =>
    expiredIds.has(run.run_id)
      ? { ...run, status: 'failed', failure_code: RUN_EXPIRED_FAILURE_CODE }
      : run

  const cycleRuns =
    ordered
      .filter(
        (run) =>
          run.cycle_id === cycleId &&
          run.prompt_version === promptVersion &&
          run.failure_code !== DUPLICATE_RUN_FAILURE_CODE,
      )
      .map(withExpiry)

  const reading =
    cycleRuns.find(isUsableReadingRun) ?? null

  // Sem leitura da versão atual, a última boa de uma versão anterior fica
  // na tela enquanto a nova roda ou se ela falhar.
  const fallbackReading =
    reading
      ? null
      : ordered.find(
          (run) =>
            run.cycle_id === cycleId &&
            run.prompt_version !== promptVersion &&
            isUsableReadingRun(run),
        ) ?? null

  const newestAttempt =
    cycleRuns[0] ?? null

  const debounced =
    force &&
    newestAttempt !== null &&
    nowTime - (toTime(newestAttempt.created_at) ?? 0) <
      FULL_READING_FORCE_DEBOUNCE_MS

  const forced =
    force && !debounced

  const plan = {
    reading,
    fallback_reading: fallbackReading,
    active_run: active,
    failed_run: null as FullReadingPanelRunRow | null,
    expired_run_ids: [...expiredIds],
    force_debounced: debounced,
    force_available_at:
      debounced && newestAttempt
        ? toIso((toTime(newestAttempt.created_at) ?? nowTime) + FULL_READING_FORCE_DEBOUNCE_MS)
        : null,
  }

  if (active) {
    return {
      ...plan,
      action: 'wait',
      stale_reasons: [],
    }
  }

  const staleReasons: string[] = []

  if (!reading) {
    staleReasons.push('sem_leitura')
  } else {
    staleReasons.push(
      ...changedAfter({
        referenceTime: reading.reference_time,
        latestObservedAt,
        kanban,
      }),
    )

    const kanbanAtRun =
      readKanbanAtRun(reading)

    if (
      kanbanAtRun &&
      kanbanAtRun.status !== kanban.status &&
      !staleReasons.includes('kanban_mudou')
    ) {
      staleReasons.push('kanban_mudou')
    }
  }

  // B4: "Atualizar" com a leitura em dia não relê (a mesma entrada pode dar
  // outra leitura, e cada rodada gasta crédito). "Ler de novo mesmo assim"
  // e "Tentar de novo" mandam forceMode 'always'.
  if (
    forced &&
    forceMode === 'if_changed' &&
    reading !== null &&
    newestAttempt === reading &&
    staleReasons.length === 0
  ) {
    return {
      ...plan,
      action: 'use',
      stale_reasons: [],
      nothing_new: true,
    }
  }

  if (forced) {
    staleReasons.push('forcado')
  }

  if (staleReasons.length === 0) {
    return {
      ...plan,
      action: 'use',
      stale_reasons: [],
    }
  }

  const skipReason =
    TERMINAL_CYCLE_STATUSES.has(kanban.status)
      ? CLOSED_CYCLE_SKIP_CODE
      : latestObservedAt === null
        ? EMPTY_CONVERSATION_SKIP_CODE
        : null

  if (skipReason) {
    return {
      ...plan,
      action: 'skip',
      skip_reason: skipReason,
      stale_reasons: staleReasons,
      failure_kind: 'deterministic',
    }
  }

  const successTime =
    toTime(lastClaudeSuccessAt)

  // A tentativa mais recente falhou depois da última leitura boa.
  if (
    newestAttempt &&
    newestAttempt.status === 'failed' &&
    newestAttempt !== reading &&
    !forced
  ) {
    const kind =
      classifyRunFailure(newestAttempt.failure_code)

    const failureTime =
      failedAt(newestAttempt)

    const changed =
      changedAfter({
        referenceTime: newestAttempt.reference_time,
        latestObservedAt,
        kanban,
      }).length > 0

    // Determinística (conversa vazia, saída inválida...): só repete se algo
    // mudou desde ela. Sem isso o polling dispararia uma rodada atrás da
    // outra.
    if (kind === 'deterministic') {
      if (!changed) {
        return {
          ...plan,
          action: 'show_failure',
          failed_run: newestAttempt,
          stale_reasons: staleReasons,
          failure_kind: kind,
          failure_at: toIso(failureTime),
          retry_at: null,
          credit_notice: false,
        }
      }
    } else {
      const successAfter =
        successTime !== null &&
        failureTime !== null &&
        successTime > failureTime

      const waitMs =
        kind === 'credit'
          ? FULL_READING_CREDIT_COOLDOWN_MS
          : FULL_READING_TRANSIENT_RETRY_MS

      const retryTime =
        failureTime === null
          ? null
          : failureTime + waitMs

      const waited =
        retryTime === null ||
        nowTime >= retryTime

      // Falhas que se repetem sozinhas, na conversa, na última hora: a
      // primeira mais até 3 tentativas automáticas.
      const recentRetryableFailures =
        ordered.filter(
          (run) =>
            run.prompt_version === promptVersion &&
            withExpiry(run).status === 'failed' &&
            classifyRunFailure(withExpiry(run).failure_code) !== 'deterministic' &&
            nowTime - (toTime(run.created_at) ?? 0) < FULL_READING_AUTO_RETRY_WINDOW_MS,
        ).length

      const limitReached =
        recentRetryableFailures > FULL_READING_AUTO_RETRY_LIMIT

      if (limitReached || !(successAfter || waited || changed)) {
        return {
          ...plan,
          action: 'show_failure',
          failed_run: newestAttempt,
          stale_reasons: staleReasons,
          failure_kind: kind,
          failure_at: toIso(failureTime),
          retry_at: limitReached ? null : toIso(retryTime),
          credit_notice: kind === 'credit' && !successAfter,
        }
      }

      staleReasons.push('nova_tentativa')
    }
  }

  // Sem crédito na API há pouco e nenhum sucesso depois: nenhuma rodada
  // nova (nem por mensagem nova, nem pelo polling) até a espera passar;
  // "Tentar de novo" tenta.
  const creditTime =
    toTime(creditExhaustedAt)

  if (
    !forced &&
    creditTime !== null &&
    (successTime === null || successTime < creditTime) &&
    nowTime - creditTime < FULL_READING_CREDIT_COOLDOWN_MS
  ) {
    return {
      ...plan,
      action: 'skip',
      skip_reason: PROVIDER_CREDIT_EXHAUSTED_CODE,
      stale_reasons: staleReasons,
      failure_kind: 'credit',
      failure_at: toIso(creditTime),
      retry_at: toIso(creditTime + FULL_READING_CREDIT_COOLDOWN_MS),
      credit_notice: true,
    }
  }

  return {
    ...plan,
    action: 'start',
    stale_reasons: staleReasons,
  }
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

export type FullReadingPanelScope = {
  company_id: string
  cycle_id: string
  conversation_key: string
}

// Mesma normalização do loader do contexto do cliente, que já validou e
// autorizou estes valores antes desta chamada.
export function normalizeFullReadingPanelScope({
  companyId,
  cycleId,
  conversationKey,
}: {
  companyId: unknown
  cycleId: unknown
  conversationKey: unknown
}): FullReadingPanelScope | null {
  const company =
    typeof companyId === 'string' ? companyId.trim().toLowerCase() : ''

  const cycle =
    typeof cycleId === 'string' ? cycleId.trim().toLowerCase() : ''

  const conversation =
    typeof conversationKey === 'string' ? conversationKey.trim() : ''

  if (
    !UUID_PATTERN.test(company) ||
    !UUID_PATTERN.test(cycle) ||
    conversation.length === 0 ||
    conversation.length > 500
  ) {
    return null
  }

  return {
    company_id: company,
    cycle_id: cycle,
    conversation_key: conversation,
  }
}

type CycleRow = {
  status?: unknown
  stage_entered_at?: unknown
  next_action?: unknown
  next_action_date?: unknown
  lost_at?: unknown
  canceled_at?: unknown
  closed_at?: unknown
}

function rowText(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.length > 0
    ? value
    : null
}

function kanbanFromRow(
  row: CycleRow,
): FullReadingPanelKanban | null {
  const status =
    rowText(row.status)

  if (!status) {
    return null
  }

  const closedAt =
    status === 'perdido'
      ? rowText(row.lost_at) ?? rowText(row.closed_at) ?? rowText(row.stage_entered_at)
      : status === 'cancelado'
        ? rowText(row.canceled_at) ?? rowText(row.closed_at) ?? rowText(row.stage_entered_at)
        : rowText(row.closed_at)

  return {
    status,
    stage_entered_at: rowText(row.stage_entered_at),
    next_action: rowText(row.next_action),
    next_action_date: rowText(row.next_action_date),
    closed_at: closedAt,
  }
}

export type FullReadingPanelSnapshot = {
  state: FullReadingPanelState
  plan_action: FullReadingPanelPlan['action']
  stale_reasons: string[]
  reading: FullReadingPanelReading | null
  // Rodada 8: a leitura na tela é de uma versão anterior do prompt
  // (enquanto a atual roda ou depois que ela falhou).
  reading_is_fallback?: boolean
  failure_code: string | null
  failure_kind?: FullReadingFailureKind | null
  failure_at?: string | null
  retry_at?: string | null
  credit_notice?: boolean
  // Desde quando a leitura atual roda (o painel mostra os segundos).
  running_since?: string | null
  force_debounced?: boolean
  force_available_at?: string | null
  // "Atualizar" sem nada novo: a hora da leitura em dia.
  nothing_new_since?: string | null
  kanban: FullReadingPanelKanban
  last_customer_message_at: string | null
  // Última mensagem da conversa (qualquer lado): "Último contato".
  last_message_at?: string | null
  // Oportunidade nova lendo o histórico do ciclo anterior.
  successor?: boolean
  started_run_id: string | null
}

export type FullReadingRunScheduler =
  (task: () => Promise<unknown>) => void

function toReading(
  run: FullReadingPanelRunRow | null,
): FullReadingPanelReading | null {
  if (
    !run ||
    !isUsableReadingRun(run) ||
    !isUsableStoredDecision(run.decision)
  ) {
    return null
  }

  return {
    run_id: run.run_id,
    completed_at: run.completed_at,
    analysis_markdown:
      typeof run.analysis_markdown === 'string'
        ? run.analysis_markdown
        : null,
    decision: run.decision,
  }
}

async function readRuns(
  admin: SupabaseClient,
  scope: FullReadingPanelScope,
): Promise<FullReadingPanelRunRow[]> {
  const { data, error } =
    await admin
      .from(FULL_READING_RUNS_TABLE)
      .select(RUN_COLUMNS)
      .eq('company_id', scope.company_id)
      .eq('conversation_key', scope.conversation_key)
      .order('created_at', { ascending: false })
      .limit(RECENT_RUNS_LIMIT)

  if (error) {
    throw Object.assign(
      new Error('Falha ao ler as rodadas da leitura completa.'),
      { code: 'FULL_READING_RUNS_READ_FAILED' },
    )
  }

  return ((data ?? []) as unknown as FullReadingPanelRunRow[])
    .map((run) => ({
      ...run,
      failure_code: normalizeRunFailureCode(run.failure_code, run.failure_detail),
    }))
}

// Estado global das chamadas ao Claude (qualquer conversa): a última
// leitura com sucesso e a última falha por falta de crédito. Rodada 8: a
// espera de crédito acaba no primeiro sucesso depois da falha.
export type FullReadingGlobalClaudeState = {
  last_success_at: string | null
  last_credit_failure_at: string | null
}

async function readGlobalClaudeState(
  admin: SupabaseClient,
): Promise<FullReadingGlobalClaudeState> {
  const state: FullReadingGlobalClaudeState = {
    last_success_at: null,
    last_credit_failure_at: null,
  }

  try {
    const success =
      await admin
        .from(FULL_READING_RUNS_TABLE)
        .select('created_at, completed_at')
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    const row =
      success.error
        ? null
        : (success.data as { created_at?: unknown; completed_at?: unknown } | null)

    state.last_success_at =
      rowText(row?.completed_at) ?? rowText(row?.created_at)
  } catch {
    // Sem a consulta, nada prova que a API voltou: vale a espera.
  }

  try {
    const credit =
      await admin
        .from(FULL_READING_RUNS_TABLE)
        .select('created_at, completed_at, failure_code, failure_detail')
        .in('failure_code', [PROVIDER_CREDIT_EXHAUSTED_CODE, 'PROVIDER_REQUEST_REJECTED'])
        .order('created_at', { ascending: false })
        .limit(5)

    const rows =
      !credit.error && Array.isArray(credit.data)
        ? (credit.data as {
            created_at?: unknown
            completed_at?: unknown
            failure_code?: unknown
            failure_detail?: unknown
          }[])
        : []

    const hit =
      rows.find((row) =>
        normalizeRunFailureCode(
          typeof row.failure_code === 'string' ? row.failure_code : null,
          typeof row.failure_detail === 'string' ? row.failure_detail : null,
        ) === PROVIDER_CREDIT_EXHAUSTED_CODE,
      )

    state.last_credit_failure_at =
      rowText(hit?.completed_at) ?? rowText(hit?.created_at)
  } catch {
    // Sem a consulta, o painel segue (a rodada tenta).
  }

  return state
}

// cycleIds: o ciclo e, numa oportunidade nova, os ciclos de origem (a
// mesma conversa continua gravada no ciclo fechado).
async function readLatestTimestamp(
  admin: SupabaseClient,
  scope: FullReadingPanelScope,
  column: 'observed_at' | 'occurred_at',
  incomingOnly: boolean,
  cycleIds: string[] = [scope.cycle_id],
): Promise<string | null> {
  let query =
    admin
      .from('conversation_messages')
      .select(column)
      .eq('company_id', scope.company_id)
      .in('cycle_id', cycleIds)
      .eq('conversation_key', scope.conversation_key)

  if (incomingOnly) {
    query =
      query.eq('direction', 'incoming')
  }

  const { data, error } =
    await query
      .order(column, { ascending: false })
      .limit(1)
      .maybeSingle()

  if (error) {
    throw Object.assign(
      new Error('Falha ao ler o ledger da conversa.'),
      { code: 'FULL_READING_LEDGER_READ_FAILED' },
    )
  }

  return rowText((data as Record<string, unknown> | null)?.[column])
}

async function expireRuns(
  admin: SupabaseClient,
  runIds: string[],
  now: string,
): Promise<void> {
  for (const runId of runIds) {
    await admin
      .from(FULL_READING_RUNS_TABLE)
      .update({
        status: 'failed',
        failure_code: RUN_EXPIRED_FAILURE_CODE,
        failure_detail: 'A rodada ficou mais de 5 minutos sem terminar.',
        completed_at: now,
      })
      .eq('run_id', runId)
      .in('status', ['queued', 'running'])
  }
}

// Cria a rodada e garante uma só por conversa: depois de inserir, relê as
// rodadas vivas; se outra (mais antiga) já existe, esta é descartada sem
// executar. Duas requisições simultâneas veem as mesmas linhas e elegem a
// mesma vencedora (created_at, depois run_id).
async function startRun({
  admin,
  scope,
  now,
  apiKey,
  schedule,
  createRunId,
  env,
  route,
}: {
  admin: SupabaseClient
  scope: FullReadingPanelScope
  now: string
  apiKey: string
  schedule: FullReadingRunScheduler
  createRunId: () => string
  env: EnvLike
  route?: string
}): Promise<{ run_id: string | null; failure_code: string | null }> {
  const runId =
    createRunId()

  const model =
    resolveFullReadingModel(env)

  const effort =
    resolveFullReadingEffort(env)

  const { error: insertError } =
    await admin
      .from(FULL_READING_RUNS_TABLE)
      .insert({
        run_id: runId,
        company_id: scope.company_id,
        cycle_id: scope.cycle_id,
        conversation_key: scope.conversation_key,
        reference_time: now,
        trigger_source: FULL_READING_PANEL_TRIGGER_SOURCE,
        vercel_env: env.VERCEL_ENV ?? null,
        deployment_sha: env.VERCEL_GIT_COMMIT_SHA ?? null,
        prompt_version: FULL_READING_PROMPT_VERSION,
        model,
        effort,
        status: 'queued',
      })

  if (insertError) {
    return {
      run_id: null,
      failure_code: 'RUN_INSERT_FAILED',
    }
  }

  const { data: liveRows } =
    await admin
      .from(FULL_READING_RUNS_TABLE)
      .select('run_id, created_at')
      .eq('company_id', scope.company_id)
      .eq('conversation_key', scope.conversation_key)
      .in('status', ['queued', 'running'])

  const live =
    ((liveRows ?? []) as { run_id: string; created_at: string }[])
      .filter(
        (row) =>
          Date.parse(now) - (toTime(row.created_at) ?? 0) <=
          FULL_READING_RUN_EXPIRY_MS,
      )
      .sort(
        (left, right) =>
          (toTime(left.created_at) ?? 0) - (toTime(right.created_at) ?? 0) ||
          left.run_id.localeCompare(right.run_id),
      )

  const winner =
    live[0]?.run_id ?? runId

  if (winner !== runId) {
    await admin
      .from(FULL_READING_RUNS_TABLE)
      .update({
        status: 'failed',
        failure_code: DUPLICATE_RUN_FAILURE_CODE,
        failure_detail: 'Já havia uma rodada em andamento para esta conversa.',
        completed_at: now,
      })
      .eq('run_id', runId)
      .eq('status', 'queued')

    return {
      run_id: winner,
      failure_code: null,
    }
  }

  schedule(async () => {
    await executeFullReadingRun({
      admin,
      runId,
      companyId: scope.company_id,
      cycleId: scope.cycle_id,
      conversationKey: scope.conversation_key,
      referenceTime: now,
      model,
      effort,
      apiKey,
      triggerRoute: route,
    })
  })

  return {
    run_id: runId,
    failure_code: null,
  }
}

export async function resolveFullReadingPanel({
  admin,
  scope,
  force,
  forceMode = 'always',
  now,
  apiKey,
  schedule,
  createRunId,
  env = process.env,
  route,
}: {
  admin: SupabaseClient
  scope: FullReadingPanelScope
  force: boolean
  forceMode?: 'always' | 'if_changed'
  now: string
  apiKey: string
  schedule: FullReadingRunScheduler
  createRunId: () => string
  env?: EnvLike
  route?: string
}): Promise<FullReadingPanelSnapshot | null> {
  const { data: cycleRow, error: cycleError } =
    await admin
      .from('sales_cycles')
      .select('status, stage_entered_at, next_action, next_action_date, lost_at, canceled_at, closed_at')
      .eq('id', scope.cycle_id)
      .eq('company_id', scope.company_id)
      .maybeSingle()

  const kanban =
    !cycleError && cycleRow
      ? kanbanFromRow(cycleRow as CycleRow)
      : null

  if (!kanban) {
    return null
  }

  const chain =
    await loadFullReadingCycleChain({
      admin,
      companyId: scope.company_id,
      cycleId: scope.cycle_id,
    })

  const chainCycleIds =
    chain.length > 0
      ? chain.map((link) => link.id)
      : [scope.cycle_id]

  const [runs, latestObservedAt, lastMessageAt] =
    await Promise.all([
      readRuns(admin, scope),
      readLatestTimestamp(admin, scope, 'observed_at', false, chainCycleIds),
      readLatestTimestamp(admin, scope, 'occurred_at', false, chainCycleIds),
    ])

  const lastCustomerMessageAt =
    kanban.status === 'perdido' || kanban.status === 'cancelado'
      ? await readLatestTimestamp(admin, scope, 'occurred_at', true, chainCycleIds)
      : null

  const planInput = {
    runs,
    cycleId: scope.cycle_id,
    kanban,
    latestObservedAt,
    force,
    forceMode,
    now,
  }

  // O estado global do Claude só é lido quando uma rodada poderia começar
  // ou quando a falha mostrada pode ter sido resolvida em outra conversa.
  const draftPlan =
    planFullReadingPanel(planInput)

  let plan =
    draftPlan

  if (
    draftPlan.action === 'start' ||
    (draftPlan.action === 'show_failure' && draftPlan.failure_kind !== 'deterministic')
  ) {
    const global =
      await readGlobalClaudeState(admin)

    plan =
      planFullReadingPanel({
        ...planInput,
        creditExhaustedAt: global.last_credit_failure_at,
        lastClaudeSuccessAt: global.last_success_at,
      })
  }

  if (plan.expired_run_ids.length > 0) {
    await expireRuns(admin, plan.expired_run_ids, now)
  }

  // Leitura da versão atual; sem ela, a última boa de uma versão anterior
  // (só para mostrar).
  const currentReading =
    toReading(plan.reading)

  const shownReading =
    currentReading ?? toReading(plan.fallback_reading ?? null)

  const base = {
    plan_action: plan.action,
    stale_reasons: plan.stale_reasons,
    kanban,
    last_customer_message_at: lastCustomerMessageAt,
    last_message_at: lastMessageAt,
    successor: chain.length > 1,
    reading_is_fallback: currentReading === null && shownReading !== null,
    force_debounced: plan.force_debounced === true,
    force_available_at: plan.force_available_at ?? null,
  }

  const failureFields = {
    failure_kind: plan.failure_kind ?? null,
    failure_at: plan.failure_at ?? null,
    retry_at: plan.retry_at ?? null,
    credit_notice: plan.credit_notice === true,
  }

  if (plan.action === 'use') {
    return {
      ...base,
      state: 'ready',
      reading: currentReading,
      reading_is_fallback: false,
      failure_code: null,
      started_run_id: null,
      nothing_new_since:
        plan.nothing_new === true
          ? plan.reading?.reference_time ?? null
          : null,
    }
  }

  if (plan.action === 'wait') {
    return {
      ...base,
      state: 'running',
      reading: shownReading,
      failure_code: null,
      started_run_id: null,
      running_since:
        plan.active_run?.started_at ?? plan.active_run?.created_at ?? null,
    }
  }

  if (plan.action === 'show_failure') {
    return {
      ...base,
      ...failureFields,
      state: 'failed',
      reading: shownReading,
      failure_code: plan.failed_run?.failure_code ?? 'FULL_READING_FAILED',
      started_run_id: null,
    }
  }

  if (plan.action === 'skip') {
    return {
      ...base,
      ...failureFields,
      state: 'failed',
      reading: shownReading,
      failure_code: plan.skip_reason ?? EMPTY_CONVERSATION_SKIP_CODE,
      started_run_id: null,
    }
  }

  if (!apiKey) {
    return {
      ...base,
      state: 'failed',
      reading: shownReading,
      failure_code: 'ANTHROPIC_API_KEY_MISSING',
      failure_kind: 'deterministic',
      failure_at: now,
      started_run_id: null,
    }
  }

  const started =
    await startRun({
      admin,
      scope,
      now,
      apiKey,
      schedule,
      createRunId,
      env,
      route,
    })

  if (!started.run_id) {
    return {
      ...base,
      state: 'failed',
      reading: shownReading,
      failure_code: started.failure_code,
      failure_kind: 'transient',
      failure_at: now,
      started_run_id: null,
    }
  }

  return {
    ...base,
    state: 'running',
    reading: shownReading,
    failure_code: null,
    started_run_id: started.run_id,
    running_since: now,
  }
}

export function buildAgoraFullReadingView(
  snapshot: FullReadingPanelSnapshot,
  {
    cycleId,
  }: {
    cycleId: string
    referenceTime?: string
  },
): FullReadingAgoraView {
  return buildFullReadingAgoraView({
    state: snapshot.state,
    reading: snapshot.reading,
    failureCode: snapshot.failure_code,
    kanban: snapshot.kanban,
    cycleId,
    lastCustomerMessageAt: snapshot.last_customer_message_at,
    lastMessageAt: snapshot.last_message_at ?? null,
    panel: panelStatusInput(snapshot),
  })
}

function panelStatusInput(
  snapshot: FullReadingPanelSnapshot,
): FullReadingPanelStatusInput {
  return {
    failure_kind: snapshot.failure_kind ?? null,
    failure_at: snapshot.failure_at ?? null,
    retry_at: snapshot.retry_at ?? null,
    credit_notice: snapshot.credit_notice === true,
    running_since: snapshot.running_since ?? null,
    reading_is_fallback: snapshot.reading_is_fallback === true,
    force_debounced: snapshot.force_debounced === true,
    force_available_at: snapshot.force_available_at ?? null,
    nothing_new_since: snapshot.nothing_new_since ?? null,
  }
}

export function buildAnalysisFullReadingView(
  snapshot: FullReadingPanelSnapshot,
): FullReadingAnalysisView {
  return buildFullReadingAnalysisView({
    state: snapshot.state,
    reading: snapshot.reading,
    failureCode: snapshot.failure_code,
    kanban: snapshot.kanban,
    lastMessageAt: snapshot.last_message_at ?? null,
    panel: panelStatusInput(snapshot),
  })
}

type AgoraSignalLike = {
  status: string
  headline?: string | null
  action?: string | null
  provenance: { source: string | null }
}

function resumesSale(
  signal: AgoraSignalLike,
): boolean {
  return (
    signal.status === 'follow_up' ||
    RESUME_WORDING.test(`${signal.headline ?? ''} ${signal.action ?? ''}`)
  )
}

// AGORA com a leitura completa: o card de SLA da etapa ("oportunidade
// estagnada", origem client_sla) sai quando a leitura diz que o kanban
// está atrasado ou quando o ciclo está fechado. As travas do kanban valem
// também para o AGORA de hoje, que continua aparecendo em falha ou
// enquanto a primeira leitura roda. O resto do payload de hoje continua
// igual (CLIENTE e MENSAGEM não mudam).
export function attachFullReadingToAgora<
  T extends {
    silent: boolean
    silent_reason: string | null
    primary: AgoraSignalLike | null
    secondary: AgoraSignalLike[]
  },
>(
  base: T,
  view: FullReadingAgoraView,
): T & { full_reading: FullReadingAgoraView } {
  const keep = (signal: AgoraSignalLike) =>
    !(view.hide_stage_sla && signal.provenance.source === 'client_sla') &&
    !(view.legacy_lock === 'ganho' && resumesSale(signal)) &&
    view.legacy_lock !== 'encerrado'

  const primary =
    base.primary && keep(base.primary)
      ? base.primary
      : null

  const secondary =
    base.secondary.filter(keep)

  const silent =
    base.silent ||
    (primary === null && secondary.length === 0)

  return {
    ...base,
    primary,
    secondary,
    silent,
    silent_reason:
      silent && !base.silent
        ? 'nothing_to_do'
        : base.silent_reason,
    full_reading: view,
  }
}

export function attachFullReadingToAnalysis<T extends object>(
  base: T,
  view: FullReadingAnalysisView,
): T & { full_reading: FullReadingAnalysisView } {
  return {
    ...base,
    full_reading: view,
  }
}

// ---------------------------------------------------------------------------
// Entrada única das rotas do painel
// ---------------------------------------------------------------------------

function logPanelEvent(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.info(
    'YOLEN_FULL_READING_PANEL',
    JSON.stringify({
      event,
      ...fields,
    }),
  )
}

// Chamada pelas rotas DEPOIS que o loader de hoje já validou a sessão e o
// acesso ao ciclo/conversa. Devolve null com a flag desligada (a rota
// responde exatamente como hoje) ou se o painel não conseguir ler o
// próprio estado — nunca derruba o AGORA/ANÁLISE de hoje.
export async function loadFullReadingPanelForRequest({
  admin,
  companyId,
  cycleId,
  conversationKey,
  force,
  forceMode,
  referenceTime,
  schedule,
  createRunId,
  env = process.env,
  route,
}: {
  admin: SupabaseClient
  companyId: unknown
  cycleId: unknown
  conversationKey: unknown
  force: unknown
  // "if_changed" (Atualizar com a leitura em dia não relê); qualquer outro
  // valor relê.
  forceMode?: unknown
  referenceTime: string
  schedule: FullReadingRunScheduler
  createRunId: () => string
  env?: EnvLike
  // Rota que pediu o painel (log de tokens da rodada).
  route?: string
}): Promise<{
  snapshot: FullReadingPanelSnapshot
  scope: FullReadingPanelScope
} | null> {
  if (!isFullReadingPanelEnabled(env)) {
    return null
  }

  const scope =
    normalizeFullReadingPanelScope({
      companyId,
      cycleId,
      conversationKey,
    })

  if (!scope) {
    return null
  }

  try {
    const snapshot =
      await resolveFullReadingPanel({
        admin,
        scope,
        force: force === true,
        forceMode: forceMode === 'if_changed' ? 'if_changed' : 'always',
        now: referenceTime,
        apiKey: env.ANTHROPIC_API_KEY ?? '',
        schedule,
        createRunId,
        env,
        route,
      })

    if (snapshot?.started_run_id) {
      logPanelEvent('run_started', {
        run_id: snapshot.started_run_id,
        reasons: snapshot.stale_reasons,
      })
    }

    return snapshot
      ? { snapshot, scope }
      : null
  } catch (error) {
    logPanelEvent('panel_unavailable', {
      failure:
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'FULL_READING_PANEL_ERROR',
    })

    return null
  }
}
