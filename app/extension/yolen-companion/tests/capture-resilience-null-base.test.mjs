import assert from 'node:assert/strict'
import test from 'node:test'

import nullBaseRebase from '../src/capture-resilience-null-base.js'

const {
  createNullBaseRebaseTracker,
  installNullBaseRebaseHotfix,
} = nullBaseRebase

function capturePayload(
  baseVersion,
  overrides = {},
) {
  return {
    conversation_key:
      'phone:5547999999999',
    messages: [
      {
        message_key: 'message-001',
        base_version: baseVersion,
        text_content: 'Mensagem inicial',
        is_deleted: false,
        ...overrides,
      },
    ],
  }
}

function successfulResult(
  canonicalVersion,
) {
  return {
    ok: true,
    statusCode: 200,
    payload: {
      ok: true,
      message_results: [
        {
          message_key: 'message-001',
          synced: true,
          canonical_version:
            canonicalVersion,
          reason: null,
        },
      ],
    },
  }
}

test('rebaseia edição com base nula depois que a criação inicial foi confirmada', () => {
  const tracker =
    createNullBaseRebaseTracker()

  const initial =
    tracker.preparePayload(
      capturePayload(null),
    )

  assert.equal(
    initial.payload.messages[0]
      .base_version,
    null,
  )

  tracker.recordResponse(
    initial.payload.conversation_key,
    initial.nullBaseMessageKeys,
    successfulResult('1').payload
      .message_results,
  )

  const queuedEdit =
    tracker.preparePayload(
      capturePayload(null, {
        text_content:
          'Edição feita antes da confirmação',
      }),
    )

  assert.equal(
    queuedEdit.payload.messages[0]
      .base_version,
    '1',
  )
})

test('rebaseia exclusão com base nula depois que a criação inicial foi confirmada', () => {
  const tracker =
    createNullBaseRebaseTracker()

  const initial =
    tracker.preparePayload(
      capturePayload(null),
    )

  tracker.recordResponse(
    initial.payload.conversation_key,
    initial.nullBaseMessageKeys,
    successfulResult('1').payload
      .message_results,
  )

  const queuedDeletion =
    tracker.preparePayload(
      capturePayload(null, {
        text_content: null,
        is_deleted: true,
      }),
    )

  assert.equal(
    queuedDeletion.payload.messages[0]
      .base_version,
    '1',
  )
})

test('conflito de baseline não autoriza rebase de base nula', () => {
  const tracker =
    createNullBaseRebaseTracker()

  const initial =
    tracker.preparePayload(
      capturePayload(null),
    )

  tracker.recordResponse(
    initial.payload.conversation_key,
    initial.nullBaseMessageKeys,
    [
      {
        message_key: 'message-001',
        synced: false,
        canonical_version: '7',
        reason: 'VERSION_CONFLICT',
      },
    ],
  )

  const staleRetry =
    tracker.preparePayload(
      capturePayload(null, {
        text_content:
          'Estado local desatualizado',
      }),
    )

  assert.equal(
    staleRetry.payload.messages[0]
      .base_version,
    null,
  )
})

test('integração registra a confirmação inicial e rebaseia a chamada seguinte', async () => {
  const sentPayloads = []
  const results = [
    successfulResult('1'),
    successfulResult('2'),
  ]

  const target = {
    YolenCompanionApi: {
      async ingestCapturedMessages(
        payload,
      ) {
        sentPayloads.push(payload)
        return results.shift()
      },
    },
  }

  installNullBaseRebaseHotfix(
    target,
  )

  await target.YolenCompanionApi
    .ingestCapturedMessages(
      capturePayload(null),
    )

  await target.YolenCompanionApi
    .ingestCapturedMessages(
      capturePayload(null, {
        text_content:
          'Segunda versão enfileirada',
      }),
    )

  assert.equal(
    sentPayloads[0].messages[0]
      .base_version,
    null,
  )

  assert.equal(
    sentPayloads[1].messages[0]
      .base_version,
    '1',
  )
})

test('instalação repetida mantém o mesmo patch', () => {
  const target = {
    YolenCompanionApi: {
      async ingestCapturedMessages() {
        return successfulResult('1')
      },
    },
  }

  const first =
    installNullBaseRebaseHotfix(
      target,
    )
  const second =
    installNullBaseRebaseHotfix(
      target,
    )

  assert.equal(first, second)
})
