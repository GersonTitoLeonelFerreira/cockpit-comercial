import 'server-only'

// Leitura do Companion no cadastro do ciclo no Yolen (rodada 9, Fase 2).
//
// Só com a leitura completa ligada (COMPANION_FULL_READING_PANEL=on e
// VERCEL_ENV=preview); com a flag desligada a rota responde 404 e a página
// do ciclo fica igual à de hoje.
//
// Acesso: só quem já pode ver o ciclo, com as mesmas regras da página do
// ciclo — sessão do Yolen, vínculo ativo com a empresa ativa e o ciclo
// visível pelo cliente do próprio usuário (RLS), na empresa ativa. Só
// depois disso as leituras são lidas, com o cliente de serviço, sempre
// filtradas pela empresa e pelos ciclos conferidos. Numa Nova oportunidade,
// o ciclo de origem também precisa estar visível para o usuário.
//
// Só leitura: nenhum evento novo na linha do tempo do ciclo (a tela de
// produção usa a mesma tabela de eventos). Os textos são os do painel.

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  FULL_READING_RUNS_TABLE,
} from './full-reading-runner'

import {
  isFullReadingPanelEnabled,
} from './full-reading-flag'

import {
  buildFullReadingAgoraView,
  buildFullReadingAnalysisView,
  isUsableStoredDecision,
  type FullReadingClientView,
  type FullReadingConductView,
  type FullReadingOpportunityView,
  type FullReadingPanelReading,
  type FullReadingPendingView,
} from './full-reading-panel-view'

import {
  formatTranscriptTimestamp,
} from '../companion/full-reading/transcript'

export const CYCLE_READINGS_LIMIT =
  30

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ORIGIN_CHAIN_MAX_DEPTH =
  4

export type CycleReadingSummary = {
  run_id: string
  completed_at: string | null
  when_label: string
  mode_label: string
  title: string
}

export type CycleReadingDetail = {
  run_id: string
  completed_at: string | null
  when_label: string
  mode_label: string
  situation: string
  next_step: {
    title: string
    complement: string
    turn_label: string
    why: string
  } | null
  conduct: FullReadingConductView | null
  pending: FullReadingPendingView[]
  opportunities: FullReadingOpportunityView[]
  to_confirm: string[]
  client: FullReadingClientView | null
  manager_notes: string[]
}

export type CycleReadingsGroup = {
  cycle_id: string
  label: string
  readings: CycleReadingSummary[]
  latest: CycleReadingDetail | null
}

export type CycleReadingsPayload = {
  current: CycleReadingsGroup
  origins: CycleReadingsGroup[]
  selected: CycleReadingDetail | null
}

type RunRow = {
  run_id: string
  cycle_id: string
  status: string
  prompt_version: string | null
  completed_at: string | null
  created_at: string
  analysis_markdown: string | null
  decision: unknown
}

type CycleRow = {
  id: string
  status: string
  stage_entered_at: string | null
  next_action: string | null
  next_action_date: string | null
  origin_cycle_id: string | null
  lost_at: string | null
  canceled_at: string | null
  closed_at: string | null
}

function text(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : null
}

function whenLabel(
  value: string | null,
): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    return ''
  }

  const [day, time] =
    formatTranscriptTimestamp(value).split(' ')

  return `${day.slice(0, 5)}, ${time}`
}

function modeLabel(
  decision: unknown,
): string {
  const mode =
    (decision as { sistema?: { modo?: unknown } } | null)?.sistema?.modo

  return mode === 'continuacao'
    ? 'Atualização'
    : 'Leitura completa'
}

function isEval(
  run: RunRow,
): boolean {
  return typeof run.prompt_version === 'string' && run.prompt_version.endsWith('-eval')
}

function usable(
  run: RunRow,
): boolean {
  return (
    run.status === 'succeeded' &&
    !isEval(run) &&
    isUsableStoredDecision(run.decision) &&
    (
      typeof run.analysis_markdown === 'string' ||
      typeof (run.decision as { mensagem_sugerida?: unknown }).mensagem_sugerida === 'string'
    )
  )
}

function kanbanOf(
  cycle: CycleRow,
) {
  return {
    status: cycle.status,
    stage_entered_at: cycle.stage_entered_at,
    next_action: cycle.next_action,
    next_action_date: cycle.next_action_date,
    closed_at:
      cycle.status === 'perdido'
        ? cycle.lost_at ?? cycle.closed_at
        : cycle.status === 'cancelado'
          ? cycle.canceled_at ?? cycle.closed_at
          : cycle.closed_at,
  }
}

function summarize(
  run: RunRow,
): CycleReadingSummary {
  const title =
    text((run.decision as { proximo_passo_titulo?: unknown }).proximo_passo_titulo) ??
    text((run.decision as { acao_resumo?: unknown }).acao_resumo) ??
    ''

  return {
    run_id: run.run_id,
    completed_at: run.completed_at,
    when_label: whenLabel(run.completed_at ?? run.created_at),
    mode_label: modeLabel(run.decision),
    title: title.trim(),
  }
}

// Os mesmos textos do painel (AGORA, ANÁLISE e CLIENTE).
export function buildCycleReadingDetail(
  run: RunRow,
  cycle: CycleRow,
): CycleReadingDetail | null {
  if (!usable(run)) {
    return null
  }

  const reading = {
    run_id: run.run_id,
    completed_at: run.completed_at,
    analysis_markdown: run.analysis_markdown,
    decision: run.decision as FullReadingPanelReading['decision'],
  }

  const kanban =
    kanbanOf(cycle)

  const agora =
    buildFullReadingAgoraView({
      state: 'ready',
      reading,
      failureCode: null,
      kanban,
      cycleId: cycle.id,
      lastCustomerMessageAt: null,
    })

  const analysis =
    buildFullReadingAnalysisView({
      state: 'ready',
      reading,
      failureCode: null,
      kanban,
    })

  return {
    run_id: run.run_id,
    completed_at: run.completed_at,
    when_label: whenLabel(run.completed_at ?? run.created_at),
    mode_label: modeLabel(run.decision),
    situation: agora.main?.situacao ?? '',
    next_step: agora.next_step
      ? {
          title: agora.next_step.title,
          complement: agora.next_step.complement,
          turn_label: agora.next_step.turn_label,
          why: agora.next_step.why,
        }
      : null,
    conduct: agora.conduct,
    pending: analysis.pending,
    opportunities: analysis.opportunities,
    to_confirm: analysis.afirmacoes_a_confirmar,
    client: agora.client,
    manager_notes: analysis.manager_notes,
  }
}

export type CycleReadingsAccess = {
  // Cliente do próprio usuário (RLS): só enxerga o que a página do ciclo
  // enxerga.
  userClient: SupabaseClient
  // Cliente de serviço: só lê as leituras depois do acesso conferido.
  admin: SupabaseClient
  userId: string
  activeCompanyId: string | null
}

export type CycleReadingsResult =
  | { status: 200; body: { ok: true } & CycleReadingsPayload }
  | { status: 400 | 403 | 404 | 500; body: { ok: false; error: string } }

async function readVisibleCycle(
  userClient: SupabaseClient,
  companyId: string,
  cycleId: string,
): Promise<CycleRow | null> {
  const { data, error } =
    await userClient
      .from('sales_cycles')
      .select('id, status, stage_entered_at, next_action, next_action_date, origin_cycle_id, lost_at, canceled_at, closed_at')
      .eq('id', cycleId)
      .eq('company_id', companyId)
      .maybeSingle()

  if (error || !data) {
    return null
  }

  const row =
    data as Record<string, unknown>

  const id =
    text(row.id)

  const status =
    text(row.status)

  if (!id || !status) {
    return null
  }

  return {
    id,
    status,
    stage_entered_at: text(row.stage_entered_at),
    next_action: text(row.next_action),
    next_action_date: text(row.next_action_date),
    origin_cycle_id: text(row.origin_cycle_id),
    lost_at: text(row.lost_at),
    canceled_at: text(row.canceled_at),
    closed_at: text(row.closed_at),
  }
}

async function hasActiveMembership(
  access: CycleReadingsAccess,
  companyId: string,
): Promise<boolean> {
  const { data: membership, error: membershipError } =
    await access.userClient
      .from('company_memberships')
      .select('company_id, is_active')
      .eq('company_id', companyId)
      .eq('user_id', access.userId)
      .eq('is_active', true)
      .maybeSingle()

  return !membershipError && Boolean(membership)
}

export async function loadCycleReadings({
  access,
  cycleId,
  runId = null,
  env = process.env,
}: {
  access: CycleReadingsAccess
  cycleId: unknown
  runId?: unknown
  env?: Record<string, string | undefined>
}): Promise<CycleReadingsResult> {
  // Flag desligada: a rota não existe.
  if (!isFullReadingPanelEnabled(env)) {
    return { status: 404, body: { ok: false, error: 'NOT_FOUND' } }
  }

  const cycle =
    typeof cycleId === 'string' ? cycleId.trim().toLowerCase() : ''

  const selectedRun =
    typeof runId === 'string' && runId.trim().length > 0
      ? runId.trim().toLowerCase()
      : null

  if (!UUID_PATTERN.test(cycle) || (selectedRun !== null && !UUID_PATTERN.test(selectedRun))) {
    return { status: 400, body: { ok: false, error: 'INVALID_REQUEST' } }
  }

  const companyId =
    access.activeCompanyId?.trim().toLowerCase() ?? ''

  if (!UUID_PATTERN.test(companyId)) {
    return { status: 403, body: { ok: false, error: 'COMPANY_NOT_SELECTED' } }
  }

  // Vínculo ativo com a empresa ativa (mesma regra das rotas do ciclo).
  if (!(await hasActiveMembership(access, companyId))) {
    return { status: 403, body: { ok: false, error: 'NO_ACTIVE_MEMBERSHIP' } }
  }

  // O ciclo precisa estar visível para o usuário (mesma regra da página).
  const current =
    await readVisibleCycle(access.userClient, companyId, cycle)

  if (!current) {
    return { status: 404, body: { ok: false, error: 'CYCLE_NOT_FOUND' } }
  }

  // Ciclos de origem visíveis (Nova oportunidade).
  const origins: CycleRow[] = []
  const seen = new Set([current.id])
  let next = current.origin_cycle_id

  while (next && !seen.has(next) && origins.length < ORIGIN_CHAIN_MAX_DEPTH) {
    seen.add(next)

    const origin =
      await readVisibleCycle(access.userClient, companyId, next)

    if (!origin) {
      break
    }

    origins.push(origin)
    next = origin.origin_cycle_id
  }

  const cycles =
    [current, ...origins]

  const { data, error } =
    await access.admin
      .from(FULL_READING_RUNS_TABLE)
      .select('run_id, cycle_id, status, prompt_version, completed_at, created_at, analysis_markdown, decision')
      .eq('company_id', companyId)
      .in('cycle_id', cycles.map((item) => item.id))
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(CYCLE_READINGS_LIMIT * cycles.length)

  if (error) {
    return { status: 500, body: { ok: false, error: 'READINGS_UNAVAILABLE' } }
  }

  const runs =
    ((data ?? []) as RunRow[]).filter(usable)

  const group = (item: CycleRow, label: string): CycleReadingsGroup => {
    const own =
      runs
        .filter((run) => run.cycle_id === item.id)
        .slice(0, CYCLE_READINGS_LIMIT)

    return {
      cycle_id: item.id,
      label,
      readings: own.map(summarize),
      latest: own[0] ? buildCycleReadingDetail(own[0], item) : null,
    }
  }

  const selected =
    selectedRun
      ? runs.find((run) => run.run_id === selectedRun) ?? null
      : null

  const selectedCycle =
    selected
      ? cycles.find((item) => item.id === selected.cycle_id) ?? null
      : null

  return {
    status: 200,
    body: {
      ok: true,
      current: group(current, 'Esta oportunidade'),
      origins: origins.map((item) => group(item, 'Oportunidade de origem')),
      selected:
        selected && selectedCycle
          ? buildCycleReadingDetail(selected, selectedCycle)
          : null,
    },
  }
}

// Rodada 10 (F1): o quadro "Resumo salvo na Yolen" da página do lead mostra
// a última leitura do Companion (situação, próximo passo, data e hora).
// Mesmas regras de acesso da seção: vínculo ativo com a empresa ativa e só
// os ciclos do lead visíveis para o usuário (RLS). Flag desligada, sem
// acesso ou sem leitura: null (o quadro fica como hoje).
export type LeadCompanionReadingSummary = {
  cycle_id: string
  run_id: string
  when_label: string
  situation: string
  next_step: string | null
}

export async function loadLatestLeadCompanionReading({
  access,
  cycleIds,
  env = process.env,
}: {
  access: CycleReadingsAccess
  cycleIds: string[]
  env?: Record<string, string | undefined>
}): Promise<LeadCompanionReadingSummary | null> {
  if (!isFullReadingPanelEnabled(env)) {
    return null
  }

  const companyId =
    access.activeCompanyId?.trim().toLowerCase() ?? ''

  const ids =
    [...new Set(cycleIds.map((id) => id.trim().toLowerCase()))]
      .filter((id) => UUID_PATTERN.test(id))

  if (!UUID_PATTERN.test(companyId) || ids.length === 0) {
    return null
  }

  try {
    if (!(await hasActiveMembership(access, companyId))) {
      return null
    }

    const visible: CycleRow[] = []

    for (const id of ids) {
      const cycle =
        await readVisibleCycle(access.userClient, companyId, id)

      if (cycle) {
        visible.push(cycle)
      }
    }

    if (visible.length === 0) {
      return null
    }

    const { data, error } =
      await access.admin
        .from(FULL_READING_RUNS_TABLE)
        .select('run_id, cycle_id, status, prompt_version, completed_at, created_at, analysis_markdown, decision')
        .eq('company_id', companyId)
        .in('cycle_id', visible.map((cycle) => cycle.id))
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(CYCLE_READINGS_LIMIT)

    if (error) {
      return null
    }

    const run =
      ((data ?? []) as RunRow[]).find(usable) ?? null

    const cycle =
      run
        ? visible.find((item) => item.id === run.cycle_id) ?? null
        : null

    const detail =
      run && cycle
        ? buildCycleReadingDetail(run, cycle)
        : null

    if (!run || !detail || !detail.situation) {
      return null
    }

    const nextStep =
      detail.next_step
        ? [detail.next_step.title, detail.next_step.complement]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(' ')
        : ''

    return {
      cycle_id: run.cycle_id,
      run_id: run.run_id,
      when_label: detail.when_label,
      situation: detail.situation,
      next_step: nextStep || null,
    }
  } catch {
    return null
  }
}
