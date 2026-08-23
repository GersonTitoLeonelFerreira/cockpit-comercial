// "Registrar conversa" — geração do resumo factual do histórico do lead.
//
// Módulo isolado e independente da análise profunda (V2): não importa nada
// de stateful-copilot-* nem de stateful-communication*, não decide stage,
// não sugere mensagem, não faz coaching. Só extrai fatos já ditos na
// conversa e os resume em texto curto.

import type {
  CanonicalConversationMessage,
} from '../server/companion-conversation-registration-loader'

export const CONVERSATION_REGISTRATION_OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const DEFAULT_TIMEOUT_MS = 30000
const MAX_PROMPT_CHARS = 16000

const SYSTEM_PROMPT = `Você registra um resumo FACTUAL de uma conversa comercial de WhatsApp para o histórico operacional do lead.

REGRAS OBRIGATÓRIAS:
- Use somente fatos que aparecem explicitamente nas mensagens fornecidas. Nunca invente, presuma ou complete informação que não foi dita.
- Não transforme inferência em fato. Se algo é ambíguo ou não foi dito claramente, não inclua.
- Não avalie interesse, probabilidade de fechamento, sentimento ou qualidade do atendimento.
- Não sugira próxima ação, mensagem a enviar, mudança de etapa comercial ou qualquer recomendação.
- Não faça coaching nem avalie aderência a método comercial.
- Quando houver transcrição de áudio, trate-a como fala do participante e pode usá-la como fato, exatamente como faria com uma mensagem de texto.
- Quando uma mensagem de áudio não tiver transcrição disponível, apenas registre que houve uma mensagem de áudio sem detalhar o conteúdo — não invente o que foi dito.
- Escreva em português, em texto corrido, curto e direto (poucas frases).
- Prefira relatar: assunto tratado, necessidade declarada, dúvida declarada, objeção declarada, informação fornecida, decisão já tomada, compromisso explicitamente assumido, datas explicitamente mencionadas e o resultado factual da conversa.
- Responda em JSON válido no formato exato {"summary": "..."} e nada além disso.`

function formatMessageLine(message: CanonicalConversationMessage): string | null {
  if (message.is_deleted) {
    return null
  }

  const speaker = message.direction === 'incoming' ? 'Cliente' : 'Vendedor'

  if (message.content_type === 'audio') {
    if (message.text) {
      return `${speaker} (áudio transcrito): ${message.text}`
    }

    return `${speaker}: [mensagem de áudio sem transcrição disponível]`
  }

  const text = (message.text ?? '').trim()

  if (!text) {
    return null
  }

  return `${speaker}: ${text}`
}

export function buildConversationRegistrationPrompt(
  messages: readonly CanonicalConversationMessage[],
): {
  system_prompt: string
  user_prompt: string
} {
  const lines = messages
    .map(formatMessageLine)
    .filter((line): line is string => Boolean(line))

  let transcript = lines.join('\n')

  if (transcript.length > MAX_PROMPT_CHARS) {
    // Preserva o final da conversa (mais recente e mais relevante para o
    // registro) quando o histórico ultrapassa o orçamento de caracteres.
    transcript = `[...conversa truncada...]\n${transcript.slice(-MAX_PROMPT_CHARS)}`
  }

  const userPrompt = `Conversa (mensagens em ordem cronológica):\n\n${transcript}\n\nGere o resumo factual conforme as regras.`

  return {
    system_prompt: SYSTEM_PROMPT,
    user_prompt: userPrompt,
  }
}

export type ConversationRegistrationSummaryResult =
  | {
      ok: true
      summary: string
    }
  | {
      ok: false
      code: string
      message: string
      retryable: boolean
    }

function isAbortError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { name?: string }).name === 'AbortError'
}

function parseSummaryFromResponseText(responseText: string): string | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(responseText)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const choices = (parsed as { choices?: unknown }).choices

  if (!Array.isArray(choices) || choices.length === 0) {
    return null
  }

  const content = (choices[0] as { message?: { content?: unknown } })?.message?.content

  if (typeof content !== 'string') {
    return null
  }

  let body: unknown

  try {
    body = JSON.parse(content)
  } catch {
    return null
  }

  const summary = (body as { summary?: unknown })?.summary

  if (typeof summary !== 'string') {
    return null
  }

  const trimmed = summary.trim()

  return trimmed || null
}

export async function generateConversationRegistrationSummary({
  messages,
  api_key,
  model = DEFAULT_MODEL,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  fetch_impl = fetch,
}: {
  messages: readonly CanonicalConversationMessage[]
  api_key: string | undefined
  model?: string
  timeout_ms?: number
  fetch_impl?: typeof fetch
}): Promise<ConversationRegistrationSummaryResult> {
  if (!api_key) {
    return {
      ok: false,
      code: 'REGISTER_CONVERSATION_MODEL_NOT_CONFIGURED',
      message: 'OPENAI_API_KEY não está configurada.',
      retryable: false,
    }
  }

  const { system_prompt, user_prompt } = buildConversationRegistrationPrompt(messages)

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeout_ms)

  try {
    let response: Response

    try {
      response = await fetch_impl(CONVERSATION_REGISTRATION_OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api_key}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: {
            type: 'json_object',
          },
          messages: [
            {
              role: 'system',
              content: system_prompt,
            },
            {
              role: 'user',
              content: user_prompt,
            },
          ],
        }),
      })
    } catch (error) {
      if (isAbortError(error)) {
        return {
          ok: false,
          code: 'REGISTER_CONVERSATION_MODEL_TIMEOUT',
          message: 'A geração do resumo excedeu o tempo máximo.',
          retryable: true,
        }
      }

      return {
        ok: false,
        code: 'REGISTER_CONVERSATION_MODEL_NETWORK_ERROR',
        message: 'Não foi possível acessar o provedor do resumo.',
        retryable: true,
      }
    }

    const responseText = await response.text().catch(() => '')

    if (!response.ok) {
      return {
        ok: false,
        code: 'REGISTER_CONVERSATION_MODEL_ERROR',
        message: 'O provedor do resumo retornou um erro.',
        retryable: response.status >= 500 || response.status === 429,
      }
    }

    const summary = parseSummaryFromResponseText(responseText)

    if (!summary) {
      return {
        ok: false,
        code: 'REGISTER_CONVERSATION_MODEL_INVALID_RESPONSE',
        message: 'O provedor do resumo retornou uma resposta inválida.',
        retryable: true,
      }
    }

    return {
      ok: true,
      summary,
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}
