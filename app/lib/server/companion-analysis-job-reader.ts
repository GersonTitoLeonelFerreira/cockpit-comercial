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
} from '../companion/stateful-copilot-contract'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from '../companion/stateful-communication-contract'

import {
  COMMERCIAL_READING_CONTRACT_VERSION,
  type CommercialReading,
} from '../companion/commercial-reading-contract'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ANALYSIS_JOB_ID_PATTERN =
  /^[a-f0-9]{64}$/

export const COMPANION_DEEP_SELLER_RESULT_CONTRACT_VERSION =
  'phase12a-deep-seller-v1' as const

type JsonRecord =
  Record<string, unknown>

export type CompanionDeepSellerResult = {
  contract_version:
    typeof COMPANION_DEEP_SELLER_RESULT_CONTRACT_VERSION

  engine_source:
    'stateful'

  commercial_relevance:
    string

  commercial_role:
    string

  summary:
    string

  commercial_reading:
    CommercialReading

  recommended_next_approach:
    string

  recommended_question:
    string | null

  suggested_message:
    string | null
}

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

function failNotFound(): never {
  fail({
    code:
      'ANALYSIS_JOB_NOT_FOUND',

    message:
      'A análise profunda não foi encontrada.',

    status_code: 404,
    retryable: false,
  })
}

function failIntegrity(): never {
  fail({
    code:
      'DEEP_RESULT_INTEGRITY_ERROR',

    message:
      'A análise profunda foi concluída, mas o resultado persistido está inconsistente.',

    status_code: 500,
    retryable: false,
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

function requiredString(
  value: unknown,
): string | null {
  return (
    typeof value === 'string' &&
    value.trim()
  )
    ? value.trim()
    : null
}

function nullableString(
  value: unknown,
): string | null | undefined {
  if (value === null) {
    return null
  }

  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim()
  }

  return undefined
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

async function loadCycleOwner({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<string | null> {
  const { data, error } =
    await admin
      .from(
        'sales_cycles',
      )
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

  if (
    !isRecord(data) ||
    data.id !== cycleId ||
    data.company_id !== companyId
  ) {
    failNotFound()
  }

  return typeof data.owner_user_id === 'string'
    ? data.owner_user_id
    : null
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
  if (
    role === 'admin' ||
    role === 'manager'
  ) {
    return
  }

  if (
    ownerUserId !== userId
  ) {
    failNotFound()
  }
}

function buildSellerResult(
  value: unknown,
): CompanionDeepSellerResult {
  if (
    !isRecord(value) ||
    value.contract_version !==
      STATEFUL_COPILOT_CONTRACT_VERSION
  ) {
    failIntegrity()
  }

  const interpretation =
    isRecord(value.interpretation)
      ? value.interpretation
      : null

  const currentMoment =
    interpretation &&
    isRecord(
      interpretation.current_moment,
    )
      ? interpretation.current_moment
      : null

  const strategy =
    isRecord(value.strategy)
      ? value.strategy
      : null

  const communication =
    isRecord(value.communication)
      ? value.communication
      : null

  const commercialReading =
    communication &&
    isRecord(
      communication.commercial_reading,
    )
      ? communication.commercial_reading
      : null

  const summary =
    requiredString(
      currentMoment?.summary,
    )

  const nextApproach =
    requiredString(
      strategy?.next_move,
    )

  const recommendedQuestion =
    nullableString(
      strategy?.recommended_question,
    )

  const suggestedMessage =
    nullableString(
      strategy?.suggested_message,
    )

  const commercialRelevance =
    requiredString(
      value.commercial_relevance,
    )

  const commercialRole =
    requiredString(
      value.commercial_role,
    )

  if (
    !communication ||
    communication.contract_version !==
      STATEFUL_COMMUNICATION_CONTRACT_VERSION ||
    !commercialReading ||
    commercialReading.contract_version !==
      COMMERCIAL_READING_CONTRACT_VERSION ||
    !summary ||
    !nextApproach ||
    recommendedQuestion === undefined ||
    suggestedMessage === undefined ||
    !commercialRelevance ||
    !commercialRole
  ) {
    failIntegrity()
  }

  return {
    contract_version:
      COMPANION_DEEP_SELLER_RESULT_CONTRACT_VERSION,

    engine_source:
      'stateful',

    commercial_relevance:
      commercialRelevance,

    commercial_role:
      commercialRole,

    summary,

    commercial_reading:
      commercialReading as unknown as CommercialReading,

    recommended_next_approach:
      nextApproach,

    recommended_question:
      recommendedQuestion,

    suggested_message:
      suggestedMessage,
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
  result: CompanionDeepSellerResult | null
  result_generated_at: string | null
}

export async function loadCompanionAnalysisJobStatus({
  admin,
  token,
  analysis_job_id,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
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

  /*
   * O único identificador aceito do cliente é analysis_job_id.
   * company_id vem do token. cycle/conversation/version são sempre
   * derivados server-side da linha autorizada do job.
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

  if (
    !isRecord(job) ||
    job.analysis_job_id !== analysisJobId ||
    job.company_id !== companyId ||
    !isStatefulCopilotBackgroundJobStatus(
      job.status,
    ) ||
    typeof job.message_watermark !== 'string'
  ) {
    failNotFound()
  }

  const cycleId =
    normalizeUuid(
      job.cycle_id,
      'job.cycle_id',
    )

  const conversationKey =
    requiredString(
      job.conversation_key,
    )

  if (!conversationKey) {
    failIntegrity()
  }

  const ownerUserId =
    await loadCycleOwner({
      admin,
      companyId,
      cycleId,
    })

  validateCyclePermission({
    role,
    ownerUserId,
    userId,
  })

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
    failIntegrity()
  }

  const {
    data: events,
    error: eventError,
  } =
    await admin
      .from(
        'companion_commercial_state_events',
      )
      .select(
        'normalized_output, generated_at, company_id, cycle_id, conversation_key, candidate_state_version, output_contract_version',
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
      .eq(
        'output_contract_version',
        STATEFUL_COPILOT_CONTRACT_VERSION,
      )
      .limit(2)

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

  if (
    !Array.isArray(events) ||
    events.length !== 1
  ) {
    failIntegrity()
  }

  const event =
    events[0]

  if (
    !isRecord(event) ||
    event.company_id !== companyId ||
    event.cycle_id !== cycleId ||
    event.conversation_key !== conversationKey ||
    event.candidate_state_version !== candidateStateVersion ||
    event.output_contract_version !==
      STATEFUL_COPILOT_CONTRACT_VERSION ||
    typeof event.generated_at !== 'string'
  ) {
    failIntegrity()
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
      buildSellerResult(
        event.normalized_output,
      ),
    result_generated_at:
      event.generated_at,
  }
}
