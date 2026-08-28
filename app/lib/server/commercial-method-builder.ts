import type { getAuthedSupabase } from '@/app/lib/supabase/server'
import type {
  CommercialMethodBuilderDraftInput,
  CommercialMethodBuilderDraftRecord,
} from '../../types/commercial-method-builder'
import { COMMERCIAL_METHOD_BUILDER_CONTRACT_VERSION } from '../../types/commercial-method-builder'

type CommercialMethodBuilderSupabase = Awaited<
  ReturnType<typeof getAuthedSupabase>
>['supabase']

const BUILDER_FIELDS = `
  id,
  company_id,
  contract_version,
  current_step,
  completed_steps,
  ready_for_method,
  draft_data,
  created_by,
  updated_by,
  created_at,
  updated_at
`

type BuilderRow = {
  id: string
  company_id: string
  contract_version: string
  current_step: number
  completed_steps: number[]
  ready_for_method: boolean
  draft_data: CommercialMethodBuilderDraftInput['data']
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

function mapBuilderRow(row: BuilderRow): CommercialMethodBuilderDraftRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    contract_version: COMMERCIAL_METHOD_BUILDER_CONTRACT_VERSION,
    current_step: row.current_step as CommercialMethodBuilderDraftRecord['current_step'],
    completed_steps:
      row.completed_steps as CommercialMethodBuilderDraftRecord['completed_steps'],
    ready_for_method: row.ready_for_method,
    data: row.draft_data,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function getCommercialMethodBuilderDraft(
  supabase: CommercialMethodBuilderSupabase,
  companyId: string,
): Promise<CommercialMethodBuilderDraftRecord | null> {
  const { data, error } = await supabase
    .from('company_commercial_method_builder_drafts')
    .select(BUILDER_FIELDS)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Erro ao carregar o rascunho assistido: ${error.message}`,
    )
  }

  if (!data) {
    return null
  }

  return mapBuilderRow(data as BuilderRow)
}

export class CommercialMethodBuilderStaleWriteError extends Error {
  constructor() {
    super(
      'Este diagnóstico foi alterado em outra sessão. Recarregue a página antes de salvar novamente.',
    )
    this.name = 'CommercialMethodBuilderStaleWriteError'
  }
}

export async function saveCommercialMethodBuilderDraft(
  supabase: CommercialMethodBuilderSupabase,
  companyId: string,
  userId: string,
  input: CommercialMethodBuilderDraftInput,
  expectedUpdatedAt?: string | null,
): Promise<CommercialMethodBuilderDraftRecord> {
  const existing = await getCommercialMethodBuilderDraft(
    supabase,
    companyId,
  )

  const payload = {
    contract_version:
      COMMERCIAL_METHOD_BUILDER_CONTRACT_VERSION,
    current_step: input.current_step,
    completed_steps: input.completed_steps,
    ready_for_method: input.ready_for_method,
    draft_data: input.data,
    updated_by: userId,
  }

  if (existing) {
    let updateQuery = supabase
      .from('company_commercial_method_builder_drafts')
      .update(payload)
      .eq('company_id', companyId)
      .eq('id', existing.id)

    if (expectedUpdatedAt) {
      updateQuery = updateQuery.eq('updated_at', expectedUpdatedAt)
    }

    const { data, error } = await updateQuery
      .select(BUILDER_FIELDS)
      .maybeSingle()

    if (error) {
      throw new Error(
        `Erro ao salvar o rascunho assistido: ${error.message}`,
      )
    }

    if (!data) {
      throw new CommercialMethodBuilderStaleWriteError()
    }

    return mapBuilderRow(data as BuilderRow)
  }

  const { data, error } = await supabase
    .from('company_commercial_method_builder_drafts')
    .insert({
      company_id: companyId,
      created_by: userId,
      ...payload,
    })
    .select(BUILDER_FIELDS)
    .single()

  if (error) {
    throw new Error(
      `Erro ao salvar o rascunho assistido: ${error.message}`,
    )
  }

  return mapBuilderRow(data as BuilderRow)
}
