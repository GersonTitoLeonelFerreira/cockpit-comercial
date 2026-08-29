import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GET,
} from './route.ts'

test(
  'runtime fingerprint expõe apenas metadados de deploy e consumer atual',
  async () => {
    const previousSha =
      process.env
        .VERCEL_GIT_COMMIT_SHA

    const previousEnv =
      process.env
        .VERCEL_ENV

    process.env
      .VERCEL_GIT_COMMIT_SHA =
        'abc123'

    process.env
      .VERCEL_ENV =
        'production'

    try {
      const response =
        GET()

      const payload =
        await response.json()

      assert.equal(
        payload.ok,
        true,
      )

      assert.equal(
        payload.data
          .deployment_sha,
        'abc123',
      )

      assert.equal(
        payload.data
          .vercel_env,
        'production',
      )

      assert.equal(
        payload.data
          .queue_topic,
        'companion-deep-analysis-v3',
      )

      assert.equal(
        payload.data
          .queue_consumer,
        'companion-deep-analysis-v3',
      )

      assert.equal(
        payload.data
          .runtime_fingerprint_version,
        'phase13-live-runtime-v1',
      )

      assert.equal(
        response.headers.get(
          'cache-control',
        ),
        'no-store, max-age=0',
      )
    } finally {
      if (
        previousSha ===
        undefined
      ) {
        delete process.env
          .VERCEL_GIT_COMMIT_SHA
      } else {
        process.env
          .VERCEL_GIT_COMMIT_SHA =
            previousSha
      }

      if (
        previousEnv ===
        undefined
      ) {
        delete process.env
          .VERCEL_ENV
      } else {
        process.env
          .VERCEL_ENV =
            previousEnv
      }
    }
  },
)
