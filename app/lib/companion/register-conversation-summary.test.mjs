import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildConversationRegistrationPrompt,
  generateConversationRegistrationSummary,
} from './register-conversation-summary.ts'

function textMessage({ messageKey, direction = 'incoming', occurredAt, text, isDeleted = false }) {
  return {
    message_key: messageKey,
    version: 1,
    direction,
    occurred_at: occurredAt,
    content_type: 'text',
    text: isDeleted ? null : text,
    is_deleted: isDeleted,
  }
}

// ---------------------------------------------------------------------
// buildConversationRegistrationPrompt — puro
// ---------------------------------------------------------------------

test('o prompt do sistema proíbe explicitamente inferência, coaching e sugestão', () => {
  const { system_prompt } = buildConversationRegistrationPrompt([])

  assert.match(system_prompt, /Nunca invente/)
  assert.match(system_prompt, /coaching/i)
  assert.match(system_prompt, /sugira/i)
})

test('mensagens deletadas não entram no texto enviado ao modelo', () => {
  const messages = [
    textMessage({ messageKey: 'm1', occurredAt: '2026-08-20T10:00:00.000Z', text: 'Mensagem visível' }),
    textMessage({ messageKey: 'm2', occurredAt: '2026-08-20T10:01:00.000Z', text: null, isDeleted: true }),
  ]

  const { user_prompt } = buildConversationRegistrationPrompt(messages)

  assert.match(user_prompt, /Mensagem visível/)
  assert.doesNotMatch(user_prompt, /m2/)
})

test('áudio sem transcrição aparece marcado como tal, sem inventar conteúdo', () => {
  const messages = [
    {
      message_key: 'audio-1',
      version: 1,
      direction: 'incoming',
      occurred_at: '2026-08-20T10:00:00.000Z',
      content_type: 'audio',
      text: null,
      is_deleted: false,
    },
  ]

  const { user_prompt } = buildConversationRegistrationPrompt(messages)

  assert.match(user_prompt, /sem transcrição disponível/)
})

test('áudio com transcrição canônica entra no texto do prompt', () => {
  const messages = [
    {
      message_key: 'audio-2',
      version: 1,
      direction: 'incoming',
      occurred_at: '2026-08-20T10:00:00.000Z',
      content_type: 'audio',
      text: 'Prefiro pagar no boleto.',
      is_deleted: false,
    },
  ]

  const { user_prompt } = buildConversationRegistrationPrompt(messages)

  assert.match(user_prompt, /Prefiro pagar no boleto\./)
})

// ---------------------------------------------------------------------
// generateConversationRegistrationSummary — fetch injetado
// ---------------------------------------------------------------------

function fakeChatCompletionResponse(summary) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({ summary }),
          },
        },
      ],
    }),
    { status: 200 },
  )
}

test('retorna erro sem chamar a rede quando OPENAI_API_KEY não está configurada', async () => {
  let called = false

  const result = await generateConversationRegistrationSummary({
    messages: [],
    api_key: undefined,
    fetch_impl: async () => {
      called = true
      throw new Error('não deveria ser chamado')
    },
  })

  assert.equal(called, false)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'REGISTER_CONVERSATION_MODEL_NOT_CONFIGURED')
})

test('retorna o resumo em caso de sucesso', async () => {
  const result = await generateConversationRegistrationSummary({
    messages: [
      textMessage({ messageKey: 'm1', occurredAt: '2026-08-20T10:00:00.000Z', text: 'Quero saber o preço.' }),
    ],
    api_key: 'fake-key',
    fetch_impl: async () => fakeChatCompletionResponse('Cliente perguntou o preço do plano.'),
  })

  assert.equal(result.ok, true)
  assert.equal(result.summary, 'Cliente perguntou o preço do plano.')
})

test('resposta HTTP de erro do provedor é reportada como falha retryable quando 5xx', async () => {
  const result = await generateConversationRegistrationSummary({
    messages: [],
    api_key: 'fake-key',
    fetch_impl: async () => new Response('erro interno', { status: 503 }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'REGISTER_CONVERSATION_MODEL_ERROR')
  assert.equal(result.retryable, true)
})

test('resposta sem JSON válido é reportada como resposta inválida', async () => {
  const result = await generateConversationRegistrationSummary({
    messages: [],
    api_key: 'fake-key',
    fetch_impl: async () => new Response('não é json', { status: 200 }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'REGISTER_CONVERSATION_MODEL_INVALID_RESPONSE')
})

test('abort do fetch é reportado como timeout retryable', async () => {
  const result = await generateConversationRegistrationSummary({
    messages: [],
    api_key: 'fake-key',
    fetch_impl: async (_url, options) => {
      const abortError = new Error('aborted')
      abortError.name = 'AbortError'
      void options
      throw abortError
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'REGISTER_CONVERSATION_MODEL_TIMEOUT')
  assert.equal(result.retryable, true)
})
