import type { getAuthedSupabase } from '@/app/lib/supabase/server'
import {
  validateCommercialMethodDefinition,
} from '@/app/lib/companion/commercial-method-contract'
import type {
  CommercialMethodDefinition,
  CommercialMethodValidationIssue,
} from '@/app/lib/companion/commercial-method-contract'
import { getCommercialConfigWorkspace } from '@/app/lib/server/commercial-config'
import { getCommercialMethodConstruction } from '@/app/lib/server/commercial-method-construction'

type CommercialMethodPublishSupabase = Awaited<
  ReturnType<typeof getAuthedSupabase>
>['supabase']

// ============================================================================
// Publica, de forma explícita e isolada, o método comercial produzido pela
// Guided Commercial Method Journey.
//
// A construção assistida (company_commercial_method_builder_drafts) só
// materializa method_definition quando review_ready; ela nunca publica
// company_commercial_config_versions sozinha. Esta função é a ponte
// explícita entre as duas tabelas.
//
// ONDA 8 / FRENTE A: a ponte NUNCA reaproveita o rascunho comercial geral
// da empresa (produtos/fatos/objeções/tom em edição pelo gestor). Ela chama
// rpc_publish_builder_commercial_method, que constrói a nova versão
// publicada exclusivamente a partir da versão PUBLICADA atual — o
// rascunho geral, se existir, nunca é lido nem alterado. "Publicar
// método" nunca publica silenciosamente uma alteração comercial paralela
// não relacionada ao método.
// ============================================================================

export type CommercialMethodPublishErrorCode =
  | 'NOT_REVIEW_READY'
  | 'INVALID_DEFINITION'
  | 'PUBLISH_FAILED'
  | 'VERIFICATION_FAILED'

export class CommercialMethodPublishError extends Error {
  readonly code: CommercialMethodPublishErrorCode
  readonly issues?: CommercialMethodValidationIssue[]

  constructor(
    code: CommercialMethodPublishErrorCode,
    message: string,
    issues?: CommercialMethodValidationIssue[],
  ) {
    super(message)
    this.name = 'CommercialMethodPublishError'
    this.code = code
    this.issues = issues
  }
}

export interface PublishBuilderCommercialMethodResult {
  company_id: string
  config_version_id: string
  version_number: number
  published_at: string
  method_name: string
  method_definition: CommercialMethodDefinition
  previous_published_version_number: number | null
  already_published: boolean
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

// Comparação estrutural, insensível à ordem de chaves de objeto (jsonb do
// Postgres não garante preservar a ordem de inserção), mas sensível à ordem
// de listas (a ordem das etapas e dos princípios importa).
function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqualJson(item, b[index]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord)
    const bKeys = Object.keys(bRecord)

    if (aKeys.length !== bKeys.length) return false

    return aKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(bRecord, key) &&
        deepEqualJson(aRecord[key], bRecord[key]),
    )
  }

  return false
}

type PublishRpcRow = {
  company_id: string
  config_version_id: string
  version_number: number
  status: string
  published_at: string | null
}

export async function publishBuilderCommercialMethod(
  supabase: CommercialMethodPublishSupabase,
  companyId: string,
): Promise<PublishBuilderCommercialMethodResult> {
  const construction = await getCommercialMethodConstruction(
    supabase,
    companyId,
  )

  if (
    !construction ||
    construction.status !== 'review_ready' ||
    !construction.method_definition
  ) {
    throw new CommercialMethodPublishError(
      'NOT_REVIEW_READY',
      'O método precisa estar pronto para revisão final antes de ser publicado.',
    )
  }

  const methodDefinition = construction.method_definition
  const validation = validateCommercialMethodDefinition(methodDefinition)

  if (!validation.valid) {
    throw new CommercialMethodPublishError(
      'INVALID_DEFINITION',
      'O método construído não passa nas validações do contrato commercial-method-v2.',
      validation.issues,
    )
  }

  const workspaceBefore = await getCommercialConfigWorkspace(
    supabase,
    companyId,
  )
  const previousPublishedVersionNumber =
    workspaceBefore.published?.version.version_number ?? null

  // Idempotência: se a versão publicada já reflete exatamente este método,
  // não há nada a fazer. Cobre retry, clique duplo e refresh depois de uma
  // publicação que já havia sido concluída.
  if (
    workspaceBefore.published &&
    workspaceBefore.published.version.commercial_method_contract_version ===
      'commercial-method-v2' &&
    deepEqualJson(
      workspaceBefore.published.version.commercial_method_definition,
      methodDefinition,
    )
  ) {
    return {
      company_id: companyId,
      config_version_id: workspaceBefore.published.version.id,
      version_number: workspaceBefore.published.version.version_number,
      published_at:
        workspaceBefore.published.version.published_at ??
        new Date().toISOString(),
      method_name: workspaceBefore.published.version.commercial_method_name,
      method_definition: methodDefinition,
      previous_published_version_number: previousPublishedVersionNumber,
      already_published: true,
    }
  }

  const { data, error } = await supabase.rpc(
    'rpc_publish_builder_commercial_method',
    {
      p_company_id: companyId,
      p_method_definition: methodDefinition,
    },
  )

  if (error) {
    throw new CommercialMethodPublishError(
      'PUBLISH_FAILED',
      errorMessage(
        error,
        'Erro ao publicar o método. O método anterior continua ativo.',
      ),
    )
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | PublishRpcRow
    | undefined

  if (!row) {
    throw new CommercialMethodPublishError(
      'PUBLISH_FAILED',
      'A publicação do método não retornou o resultado esperado.',
    )
  }

  // Fonte de verdade é o banco: relê a versão publicada e comprova que ela
  // contém exatamente o método compilado pela jornada guiada — e que o
  // rascunho comercial geral, se existir, permanece intacto e ainda
  // rascunho — antes de reportar sucesso.
  const workspaceAfter = await getCommercialConfigWorkspace(
    supabase,
    companyId,
  )
  const published = workspaceAfter.published

  if (
    !published ||
    published.version.id !== row.config_version_id ||
    published.version.status !== 'published' ||
    published.version.commercial_method_contract_version !==
      'commercial-method-v2' ||
    !deepEqualJson(
      published.version.commercial_method_definition,
      methodDefinition,
    )
  ) {
    throw new CommercialMethodPublishError(
      'VERIFICATION_FAILED',
      'A publicação não pôde ser confirmada no banco de dados.',
    )
  }

  return {
    company_id: companyId,
    config_version_id: published.version.id,
    version_number: published.version.version_number,
    published_at: published.version.published_at ?? new Date().toISOString(),
    method_name: published.version.commercial_method_name,
    method_definition: methodDefinition,
    previous_published_version_number: previousPublishedVersionNumber,
    already_published: false,
  }
}
