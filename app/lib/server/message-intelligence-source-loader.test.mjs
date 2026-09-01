// Testes do Message Context Source Loader real (server-side,
// device-independent) do Message Intelligence Engine V1 — Shadow
// Validation.
//
// Cobre:
// - Provenance: conversation_messages.id é preservado como message_id
//   (texto, áudio transcrito, deletada, mensagens antigas, current
//   interaction) — nenhum id inventado.
// - Durable memory: ciclo com state -> usa state atual (seed null);
//   ciclo sem state + ciclo anterior com state -> seed legítimo; ciclo
//   sem state e sem ciclo anterior -> null; falha best-effort -> null.
// - Device independence: nenhum device_key em nenhuma camada.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMessageIntelligenceFakeAdmin,
  buildTestConfigVersion,
  buildTestCommercialState,
} from '../companion/e2-test-support/fake-message-intelligence-admin.mjs'

import {
  createMessageIntelligenceSourceLoaderV1,
} from './message-intelligence-source-loader.ts'

import {
  loadStatefulCopilotCanonicalScope,
} from '../companion/stateful-copilot-real-context-loader.ts'

const IDS = {
  company: '10000000-0000-4000-8000-000000000001',
  lead: '20000000-0000-4000-8000-000000000001',
  cycle: '30000000-0000-4000-8000-000000000001',
  previousCycle: '30000000-0000-4000-8000-000000000002',
  seller: '40000000-0000-4000-8000-000000000001',
  configVersion: '50000000-0000-4000-8000-000000000001',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REFERENCE_TIME = '2026-08-29T22:00:00.000Z'

function baseScopeRows() {
  return {
    companies: [
      {
        id: IDS.company,
        name: 'Empresa Fixture',
        platform_status: 'active',
        onboarding_status: 'active',
      },
    ],
    leads: [
      {
        id: IDS.lead,
        company_id: IDS.company,
        name: 'Cliente Fixture',
        phone: '+5547999990001',
        email: null,
        updated_at: '2026-08-29T21:55:00.000Z',
      },
    ],
    cycles: [
      {
        id: IDS.cycle,
        company_id: IDS.company,
        lead_id: IDS.lead,
        owner_user_id: IDS.seller,
        status: 'respondeu',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-08-29T21:55:00.000Z',
        origin_cycle_id: null,
      },
    ],
  }
}

function buildRequest(overrides = {}) {
  return {
    contract_version: 'message-intelligence-request-v1',
    request_id: '60000000-0000-4000-8000-000000000001',
    company_id: IDS.company,
    seller_user_id: IDS.seller,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    seller_intent: 'Quero confirmar o próximo passo com o cliente.',
    reference_time: REFERENCE_TIME,
    ...overrides,
  }
}

// ----------------------------------------------------------------------------
// Provenance — conversation_messages.id preservado como message_id.
// ----------------------------------------------------------------------------

test(
  'provenance: message_id preserva conversation_messages.id para texto, áudio, deletada e mensagens antigas',
  async () => {
    const scope = baseScopeRows()

    const reconciliation = [
      { company_id: IDS.company, conversation_key: CONVERSATION_KEY, current_message_id: 1, message_key: 'm1' },
      { company_id: IDS.company, conversation_key: CONVERSATION_KEY, current_message_id: 2, message_key: 'm2' },
      { company_id: IDS.company, conversation_key: CONVERSATION_KEY, current_message_id: 3, message_key: 'm3' },
      { company_id: IDS.company, conversation_key: CONVERSATION_KEY, current_message_id: 4, message_key: 'm4' },
    ]

    const messages = [
      // Mensagem antiga (fora da janela de current_interaction, mas
      // ainda parte do histórico canônico).
      {
        id: 4,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'm4',
        version: 1,
        direction: 'incoming',
        occurred_at: '2026-08-20T10:00:00.000Z',
        observed_at: '2026-08-20T10:00:01.000Z',
        content_type: 'text',
        text_content: 'Mensagem antiga do início da conversa.',
        audio_transcription: null,
        is_deleted: false,
      },
      // Versão superada de m1 (a reconciliação aponta para o id 1, não
      // para este id 10 — prova que o id preservado é o da versão
      // vigente, não de uma versão antiga qualquer).
      {
        id: 10,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'm1',
        version: 1,
        direction: 'outgoing',
        occurred_at: '2026-08-29T21:49:00.000Z',
        observed_at: '2026-08-29T21:49:01.000Z',
        content_type: 'text',
        text_content: 'Versão editada, superada.',
        audio_transcription: null,
        is_deleted: false,
      },
      {
        id: 1,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'm1',
        version: 2,
        direction: 'outgoing',
        occurred_at: '2026-08-29T21:50:00.000Z',
        observed_at: '2026-08-29T21:50:01.000Z',
        content_type: 'text',
        text_content: 'Como posso ajudar?',
        audio_transcription: null,
        is_deleted: false,
      },
      {
        id: 2,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'm2',
        version: 1,
        direction: 'incoming',
        occurred_at: '2026-08-29T21:55:00.000Z',
        observed_at: '2026-08-29T21:55:01.000Z',
        content_type: 'audio',
        text_content: null,
        audio_transcription: 'Qual é a condição de pagamento?',
        is_deleted: false,
      },
      {
        id: 3,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'm3',
        version: 2,
        direction: 'incoming',
        occurred_at: '2026-08-29T21:56:00.000Z',
        observed_at: '2026-08-29T21:56:01.000Z',
        content_type: 'text',
        text_content: null,
        audio_transcription: null,
        is_deleted: true,
      },
    ]

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation,
        messages,
        configVersions: [],
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const request = buildRequest()
    const sources = await loadSources(request)

    const active =
      sources.real_context.diagnostic_input
        .conversation.messages
    const excluded =
      sources.real_context.diagnostic_input
        .conversation.excluded_messages

    const byKey = (key) =>
      active.find((m) => m.message_key === key)

    // A versão vigente de m1 é o id 1 — nunca o id 10 (versão
    // superada) nem um id inventado.
    assert.equal(byKey('m1').id, '1')
    assert.equal(byKey('m1').version, 2)
    assert.equal(byKey('m4').id, '4')
    assert.equal(byKey('m2').id, '2')
    assert.equal(
      byKey('m2').audio_transcription,
      'Qual é a condição de pagamento?',
    )

    assert.equal(excluded.length, 1)
    assert.equal(excluded[0].id, '3')
    assert.equal(excluded[0].message_key, 'm3')

    assert.deepEqual(
      [...sources.real_context.known_message_ids].sort(),
      ['1', '10', '2', '3', '4'],
    )
    assert.deepEqual(
      [...sources.real_context.active_message_ids].sort(),
      ['1', '2', '4'],
    )

    // Nenhum id fabricado: todo id ativo/excluído corresponde a uma
    // linha real de conversation_messages.
    const realIds = new Set(
      messages.map((m) => String(m.id)),
    )

    for (const id of sources.real_context.known_message_ids) {
      assert.ok(
        realIds.has(id),
        `message_id "${id}" não corresponde a nenhuma linha real.`,
      )
    }
  },
)

// ----------------------------------------------------------------------------
// Durable memory.
// ----------------------------------------------------------------------------

test(
  'durable memory: ciclo atual com state usa o state atual (seed permanece null)',
  async () => {
    const scope = baseScopeRows()

    const commercialStates = [
      {
        id: 'state-1',
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        state_version: 3,
        state_contract_version:
          'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-29T21:55:00.000Z',
        state_snapshot: buildTestCommercialState({
          cycleId: IDS.cycle,
          evidenceMessageIds: ['1'],
        }),
        persisted_at: '2026-08-29T21:56:00.000Z',
      },
    ]

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [
          {
            company_id: IDS.company,
            conversation_key: CONVERSATION_KEY,
            current_message_id: 1,
            message_key: 'm1',
          },
        ],
        messages: [
          {
            id: 1,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'm1',
            version: 1,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:50:00.000Z',
            observed_at: '2026-08-29T21:50:01.000Z',
            content_type: 'text',
            text_content: 'Olá.',
            audio_transcription: null,
            is_deleted: false,
          },
        ],
        configVersions: [],
        commercialStates,
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const sources = await loadSources(buildRequest())

    assert.equal(
      sources.real_context.state_read.mode,
      'found',
    )
    assert.equal(
      sources.real_context.durable_memory_seed,
      null,
    )
  },
)

test(
  'durable memory: ciclo atual sem state, com ciclo anterior com state, produz seed legítimo',
  async () => {
    const scope = baseScopeRows()

    scope.cycles[0].origin_cycle_id =
      IDS.previousCycle

    scope.cycles.push({
      id: IDS.previousCycle,
      company_id: IDS.company,
      lead_id: IDS.lead,
      owner_user_id: IDS.seller,
      status: 'perdido',
      next_action: null,
      next_action_date: null,
      updated_at: '2026-08-10T10:00:00.000Z',
      origin_cycle_id: null,
      created_at: '2026-08-01T10:00:00.000Z',
    })

    const commercialStates = [
      {
        id: 'state-previous',
        company_id: IDS.company,
        cycle_id: IDS.previousCycle,
        conversation_key: 'whatsapp:+5547999990009',
        state_version: 5,
        state_contract_version:
          'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-10T09:00:00.000Z',
        state_snapshot: buildTestCommercialState({
          cycleId: IDS.previousCycle,
          facts: [
            {
              kind: 'client.objective',
              summary:
                'Cliente busca reduzir custos operacionais.',
              value: null,
              confidence: 'high',
              memory_status: 'active',
            },
          ],
        }),
        persisted_at: '2026-08-10T09:05:00.000Z',
      },
    ]

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [],
        configVersions: [],
        commercialStates,
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const sources = await loadSources(buildRequest())

    assert.equal(
      sources.real_context.state_read.mode,
      'missing',
    )
    assert.notEqual(
      sources.real_context.durable_memory_seed,
      null,
    )
    assert.equal(
      sources.real_context.durable_memory_seed
        .source_cycle_id,
      IDS.previousCycle,
    )
  },
)

test(
  'durable memory: ciclo atual sem state e sem ciclo anterior permanece null (nunca fabrica memória)',
  async () => {
    const scope = baseScopeRows()

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [],
        configVersions: [],
        commercialStates: [],
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const sources = await loadSources(buildRequest())

    assert.equal(
      sources.real_context.state_read.mode,
      'missing',
    )
    assert.equal(
      sources.real_context.durable_memory_seed,
      null,
    )
  },
)

test(
  'durable memory: falha best-effort na busca do ciclo anterior nunca fabrica memória',
  async () => {
    const scope = baseScopeRows()
    scope.cycles[0].origin_cycle_id = null

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [],
        configVersions: [],
        commercialStates: [],
      })

    const originalFrom = admin.from.bind(admin)
    admin.from = (table) => {
      if (table === 'sales_cycles') {
        // Primeira leitura (load_scope) funciona normalmente; a busca
        // de ciclo anterior dentro da memória durável falha.
        const real = originalFrom(table)
        const originalSelect = real.select.bind(real)

        real.select = (columns) => {
          if (columns === 'origin_cycle_id') {
            return {
              eq() {
                return this
              },
              maybeSingle: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'boom' },
                }),
            }
          }

          return originalSelect(columns)
        }

        return real
      }

      return originalFrom(table)
    }

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const sources = await loadSources(buildRequest())

    assert.equal(
      sources.real_context.durable_memory_seed,
      null,
    )
  },
)

// ----------------------------------------------------------------------------
// Device independence.
// ----------------------------------------------------------------------------

function hasDeviceKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object') {
    return false
  }

  if (seen.has(value)) {
    return false
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.some((item) => hasDeviceKey(item, seen))
  }

  if ('device_key' in value) {
    return true
  }

  return Object.values(value).some((item) =>
    hasDeviceKey(item, seen),
  )
}

test(
  'device independence: request, scope e fontes carregadas nunca contêm device_key',
  async () => {
    const scope = baseScopeRows()

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [],
        configVersions: [
          buildTestConfigVersion({
            id: IDS.configVersion,
            companyId: IDS.company,
          }),
        ],
      })

    const loadSources =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const request = buildRequest()

    assert.equal(
      'device_key' in request,
      false,
    )

    const sources = await loadSources(request)

    assert.equal(
      hasDeviceKey(sources),
      false,
    )
  },
)


test(
  'scope do MIE é idêntico à primitive canônica compartilhada com o stateful',
  async () => {
    const scope =
      baseScopeRows()

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [],
        configVersions: [],
      })

    const canonicalScope =
      await loadStatefulCopilotCanonicalScope({
        client: admin,
        companyId: IDS.company,
        cycleId: IDS.cycle,
      })

    const sources =
      await createMessageIntelligenceSourceLoaderV1({
        admin,
      })(
        buildRequest(),
      )

    assert.deepEqual(
      sources.real_context.scope,
      {
        company:
          canonicalScope.company,
        lead:
          canonicalScope.lead,
        cycle:
          canonicalScope.cycle,
        conversation_key:
          CONVERSATION_KEY,
      },
    )
  },
)

test(
  'reference_time exclui mensagem nova observada depois do cutoff',
  async () => {
    const scope =
      baseScopeRows()

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [
          {
            id: 1,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'before',
            version: 1,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:58:00.000Z',
            observed_at: '2026-08-29T21:58:01.000Z',
            content_type: 'text',
            text_content: 'Mensagem presente no corte.',
            audio_transcription: null,
            is_deleted: false,
          },
          {
            id: 2,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'after',
            version: 1,
            direction: 'incoming',
            occurred_at: '2026-08-29T22:01:00.000Z',
            observed_at: '2026-08-29T22:01:01.000Z',
            content_type: 'text',
            text_content: 'Mensagem posterior ao corte.',
            audio_transcription: null,
            is_deleted: false,
          },
        ],
        configVersions: [],
      })

    const sources =
      await createMessageIntelligenceSourceLoaderV1({
        admin,
      })(
        buildRequest(),
      )

    assert.deepEqual(
      sources.real_context.known_message_ids,
      ['1'],
    )

    assert.deepEqual(
      sources.real_context
        .diagnostic_input
        .conversation
        .messages
        .map((message) => message.message_key),
      ['before'],
    )
  },
)

test(
  'edição observada depois do cutoff não substitui a versão existente no reference_time',
  async () => {
    const scope =
      baseScopeRows()

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [
          {
            id: 1,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'edited',
            version: 1,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:58:00.000Z',
            observed_at: '2026-08-29T21:58:01.000Z',
            content_type: 'text',
            text_content: 'Texto vigente no cutoff.',
            audio_transcription: null,
            is_deleted: false,
          },
          {
            id: 2,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'edited',
            version: 2,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:58:00.000Z',
            observed_at: '2026-08-29T22:02:00.000Z',
            content_type: 'text',
            text_content: 'Texto editado depois.',
            audio_transcription: null,
            is_deleted: false,
          },
        ],
        configVersions: [],
      })

    const sources =
      await createMessageIntelligenceSourceLoaderV1({
        admin,
      })(
        buildRequest(),
      )

    const message =
      sources.real_context
        .diagnostic_input
        .conversation
        .messages[0]

    assert.equal(
      message.id,
      '1',
    )
    assert.equal(
      message.version,
      1,
    )
    assert.equal(
      message.text_content,
      'Texto vigente no cutoff.',
    )
  },
)

test(
  'exclusão observada depois do cutoff não apaga retroativamente a mensagem',
  async () => {
    const scope =
      baseScopeRows()

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [
          {
            id: 1,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'deleted-later',
            version: 1,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:58:00.000Z',
            observed_at: '2026-08-29T21:58:01.000Z',
            content_type: 'text',
            text_content: 'Ainda existia no cutoff.',
            audio_transcription: null,
            is_deleted: false,
          },
          {
            id: 2,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'deleted-later',
            version: 2,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:58:00.000Z',
            observed_at: '2026-08-29T22:03:00.000Z',
            content_type: 'text',
            text_content: null,
            audio_transcription: null,
            is_deleted: true,
            deletion_reason: 'explicit_deletion',
          },
        ],
        configVersions: [],
      })

    const sources =
      await createMessageIntelligenceSourceLoaderV1({
        admin,
      })(
        buildRequest(),
      )

    assert.deepEqual(
      sources.real_context.active_message_ids,
      ['1'],
    )
    assert.deepEqual(
      sources.real_context
        .diagnostic_input
        .conversation
        .excluded_message_ids,
      [],
    )
  },
)

test(
  'restauração observada depois do cutoff não restaura retroativamente mensagem já excluída',
  async () => {
    const scope =
      baseScopeRows()

    const { admin } =
      createMessageIntelligenceFakeAdmin({
        ...scope,
        reconciliation: [],
        messages: [
          {
            id: 1,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'restored-later',
            version: 1,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:50:00.000Z',
            observed_at: '2026-08-29T21:50:01.000Z',
            content_type: 'text',
            text_content: 'Texto original.',
            audio_transcription: null,
            is_deleted: false,
          },
          {
            id: 2,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'restored-later',
            version: 2,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:50:00.000Z',
            observed_at: '2026-08-29T21:59:00.000Z',
            content_type: 'text',
            text_content: null,
            audio_transcription: null,
            is_deleted: true,
            deletion_reason: 'explicit_deletion',
          },
          {
            id: 3,
            company_id: IDS.company,
            cycle_id: IDS.cycle,
            conversation_key: CONVERSATION_KEY,
            message_key: 'restored-later',
            version: 3,
            direction: 'incoming',
            occurred_at: '2026-08-29T21:50:00.000Z',
            observed_at: '2026-08-29T22:04:00.000Z',
            content_type: 'text',
            text_content: 'Texto restaurado depois.',
            audio_transcription: null,
            is_deleted: false,
          },
        ],
        configVersions: [],
      })

    const sources =
      await createMessageIntelligenceSourceLoaderV1({
        admin,
      })(
        buildRequest(),
      )

    assert.deepEqual(
      sources.real_context.active_message_ids,
      [],
    )
    assert.deepEqual(
      sources.real_context
        .diagnostic_input
        .conversation
        .excluded_message_ids,
      ['2'],
    )
  },
)
