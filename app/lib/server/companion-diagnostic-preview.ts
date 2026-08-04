import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CompanionDiagnosticModelOptions,
} from '../companion/diagnostic-model'

import {
  runCompanionDiagnosticEngine,
  type CompanionDiagnosticEngineDependencies,
  type CompanionDiagnosticEngineResult,
} from './companion-diagnostic-engine'

import type {
  CompanionTokenPayload,
} from './companion-token'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MEMBERSHIP_ROLES = [
  'admin',
  'manager',
  'member',
] as const

const LEAD_STATUSES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
] as const

const TERMINAL_STATUSES =
  new Set([
    'cancelado',
    'ganho',
    'perdido',
  ])

type JsonRecord =
  Record<string, unknown>

type MembershipRole =
  (typeof MEMBERSHIP_ROLES)[number]

type LeadStatus =
  (typeof LEAD_STATUSES)[number]

type EngineRunner =
  typeof runCompanionDiagnosticEngine

export type CompanionDiagnosticPreviewResult = {
  preview: {
    read_only: true
    persisted: false
    crm_changed: false
    cursor_advanced: false
  }

  engine:
    CompanionDiagnosticEngineResult
}

export type CompanionDiagnosticPreviewDependencies = {
  run_engine?: EngineRunner

  engine_dependencies?:
    CompanionDiagnosticEngineDependencies
}

export class CompanionDiagnosticPreviewError
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
      'CompanionDiagnosticPreviewError'

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
  throw new CompanionDiagnosticPreviewError({
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
    typeof value !== 'string'
  ) {
    fail({
      code:
        'INVALID_PREVIEW_ARGUMENT',

      message:
        `${path} precisa possuir um UUID válido.`,

      status_code: 400,
      retryable: false,
    })
  }

  const normalized =
    value.trim().toLowerCase()

  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    fail({
      code:
        'INVALID_PREVIEW_ARGUMENT',

      message:
        `${path} precisa possuir um UUID válido.`,

      status_code: 400,
      retryable: false,
    })
  }

  return normalized
}

function normalizeConversationKey(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    fail({
      code:
        'INVALID_PREVIEW_ARGUMENT',

      message:
        'conversation_key é obrigatória.',

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
        'INVALID_PREVIEW_ARGUMENT',

      message:
        'conversation_key possui um valor inválido.',

      status_code: 400,
      retryable: false,
    })
  }

  return normalized
}

function normalizeReferenceTime(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    fail({
      code:
        'INVALID_PREVIEW_ARGUMENT',

      message:
        'reference_time possui um valor inválido.',

      status_code: 400,
      retryable: false,
    })
  }

  const timestamp =
    Date.parse(value)

  if (
    !Number.isFinite(timestamp)
  ) {
    fail({
      code:
        'INVALID_PREVIEW_ARGUMENT',

      message:
        'reference_time possui uma data inválida.',

      status_code: 400,
      retryable: false,
    })
  }

  return new Date(
    timestamp,
  ).toISOString()
}

function isMembershipRole(
  value: unknown,
): value is MembershipRole {
  return (
    typeof value === 'string' &&
    MEMBERSHIP_ROLES.includes(
      value as MembershipRole,
    )
  )
}

function normalizeLeadStatus(
  value: unknown,
): LeadStatus {
  if (
    typeof value !== 'string' ||
    !LEAD_STATUSES.includes(
      value as LeadStatus,
    )
  ) {
    fail({
      code:
        'PREVIEW_CYCLE_INVALID',

      message:
        'O ciclo possui uma etapa comercial inválida.',

      status_code: 500,
      retryable: false,
    })
  }

  return value as LeadStatus
}

function normalizeNullableUuid(
  value: unknown,
  path: string,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  return normalizeUuid(
    value,
    path,
  )
}

function throwQueryFailure() {
  fail({
    code:
      'PREVIEW_QUERY_FAILED',

    message:
      'Não foi possível validar o acesso à prévia do diagnóstico.',

    status_code: 500,
    retryable: true,
  })
}

function validateMembership({
  membership,
  token,
}: {
  membership: unknown
  token: CompanionTokenPayload
}): MembershipRole {
  if (!isRecord(membership)) {
    fail({
      code:
        'PREVIEW_MEMBERSHIP_REQUIRED',

      message:
        'O usuário não possui vínculo ativo com a empresa do Companion.',

      status_code: 403,
      retryable: false,
    })
  }

  if (
    membership.company_id !==
      token.company_id ||
    membership.user_id !==
      token.sub ||
    membership.is_active !==
      true ||
    !isMembershipRole(
      membership.role,
    )
  ) {
    fail({
      code:
        'PREVIEW_MEMBERSHIP_REQUIRED',

      message:
        'O usuário não possui vínculo ativo com a empresa do Companion.',

      status_code: 403,
      retryable: false,
    })
  }

  return membership.role
}

function validateCycle({
  cycle,
  companyId,
  cycleId,
}: {
  cycle: unknown
  companyId: string
  cycleId: string
}) {
  if (!isRecord(cycle)) {
    fail({
      code:
        'PREVIEW_CYCLE_NOT_FOUND',

      message:
        'O ciclo comercial não foi encontrado.',

      status_code: 404,
      retryable: false,
    })
  }

  if (
    cycle.id !== cycleId ||
    cycle.company_id !==
      companyId
  ) {
    fail({
      code:
        'PREVIEW_SCOPE_VIOLATION',

      message:
        'O ciclo retornado está fora do escopo solicitado.',

      status_code: 500,
      retryable: false,
    })
  }

  return {
    owner_user_id:
      normalizeNullableUuid(
        cycle.owner_user_id,
        'cycle.owner_user_id',
      ),

    status:
      normalizeLeadStatus(
        cycle.status,
      ),
  }
}

function validateCyclePermission({
  role,
  ownerUserId,
  userId,
}: {
  role: MembershipRole
  ownerUserId: string | null
  userId: string
}) {
  const hasManagerAccess =
    role === 'admin' ||
    role === 'manager'

  if (
    !hasManagerAccess &&
    ownerUserId !== userId
  ) {
    fail({
      code:
        'PREVIEW_PERMISSION_DENIED',

      message:
        'Este ciclo não pertence à carteira do usuário.',

      status_code: 403,
      retryable: false,
    })
  }
}

export async function runCompanionDiagnosticPreview({
  admin,
  token,
  cycle_id,
  conversation_key,
  reference_time,
  model_options = {},
  dependencies = {},
}: {
  admin: SupabaseClient

  token:
    CompanionTokenPayload

  cycle_id: unknown
  conversation_key: unknown
  reference_time: unknown

  model_options?:
    CompanionDiagnosticModelOptions

  dependencies?:
    CompanionDiagnosticPreviewDependencies
}): Promise<
  CompanionDiagnosticPreviewResult
> {
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

  const referenceTime =
    normalizeReferenceTime(
      reference_time,
    )

  const {
    data: membership,
    error: membershipError,
  } = await admin
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

  if (membershipError) {
    throwQueryFailure()
  }

  const membershipRole =
    validateMembership({
      membership,
      token,
    })

  const {
    data: cycle,
    error: cycleError,
  } = await admin
    .from(
      'sales_cycles',
    )
    .select(
      'id, company_id, owner_user_id, status',
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

  if (cycleError) {
    throwQueryFailure()
  }

  const validatedCycle =
    validateCycle({
      cycle,
      companyId,
      cycleId,
    })

  if (
    TERMINAL_STATUSES.has(
      validatedCycle.status,
    )
  ) {
    fail({
      code:
        'PREVIEW_CYCLE_CLOSED',

      message:
        'A prévia do Companion V2 exige um ciclo comercial aberto.',

      status_code: 409,
      retryable: false,
    })
  }

  validateCyclePermission({
    role:
      membershipRole,

    ownerUserId:
      validatedCycle
        .owner_user_id,

    userId,
  })

  const runEngine =
    dependencies.run_engine ??
    runCompanionDiagnosticEngine

  const engine =
    await runEngine({
      admin,

      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      reference_time:
        referenceTime,

      model_options,

      dependencies:
        dependencies
          .engine_dependencies,
    })

  return {
    preview: {
      read_only: true,
      persisted: false,
      crm_changed: false,
      cursor_advanced: false,
    },

    engine,
  }
}
