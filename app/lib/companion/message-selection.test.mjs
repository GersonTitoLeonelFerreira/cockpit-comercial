import test from 'node:test'
import assert from 'node:assert/strict'

import {
  selectStructuredMessageBatch,
  shouldForceReanalysis,
} from './message-selection.ts'

const emptyCursor = {
  has_cursor: false,
  last_message_timestamp_ms: 0,
  last_message_id: null,
  processed_message_ids: [],
}

function message({
  id,
  timestamp,
  date = '2026-07-29',
}) {
  return {
    id,
    timestamp_ms: timestamp,
    date_key: date,
  }
}

test('primeira análise usa somente o dia mais recente', () => {
  const result =
    selectStructuredMessageBatch({
      messages: [
        message({
          id: 'yesterday',
          timestamp: 1,
          date: '2026-07-28',
        }),
        message({
          id: 'today',
          timestamp: 2,
        }),
      ],
      cursor: emptyCursor,
      forceReanalysis: false,
    })

  assert.deepEqual(
    result.messages.map(
      (item) => item.id,
    ),
    ['today'],
  )
  assert.equal(
    result.incremental,
    false,
  )
})

test('mensagem nova continua incremental', () => {
  const result =
    selectStructuredMessageBatch({
      messages: [
        message({
          id: 'processed',
          timestamp: 100,
        }),
        message({
          id: 'new',
          timestamp: 200,
        }),
      ],
      cursor: {
        has_cursor: true,
        last_message_timestamp_ms: 100,
        last_message_id:
          'processed',
        processed_message_ids: [
          'processed',
        ],
      },
      forceReanalysis: false,
    })

  assert.deepEqual(
    result.messages.map(
      (item) => item.id,
    ),
    ['new'],
  )
  assert.equal(
    result.incremental,
    true,
  )
})

test('edição ou exclusão reprocessa o dia atual inteiro', () => {
  const result =
    selectStructuredMessageBatch({
      messages: [
        message({
          id: 'yesterday',
          timestamp: 1,
          date: '2026-07-28',
        }),
        message({
          id: 'morning',
          timestamp: 100,
        }),
        message({
          id: 'evening',
          timestamp:
            100 +
            8 * 60 * 60 * 1000,
        }),
      ],
      cursor: {
        has_cursor: true,
        last_message_timestamp_ms:
          100,
        last_message_id: 'morning',
        processed_message_ids: [
          'morning',
        ],
      },
      forceReanalysis: true,
    })

  assert.deepEqual(
    result.messages.map(
      (item) => item.id,
    ),
    ['morning', 'evening'],
  )
  assert.equal(
    result.incremental,
    false,
  )
})

test('clique sem mutação não força nova análise', () => {
  const result =
    selectStructuredMessageBatch({
      messages: [
        message({
          id: 'processed',
          timestamp: 100,
        }),
      ],
      cursor: {
        has_cursor: true,
        last_message_timestamp_ms: 100,
        last_message_id:
          'processed',
        processed_message_ids: [
          'processed',
        ],
      },
      forceReanalysis: false,
    })

  assert.deepEqual(
    result.messages,
    [],
  )
  assert.equal(
    result.incremental,
    true,
  )
})

test('estado já processado não gera reanálise duplicada', () => {
  assert.equal(
    shouldForceReanalysis({
      requested: true,
      currentSnapshotHash:
        '10:abc',
      previousSnapshotHash:
        '10:abc',
    }),
    false,
  )
})

test('mudança real no estado libera reanálise', () => {
  assert.equal(
    shouldForceReanalysis({
      requested: true,
      currentSnapshotHash:
        '11:def',
      previousSnapshotHash:
        '10:abc',
    }),
    true,
  )

  assert.equal(
    shouldForceReanalysis({
      requested: false,
      currentSnapshotHash:
        '11:def',
      previousSnapshotHash:
        '10:abc',
    }),
    false,
  )
})
