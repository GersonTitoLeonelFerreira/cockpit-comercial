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
  resolveStatefulCopilotBackgroundFailureOutcome,
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
      'companion-deep-analysis-v3',
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

// Regressão FASE 13 Frente 1 — o worker V2-only não pode tratar todo
// `stateful_failure: null` como uma falha genérica terminal. O orquestrador
// pode produzir esse formato em outcomes distintos, incluindo conflito de
// persistência (`execution.persistence_mode === 'conflict'`) e precondição
// bloqueada (`execution.engine_mode === 'blocked').
//
// Antes desta correção, o worker ignorava essa semântica disponível em
// `stateful_execution`, convertia o resultado em
// `STATEFUL_BACKGROUND_FAILED` e não fazia retry do conflito de CAS.
//
// Logs históricos de produção apresentam a mesma assinatura genérica, mas
// não registravam `engine_mode`/`persistence_mode`; portanto, não permitem
// determinar retrospectivamente qual desses outcomes causou um incidente
// específico. Este teste prova o defeito estrutural e a recuperação correta
// do caso de conflito, sem atribuir ao incidente histórico uma causa não
// demonstrável.
test(
  'conflito de escrita (CAS) sem failure explícito é retryable com código diagnosticável, nunca genérico',
  () => {
    const outcome =
      resolveStatefulCopilotBackgroundFailureOutcome({
        failure:
          null,

        execution: {
          engine_mode:
            'model',

          persistence_mode:
            'conflict',

          communication_attempts:
            1,
        },
      })

    assert.equal(
      outcome.failure_code,
      'STATEFUL_STATE_WRITE_CONFLICT',
    )

    assert.equal(
      outcome.retryable,
      true,
    )

    assert.equal(
      outcome.communication_attempts,
      1,
    )
  },
)

test(
  'precondição de análise bloqueada (sem conteúdo utilizável) é terminal, mas com código diagnosticável e não genérico',
  () => {
    const outcome =
      resolveStatefulCopilotBackgroundFailureOutcome({
        failure:
          null,

        execution: {
          engine_mode:
            'blocked',

          persistence_mode:
            'skipped',

          communication_attempts:
            null,
        },
      })

    assert.equal(
      outcome.failure_code,
      'ANALYSIS_PRECONDITION_BLOCKED',
    )

    assert.equal(
      outcome.retryable,
      false,
    )
  },
)

test(
  'falha real do orquestrador (com code/retryable) é preservada sem alteração',
  () => {
    const outcome =
      resolveStatefulCopilotBackgroundFailureOutcome({
        failure: {
          code:
            'INVALID_COMMUNICATION_OUTPUT',

          retryable:
            true,

          communication_failure_path:
            'communication_output.suggested_message',

          communication_failure_invariant:
            'REQUIRED_FIELD_MISSING',

          communication_attempts:
            2,
        },

        execution:
          null,
      })

    assert.equal(
      outcome.failure_code,
      'INVALID_COMMUNICATION_OUTPUT',
    )

    assert.equal(
      outcome.retryable,
      true,
    )

    assert.equal(
      outcome.failure_path,
      'communication_output.suggested_message',
    )

    assert.equal(
      outcome.failure_invariant,
      'REQUIRED_FIELD_MISSING',
    )

    assert.equal(
      outcome.communication_attempts,
      2,
    )
  },
)

test(
  'sem failure e sem execution reconhecível permanece um fallback terminal seguro (nunca retry cego)',
  () => {
    const outcome =
      resolveStatefulCopilotBackgroundFailureOutcome({
        failure:
          null,

        execution:
          null,
      })

    assert.equal(
      outcome.failure_code,
      'STATEFUL_BACKGROUND_FAILED',
    )

    assert.equal(
      outcome.retryable,
      false,
    )
  },
)
