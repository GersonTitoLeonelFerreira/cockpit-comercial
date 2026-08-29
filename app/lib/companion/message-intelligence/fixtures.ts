import type {
  CommercialConfigBundle,
} from '@/app/types/commercial-config'

import {
  MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
  type MessageIntelligenceCanonicalContextV1,
  type MessageIntelligenceContextSourcesV1,
  type MessageIntelligenceRequestV1,
} from './contracts'

export const MESSAGE_INTELLIGENCE_FIXTURE_IDS = {
  company_id:
    '10000000-0000-4000-8000-000000000001',
  lead_id:
    '20000000-0000-4000-8000-000000000001',
  cycle_id:
    '30000000-0000-4000-8000-000000000001',
  previous_cycle_id:
    '30000000-0000-4000-8000-000000000002',
  seller_user_id:
    '40000000-0000-4000-8000-000000000001',
  config_version_id:
    '50000000-0000-4000-8000-000000000001',
  product_id:
    '60000000-0000-4000-8000-000000000001',
  product_profile_id:
    '70000000-0000-4000-8000-000000000001',
  fact_id:
    '80000000-0000-4000-8000-000000000001',
  objection_guide_id:
    '90000000-0000-4000-8000-000000000001',
  state_record_id:
    'a0000000-0000-4000-8000-000000000001',
} as const

const referenceTime =
  '2026-08-29T22:00:00.000Z'

const conversationKey =
  'whatsapp:+5547999990001'

function methodDefinition() {
  return {
    contract_version:
      'commercial-method-v2' as const,
    name:
      'Método Teste',
    description:
      'Método consultivo publicado.',
    principles: [
      'Responder fatos antes de avançar.',
    ],
    stages: [
      {
        key:
          'diagnostico',
        display_order:
          1,
        name:
          'Diagnóstico',
        objective:
          'Entender a necessidade.',
        requirement:
          'required' as const,
        completion_criteria: [
          'Necessidade compreendida.',
        ],
        partial_completion_criteria: [
          'Existe contexto inicial.',
        ],
        skip_conditions: [],
        recommended_questions: [
          'O que você precisa resolver?',
        ],
        common_mistakes: [
          'Apresentar cedo demais.',
        ],
        deepen_when: [
          'A necessidade ainda estiver genérica.',
        ],
        sufficient_when: [
          'A necessidade estiver clara.',
        ],
        advance_when: [
          'Existe informação suficiente.',
        ],
        wait_when: [
          'O cliente pediu tempo.',
        ],
        stop_asking_when: [
          'A resposta já está clara.',
        ],
        dimensions: [
          {
            key:
              'need',
            name:
              'Necessidade',
            objective:
              'Compreender a necessidade.',
            evidence_criteria: [
              'O cliente descreveu o que precisa.',
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
      'Plano Exemplo',
    category:
      'Serviço',
    commercial_description:
      'Serviço recorrente.',
    indicated_audiences: [
      'Empresas comerciais',
    ],
    needs_addressed: [
      'Organização comercial',
    ],
    benefits: [
      'Acompanhamento estruturado',
    ],
    verified_differentiators: [
      'Método configurável',
    ],
    limitations: [
      'Depende da configuração publicada.',
    ],
    recommend_when: [
      'Existe necessidade de processo comercial.',
    ],
    avoid_when: [
      'A necessidade não é comercial.',
    ],
    pricing: {
      model:
        'recurring' as const,
      amount:
        199.9,
      currency:
        'BRL' as const,
      amount_qualifier:
        'exact' as const,
      recurrence:
        'monthly' as const,
      installment_count:
        null,
      installment_amount_basis:
        null,
      note:
        null,
    },
    contract_conditions: [
      'Contrato mensal.',
    ],
    payment_conditions: [
      'Pagamento recorrente.',
    ],
    allowed_claims: [
      'Suporte incluído.',
    ],
    forbidden_claims: [
      'Resultado garantido.',
    ],
  }
}

function factDefinition(
  factValue =
    'Atendimento em horário comercial.',
) {
  return {
    contract_version:
      'commercial-fact-v2' as const,
    fact_kind:
      'official' as const,
    category:
      'operation',
    fact_key:
      'support_hours',
    fact_value:
      factValue,
    scope: {
      type:
        'company' as const,
      product_id:
        null,
      variant_key:
        null,
      reference_key:
        null,
    },
    conditions: [],
    limitations: [],
    validity: {
      mode:
        'ongoing' as const,
      valid_from:
        '2026-08-01T00:00:00.000Z',
      valid_until:
        null,
    },
    source: {
      type:
        'internal_policy' as const,
      reference:
        'Configuração publicada.',
      verified_at:
        '2026-08-29T18:00:00.000Z',
    },
  }
}

function objectionDefinition() {
  return {
    contract_version:
      'commercial-objection-v2' as const,
    objection_kind:
      'commercial_objection' as const,
    objection_key:
      'price_value',
    objection:
      'Preço percebido como alto',
    category:
      'price' as const,
    description:
      'O preço é apresentado como barreira real.',
    scope: {
      type:
        'company' as const,
      product_id:
        null,
      variant_key:
        null,
    },
    signals: [
      'Está caro.',
    ],
    objection_when: [
      'O preço bloqueia o avanço.',
    ],
    not_objection_when: [
      'O cliente apenas pergunta o preço.',
    ],
    distinguish_from: [
      'question' as const,
      'information_request' as const,
    ],
    discovery_questions: [
      'O que pesou nessa percepção?',
    ],
    recommended_approach:
      'Entender a origem antes de argumentar.',
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
      'Insistir não acrescentaria informação.',
    ],
    stop_when: [
      'O cliente recusou continuidade.',
    ],
  }
}

export function buildCommercialConfigFixture():
  CommercialConfigBundle {
  const ids =
    MESSAGE_INTELLIGENCE_FIXTURE_IDS

  return {
    version: {
      id:
        ids.config_version_id,
      company_id:
        ids.company_id,
      version_number:
        7,
      contract_version:
        'phase-2-v1',
      status:
        'published',
      business_description:
        'Empresa de exemplo.',
      target_audience:
        'Times comerciais.',
      value_proposition:
        'Organizar a execução comercial.',
      commercial_method_name:
        'Método Teste',
      commercial_method_description:
        'Método consultivo.',
      commercial_method_contract_version:
        'commercial-method-v2',
      commercial_method_definition:
        methodDefinition(),
      communication_tone:
        'Direto e claro.',
      required_behaviors: [
        'Responder objetivamente.',
      ],
      prohibited_behaviors: [
        'Inventar condição comercial.',
      ],
      created_by:
        ids.seller_user_id,
      published_by:
        ids.seller_user_id,
      archived_by:
        null,
      created_at:
        '2026-08-20T10:00:00.000Z',
      updated_at:
        '2026-08-29T18:00:00.000Z',
      published_at:
        '2026-08-29T18:00:00.000Z',
      archived_at:
        null,
    },
    method_steps: [],
    product_profiles: [
      {
        id:
          ids.product_profile_id,
        company_id:
          ids.company_id,
        config_version_id:
          ids.config_version_id,
        product_id:
          ids.product_id,
        commercial_product_contract_version:
          'commercial-product-v2',
        commercial_product_definition:
          productDefinition(),
        indicated_audiences: [
          'Empresas comerciais',
        ],
        needs_addressed: [
          'Organização comercial',
        ],
        benefits: [
          'Acompanhamento estruturado',
        ],
        verified_differentiators: [
          'Método configurável',
        ],
        limitations: [
          'Depende da configuração publicada.',
        ],
        contract_conditions: [
          'Contrato mensal.',
        ],
        payment_conditions: [
          'Pagamento recorrente.',
        ],
        allowed_claims: [
          'Suporte incluído.',
        ],
        forbidden_claims: [
          'Resultado garantido.',
        ],
        created_at:
          '2026-08-20T10:00:00.000Z',
        updated_at:
          '2026-08-29T18:00:00.000Z',
      },
    ],
    facts: [
      {
        id:
          ids.fact_id,
        company_id:
          ids.company_id,
        config_version_id:
          ids.config_version_id,
        commercial_fact_contract_version:
          'commercial-fact-v2',
        commercial_fact_definition:
          factDefinition(),
        category:
          'operation',
        fact_key:
          'support_hours',
        fact_value:
          'Atendimento em horário comercial.',
        source_note:
          'Configuração publicada.',
        is_active:
          true,
        created_at:
          '2026-08-20T10:00:00.000Z',
        updated_at:
          '2026-08-29T18:00:00.000Z',
      },
    ],
    objection_guides: [
      {
        id:
          ids.objection_guide_id,
        company_id:
          ids.company_id,
        config_version_id:
          ids.config_version_id,
        commercial_objection_contract_version:
          'commercial-objection-v2',
        commercial_objection_definition:
          objectionDefinition(),
        sort_order:
          1,
        objection:
          'Preço percebido como alto',
        signals: [
          'Está caro.',
        ],
        discovery_questions: [
          'O que pesou nessa percepção?',
        ],
        recommended_approach:
          'Entender a origem antes de argumentar.',
        response_limits: [
          'Não oferecer desconto sem autorização.',
        ],
        is_active:
          true,
        created_at:
          '2026-08-20T10:00:00.000Z',
        updated_at:
          '2026-08-29T18:00:00.000Z',
      },
    ],
  }
}

export function buildMessageIntelligenceRequestFixture():
  MessageIntelligenceRequestV1 {
  const ids =
    MESSAGE_INTELLIGENCE_FIXTURE_IDS

  return {
    contract_version:
      MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
    request_id:
      'request-fixture-1',
    company_id:
      ids.company_id,
    seller_user_id:
      ids.seller_user_id,
    cycle_id:
      ids.cycle_id,
    conversation_key:
      conversationKey,
    seller_intent:
      'Quero entender a dúvida antes de responder.',
    reference_time:
      referenceTime,
  }
}

export function buildMessageIntelligenceSourcesFixture():
  MessageIntelligenceContextSourcesV1 {
  const ids =
    MESSAGE_INTELLIGENCE_FIXTURE_IDS

  const config =
    buildCommercialConfigFixture()

  const state = {
    contract_version:
      'phase-5.1-commercial-state-v1',
    cycle_id:
      ids.cycle_id,
    version:
      3,
    commercial_role:
      'buyer',
    current_moment: {
      summary:
        'Cliente fez uma pergunta.',
      evidence_message_ids: [
        '2',
      ],
    },
    current_priority: {
      summary:
        'Responder a dúvida atual.',
      evidence_message_ids: [
        '2',
      ],
    },
    last_analyzed_message_ids: [
      '1',
      '2',
    ],
    last_evidence_message_ids: [
      '2',
    ],
    facts: [
      {
        id:
          'mem-objective',
        kind:
          'client.objective',
        value:
          null,
        summary:
          'Organizar o processo comercial.',
        confidence:
          'high',
        evidence_message_ids: [
          '1',
        ],
        memory_status:
          'active',
        created_in_state_version:
          1,
        updated_in_state_version:
          2,
        closed_in_state_version:
          null,
      },
      {
        id:
          'mem-communication',
        kind:
          'client.communication.pattern',
        value:
          'direct_questions',
        summary:
          'O cliente costuma fazer perguntas diretas.',
        confidence:
          'high',
        evidence_message_ids: [
          '1',
          '2',
        ],
        memory_status:
          'active',
        created_in_state_version:
          2,
        updated_in_state_version:
          3,
        closed_in_state_version:
          null,
      },
    ],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at:
      '2026-08-29T20:00:00.000Z',
    updated_at:
      '2026-08-29T21:55:00.000Z',
  }

  const diagnosticInput = {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-1-v1',
    company_id:
      ids.company_id,
    cycle_id:
      ids.cycle_id,
    conversation_key:
      conversationKey,
    current_crm_status:
      'respondeu',
    reference_time:
      referenceTime,
    analysis_precondition: {
      status:
        'ready',
      limitations: [],
    },
    conversation: {
      active_message_ids: [
        '1',
        '2',
      ],
      excluded_message_ids: [
        '3',
      ],
      messages: [
        {
          id:
            '1',
          message_key:
            'm1',
          version:
            1,
          sequence:
            1,
          direction:
            'outgoing',
          occurred_at:
            '2026-08-29T21:50:00.000Z',
          observed_at:
            '2026-08-29T21:50:01.000Z',
          content_type:
            'text',
          text_content:
            'Como posso ajudar?',
          audio_transcription:
            null,
        },
        {
          id:
            '2',
          message_key:
            'm2',
          version:
            1,
          sequence:
            2,
          direction:
            'incoming',
          occurred_at:
            '2026-08-29T21:55:00.000Z',
          observed_at:
            '2026-08-29T21:55:01.000Z',
          content_type:
            'text',
          text_content:
            'Qual é a condição?',
          audio_transcription:
            null,
        },
      ],
      excluded_messages: [
        {
          id:
            '3',
          message_key:
            'm3',
          version:
            2,
          reason:
            'deleted',
          deletion_reason:
            'explicit_deletion',
        },
      ],
    },
    commercial_context: {
      configured:
        true,
      config_version_id:
        ids.config_version_id,
      config_version_number:
        7,
      config_contract_version:
        'phase-2-v1',
      business_description:
        'Empresa de exemplo.',
      target_audience:
        'Times comerciais.',
      value_proposition:
        'Organizar a execução comercial.',
      communication_tone:
        'Direto e claro.',
      required_behaviors: [
        'Responder objetivamente.',
      ],
      prohibited_behaviors: [
        'Inventar condição comercial.',
      ],
      sales_method: {
        configured:
          true,
        contract_version:
          'commercial-method-v2',
        name:
          'Método Teste',
        description:
          'Método consultivo.',
        principles: [
          'Responder fatos antes de avançar.',
        ],
        definition:
          methodDefinition(),
        steps: [],
      },
      products: [],
      facts: [],
      objection_guides: [],
    },
  }

  const realContext = {
    loaded_at:
      referenceTime,
    scope: {
      company: {
        id:
          ids.company_id,
        name:
          'Empresa Fixture',
        platform_status:
          'active',
        onboarding_status:
          'active',
      },
      lead: {
        id:
          ids.lead_id,
        company_id:
          ids.company_id,
        name:
          'Cliente Fixture',
        phone:
          '+5547999990001',
        email:
          null,
        updated_at:
          '2026-08-29T21:55:00.000Z',
      },
      cycle: {
        id:
          ids.cycle_id,
        company_id:
          ids.company_id,
        lead_id:
          ids.lead_id,
        owner_user_id:
          ids.seller_user_id,
        status:
          'respondeu',
        next_action:
          null,
        next_action_date:
          null,
        updated_at:
          '2026-08-29T21:55:00.000Z',
      },
      conversation_key:
        conversationKey,
    },
    commercial_config_status:
      'published',
    commercial_config:
      config,
    products: [
      {
        id:
          ids.product_id,
        company_id:
          ids.company_id,
        name:
          'Plano Exemplo',
        category:
          'Serviço',
        base_price:
          199.9,
        active:
          true,
      },
    ],
    diagnostic_input:
      diagnosticInput,
    known_message_ids: [
      '1',
      '2',
      '3',
    ],
    active_message_ids: [
      '1',
      '2',
    ],
    state_read: {
      mode:
        'found',
      found:
        true,
      company_id:
        ids.company_id,
      cycle_id:
        ids.cycle_id,
      conversation_key:
        conversationKey,
      state_record_id:
        ids.state_record_id,
      state_version:
        3,
      state_updated_at:
        '2026-08-29T21:55:00.000Z',
      persisted_at:
        '2026-08-29T21:56:00.000Z',
      state,
    },
    durable_memory_seed:
      null,
  } as MessageIntelligenceCanonicalContextV1

  return {
    real_context:
      realContext,
    commercial_reading:
      null,
  }
}

export function buildConflictingFactFixture() {
  const ids =
    MESSAGE_INTELLIGENCE_FIXTURE_IDS

  return {
    id:
      '80000000-0000-4000-8000-000000000002',
    company_id:
      ids.company_id,
    config_version_id:
      ids.config_version_id,
    commercial_fact_contract_version:
      'commercial-fact-v2' as const,
    commercial_fact_definition:
      factDefinition(
        'Atendimento 24 horas.',
      ),
    category:
      'operation',
    fact_key:
      'support_hours',
    fact_value:
      'Atendimento 24 horas.',
    source_note:
      'Outra fonte publicada.',
    is_active:
      true,
    created_at:
      '2026-08-29T18:00:00.000Z',
    updated_at:
      '2026-08-29T19:00:00.000Z',
  }
}