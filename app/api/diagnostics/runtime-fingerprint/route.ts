import {
  NextResponse,
} from 'next/server'

import {
  STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
} from '@/app/lib/server/stateful-copilot-background-job'

export const dynamic =
  'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      ok: true,

      data: {
        deployment_sha:
          process.env
            .VERCEL_GIT_COMMIT_SHA ??
          null,

        vercel_env:
          process.env
            .VERCEL_ENV ??
          null,

        queue_topic:
          STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,

        queue_consumer:
          'companion-deep-analysis-v3',

        runtime_fingerprint_version:
          'phase13-live-runtime-v1',
      },
    },
    {
      headers: {
        'Cache-Control':
          'no-store, max-age=0',
      },
    },
  )
}
