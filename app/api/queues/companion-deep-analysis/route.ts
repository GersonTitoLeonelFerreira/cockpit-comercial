import {
  handleCallback,
} from '@vercel/queue'

import {
  processStatefulCopilotBackgroundMessage,
} from '@/app/lib/server/stateful-copilot-background-worker'

export const maxDuration =
  180

export const POST =
  handleCallback(
    async (
      message,
      metadata,
    ) => {
      await processStatefulCopilotBackgroundMessage(
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
