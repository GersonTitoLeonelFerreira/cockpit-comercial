import 'server-only'

import {
  createHash,
} from 'crypto'

export const STATEFUL_COPILOT_BACKGROUND_JOB_VERSION =
  'phase12a-background-job-v1' as const

export const STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS =
  120_000

export const STATEFUL_COPILOT_BACKGROUND_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
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

  if (
    !Number.isFinite(
      Date.parse(
        normalized,
      ),
    )
  ) {
    throw new Error(
      'requested_at precisa ser uma data válida.',
    )
  }

  return normalized
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
