// Camada compartilhada mínima de autorização de lead para o Companion,
// usada pelos dois endpoints de STEP 2A.2 (busca de leads vinculáveis e
// first-link): app/api/companion/link-lead/search/route.ts e
// app/api/companion/link-lead/route.ts.
//
// A regra de "o usuário pode agir sobre este lead" é extraída
// DELIBERADAMENTE do mesmo conceito já usado por
// app/api/companion/resolve-lead/route.ts para decidir OWNED_BY_ME:
// existe um ciclo comercial aberto (não ganho/perdido/cancelado) cujo
// owner_user_id é o próprio usuário. Nunca a partir de leads.created_by,
// nunca apenas de company_id. Isso garante que busca e vínculo nunca
// divirjam da mesma definição de carteira que o resto do Companion já usa
// — ver STEP 2A.2, seção 6/7 da missão.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseAdminClient = any

export type CompanionSalesCycleRow = {
  id: string
  lead_id: string
  company_id: string
  status: string | null
  owner_user_id: string | null
  updated_at: string | null
  created_at: string | null
}

const CORS_ALLOWED_ORIGINS = [
  'https://web.whatsapp.com',
  'https://cockpit-comercial-vocn.vercel.app',
  'http://localhost:3000',
]

// Mesmo padrão de CORS de app/api/companion/resolve-lead/route.ts,
// extraído aqui para não duplicar entre os dois novos endpoints (nunca
// mais permissivo que o original).
export function getCompanionCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')

  const allowOrigin =
    CORS_ALLOWED_ORIGINS.includes(origin) || isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

// Mesma lista de status "fechados" de resolve-lead/route.ts
// (isClosedStatus) — um ciclo nesse status nunca é o "ciclo aplicável"
// para decidir posse.
export function isClosedCycleStatus(status: string | null | undefined) {
  return ['ganho', 'perdido', 'cancelado'].includes(String(status ?? '').toLowerCase())
}

export function isAdminOrManagerRole(role: string | null | undefined) {
  return role === 'admin' || role === 'manager'
}

// cyclesForLead precisa já estar filtrado para um único lead_id e
// ordenado como resolve-lead ordena (updated_at desc, created_at desc).
export function pickApplicableCycle(cyclesForLead: CompanionSalesCycleRow[]) {
  const openCycle = cyclesForLead.find((cycle) => !isClosedCycleStatus(cycle.status)) ?? null
  const latestCycle = openCycle ?? cyclesForLead[0] ?? null

  return { openCycle, latestCycle }
}

// Mesma definição de OWNED_BY_ME de resolve-lead: ciclo aberto existe e o
// owner_user_id desse ciclo é o próprio usuário.
export function isLeadOwnedByUser({
  cyclesForLead,
  userId,
}: {
  cyclesForLead: CompanionSalesCycleRow[]
  userId: string
}) {
  const { openCycle } = pickApplicableCycle(cyclesForLead)
  return Boolean(openCycle && openCycle.owner_user_id === userId)
}

// Regra única de autorização de vínculo, compartilhada entre busca (filtra
// candidatos) e first-link (revalida antes de chamar a RPC) — nunca duas
// interpretações. Admin/manager seguem a visibilidade company-wide já
// existente no Companion (nunca precisam ser owner do ciclo); member só
// pode vincular lead que esteja em OWNED_BY_ME.
export function canUserLinkLead({
  role,
  userId,
  cyclesForLead,
}: {
  role: string | null | undefined
  userId: string
  cyclesForLead: CompanionSalesCycleRow[]
}) {
  if (isAdminOrManagerRole(role)) {
    return true
  }

  return isLeadOwnedByUser({ cyclesForLead, userId })
}

export async function verifyActiveCompanionMembership({
  admin,
  companyId,
  userId,
}: {
  admin: AnySupabaseAdminClient
  companyId: string
  userId: string
}) {
  const { data, error } = await admin
    .from('company_memberships')
    .select('company_id, user_id, is_active')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return { active: false, error: error.message as string }
  }

  return { active: Boolean(data?.company_id), error: null as string | null }
}

export async function loadSalesCyclesForLead({
  admin,
  companyId,
  leadId,
}: {
  admin: AnySupabaseAdminClient
  companyId: string
  leadId: string
}) {
  const { data, error } = await admin
    .from('sales_cycles')
    .select('id, lead_id, company_id, status, owner_user_id, updated_at, created_at')
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })

  if (error) {
    return { cycles: [] as CompanionSalesCycleRow[], error: error.message as string }
  }

  return {
    cycles: ((data ?? []) as CompanionSalesCycleRow[]).filter(
      (cycle) => cycle.company_id === companyId,
    ),
    error: null as string | null,
  }
}

export function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

export function sanitizeSearchTerm(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[%(),']/g, ' ')
    .replace(/\s+/g, ' ')
}

// Nunca retorna o telefone completo — só o suficiente para o vendedor
// distinguir leads na lista de resultados (STEP 2A.2, seção 9).
export function maskPhoneHint(phone: string | null | undefined) {
  const digits = onlyDigits(phone)

  if (digits.length < 4) {
    return null
  }

  return `•••• ${digits.slice(-4)}`
}
