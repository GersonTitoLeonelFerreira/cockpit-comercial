import type {
  AnalysisViewModel,
} from './analysis-view-model'

type CanonicalMessageLike = {
  id: unknown
  direction: unknown
}

type OpenLoopLike = {
  kind?: unknown
  memory_status?: unknown
  evidence_message_ids?: unknown
}

function normalizeId(
  value: unknown,
): string | null {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return null
  }

  const normalized =
    String(value).trim()

  return normalized || null
}

function collectActiveOpenQuestionEvidenceIds(
  openLoops: readonly unknown[],
): Set<string> {
  const ids =
    new Set<string>()

  for (const rawLoop of openLoops) {
    if (
      !rawLoop ||
      typeof rawLoop !== 'object' ||
      Array.isArray(rawLoop)
    ) {
      continue
    }

    const loop =
      rawLoop as OpenLoopLike

    if (
      loop.memory_status !== 'active' ||
      loop.kind !== 'client.open_question' ||
      !Array.isArray(
        loop.evidence_message_ids,
      )
    ) {
      continue
    }

    for (
      const rawId of
      loop.evidence_message_ids
    ) {
      const id = normalizeId(rawId)

      if (id) {
        ids.add(id)
      }
    }
  }

  return ids
}

export function reconcileAnalysisSellerQuality({
  viewModel,
  canonicalMessages,
  openLoops,
}: {
  viewModel: AnalysisViewModel
  canonicalMessages:
    readonly CanonicalMessageLike[]
  openLoops: readonly unknown[]
}): AnalysisViewModel {
  if (
    viewModel.strengths.length === 0
  ) {
    return viewModel
  }

  const outgoingIds =
    new Set<string>()

  const messagePosition =
    new Map<string, number>()

  canonicalMessages.forEach(
    (message, index) => {
      const id =
        normalizeId(message.id)

      if (!id) {
        return
      }

      messagePosition.set(
        id,
        index,
      )

      if (
        message.direction ===
          'outgoing'
      ) {
        outgoingIds.add(id)
      }
    },
  )

  const activeOpenQuestionIds =
    collectActiveOpenQuestionEvidenceIds(
      openLoops,
    )

  const strengths =
    viewModel.strengths.filter(
      strength => {
        const sellerEvidenceIds =
          strength.evidence_message_ids
            .map(normalizeId)
            .filter(
              (id): id is string =>
                Boolean(id) &&
                outgoingIds.has(id),
            )

        // Um acerto do vendedor exige pelo menos uma mensagem outgoing
        // que sustente a ação atribuída a ele. Mensagem do cliente pode
        // contextualizar, mas não provar o comportamento do vendedor.
        if (
          sellerEvidenceIds.length === 0
        ) {
          return false
        }

        if (
          strength.kind !==
            'respected_space' ||
          activeOpenQuestionIds.size === 0
        ) {
          return true
        }

        // "Respeitou o espaço" não é um mérito quando a mensagem outgoing
        // acontece depois de uma pergunta/pedido explícito do cliente que
        // continua aberto. Nesse cenário a retomada genérica representa
        // perda de contexto, não respeito ao tempo do cliente.
        const hasPendingQuestionBeforeSellerMessage =
          sellerEvidenceIds.some(
            sellerId => {
              const sellerPosition =
                messagePosition.get(
                  sellerId,
                )

              if (
                sellerPosition === undefined
              ) {
                return false
              }

              return Array.from(
                activeOpenQuestionIds,
              ).some(
                questionId => {
                  const questionPosition =
                    messagePosition.get(
                      questionId,
                    )

                  return (
                    questionPosition !==
                      undefined &&
                    questionPosition <
                      sellerPosition
                  )
                },
              )
            },
          )

        return !hasPendingQuestionBeforeSellerMessage
      },
    )

  if (
    strengths.length ===
      viewModel.strengths.length
  ) {
    return viewModel
  }

  return {
    ...viewModel,
    strengths,
  }
}
