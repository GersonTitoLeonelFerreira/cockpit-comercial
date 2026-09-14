import {
  handleCallback,
} from '@vercel/queue'

import {
  processCompanionBackgroundMessage,
} from '@/app/lib/server/companion-background-worker-router'

export const maxDuration =
  180

export const POST =
  handleCallback(
    async (
      message,
      metadata,
    ) => {
      await processCompanionBackgroundMessage(
        message,
        {
          delivery_count:
            metadata
              .deliveryCount,
        },
      )
    },
    {
      visibilityTimeoutSeconds:
        180,
    },
  )
