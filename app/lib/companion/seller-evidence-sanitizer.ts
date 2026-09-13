type JsonRecord =
  Record<string, unknown>

export type SellerEvidenceSanitization = {
  value: JsonRecord
  removed_items: number
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function cloneJsonRecord(
  value: JsonRecord,
): JsonRecord {
  return JSON.parse(
    JSON.stringify(value),
  ) as JsonRecord
}

function itemHasSellerEvidence(
  item: unknown,
  sellerMessageIds: Set<string>,
): boolean | null {
  if (!isRecord(item)) {
    return null
  }

  const evidence =
    item.evidence_message_ids

  if (!Array.isArray(evidence)) {
    return null
  }

  return evidence.some(
    id =>
      typeof id === 'string' &&
      sellerMessageIds.has(id),
  )
}

function sanitizeSellerAttributedList({
  value,
  sellerMessageIds,
}: {
  value: unknown
  sellerMessageIds: Set<string>
}): {
  value: unknown
  removed_items: number
} {
  if (!Array.isArray(value)) {
    return {
      value,
      removed_items: 0,
    }
  }

  let removedItems = 0

  const sanitized =
    value.filter(item => {
      const hasSellerEvidence =
        itemHasSellerEvidence(
          item,
          sellerMessageIds,
        )

      // Estrutura inválida continua no payload para o contrato rejeitar.
      // Este saneador corrige apenas o caso semanticamente conhecido:
      // elogio/risco seller-facing bem formado sem nenhuma evidência outgoing.
      if (hasSellerEvidence === null) {
        return true
      }

      if (!hasSellerEvidence) {
        removedItems += 1
        return false
      }

      return true
    })

  return {
    value: sanitized,
    removed_items: removedItems,
  }
}

export function sanitizeSellerAttributedEvidence({
  value,
  seller_message_ids,
}: {
  value: JsonRecord
  seller_message_ids: readonly string[]
}): SellerEvidenceSanitization {
  const sanitized =
    cloneJsonRecord(value)

  const reading =
    sanitized.commercial_reading

  if (!isRecord(reading)) {
    return {
      value: sanitized,
      removed_items: 0,
    }
  }

  const sellerMessageIds =
    new Set(
      seller_message_ids,
    )

  let removedItems = 0

  const strengths =
    sanitizeSellerAttributedList({
      value:
        reading.seller_strengths,
      sellerMessageIds,
    })

  reading.seller_strengths =
    strengths.value

  removedItems +=
    strengths.removed_items

  // improvement_points pode representar uma omissão real do vendedor
  // (pedido repetido, compromisso não concluído, ausência de resposta).
  // Nesses casos a sequência incoming é evidência contextual legítima e
  // não existe necessariamente uma mensagem outgoing que represente a
  // omissão. Por isso não filtramos improvement_points aqui. O prompt
  // continua proibindo atribuir ao vendedor uma ação que ele não realizou.

  const risks =
    reading.risks

  if (isRecord(risks)) {
    const result =
      sanitizeSellerAttributedList({
        value: risks.service_risks,
        sellerMessageIds,
      })

    risks.service_risks =
      result.value

    removedItems +=
      result.removed_items
  }

  return {
    value: sanitized,
    removed_items: removedItems,
  }
}
