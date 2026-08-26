import type { getAuthedSupabase } from '@/app/lib/supabase/server'
import {
  buildCommercialMethodDefinitionFromConstruction,
  suggestInitialMethodConstruction,
} from '@/app/lib/commercial-config/assisted-method-construction'
import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialMethodConstructionDraft,
  CommercialMethodConstructionRecord,
  CommercialMethodConstructionSaveInput,
  CommercialMethodConstructionStatus,
} from '@/app/types/commercial-method-construction'
import type {
  CommercialMethodDefinition,
  CommercialMethodValidationIssue,
} from '@/app/lib/companion/commercial-method-contract'

type CommercialMethodConstructionSupabase = Awaited<
  ReturnType<typeof getAuthedSupabase>
>['supabase']

const FIELDS = `
  company_id,
  ready_for_method,
  draft_data,
  method_construction_status,
  method_construction,
  method_definition,
  method_started_at,
  method_updated_at,
  updated_at
`

type ConstructionRow = {
  company_id: string
  ready_for_method: boolean
  draft_data: CommercialMethodBuilderData
  method_construction_status: CommercialMethodConstructionStatus
  method_construction: CommercialMethodConstructionDraft | null
  method_definition: CommercialMethodDefinition | null
  method_started_at: string | null
  method_updated_at: string | null
  updated_at: string
}

function mapRow(row: ConstructionRow): CommercialMethodConstructionRecord {
  return {
    company_id: row.company_id,
    ready_for_method: row.ready_for_method,
    diagnosis: row.draft_data,
    status: row.method_construction_status,
    construction: row.method_construction,
    method_definition: row.method_definition,
    method_started_at: row.method_started_at,
    method_updated_at: row.method_updated_at,
    updated_at: row.updated_at,
  }
}

export class CommercialMethodConstructionValidationError extends Error {
  readonly issues: CommercialMethodValidationIssue[]

  constructor(issues: CommercialMethodValidationIssue[]) {
    super('O método ainda possui pontos obrigatórios antes da revisão final.')
    this.name = 'CommercialMethodConstructionValidationError'
    this.issues = issues
  }
}

export async function getCommercialMethodConstruction(
  supabase: CommercialMethodConstructionSupabase,
  companyId: string,
): Promise<CommercialMethodConstructionRecord | null> {
  const { data, error } = await supabase
    .from('company_commercial_method_builder_drafts')
    .select(FIELDS)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao carregar a construção do método: ${error.message}`)
  }

  return data ? mapRow(data as ConstructionRow) : null
}

export async function startCommercialMethodConstruction(
  supabase: CommercialMethodConstructionSupabase,
  companyId: string,
  userId: string,
): Promise<CommercialMethodConstructionRecord> {
  const current = await getCommercialMethodConstruction(supabase, companyId)

  if (!current) {
    throw new Error('Conclua primeiro o diagnóstico da operação.')
  }

  if (!current.ready_for_method) {
    throw new Error('O diagnóstico ainda não está pronto para construir o método.')
  }

  if (current.construction) {
    return current
  }

  const construction = suggestInitialMethodConstruction(current.diagnosis)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('company_commercial_method_builder_drafts')
    .update({
      method_construction_status: 'editing',
      method_construction: construction,
      method_definition: null,
      method_started_at: current.method_started_at ?? now,
      method_updated_at: now,
      updated_by: userId,
    })
    .eq('company_id', companyId)
    .select(FIELDS)
    .single()

  if (error) {
    throw new Error(`Erro ao iniciar a construção do método: ${error.message}`)
  }

  return mapRow(data as ConstructionRow)
}

export async function saveCommercialMethodConstruction(
  supabase: CommercialMethodConstructionSupabase,
  companyId: string,
  userId: string,
  input: CommercialMethodConstructionSaveInput,
): Promise<CommercialMethodConstructionRecord> {
  const current = await getCommercialMethodConstruction(supabase, companyId)

  if (!current?.ready_for_method) {
    throw new Error('O diagnóstico precisa estar concluído antes de construir o método.')
  }

  let definition: CommercialMethodDefinition | null = null

  if (input.status === 'review_ready') {
    const compiled = buildCommercialMethodDefinitionFromConstruction(input.construction)
    if (!compiled.validation.valid) {
      throw new CommercialMethodConstructionValidationError(compiled.validation.issues)
    }
    definition = compiled.definition
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('company_commercial_method_builder_drafts')
    .update({
      method_construction_status: input.status,
      method_construction: input.construction,
      method_definition: definition,
      method_started_at: current.method_started_at ?? now,
      method_updated_at: now,
      updated_by: userId,
    })
    .eq('company_id', companyId)
    .select(FIELDS)
    .single()

  if (error) {
    throw new Error(`Erro ao salvar a construção do método: ${error.message}`)
  }

  return mapRow(data as ConstructionRow)
}
