import type {
  SalesPulseCyclePulse,
  SalesPulseCycleRow,
  SalesPulsePageData,
  SalesPulseSignal,
  SalesPulseState,
  SalesPulseSummary,
} from '@/app/types/sales-pulse'
import type { LeadStatus } from '@/app/types/sales_cycles'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const PULSE_STATUSES: LeadStatus[] = ['contato', 'respondeu', 'negociacao']

type BuildSalesPulseOptions = {
  now?: Date
  limit?: number
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function diffInDays(from: string | null | undefined, now: Date) {
  if (!from) return null

  const date = new Date(from)

  if (Number.isNaN(date.getTime())) return null

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY))
}

function isOverdue(date: string | null | undefined, now: Date) {
  if (!date) return false

  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) return false

  return parsed.getTime() < now.getTime()
}

function getPulseState(score: number): SalesPulseState {
  if (score >= 76) return 'forte'
  if (score >= 56) return 'ativo'
  if (score >= 36) return 'fraco'
  if (score >= 16) return 'critico'
  return 'sem_pulso'
}

function getPulseLabel(state: SalesPulseState) {
  switch (state) {
    case 'forte':
      return 'Pulso Forte'
    case 'ativo':
      return 'Pulso Ativo'
    case 'fraco':
      return 'Pulso Fraco'
    case 'critico':
      return 'Pulso Crítico'
    case 'sem_pulso':
      return 'Sem Pulso'
  }
}

function getPulseSeverity(state: SalesPulseState) {
  switch (state) {
    case 'forte':
      return 'positive' as const
    case 'ativo':
      return 'neutral' as const
    case 'fraco':
      return 'warning' as const
    case 'critico':
      return 'danger' as const
    case 'sem_pulso':
      return 'dead' as const
  }
}

function buildReasonAndAction(signals: SalesPulseSignal[], state: SalesPulseState) {
  const firstDanger = signals.find((signal) => signal.severity === 'danger' || signal.severity === 'dead')
  const firstWarning = signals.find((signal) => signal.severity === 'warning')
  const firstPositive = signals.find((signal) => signal.severity === 'positive')

  if (firstDanger) {
    return {
      reason: firstDanger.detail,
      action: 'Retomar o ciclo hoje com uma próxima ação objetiva e registrar o resultado no histórico.',
    }
  }

  if (firstWarning) {
    return {
      reason: firstWarning.detail,
      action: 'Reforçar acompanhamento e definir um próximo passo claro para não deixar a venda esfriar.',
    }
  }

  if (firstPositive) {
    return {
      reason: firstPositive.detail,
      action: 'Manter cadência e conduzir o próximo avanço enquanto a negociação está aquecida.',
    }
  }

  if (state === 'sem_pulso') {
    return {
      reason: 'O ciclo não tem sinais comerciais recentes suficientes.',
      action: 'Decidir se vale recuperar a oportunidade ou encerrar como perdido com motivo claro.',
    }
  }

  return {
    reason: 'O ciclo está dentro de uma faixa operacional aceitável.',
    action: 'Manter acompanhamento e atualizar o histórico sempre que houver contato relevante.',
  }
}

export function calculateCyclePulse(row: SalesPulseCycleRow, now = new Date()): SalesPulseCyclePulse {
  let score = 70
  const signals: SalesPulseSignal[] = []
  const daysInStage = diffInDays(row.stage_entered_at, now)
  const daysSinceUpdate = diffInDays(row.updated_at, now)
  const isNextActionOverdue = isOverdue(row.next_action_date, now)

  if (!row.next_action_date) {
    score -= 22
    signals.push({
      label: 'Sem próxima ação',
      detail: 'O ciclo não tem próxima ação definida.',
      severity: 'danger',
    })
  } else if (isNextActionOverdue) {
    score -= 26
    signals.push({
      label: 'Próxima ação vencida',
      detail: 'Existe uma próxima ação vencida que precisa ser tratada.',
      severity: 'danger',
    })
  } else {
    score += 8
    signals.push({
      label: 'Próxima ação definida',
      detail: 'O ciclo tem um próximo passo registrado.',
      severity: 'positive',
    })
  }

  if (daysInStage != null) {
    if (daysInStage >= 7) {
      score -= 22
      signals.push({
        label: 'Muito tempo na etapa',
        detail: `O ciclo está há ${daysInStage} dias na mesma etapa.`,
        severity: 'danger',
      })
    } else if (daysInStage >= 4) {
      score -= 12
      signals.push({
        label: 'Etapa esfriando',
        detail: `O ciclo já está há ${daysInStage} dias na etapa atual.`,
        severity: 'warning',
      })
    } else {
      score += 5
      signals.push({
        label: 'Movimento recente de etapa',
        detail: 'O ciclo ainda não está parado tempo demais na etapa atual.',
        severity: 'positive',
      })
    }
  }

  if (daysSinceUpdate != null) {
    if (daysSinceUpdate >= 5) {
      score -= 18
      signals.push({
        label: 'Sem atualização recente',
        detail: `O ciclo não recebe atualização há ${daysSinceUpdate} dias.`,
        severity: 'danger',
      })
    } else if (daysSinceUpdate >= 3) {
      score -= 8
      signals.push({
        label: 'Atualização antiga',
        detail: `A última atualização ocorreu há ${daysSinceUpdate} dias.`,
        severity: 'warning',
      })
    } else {
      score += 5
      signals.push({
        label: 'Atualização recente',
        detail: 'O ciclo teve atualização recente.',
        severity: 'positive',
      })
    }
  }

  if (row.status === 'negociacao') {
    score -= 4
    signals.push({
      label: 'Negociação exige cadência',
      detail: 'Ciclos em negociação precisam de acompanhamento próximo para não perder força.',
      severity: 'warning',
    })
  }

  if (row.status === 'respondeu') {
    score += 6
    signals.push({
      label: 'Cliente respondeu',
      detail: 'O ciclo já tem sinal de resposta do cliente e pode ser conduzido para avanço.',
      severity: 'positive',
    })
  }

  const normalizedScore = clampScore(score)
  const state = getPulseState(normalizedScore)
  const { reason, action } = buildReasonAndAction(signals, state)

  return {
    cycleId: row.id,
    companyId: row.company_id,
    leadId: row.lead_id,
    ownerUserId: row.owner_user_id,
    leadName: row.leads?.name || 'Lead sem nome',
    leadPhone: row.leads?.phone ?? null,
    leadEmail: row.leads?.email ?? null,
    status: row.status,
    score: normalizedScore,
    state,
    stateLabel: getPulseLabel(state),
    severity: getPulseSeverity(state),
    daysInStage,
    daysSinceUpdate,
    nextAction: row.next_action,
    nextActionDate: row.next_action_date,
    isNextActionOverdue,
    mainReason: reason,
    recommendedAction: action,
    signals,
  }
}

function buildSummary(cycles: SalesPulseCyclePulse[]): SalesPulseSummary {
  const totalOpenCycles = cycles.length
  const totalScore = cycles.reduce((sum, cycle) => sum + cycle.score, 0)

  return {
    totalOpenCycles,
    strongCycles: cycles.filter((cycle) => cycle.state === 'forte').length,
    activeCycles: cycles.filter((cycle) => cycle.state === 'ativo').length,
    weakCycles: cycles.filter((cycle) => cycle.state === 'fraco').length,
    criticalCycles: cycles.filter((cycle) => cycle.state === 'critico').length,
    deadCycles: cycles.filter((cycle) => cycle.state === 'sem_pulso').length,
    overdueNextActions: cycles.filter((cycle) => cycle.isNextActionOverdue).length,
    cyclesWithoutNextAction: cycles.filter((cycle) => !cycle.nextActionDate).length,
    averageScore: totalOpenCycles > 0 ? Math.round(totalScore / totalOpenCycles) : 0,
  }
}

function buildRecommendedActions(cycles: SalesPulseCyclePulse[]): SalesPulseSignal[] {
  const critical = cycles.filter((cycle) => cycle.state === 'critico' || cycle.state === 'sem_pulso')
  const weak = cycles.filter((cycle) => cycle.state === 'fraco')
  const overdue = cycles.filter((cycle) => cycle.isNextActionOverdue)
  const withoutNextAction = cycles.filter((cycle) => !cycle.nextActionDate)

  const actions: SalesPulseSignal[] = []

  if (critical.length > 0) {
    actions.push({
      label: 'Recuperar ciclos críticos',
      detail: `${critical.length} ciclo${critical.length === 1 ? '' : 's'} estão em pulso crítico ou sem pulso.`,
      severity: 'danger',
    })
  }

  if (overdue.length > 0) {
    actions.push({
      label: 'Tratar próximas ações vencidas',
      detail: `${overdue.length} próxima${overdue.length === 1 ? ' ação está' : 's ações estão'} vencida${overdue.length === 1 ? '' : 's'}.`,
      severity: 'danger',
    })
  }

  if (withoutNextAction.length > 0) {
    actions.push({
      label: 'Definir próximos passos',
      detail: `${withoutNextAction.length} ciclo${withoutNextAction.length === 1 ? '' : 's'} não têm próxima ação definida.`,
      severity: 'warning',
    })
  }

  if (weak.length > 0) {
    actions.push({
      label: 'Evitar esfriamento',
      detail: `${weak.length} ciclo${weak.length === 1 ? '' : 's'} estão com pulso fraco e precisam de cadência.`,
      severity: 'warning',
    })
  }

  if (actions.length === 0) {
    actions.push({
      label: 'Operação saudável',
      detail: 'Nenhum alerta crítico foi encontrado nos ciclos analisados.',
      severity: 'positive',
    })
  }

  return actions
}

export function buildSalesPulsePageData(
  rows: SalesPulseCycleRow[],
  options: BuildSalesPulseOptions = {}
): SalesPulsePageData {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 50

  const allCycles = rows
    .filter((row) => PULSE_STATUSES.includes(row.status))
    .map((row) => calculateCyclePulse(row, now))
    .sort((a, b) => a.score - b.score)

  const visibleCycles = allCycles.slice(0, limit)

  return {
    summary: buildSummary(allCycles),
    cycles: visibleCycles,
    criticalCycles: allCycles.filter((cycle) => cycle.state === 'critico' || cycle.state === 'sem_pulso'),
    recommendedActions: buildRecommendedActions(allCycles),
    generatedAt: now.toISOString(),
  }
}
