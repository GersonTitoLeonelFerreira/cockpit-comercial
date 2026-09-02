import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const vercelConfig = JSON.parse(
  await readFile(
    new URL(
      '../../../../../vercel.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

test(
  'vercel.json registra o trigger da fila do Message Intelligence shadow',
  () => {
    const config =
      vercelConfig.functions?.[
        'app/api/queues/message-intelligence-shadow-v1/route.ts'
      ]

    assert.ok(config)
    assert.equal(config.maxDuration, 180)

    assert.deepEqual(
      config.experimentalTriggers,
      [
        {
          type: 'queue/v2beta',
          topic: 'message-intelligence-shadow-v1',
          retryAfterSeconds: 15,
          initialDelaySeconds: 0,
        },
      ],
    )
  },
)

test(
  'trigger existente do companion-deep-analysis-v3 permanece registrado',
  () => {
    const config =
      vercelConfig.functions?.[
        'app/api/queues/companion-deep-analysis-v3/route.ts'
      ]

    assert.ok(config)

    assert.equal(
      config.experimentalTriggers?.[0]?.topic,
      'companion-deep-analysis-v3',
    )
  },
)
