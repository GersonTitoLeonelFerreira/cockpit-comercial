import assert from 'node:assert/strict'
import test from 'node:test'

import {
  StatefulCopilotExecutionError,
} from './stateful-copilot-executor.ts'

import {
  StatefulCopilotPersistenceExecutionError,
} from './stateful-copilot-persistence-executor.ts'

import {
  DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS,
  STATEFUL_COPILOT_CYCLE_DEADLINE_MAXIMUM_MS,
  STATEFUL_COPILOT_CYCLE_DEADLINE_MINIMUM_MS,
  StatefulCopilotCycleDeadlineExceededError,
  StatefulCopilotPersistenceCycleDeadlineExceededError,
  resolveStatefulCopilotCycleDeadlineMs,
  wrapStatefulCopilotPersistenceWriterWithDeadline,
  wrapStatefulCopilotProviderWithDeadline,
} from './stateful-copilot-cycle-deadline.ts'

function delay(ms) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        ms,
      )
    },
  )
}

function buildRequest() {
  return {
    prompt_version:
      'test-prompt-v1',

    output_contract_version:
      'test-contract-v1',

    system_prompt:
      'SYSTEM',

    user_prompt:
      'USER',

    structured_output_format: {},
  }
}

test(
  'resolveStatefulCopilotCycleDeadlineMs usa o default quando nada é configurado',
  () => {
    const previous =
      process.env
        .STATEFUL_COPILOT_CYCLE_DEADLINE_MS

    delete process.env
      .STATEFUL_COPILOT_CYCLE_DEADLINE_MS

    try {
      assert.equal(
        resolveStatefulCopilotCycleDeadlineMs(),
        DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS,
      )
    } finally {
      if (previous === undefined) {
        delete process.env
          .STATEFUL_COPILOT_CYCLE_DEADLINE_MS
      } else {
        process.env
          .STATEFUL_COPILOT_CYCLE_DEADLINE_MS =
          previous
      }
    }
  },
)

test(
  'resolveStatefulCopilotCycleDeadlineMs respeita valor explícito dentro dos limites',
  () => {
    assert.equal(
      resolveStatefulCopilotCycleDeadlineMs({
        configured_value:
          40_000,
      }),
      40_000,
    )
  },
)

test(
  'resolveStatefulCopilotCycleDeadlineMs limita valores fora da faixa segura',
  () => {
    assert.equal(
      resolveStatefulCopilotCycleDeadlineMs({
        configured_value:
          1,
      }),
      STATEFUL_COPILOT_CYCLE_DEADLINE_MINIMUM_MS,
    )

    assert.equal(
      resolveStatefulCopilotCycleDeadlineMs({
        configured_value:
          10_000_000,
      }),
      STATEFUL_COPILOT_CYCLE_DEADLINE_MAXIMUM_MS,
    )
  },
)

test(
  'resolveStatefulCopilotCycleDeadlineMs lê a variável de ambiente quando não há valor explícito',
  () => {
    const previous =
      process.env
        .STATEFUL_COPILOT_CYCLE_DEADLINE_MS

    process.env
      .STATEFUL_COPILOT_CYCLE_DEADLINE_MS =
      '30000'

    try {
      assert.equal(
        resolveStatefulCopilotCycleDeadlineMs(),
        30_000,
      )
    } finally {
      if (previous === undefined) {
        delete process.env
          .STATEFUL_COPILOT_CYCLE_DEADLINE_MS
      } else {
        process.env
          .STATEFUL_COPILOT_CYCLE_DEADLINE_MS =
          previous
      }
    }
  },
)

// Cenário A: a primeira chamada termina dentro do prazo.
test(
  'provider wrapper resolve normalmente quando a chamada termina dentro do orçamento',
  async () => {
    let calls =
      0

    const provider =
      async (
        request,
      ) => {
        calls +=
          1

        await delay(
          10,
        )

        return {
          content:
            'ok',

          provider:
            'fake',

          request,
        }
      }

    const wrapped =
      wrapStatefulCopilotProviderWithDeadline({
        provider,

        deadline_at:
          Date.now() +
          500,

        minimum_remaining_ms:
          5,
      })

    const response =
      await wrapped(
        buildRequest(),
      )

    assert.equal(
      calls,
      1,
    )

    assert.equal(
      response.content,
      'ok',
    )
  },
)

test(
  'provider wrapper rejeita imediatamente, sem chamar o provedor, quando o orçamento já está esgotado',
  async () => {
    let calls =
      0

    const provider =
      async () => {
        calls +=
          1

        return {
          content:
            'nunca deveria rodar',

          provider:
            'fake',
        }
      }

    const wrapped =
      wrapStatefulCopilotProviderWithDeadline({
        provider,

        deadline_at:
          1_000,

        now:
          () =>
            999,

        minimum_remaining_ms:
          2_000,
      })

    await assert.rejects(
      () =>
        wrapped(
          buildRequest(),
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            StatefulCopilotCycleDeadlineExceededError,
        )

        assert.ok(
          error instanceof
            StatefulCopilotExecutionError,
        )

        assert.equal(
          error.code,
          'STATEFUL_CYCLE_DEADLINE_EXCEEDED',
        )

        assert.equal(
          error.retryable,
          false,
        )

        return true
      },
    )

    assert.equal(
      calls,
      0,
    )
  },
)

// Cenário D: deadline durante a comunicação/provedor resulta em falha segura
// (o runtime que consome esse erro cai para o fallback V1 — ver o teste de
// integração no orquestrador).
test(
  'provider wrapper abandona a chamada e rejeita com deadline quando o provedor demora além do orçamento',
  async () => {
    let providerSettled =
      false

    const provider =
      async () => {
        await delay(
          120,
        )

        providerSettled =
          true

        return {
          content:
            'tarde demais',

          provider:
            'fake',
        }
      }

    const wrapped =
      wrapStatefulCopilotProviderWithDeadline({
        provider,

        deadline_at:
          Date.now() +
          30,

        minimum_remaining_ms:
          5,
      })

    await assert.rejects(
      () =>
        wrapped(
          buildRequest(),
        ),
      (
        error,
      ) => {
        assert.equal(
          error.code,
          'STATEFUL_CYCLE_DEADLINE_EXCEEDED',
        )

        return true
      },
    )

    assert.equal(
      providerSettled,
      false,
    )

    // Aguarda o provedor abandonado terminar em segundo plano para garantir
    // que nenhuma unhandled rejection escape do teste.
    await delay(
      150,
    )

    assert.equal(
      providerSettled,
      true,
    )
  },
)

// Cenário B/C: a primeira chamada consome quase todo o orçamento; a segunda
// tentativa (mesmo deadline_at compartilhado) não recebe um novo orçamento
// cheio — e o retry não consegue ultrapassar o deadline global.
test(
  'chamadas sucessivas com o mesmo deadline_at compartilham o orçamento restante',
  async () => {
    const deadlineAt =
      Date.now() +
      60

    let secondCallSettled =
      false

    const provider =
      async (
        request,
      ) => {
        if (
          request.attempt ===
          1
        ) {
          await delay(
            50,
          )

          return {
            content:
              'primeira tentativa lenta',

            provider:
              'fake',
          }
        }

        await delay(
          40,
        )

        secondCallSettled =
          true

        return {
          content:
            'segunda tentativa, nunca deveria ser observada a tempo',

          provider:
            'fake',
        }
      }

    const wrapped =
      wrapStatefulCopilotProviderWithDeadline({
        provider,

        deadline_at:
          deadlineAt,

        minimum_remaining_ms:
          1,
      })

    const first =
      await wrapped({
        ...buildRequest(),

        attempt:
          1,
      })

    assert.equal(
      first.content,
      'primeira tentativa lenta',
    )

    await assert.rejects(
      () =>
        wrapped({
          ...buildRequest(),

          attempt:
            2,
        }),
      (
        error,
      ) => {
        assert.equal(
          error.code,
          'STATEFUL_CYCLE_DEADLINE_EXCEEDED',
        )

        return true
      },
    )

    assert.equal(
      secondCallSettled,
      false,
    )
  },
)

// Cenário E/F: deadline antes da persistência não expõe estado nem deixa
// gravação parcial — a escrita real nunca é iniciada.
test(
  'persistence writer wrapper rejeita antes de chamar o writer quando o orçamento já acabou',
  async () => {
    let calls =
      0

    const writer =
      async () => {
        calls +=
          1

        return {
          status:
            'persisted',
        }
      }

    const wrapped =
      wrapStatefulCopilotPersistenceWriterWithDeadline({
        writer,

        deadline_at:
          1_000,

        now:
          () =>
            999,

        minimum_remaining_ms:
          2_000,
      })

    await assert.rejects(
      () =>
        wrapped({
          operation_key:
            'op-1',

          plan: {},
        }),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceCycleDeadlineExceededError,
        )

        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'STATEFUL_CYCLE_DEADLINE_EXCEEDED',
        )

        return true
      },
    )

    assert.equal(
      calls,
      0,
    )
  },
)

test(
  'persistence writer wrapper delega normalmente quando ainda há orçamento suficiente',
  async () => {
    let calls =
      0

    const writer =
      async (
        request,
      ) => {
        calls +=
          1

        return {
          status:
            'persisted',

          request,
        }
      }

    const wrapped =
      wrapStatefulCopilotPersistenceWriterWithDeadline({
        writer,

        deadline_at:
          Date.now() +
          500,

        minimum_remaining_ms:
          5,
      })

    const response =
      await wrapped({
        operation_key:
          'op-1',

        plan: {},
      })

    assert.equal(
      calls,
      1,
    )

    assert.equal(
      response.status,
      'persisted',
    )
  },
)
