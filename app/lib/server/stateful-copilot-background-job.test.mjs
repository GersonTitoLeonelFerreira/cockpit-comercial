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

// Regressão FASE 13 Frente 1 — root cause real da aba ANÁLISE travando em
// "Não foi possível concluir a leitura comercial da Yolen. Tente
// novamente.": o orquestrador stateful (stateful-copilot-runtime-
// orchestrator.ts) devolve `stateful_failure: null` quando a persistência
// recusa a escrita por conflito de versão (execution.persistence_mode ===
// 'conflict', mode: 'active_fallback_v1' com fallback_reason
// 'stateful_state_not_persisted') — um caso herdado da semântica V1+V2,
// onde isso significava "cair para V1 com segurança". No worker V2-only
// (companion-deep-analysis), não existe V1 para cair: antes desta
// correção, o worker lia `failure?.retryable === true` sobre um `failure`
// null, sempre obtendo `false`, e a evidência produzida em produção
// (Vercel runtime logs, projeto cockpit-comercial-vocn,
// company_id=40fb91ee-f998-4d98-acdf-7d0794369ccf,
// analysis_job_id=e27d5104de148ec475566bb9740d1d29563f51971a60a7fc2fa575dfe6ae5d4e)
// mostra exatamente essa assinatura: failure_code=STATEFUL_BACKGROUND_FAILED,
// failure_path=null, failure_invariant=null, communication_attempts=null —
// marcando um job terminal 'failed' sem nenhuma tentativa de retry, mesmo
// sendo um conflito de CAS inerentemente transitório (uma nova leitura do
// estado resolveria). Este teste falha no código anterior a esta correção.
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
