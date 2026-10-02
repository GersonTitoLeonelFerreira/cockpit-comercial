import {
  handleCallback,
} from '@vercel/queue'

import {
  processMessageIntelligenceShadowMessage,
} from '@/app/lib/server/message-intelligence-shadow-worker'

import {
  isLegacyCompanionAiDisabled,
  logLegacyAiSkipped,
} from '@/app/lib/server/full-reading-flag'

// Topic próprio do Message Intelligence Engine V1 (shadow validation).
// Não compartilha semântica, payload nem worker com
// companion-deep-analysis-v3: são responsabilidades diferentes.
export const maxDuration =
  180

export const POST =
  handleCallback(
    async (
      message,
    ) => {
      // Rodada 7: com a leitura completa ligada, nenhuma rodada do Message
      // Intelligence (IA) roda.
      if (isLegacyCompanionAiDisabled()) {
        logLegacyAiSkipped('/api/queues/message-intelligence-shadow-v1')
        return
      }

      await processMessageIntelligenceShadowMessage(
        message,
      )
    },
    {
      visibilityTimeoutSeconds:
        180,
    },
  )
