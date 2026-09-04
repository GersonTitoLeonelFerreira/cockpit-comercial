// ============================================================================
// MIE V1 — Simulador técnico interno
// Conversation Engine
//
// Estado da conversa sintética mantido inteiramente em memória (nenhuma
// leitura ou escrita em banco). Este módulo NÃO importa Supabase e NÃO
// referencia nenhuma tabela comercial real — é usado tanto no servidor
// quanto no cliente para transformar o estado local da conversa.
// ============================================================================

export type SimulatorMessageDirection =
  | 'inbound'
  | 'outbound'

export type SimulatorMessage = {
  id: string
  direction: SimulatorMessageDirection
  text: string
  occurred_at: string
}

function nextMessageId(
  conversation: readonly SimulatorMessage[],
): string {
  return String(conversation.length + 1)
}

export function startSimulatorConversation({
  initial_message,
  reference_time,
}: {
  initial_message: string
  reference_time: string
}): SimulatorMessage[] {
  return [
    {
      id: '1',
      direction: 'inbound',
      text: initial_message,
      occurred_at: reference_time,
    },
  ]
}

function appendMessage(
  conversation: readonly SimulatorMessage[],
  direction: SimulatorMessageDirection,
  text: string,
  occurred_at: string,
): SimulatorMessage[] {
  const trimmed = text.trim()

  if (!trimmed) {
    return [...conversation]
  }

  return [
    ...conversation,
    {
      id: nextMessageId(conversation),
      direction,
      text: trimmed,
      occurred_at,
    },
  ]
}

export function appendOutboundMessage(
  conversation: readonly SimulatorMessage[],
  text: string,
  occurred_at: string,
): SimulatorMessage[] {
  return appendMessage(
    conversation,
    'outbound',
    text,
    occurred_at,
  )
}

export function appendInboundMessage(
  conversation: readonly SimulatorMessage[],
  text: string,
  occurred_at: string,
): SimulatorMessage[] {
  return appendMessage(
    conversation,
    'inbound',
    text,
    occurred_at,
  )
}

export function lastOutboundMessage(
  conversation: readonly SimulatorMessage[],
): SimulatorMessage | null {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index].direction === 'outbound') {
      return conversation[index]
    }
  }

  return null
}
