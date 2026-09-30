import {
  handleCallback,
} from '@vercel/queue'

import {
  processStatefulCopilotBackgroundMessage,
  StatefulCopilotBackgroundInvalidMessageError,
} from '@/app/lib/server/stateful-copilot-background-worker'

import {
  resolveStatefulCopilotBackgroundRetryDirective,
} from '@/app/lib/server/stateful-copilot-background-job'

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

      // R9: sem diretiva, uma falha retryable só voltava quando a
      // visibilidade de 180 s expirava (5 entregas ≈ 13–15 min). A nova
      // tentativa agora é agendada explicitamente, com espera curta.
      retry: (
        error,
        metadata,
      ) =>
        resolveStatefulCopilotBackgroundRetryDirective({
          retryable:
            !(
              error instanceof
                StatefulCopilotBackgroundInvalidMessageError
            ),
          code:
            error instanceof Error
              ? error.message
              : null,
          delivery_count:
            metadata
              .deliveryCount,
        }),
    },
  )
