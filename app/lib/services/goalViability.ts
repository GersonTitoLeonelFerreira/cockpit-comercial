import type {
    GoalViabilityConfidence,
    GoalViabilityCriterion,
    GoalViabilityInput,
    GoalViabilityRecoveryScenario,
    GoalViabilityResult,
    GoalViabilityStatus,
    GoalViabilityTone,
  } from '@/app/types/goalViability'
  import type { DistributionConfidence } from '@/app/types/distribution'
  
  function clamp(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min
    return Math.max(min, Math.min(max, value))
  }
  
  function pct(value: number) {
    return `${Math.round(value)}%`
  }
  
  function formatNumber(value: number) {
    return Number(value || 0).toLocaleString('pt-BR', {
      maximumFractionDigits: 1,
    })
  }
  
  function confidenceLabel(confidence: GoalViabilityConfidence) {
    const labels: Record<GoalViabilityConfidence, string> = {
      alta: 'Alta',
      moderada: 'Moderada',
      baixa: 'Baixa',
      insuficiente: 'Insuficiente',
    }
  
    return labels[confidence]
  }
  
  function confidenceFromScore(score: number): GoalViabilityConfidence {
    if (score >= 80) return 'alta'
    if (score >= 65) return 'moderada'
    if (score >= 45) return 'baixa'
    return 'insuficiente'
  }
  
  function scoreFromDistributionConfidence(confidence?: DistributionConfidence): number {
    if (confidence === 'alta') return 95
    if (confidence === 'moderada') return 75
    if (confidence === 'baixa') return 45
    return 25
  }
  
  function getCriterionTone(score: number): GoalViabilityTone {
    if (score >= 75) return 'good'
    if (score >= 45) return 'warn'
    return 'bad'
  }
  
  function getOpenBase(input: GoalViabilityInput) {
    const metrics = input.metrics
  
    if (!metrics) return 0
  
    const byStatus =
      Number(metrics.counts_by_status?.novo || 0) +
      Number(metrics.counts_by_status?.contato || 0) +
      Number(metrics.counts_by_status?.respondeu || 0) +
      Number(metrics.counts_by_status?.negociacao || 0)
  
    const totalOpen = Number(metrics.total_open || 0)
  
    return Math.max(totalOpen, byStatus)
  }
  
  function buildRecoveryScenario(
    requiredBase: number,
    remainingBusinessDays: number,
  ): GoalViabilityRecoveryScenario {
    const safeRequired = Math.max(0, requiredBase)
    const safeDays = Math.max(0, remainingBusinessDays)
  
    const current = safeDays > 0 ? Math.ceil(safeRequired / safeDays) : safeRequired
    const day1 = safeDays - 1 > 0 ? Math.ceil(safeRequired / (safeDays - 1)) : safeRequired
    const day2 = safeDays - 2 > 0 ? Math.ceil(safeRequired / (safeDays - 2)) : safeRequired
    const day3 = safeDays - 3 > 0 ? Math.ceil(safeRequired / (safeDays - 3)) : safeRequired
  
    const increase = current > 0 ? ((day2 - current) / current) * 100 : 0
  
    return {
      current_daily_needed: current,
      if_loses_1_day: day1,
      if_loses_2_days: day2,
      if_loses_3_days: day3,
      two_day_increase_pct: Math.max(0, Math.round(increase)),
    }
  }
  
  function getRateCriterion(input: GoalViabilityInput): GoalViabilityCriterion {
    const vendorWorked = Number(input.closeRateReal?.vendor?.worked || 0)
    const companyWorked = Number(input.closeRateReal?.company?.worked || 0)
    const vendorRate = input.closeRateReal?.vendor?.close_rate ?? null
    const companyRate = input.closeRateReal?.company?.close_rate ?? null
  
    const useVendor = vendorWorked >= 20
    const sample = useVendor ? vendorWorked : companyWorked
    const rate = useVendor ? vendorRate : companyRate
  
    let score = 20
    let confidence: GoalViabilityConfidence = 'insuficiente'
  
    if (sample >= 100) {
      score = 95
      confidence = 'alta'
    } else if (sample >= 50) {
      score = 78
      confidence = 'moderada'
    } else if (sample >= 20) {
      score = 55
      confidence = 'baixa'
    }
  
    const rateText =
      typeof rate === 'number' && Number.isFinite(rate)
        ? pct(rate * 100)
        : 'sem taxa válida'
  
    return {
      id: 'close_rate',
      label: 'Taxa de conversão',
      value: `${rateText} · ${sample} oportunidades na base`,
      description:
        sample >= 20
          ? 'A taxa usada possui base real suficiente para orientar a simulação, mas ainda deve ser acompanhada durante a execução.'
          : 'A taxa usada tem pouca base real. O plano pode oscilar mais do que o esperado.',
      confidence,
      tone: getCriterionTone(score),
      score,
    }
  }
  
  function getTicketCriterion(input: GoalViabilityInput): GoalViabilityCriterion {
    const ticket = input.historicalTicket
    const sample = Number(ticket?.sample_size || 0)
    const isSufficient = Boolean(ticket?.is_sufficient)
  
    let score = 20
    let confidence: GoalViabilityConfidence = 'insuficiente'
  
    if (isSufficient && sample >= 20) {
      score = 92
      confidence = 'alta'
    } else if (isSufficient && sample >= 5) {
      score = 72
      confidence = 'moderada'
    } else if (sample > 0) {
      score = 45
      confidence = 'baixa'
    }
  
    const fallbackLabel =
      ticket?.fallback_level === 'period'
        ? 'período atual'
        : ticket?.fallback_level === 'last_90_days'
          ? 'últimos 90 dias'
          : 'base insuficiente'
  
    return {
      id: 'ticket',
      label: 'Ticket médio',
      value: `${sample} venda(s) · origem: ${fallbackLabel}`,
      description:
        score >= 70
          ? 'O ticket médio possui base histórica suficiente para sustentar a projeção financeira.'
          : 'O ticket médio ainda não tem base histórica forte. A meta pode exigir ajuste se o ticket real cair.',
      confidence,
      tone: getCriterionTone(score),
      score,
    }
  }
  
  function getBaseCriterion(input: GoalViabilityInput): {
    criterion: GoalViabilityCriterion
    availableBase: number
    requiredBase: number
    baseCoveragePct: number
  } {
    const availableBase = getOpenBase(input)
    const requiredBase = Math.max(
      0,
      Number(input.theoryResult?.ciclos_restantes || input.theoryResult?.leads_restantes || 0),
    )
  
    const coverage = requiredBase > 0 ? (availableBase / requiredBase) * 100 : 100
  
    let score = 25
    let confidence: GoalViabilityConfidence = 'insuficiente'
  
    if (coverage >= 120) {
      score = 95
      confidence = 'alta'
    } else if (coverage >= 100) {
      score = 78
      confidence = 'moderada'
    } else if (coverage >= 80) {
      score = 48
      confidence = 'baixa'
    }
  
    return {
      availableBase,
      requiredBase,
      baseCoveragePct: Math.round(coverage),
      criterion: {
        id: 'available_base',
        label: 'Base disponível',
        value: `${formatNumber(availableBase)} disponíveis · ${formatNumber(requiredBase)} necessárias`,
        description:
          coverage >= 100
            ? 'A base atual comporta o volume necessário para executar o plano.'
            : 'A base atual não sustenta todo o volume necessário. Será preciso gerar, importar ou redistribuir mais oportunidades.',
        confidence,
        tone: getCriterionTone(score),
        score,
      },
    }
  }
  
  function getCapacityCriterion(input: GoalViabilityInput): {
    criterion: GoalViabilityCriterion
    totalDailyCapacity: number
    dailyCapacityUsagePct: number
  } {
    const dailyNeeded = Math.max(0, Number(input.theoryResult?.ciclos_restantes_por_dia || 0))
    const capacityPerSeller = Math.max(0, Number(input.dailyCapacityPerSeller || 0))
    const sellers = Math.max(1, Number(input.activeSellersCount || 1))
    const totalDailyCapacity = capacityPerSeller * sellers
  
    const usage = totalDailyCapacity > 0 ? (dailyNeeded / totalDailyCapacity) * 100 : 999
  
    let score = 20
    let confidence: GoalViabilityConfidence = 'insuficiente'
  
    if (usage <= 80) {
      score = 95
      confidence = 'alta'
    } else if (usage <= 100) {
      score = 78
      confidence = 'moderada'
    } else if (usage <= 130) {
      score = 48
      confidence = 'baixa'
    }
  
    return {
      totalDailyCapacity,
      dailyCapacityUsagePct: Math.round(usage),
      criterion: {
        id: 'daily_capacity',
        label: 'Capacidade diária',
        value: `${formatNumber(dailyNeeded)} necessárias/dia · capacidade ${formatNumber(totalDailyCapacity)}/dia`,
        description:
          usage <= 100
            ? 'O ritmo diário cabe dentro da capacidade informada para a equipe.'
            : 'O plano exige mais volume diário do que a capacidade informada. A meta tende a ficar frágil sem reforço operacional.',
        confidence,
        tone: getCriterionTone(score),
        score,
      },
    }
  }
  
  function getRecoveryCriterion(input: GoalViabilityInput): {
    criterion: GoalViabilityCriterion
    recoveryScenario: GoalViabilityRecoveryScenario
  } {
    const requiredBase = Math.max(
      0,
      Number(input.theoryResult?.ciclos_restantes || input.theoryResult?.leads_restantes || 0),
    )
  
    const scenario = buildRecoveryScenario(requiredBase, input.remainingBusinessDays)
    const increase = scenario.two_day_increase_pct
  
    let score = 30
    let confidence: GoalViabilityConfidence = 'baixa'
  
    if (increase <= 15) {
      score = 90
      confidence = 'alta'
    } else if (increase <= 30) {
      score = 70
      confidence = 'moderada'
    } else if (increase <= 50) {
      score = 48
      confidence = 'baixa'
    }
  
    return {
      recoveryScenario: scenario,
      criterion: {
        id: 'recovery_margin',
        label: 'Margem de atraso',
        value: `perder 2 dias aumenta o ritmo em ${increase}%`,
        description:
          increase <= 30
            ? 'O plano ainda possui margem razoável para pequenos atrasos.'
            : 'A margem de recuperação é baixa. Poucos dias sem execução podem tornar o ritmo diário pesado demais.',
        confidence,
        tone: getCriterionTone(score),
        score,
      },
    }
  }
  
  function getDistributionCriterion(input: GoalViabilityInput): GoalViabilityCriterion {
    const confidence = input.distribution?.summary?.confidence
    const score = scoreFromDistributionConfidence(confidence)
  
    return {
      id: 'distribution',
      label: 'Distribuição diária',
      value: input.distribution?.summary?.confidence_label
        ? `base ${input.distribution.summary.confidence_label.toLowerCase()}`
        : 'sem distribuição calculada',
      description:
        score >= 70
          ? 'A distribuição diária usa sinais operacionais suficientes para orientar a execução.'
          : 'A distribuição diária está conservadora por falta de sinais fortes. O plano ainda funciona, mas com menor precisão operacional.',
      confidence: confidenceFromScore(score),
      tone: getCriterionTone(score),
      score,
    }
  }
  
  function getStatusLabel(status: GoalViabilityStatus) {
    const labels: Record<GoalViabilityStatus, string> = {
      viavel: 'Plano viável',
      viavel_com_atencao: 'Plano viável com atenção',
      agressivo: 'Plano agressivo',
      fragil: 'Plano frágil',
      inviavel_base: 'Inviável pela base atual',
      inviavel_capacidade: 'Inviável pela capacidade atual',
    }
  
    return labels[status]
  }
  
  function getStatusTone(status: GoalViabilityStatus): GoalViabilityTone {
    if (status === 'viavel') return 'good'
    if (status === 'inviavel_base' || status === 'inviavel_capacidade' || status === 'fragil') return 'bad'
    return 'warn'
  }
  
  function buildStrengths(criteria: GoalViabilityCriterion[]) {
    return criteria
      .filter((criterion) => criterion.score >= 75)
      .map((criterion) => `${criterion.label}: ${criterion.description}`)
      .slice(0, 4)
  }
  
  function buildRisks(criteria: GoalViabilityCriterion[]) {
    return criteria
      .filter((criterion) => criterion.score < 60)
      .map((criterion) => `${criterion.label}: ${criterion.description}`)
      .slice(0, 4)
  }
  
  function buildActions(status: GoalViabilityStatus, input: GoalViabilityInput): string[] {
    const actions: string[] = []
  
    if (status === 'inviavel_base') {
      actions.push('Aumentar a base disponível antes de cobrar o plano de execução.')
      actions.push('Importar novos leads, redistribuir oportunidades do Pool ou reduzir a meta.')
    }
  
    if (status === 'inviavel_capacidade') {
      actions.push('Aumentar capacidade diária, distribuir esforço entre mais vendedores ou ampliar o prazo.')
      actions.push('Priorizar oportunidades em negociação e respondeu antes de abrir novos contatos frios.')
    }
  
    if (status === 'fragil' || status === 'agressivo') {
      actions.push('Acompanhar execução diariamente e revisar taxa de conversão no meio do período.')
      actions.push('Criar rotina de recuperação se dois dias de execução forem perdidos.')
    }
  
    if (status === 'viavel_com_atencao') {
      actions.push('Executar o plano mantendo controle diário de contatos, ganhos e próximas ações.')
      actions.push('Reavaliar o plano se a taxa real cair ou se o ticket médio realizado ficar abaixo do previsto.')
    }
  
    if (status === 'viavel') {
      actions.push('Executar o plano como rotina operacional e proteger a cadência diária.')
      actions.push('Usar o calendário de execução para evitar acúmulo no fim do período.')
    }
  
    if (!input.historicalTicket?.is_sufficient) {
      actions.push('Validar manualmente o ticket médio até existir base histórica suficiente.')
    }
  
    return Array.from(new Set(actions)).slice(0, 5)
  }
  
  export function buildGoalViability(input: GoalViabilityInput): GoalViabilityResult {
    const rateCriterion = getRateCriterion(input)
    const ticketCriterion = getTicketCriterion(input)
    const baseResult = getBaseCriterion(input)
    const capacityResult = getCapacityCriterion(input)
    const recoveryResult = getRecoveryCriterion(input)
    const distributionCriterion = getDistributionCriterion(input)
  
    const criteria = [
      rateCriterion,
      ticketCriterion,
      baseResult.criterion,
      capacityResult.criterion,
      recoveryResult.criterion,
      distributionCriterion,
    ]
  
    const weightedScore = Math.round(
      rateCriterion.score * 0.2 +
        ticketCriterion.score * 0.15 +
        baseResult.criterion.score * 0.25 +
        capacityResult.criterion.score * 0.25 +
        recoveryResult.criterion.score * 0.1 +
        distributionCriterion.score * 0.05,
    )
  
    let status: GoalViabilityStatus
  
    if (baseResult.baseCoveragePct < 80) {
      status = 'inviavel_base'
    } else if (capacityResult.dailyCapacityUsagePct > 130) {
      status = 'inviavel_capacidade'
    } else if (weightedScore >= 80) {
      status = 'viavel'
    } else if (weightedScore >= 65) {
      status = 'viavel_com_atencao'
    } else if (weightedScore >= 50) {
      status = 'agressivo'
    } else {
      status = 'fragil'
    }
  
    const tone = getStatusTone(status)
    const confidence = confidenceFromScore(weightedScore)
  
    const headline =
      status === 'viavel'
        ? 'A meta é operacionalmente executável com as premissas atuais.'
        : status === 'viavel_com_atencao'
          ? 'A meta é executável, mas precisa de acompanhamento diário.'
          : status === 'agressivo'
            ? 'A meta pode ser buscada, mas o plano exige alta disciplina operacional.'
            : status === 'fragil'
              ? 'O plano está frágil. Pequenas perdas de ritmo podem comprometer a meta.'
              : status === 'inviavel_base'
                ? 'A base atual não sustenta o volume necessário para a meta.'
                : 'A capacidade diária informada não sustenta o ritmo necessário.'
  
    const explanation =
      'Esta leitura não promete resultado automático. Ela valida se a meta é viável considerando taxa de conversão, ticket médio, base disponível, capacidade diária, distribuição e margem de atraso.'
  
    return {
      status,
      statusLabel: getStatusLabel(status),
      tone,
      score: clamp(weightedScore, 0, 100),
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      headline,
      explanation,
      strengths: buildStrengths(criteria),
      risks: buildRisks(criteria),
      recommendedActions: buildActions(status, input),
      criteria,
      recoveryScenario: recoveryResult.recoveryScenario,
      availableBase: baseResult.availableBase,
      requiredBase: baseResult.requiredBase,
      baseCoveragePct: baseResult.baseCoveragePct,
      totalDailyCapacity: capacityResult.totalDailyCapacity,
      dailyCapacityUsagePct: capacityResult.dailyCapacityUsagePct,
    }
  }