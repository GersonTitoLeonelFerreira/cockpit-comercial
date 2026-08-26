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
// ONDA 8 / FRENTE A (isolamento) + correção: a ponte NUNCA reaproveita o
// rascunho comercial geral da empresa, e a RPC — não o TypeScript — é a
// fonte de verdade de "o que publicar" e de idempotência. Este código só
// valida cedo (para uma mensagem de erro rápida e amigável) e passa
// method_updated_at como valor esperado, para que o banco rejeite uma
// publicação baseada em builder desatualizado. O cliente não pode mais
// injetar uma definição arbitrária: a RPC lê o builder ela mesma.
// ============================================================================

export type CommercialMethodPublishErrorCode =
  | 'NOT_REVIEW_READY'
  | 'INVALID_DEFINITION'
  | 'STALE_METHOD_BUILDER'
  | 'NO_BASE_COMMERCIAL_CONFIG'
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

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return null
}

function errorMessage(error: unknown, fallback: string): string {
  return extractErrorMessage(error) ?? fallback
}

// Comparação estrutural, insensível à ordem de chaves de objeto (jsonb do
// Postgres não garante preservar a ordem de inserção), mas sensível à ordem
// de listas (a ordem das etapas e dos princípios importa). Usada aqui só
// para a verificação pós-publicação — a idempotência em si é decidida no
// banco (comparação jsonb `=`, com a mesma semântica).
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
  already_published: boolean
}

function classifyPublishRpcError(
  error: unknown,
): CommercialMethodPublishErrorCode {
  const message = extractErrorMessage(error) ?? ''

  if (message.includes('desde que a página foi carregada')) {
    return 'STALE_METHOD_BUILDER'
  }

  if (message.includes('Ainda não existe uma configuração comercial publicada')) {
    return 'NO_BASE_COMMERCIAL_CONFIG'
  }

  if (
    message.includes('pronto para revisão final') ||
    message.includes('construção do método ainda não foi iniciada')
  ) {
    return 'NOT_REVIEW_READY'
  }

  if (message.includes('não está no contrato commercial-method-v2')) {
    return 'INVALID_DEFINITION'
  }

  return 'PUBLISH_FAILED'
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

  // A RPC é a fonte de verdade: ela relê o builder ela mesma (o cliente
  // não envia mais a definição do método) e decide idempotência dentro do
  // advisory lock. method_updated_at aqui é só o valor esperado, para que
  // o banco rejeite uma publicação baseada em estado desatualizado.
  const { data, error } = await supabase.rpc(
    'rpc_publish_builder_commercial_method',
    {
      p_company_id: companyId,
      p_expected_method_updated_at: construction.method_updated_at,
    },
  )

  if (error) {
    throw new CommercialMethodPublishError(
      classifyPublishRpcError(error),
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
  // contém exatamente o método construído na jornada guiada — e que o
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
    already_published: row.already_published,
  }
}
