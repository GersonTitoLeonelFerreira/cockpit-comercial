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
// Rodada 9 (custo): só mensagem real do cliente deixa a leitura velha
// (evento do ManyChat e mensagem do próprio vendedor ou do robô não); com
// uma leitura na tela, uma rajada do cliente espera 20 s sem mensagem nova;
// a leitura relê uma vez quando passa o horário em que o próximo passo
// muda (revisar_em); há um teto diário de leituras por empresa; e a próxima
// leitura é de continuação (o executor decide) a menos que o vendedor peça
// "Ler a conversa inteira".
//
// Rodada 9 (Fase 3): ciclo em ganho, perdido ou cancelado é lido como
// atendimento quando o cliente escreveu depois do encerramento (só as
// mensagens posteriores deixam a leitura velha; sem elas, como antes); e,
// enquanto a extensão transcreve um áudio desta conversa (até 60 s), nenhuma
// leitura nova começa. Áudio que ganhou transcrição também deixa a leitura
// velha (a leitura roda uma vez, já com o texto).
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
  FULL_READING_COMPATIBLE_PROMPT_VERSIONS,
  FULL_READING_PROMPT_VERSION,
} from '../companion/full-reading/prompt'

import {
  isFullReadingPanelEnabled,
} from './full-reading-flag'

import {
  closedAtFromCycleRow,
} from './full-reading-closed-cycle'

import {
  ATTACHMENT_IN_PROGRESS_MS,
  IMAGE_LOW_RESOLUTION_FAILURE,
  countAttachmentSummariesSince,
  isLowResolutionImage,
  loadConversationAttachments,
  type AttachmentStatus,
} from './full-reading-attachments'

import {
  attachmentsViewKey,
  buildAttachmentSuggestionView,
  buildAttachmentsView,
} from './full-reading-attachments-view'

import {
  attachmentRef,
  parseAttachmentMarker,
  type AttachmentKind,
  type ParsedAttachment,
} from '../companion/full-reading/attachments'

import {
  PROVIDER_CREDIT_EXHAUSTED_CODE,
  isCreditExhaustedMessage,
} from '../companion/full-reading/anthropic-client'

import {
  loadFullReadingCycleChain,
} from './full-reading-cycle-chain'

import {
  classifyLedgerEvent,
  isCompanyPersonMessage,
  isCustomerMessage,
} from '../companion/full-reading/conversation-events'

import type {
  FullReadingFullReason,
} from '../companion/full-reading/continuation'

import {
  customerWroteAfterClosure,
} from './full-reading-panel-view'

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

// Rodada 9 (D4): teto diário de leituras por empresa.
export const DAILY_CAP_SKIP_CODE =
  'DAILY_CAP_REACHED'

export const FULL_READING_DEFAULT_DAILY_CAP =
  100

// Rodada 9 (D1): rajada do cliente com uma leitura na tela.
export const FULL_READING_BURST_QUIET_MS =
  20 * 1000

// Falhas que acontecem antes de chamar o Claude: não contam no teto.
export const FULL_READING_NO_CALL_FAILURE_CODES =
  new Set([
    'DUPLICATE_RUN_DISCARDED',
    'EMPTY_CONVERSATION',
    'RUN_INSERT_FAILED',
    'ANTHROPIC_API_KEY_MISSING',
    'KANBAN_READ_FAILED',
    'FULL_READING_LEDGER_READ_FAILED',
  ])

export function resolveFullReadingDailyCap(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw =
    Number.parseInt(env.COMPANION_FULL_READING_DAILY_CAP?.trim() ?? '', 10)

  return Number.isFinite(raw) && raw >= 0
    ? raw
    : FULL_READING_DEFAULT_DAILY_CAP
}

// Começo do dia de hoje no horário de Brasília (UTC-3, sem horário de
// verão), em ISO.
export function startOfBrasiliaDay(
  now: string,
): string {
  const time =
    Date.parse(now)

  const local =
    new Date((Number.isNaN(time) ? Date.now() : time) - 3 * 60 * 60 * 1000)

  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
      3 * 60 * 60 * 1000,
  ).toISOString()
}

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

// Rodada 9 (I3): progresso da transcrição automática na extensão.
export type FullReadingAudioHold = {
  current: number
  total: number
}

const AUDIO_HOLD_MAX =
  20

export function normalizeAudioHold(
  value: unknown,
): FullReadingAudioHold | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record =
    value as { current?: unknown; total?: unknown }

  const current =
    typeof record.current === 'number' ? Math.trunc(record.current) : Number.NaN

  const total =
    typeof record.total === 'number' ? Math.trunc(record.total) : Number.NaN

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(total) ||
    total < 1 ||
    total > AUDIO_HOLD_MAX ||
    current < 1 ||
    current > total
  ) {
    return null
  }

  return { current, total }
}

export type FullReadingPanelPlan = {
  // 'hold' (rodada 9): a extensão está transcrevendo áudio desta conversa.
  action: 'use' | 'wait' | 'start' | 'show_failure' | 'skip' | 'hold'
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
  // Rodada 9 (D1): mensagem nova do cliente esperando 20 s de silêncio.
  pending_update_at?: string | null
  // Rodada 9 (G): horário em que o próximo passo muda já passou.
  review_due?: { at: string; motivo: string } | null
  // Rodada 9 (E2): gatilhos de leitura completa decididos aqui.
  full_reasons?: FullReadingFullReason[]
  audio_hold?: FullReadingAudioHold | null
  // Rodada 9 (J): ciclo encerrado lido como atendimento.
  closed_service?: string | null
}

// Pedido gravado na rodada enquanto ela roda (a decisão completa substitui
// quando ela termina).
export type FullReadingRunRequest = {
  motivo: string[]
  modo: 'auto' | 'completa'
  leitura_base: string | null
  revisao: { at: string; motivo: string } | null
}

export function readRunRequest(
  run: FullReadingPanelRunRow | null | undefined,
): FullReadingRunRequest | null {
  const decision =
    run?.decision as { pedido?: unknown } | null | undefined

  const request =
    decision?.pedido

  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return null
  }

  const record =
    request as Record<string, unknown>

  const revisao =
    record.revisao && typeof record.revisao === 'object'
      ? record.revisao as { at?: unknown; motivo?: unknown }
      : null

  return {
    motivo: Array.isArray(record.motivo)
      ? record.motivo.filter((item): item is string => typeof item === 'string')
      : [],
    modo: record.modo === 'completa' ? 'completa' : 'auto',
    leitura_base: typeof record.leitura_base === 'string' ? record.leitura_base : null,
    revisao:
      revisao && typeof revisao.at === 'string'
        ? { at: revisao.at, motivo: typeof revisao.motivo === 'string' ? revisao.motivo : '' }
        : null,
  }
}

function readReviewAt(
  run: FullReadingPanelRunRow,
): { at: string; time: number; motivo: string } | null {
  const decision =
    run.decision as { revisar_em?: unknown; revisar_motivo?: unknown } | null

  const at =
    typeof decision?.revisar_em === 'string' ? decision.revisar_em : ''

  const time =
    toTime(at)

  if (time === null) {
    return null
  }

  return {
    at,
    time,
    motivo: typeof decision?.revisar_motivo === 'string' ? decision.revisar_motivo.trim() : '',
  }
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
  // Última mensagem que deixa a leitura velha (rodada 9: só mensagem real
  // do cliente).
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
  latestCustomerObservedAt,
  latestCustomerOccurredAt = null,
  latestTranscriptionObservedAt = null,
  latestAttachmentIncludedAt = null,
  audioHold = null,
  burstQuietMs = FULL_READING_BURST_QUIET_MS,
}: {
  runs: FullReadingPanelRunRow[]
  cycleId: string
  kanban: FullReadingPanelKanban
  // Última mensagem real da conversa (conversa vazia sem ela).
  latestObservedAt: string | null
  // Rodada 9: última mensagem real do cliente (o que deixa a leitura
  // velha). Sem o valor, vale latestObservedAt (comportamento anterior).
  latestCustomerObservedAt?: string | null
  // Rodada 9 (J): hora da última mensagem real do cliente (ciclo
  // encerrado: só depois do encerramento conta).
  latestCustomerOccurredAt?: string | null
  // Rodada 9 (I): última transcrição de áudio que entrou no ledger.
  latestTranscriptionObservedAt?: string | null
  // Rodada 11: o vendedor incluiu um arquivo depois da leitura.
  latestAttachmentIncludedAt?: string | null
  audioHold?: FullReadingAudioHold | null
  burstQuietMs?: number
  force: boolean
  // 'if_changed' (rodada 8, B4): "Atualizar" sem nada novo desde a
  // leitura não relê; o painel diz "Nada novo desde HH:MM". 'full'
  // (rodada 9, E2): "Ler a conversa inteira".
  forceMode?: 'always' | 'if_changed' | 'full'
  now: string
  promptVersion?: string
  // Última falha por falta de crédito na API (qualquer conversa).
  creditExhaustedAt?: string | null
  // Última leitura com sucesso (qualquer conversa).
  lastClaudeSuccessAt?: string | null
}): FullReadingPanelPlan {
  const nowTime =
    toTime(now) ?? Date.now()

  // D5 (rodada 10): leitura de versão compatível (mesmo formato da
  // decisão) continua valendo; a troca de versão não força releitura.
  const compatibleVersions =
    new Set(
      promptVersion === FULL_READING_PROMPT_VERSION
        ? FULL_READING_COMPATIBLE_PROMPT_VERSIONS
        : [promptVersion],
    )

  // J: ciclo encerrado só é lido quando o cliente escreveu depois do
  // encerramento; aí só mensagem deixa a leitura velha.
  const closedCycle =
    TERMINAL_CYCLE_STATUSES.has(kanban.status)

  const closedService =
    closedCycle &&
    customerWroteAfterClosure({
      closedAt: kanban.closed_at ?? null,
      lastCustomerMessageAt: latestCustomerOccurredAt,
    })

  const messageObservedAt =
    latestCustomerObservedAt === undefined
      ? latestObservedAt
      : latestCustomerObservedAt

  // I: áudio que ganhou transcrição também deixa a leitura velha.
  const staleObservedAt =
    toTime(latestTranscriptionObservedAt) !== null &&
    (toTime(messageObservedAt) ?? 0) < (toTime(latestTranscriptionObservedAt) ?? 0)
      ? latestTranscriptionObservedAt
      : messageObservedAt

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
          compatibleVersions.has(run.prompt_version ?? '') &&
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
            !compatibleVersions.has(run.prompt_version ?? '') &&
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
    // Rodada 10 (A2): a etapa aplicada é a que a leitura sugeriu (pelo
    // painel ou pelo Yolen): a leitura continua valendo e não relê.
    const suggestedStage =
      (reading.decision as { etapa_kanban_sugerida?: unknown } | null)?.etapa_kanban_sugerida

    // Ciclo encerrado segue a regra do J (só mensagem do cliente depois do
    // encerramento relê).
    const appliedSuggestion =
      !closedCycle &&
      typeof suggestedStage === 'string' &&
      suggestedStage === kanban.status

    staleReasons.push(
      ...changedAfter({
        referenceTime: reading.reference_time,
        latestObservedAt: staleObservedAt,
        kanban,
      }).filter((reason) =>
        !((closedService || appliedSuggestion) && reason === 'kanban_mudou')),
    )

    const kanbanAtRun =
      readKanbanAtRun(reading)

    if (
      !closedService &&
      !appliedSuggestion &&
      kanbanAtRun &&
      kanbanAtRun.status !== kanban.status &&
      !staleReasons.includes('kanban_mudou')
    ) {
      staleReasons.push('kanban_mudou')
    }

    // Rodada 11 (B3): arquivo incluído depois da leitura relê uma vez (em
    // continuação, se sair mais barata).
    const included =
      toTime(latestAttachmentIncludedAt)

    const reference =
      toTime(reading.reference_time)

    if (included !== null && reference !== null && included > reference) {
      staleReasons.push('arquivo_incluido')
    }
  }

  // G (rodada 9): passou o horário em que o próximo passo muda e ninguém
  // releu desde então: relê uma vez (no máximo uma por leitura, porque a
  // tentativa seguinte já é posterior ao horário).
  let reviewDue: { at: string; motivo: string } | null =
    null

  if (reading && staleReasons.length === 0) {
    const review =
      readReviewAt(reading)

    const newestCreated =
      toTime(newestAttempt?.created_at) ?? 0

    if (review && nowTime >= review.time && newestCreated < review.time) {
      staleReasons.push('horario_passou')
      reviewDue = { at: review.at, motivo: review.motivo }
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

  // D1 (rodada 9): com uma leitura na tela, mensagem nova do cliente só
  // inicia leitura depois de 20 s sem outra mensagem nova.
  const customerObserved =
    toTime(staleObservedAt)

  if (
    !forced &&
    reading !== null &&
    staleReasons.length > 0 &&
    staleReasons.every((reason) => reason === 'mensagem_nova') &&
    customerObserved !== null &&
    nowTime - customerObserved < burstQuietMs
  ) {
    return {
      ...plan,
      action: 'use',
      stale_reasons: [],
      pending_update_at: toIso(customerObserved + burstQuietMs),
    }
  }

  if (forced) {
    staleReasons.push(forceMode === 'full' ? 'pedido_do_vendedor' : 'forcado')
  }

  if (staleReasons.length === 0) {
    return {
      ...plan,
      action: 'use',
      stale_reasons: [],
    }
  }

  const fullReasons: FullReadingFullReason[] =
    forced && forceMode === 'full'
      ? ['pedido_do_vendedor']
      : []

  const skipReason =
    closedCycle && !closedService
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
        latestObservedAt: staleObservedAt,
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
            compatibleVersions.has(run.prompt_version ?? '') &&
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

  // I3: com áudio desta conversa sendo transcrito, nenhuma leitura nova
  // começa (nem pelo "Atualizar"); ela roda depois, já com o texto.
  if (audioHold) {
    return {
      ...plan,
      action: 'hold',
      stale_reasons: staleReasons,
      audio_hold: audioHold,
      closed_service: closedService ? kanban.status : null,
    }
  }

  return {
    ...plan,
    action: 'start',
    stale_reasons: staleReasons,
    review_due: reviewDue,
    full_reasons: fullReasons,
    closed_service: closedService ? kanban.status : null,
  }
}

// D4: o teto diário vale para toda rodada nova, inclusive "Atualizar" e
// "Tentar de novo".
export function applyDailyCap(
  plan: FullReadingPanelPlan,
  {
    dailyCapReached,
    now,
  }: {
    dailyCapReached: boolean
    now: string
  },
): FullReadingPanelPlan {
  if (plan.action !== 'start' || !dailyCapReached) {
    return plan
  }

  return {
    ...plan,
    action: 'skip',
    skip_reason: DAILY_CAP_SKIP_CODE,
    failure_kind: 'deterministic',
    failure_at: now,
    retry_at: null,
    credit_notice: false,
  }
}

// Rodadas de hoje (Brasília) que chamaram o Claude, de qualquer conversa
// da empresa (completas ou de continuação, painel ou rota de teste).
export function countRunsForDailyCap(
  rows: { status?: unknown; failure_code?: unknown }[],
): number {
  return rows.filter((row) => {
    if (row.status === 'failed') {
      return !(typeof row.failure_code === 'string' && FULL_READING_NO_CALL_FAILURE_CODES.has(row.failure_code))
    }

    return row.status === 'queued' || row.status === 'running' || row.status === 'succeeded'
  }).length
}

// Leituras de hoje que chamaram o Claude (sem a contagem: 0, o teto é
// proteção de custo).
export async function countFullReadingRunsToday(
  admin: SupabaseClient,
  companyId: string,
  now: string,
  cap: number,
): Promise<number> {
  try {
    const { data, error } =
      await admin
        .from(FULL_READING_RUNS_TABLE)
        .select('status, failure_code')
        .eq('company_id', companyId)
        .gte('created_at', startOfBrasiliaDay(now))
        .limit(cap + 50)

    if (error) {
      return 0
    }

    return countRunsForDailyCap((data ?? []) as { status?: unknown; failure_code?: unknown }[])
  } catch {
    return 0
  }
}

async function isDailyCapReached(
  admin: SupabaseClient,
  companyId: string,
  now: string,
  cap: number,
): Promise<boolean> {
  const runs =
    await countFullReadingRunsToday(admin, companyId, now, cap)

  // Rodada 11 (B4): cada resumo de arquivo conta no teto.
  const attachments =
    runs >= cap
      ? 0
      : await countAttachmentSummariesSince({
          admin,
          companyId,
          since: startOfBrasiliaDay(now),
        })

  return runs + attachments >= cap
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
  won_at?: unknown
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
    closedAtFromCycleRow(row)

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
  // Rodada 9: mensagem nova do cliente esperando a rajada acabar.
  pending_update_at?: string | null
  // Rodada 9 (D2): o vendedor respondeu depois da leitura (hora da
  // mensagem); a leitura espera o cliente.
  seller_replied_at?: string | null
  // Rodada 9 (G3): a leitura em andamento relê porque passou o horário.
  running_review?: { at: string; motivo: string } | null
  // Rodada 9 (G2): a extensão relê nesse horário com o painel aberto.
  review_at?: string | null
  daily_cap_reached?: boolean
  // Rodada 9 (I3): transcrição de áudio em andamento.
  audio_hold?: FullReadingAudioHold | null
  // Rodada 9 (J): ciclo encerrado lido como atendimento (status).
  closed_service?: string | null
  // Rodada 11 (B2): arquivos da conversa e o que o vendedor já incluiu.
  attachments?: FullReadingPanelAttachment[]
  attachments_available?: boolean
}

export type FullReadingPanelAttachment = {
  message_key: string
  ref: string
  kind: AttachmentKind
  name: string | null
  size_label: string | null
  pages: number | null
  occurred_at: string
  from: 'cliente' | 'vendedor' | 'automacao'
  status: 'nao_incluido' | AttachmentStatus
  // Rodada 12: por que falhou (imagem_baixa_resolucao, arquivo_ilegivel...).
  failure_code?: string | null
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

// Rodada 9: atividade da conversa só com mensagens reais (evento do
// ManyChat fora). Uma consulta: as linhas mais recentes por observed_at.
const ACTIVITY_ROWS_LIMIT =
  200

// Rodada 12 (B2): versões repetidas (ex.: o contador do player de áudio
// gravado como versão nova por extensões antigas) não podem empurrar as
// mensagens reais para fora da janela: sem mudança real na primeira
// página, lê as seguintes (até 5).
const ACTIVITY_MAX_PAGES =
  5

const ACTIVITY_PREDECESSOR_KEYS_LIMIT =
  50

export type FullReadingLedgerActivity = {
  // Última versão observada de mensagem real (qualquer lado).
  latest_observed_at: string | null
  // Última versão observada de mensagem real do cliente (deixa a leitura
  // velha).
  latest_customer_observed_at: string | null
  // Hora da última mensagem real do cliente.
  latest_customer_occurred_at: string | null
  // Última mensagem de uma pessoa da empresa (nunca o robô).
  latest_person: { occurred_at: string; observed_at: string } | null
  // Hora da última mensagem real (qualquer lado): "Último contato".
  last_message_at: string | null
  // Rodada 9 (I): última versão de áudio com transcrição.
  latest_transcription_observed_at?: string | null
  // Rodada 11 (B2): arquivos (última versão de cada mensagem).
  attachments?: FullReadingLedgerAttachment[]
}

export type FullReadingLedgerAttachment = {
  message_key: string
  occurred_at: string
  observed_at: string
  author_kind: string | null
  direction: string | null
  parsed: ParsedAttachment
}

type ActivityRow = {
  message_key?: unknown
  version?: unknown
  is_deleted?: unknown
  direction?: unknown
  author_kind?: unknown
  occurred_at?: unknown
  observed_at?: unknown
  content_type?: unknown
  text_content?: unknown
  audio_transcription?: unknown
}

function later(
  current: string | null,
  candidate: string | null,
): string | null {
  const candidateTime =
    toTime(candidate)

  if (candidateTime === null) {
    return current
  }

  const currentTime =
    toTime(current)

  return currentTime === null || candidateTime > currentTime
    ? candidate
    : current
}

// Rodada 12 (B2): só mudança real de conteúdo é atividade (mensagem nova,
// transcrição nova ou alterada, exclusão, texto alterado). Em áudio, o
// rótulo de duração ("[duração 0:42]", ou o tempo corrido do player) não é
// conteúdo: diferença só nele, inclusive vazio ↔ rótulo, não conta.
const AUDIO_LABEL_TEXT =
  /^\[(?:duração|áudio)\s+(?:\d{1,2}:)?\d{1,3}:[0-5]\d\]$/i

function activityText(
  row: ActivityRow,
): string {
  const contentType =
    typeof row.content_type === 'string'
      ? row.content_type.toLowerCase()
      : 'text'

  const text =
    typeof row.text_content === 'string'
      ? row.text_content.trim()
      : ''

  return contentType === 'audio' && AUDIO_LABEL_TEXT.test(text)
    ? ''
    : text
}

function activityTranscription(
  row: ActivityRow,
): string {
  return typeof row.audio_transcription === 'string'
    ? row.audio_transcription.trim()
    : ''
}

export function activityContentSignature(
  row: ActivityRow,
): string {
  return JSON.stringify([
    row.is_deleted === true,
    typeof row.content_type === 'string' ? row.content_type.toLowerCase() : 'text',
    activityText(row),
    activityTranscription(row),
  ])
}

function rowVersion(
  row: ActivityRow,
): number | null {
  return typeof row.version === 'number' && Number.isInteger(row.version)
    ? row.version
    : null
}

type ActivityChange = {
  // A versão mudou o conteúdo (ou é a primeira da mensagem).
  meaningful: boolean
  // A transcrição apareceu ou mudou nesta versão.
  transcription_changed: boolean
}

// Cada versão comparada com a anterior da mesma mensagem (na janela ou nas
// anteriores lidas à parte). Sem a anterior e com versão > 1, conta como
// mudança (não dá para provar que é repetida).
export function classifyActivityRows(
  rows: ActivityRow[],
  predecessors: ActivityRow[] = [],
): Map<ActivityRow, ActivityChange> {
  const result =
    new Map<ActivityRow, ActivityChange>()

  const byKey =
    new Map<string, ActivityRow[]>()

  for (const row of [...rows, ...predecessors]) {
    const key =
      rowText(row.message_key)

    if (!key) {
      continue
    }

    const list =
      byKey.get(key) ?? []

    list.push(row)
    byKey.set(key, list)
  }

  const inWindow =
    new Set(rows)

  for (const list of byKey.values()) {
    list.sort((left, right) => {
      const leftVersion = rowVersion(left)
      const rightVersion = rowVersion(right)

      if (leftVersion !== null && rightVersion !== null && leftVersion !== rightVersion) {
        return leftVersion - rightVersion
      }

      return (toTime(rowText(left.observed_at)) ?? 0) - (toTime(rowText(right.observed_at)) ?? 0)
    })

    let previous: ActivityRow | null = null

    for (const row of list) {
      if (inWindow.has(row)) {
        result.set(
          row,
          previous
            ? {
                meaningful:
                  activityContentSignature(previous) !== activityContentSignature(row),
                transcription_changed:
                  activityTranscription(row).length > 0 &&
                  activityTranscription(row) !== activityTranscription(previous),
              }
            : {
                meaningful: true,
                transcription_changed: activityTranscription(row).length > 0,
              },
        )
      }

      previous = row
    }
  }

  for (const row of rows) {
    if (!result.has(row)) {
      result.set(row, {
        meaningful: true,
        transcription_changed: activityTranscription(row).length > 0,
      })
    }
  }

  return result
}

export function summarizeLedgerActivity(
  rows: ActivityRow[],
  {
    predecessors = [],
  }: {
    // Versões anteriores, fora da janela, só para comparar (rodada 12).
    predecessors?: ActivityRow[]
  } = {},
): FullReadingLedgerActivity {
  const activity: FullReadingLedgerActivity = {
    latest_observed_at: null,
    latest_customer_observed_at: null,
    latest_customer_occurred_at: null,
    latest_person: null,
    last_message_at: null,
    latest_transcription_observed_at: null,
    attachments: [],
  }

  const attachmentsByKey =
    new Map<string, FullReadingLedgerAttachment>()

  const changes =
    classifyActivityRows(rows, predecessors)

  for (const row of rows) {
    // Rodada 11: arquivo (marca no texto), a versão observada mais recente.
    const attachmentKey =
      rowText(row.message_key)

    const attachmentObserved =
      rowText(row.observed_at)

    const attachmentOccurred =
      rowText(row.occurred_at)

    if (attachmentKey && attachmentObserved && attachmentOccurred) {
      const previous =
        attachmentsByKey.get(attachmentKey)

      if (!previous || (toTime(previous.observed_at) ?? 0) < (toTime(attachmentObserved) ?? 0)) {
        const parsed =
          row.is_deleted === true
            ? null
            : parseAttachmentMarker(typeof row.text_content === 'string' ? row.text_content : null)

        if (parsed) {
          attachmentsByKey.set(attachmentKey, {
            message_key: attachmentKey,
            occurred_at: attachmentOccurred,
            observed_at: attachmentObserved,
            author_kind: typeof row.author_kind === 'string' ? row.author_kind : null,
            direction: typeof row.direction === 'string' ? row.direction : null,
            parsed,
          })
        } else if (previous) {
          attachmentsByKey.delete(attachmentKey)
        }
      }
    }

    const message = {
      direction: typeof row.direction === 'string' ? row.direction : null,
      author_kind: typeof row.author_kind === 'string' ? row.author_kind : null,
      content_type: typeof row.content_type === 'string' ? row.content_type : null,
      text_content: typeof row.text_content === 'string' ? row.text_content : null,
    }

    if (classifyLedgerEvent(message)) {
      continue
    }

    const change =
      changes.get(row) ?? { meaningful: true, transcription_changed: false }

    const occurredAt =
      rowText(row.occurred_at)

    // Rodada 12 (B2): versão sem mudança real não mexe nos horários de
    // atividade (leitura velha, espera de 20 s, vendedor respondeu).
    const observedAt =
      change.meaningful
        ? rowText(row.observed_at)
        : null

    activity.latest_observed_at =
      later(activity.latest_observed_at, observedAt)

    activity.last_message_at =
      later(activity.last_message_at, occurredAt)

    if (
      message.content_type === 'audio' &&
      change.transcription_changed
    ) {
      activity.latest_transcription_observed_at =
        later(activity.latest_transcription_observed_at ?? null, rowText(row.observed_at))
    }

    if (isCustomerMessage(message)) {
      activity.latest_customer_observed_at =
        later(activity.latest_customer_observed_at, observedAt)

      activity.latest_customer_occurred_at =
        later(activity.latest_customer_occurred_at, occurredAt)
    } else if (isCompanyPersonMessage(message) && observedAt && occurredAt) {
      if (
        !activity.latest_person ||
        (toTime(observedAt) ?? 0) > (toTime(activity.latest_person.observed_at) ?? 0)
      ) {
        activity.latest_person = { occurred_at: occurredAt, observed_at: observedAt }
      }
    }
  }

  activity.attachments =
    [...attachmentsByKey.values()]
      .sort((left, right) => (toTime(left.occurred_at) ?? 0) - (toTime(right.occurred_at) ?? 0))

  return activity
}

const ACTIVITY_COLUMNS =
  'message_key, version, is_deleted, direction, author_kind, occurred_at, observed_at, content_type, text_content, audio_transcription'

function ledgerReadFailed(): Error {
  return Object.assign(
    new Error('Falha ao ler o ledger da conversa.'),
    { code: 'FULL_READING_LEDGER_READ_FAILED' },
  )
}

function activityRowId(
  row: ActivityRow,
): string {
  return `${rowText(row.message_key) ?? ''}#${rowVersion(row) ?? rowText(row.observed_at) ?? ''}`
}

// Rodada 12 (B2): a versão anterior das mensagens cuja primeira versão na
// janela não é a 1 (para saber se a versão da janela mudou algo).
async function readActivityPredecessors(
  admin: SupabaseClient,
  scope: FullReadingPanelScope,
  cycleIds: string[],
  rows: ActivityRow[],
): Promise<ActivityRow[]> {
  const firstVersion =
    new Map<string, number>()

  const versionsSeen =
    new Set<string>()

  let oldestObserved: string | null = null

  for (const row of rows) {
    const key = rowText(row.message_key)
    const version = rowVersion(row)

    if (!key || version === null) {
      continue
    }

    versionsSeen.add(`${key}#${version}`)
    firstVersion.set(key, Math.min(firstVersion.get(key) ?? version, version))

    const observed = rowText(row.observed_at)

    if (observed && (oldestObserved === null || (toTime(observed) ?? 0) < (toTime(oldestObserved) ?? 0))) {
      oldestObserved = observed
    }
  }

  const missing =
    [...firstVersion.entries()]
      .filter(([key, version]) => version > 1 && !versionsSeen.has(`${key}#${version - 1}`))
      .map(([key]) => key)
      .slice(0, ACTIVITY_PREDECESSOR_KEYS_LIMIT)

  if (missing.length === 0 || oldestObserved === null) {
    return []
  }

  const { data, error } =
    await admin
      .from('conversation_messages')
      .select(ACTIVITY_COLUMNS)
      .eq('company_id', scope.company_id)
      .in('cycle_id', cycleIds)
      .eq('conversation_key', scope.conversation_key)
      .in('message_key', missing)
      .lte('observed_at', oldestObserved)
      .order('observed_at', { ascending: false })
      .limit(ACTIVITY_ROWS_LIMIT * 2)

  if (error) {
    // Sem as anteriores, a versão conta como mudança (como antes).
    return []
  }

  const wanted =
    new Map(missing.map((key) => [key, (firstVersion.get(key) ?? 1) - 1]))

  const found =
    new Map<string, ActivityRow>()

  for (const row of (data ?? []) as ActivityRow[]) {
    const key = rowText(row.message_key)
    const version = rowVersion(row)

    if (!key || version === null || !wanted.has(key) || version > (wanted.get(key) ?? 0)) {
      continue
    }

    const current = found.get(key)

    if (!current || version > (rowVersion(current) ?? 0)) {
      found.set(key, row)
    }
  }

  return [...found.values()]
}

export async function readLedgerActivity(
  admin: SupabaseClient,
  scope: FullReadingPanelScope,
  cycleIds: string[],
): Promise<FullReadingLedgerActivity> {
  const rows: ActivityRow[] = []
  const seen = new Set<string>()
  let activity: FullReadingLedgerActivity | null = null

  for (let page = 0; page < ACTIVITY_MAX_PAGES; page += 1) {
    const oldest =
      rows.length > 0
        ? rowText(rows[rows.length - 1]?.observed_at)
        : null

    let query =
      admin
        .from('conversation_messages')
        .select(ACTIVITY_COLUMNS)
        .eq('company_id', scope.company_id)
        .in('cycle_id', cycleIds)
        .eq('conversation_key', scope.conversation_key)

    if (oldest) {
      query = query.lte('observed_at', oldest)
    }

    const { data, error } =
      await query
        .order('observed_at', { ascending: false })
        .limit(ACTIVITY_ROWS_LIMIT)

    if (error) {
      throw ledgerReadFailed()
    }

    const pageRows =
      (data ?? []) as ActivityRow[]

    let added = 0

    for (const row of pageRows) {
      const id = activityRowId(row)

      if (!seen.has(id)) {
        seen.add(id)
        rows.push(row)
        added += 1
      }
    }

    const exhausted =
      pageRows.length < ACTIVITY_ROWS_LIMIT || added === 0

    const predecessors =
      exhausted
        ? []
        : await readActivityPredecessors(admin, scope, cycleIds, rows)

    activity =
      summarizeLedgerActivity(rows, { predecessors })

    if (
      exhausted ||
      (activity.latest_observed_at !== null && activity.latest_customer_observed_at !== null)
    ) {
      break
    }
  }

  activity ??= summarizeLedgerActivity(rows)

  // Só eventos nas linhas mais recentes (raro): a conversa não está vazia.
  if (activity.latest_observed_at === null && rows.length > 0) {
    activity.latest_observed_at =
      rowText(rows[0]?.observed_at)
  }

  return activity
}

// D2: o vendedor respondeu depois da leitura e o cliente ainda não.
export function sellerRepliedAfterReading({
  reading,
  activity,
}: {
  reading: FullReadingPanelRunRow | null
  activity: FullReadingLedgerActivity
}): string | null {
  const person =
    activity.latest_person

  const reference =
    toTime(reading?.reference_time)

  if (!person || reference === null) {
    return null
  }

  const personObserved =
    toTime(person.observed_at)

  if (personObserved === null || personObserved <= reference) {
    return null
  }

  const customerObserved =
    toTime(activity.latest_customer_observed_at)

  if (customerObserved !== null && customerObserved > personObserved) {
    return null
  }

  return person.occurred_at
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
  baseRun = null,
  request,
  fullReasons = [],
}: {
  admin: SupabaseClient
  scope: FullReadingPanelScope
  now: string
  apiKey: string
  schedule: FullReadingRunScheduler
  createRunId: () => string
  env: EnvLike
  route?: string
  baseRun?: FullReadingPanelRunRow | null
  request: FullReadingRunRequest
  fullReasons?: FullReadingFullReason[]
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
        // O pedido fica na rodada enquanto ela roda (motivo, modo, base);
        // a decisão completa substitui quando ela termina.
        decision: { pedido: request },
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
      baseRun:
        baseRun && baseRun.decision && typeof baseRun.decision === 'object'
          ? {
              run_id: baseRun.run_id,
              reference_time: baseRun.reference_time,
              completed_at: baseRun.completed_at,
              decision: baseRun.decision as Record<string, unknown>,
            }
          : null,
      mode: request.modo === 'completa' ? 'completa' : 'auto',
      fullReasons,
      reasons: request.motivo,
    })
  })

  return {
    run_id: runId,
    failure_code: null,
  }
}

// Rodada 11: "resumindo" parado há mais de 2 minutos (a rota caiu no
// meio) aparece como falha, para o vendedor poder tentar de novo.
export function attachmentPanelStatus(
  record: { status: AttachmentStatus; requested_at: string | null; kind?: unknown; size_bytes?: unknown } | undefined,
  now: string,
): FullReadingPanelAttachment['status'] {
  if (!record) {
    return 'nao_incluido'
  }

  // Rodada 12 (A4): foto "incluida" com a prévia vale como falha.
  if (record.status === 'incluido' && isLowResolutionImage(record)) {
    return 'falhou'
  }

  if (record.status === 'resumindo') {
    const requested =
      toTime(record.requested_at)

    const current =
      toTime(now)

    if (requested === null || (current !== null && current - requested >= ATTACHMENT_IN_PROGRESS_MS)) {
      return 'falhou'
    }
  }

  return record.status
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
  audioHold = null,
}: {
  admin: SupabaseClient
  scope: FullReadingPanelScope
  force: boolean
  forceMode?: 'always' | 'if_changed' | 'full'
  audioHold?: FullReadingAudioHold | null
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
      .select('status, stage_entered_at, next_action, next_action_date, won_at, lost_at, canceled_at, closed_at')
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

  const [runs, activity, attachmentState] =
    await Promise.all([
      readRuns(admin, scope),
      readLedgerActivity(admin, scope, chainCycleIds),
      loadConversationAttachments({
        admin,
        companyId: scope.company_id,
        conversationKey: scope.conversation_key,
      }),
    ])

  const latestAttachmentIncludedAt =
    attachmentState.records
      .filter((record) => record.status === 'incluido' && record.summarized_at && !isLowResolutionImage(record))
      .map((record) => record.summarized_at as string)
      .sort((left, right) => (toTime(right) ?? 0) - (toTime(left) ?? 0))[0] ?? null

  const recordsByKey =
    new Map(attachmentState.records.map((record) => [record.message_key, record]))

  const attachments: FullReadingPanelAttachment[] =
    (activity.attachments ?? []).map((item) => {
      const record =
        recordsByKey.get(item.message_key)

      return {
        message_key: item.message_key,
        ref: attachmentRef(item.message_key),
        kind: item.parsed.kind,
        name: item.parsed.name,
        size_label: item.parsed.size_label,
        pages: item.parsed.pages,
        occurred_at: item.occurred_at,
        from:
          item.author_kind === 'automation'
            ? 'automacao'
            : item.author_kind === 'customer' || (item.author_kind !== 'human_agent' && item.direction === 'incoming')
              ? 'cliente'
              : 'vendedor',
        status: attachmentPanelStatus(record, now),
        failure_code:
          record && isLowResolutionImage(record)
            ? IMAGE_LOW_RESOLUTION_FAILURE
            : record?.failure_code ?? null,
      }
    })

  const latestObservedAt =
    activity.latest_observed_at

  const lastMessageAt =
    activity.last_message_at

  const lastCustomerMessageAt =
    TERMINAL_CYCLE_STATUSES.has(kanban.status)
      ? activity.latest_customer_occurred_at
      : null

  const planInput = {
    runs,
    cycleId: scope.cycle_id,
    kanban,
    latestObservedAt,
    latestCustomerObservedAt: activity.latest_customer_observed_at,
    latestCustomerOccurredAt: activity.latest_customer_occurred_at,
    latestTranscriptionObservedAt: activity.latest_transcription_observed_at ?? null,
    latestAttachmentIncludedAt,
    audioHold,
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

  if (plan.action === 'start') {
    plan =
      applyDailyCap(plan, {
        dailyCapReached:
          await isDailyCapReached(admin, scope.company_id, now, resolveFullReadingDailyCap(env)),
        now,
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
    seller_replied_at:
      sellerRepliedAfterReading({
        reading: plan.reading,
        activity,
      }),
    review_at:
      plan.reading
        ? readReviewAt(plan.reading)?.at ?? null
        : null,
    daily_cap_reached: plan.skip_reason === DAILY_CAP_SKIP_CODE,
    attachments,
    attachments_available: attachmentState.available,
    closed_service:
      TERMINAL_CYCLE_STATUSES.has(kanban.status) &&
      (plan.closed_service || (shownReading !== null && plan.skip_reason !== CLOSED_CYCLE_SKIP_CODE && customerWroteAfterClosure({ closedAt: kanban.closed_at ?? null, lastCustomerMessageAt: activity.latest_customer_occurred_at })))
        ? kanban.status
        : null,
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
      pending_update_at: plan.pending_update_at ?? null,
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
      running_review:
        readRunRequest(plan.active_run)?.revisao ?? null,
    }
  }

  if (plan.action === 'hold') {
    return {
      ...base,
      state: 'running',
      reading: shownReading,
      failure_code: null,
      started_run_id: null,
      running_since: null,
      audio_hold: plan.audio_hold ?? null,
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
      baseRun: plan.reading,
      request: {
        motivo: plan.stale_reasons,
        modo: (plan.full_reasons ?? []).length > 0 ? 'completa' : 'auto',
        leitura_base: plan.reading?.run_id ?? null,
        revisao: plan.review_due ?? null,
      },
      fullReasons: plan.full_reasons ?? [],
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
    running_review: plan.review_due ?? null,
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
  const view =
    buildFullReadingAgoraView({
      state: snapshot.state,
      reading: snapshot.reading,
      failureCode: snapshot.failure_code,
      kanban: snapshot.kanban,
      cycleId,
      lastCustomerMessageAt: snapshot.last_customer_message_at,
      lastMessageAt: snapshot.last_message_at ?? null,
      panel: panelStatusInput(snapshot),
    })

  // Rodada 11 (B2): a leitura sugere incluir um arquivo.
  const suggestion =
    buildAttachmentSuggestionView({
      suggestions: (snapshot.reading?.decision as { arquivos_sugeridos?: unknown } | null)?.arquivos_sugeridos,
      attachments: snapshot.attachments ?? [],
      available: snapshot.attachments_available === true,
    })

  return suggestion
    ? {
        ...view,
        attachment_suggestion: suggestion,
        view_key: `${view.view_key}|arq:${suggestion.message_key}`,
      }
    : view
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
    pending_update_at: snapshot.pending_update_at ?? null,
    seller_replied_at: snapshot.seller_replied_at ?? null,
    running_review: snapshot.running_review ?? null,
    review_at: snapshot.review_at ?? null,
    daily_cap_reached: snapshot.daily_cap_reached === true,
    audio_hold: snapshot.audio_hold ?? null,
    closed_service: snapshot.closed_service ?? null,
  }
}

export function buildAnalysisFullReadingView(
  snapshot: FullReadingPanelSnapshot,
): FullReadingAnalysisView {
  const view =
    buildFullReadingAnalysisView({
      state: snapshot.state,
      reading: snapshot.reading,
      failureCode: snapshot.failure_code,
      kanban: snapshot.kanban,
      lastMessageAt: snapshot.last_message_at ?? null,
      panel: panelStatusInput(snapshot),
    })

  // Rodada 11 (B2): "Arquivos na conversa (N)".
  const attachments =
    buildAttachmentsView({
      attachments: snapshot.attachments ?? [],
      available: snapshot.attachments_available === true,
    })

  return attachments
    ? {
        ...view,
        attachments,
        view_key: `${view.view_key}|arq:${attachmentsViewKey(snapshot.attachments ?? [])}`,
      }
    : view
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
  audioHold,
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
  // "if_changed" (Atualizar com a leitura em dia não relê); "full" (Ler a
  // conversa inteira); qualquer outro valor relê.
  forceMode?: unknown
  // Rodada 9 (I3): { current, total } da transcrição na extensão.
  audioHold?: unknown
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
        forceMode:
          forceMode === 'if_changed' || forceMode === 'full'
            ? forceMode
            : 'always',
        now: referenceTime,
        apiKey: env.ANTHROPIC_API_KEY ?? '',
        schedule,
        createRunId,
        env,
        route,
        audioHold: normalizeAudioHold(audioHold),
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
