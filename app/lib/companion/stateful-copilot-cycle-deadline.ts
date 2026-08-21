import {
  StatefulCopilotExecutionError,
  type StatefulCopilotProvider,
} from './stateful-copilot-executor'

import {
  StatefulCopilotPersistenceExecutionError,
  type StatefulCopilotPersistenceWriter,
} from './stateful-copilot-persistence-executor'

// O timeout individual por chamada (60s, ver DEFAULT_STATEFUL_COPILOT_OPENAI_TIMEOUT_MS)
// já existia antes deste módulo. O problema real, confirmado em telemetria (ciclos de
// ~61s e ~101s, faixa observada de 60-130s), é que um único ciclo pode encadear até 4
// chamadas ao provedor (diagnóstico + retry, comunicação + retry) sem nenhum orçamento
// agregado — cada chamada reinicia um timeout individual de 60s. Este módulo introduz
// um deadline de ciclo completo: toda chamada ao provedor ou à gravação de persistência
// criada a partir do mesmo `deadline_at` sabe quanto tempo resta e para de esperar
// quando o orçamento acaba, permitindo que o runtime caia com segurança para o V1.
export const DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS =
  75_000

export const STATEFUL_COPILOT_CYCLE_DEADLINE_MINIMUM_MS =
  5_000

export const STATEFUL_COPILOT_CYCLE_DEADLINE_MAXIMUM_MS =
  300_000

export const STATEFUL_COPILOT_CYCLE_DEADLINE_MINIMUM_REMAINING_MS =
  2_000

type Clock =
  () => number

export class StatefulCopilotCycleDeadlineExceededError
  extends StatefulCopilotExecutionError {
  constructor({
    message,
    details = null,
  }: {
    message: string
    details?: Record<string, unknown> | null
  }) {
    super({
      code:
        'STATEFUL_CYCLE_DEADLINE_EXCEEDED',

      message,

      status_code:
        504,

      retryable:
        false,

      details,
    })

    this.name =
      'StatefulCopilotCycleDeadlineExceededError'
  }
}

export class StatefulCopilotPersistenceCycleDeadlineExceededError
  extends StatefulCopilotPersistenceExecutionError {
  constructor({
    message,
  }: {
    message: string
  }) {
    super({
      code:
        'STATEFUL_CYCLE_DEADLINE_EXCEEDED',

      message,

      status_code:
        504,

      retryable:
        false,
    })

    this.name =
      'StatefulCopilotPersistenceCycleDeadlineExceededError'
  }
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
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN

  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(numeric),
    ),
  )
}

export function resolveStatefulCopilotCycleDeadlineMs({
  configured_value,
}: {
  configured_value?: number | null
} = {}): number {
  const rawValue =
    configured_value === undefined ||
    configured_value === null
      ? process.env
          .STATEFUL_COPILOT_CYCLE_DEADLINE_MS
      : configured_value

  return normalizeBoundedInteger({
    value:
      rawValue,

    fallback:
      DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS,

    minimum:
      STATEFUL_COPILOT_CYCLE_DEADLINE_MINIMUM_MS,

    maximum:
      STATEFUL_COPILOT_CYCLE_DEADLINE_MAXIMUM_MS,
  })
}

export function wrapStatefulCopilotProviderWithDeadline({
  provider,
  deadline_at,
  now = Date.now,
  minimum_remaining_ms =
    STATEFUL_COPILOT_CYCLE_DEADLINE_MINIMUM_REMAINING_MS,
}: {
  provider:
    StatefulCopilotProvider

  deadline_at:
    number

  now?:
    Clock

  minimum_remaining_ms?:
    number
}): StatefulCopilotProvider {
  return async (
    request,
  ) => {
    const remainingMs =
      deadline_at -
      now()

    if (
      remainingMs <=
      minimum_remaining_ms
    ) {
      throw new StatefulCopilotCycleDeadlineExceededError({
        message:
          'O orçamento de tempo do ciclo stateful já estava esgotado antes desta chamada ao provedor.',

        details: {
          remaining_ms:
            remainingMs,
        },
      })
    }

    const providerPromise =
      provider(
        request,
      )

    // Se o deadline vencer primeiro, a chamada real ao provedor é abandonada (ela
    // pode continuar em segundo plano até seu próprio timeout individual). Este
    // catch silencioso evita um unhandled rejection quando isso acontece.
    providerPromise.catch(
      () => {},
    )

    let timeoutHandle:
      ReturnType<typeof setTimeout> | null =
        null

    const deadlineTimeout =
      new Promise<never>(
        (
          _resolve,
          reject,
        ) => {
          timeoutHandle =
            setTimeout(
              () => {
                reject(
                  new StatefulCopilotCycleDeadlineExceededError({
                    message:
                      'O orçamento de tempo do ciclo stateful foi esgotado aguardando o provedor.',

                    details: {
                      remaining_ms:
                        remainingMs,
                    },
                  }),
                )
              },
              remainingMs,
            )
        },
      )

    try {
      return await Promise.race([
        providerPromise,
        deadlineTimeout,
      ])
    } finally {
      if (
        timeoutHandle !==
        null
      ) {
        clearTimeout(
          timeoutHandle,
        )
      }
    }
  }
}

export function wrapStatefulCopilotPersistenceWriterWithDeadline({
  writer,
  deadline_at,
  now = Date.now,
  minimum_remaining_ms =
    STATEFUL_COPILOT_CYCLE_DEADLINE_MINIMUM_REMAINING_MS,
}: {
  writer:
    StatefulCopilotPersistenceWriter

  deadline_at:
    number

  now?:
    Clock

  minimum_remaining_ms?:
    number
}): StatefulCopilotPersistenceWriter {
  return async (
    request,
  ) => {
    const remainingMs =
      deadline_at -
      now()

    if (
      remainingMs <=
      minimum_remaining_ms
    ) {
      throw new StatefulCopilotPersistenceCycleDeadlineExceededError({
        message:
          'O orçamento de tempo do ciclo stateful foi esgotado antes de gravar o estado comercial. Nenhuma gravação foi iniciada.',
      })
    }

    return writer(
      request,
    )
  }
}
