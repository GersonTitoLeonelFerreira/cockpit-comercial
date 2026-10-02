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

import {
  isLegacyCompanionAiDisabled,
  logLegacyAiSkipped,
} from '@/app/lib/server/full-reading-flag'

export const maxDuration =
  180

export const POST =
  handleCallback(
    async (
      message,
      metadata,
    ) => {
      // Rodada 7: com a leitura completa ligada, a mensagem é reconhecida
      // sem rodar a análise stateful (nenhuma chamada de IA, nada gravado).
      if (isLegacyCompanionAiDisabled()) {
        logLegacyAiSkipped('/api/queues/companion-deep-analysis-v3')
        return
      }

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
