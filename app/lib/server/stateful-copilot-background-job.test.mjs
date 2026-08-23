import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
  STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,
  STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
  buildStatefulCopilotBackgroundJobDescriptor,
  buildStatefulCopilotBackgroundJobMessage,
  isStatefulCopilotBackgroundJobStatus,
  parseStatefulCopilotBackgroundJobMessage,
  shouldRetryStatefulCopilotBackgroundFailure,
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
  'background profundo possui orçamento próprio de 120 segundos',
  () => {
    assert.equal(
      STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
      120_000,
    )
  },
)

test(
  'fila usa contrato versionado',
  () => {
    assert.equal(
      STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
      'companion-deep-analysis-v1',
    )

    assert.equal(
      STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,
      'phase12a-background-job-v2',
    )
  },
)

test(
  'mesmo escopo e watermark produzem mesmo job id',
  () => {
    assert.equal(
      buildJob()
        .analysis_job_id,

      buildJob({
        requested_at:
          '2026-08-23T00:11:00.000Z',
      })
        .analysis_job_id,
    )
  },
)

test(
  'outra conversa produz outro job',
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
  'nova fotografia produz outro job',
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
  'mensagem não transporta conteúdo da conversa',
  () => {
    const message =
      buildStatefulCopilotBackgroundJobMessage({
        descriptor:
          buildJob(),

        device_key:
          'device-a',
      })

    assert.equal(
      message.device_key,
      'device-a',
    )

    assert.equal(
      'conversation_text' in
        message,
      false,
    )

    assert.equal(
      'messages' in
        message,
      false,
    )
  },
)

test(
  'parser rejeita analysis job adulterado',
  () => {
    const message =
      buildStatefulCopilotBackgroundJobMessage({
        descriptor:
          buildJob(),

        device_key:
          'device-a',
      })

    assert.throws(
      () =>
        parseStatefulCopilotBackgroundJobMessage({
          ...message,

          analysis_job_id:
            'adulterado',
        }),
    )

    assert.deepEqual(
      parseStatefulCopilotBackgroundJobMessage(
        message,
      ),
      message,
    )
  },
)

test(
  'status inclui superseded',
  () => {
    assert.equal(
      isStatefulCopilotBackgroundJobStatus(
        'superseded',
      ),
      true,
    )
  },
)

test(
  'retry é limitado a cinco entregas',
  () => {
    assert.equal(
      shouldRetryStatefulCopilotBackgroundFailure({
        retryable:
          true,

        delivery_count:
          1,
      }),
      true,
    )

    assert.equal(
      shouldRetryStatefulCopilotBackgroundFailure({
        retryable:
          true,

        delivery_count:
          4,
      }),
      true,
    )

    assert.equal(
      shouldRetryStatefulCopilotBackgroundFailure({
        retryable:
          true,

        delivery_count:
          5,
      }),
      false,
    )
  },
)
