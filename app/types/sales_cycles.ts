// ==============================================================================
// Types: Sales Cycles
// ==============================================================================

/**
 * Estados possíveis de um ciclo de vendas.
 *
 * Estados abertos (ciclo ativo):
 *   'novo' | 'contato' | 'respondeu' | 'negociacao' | 'pausado'
 *
 * Estados fechados (ciclo encerrado):
 *   'ganho'   → exige won_at, closed_at (= won_at), won_owner_user_id
 *   'perdido' → exige lost_at, closed_at (= lost_at), lost_reason
 *
 * Estado especial:
 *   'cancelado' → exige canceled_at, canceled_reason
 */
export type LeadStatus =
  | 'novo'
  | 'contato'
  | 'respondeu'
  | 'negociacao'
  | 'pausado'
  | 'cancelado'
  | 'ganho'
  | 'perdido'

/** Estados que representam ciclos abertos (não finalizados) */
export const OPEN_STATUSES: LeadStatus[] = ['novo', 'contato', 'respondeu', 'negociacao', 'pausado']

/** Estados que representam ciclos fechados */
export const CLOSED_STATUSES: LeadStatus[] = ['ganho', 'perdido', 'cancelado']

export type CycleEventType =
  | 'cycle_created'
  | 'owner_assigned'
  | 'stage_changed'
  | 'contacted'
  | 'replied'
  | 'note_added'
  | 'next_action_set'
  | 'closed_won'
  | 'closed_lost'

export interface SalesCycle {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: LeadStatus
  previous_status: LeadStatus | null
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  current_group_id: string | null
  created_at: string
  updated_at: string
  // --- Campos de fechamento (regras Fase 1) ---
  /** Data de fechamento real: igual a won_at quando ganho, igual a lost_at quando perdido, NULL quando aberto */
  closed_at: string | null
  /** Preenchido somente quando status = 'ganho'. closed_at deve ser igual a won_at. */
  won_at: string | null
  /** Preenchido somente quando status = 'perdido'. closed_at deve ser igual a lost_at. */
  lost_at: string | null
  /** Vendedor congelado no momento do fechamento como ganho */
  won_owner_user_id: string | null
  /** Motivo da perda — obrigatório quando status = 'perdido' */
  lost_reason: string | null
  /** Valor total do ciclo ganho */
  won_total: number | null
}

export interface CycleEvent {
  id: string
  company_id: string
  cycle_id: string
  event_type: CycleEventType
  created_by: string
  metadata: Record<string, any>
  occurred_at: string
}

export interface LeadGroup {
  id: string
  company_id: string
  name: string
  created_by: string
  created_at: string
  archived_at: string | null
}

export interface LeadGroupCycle {
  id: string
  company_id: string
  group_id: string
  cycle_id: string
  attached_by: string
  detached_by: string | null
  attached_at: string
  detached_at: string | null
}

export interface Competency {
  id: string
  company_id: string
  month: string
  is_active: boolean
  created_at: string
}

export interface SalesCycleWithLead extends SalesCycle {
  lead?: {
    name: string
    phone: string | null
    email: string | null
  }
}

export interface PoolCycle {
  cycle_id: string
  cycle_status: LeadStatus
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  owner_user_id: string | null
  lead_id: string
  lead_name: string
  lead_phone: string | null
  lead_email: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface UserCycle {
  cycle_id: string
  cycle_status: LeadStatus
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  owner_user_id: string | null
  lead_id: string
  lead_name: string
  lead_phone: string | null
  lead_email: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface RpcCycleResponse {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: LeadStatus
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  current_group_id: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  error_message?: string | null
}

export interface MoveCycleStageRequest {
  cycle_id: string
  to_status: LeadStatus
  metadata?: Record<string, any>
}

export interface AssignCycleOwnerRequest {
  cycle_id: string
  owner_user_id: string
}

export interface SetNextActionRequest {
  cycle_id: string
  next_action: string
  next_action_date: string | Date
}

// Meio de pagamento (como o cliente pagou)
export type PaymentMethod =
  | 'credito'
  | 'debito'
  | 'pix'
  | 'dinheiro'
  | 'boleto'
  | 'transferencia'
  | 'misto'
  | 'outro'

// Estrutura da negociação (como foi parcelado / dividido)
export type PaymentType =
  | 'avista'
  | 'entrada_parcelas'
  | 'parcelado_sem_entrada'
  | 'recorrente'
  | 'outro'

export interface CloseCycleWonRequest {
  cycle_id: string
  won_value?: number
  // Produto
  product_id?: string | null
  won_unit_price?: number | null
  // Forma de pagamento
  payment_method?: PaymentMethod | null
  payment_type?: PaymentType | null
  entry_amount?: number | null
  installments_count?: number | null
  installment_amount?: number | null
  payment_notes?: string | null
}

export interface CloseCycleLostRequest {
  cycle_id: string
  loss_reason?: string
}
