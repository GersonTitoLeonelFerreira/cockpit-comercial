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

import { verifyActiveCompanionProfile } from './companion-principal-access'

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

export type CompanionMembershipRow = {
  company_id: string
  user_id: string
  role: string | null
  is_active: boolean
}

// O token Companion dura até 6 horas e carrega a role vigente NO MOMENTO
// EM QUE FOI EMITIDO. Se a role de alguém mudar no meio desse período
// (promoção ou rebaixamento), o token antigo continua dizendo a role
// antiga até expirar. Para busca/vínculo de lead — uma ação de escrita
// sensível a portfolio — a autoridade de role tem que ser a membership
// ATUAL do banco, nunca tokenPayload.role.
//
// A role autorizativa deve ser sempre a membership ATUAL do banco, nunca
// tokenPayload.role, porque o token Companion pode permanecer válido
// depois de downgrade/upgrade de role.
//
// Hardening (STEP 2A.4, "REVOGAÇÃO GLOBAL IMEDIATA"): membership ativa
// sozinha não basta — um usuário com profiles.is_active_global=false
// precisa perder acesso IMEDIATAMENTE, mesmo com company_memberships
// ainda ativa e um Companion token ainda válido por horas. A revalidação
// do profile acontece aqui, dentro da mesma checagem de membership, para
// que nenhum dos dois call sites (link-lead/route.ts e
// link-lead/search/route.ts) precise duplicar essa consulta.
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
    .select('company_id, user_id, role, is_active')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return {
      active: false,
      role: null as string | null,
      error: 'Não foi possível validar o vínculo do usuário.',
    }
  }

  const membership = (data as CompanionMembershipRow | null) ?? null

  if (!membership?.company_id) {
    return { active: false, role: null as string | null, error: null as string | null }
  }

  const profileAccess = await verifyActiveCompanionProfile({ admin, userId })

  if (profileAccess.error) {
    return { active: false, role: null as string | null, error: profileAccess.error }
  }

  if (!profileAccess.active) {
    return { active: false, role: null as string | null, error: null as string | null }
  }

  return {
    active: true,
    role: membership.role ?? null,
    error: null as string | null,
  }
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
    return {
      cycles: [] as CompanionSalesCycleRow[],
      error: 'Não foi possível validar os ciclos comerciais.',
    }
  }

  return {
    cycles: ((data ?? []) as CompanionSalesCycleRow[]).filter(
      (cycle) => cycle.company_id === companyId,
    ),
    error: null as string | null,
  }
}

// Todos os ciclos (qualquer status) cujo owner_user_id é o próprio
// usuário, na empresa do token — SEM limite de linhas, porque é usado
// para decidir a carteira de um member ANTES do filtro de texto da busca:
// truncar aqui poderia descartar um lead que o próprio usuário tem
// permissão de ver/vincular (STEP 2A.2, item 4 da correção). O universo
// de "ciclos que eu já possuí" de um único vendedor é naturalmente
// pequeno (nunca company-wide), então não há o mesmo risco de scan
// custoso que uma busca sem filtro de dono teria.
export async function loadOpenCyclesOwnedByUser({
  admin,
  companyId,
  userId,
}: {
  admin: AnySupabaseAdminClient
  companyId: string
  userId: string
}) {
  const { data, error } = await admin
    .from('sales_cycles')
    .select('id, lead_id, company_id, status, owner_user_id, updated_at, created_at')
    .eq('company_id', companyId)
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })

  if (error) {
    return {
      cycles: [] as CompanionSalesCycleRow[],
      error: 'Não foi possível validar os ciclos comerciais.',
    }
  }

  return {
    cycles: ((data ?? []) as CompanionSalesCycleRow[]).filter(
      (cycle) => cycle.company_id === companyId && cycle.owner_user_id === userId,
    ),
    error: null as string | null,
  }
}

// Dado o conjunto de ciclos possuídos por um único usuário (função acima),
// devolve, por lead_id, se o ciclo aplicável (mais recente, resolvido do
// mesmo jeito que resolve-lead resolve) é realmente um ciclo aberto desse
// usuário — nunca um lead onde o ciclo aplicável real (calculado a partir
// de TODOS os ciclos do lead) pertenceria a outra pessoa. Como este projeto
// nunca mantém dois ciclos abertos simultâneos para o mesmo lead (um novo
// ciclo só é aberto depois que o anterior fecha), a existência de QUALQUER
// ciclo não fechado deste usuário para um lead já basta para saber que é
// ele o dono do ciclo aplicável — não precisa carregar os ciclos de todos
// os outros donos para confirmar.
export function indexOwnedLeadsByApplicableOpenCycle(cyclesOwnedByUser: CompanionSalesCycleRow[]) {
  const byLead = new Map<string, CompanionSalesCycleRow[]>()

  for (const cycle of cyclesOwnedByUser) {
    const existing = byLead.get(cycle.lead_id) ?? []
    existing.push(cycle)
    byLead.set(cycle.lead_id, existing)
  }

  const ownedLeadCycle = new Map<string, CompanionSalesCycleRow>()

  for (const [leadId, cyclesForLead] of byLead) {
    const { openCycle } = pickApplicableCycle(cyclesForLead)

    if (openCycle) {
      ownedLeadCycle.set(leadId, openCycle)
    }
  }

  return ownedLeadCycle
}

export function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

// Remove tudo que poderia ter efeito especial dentro de um padrão
// ILIKE/LIKE construído manualmente como `%${termo}%`: "%" e "_" são
// wildcards (qualquer sequência / qualquer caractere), "\" é o caractere
// de escape padrão do Postgres para eles. Removidos em vez de escapados
// para manter o mesmo comportamento simples de app/api/search/route.ts —
// nenhum deles pode funcionar como wildcard controlado pelo cliente
// (nunca reabre "%": "__", "_%", "%_" nunca viram busca ampla/enumeração).
export function sanitizeSearchTerm(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[%_\\(),']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
