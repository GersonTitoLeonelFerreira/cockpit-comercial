// ============================================================================
// MIE V1 — Simulador técnico interno
// Synthetic Source Loader (in-memory)
//
// Constrói, inteiramente em memória, o MessageIntelligenceRequestV1 e o
// MessageIntelligenceContextSourcesV1 exigidos pelo runner REAL do MIE V1
// (runMessageIntelligenceV1). NÃO lê nem escreve nada no Supabase — este
// arquivo não importa nenhum cliente de banco de dados.
//
// A estrutura segue exatamente os contratos reais usados pelas suítes de
// teste do MIE (ver fixtures.ts), apenas substituindo os valores fixos por
// dados sintéticos derivados do cenário e da conversa simulada.
// ============================================================================

import type {
  CommercialConfigBundle,
} from '@/app/types/commercial-config'

import {
  MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
  type MessageIntelligenceCanonicalContextV1,
  type MessageIntelligenceContextSourcesV1,
  type MessageIntelligenceRequestV1,
} from '../contracts'

import type {
  SimulatorMessage,
} from './conversation-engine'

import type {
  SimulatorScenarioDefinition,
} from './scenarios'

export const SIMULATOR_SOURCE_IDS = {
  company_id:
    '11111111-0000-4000-8000-000000000001',
  lead_id:
    '11111111-0000-4000-8000-000000000002',
  cycle_id:
    '11111111-0000-4000-8000-000000000003',
  seller_user_id:
    '11111111-0000-4000-8000-000000000004',
  config_version_id:
    '11111111-0000-4000-8000-000000000005',
  product_id:
    '11111111-0000-4000-8000-000000000006',
  product_profile_id:
    '11111111-0000-4000-8000-000000000007',
  fact_id:
    '11111111-0000-4000-8000-000000000008',
  objection_guide_id:
    '11111111-0000-4000-8000-000000000009',
  state_record_id:
    '11111111-0000-4000-8000-000000000010',
} as const

function conversationKeyForScenario(
  scenario: SimulatorScenarioDefinition,
): string {
  return `mie-simulator:${scenario.key}`
}

function methodDefinition() {
  return {
    contract_version:
      'commercial-method-v2' as const,
    name:
      'Método comercial de referência',
    description:
      'Método consultivo genérico usado apenas para o simulador técnico.',
    principles: [
      'Entender a necessidade antes de argumentar preço.',
    ],
    stages: [
      {
        key: 'diagnostico',
        display_order: 1,
        name: 'Diagnóstico',
        objective: 'Entender a necessidade comercial do cliente.',
        requirement: 'required' as const,
        completion_criteria: [
          'Necessidade compreendida.',
        ],
        partial_completion_criteria: [
          'Existe contexto inicial sobre a necessidade.',
        ],
        skip_conditions: [],
        recommended_questions: [
          'O que motivou vocês a buscar essa solução agora?',
        ],
        common_mistakes: [
          'Apresentar preço antes de entender a necessidade.',
        ],
        deepen_when: [
          'A necessidade ainda estiver genérica.',
        ],
        sufficient_when: [
          'A necessidade estiver clara.',
        ],
        advance_when: [
          'Existe informação suficiente para avançar.',
        ],
        wait_when: [
          'O cliente pediu tempo.',
        ],
        stop_asking_when: [
          'A resposta já está clara.',
        ],
        dimensions: [
          {
            key: 'need',
            name: 'Necessidade',
            objective: 'Compreender a necessidade comercial.',
            evidence_criteria: [
              'O cliente descreveu o que precisa resolver.',
            ],
          },
        ],
      },
    ],
  }
}

function productDefinition() {
  return {
    contract_version:
      'commercial-product-v2' as const,
    product_kind:
      'simple' as const,
    name:
      'Plataforma comercial B2B',
    category:
      'Software',
    commercial_description:
      'Software de gestão comercial por assinatura mensal, usado por ' +
      'pequenas e médias empresas para organizar o processo de vendas.',
    indicated_audiences: [
      'Times comerciais de pequenas e médias empresas',
    ],
    needs_addressed: [
      'Organização do processo comercial',
    ],
    benefits: [
      'Acompanhamento estruturado do funil de vendas',
    ],
    verified_differentiators: [
      'Configuração adaptável ao método comercial da empresa',
    ],
    limitations: [
      'Depende da configuração comercial publicada pela empresa.',
    ],
    recommend_when: [
      'Existe necessidade de estruturar o processo comercial.',
    ],
    avoid_when: [
      'A necessidade não é comercial.',
    ],
    pricing: {
      model: 'recurring' as const,
      amount: 490,
      currency: 'BRL' as const,
      amount_qualifier: 'exact' as const,
      recurrence: 'monthly' as const,
      installment_count: null,
      installment_amount_basis: null,
      note: null,
    },
    contract_conditions: [
      'Contrato mensal, sem fidelidade mínima.',
    ],
    payment_conditions: [
      'Cobrança recorrente mensal.',
    ],
    allowed_claims: [
      'Suporte incluso durante a assinatura.',
    ],
    forbidden_claims: [
      'Resultado comercial garantido.',
    ],
  }
}

function factDefinition() {
  return {
    contract_version:
      'commercial-fact-v2' as const,
    fact_kind: 'official' as const,
    category: 'operation',
    fact_key: 'support_hours',
    fact_value: 'Suporte em horário comercial, de segunda a sexta.',
    scope: {
      type: 'company' as const,
      product_id: null,
      variant_key: null,
      reference_key: null,
    },
    conditions: [],
    limitations: [],
    validity: {
      mode: 'ongoing' as const,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: null,
    },
    source: {
      type: 'internal_policy' as const,
      reference: 'Configuração publicada do simulador.',
      verified_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

function objectionDefinition() {
  return {
    contract_version:
      'commercial-objection-v2' as const,
    objection_kind: 'commercial_objection' as const,
    objection_key: 'price_value',
    objection: 'Preço percebido como alto',
    category: 'price' as const,
    description: 'O preço é apresentado como barreira real para avançar.',
    scope: {
      type: 'company' as const,
      product_id: null,
      variant_key: null,
    },
    signals: [
      'Está caro.',
    ],
    objection_when: [
      'O preço bloqueia o avanço da negociação.',
    ],
    not_objection_when: [
      'O cliente apenas pergunta o valor.',
    ],
    distinguish_from: [
      'question' as const,
      'information_request' as const,
    ],
    discovery_questions: [
      'O que pesou nessa percepção de valor?',
    ],
    recommended_approach:
      'Entender a origem da percepção antes de argumentar.',
    response_limits: [
      'Não oferecer desconto sem autorização.',
    ],
    resolution_criteria: [
      'A origem da resistência ficou clara.',
    ],
    wait_when: [
      'O cliente pediu tempo.',
    ],
    give_space_when: [
      'Insistir não acrescentaria informação nova.',
    ],
    stop_when: [
      'O cliente recusou continuidade.',
    ],
  }
}

function buildCommercialConfig(): CommercialConfigBundle {
  const ids = SIMULATOR_SOURCE_IDS

  return {
    version: {
      id: ids.config_version_id,
      company_id: ids.company_id,
      version_number: 1,
      contract_version: 'phase-2-v1',
      status: 'published',
      business_description:
        'Empresa fictícia usada apenas pelo simulador técnico do MIE V1.',
      target_audience: 'Pequenas e médias empresas B2B.',
      value_proposition: 'Organizar a execução comercial do time de vendas.',
      commercial_method_name: 'Método comercial de referência',
      commercial_method_description: 'Método consultivo genérico.',
      commercial_method_contract_version: 'commercial-method-v2',
      commercial_method_definition: methodDefinition(),
      communication_tone: 'Direto e claro.',
      required_behaviors: [
        'Responder objetivamente ao que o cliente disse.',
      ],
      prohibited_behaviors: [
        'Inventar condição comercial não publicada.',
      ],
      created_by: ids.seller_user_id,
      published_by: ids.seller_user_id,
      archived_by: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      published_at: '2026-01-01T00:00:00.000Z',
      archived_at: null,
    },
    method_steps: [],
    product_profiles: [
      {
        id: ids.product_profile_id,
        company_id: ids.company_id,
        config_version_id: ids.config_version_id,
        product_id: ids.product_id,
        commercial_product_contract_version: 'commercial-product-v2',
        commercial_product_definition: productDefinition(),
        indicated_audiences: [
          'Times comerciais de pequenas e médias empresas',
        ],
        needs_addressed: [
          'Organização do processo comercial',
        ],
        benefits: [
          'Acompanhamento estruturado do funil de vendas',
        ],
        verified_differentiators: [
          'Configuração adaptável ao método comercial da empresa',
        ],
        limitations: [
          'Depende da configuração comercial publicada pela empresa.',
        ],
        contract_conditions: [
          'Contrato mensal, sem fidelidade mínima.',
        ],
        payment_conditions: [
          'Cobrança recorrente mensal.',
        ],
        allowed_claims: [
          'Suporte incluso durante a assinatura.',
        ],
        forbidden_claims: [
          'Resultado comercial garantido.',
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    facts: [
      {
        id: ids.fact_id,
        company_id: ids.company_id,
        config_version_id: ids.config_version_id,
        commercial_fact_contract_version: 'commercial-fact-v2',
        commercial_fact_definition: factDefinition(),
        category: 'operation',
        fact_key: 'support_hours',
        fact_value: 'Suporte em horário comercial, de segunda a sexta.',
        source_note: 'Configuração publicada do simulador.',
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    objection_guides: [
      {
        id: ids.objection_guide_id,
        company_id: ids.company_id,
        config_version_id: ids.config_version_id,
        commercial_objection_contract_version: 'commercial-objection-v2',
        commercial_objection_definition: objectionDefinition(),
        sort_order: 1,
        objection: 'Preço percebido como alto',
        signals: [
          'Está caro.',
        ],
        discovery_questions: [
          'O que pesou nessa percepção de valor?',
        ],
        recommended_approach:
          'Entender a origem da percepção antes de argumentar.',
        response_limits: [
          'Não oferecer desconto sem autorização.',
        ],
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  }
}

export function buildSimulatorRequest({
  scenario,
  seller_intent,
  reference_time,
  request_id,
}: {
  scenario: SimulatorScenarioDefinition
  seller_intent: string
  reference_time: string
  request_id: string
}): MessageIntelligenceRequestV1 {
  const ids = SIMULATOR_SOURCE_IDS

  return {
    contract_version:
      MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
    request_id,
    company_id: ids.company_id,
    seller_user_id: ids.seller_user_id,
    cycle_id: ids.cycle_id,
    conversation_key: conversationKeyForScenario(scenario),
    seller_intent,
    reference_time,
  }
}

export function buildSimulatorSources({
  scenario,
  conversation,
  reference_time,
}: {
  scenario: SimulatorScenarioDefinition
  conversation: readonly SimulatorMessage[]
  reference_time: string
}): MessageIntelligenceContextSourcesV1 {
  const ids = SIMULATOR_SOURCE_IDS
  const conversationKey = conversationKeyForScenario(scenario)
  const config = buildCommercialConfig()

  const messageIds = conversation.map(message => message.id)

  const diagnosticMessages = conversation.map((message, index) => ({
    id: message.id,
    message_key: `sim-${message.id}`,
    version: 1,
    sequence: index + 1,
    direction:
      message.direction === 'inbound'
        ? ('incoming' as const)
        : ('outgoing' as const),
    occurred_at: message.occurred_at,
    observed_at: message.occurred_at,
    content_type: 'text' as const,
    text_content: message.text,
    audio_transcription: null,
  }))

  const state = {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: ids.cycle_id,
    version: 1,
    commercial_role: 'buyer',
    current_moment: {
      summary: `Simulação do cenário "${scenario.label}".`,
      evidence_message_ids: messageIds.slice(-1),
    },
    current_priority: {
      summary: scenario.short_description,
      evidence_message_ids: messageIds.slice(-1),
    },
    last_analyzed_message_ids: messageIds,
    last_evidence_message_ids: messageIds.slice(-1),
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: reference_time,
    updated_at: reference_time,
  }

  const diagnosticInput = {
    input_version: 'phase-5-input-v1',
    diagnostic_contract_version: 'phase-1-v1',
    company_id: ids.company_id,
    cycle_id: ids.cycle_id,
    conversation_key: conversationKey,
    current_crm_status: 'respondeu',
    reference_time,
    analysis_precondition: {
      status: 'ready',
      limitations: [],
    },
    conversation: {
      active_message_ids: messageIds,
      excluded_message_ids: [],
      messages: diagnosticMessages,
      excluded_messages: [],
    },
    commercial_context: {
      configured: true,
      config_version_id: ids.config_version_id,
      config_version_number: 1,
      config_contract_version: 'phase-2-v1',
      business_description:
        'Empresa fictícia usada apenas pelo simulador técnico do MIE V1.',
      target_audience: 'Pequenas e médias empresas B2B.',
      value_proposition: 'Organizar a execução comercial do time de vendas.',
      communication_tone: 'Direto e claro.',
      required_behaviors: [
        'Responder objetivamente ao que o cliente disse.',
      ],
      prohibited_behaviors: [
        'Inventar condição comercial não publicada.',
      ],
      sales_method: {
        configured: true,
        contract_version: 'commercial-method-v2',
        name: 'Método comercial de referência',
        description: 'Método consultivo genérico.',
        principles: [
          'Entender a necessidade antes de argumentar preço.',
        ],
        definition: methodDefinition(),
        steps: [],
      },
      products: [],
      facts: [],
      objection_guides: [],
    },
  }

  const realContext = {
    loaded_at: reference_time,
    scope: {
      company: {
        id: ids.company_id,
        name: 'Empresa Simulador MIE',
        platform_status: 'active',
        onboarding_status: 'active',
      },
      lead: {
        id: ids.lead_id,
        company_id: ids.company_id,
        name: 'Cliente sintético',
        phone: null,
        email: null,
        updated_at: reference_time,
      },
      cycle: {
        id: ids.cycle_id,
        company_id: ids.company_id,
        lead_id: ids.lead_id,
        owner_user_id: ids.seller_user_id,
        status: 'respondeu',
        next_action: null,
        next_action_date: null,
        updated_at: reference_time,
      },
      conversation_key: conversationKey,
    },
    commercial_config_status: 'published',
    commercial_config: config,
    products: [
      {
        id: ids.product_id,
        company_id: ids.company_id,
        name: 'Plataforma comercial B2B',
        category: 'Software',
        base_price: 490,
        active: true,
      },
    ],
    diagnostic_input: diagnosticInput,
    known_message_ids: messageIds,
    active_message_ids: messageIds,
    state_read: {
      mode: 'found',
      found: true,
      company_id: ids.company_id,
      cycle_id: ids.cycle_id,
      conversation_key: conversationKey,
      state_record_id: ids.state_record_id,
      state_version: 1,
      state_updated_at: reference_time,
      persisted_at: reference_time,
      state,
    },
    durable_memory_seed: null,
  } as MessageIntelligenceCanonicalContextV1

  return {
    real_context: realContext,
    commercial_reading: null,
  }
}
