import assert from 'node:assert/strict'
import test from 'node:test'

import {
  StatefulCopilotCompositionError,
  createDeterministicStatefulCommercialMemoryId,
  createStatefulCopilotComposition,
} from './stateful-copilot-composition.ts'

import {
  StatefulCopilotServerConfigurationError,
  createStatefulCopilotServerComposition,
} from '../server/stateful-copilot-composition.ts'

function createUnusedClient() {
  return {
    from() {
      throw new Error(
        'from não deveria ser chamado durante a composição',
      )
    },

    async rpc() {
      throw new Error(
        'rpc não deveria ser chamada durante a composição',
      )
    },
  }
}

test(
  'gera identificador determinístico sem expor o ciclo original',
  () => {
    const input = {
      cycle_id:
        '30000000-0000-4000-8000-000000000001',

      collection:
        'facts',

      state_version:
        2,

      item_index:
        0,
    }

    const first =
      createDeterministicStatefulCommercialMemoryId(
        input,
      )

    const second =
      createDeterministicStatefulCommercialMemoryId(
        input,
      )

    const anotherItem =
      createDeterministicStatefulCommercialMemoryId({
        ...input,

        item_index:
          1,
      })

    assert.equal(
      first,
      second,
    )

    assert.notEqual(
      first,
      anotherItem,
    )

    assert.match(
      first,
      /^stateful-memory-[a-f0-9]{64}$/,
    )

    assert.equal(
      first.includes(
        input.cycle_id,
      ),
      false,
    )
  },
)

test(
  'rejeita entrada inválida do gerador de memória',
  () => {
    assert.throws(
      () =>
        createDeterministicStatefulCommercialMemoryId({
          cycle_id:
            'cycle-1',

          collection:
            'facts',

          state_version:
            0,

          item_index:
            0,
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotCompositionError,
        )

        assert.equal(
          error.code,
          'INVALID_MEMORY_ID_INPUT',
        )

        assert.equal(
          error.path,
          'input.state_version',
        )

        return true
      },
    )
  },
)

test(
  'cria leitor, escritor e provedor sem executar o fluxo',
  () => {
    const client =
      createUnusedClient()

    const calls = {
      reader:
        0,

      writer:
        0,

      provider:
        0,

      service:
        0,
    }

    const reader =
      async () => ({
        mode:
          'missing',
      })

    const writer =
      async () => ({
        status:
          'persisted',
      })

    const provider =
      async () => ({
        content:
          '{}',
      })

    const composition =
      createStatefulCopilotComposition({
        client,

        openai_options: {
          api_key:
            'openai-test-key',

          model:
            'model-test',
        },

        dependencies: {
          create_reader({
            client:
              receivedClient,
          }) {
            calls.reader += 1

            assert.equal(
              receivedClient,
              client,
            )

            return reader
          },

          create_writer({
            client:
              receivedClient,
          }) {
            calls.writer += 1

            assert.equal(
              receivedClient,
              client,
            )

            return writer
          },

          create_provider(
            options,
          ) {
            calls.provider += 1

            assert.deepEqual(
              options,
              {
                api_key:
                  'openai-test-key',

                model:
                  'model-test',
              },
            )

            return provider
          },

          async run_service() {
            calls.service += 1

            throw new Error(
              'o serviço não deveria ser executado durante a composição',
            )
          },
        },
      })

    assert.equal(
      calls.reader,
      1,
    )

    assert.equal(
      calls.writer,
      1,
    )

    assert.equal(
      calls.provider,
      1,
    )

    assert.equal(
      calls.service,
      0,
    )

    assert.equal(
      composition.reader,
      reader,
    )

    assert.equal(
      composition.writer,
      writer,
    )

    assert.equal(
      composition.provider,
      provider,
    )
  },
)

test(
  'injeta as dependências no serviço somente quando run é chamado',
  async () => {
    const client =
      createUnusedClient()

    const reader =
      async () => ({
        mode:
          'missing',
      })

    const writer =
      async () => ({
        status:
          'persisted',
      })

    const provider =
      async () => ({
        content:
          '{}',
      })

    const createMemoryId =
      () =>
        'memory-test'

    const diagnosticInput = {
      company_id:
        'company-1',

      cycle_id:
        'cycle-1',

      conversation_key:
        'conversation-1',
    }

    const serviceDependencies = {
      run_engine:
        async () => ({
          mode:
            'blocked',
        }),
    }

    const expectedResult = {
      state_read: {
        mode:
          'missing',
      },

      engine_result: {
        mode:
          'blocked',
      },

      persistence_plan: {
        mode:
          'blocked',
      },

      persistence_result: {
        mode:
          'skipped',
      },
    }

    let receivedArgs =
      null

    const composition =
      createStatefulCopilotComposition({
        client,

        create_memory_id:
          createMemoryId,

        dependencies: {
          create_reader:
            () =>
              reader,

          create_writer:
            () =>
              writer,

          create_provider:
            () =>
              provider,

          async run_service(
            args,
          ) {
            receivedArgs =
              args

            return expectedResult
          },
        },
      })

    const result =
      await composition.run({
        diagnostic_input:
          diagnosticInput,

        known_message_ids: [
          'm1',
          'm2',
        ],

        generated_at:
          '2026-08-06T20:50:00-03:00',

        dependencies:
          serviceDependencies,
      })

    assert.equal(
      result,
      expectedResult,
    )

    assert.equal(
      receivedArgs.diagnostic_input,
      diagnosticInput,
    )

    assert.deepEqual(
      receivedArgs.known_message_ids,
      [
        'm1',
        'm2',
      ],
    )

    assert.equal(
      receivedArgs.generated_at,
      '2026-08-06T20:50:00-03:00',
    )

    assert.equal(
      receivedArgs.reader,
      reader,
    )

    assert.equal(
      receivedArgs.writer,
      writer,
    )

    assert.equal(
      receivedArgs.provider,
      provider,
    )

    assert.equal(
      receivedArgs.create_memory_id,
      createMemoryId,
    )

    assert.equal(
      receivedArgs.dependencies,
      serviceDependencies,
    )
  },
)

test(
  'composição server-only cria cliente administrativo sem sessão',
  () => {
    const client =
      createUnusedClient()

    let clientFactoryArgs =
      null

    let providerOptions =
      null

    let serviceCalls =
      0

    const composition =
      createStatefulCopilotServerComposition({
        supabase_url:
          'https://example.supabase.co',

        supabase_service_role_key:
          'service-role-test-key',

        openai_api_key:
          'openai-test-key',

        openai_model:
          'stateful-model-test',

        openai_communication_model:
          'communication-model-test',

        openai_timeout_ms:
          45_000,

        openai_max_output_tokens:
          4_000,

        create_supabase_client(
          url,
          serviceRoleKey,
          options,
        ) {
          clientFactoryArgs = {
            url,
            serviceRoleKey,
            options,
          }

          return client
        },

        composition_dependencies: {
          create_reader:
            () =>
              async () => ({
                mode:
                  'missing',
              }),

          create_writer:
            () =>
              async () => ({
                status:
                  'persisted',
              }),

          create_provider(
            options,
          ) {
            providerOptions =
              options

            return async () => ({
              content:
                '{}',
            })
          },

          async run_service() {
            serviceCalls += 1

            throw new Error(
              'o serviço não deveria executar durante a composição',
            )
          },
        },
      })

    assert.deepEqual(
      clientFactoryArgs,
      {
        url:
          'https://example.supabase.co/',

        serviceRoleKey:
          'service-role-test-key',

        options: {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,

            detectSessionInUrl:
              false,
          },
        },
      },
    )

    assert.deepEqual(
      providerOptions,
      {
        api_key:
          'openai-test-key',

        model:
          'stateful-model-test',

        communication_model:
          'communication-model-test',

        timeout_ms:
          45_000,

        max_output_tokens:
          4_000,
      },
    )

    assert.equal(
      serviceCalls,
      0,
    )

    assert.equal(
      typeof composition.run,
      'function',
    )
  },
)

test(
  'composição server-only não consulta Supabase nem OpenAI ao ser criada',
  () => {
    const calls = {
      from:
        0,

      rpc:
        0,

      provider:
        0,

      service:
        0,
    }

    const client = {
      from() {
        calls.from += 1

        throw new Error(
          'leitura não autorizada neste teste',
        )
      },

      async rpc() {
        calls.rpc += 1

        throw new Error(
          'gravação não autorizada neste teste',
        )
      },
    }

    createStatefulCopilotServerComposition({
      supabase_url:
        'https://example.supabase.co',

      supabase_service_role_key:
        'service-role-test-key',

      openai_api_key:
        'openai-test-key',

      create_supabase_client:
        () =>
          client,

      composition_dependencies: {
        create_reader:
          () =>
            async () => ({
              mode:
                'missing',
            }),

        create_writer:
          () =>
            async () => ({
              status:
                'persisted',
            }),

        create_provider:
          () =>
            async () => {
              calls.provider += 1

              return {
                content:
                  '{}',
              }
            },

        async run_service() {
          calls.service += 1

          throw new Error(
            'serviço não autorizado neste teste',
          )
        },
      },
    })

    assert.deepEqual(
      calls,
      {
        from:
          0,

        rpc:
          0,

        provider:
          0,

        service:
          0,
      },
    )
  },
)

test(
  'rejeita configuração ausente antes de criar o cliente',
  () => {
    let clientCalls =
      0

    assert.throws(
      () =>
        createStatefulCopilotServerComposition({
          supabase_url:
            null,

          supabase_service_role_key:
            null,

          openai_api_key:
            null,

          create_supabase_client:
            () => {
              clientCalls += 1

              return createUnusedClient()
            },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotServerConfigurationError,
        )

        assert.equal(
          error.code,
          'MISSING_STATEFUL_SERVER_CONFIGURATION',
        )

        assert.equal(
          error.configuration_key,
          'NEXT_PUBLIC_SUPABASE_URL',
        )

        assert.equal(
          error.message.includes(
            'service-role-test-key',
          ),
          false,
        )

        return true
      },
    )

    assert.equal(
      clientCalls,
      0,
    )
  },
)

test(
  'rejeita URL Supabase inválida sem criar o cliente',
  () => {
    let clientCalls =
      0

    assert.throws(
      () =>
        createStatefulCopilotServerComposition({
          supabase_url:
            'arquivo-local',

          supabase_service_role_key:
            'service-role-test-key',

          openai_api_key:
            'openai-test-key',

          create_supabase_client:
            () => {
              clientCalls += 1

              return createUnusedClient()
            },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotServerConfigurationError,
        )

        assert.equal(
          error.code,
          'INVALID_STATEFUL_SUPABASE_URL',
        )

        return true
      },
    )

    assert.equal(
      clientCalls,
      0,
    )
  },
)
