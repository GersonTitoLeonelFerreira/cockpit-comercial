// Leitura completa — cliente mínimo da API de Mensagens do Claude.
//
// Sem SDK: um POST com fetch, no mesmo estilo dos provedores já existentes
// no projeto. Liga o raciocínio adaptativo, define o esforço e pede a
// resposta num formato JSON fixo (saída estruturada). Se a API recusar o
// formato, repete uma vez sem ele; o prompt também pede JSON, e o parser
// aceita os dois casos.

export const ANTHROPIC_MESSAGES_URL =
  'https://api.anthropic.com/v1/messages'

export const ANTHROPIC_API_VERSION =
  '2023-06-01'

export const CLAUDE_EFFORT_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

export type ClaudeEffort =
  (typeof CLAUDE_EFFORT_LEVELS)[number]

const TRANSIENT_STATUS_CODES =
  new Set([408, 429, 500, 502, 503, 504, 529])

const TRANSIENT_RETRY_DELAY_MS =
  2_000

const MAX_ERROR_DETAIL_LENGTH =
  300

export type ClaudeReadingRequest = {
  apiKey: string
  model: string
  system: string
  userText: string
  maxTokens: number
  effort: ClaudeEffort | null
  outputSchema: Record<string, unknown> | null
  timeoutMs: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export type ClaudeReadingResponse = {
  text: string
  model: string | null
  stop_reason: string | null
  request_id: string | null
  input_tokens: number | null
  output_tokens: number | null
  used_structured_output: boolean
}

export class ClaudeProviderError extends Error {
  readonly code: string
  readonly status: number | null
  readonly retryable: boolean

  constructor({
    code,
    message,
    status = null,
    retryable = false,
  }: {
    code: string
    message: string
    status?: number | null
    retryable?: boolean
  }) {
    super(message)
    this.name = 'ClaudeProviderError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

export function buildClaudeRequestBody(
  request: Pick<
    ClaudeReadingRequest,
    'model' | 'system' | 'userText' | 'maxTokens' | 'effort' | 'outputSchema'
  >,
  options: { structured: boolean },
): Record<string, unknown> {
  const outputConfig: Record<string, unknown> = {}

  if (request.effort) {
    outputConfig.effort =
      request.effort
  }

  if (options.structured && request.outputSchema) {
    outputConfig.format = {
      type: 'json_schema',
      schema: request.outputSchema,
    }
  }

  const body: Record<string, unknown> = {
    model: request.model,
    max_tokens: request.maxTokens,
    system: request.system,
    thinking: {
      type: 'adaptive',
    },
    messages: [
      {
        role: 'user',
        content: request.userText,
      },
    ],
  }

  if (Object.keys(outputConfig).length > 0) {
    body.output_config =
      outputConfig
  }

  return body
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function readNumber(
  value: unknown,
): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null
}

function truncate(
  value: string,
): string {
  return value.length > MAX_ERROR_DETAIL_LENGTH
    ? `${value.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : value
}

function readErrorMessage(
  payload: unknown,
): string {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === 'string'
  ) {
    return truncate(payload.error.message)
  }

  return 'erro sem detalhe'
}

function isFormatRejection(
  status: number,
  message: string,
): boolean {
  return (
    status === 400 &&
    /output_config|format|json_schema|structured/i.test(message)
  )
}

export function readClaudeText(
  payload: unknown,
): {
  text: string
  model: string | null
  stop_reason: string | null
  input_tokens: number | null
  output_tokens: number | null
} {
  if (!isRecord(payload) || !Array.isArray(payload.content)) {
    throw new ClaudeProviderError({
      code: 'INVALID_PROVIDER_RESPONSE',
      message: 'A resposta da API não tem o formato esperado.',
    })
  }

  // Blocos de raciocínio (thinking) ficam de fora: só o texto final conta.
  const text =
    payload.content
      .filter(
        (block): block is Record<string, unknown> =>
          isRecord(block) && block.type === 'text',
      )
      .map((block) =>
        typeof block.text === 'string' ? block.text : '',
      )
      .join('')
      .trim()

  const usage =
    isRecord(payload.usage)
      ? payload.usage
      : {}

  return {
    text,
    model:
      typeof payload.model === 'string'
        ? payload.model
        : null,
    stop_reason:
      typeof payload.stop_reason === 'string'
        ? payload.stop_reason
        : null,
    input_tokens:
      readNumber(usage.input_tokens),
    output_tokens:
      readNumber(usage.output_tokens),
  }
}

async function postOnce(
  request: ClaudeReadingRequest,
  structured: boolean,
  deadline: number,
): Promise<{
  status: number
  payload: unknown
  request_id: string | null
}> {
  const fetchImpl =
    request.fetchImpl ?? fetch

  const remainingMs =
    deadline - Date.now()

  if (remainingMs <= 0) {
    throw new ClaudeProviderError({
      code: 'PROVIDER_TIMEOUT',
      message: 'O tempo limite da chamada terminou.',
      retryable: true,
    })
  }

  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () => controller.abort(),
      remainingMs,
    )

  try {
    const response =
      await fetchImpl(
        ANTHROPIC_MESSAGES_URL,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': request.apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
          },
          body: JSON.stringify(
            buildClaudeRequestBody(
              request,
              { structured },
            ),
          ),
          signal: controller.signal,
        },
      )

    const rawText =
      await response.text()

    let payload: unknown = null

    try {
      payload =
        rawText.length > 0
          ? JSON.parse(rawText)
          : null
    } catch {
      payload = null
    }

    return {
      status: response.status,
      payload,
      request_id:
        response.headers.get('request-id'),
    }
  } catch (error) {
    if (error instanceof ClaudeProviderError) {
      throw error
    }

    const aborted =
      error instanceof Error &&
      error.name === 'AbortError'

    throw new ClaudeProviderError({
      code: aborted
        ? 'PROVIDER_TIMEOUT'
        : 'PROVIDER_NETWORK_ERROR',
      message: aborted
        ? 'O tempo limite da chamada terminou.'
        : 'Falha de rede ao chamar a API.',
      retryable: true,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function callClaudeReading(
  request: ClaudeReadingRequest,
): Promise<ClaudeReadingResponse> {
  if (!request.apiKey) {
    throw new ClaudeProviderError({
      code: 'ANTHROPIC_API_KEY_MISSING',
      message: 'A chave da API da Anthropic não está configurada.',
    })
  }

  const sleep =
    request.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
      }))

  const deadline =
    Date.now() + request.timeoutMs

  let structured =
    request.outputSchema !== null

  let transientRetryUsed =
    false

  let formatFallbackUsed =
    false

  while (true) {
    const result =
      await postOnce(request, structured, deadline)

    if (result.status >= 200 && result.status < 300) {
      const parsed =
        readClaudeText(result.payload)

      if (parsed.stop_reason === 'max_tokens') {
        throw new ClaudeProviderError({
          code: 'PROVIDER_MAX_TOKENS',
          message: 'A resposta foi cortada pelo limite de tokens.',
        })
      }

      if (parsed.stop_reason === 'refusal') {
        throw new ClaudeProviderError({
          code: 'PROVIDER_REFUSAL',
          message: 'O modelo recusou a tarefa.',
        })
      }

      if (parsed.text.length === 0) {
        throw new ClaudeProviderError({
          code: 'EMPTY_PROVIDER_RESPONSE',
          message: 'A API respondeu sem texto final.',
        })
      }

      return {
        ...parsed,
        request_id: result.request_id,
        used_structured_output: structured,
      }
    }

    const message =
      readErrorMessage(result.payload)

    if (
      structured &&
      !formatFallbackUsed &&
      isFormatRejection(result.status, message)
    ) {
      structured = false
      formatFallbackUsed = true
      continue
    }

    if (
      TRANSIENT_STATUS_CODES.has(result.status) &&
      !transientRetryUsed &&
      deadline - Date.now() > TRANSIENT_RETRY_DELAY_MS * 5
    ) {
      transientRetryUsed = true
      await sleep(TRANSIENT_RETRY_DELAY_MS)
      continue
    }

    throw new ClaudeProviderError({
      code:
        result.status === 401 || result.status === 403
          ? 'PROVIDER_AUTH_FAILED'
          : TRANSIENT_STATUS_CODES.has(result.status)
            ? 'PROVIDER_UNAVAILABLE'
            : 'PROVIDER_REQUEST_REJECTED',
      message: `API respondeu ${result.status}: ${message}`,
      status: result.status,
      retryable:
        TRANSIENT_STATUS_CODES.has(result.status),
    })
  }
}
