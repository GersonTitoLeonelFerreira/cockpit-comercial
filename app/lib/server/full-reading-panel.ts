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
//    polling nunca dispara rodadas em série (uma falha só é repetida se
//    algo mudou desde ela, ou com force);
// 4. rodada na fila/rodando há mais de 5 minutos conta como falha.
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
  RESUME_WORDING,
  buildFullReadingAgoraView,
  buildFullReadingAnalysisView,
  isUsableStoredDecision,
  type FullReadingAgoraView,
  type FullReadingAnalysisView,
  type FullReadingPanelKanban,
  type FullReadingPanelReading,
  type FullReadingPanelState,
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

const RUN_COLUMNS =
  'run_id, cycle_id, status, prompt_version, reference_time, created_at, ' +
  'started_at, completed_at, failure_code, analysis_markdown, decision'

const RECENT_RUNS_LIMIT =
  20

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type EnvLike =
  Record<string, string | undefined>

export function isFullReadingPanelEnabled(
  env: EnvLike = process.env,
): boolean {
  return (
    env.COMPANION_FULL_READING_PANEL === 'on' &&
    env.VERCEL_ENV === 'preview'
  )
}

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
  analysis_markdown: string | null
  decision: unknown
}

export type FullReadingPanelPlan = {
  action: 'use' | 'wait' | 'start' | 'show_failure'
  reading: FullReadingPanelRunRow | null
  active_run: FullReadingPanelRunRow | null
  failed_run: FullReadingPanelRunRow | null
  expired_run_ids: string[]
  stale_reasons: string[]
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
  now,
  promptVersion = FULL_READING_PROMPT_VERSION,
}: {
  runs: FullReadingPanelRunRow[]
  cycleId: string
  kanban: FullReadingPanelKanban
  latestObservedAt: string | null
  force: boolean
  now: string
  promptVersion?: string
}): FullReadingPanelPlan {
  const nowTime =
    toTime(now) ?? Date.now()

  const ordered =
    [...runs].sort(
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

  const cycleRuns =
    ordered
      .filter(
        (run) =>
          run.cycle_id === cycleId &&
          run.prompt_version === promptVersion &&
          run.failure_code !== DUPLICATE_RUN_FAILURE_CODE,
      )
      .map((run) =>
        expiredIds.has(run.run_id)
          ? { ...run, status: 'failed', failure_code: RUN_EXPIRED_FAILURE_CODE }
          : run,
      )

  const reading =
    cycleRuns.find(
      (run) =>
        run.status === 'succeeded' &&
        typeof run.analysis_markdown === 'string' &&
        isUsableStoredDecision(run.decision),
    ) ?? null

  const plan = {
    reading,
    active_run: active,
    failed_run: null as FullReadingPanelRunRow | null,
    expired_run_ids: [...expiredIds],
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

  const newestAttempt =
    cycleRuns[0] ?? null

  const forced =
    force &&
    !(
      newestAttempt &&
      nowTime - (toTime(newestAttempt.created_at) ?? 0) <
        FULL_READING_FORCE_DEBOUNCE_MS
    )

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

  // A tentativa mais recente falhou depois da última leitura boa: só
  // tenta de novo se algo mudou desde a falha (ou com force). Sem isso o
  // polling do painel dispararia uma rodada atrás da outra.
  if (
    newestAttempt &&
    newestAttempt.status === 'failed' &&
    newestAttempt !== reading &&
    !forced &&
    changedAfter({
      referenceTime: newestAttempt.reference_time,
      latestObservedAt,
      kanban,
    }).length === 0
  ) {
    return {
      ...plan,
      action: 'show_failure',
      failed_run: newestAttempt,
      stale_reasons: staleReasons,
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
  failure_code: string | null
  kanban: FullReadingPanelKanban
  last_customer_message_at: string | null
  started_run_id: string | null
}

export type FullReadingRunScheduler =
  (task: () => Promise<unknown>) => void

function toReading(
  run: FullReadingPanelRunRow | null,
): FullReadingPanelReading | null {
  if (
    !run ||
    typeof run.analysis_markdown !== 'string' ||
    !isUsableStoredDecision(run.decision)
  ) {
    return null
  }

  return {
    run_id: run.run_id,
    completed_at: run.completed_at,
    analysis_markdown: run.analysis_markdown,
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

  return (data ?? []) as unknown as FullReadingPanelRunRow[]
}

async function readLatestTimestamp(
  admin: SupabaseClient,
  scope: FullReadingPanelScope,
  column: 'observed_at' | 'occurred_at',
  incomingOnly: boolean,
): Promise<string | null> {
  let query =
    admin
      .from('conversation_messages')
      .select(column)
      .eq('company_id', scope.company_id)
      .eq('cycle_id', scope.cycle_id)
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
}: {
  admin: SupabaseClient
  scope: FullReadingPanelScope
  now: string
  apiKey: string
  schedule: FullReadingRunScheduler
  createRunId: () => string
  env: EnvLike
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
  now,
  apiKey,
  schedule,
  createRunId,
  env = process.env,
}: {
  admin: SupabaseClient
  scope: FullReadingPanelScope
  force: boolean
  now: string
  apiKey: string
  schedule: FullReadingRunScheduler
  createRunId: () => string
  env?: EnvLike
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

  const [runs, latestObservedAt] =
    await Promise.all([
      readRuns(admin, scope),
      readLatestTimestamp(admin, scope, 'observed_at', false),
    ])

  const lastCustomerMessageAt =
    kanban.status === 'perdido' || kanban.status === 'cancelado'
      ? await readLatestTimestamp(admin, scope, 'occurred_at', true)
      : null

  const plan =
    planFullReadingPanel({
      runs,
      cycleId: scope.cycle_id,
      kanban,
      latestObservedAt,
      force,
      now,
    })

  if (plan.expired_run_ids.length > 0) {
    await expireRuns(admin, plan.expired_run_ids, now)
  }

  const base = {
    plan_action: plan.action,
    stale_reasons: plan.stale_reasons,
    kanban,
    last_customer_message_at: lastCustomerMessageAt,
  }

  if (plan.action === 'use') {
    return {
      ...base,
      state: 'ready',
      reading: toReading(plan.reading),
      failure_code: null,
      started_run_id: null,
    }
  }

  if (plan.action === 'wait') {
    return {
      ...base,
      state: 'running',
      reading: toReading(plan.reading),
      failure_code: null,
      started_run_id: null,
    }
  }

  if (plan.action === 'show_failure') {
    return {
      ...base,
      state: 'failed',
      reading: toReading(plan.reading),
      failure_code: plan.failed_run?.failure_code ?? 'FULL_READING_FAILED',
      started_run_id: null,
    }
  }

  if (!apiKey) {
    return {
      ...base,
      state: 'failed',
      reading: toReading(plan.reading),
      failure_code: 'ANTHROPIC_API_KEY_MISSING',
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
    })

  if (!started.run_id) {
    return {
      ...base,
      state: 'failed',
      reading: toReading(plan.reading),
      failure_code: started.failure_code,
      started_run_id: null,
    }
  }

  return {
    ...base,
    state: 'running',
    reading: toReading(plan.reading),
    failure_code: null,
    started_run_id: started.run_id,
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
  })
}

export function buildAnalysisFullReadingView(
  snapshot: FullReadingPanelSnapshot,
): FullReadingAnalysisView {
  return buildFullReadingAnalysisView({
    state: snapshot.state,
    reading: snapshot.reading,
    failureCode: snapshot.failure_code,
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
  referenceTime,
  schedule,
  createRunId,
  env = process.env,
}: {
  admin: SupabaseClient
  companyId: unknown
  cycleId: unknown
  conversationKey: unknown
  force: unknown
  referenceTime: string
  schedule: FullReadingRunScheduler
  createRunId: () => string
  env?: EnvLike
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
        now: referenceTime,
        apiKey: env.ANTHROPIC_API_KEY ?? '',
        schedule,
        createRunId,
        env,
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
