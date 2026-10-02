// "Nova oportunidade" pelo Companion a partir de um ciclo fechado
// (decisão do Controle Mestre, 01/10/2026). Mesmas regras da ação
// "+ Nova oportunidade" da Yolen (SuccessorOpportunityAction →
// /api/sales-cycles/successor → rpc_create_successor_cycle_for_company),
// com uma restrição a mais: pelo Companion a oportunidade nova é sempre de
// quem cria (Pool, distribuição e outro vendedor ficam na Yolen).
//
// Esta avaliação é a MESMA para a capability do resolve-lead
// (can_create_successor_opportunity) e para a rota de criação; a RPC
// rpc_create_successor_cycle_from_companion refaz tudo no banco.

export const SUCCESSOR_OPPORTUNITY_TYPES = [
  'reativacao',
  'renovacao',
  'recompra',
  'upgrade',
  'novo_produto',
] as const

export type SuccessorOpportunityType =
  (typeof SUCCESSOR_OPPORTUNITY_TYPES)[number]

// Rótulos da Yolen (SuccessorOpportunityAction).
export const SUCCESSOR_OPPORTUNITY_TYPE_LABELS: Record<
  SuccessorOpportunityType,
  string
> = {
  reativacao: 'Reativação',
  renovacao: 'Renovação',
  recompra: 'Recompra',
  upgrade: 'Upgrade',
  novo_produto: 'Novo produto',
}

export function isSuccessorOpportunityType(
  value: unknown,
): value is SuccessorOpportunityType {
  return (
    typeof value === 'string' &&
    (SUCCESSOR_OPPORTUNITY_TYPES as readonly string[]).includes(value)
  )
}

// Predicado da Yolen e do índice idx_sales_cycles_lead_active_unique:
// qualquer status fora de ganho/perdido conta como oportunidade aberta
// (inclusive cancelado).
// "O que é esta oportunidade?" (opcional, rodada 6). Mesmo teto da RPC
// (left(btrim(p_note), 2000)); meia surrogate vira U+FFFD para o corpo do
// PostgREST nunca ser recusado (PGRST102). Desligado (sem a leitura
// completa), a nota é ignorada como antes: p_note null.
export const SUCCESSOR_NOTE_MAX_LENGTH = 2000

const LONE_SURROGATE_IN_NOTE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export function readSuccessorNote(
  value: unknown,
  enabled: boolean,
): string | null {
  if (!enabled || typeof value !== 'string') {
    return null
  }

  // O corte no teto pode partir um emoji: a limpeza vem depois dele.
  const note = value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SUCCESSOR_NOTE_MAX_LENGTH)
    .replace(LONE_SURROGATE_IN_NOTE, '\uFFFD')
    .trim()

  return note || null
}

const SUCCESSOR_SOURCE_STATUSES = ['ganho', 'perdido']

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export type SuccessorEligibilityReason =
  | 'membership_not_found'
  | 'lead_not_available'
  | 'source_cycle_not_found'
  | 'source_cycle_not_terminal'
  | 'permission_denied'
  | 'active_cycle_exists'

export type SuccessorEligibilityCycle = {
  id: string
  status: string | null
  owner_user_id: string | null
  won_owner_user_id?: string | null
  lost_owner_user_id?: string | null
}

export function evaluateSuccessorOpportunityEligibility({
  actorUserId,
  role,
  lead,
  sourceCycle,
  cycles,
}: {
  actorUserId: string | null | undefined
  role: string | null | undefined
  lead: { deleted_at?: string | null } | null | undefined
  sourceCycle: SuccessorEligibilityCycle | null | undefined
  cycles: Pick<SuccessorEligibilityCycle, 'status'>[]
}): { eligible: boolean; reason: SuccessorEligibilityReason | null } {
  const deny = (reason: SuccessorEligibilityReason) => ({
    eligible: false,
    reason,
  })

  if (
    !actorUserId ||
    (role !== 'admin' && role !== 'manager' && role !== 'member')
  ) {
    return deny('membership_not_found')
  }

  if (!lead || lead.deleted_at) {
    return deny('lead_not_available')
  }

  if (!sourceCycle) {
    return deny('source_cycle_not_found')
  }

  const sourceStatus =
    normalizeStatus(sourceCycle.status)

  if (!SUCCESSOR_SOURCE_STATUSES.includes(sourceStatus)) {
    return deny('source_cycle_not_terminal')
  }

  const terminalOwnerId =
    sourceStatus === 'ganho'
      ? sourceCycle.won_owner_user_id ?? null
      : sourceCycle.lost_owner_user_id ?? null

  if (
    role === 'member' &&
    sourceCycle.owner_user_id !== actorUserId &&
    terminalOwnerId !== actorUserId
  ) {
    return deny('permission_denied')
  }

  if (
    cycles.some(
      (cycle) =>
        !SUCCESSOR_SOURCE_STATUSES.includes(normalizeStatus(cycle.status)),
    )
  ) {
    return deny('active_cycle_exists')
  }

  return { eligible: true, reason: null }
}

// Mensagens para o vendedor (sem dado de cliente).
export const SUCCESSOR_ERROR_MESSAGES: Record<string, string> = {
  active_cycle_exists:
    'Este lead já tem uma oportunidade aberta. Só pode haver uma oportunidade aberta por lead.',
  permission_denied:
    'Você só pode criar uma nova oportunidade a partir de um ciclo que foi seu.',
  source_cycle_not_terminal:
    'Nova oportunidade só pode ser criada a partir de um ciclo Ganho ou Perdido.',
  source_cycle_not_found:
    'Ciclo de origem não encontrado.',
  lead_not_available:
    'Este lead não está disponível para uma nova oportunidade.',
  membership_not_found:
    'Usuário sem vínculo ativo com a empresa.',
  invalid_opportunity_type:
    'Escolha o tipo da nova oportunidade.',
  not_authenticated:
    'Sessão do Companion inválida ou expirada.',
}

export function getSuccessorErrorHttpStatus(code: string) {
  if (code === 'active_cycle_exists') return 409
  if (code === 'source_cycle_not_terminal') return 409
  if (code === 'lead_not_available') return 409
  if (code === 'source_cycle_not_found') return 404
  if (code === 'permission_denied' || code === 'membership_not_found') return 403
  if (code === 'not_authenticated') return 401
  if (code === 'invalid_opportunity_type') return 400
  return 400
}
