// ==============================================================================
// Types: Simulator / Meta
// ==============================================================================

export interface SimulatorConfig {
    target_wins: number
    close_rate: number
    ticket_medio: number
    remaining_business_days: number
  }
  
  export interface SimulatorMetrics {
    company_id: string
    month_start: string
    month_end: string
    owner_user_id: string | null
    is_admin: boolean
    current_wins: number
    worked_count: number
    total_open: number
    total_pool: number
    counts_by_status: {
      novo: number
      contato: number
      respondeu: number
      negociacao: number
      ganho: number
      perdido: number
    }
  }
  
  export interface SimulatorResult {
    needed_wins: number
    remaining_wins: number
    needed_worked_cycles: number
    remaining_worked_cycles: number
    daily_worked_needed: number
    daily_worked_remaining: number
    simulation_15pct: number
    simulation_25pct: number
    progress_pct: number
    on_track: boolean
  }
  
  export interface ActiveCompetency {
    month: string
    month_start: string
    month_end: string
  }

  export interface GroupConversionRow {
    group_id: string | null
    group_name: string
    novo: number
    contato: number
    respondeu: number
    negociacao: number
    ganho: number
    perdido: number
    trabalhados: number
    pct_grupo: number
    pct_participacao: number
  }