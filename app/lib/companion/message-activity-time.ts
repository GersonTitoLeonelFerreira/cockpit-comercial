// Hora de "atividade" de cada mensagem, usada para agrupar a sessão atual
// da conversa (a janela de 4h que o diagnóstico lê como "agora").
//
// A regra era max(occurred_at, observed_at). Ela funciona na primeira
// leitura, quando todas as mensagens são observadas juntas. Mas uma mensagem
// ANTIGA capturada depois (o vendedor rolou a conversa para cima, ou o
// WhatsApp recarregou o histórico depois de um novo login) ganhava a hora da
// captura e virava, sozinha, a "sessão atual". Caso real: a mensagem de
// reativação de 09/04 da Júlia, capturada em 30/09, fez a análise ler só ela
// e tratar o resto da conversa como ponte de contexto.
//
// Regra nova: uma mensagem na primeira versão, observada bem depois de
// mensagens que aconteceram DEPOIS dela, é histórico recuperado e vale pela
// hora em que aconteceu. Versões novas de uma mensagem já conhecida (edição,
// exclusão, transcrição incorporada) continuam valendo pela hora em que
// foram observadas, porque a mudança aconteceu agora.

export const BACKFILL_OBSERVATION_TOLERANCE_MS =
  30 * 60 * 1000

export type ActivityTimedMessage = {
  id: string
  version: number
  occurred_at: string
  observed_at: string
}

type ParsedEntry = {
  id: string
  version: number
  occurred: number
  observed: number
}

function activityFor(
  entry: ParsedEntry,
  minObservedOfLaterOccurred: number,
): number {
  const {
    occurred,
    observed,
  } = entry

  if (!Number.isFinite(occurred)) {
    return observed
  }

  if (!Number.isFinite(observed)) {
    return occurred
  }

  const latest =
    Math.max(occurred, observed)

  if (entry.version > 1) {
    return latest
  }

  if (
    Number.isFinite(minObservedOfLaterOccurred) &&
    observed - minObservedOfLaterOccurred >
      BACKFILL_OBSERVATION_TOLERANCE_MS
  ) {
    return occurred
  }

  return latest
}

export function computeMessageActivityTimestamps(
  messages: readonly ActivityTimedMessage[],
): Map<string, number> {
  const entries: ParsedEntry[] =
    messages.map((message) => ({
      id: message.id,
      version: message.version,
      occurred: Date.parse(message.occurred_at),
      observed: Date.parse(message.observed_at),
    }))

  const result =
    new Map<string, number>()

  // Mais recente (pela hora em que aconteceu) primeiro; sem hora válida por
  // último, valendo a hora em que foi observada.
  const withOccurred =
    entries
      .filter((entry) => Number.isFinite(entry.occurred))
      .sort((left, right) => right.occurred - left.occurred)

  let minObservedOfLaterOccurred =
    Number.POSITIVE_INFINITY

  let index = 0

  while (index < withOccurred.length) {
    let groupEnd = index

    while (
      groupEnd < withOccurred.length &&
      withOccurred[groupEnd].occurred === withOccurred[index].occurred
    ) {
      groupEnd += 1
    }

    const group =
      withOccurred.slice(index, groupEnd)

    for (const entry of group) {
      result.set(
        entry.id,
        activityFor(entry, minObservedOfLaterOccurred),
      )
    }

    for (const entry of group) {
      if (Number.isFinite(entry.observed)) {
        minObservedOfLaterOccurred =
          Math.min(minObservedOfLaterOccurred, entry.observed)
      }
    }

    index = groupEnd
  }

  for (const entry of entries) {
    if (!result.has(entry.id)) {
      result.set(entry.id, entry.observed)
    }
  }

  return result
}
