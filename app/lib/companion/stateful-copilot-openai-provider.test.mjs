import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COPILOT_PROMPT_VERSION,
} from './stateful-copilot-execution-plan.ts'

import {
  STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT,
} from './stateful-copilot-json-schema.ts'

import {
  executeStatefulCopilotModelAttempt,
} from './stateful-copilot-executor.ts'

import {
  DEFAULT_STATEFUL_COPILOT_OPENAI_MAX_OUTPUT_TOKENS,
  DEFAULT_STATEFUL_COPILOT_OPENAI_MODEL,
  StatefulCopilotOpenAIProviderError,
  createStatefulCopilotOpenAIProvider,
} from './stateful-copilot-openai-provider.ts'

function buildRequest() {
  return {
    prompt_version:
      STATEFUL_COPILOT_PROMPT_VERSION,

    output_contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    system_prompt:
      'SYSTEM PROMPT STATEFUL',

    user_prompt:
      'USER PROMPT STATEFUL',

    structured_output_format:
      STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT,
  }
}

function buildExecutionPlan() {
  return {
    mode:
      'model',

    request: {
      ...buildRequest(),

      normalization_context: {
        available_message_ids: [
          'm1',
        ],

        available_memory_ids: [],
        active_memory_ids: [],

        expected_previous_state_version:
          null,

        current_crm_status:
          'respondeu',

        prohibited_statuses: [
          'ganho',
          'perdido',
        ],

        reference_time:
          '2026-08-06T14:30:00-03:00',
      },
    },
  }
}

function buildCompletedPayload({
  content =
    '{"result":"ok"}',

  status =
    'completed',

  output,
} = {}) {
  return {
    id:
      'resp_123',

    object:
      'response',

    status,

    model:
      DEFAULT_STATEFUL_COPILOT_OPENAI_MODEL,

    error:
      null,

    incomplete_details:
      null,

    output:
      output ?? [
        {
          id:
            'msg_123',

          type:
            'message',

          role:
            'assistant',

          status:
            'completed',

          content: [
            {
              type:
                'output_text',

              text:
                content,

              annotations: [],
            },
          ],
        },
      ],

    usage: {
      input_tokens:
        100,

      output_tokens:
        200,

      total_tokens:
        300,
    },
  }
}

function buildResponse(
  payload,
  {
    status = 200,
    headers = {},
  } = {},
) {
  const body =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(
          payload,
        )

  return new Response(
    body,
    {
      status,
      headers,
    },
  )
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

async function expectProviderError(
  callback,
  expectedCode,
) {
  await assert.rejects(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCopilotOpenAIProviderError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

test(
  'envia requisição estruturada à Responses API e extrai a saída',
  async () => {
    const request =
      buildRequest()

    const originalRequest =
      clone(request)

    let receivedUrl =
      null

    let receivedInit =
      null

    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-api-key',

        model:
          DEFAULT_STATEFUL_COPILOT_OPENAI_MODEL,

        fetch_impl:
          async (url, init) => {
            receivedUrl =
              url

            receivedInit =
              init

            return buildResponse(
              buildCompletedPayload(),
              {
                headers: {
                  'x-request-id':
                    'request-header-1',
                },
              },
            )
          },
      })

    const result =
      await provider(
        request,
      )

    assert.equal(
      receivedUrl,
      'https://api.openai.com/v1/responses',
    )

    assert.equal(
      receivedInit.method,
      'POST',
    )

    assert.equal(
      receivedInit
        .headers
        .Authorization,
      'Bearer test-api-key',
    )

    const body =
      JSON.parse(
        receivedInit.body,
      )

    assert.equal(
      body.model,
      DEFAULT_STATEFUL_COPILOT_OPENAI_MODEL,
    )

    assert.equal(
      body.store,
      false,
    )

    assert.equal(
      body.max_output_tokens,
      DEFAULT_STATEFUL_COPILOT_OPENAI_MAX_OUTPUT_TOKENS,
    )

    assert.equal(
      body.instructions,
      request.system_prompt,
    )

    assert.deepEqual(
      body.input,
      [
        {
          role:
            'user',

          content: [
            {
              type:
                'input_text',

              text:
                request.user_prompt,
            },
          ],
        },
      ],
    )

    assert.deepEqual(
      body.text.format,
      STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT,
    )

    assert.deepEqual(
      result,
      {
        content:
          '{"result":"ok"}',

        provider:
          'openai',

        model:
          DEFAULT_STATEFUL_COPILOT_OPENAI_MODEL,

        request_id:
          'request-header-1',

        usage: {
          input_tokens:
            100,

          output_tokens:
            200,

          total_tokens:
            300,
        },
      },
    )

    assert.deepEqual(
      request,
      originalRequest,
    )
  },
)

test(
  'não chama a OpenAI quando a chave não está configurada',
  async () => {
    let fetchCalls = 0

    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          null,

        fetch_impl:
          async () => {
            fetchCalls += 1

            return buildResponse(
              buildCompletedPayload(),
            )
          },
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_NOT_CONFIGURED',
    )

    assert.equal(
      fetchCalls,
      0,
    )
  },
)

test(
  'executor preserva a classificação segura do provedor OpenAI',
  async () => {
    let fetchCalls = 0

    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          null,

        fetch_impl:
          async () => {
            fetchCalls += 1

            return buildResponse(
              buildCompletedPayload(),
            )
          },
      })

    await assert.rejects(
      () =>
        executeStatefulCopilotModelAttempt({
          plan:
            buildExecutionPlan(),

          provider,
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotOpenAIProviderError,
        )

        assert.equal(
          error.code,
          'OPENAI_NOT_CONFIGURED',
        )

        assert.equal(
          error.status_code,
          503,
        )

        assert.equal(
          error.retryable,
          false,
        )

        return true
      },
    )

    assert.equal(
      fetchCalls,
      0,
    )
  },
)

test(
  'classifica falha de autenticação sem expor o corpo',
  async () => {
    const secret =
      'detalhe-secreto-da-openai'

    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'invalid-key',

        fetch_impl:
          async () =>
            buildResponse(
              secret,
              {
                status:
                  401,
              },
            ),
      })

    await assert.rejects(
      () =>
        provider(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotOpenAIProviderError,
        )

        assert.equal(
          error.code,
          'OPENAI_AUTHENTICATION_FAILED',
        )

        assert.equal(
          error.status_code,
          401,
        )

        assert.equal(
          error.retryable,
          false,
        )

        assert.ok(
          error.message.includes(
            secret,
          ) === false,
        )

        return true
      },
    )
  },
)

test(
  'classifica limite temporário como repetível no adaptador',
  async () => {
    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            buildResponse(
              '{}',
              {
                status:
                  429,
              },
            ),
      })

    await assert.rejects(
      () =>
        provider(
          buildRequest(),
        ),
      (error) => {
        assert.equal(
          error.code,
          'OPENAI_RATE_LIMITED',
        )

        assert.equal(
          error.retryable,
          true,
        )

        return true
      },
    )
  },
)

test(
  'não expõe detalhes internos de falha de rede',
  async () => {
    const secret =
      'segredo-interno-da-rede'

    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () => {
            throw new Error(
              secret,
            )
          },
      })

    await assert.rejects(
      () =>
        provider(
          buildRequest(),
        ),
      (error) => {
        assert.equal(
          error.code,
          'OPENAI_NETWORK_ERROR',
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.ok(
          error.message.includes(
            secret,
          ) === false,
        )

        return true
      },
    )
  },
)

test(
  'aborta a chamada quando o tempo máximo é excedido',
  async () => {
    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        timeout_ms:
          10,

        fetch_impl:
          async (
            _url,
            init,
          ) =>
            new Promise(
              (
                _resolve,
                reject,
              ) => {
                init.signal
                  .addEventListener(
                    'abort',
                    () => {
                      const error =
                        new Error(
                          'aborted',
                        )

                      error.name =
                        'AbortError'

                      reject(
                        error,
                      )
                    },
                    {
                      once:
                        true,
                    },
                  )
              },
            ),
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_REQUEST_TIMEOUT',
    )
  },
)

test(
  'classifica falha de leitura sem expor conteúdo interno',
  async () => {
    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () => ({
            ok:
              true,

            status:
              200,

            headers:
              new Headers(),

            text:
              async () => {
                throw new Error(
                  'segredo-da-leitura',
                )
              },
          }),
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_RESPONSE_READ_FAILED',
    )
  },
)

test(
  'rejeita envelope de sucesso que não contém JSON',
  async () => {
    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            buildResponse(
              'resposta sem json',
            ),
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_INVALID_RESPONSE',
    )
  },
)

test(
  'rejeita resposta declarada como incompleta',
  async () => {
    const payload =
      buildCompletedPayload({
        status:
          'incomplete',
      })

    payload.incomplete_details = {
      reason:
        'max_output_tokens',
    }

    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            buildResponse(
              payload,
            ),
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_RESPONSE_INCOMPLETE',
    )
  },
)

test(
  'rejeita resposta que declara falha de geração',
  async () => {
    const payload =
      buildCompletedPayload({
        status:
          'failed',
      })

    payload.error = {
      code:
        'server_error',

      message:
        'erro interno não exposto',
    }

    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            buildResponse(
              payload,
            ),
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_RESPONSE_FAILED',
    )
  },
)

test(
  'rejeita recusa do modelo sem transformá-la em JSON',
  async () => {
    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            buildResponse(
              buildCompletedPayload({
                output: [
                  {
                    type:
                      'message',

                    role:
                      'assistant',

                    content: [
                      {
                        type:
                          'refusal',

                        refusal:
                          'Não posso ajudar.',
                      },
                    ],
                  },
                ],
              }),
            ),
      })

    await assert.rejects(
      () =>
        provider(
          buildRequest(),
        ),
      (error) => {
        assert.equal(
          error.code,
          'OPENAI_MODEL_REFUSAL',
        )

        assert.equal(
          error.retryable,
          false,
        )

        return true
      },
    )
  },
)

test(
  'rejeita resposta concluída sem output_text',
  async () => {
    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            buildResponse(
              buildCompletedPayload({
                output: [],
              }),
            ),
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_EMPTY_OUTPUT',
    )
  },
)

test(
  'rejeita envelope acima do limite permitido',
  async () => {
    const provider =
      createStatefulCopilotOpenAIProvider({
        api_key:
          'test-key',

        fetch_impl:
          async () =>
            buildResponse(
              'x'.repeat(
                2_000_001,
              ),
            ),
      })

    await expectProviderError(
      () =>
        provider(
          buildRequest(),
        ),
      'OPENAI_RESPONSE_TOO_LARGE',
    )
  },
)
