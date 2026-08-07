import {
  resolveCompanionEngineVersion,
  type CompanionEngineVersion,
} from './engine-version'

export const STATEFUL_COPILOT_ACTIVATION_MODES = [
  'disabled',
  'shadow',
  'active',
] as const

export type StatefulCopilotActivationMode =
  (typeof STATEFUL_COPILOT_ACTIVATION_MODES)[number]

export const DEFAULT_STATEFUL_COPILOT_ACTIVATION_MODE:
  StatefulCopilotActivationMode =
    'disabled'

export type StatefulCopilotActivationReason =
  | 'globally_disabled'
  | 'company_not_allowed'
  | 'shadow_enabled'
  | 'active_engine_version_required'
  | 'active_enabled'

export type StatefulCopilotActivationDecision = {
  mode:
    StatefulCopilotActivationMode

  company_id:
    string

  allowed_company_ids:
    string[]

  engine_version:
    CompanionEngineVersion | null

  enabled:
    boolean

  should_execute_stateful:
    boolean

  should_persist_stateful_state:
    boolean

  should_expose_stateful_result:
    boolean

  preserve_v1_response:
    boolean

  automatic_crm_write:
    false

  automatic_agenda_write:
    false

  reason:
    StatefulCopilotActivationReason
}

export type ResolveStatefulCopilotActivationGateArgs = {
  company_id:
    unknown

  configured_mode?:
    unknown

  configured_company_ids?:
    unknown

  configured_engine_version?:
    string | null
}

export class StatefulCopilotActivationGateError
  extends Error {
  readonly code:
    string

  readonly path:
    string

  constructor({
    code,
    path,
    message,
  }: {
    code: string
    path: string
    message: string
  }) {
    super(message)

    this.name =
      'StatefulCopilotActivationGateError'

    this.code =
      code

    this.path =
      path
  }
}

function fail({
  code,
  path,
  message,
}: {
  code: string
  path: string
  message: string
}): never {
  throw new StatefulCopilotActivationGateError({
    code,
    path,
    message,
  })
}

function normalizeCompanyId(
  value: unknown,
  path: string,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_STATEFUL_COMPANY_ID',

      path,

      message:
        `${path} precisa ser um UUID.`,
    })
  }

  const normalized =
    value
      .trim()
      .toLowerCase()

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  if (
    normalized !== value.trim().toLowerCase() ||
    !uuidPattern.test(normalized)
  ) {
    fail({
      code:
        'INVALID_STATEFUL_COMPANY_ID',

      path,

      message:
        `${path} precisa ser um UUID válido.`,
    })
  }

  return normalized
}

function normalizeMode(
  value: unknown,
): StatefulCopilotActivationMode {
  if (
    value === undefined ||
    value === null
  ) {
    return DEFAULT_STATEFUL_COPILOT_ACTIVATION_MODE
  }

  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_STATEFUL_ACTIVATION_MODE',

      path:
        'configured_mode',

      message:
        'COMPANION_STATEFUL_MODE possui um valor inválido.',
    })
  }

  const normalized =
    value
      .trim()
      .toLowerCase()

  if (!normalized) {
    return DEFAULT_STATEFUL_COPILOT_ACTIVATION_MODE
  }

  if (
    !STATEFUL_COPILOT_ACTIVATION_MODES.includes(
      normalized as StatefulCopilotActivationMode,
    )
  ) {
    fail({
      code:
        'INVALID_STATEFUL_ACTIVATION_MODE',

      path:
        'configured_mode',

      message:
        'COMPANION_STATEFUL_MODE deve ser disabled, shadow ou active.',
    })
  }

  return normalized as StatefulCopilotActivationMode
}

function normalizeAllowedCompanyIds(
  value: unknown,
): string[] {
  if (
    value === undefined ||
    value === null
  ) {
    return []
  }

  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_STATEFUL_COMPANY_ALLOWLIST',

      path:
        'configured_company_ids',

      message:
        'COMPANION_STATEFUL_COMPANY_IDS precisa ser uma lista textual.',
    })
  }

  const rawItems =
    value
      .split(',')
      .map(
        item =>
          item.trim(),
      )
      .filter(Boolean)

  if (
    rawItems.some(
      item =>
        item === '*',
    )
  ) {
    fail({
      code:
        'STATEFUL_GLOBAL_WILDCARD_FORBIDDEN',

      path:
        'configured_company_ids',

      message:
        'A ativação stateful global por curinga não é permitida.',
    })
  }

  const normalizedItems =
    rawItems.map(
      (
        item,
        index,
      ) =>
        normalizeCompanyId(
          item,
          `configured_company_ids[${index}]`,
        ),
    )

  return [
    ...new Set(
      normalizedItems,
    ),
  ]
}

function buildDecision({
  mode,
  companyId,
  allowedCompanyIds,
  engineVersion,
  enabled,
  execute,
  persist,
  expose,
  preserveV1,
  reason,
}: {
  mode:
    StatefulCopilotActivationMode

  companyId:
    string

  allowedCompanyIds:
    string[]

  engineVersion:
    CompanionEngineVersion | null

  enabled:
    boolean

  execute:
    boolean

  persist:
    boolean

  expose:
    boolean

  preserveV1:
    boolean

  reason:
    StatefulCopilotActivationReason
}): StatefulCopilotActivationDecision {
  return {
    mode,

    company_id:
      companyId,

    allowed_company_ids: [
      ...allowedCompanyIds,
    ],

    engine_version:
      engineVersion,

    enabled,

    should_execute_stateful:
      execute,

    should_persist_stateful_state:
      persist,

    should_expose_stateful_result:
      expose,

    preserve_v1_response:
      preserveV1,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,

    reason,
  }
}

export function resolveStatefulCopilotActivationGate({
  company_id,
  configured_mode =
    process.env.COMPANION_STATEFUL_MODE,
  configured_company_ids =
    process.env.COMPANION_STATEFUL_COMPANY_IDS,
  configured_engine_version =
    process.env.COMPANION_ENGINE_VERSION,
}: ResolveStatefulCopilotActivationGateArgs): StatefulCopilotActivationDecision {
  const companyId =
    normalizeCompanyId(
      company_id,
      'company_id',
    )

  const mode =
    normalizeMode(
      configured_mode,
    )

  if (
    mode ===
    'disabled'
  ) {
    return buildDecision({
      mode,

      companyId,

      allowedCompanyIds:
        [],

      engineVersion:
        null,

      enabled:
        false,

      execute:
        false,

      persist:
        false,

      expose:
        false,

      preserveV1:
        true,

      reason:
        'globally_disabled',
    })
  }

  const allowedCompanyIds =
    normalizeAllowedCompanyIds(
      configured_company_ids,
    )

  if (
    !allowedCompanyIds.includes(
      companyId,
    )
  ) {
    return buildDecision({
      mode,

      companyId,

      allowedCompanyIds,

      engineVersion:
        null,

      enabled:
        false,

      execute:
        false,

      persist:
        false,

      expose:
        false,

      preserveV1:
        true,

      reason:
        'company_not_allowed',
    })
  }

  const engineVersion =
    resolveCompanionEngineVersion(
      configured_engine_version ??
      undefined,
    )

  if (
    mode ===
    'shadow'
  ) {
    return buildDecision({
      mode,

      companyId,

      allowedCompanyIds,

      engineVersion,

      enabled:
        true,

      execute:
        true,

      persist:
        true,

      expose:
        false,

      preserveV1:
        true,

      reason:
        'shadow_enabled',
    })
  }

  if (
    engineVersion !==
    'v2'
  ) {
    return buildDecision({
      mode,

      companyId,

      allowedCompanyIds,

      engineVersion,

      enabled:
        false,

      execute:
        false,

      persist:
        false,

      expose:
        false,

      preserveV1:
        true,

      reason:
        'active_engine_version_required',
    })
  }

  return buildDecision({
    mode,

    companyId,

    allowedCompanyIds,

    engineVersion,

    enabled:
      true,

    execute:
      true,

    persist:
      true,

    expose:
      true,

    preserveV1:
      false,

    reason:
      'active_enabled',
  })
}
