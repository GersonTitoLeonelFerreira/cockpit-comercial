import type {
    HistoricalTicketResponse,
    SimulatorMetrics,
    Theory10020Result,
  } from '@/app/types/simulator'
  import type { CloseRateRealResponse } from '@/app/types/simulatorRateReal'
  import type { DailyGoalDistribution, DistributionConfidence } from '@/app/types/distribution'
  
  export type GoalViabilityStatus =
    | 'viavel'
    | 'viavel_com_atencao'
    | 'agressivo'
    | 'fragil'
    | 'inviavel_base'
    | 'inviavel_capacidade'
  
  export type GoalViabilityTone = 'good' | 'warn' | 'bad' | 'neutral'
  
  export type GoalViabilityConfidence = 'alta' | 'moderada' | 'baixa' | 'insuficiente'
  
  export interface GoalViabilityCriterion {
    id: string
    label: string
    value: string
    description: string
    confidence: GoalViabilityConfidence
    tone: GoalViabilityTone
    score: number
  }
  
  export interface GoalViabilityRecoveryScenario {
    current_daily_needed: number
    if_loses_1_day: number
    if_loses_2_days: number
    if_loses_3_days: number
    two_day_increase_pct: number
  }
  
  export interface GoalViabilityInput {
    theoryResult: Theory10020Result | null
    metrics: SimulatorMetrics | null
    closeRateReal: CloseRateRealResponse | null
    historicalTicket: HistoricalTicketResponse | null
    distribution: DailyGoalDistribution | null
    remainingBusinessDays: number
    dailyCapacityPerSeller: number
    activeSellersCount: number
  }
  
  export interface GoalViabilityResult {
    status: GoalViabilityStatus
    statusLabel: string
    tone: GoalViabilityTone
    score: number
    confidence: GoalViabilityConfidence
    confidenceLabel: string
    headline: string
    explanation: string
    strengths: string[]
    risks: string[]
    recommendedActions: string[]
    criteria: GoalViabilityCriterion[]
    recoveryScenario: GoalViabilityRecoveryScenario
    availableBase: number
    requiredBase: number
    baseCoveragePct: number
    totalDailyCapacity: number
    dailyCapacityUsagePct: number
  }
  
  export interface GoalViabilitySourceData {
    distributionConfidence?: DistributionConfidence
  }