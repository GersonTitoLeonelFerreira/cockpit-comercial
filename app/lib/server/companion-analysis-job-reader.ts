import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CompanionTokenPayload,
} from './companion-token'

import {
  isStatefulCopilotBackgroundJobStatus,
  type StatefulCopilotBackgroundJobStatus,
} from './stateful-copilot-background-job'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
  type StatefulCopilotOutput,
} from '../companion/stateful-copilot-contract'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ANALYSIS_JOB_ID_PATTERN =
  /^[a-f0-9]{64}$/

type JsonRecord =
  Record<string, unknown>

export class CompanionAnalysisJobReadError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean

  constructor({
    code,
    message,
    status_code,
    retryable,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
  }) {
    super(message)

    this.name =
      'CompanionAnalysisJobReadError'

    this.code =
      code

    this.status_code =
      status_code

    this.retryable =
      retryable
  }
}

function fail({
  code,
  message,
  status_code,
  retryable,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
}): never {
  throw new CompanionAnalysisJobReadError({
    code,
    message,
    status_code,
    retryable,
  })
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeUuid(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(
      value.trim(),
    )
  ) {
    fail({
      code:
        'INVALID_ANALYSIS_JOB_ARGUMENT',

      message:
        `${path} precisa ser um UUID válido.`,

      status_code: 400,
      retryable: false,
    })
  }

  return value
    .trim()
    .toLowerCase()
}

function normalizeConversationKey(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    fail({
      code:
        'INVALID_ANALYSIS_JOB_ARGUMENT',

      message:
        'conversation_key precisa ser um texto.',

      status_code: 400,
      retryable: false,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > 500
  ) {
    fail({
      code:
        'INVALID_ANALYSIS_JOB_ARGUMENT',

      message:
        'conversation_key possui um valor inválido.',

      status_code: 400,
      retryable: false,
    })
  }

  return normalized
}

function normalizeAnalysisJobId(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    !ANALYSIS_JOB_ID_PATTERN.test(
      value.trim(),
    )
  ) {
    fail({
      code:
        'INVALID_ANALYSIS_JOB_ARGUMENT',

      message:
        'analysis_job_id possui um valor inválido.',

      status_code: 400,
      retryable: false,
    })
  }

  return value
    .trim()
    .toLowerCase()
}

async function validateMembership({
  admin,
  companyId,
  userId,
}: {
  admin: SupabaseClient
  companyId: string
  userId: string
}): Promise<
  'admin' | 'manager' | 'member'
> {
  const { data, error } =
    await admin
      .from(
        'company_memberships',
      )
      .select(
        'company_id, user_id, role, is_active',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'user_id',
        userId,
      )
      .eq(
        'is_active',
        true,
      )
      .maybeSingle()

  if (error) {
    fail({
      code:
        'ANALYSIS_JOB_QUERY_FAILED',

      message:
        'Não foi possível validar o vínculo com a empresa.',

      status_code: 500,
      retryable: true,
    })
  }

  if (
    !isRecord(data) ||
    data.company_id !== companyId ||
    data.user_id !== userId ||
    (
      data.role !== 'admin' &&
      data.role !== 'manager' &&
      data.role !== 'member'
    )
  ) {
    fail({
      code:
        'ANALYSIS_JOB_MEMBERSHIP_REQUIRED',

      message:
        'Usuário sem vínculo ativo com a empresa do Companion.',

      status_code: 403,
      retryable: false,
    })
  }

  return data.role
}

async function loadCycle({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<{
  owner_user_id: string | null
}> {
  const { data, error } =
    await admin
      .from('sales_cycles')
      .select(
        'id, company_id, owner_user_id',
      )
      .eq(
        'id',
        cycleId,
      )
      .eq(
        'company_id',
        companyId,
      )
      .maybeSingle()

  if (error) {
    fail({
      code:
        'ANALYSIS_JOB_QUERY_FAILED',

      message:
        'Não foi possível carregar o ciclo comercial.',

      status_code: 500,
      retryable: true,
    })
  }

  if (!isRecord(data)) {
    fail({
      code:
        'ANALYSIS_JOB_CYCLE_NOT_FOUND',

      message:
        'O ciclo comercial não foi encontrado para a empresa informada.',

      status_code: 404,
      retryable: false,
    })
  }

  if (
    data.id !== cycleId ||
    data.company_id !== companyId
  ) {
    fail({
      code:
        'ANALYSIS_JOB_SCOPE_VIOLATION',

      message:
        'O ciclo retornado está fora do escopo solicitado.',

      status_code: 500,
      retryable: false,
    })
  }

  return {
    owner_user_id:
      typeof data.owner_user_id === 'string'
        ? data.owner_user_id
        : null,
  }
}

function validateCyclePermission({
  role,
  ownerUserId,
  userId,
}: {
  role: 'admin' | 'manager' | 'member'
  ownerUserId: string | null
  userId: string
}): void {
  const hasManagerAccess =
    role === 'admin' ||
    role === 'manager'

  if (
    !hasManagerAccess &&
    ownerUserId !== userId
  ) {
    fail({
      code:
        'ANALYSIS_JOB_PERMISSION_DENIED',

      message:
        'Este ciclo não pertence à carteira do usuário.',

      status_code: 403,
      retryable: false,
    })
  }
}

export type CompanionAnalysisJobStatusResult = {
  analysis_job_id: string
  status: StatefulCopilotBackgroundJobStatus
  cycle_id: string
  conversation_key: string
  message_watermark: string
  candidate_state_version: number | null
  failure_code: string | null
  result: StatefulCopilotOutput | null
  result_generated_at: string | null
}

export async function loadCompanionAnalysisJobStatus({
  admin,
  token,
  cycle_id,
  conversation_key,
  analysis_job_id,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  cycle_id: unknown
  conversation_key: unknown
  analysis_job_id: unknown
}): Promise<CompanionAnalysisJobStatusResult> {
  const companyId =
    normalizeUuid(
      token.company_id,
      'token.company_id',
    )

  const userId =
    normalizeUuid(
      token.sub,
      'token.sub',
    )

  const cycleId =
    normalizeUuid(
      cycle_id,
      'cycle_id',
    )

  const conversationKey =
    normalizeConversationKey(
      conversation_key,
    )

  const analysisJobId =
    normalizeAnalysisJobId(
      analysis_job_id,
    )

  const role =
    await validateMembership({
      admin,
      companyId,
      userId,
    })

  const cycle =
    await loadCycle({
      admin,
      companyId,
      cycleId,
    })

  validateCyclePermission({
    role,

    ownerUserId:
      cycle.owner_user_id,

    userId,
  })

  /*
   * O analysis_job_id sozinho nunca é aceito como chave de busca.
   * A linha só é devolvida quando company_id, cycle_id e
   * conversation_key (todos derivados de identidade autenticada e
   * autorizada acima, nunca do valor bruto enviado pelo cliente)
   * também batem — uma tentativa de Empresa A ler analysis_job_id de
   * Empresa B (ou de outro ciclo/conversa da mesma empresa) sempre
   * resulta em nenhuma linha encontrada.
   */
  const {
    data: job,
    error: jobError,
  } =
    await admin
      .from(
        'companion_background_analysis_jobs',
      )
      .select(
        'analysis_job_id, status, company_id, cycle_id, conversation_key, message_watermark, candidate_state_version, failure_code',
      )
      .eq(
        'analysis_job_id',
        analysisJobId,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        cycleId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .maybeSingle()

  if (jobError) {
    fail({
      code:
        'ANALYSIS_JOB_QUERY_FAILED',

      message:
        'Não foi possível carregar o status da análise profunda.',

      status_code: 500,
      retryable: true,
    })
  }

  if (!isRecord(job)) {
    fail({
      code:
        'ANALYSIS_JOB_NOT_FOUND',

      message:
        'A análise profunda não foi encontrada para o escopo informado.',

      status_code: 404,
      retryable: false,
    })
  }

  if (
    job.analysis_job_id !== analysisJobId ||
    job.company_id !== companyId ||
    job.cycle_id !== cycleId ||
    job.conversation_key !== conversationKey ||
    !isStatefulCopilotBackgroundJobStatus(
      job.status,
    ) ||
    typeof job.message_watermark !== 'string'
  ) {
    fail({
      code:
        'ANALYSIS_JOB_SCOPE_VIOLATION',

      message:
        'O job retornado está fora do escopo solicitado.',

      status_code: 500,
      retryable: false,
    })
  }

  const candidateStateVersion =
    typeof job.candidate_state_version === 'number' &&
    Number.isInteger(job.candidate_state_version) &&
    job.candidate_state_version > 0
      ? job.candidate_state_version
      : null

  const failureCode =
    typeof job.failure_code === 'string'
      ? job.failure_code
      : null

  if (job.status !== 'succeeded') {
    return {
      analysis_job_id: analysisJobId,
      status: job.status,
      cycle_id: cycleId,
      conversation_key: conversationKey,
      message_watermark: job.message_watermark,
      candidate_state_version: candidateStateVersion,
      failure_code: failureCode,
      result: null,
      result_generated_at: null,
    }
  }

  if (candidateStateVersion === null) {
    fail({
      code:
        'ANALYSIS_JOB_RESULT_MISSING',

      message:
        'A análise profunda foi concluída, mas o resultado persistido não foi localizado.',

      status_code: 500,
      retryable: false,
    })
  }

  const {
    data: event,
    error: eventError,
  } =
    await admin
      .from(
        'companion_commercial_state_events',
      )
      .select(
        'normalized_output, generated_at, company_id, cycle_id, conversation_key, candidate_state_version',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        cycleId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .eq(
        'candidate_state_version',
        candidateStateVersion,
      )
      .maybeSingle()

  if (eventError) {
    fail({
      code:
        'ANALYSIS_JOB_QUERY_FAILED',

      message:
        'Não foi possível carregar o resultado da análise profunda.',

      status_code: 500,
      retryable: true,
    })
  }

  if (!isRecord(event)) {
    fail({
      code:
        'ANALYSIS_JOB_RESULT_MISSING',

      message:
        'A análise profunda foi concluída, mas o resultado persistido não foi localizado.',

      status_code: 500,
      retryable: false,
    })
  }

  if (
    event.company_id !== companyId ||
    event.cycle_id !== cycleId ||
    event.conversation_key !== conversationKey ||
    event.candidate_state_version !== candidateStateVersion ||
    !isRecord(event.normalized_output) ||
    event.normalized_output.contract_version !==
      STATEFUL_COPILOT_CONTRACT_VERSION ||
    typeof event.generated_at !== 'string'
  ) {
    fail({
      code:
        'ANALYSIS_JOB_SCOPE_VIOLATION',

      message:
        'O resultado retornado está fora do escopo solicitado.',

      status_code: 500,
      retryable: false,
    })
  }

  return {
    analysis_job_id: analysisJobId,
    status: job.status,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    message_watermark: job.message_watermark,
    candidate_state_version: candidateStateVersion,
    failure_code: failureCode,
    result:
      event.normalized_output as unknown as StatefulCopilotOutput,
    result_generated_at: event.generated_at,
  }
}
