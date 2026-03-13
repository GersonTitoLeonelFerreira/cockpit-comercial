// ==============================================================================
// Types: Simulator Rate Real (V2.1)
// ==============================================================================

export interface CloseRateMetrics {
    owner_user_id: string | null
    wins: number
    worked: number
    close_rate: number | null
  }
  
  export interface CloseRateRealResponse {
    success: boolean
    days_window: number
    vendor: CloseRateMetrics
    company: CloseRateMetrics
  }