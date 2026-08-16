import {
  StatefulCopilotExecutionError,
  type StatefulCopilotProvider,
  type StatefulCopilotProviderRequest,
  type StatefulCopilotProviderResponse,
  type StatefulCopilotUsage,
} from './stateful-copilot-executor'

export const DEFAULT_STATEFUL_COPILOT_OPENAI_MODEL =
  'gpt-4.1-mini-2025-04-14' as const

export const DEFAULT_STATEFUL_COPILOT_OPENAI_TIMEOUT_MS =
  60_000

export const DEFAULT_STATEFUL_COPILOT_OPENAI_MAX_OUTPUT_TOKENS =
  8_000

const OPENAI_RESPONSES_URL =
  'https://api.openai.com/v1/responses'

const MAX_OPENAI_RESPONSE_LENGTH =
  2_000_000

type JsonRecord =
  Record<string, unknown>

type OpenAIFetch =
  typeof fetch

export type StatefulCopilotOpenAIProviderOptions = {
  api_key?: string | null
  model?: string | null
  timeout_ms?: number
  max_output_tokens?: number
  fetch_impl?: OpenAIFetch
}

export class StatefulCopilotOpenAIProviderError
  extends StatefulCopilotExecutionError {
  constructor({
    code,
    message,
    status_code,
    retryable,
    details = null,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
    details?: JsonRecord | null
  }) {
    super({
      code,
      message,
      status_code,
      retryable,
      details,
    })

    this.name =
      'StatefulCopilotOpenAIProviderError'
  }
}

function fail({
  code,
  message,
  status_code,
  retryable,
  details,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
  details?: JsonRecord | null
}): never {
  throw new StatefulCopilotOpenAIProviderError({
    code,
    message,
    status_code,
    retryable,
    details,
  })
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Array.isArray(value) === false
  )
}

function normalizeOptionalString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function normalizeTokenCount(
  value: unknown,
): number | null {
  if (
    typeof value !== 'number' ||
    Number.isSafeInteger(value) === false ||
    value < 0
  ) {
    return null
  }

  return value
}

function normalizeUsage(
  value: unknown,
): StatefulCopilotUsage | null {
  if (isRecord(value) === false) {
    return null
  }

  const usage = {
    input_tokens:
      normalizeTokenCount(
        value.input_tokens,
      ),

    output_tokens:
      normalizeTokenCount(
        value.output_tokens,
      ),

    total_tokens:
      normalizeTokenCount(
        value.total_tokens,
      ),
  }

  if (
    usage.input_tokens === null &&
    usage.output_tokens === null &&
    usage.total_tokens === null
  ) {
    return null
  }

  return usage
}

function normalizeBoundedInteger({
  value,
  fallback,
  minimum,
  maximum,
}: {
  value: unknown
  fallback: number
  minimum: number
  maximum: number
}): number {
  if (
    typeof value !== 'number' ||
    Number.isFinite(value) === false
  ) {
    return fallback
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(value),
    ),
  )
}

function resolveApiKey(
  options:
    StatefulCopilotOpenAIProviderOptions,
): string | null {
  const rawValue =
    options.api_key === undefined
      ? process.env.OPENAI_API_KEY
      : options.api_key

  return normalizeOptionalString(
    rawValue,
  )
}

function resolveModel(
  options:
    StatefulCopilotOpenAIProviderOptions,
): string {
  const rawValue =
    options.model === undefined
      ? process.env
          .OPENAI_STATEFUL_COPILOT_MODEL
      : options.model

  return (
    normalizeOptionalString(
      rawValue,
    ) ||
    DEFAULT_STATEFUL_COPILOT_OPENAI_MODEL
  )
}

function validateProviderRequest(
  request:
    StatefulCopilotProviderRequest,
) {
  if (
    typeof request.prompt_version !==
      'string' ||
    request.prompt_version.trim() === ''
  ) {
    fail({
      code:
        'INVALID_OPENAI_PROVIDER_REQUEST',

      message:
        'A versão do prompt recebida pelo provedor é inválida.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    typeof request.output_contract_version !==
      'string' ||
    request.output_contract_version.trim() === ''
  ) {
    fail({
      code:
        'INVALID_OPENAI_PROVIDER_REQUEST',

      message:
        'A versão do contrato recebida pelo provedor é inválida.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    request.system_prompt.trim() === '' ||
    request.user_prompt.trim() === ''
  ) {
    fail({
      code:
        'INVALID_OPENAI_PROVIDER_REQUEST',

      message:
        'O provedor recebeu prompts vazios.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    isRecord(
      request
        .structured_output_format,
    ) === false
  ) {
    fail({
      code:
        'INVALID_OPENAI_PROVIDER_REQUEST',

      message:
        'O provedor recebeu um formato de saída estruturada inválido.',

      status_code:
        500,

      retryable:
        false,
    })
  }
}

function buildOpenAIRequestBody({
  request,
  model,
  max_output_tokens,
}: {
  request:
    StatefulCopilotProviderRequest

  model: string
  max_output_tokens: number
}): JsonRecord {
  return {
    model,

    store:
      false,

    max_output_tokens,

    instructions:
      request.system_prompt,

    input: [
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

    text: {
      format:
        request
          .structured_output_format,
    },
  }
}

function getHttpErrorCode(
  status: number,
): string {
  if (status === 401) {
    return 'OPENAI_AUTHENTICATION_FAILED'
  }

  if (status === 403) {
    return 'OPENAI_PERMISSION_DENIED'
  }

  if (status === 429) {
    return 'OPENAI_RATE_LIMITED'
  }

  if (status >= 500) {
    return 'OPENAI_PROVIDER_UNAVAILABLE'
  }

  return 'OPENAI_REQUEST_REJECTED'
}

function getHttpErrorMessage(
  status: number,
): string {
  if (status === 401) {
    return 'A autenticação com a OpenAI falhou.'
  }

  if (status === 403) {
    return 'A OpenAI recusou o acesso ao modelo solicitado.'
  }

  if (status === 429) {
    return 'A OpenAI atingiu um limite temporário de solicitações.'
  }

  if (status >= 500) {
    return 'A OpenAI está temporariamente indisponível.'
  }

  return 'A OpenAI rejeitou a solicitação stateful.'
}

function isRetryableHttpStatus(
  status: number,
): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  )
}

function requireResponseSize(
  text: string,
) {
  if (
    text.length >
    MAX_OPENAI_RESPONSE_LENGTH
  ) {
    fail({
      code:
        'OPENAI_RESPONSE_TOO_LARGE',

      message:
        'A resposta da OpenAI ultrapassou o limite permitido.',

      status_code:
        502,

      retryable:
        false,
    })
  }
}

function parseSuccessEnvelope(
  text: string,
): JsonRecord {
  requireResponseSize(
    text,
  )

  let parsed: unknown

  try {
    parsed =
      JSON.parse(text)
  } catch {
    fail({
      code:
        'OPENAI_INVALID_RESPONSE',

      message:
        'A OpenAI retornou uma resposta que não contém JSON válido.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (isRecord(parsed) === false) {
    fail({
      code:
        'OPENAI_INVALID_RESPONSE',

      message:
        'A OpenAI retornou um envelope inválido.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (
    parsed.object !==
    'response'
  ) {
    fail({
      code:
        'OPENAI_INVALID_RESPONSE',

      message:
        'A OpenAI retornou um tipo de objeto incompatível.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return parsed
}

function extractOutputText(
  payload: JsonRecord,
): string {
  const status =
    normalizeOptionalString(
      payload.status,
    )

  if (status === 'incomplete') {
    fail({
      code:
        'OPENAI_RESPONSE_INCOMPLETE',

      message:
        'A OpenAI não concluiu a resposta stateful.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (
    status === 'failed' ||
    isRecord(
      payload.error,
    )
  ) {
    fail({
      code:
        'OPENAI_RESPONSE_FAILED',

      message:
        'A OpenAI informou falha ao gerar a resposta stateful.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (status !== 'completed') {
    fail({
      code:
        'OPENAI_INVALID_RESPONSE',

      message:
        'A resposta da OpenAI possui um estado incompatível.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (Array.isArray(payload.output) === false) {
    fail({
      code:
        'OPENAI_INVALID_RESPONSE',

      message:
        'A resposta da OpenAI não contém a coleção de saída esperada.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  const outputTexts:
    string[] = []

  for (
    const outputItem of
    payload.output
  ) {
    if (
      isRecord(outputItem) === false ||
      outputItem.type !== 'message' ||
      Array.isArray(
        outputItem.content,
      ) === false
    ) {
      continue
    }

    for (
      const contentItem of
      outputItem.content
    ) {
      if (isRecord(contentItem) === false) {
        continue
      }

      if (
        contentItem.type ===
        'refusal'
      ) {
        fail({
          code:
            'OPENAI_MODEL_REFUSAL',

          message:
            'O modelo recusou gerar a análise stateful solicitada.',

          status_code:
            422,

          retryable:
            false,
        })
      }

      if (
        contentItem.type !==
          'output_text' ||
        typeof contentItem.text !==
          'string' ||
        contentItem.text.trim() === ''
      ) {
        continue
      }

      outputTexts.push(
        contentItem.text,
      )
    }
  }

  const content =
    outputTexts
      .join('')
      .trim()

  if (content === '') {
    fail({
      code:
        'OPENAI_EMPTY_OUTPUT',

      message:
        'A OpenAI não retornou conteúdo textual utilizável.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return content
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    isRecord(error) &&
    error.name === 'AbortError'
  )
}

export function createStatefulCopilotOpenAIProvider(
  options:
    StatefulCopilotOpenAIProviderOptions = {},
): StatefulCopilotProvider {
  return async (
    request,
  ): Promise<StatefulCopilotProviderResponse> => {
    validateProviderRequest(
      request,
    )

    const apiKey =
      resolveApiKey(
        options,
      )

    if (apiKey === null) {
      fail({
        code:
          'OPENAI_NOT_CONFIGURED',

        message:
          'OPENAI_API_KEY não está configurada para o Copiloto stateful.',

        status_code:
          503,

        retryable:
          false,
      })
    }

    const model =
      resolveModel(
        options,
      )

    const timeout =
      normalizeBoundedInteger({
        value:
          options.timeout_ms,

        fallback:
          DEFAULT_STATEFUL_COPILOT_OPENAI_TIMEOUT_MS,

        minimum:
          10,

        maximum:
          120_000,
      })

    const maxOutputTokens =
      normalizeBoundedInteger({
        value:
          options.max_output_tokens,

        fallback:
          DEFAULT_STATEFUL_COPILOT_OPENAI_MAX_OUTPUT_TOKENS,

        minimum:
          256,

        maximum:
          32_000,
      })

    const fetchImpl =
      options.fetch_impl ??
      fetch

    const controller =
      new AbortController()

    const timeoutHandle =
      setTimeout(
        () => {
          controller.abort()
        },
        timeout,
      )

    try {
      let response: Response

      try {
        response =
          await fetchImpl(
            OPENAI_RESPONSES_URL,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',

                Accept:
                  'application/json',

                Authorization:
                  `Bearer ${apiKey}`,
              },

              signal:
                controller.signal,

              body:
                JSON.stringify(
                  buildOpenAIRequestBody({
                    request,
                    model,

                    max_output_tokens:
                      maxOutputTokens,
                  }),
                ),
            },
          )
      } catch (error) {
        if (
          controller.signal.aborted ||
          isAbortError(error)
        ) {
          fail({
            code:
              'OPENAI_REQUEST_TIMEOUT',

            message:
              'A solicitação stateful excedeu o tempo máximo permitido.',

            status_code:
              504,

            retryable:
              true,
          })
        }

        fail({
          code:
            'OPENAI_NETWORK_ERROR',

          message:
            'Não foi possível acessar a OpenAI.',

          status_code:
            502,

          retryable:
            true,
        })
      }

      let responseText: string

      try {
        responseText =
          await response.text()
      } catch (error) {
        if (
          controller.signal.aborted ||
          isAbortError(error)
        ) {
          fail({
            code:
              'OPENAI_REQUEST_TIMEOUT',

            message:
              'A solicitação stateful excedeu o tempo máximo permitido.',

            status_code:
              504,

            retryable:
              true,
          })
        }

        fail({
          code:
            'OPENAI_RESPONSE_READ_FAILED',

          message:
            'Não foi possível ler a resposta da OpenAI.',

          status_code:
            502,

          retryable:
            true,

          details: {
            provider_status:
              response.status,
          },
        })
      }

      requireResponseSize(
        responseText,
      )

      if (response.ok === false) {
        fail({
          code:
            getHttpErrorCode(
              response.status,
            ),

          message:
            getHttpErrorMessage(
              response.status,
            ),

          status_code:
            response.status,

          retryable:
            isRetryableHttpStatus(
              response.status,
            ),

          details: {
            provider_status:
              response.status,
          },
        })
      }

      const payload =
        parseSuccessEnvelope(
          responseText,
        )

      const content =
        extractOutputText(
          payload,
        )

      return {
        content,

        provider:
          'openai',

        model:
          normalizeOptionalString(
            payload.model,
          ) || model,

        request_id:
          normalizeOptionalString(
            response.headers.get(
              'x-request-id',
            ),
          ) ||
          normalizeOptionalString(
            payload.id,
          ),

        usage:
          normalizeUsage(
            payload.usage,
          ),
      }
    } finally {
      clearTimeout(
        timeoutHandle,
      )
    }
  }
}
