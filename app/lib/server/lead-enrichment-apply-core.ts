import type { SupabaseClient } from '@supabase/supabase-js'

import {
  areLeadEnrichmentValuesEqual,
  type LeadEnrichmentUpdateField,
} from '@/app/lib/companion/lead-enrichment-update-contract'

// STEP 2B.5-D1.1 (hardening do Lead Enrichment): núcleo ÚNICO de
// aplicação de enriquecimento — reaproveitado por
// app/api/companion/enrich-lead/route.ts (WhatsApp, leadId conhecido
// pelo cliente) e app/api/companion/apply-manychat-lead-enrichment/route.ts
// (ManyChat, cliente NUNCA conhece leadId — sempre derivado aqui a
// partir de cycleId). Nenhuma regra comercial (ownership/status do
// ciclo/stale-check/conflito de e-mail ou documento/RPC) é reimplementada
// em nenhum dos dois callers.
type LeadRow = {
  id: string
  company_id: string
  email: string | null
  cpf_cnpj: string | null
  deleted_at: string | null
}

type LeadProfileRow = {
  lead_id: string
  company_id: string
  email: string | null
  cpf: string | null
  cnpj: string | null
  birth_date: string | null
  profession: string | null
  cep: string | null
  phone_mobile: string | null
}

type CycleRow = {
  id: string
  lead_id: string
  company_id: string
  status: string | null
  owner_user_id: string | null
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function isClosedCycleStatus(value: unknown) {
  return ['ganho', 'perdido', 'cancelado'].includes(
    String(value ?? '').toLowerCase(),
  )
}

function getCurrentFieldValue(
  field: LeadEnrichmentUpdateField,
  lead: LeadRow,
  profile: LeadProfileRow | null,
) {
  if (field === 'email') {
    return lead.email || profile?.email || null
  }

  if (field === 'cpf') {
    if (profile?.cpf) return profile.cpf
    const document = onlyDigits(lead.cpf_cnpj)
    return document.length === 11 ? document : null
  }

  if (field === 'cnpj') {
    if (profile?.cnpj) return profile.cnpj
    const document = onlyDigits(lead.cpf_cnpj)
    return document.length === 14 ? document : null
  }

  if (field === 'birth_date') {
    return profile?.birth_date || null
  }

  if (field === 'profession') {
    return profile?.profession || null
  }

  if (field === 'cep') {
    return profile?.cep || null
  }

  if (field === 'phone_mobile') {
    return profile?.phone_mobile || null
  }

  return null
}

export type ApplyLeadEnrichmentCoreParams = {
  admin: SupabaseClient
  companyId: string
  userId: string
  isAdminOrManager: boolean
  cycleId: string
  // Presente apenas quando o CALLER (WhatsApp) já conhece o lead — o
  // core verifica que ele bate com o lead_id real do ciclo, nunca
  // confia nele isoladamente. Ausente no caller do ManyChat: o core
  // deriva sozinho a partir do ciclo.
  leadId?: string | null
  field: LeadEnrichmentUpdateField
  value: string
  expectedCurrentValue: string | null
  evidenceMessageIds: string[]
  // Section 6 do hardening: para telefone, o telefone atual NUNCA pode
  // vir do content script — o core sempre lê lead_profiles.phone_mobile
  // agora mesmo e usa esse valor como expected_current_value da RPC,
  // ignorando o que veio no payload. Passado explicitamente pelo
  // caller (nunca decidido por input do usuário) — true no ManyChat,
  // false no WhatsApp (que já expõe o telefone atual ao seu próprio
  // content script via RESOLVE_LEAD, então preserva o comportamento já
  // testado sem mudança funcional).
  forceServerDerivedPhoneExpectedValue: boolean
}

export type ApplyLeadEnrichmentCoreResult = {
  status: number
  body: Record<string, unknown>
}

export async function applyLeadEnrichmentCore(
  params: ApplyLeadEnrichmentCoreParams,
): Promise<ApplyLeadEnrichmentCoreResult> {
  const {
    admin,
    companyId,
    userId,
    isAdminOrManager,
    cycleId,
    leadId,
    field,
    value,
    evidenceMessageIds,
    forceServerDerivedPhoneExpectedValue,
  } = params

  let expectedCurrentValue = params.expectedCurrentValue

  const { data: cycleData, error: cycleError } = await admin
    .from('sales_cycles')
    .select('id, lead_id, company_id, status, owner_user_id')
    .eq('id', cycleId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (cycleError) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'cycle_search_error',
        error: 'Não foi possível validar o ciclo.',
      },
    }
  }

  const cycle = cycleData as CycleRow | null

  if (!cycle?.id || !cycle.lead_id) {
    return {
      status: 404,
      body: {
        ok: false,
        code: 'cycle_not_found',
        error: 'Ciclo não encontrado para esta empresa.',
      },
    }
  }

  // Defesa em profundidade: se o caller já afirmou um leadId (WhatsApp),
  // ele precisa bater com o lead_id REAL do ciclo — nunca confiado
  // isoladamente. Resposta idêntica a "ciclo não encontrado" (nunca
  // revela se o mismatch é o motivo real).
  if (leadId && leadId !== cycle.lead_id) {
    return {
      status: 404,
      body: {
        ok: false,
        code: 'cycle_not_found',
        error: 'Ciclo não encontrado para este lead.',
      },
    }
  }

  const resolvedLeadId = cycle.lead_id

  if (isClosedCycleStatus(cycle.status)) {
    return {
      status: 409,
      body: {
        ok: false,
        code: 'cycle_closed',
        error: 'O ciclo comercial está encerrado.',
      },
    }
  }

  if (!isAdminOrManager && cycle.owner_user_id !== userId) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'not_cycle_owner',
        error: 'Este lead não pertence à sua carteira.',
      },
    }
  }

  const { data: leadData, error: leadError } = await admin
    .from('leads')
    .select('id, company_id, email, cpf_cnpj, deleted_at')
    .eq('id', resolvedLeadId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (leadError) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'lead_search_error',
        error: 'Não foi possível validar o lead.',
      },
    }
  }

  const lead = leadData as LeadRow | null

  if (!lead?.id || lead.deleted_at) {
    return {
      status: 404,
      body: {
        ok: false,
        code: 'lead_unavailable',
        error: 'Lead inexistente ou indisponível.',
      },
    }
  }

  const { data: profileData, error: profileError } = await admin
    .from('lead_profiles')
    .select('lead_id, company_id, email, cpf, cnpj, birth_date, profession, cep, phone_mobile')
    .eq('lead_id', resolvedLeadId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (profileError) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'profile_search_error',
        error: 'Não foi possível consultar o cadastro atual.',
      },
    }
  }

  const profile = profileData as LeadProfileRow | null

  const currentValue = getCurrentFieldValue(field, lead, profile)

  // Section 6 do hardening: telefone nunca cruza a fronteira vindo do
  // content — o compare-and-set usa o valor que o PRÓPRIO servidor
  // acabou de ler, nunca o que o cliente enviou.
  if (field === 'phone_mobile' && forceServerDerivedPhoneExpectedValue) {
    expectedCurrentValue = currentValue
  }

  if (!areLeadEnrichmentValuesEqual(field, currentValue, expectedCurrentValue)) {
    return {
      status: 409,
      body: {
        ok: false,
        code: 'stale_current_value',
        error: 'O cadastro mudou desde que a sugestão foi criada. Atualize o Companion antes de confirmar.',
      },
    }
  }

  if (field === 'email') {
    const { data: conflict, error: conflictError } = await admin
      .from('leads')
      .select('id')
      .eq('company_id', companyId)
      .eq('email_norm', value)
      .neq('id', resolvedLeadId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (conflictError) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'email_conflict_search_error',
          error: 'Não foi possível validar o e-mail.',
        },
      }
    }

    if (conflict?.id) {
      return {
        status: 409,
        body: {
          ok: false,
          code: 'email_conflict',
          error: 'Este e-mail já pertence a outro lead da empresa.',
        },
      }
    }
  }

  if (field === 'cpf' || field === 'cnpj') {
    const { data: conflict, error: conflictError } = await admin
      .from('lead_profiles')
      .select('lead_id')
      .eq('company_id', companyId)
      .eq(field, value)
      .neq('lead_id', resolvedLeadId)
      .limit(1)
      .maybeSingle()

    if (conflictError) {
      return {
        status: 400,
        body: {
          ok: false,
          code: 'document_conflict_search_error',
          error: 'Não foi possível validar o documento.',
        },
      }
    }

    if (conflict?.lead_id) {
      return {
        status: 409,
        body: {
          ok: false,
          code: 'document_conflict',
          error: 'Este documento já pertence a outro lead da empresa.',
        },
      }
    }
  }

  const { data: applyData, error: applyError } = await admin.rpc(
    'companion_apply_lead_enrichment',
    {
      p_company_id: companyId,
      p_user_id: userId,
      p_lead_id: resolvedLeadId,
      p_cycle_id: cycleId,
      p_field: field,
      p_value: value,
      p_expected_current_value: expectedCurrentValue,
      p_evidence_message_ids: evidenceMessageIds,
      p_confirmed_by_human: true,
    },
  )

  if (applyError) {
    return {
      status: 500,
      body: {
        ok: false,
        code: 'enrichment_transaction_error',
        error: 'Não foi possível concluir a atualização cadastral.',
      },
    }
  }

  const applyResult =
    applyData && typeof applyData === 'object' && !Array.isArray(applyData)
      ? (applyData as Record<string, unknown>)
      : null

  if (!applyResult || applyResult.ok !== true) {
    const code = typeof applyResult?.code === 'string' ? applyResult.code : 'enrichment_rejected'
    const error =
      typeof applyResult?.error === 'string'
        ? applyResult.error
        : 'A atualização cadastral foi rejeitada.'

    const status = ['no_company_permission', 'not_cycle_owner'].includes(code)
      ? 403
      : ['lead_unavailable', 'cycle_not_found'].includes(code)
        ? 404
        : ['cycle_closed', 'stale_current_value', 'email_conflict', 'document_conflict'].includes(code)
          ? 409
          : 400

    return { status, body: { ok: false, code, error } }
  }

  return {
    status: 200,
    body: {
      ok: true,
      status: 'LEAD_ENRICHMENT_APPLIED',
      lead_id: resolvedLeadId,
      cycle_id: cycleId,
      field,
      value,
      evidence_message_ids: evidenceMessageIds,
      confirmation: 'human',
      already_applied: applyResult.already_applied === true,
    },
  }
}
