import {
  handleCallback,
} from '@vercel/queue'

import {
  processMessageIntelligenceShadowMessage,
} from '@/app/lib/server/message-intelligence-shadow-worker'

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
      await processMessageIntelligenceShadowMessage(
        message,
      )
    },
    {
      visibilityTimeoutSeconds:
        180,
    },
  )
