import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
  buildStatefulCopilotBackgroundJobDescriptor,
  isStatefulCopilotBackgroundJobStatus,
} from './stateful-copilot-background-job.ts'

function buildJob(
  overrides = {},
) {
  return buildStatefulCopilotBackgroundJobDescriptor({
    company_id:
      'company-a',

    cycle_id:
      'cycle-a',

    conversation_key:
      'phone:5511999999999',

    message_watermark:
      'watermark-a',

    requested_at:
      '2026-08-23T00:10:00.000Z',

    ...overrides,
  })
}

test(
  'background profundo possui orçamento separado de 120 segundos',
  () => {
    assert.equal(
      STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
      120_000,
    )
  },
)

test(
  'mesmo escopo e watermark produzem o mesmo job id',
  () => {
    const first =
      buildJob()

    const second =
      buildJob({
        requested_at:
          '2026-08-23T00:11:00.000Z',
      })

    assert.equal(
      first.analysis_job_id,
      second.analysis_job_id,
    )
  },
)

test(
  'troca de conversa produz outro job id',
  () => {
    assert.notEqual(
      buildJob()
        .analysis_job_id,

      buildJob({
        conversation_key:
          'phone:5511888888888',
      })
        .analysis_job_id,
    )
  },
)

test(
  'nova fotografia produz outro job id',
  () => {
    assert.notEqual(
      buildJob()
        .analysis_job_id,

      buildJob({
        message_watermark:
          'watermark-b',
      })
        .analysis_job_id,
    )
  },
)

test(
  'status de job é fail closed',
  () => {
    assert.equal(
      isStatefulCopilotBackgroundJobStatus(
        'queued',
      ),
      true,
    )

    assert.equal(
      isStatefulCopilotBackgroundJobStatus(
        'succeeded',
      ),
      true,
    )

    assert.equal(
      isStatefulCopilotBackgroundJobStatus(
        'invented',
      ),
      false,
    )
  },
)

test(
  'job rejeita escopo ou watermark vazio',
  () => {
    assert.throws(
      () =>
        buildJob({
          conversation_key:
            '',
        }),
    )

    assert.throws(
      () =>
        buildJob({
          message_watermark:
            '',
        }),
    )
  },
)
