// ============================================================================
// MIE V1 — Simulador técnico interno
// Cliente IA (bot que representa o cliente sintético)
//
// Reutiliza o mesmo padrão de chamada já usado em app/lib/ai/sales-coaching.ts
// (fetch direto ao endpoint de chat completions da OpenAI, mesma variável de
// ambiente OPENAI_API_KEY). Não introduz outro SDK de IA nem outra variável
// de configuração.
// ============================================================================

import type {
  SimulatorMessage,
} from './conversation-engine'

import type {
  SimulatorScenarioDefinition,
} from './scenarios'

import {
  SIMULATOR_GENERIC_PRODUCT_CONTEXT,
} from './scenarios'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const OPENAI_SIMULATOR_MODEL =
  process.env.OPENAI_SIMULATOR_MODEL ||
  process.env.OPENAI_MODEL ||
  'gpt-4.1-mini'

const MAX_HISTORY_MESSAGES = 20

function directionLabel(
  direction: SimulatorMessage['direction'],
): string {
  return direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'
}

function buildSystemPrompt(
  scenario: SimulatorScenarioDefinition,
): string {
  return [
    'Você está representando o CLIENTE em uma simulação técnica interna,',
    'usada apenas para testar um motor de inteligência comercial.',
    'Isso não é uma conversa real e nenhuma mensagem sua será enviada a',
    'uma pessoa de verdade.',
    '',
    SIMULATOR_GENERIC_PRODUCT_CONTEXT,
    '',
    `Persona e estágio comercial: ${scenario.persona}`,
    '',
    'Regras obrigatórias:',
    '- Responda SOMENTE com a próxima mensagem do cliente, em português.',
    '- Nunca escreva rótulos, aspas, comentários ou texto fora da mensagem.',
    '- Escreva entre 1 e 4 frases curtas, como uma pessoa escreveria no',
    '  WhatsApp.',
    '- Reaja de verdade ao que o vendedor acabou de dizer.',
    '- Não facilite a venda artificialmente e não concorde só para ser',
    '  gentil.',
    '- Você pode levantar uma nova objeção, pedir esclarecimento,',
    '  demonstrar mais interesse ou encerrar a conversa, conforme fizer',
    '  sentido para a persona.',
    '- Mantenha coerência com o histórico da conversa.',
  ].join('\n')
}

function buildUserPrompt({
  scenario,
  conversation,
}: {
  scenario: SimulatorScenarioDefinition
  conversation: readonly SimulatorMessage[]
}): string {
  const history = conversation
    .slice(-MAX_HISTORY_MESSAGES)
    .map(
      message =>
        `${directionLabel(message.direction)}: ${message.text}`,
    )
    .join('\n')

  return [
    `Cenário: ${scenario.label} — ${scenario.short_description}`,
    '',
    'Histórico da conversa até agora:',
    history || '(sem mensagens ainda)',
    '',
    'Escreva agora a próxima mensagem do CLIENTE, reagindo à última',
    'mensagem do vendedor acima.',
  ].join('\n')
}

export class SimulatorCustomerAiError extends Error {}

export async function generateSimulatorCustomerReply({
  scenario,
  conversation,
  provider_timeout_ms,
}: {
  scenario: SimulatorScenarioDefinition
  conversation: readonly SimulatorMessage[]
  provider_timeout_ms?: number
}): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new SimulatorCustomerAiError('OPENAI_API_KEY ausente.')
  }

  const timeoutMs =
    typeof provider_timeout_ms === 'number' &&
    Number.isFinite(provider_timeout_ms)
      ? Math.max(1_000, Math.floor(provider_timeout_ms))
      : 20_000

  const response = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_SIMULATOR_MODEL,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(scenario),
          },
          {
            role: 'user',
            content: buildUserPrompt({ scenario, conversation }),
          },
        ],
      }),
    },
  )

  if (!response.ok) {
    throw new SimulatorCustomerAiError(
      `openai_http_${response.status}`,
    )
  }

  const data = await response.json()

  const content = data?.choices?.[0]?.message?.content

  if (!content || typeof content !== 'string') {
    throw new SimulatorCustomerAiError('openai_empty_content')
  }

  const cleaned = content
    .trim()
    .replace(/^cliente:\s*/i, '')
    .replace(/^["“]([\s\S]*)["”]$/, '$1')
    .trim()

  if (!cleaned) {
    throw new SimulatorCustomerAiError('openai_empty_content')
  }

  return cleaned
}
