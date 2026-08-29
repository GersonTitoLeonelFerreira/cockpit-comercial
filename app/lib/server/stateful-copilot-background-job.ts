import 'server-only'

import {
  createHash,
} from 'crypto'

export const STATEFUL_COPILOT_BACKGROUND_JOB_VERSION =
  'phase12a-background-job-v2' as const

export const STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC =
  'companion-deep-analysis-v2' as const

export const STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS =
  120_000

export const STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS =
  5

export const STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS =
  210_000

export const STATEFUL_COPILOT_BACKGROUND_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'superseded',
] as const

export type StatefulCopilotBackgroundJobStatus =
  (typeof STATEFUL_COPILOT_BACKGROUND_JOB_STATUSES)[number]

export type StatefulCopilotBackgroundJobDescriptor = {
  job_version:
    typeof STATEFUL_COPILOT_BACKGROUND_JOB_VERSION

  analysis_job_id:
    string

  company_id:
    string

  cycle_id:
    string

  conversation_key:
    string

  message_watermark:
    string

  requested_at:
    string
}

export type StatefulCopilotBackgroundJobMessage =
  StatefulCopilotBackgroundJobDescriptor & {
    device_key:
      string
  }

function isRecord(
  value:
    unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
}

function requireText(
  value:
    unknown,
  path:
    string,
  maximumLength:
    number,
): string {
  if (
    typeof value !==
    'string'
  ) {
    throw new Error(
      `${path} precisa ser texto.`,
    )
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length >
      maximumLength
  ) {
    throw new Error(
      `${path} é inválido.`,
    )
  }

  return normalized
}

function requireDateTime(
  value:
    unknown,
): string {
  const normalized =
    requireText(
      value,
      'requested_at',
      80,
    )

  const timestamp =
    Date.parse(
      normalized,
    )

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    throw new Error(
      'requested_at precisa ser uma data válida.',
    )
  }

  return new Date(
    timestamp,
  ).toISOString()
}

export function isStatefulCopilotBackgroundJobStatus(
  value:
    unknown,
): value is StatefulCopilotBackgroundJobStatus {
  return (
    typeof value ===
      'string' &&
    STATEFUL_COPILOT_BACKGROUND_JOB_STATUSES
      .includes(
        value as StatefulCopilotBackgroundJobStatus,
      )
  )
}

export function buildStatefulCopilotBackgroundJobDescriptor({
  company_id,
  cycle_id,
  conversation_key,
  message_watermark,
  requested_at,
}: {
  company_id:
    unknown

  cycle_id:
    unknown

  conversation_key:
    unknown

  message_watermark:
    unknown

  requested_at:
    unknown
}): StatefulCopilotBackgroundJobDescriptor {
  const companyId =
    requireText(
      company_id,
      'company_id',
      100,
    )

  const cycleId =
    requireText(
      cycle_id,
      'cycle_id',
      100,
    )

  const conversationKey =
    requireText(
      conversation_key,
      'conversation_key',
      500,
    )

  const messageWatermark =
    requireText(
      message_watermark,
      'message_watermark',
      200,
    )

  const requestedAt =
    requireDateTime(
      requested_at,
    )

  const analysisJobId =
    createHash(
      'sha256',
    )
      .update(
        JSON.stringify([
          STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,
          companyId,
          cycleId,
          conversationKey,
          messageWatermark,
        ]),
      )
      .digest(
        'hex',
      )

  return Object.freeze({
    job_version:
      STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,

    analysis_job_id:
      analysisJobId,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    message_watermark:
      messageWatermark,

    requested_at:
      requestedAt,
  })
}

export function buildStatefulCopilotBackgroundJobMessage({
  descriptor,
  device_key,
}: {
  descriptor:
    StatefulCopilotBackgroundJobDescriptor

  device_key:
    unknown
}): StatefulCopilotBackgroundJobMessage {
  return Object.freeze({
    ...descriptor,

    device_key:
      requireText(
        device_key,
        'device_key',
        100,
      ),
  })
}

export function parseStatefulCopilotBackgroundJobMessage(
  value:
    unknown,
): StatefulCopilotBackgroundJobMessage {
  if (
    !isRecord(
      value,
    )
  ) {
    throw new Error(
      'Mensagem do job background inválida.',
    )
  }

  if (
    value.job_version !==
    STATEFUL_COPILOT_BACKGROUND_JOB_VERSION
  ) {
    throw new Error(
      'Versão do job background incompatível.',
    )
  }

  const descriptor =
    buildStatefulCopilotBackgroundJobDescriptor({
      company_id:
        value.company_id,

      cycle_id:
        value.cycle_id,

      conversation_key:
        value.conversation_key,

      message_watermark:
        value.message_watermark,

      requested_at:
        value.requested_at,
    })

  if (
    value.analysis_job_id !==
    descriptor.analysis_job_id
  ) {
    throw new Error(
      'analysis_job_id não corresponde ao escopo do job.',
    )
  }

  return buildStatefulCopilotBackgroundJobMessage({
    descriptor,

    device_key:
      value.device_key,
  })
}

export type StatefulCopilotBackgroundFailureInput = {
  code?: string
  retryable?: boolean

  communication_failure_path?:
    string

  diagnostic_failure_path?:
    string

  state_failure_path?:
    string

  communication_failure_invariant?:
    string

  diagnostic_failure_invariant?:
    string

  state_failure_invariant?:
    string

  communication_attempts?:
    1 | 2
}

export type StatefulCopilotBackgroundExecutionInput = {
  engine_mode?:
    string

  persistence_mode?:
    string

  communication_attempts?:
    1 | 2 | null
}

export type StatefulCopilotBackgroundFailureOutcome = {
  failure_code:
    string

  failure_path:
    string | null

  failure_invariant:
    string | null

  communication_attempts:
    1 | 2 | null

  retryable:
    boolean
}

function safeStatefulCopilotBackgroundFailureCode(
  value:
    unknown,
  fallback:
    string,
): string {
  if (
    typeof value ===
      'string' &&
    /^[A-Z0-9_]+$/.test(
      value,
    ) &&
    value.length <=
      120
  ) {
    return value
  }

  return fallback
}

/*
 * Traduz o resultado do orquestrador stateful (que ainda expressa, na sua
 * forma de tipos, semântica herdada de um fallback para V1 — ver
 * `active_fallback_v1` em stateful-copilot-runtime-orchestrator.ts) para o
 * vocabulário real do worker background V2-only, que não tem nenhum V1
 * para cair. Quando `failure` vem null do orquestrador, isso NÃO significa
 * "sem causa conhecida" — a causa está em `execution` (engine_mode/
 * persistence_mode) e precisa ser lida de lá, em vez de virar o código
 * genérico STATEFUL_BACKGROUND_FAILED sem path/invariant e sem chance de
 * retry.
 */
export function resolveStatefulCopilotBackgroundFailureOutcome({
  failure,
  execution,
}: {
  failure:
    StatefulCopilotBackgroundFailureInput | null

  execution:
    StatefulCopilotBackgroundExecutionInput | null
}): StatefulCopilotBackgroundFailureOutcome {
  if (failure) {
    return {
      failure_code:
        safeStatefulCopilotBackgroundFailureCode(
          failure.code,
          'STATEFUL_BACKGROUND_FAILED',
        ),

      failure_path:
        failure.communication_failure_path ??
        failure.diagnostic_failure_path ??
        failure.state_failure_path ??
        null,

      failure_invariant:
        failure.communication_failure_invariant ??
        failure.diagnostic_failure_invariant ??
        failure.state_failure_invariant ??
        null,

      communication_attempts:
        execution?.communication_attempts ??
        failure.communication_attempts ??
        null,

      retryable:
        failure.retryable === true,
    }
  }

  // O orquestrador só devolve `stateful_failure: null` em dois casos: o
  // motor não produziu saída de modelo (`engine_mode: 'blocked'` — sem
  // conteúdo utilizável na conversa, precondição determinística, não é um
  // bug) ou a persistência recusou a escrita por conflito de versão
  // (`persistence_mode: 'conflict'` — outra execução já avançou o CAS
  // desta mesma conversa). O conflito de escrita é, por construção,
  // transitório: uma nova tentativa relê o estado atual e escreve sobre a
  // versão certa. Tratá-lo como falha terminal não retryable (como o
  // código genérico fazia) descarta essa recuperação sem motivo.
  if (
    execution?.persistence_mode ===
    'conflict'
  ) {
    return {
      failure_code:
        'STATEFUL_STATE_WRITE_CONFLICT',

      failure_path:
        null,

      failure_invariant:
        null,

      communication_attempts:
        execution.communication_attempts ??
        null,

      retryable:
        true,
    }
  }

  if (
    execution?.engine_mode ===
    'blocked'
  ) {
    return {
      failure_code:
        'ANALYSIS_PRECONDITION_BLOCKED',

      failure_path:
        null,

      failure_invariant:
        null,

      communication_attempts:
        null,

      retryable:
        false,
    }
  }

  return {
    failure_code:
      'STATEFUL_BACKGROUND_FAILED',

    failure_path:
      null,

    failure_invariant:
      null,

    communication_attempts:
      execution?.communication_attempts ??
      null,

    retryable:
      false,
  }
}

export function shouldRetryStatefulCopilotBackgroundFailure({
  retryable,
  delivery_count,
}: {
  retryable:
    unknown

  delivery_count:
    unknown
}): boolean {
  if (
    retryable !== true ||
    typeof delivery_count !==
      'number' ||
    !Number.isSafeInteger(
      delivery_count,
    ) ||
    delivery_count < 1
  ) {
    return false
  }

  return (
    delivery_count <
    STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS
  )
}
