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
//
// Versão que só corrige metadados (direção, autoria, tipo) sem mudar o
// conteúdo (texto, transcrição, exclusão) não é atividade nova da conversa:
// vale a versão em que o conteúdo mudou pela última vez (content_version /
// content_observed_at, calculados a partir das versões do ledger). Caso
// real: o PDF da vendedora gravado como incoming ganha uma versão outgoing
// na captura seguinte; sem isso, ele sozinho viraria a "sessão atual".

export const BACKFILL_OBSERVATION_TOLERANCE_MS =
  30 * 60 * 1000

export type ActivityTimedMessage = {
  id: string
  version: number
  occurred_at: string
  observed_at: string

  // Presentes só quando a versão atual não mudou o conteúdo: versão e hora
  // de observação da versão em que o conteúdo mudou pela última vez.
  content_version?: number
  content_observed_at?: string
}

export type LedgerContentVersion = {
  version: number
  observed_at: string
  text_content: string | null
  audio_transcription: string | null
  is_deleted: boolean
}

function sameContent(
  left: LedgerContentVersion,
  right: LedgerContentVersion,
): boolean {
  return (
    left.text_content === right.text_content &&
    left.audio_transcription === right.audio_transcription &&
    left.is_deleted === right.is_deleted
  )
}

// Versão em que o conteúdo da versão atual apareceu pela primeira vez:
// anda para trás enquanto as versões anteriores têm o mesmo conteúdo.
export function findContentOriginVersion<
  T extends LedgerContentVersion,
>(
  versions: readonly T[],
): T | null {
  if (versions.length === 0) {
    return null
  }

  const ordered =
    [...versions].sort(
      (left, right) =>
        right.version - left.version,
    )

  let origin = ordered[0]

  for (
    let index = 1;
    index < ordered.length;
    index += 1
  ) {
    if (!sameContent(ordered[index], origin)) {
      break
    }

    origin = ordered[index]
  }

  return origin
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
      version:
        message.content_version ??
        message.version,
      occurred: Date.parse(message.occurred_at),
      observed: Date.parse(
        message.content_observed_at ??
          message.observed_at,
      ),
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
