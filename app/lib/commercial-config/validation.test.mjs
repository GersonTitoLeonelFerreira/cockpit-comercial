import assert from 'node:assert/strict'
import test from 'node:test'

import { validateCommercialConfigForPublish } from './validation.ts'

function buildValidMethodDefinition() {
  return {
    contract_version: 'commercial-method-v2',

    name: 'Método de teste',

    description:
      'Definição estruturada usada apenas como fixture de teste, nunca como conteúdo publicado por padrão.',

    principles: [
      'Perguntar somente quando a resposta puder alterar a decisão comercial.',
    ],

    stages: [
      {
        key: 'etapa_um',
        display_order: 1,
        name: 'Etapa um',
        objective: 'Compreender a intenção imediata do cliente.',
        requirement: 'required',
        completion_criteria: [
          'A intenção imediata foi compreendida.',
        ],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [
          'Existe informação suficiente para decidir o próximo passo.',
        ],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [
          'Uma nova pergunta não alteraria a decisão comercial.',
        ],
        dimensions: [],
      },
    ],
  }
}

function buildBaseVersion(overrides = {}) {
  return {
    id: 'version-1',
    company_id: 'company-1',
    version_number: 1,
    contract_version: 'phase-2-v1',
    status: 'draft',

    business_description: 'Descrição válida da empresa.',
    target_audience: 'Público-alvo válido.',
    value_proposition: 'Proposta de valor válida.',

    commercial_method_name: 'Método comercial',
    commercial_method_description:
      'Descrição válida do método comercial.',

    commercial_method_contract_version:
      'commercial-method-v1',
    commercial_method_definition: null,

    communication_tone: 'Tom de comunicação válido.',

    required_behaviors: ['Comportamento obrigatório.'],
    prohibited_behaviors: ['Comportamento proibido.'],

    created_by: 'user-1',
    published_by: null,
    archived_by: null,

    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    published_at: null,
    archived_at: null,

    ...overrides,
  }
}

function buildValidLegacyStep(overrides = {}) {
  return {
    id: 'step-1',
    company_id: 'company-1',
    config_version_id: 'version-1',
    step_order: 1,
    name: 'Etapa legada',
    objective: 'Objetivo válido.',
    completion_criteria: ['Critério válido.'],
    recommended_questions: [],
    is_required: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildBundle({
  version,
  methodSteps = [],
} = {}) {
  return {
    version,
    method_steps: methodSteps,
    product_profiles: [],
    facts: [],
    objection_guides: [],
  }
}

test(
  'v1 continua funcionando: exige etapas legadas quando o método não está no modo estruturado',
  () => {
    const version = buildBaseVersion()
    const bundle = buildBundle({ version, methodSteps: [] })

    const result = validateCommercialConfigForPublish(
      bundle,
      [],
    )

    assert.equal(result.valid, false)

    assert.equal(
      result.issues.some(
        (issue) => issue.field === 'method_steps',
      ),
      true,
    )
  },
)

test(
  'v1 continua funcionando: etapa legada completa não gera pendência de método',
  () => {
    const version = buildBaseVersion()

    const bundle = buildBundle({
      version,
      methodSteps: [buildValidLegacyStep()],
    })

    const result = validateCommercialConfigForPublish(
      bundle,
      [],
    )

    assert.equal(
      result.issues.some(
        (issue) => issue.section === 'commercial_method',
      ),
      false,
    )
  },
)

test(
  'legacy não substitui método declarado: contrato v2 ignora a lista legada de etapas',
  () => {
    const version = buildBaseVersion({
      commercial_method_contract_version:
        'commercial-method-v2',
      commercial_method_definition:
        buildValidMethodDefinition(),
    })

    // Etapas legadas vazias/incompletas não devem gerar pendência
    // quando o método publicado já está no modo estruturado (V2).
    const bundle = buildBundle({ version, methodSteps: [] })

    const result = validateCommercialConfigForPublish(
      bundle,
      [],
    )

    assert.equal(
      result.issues.some(
        (issue) => issue.field === 'method_steps',
      ),
      false,
    )
  },
)

test(
  'v2 tem prioridade: definição estruturada válida não bloqueia a publicação',
  () => {
    const version = buildBaseVersion({
      commercial_method_contract_version:
        'commercial-method-v2',
      commercial_method_definition:
        buildValidMethodDefinition(),
    })

    const bundle = buildBundle({ version })

    const result = validateCommercialConfigForPublish(
      bundle,
      [],
    )

    assert.equal(result.valid, true, JSON.stringify(result.issues))
  },
)

test(
  'método incompleto não inventa significado: contrato v2 sem definição é bloqueado explicitamente',
  () => {
    const version = buildBaseVersion({
      commercial_method_contract_version:
        'commercial-method-v2',
      commercial_method_definition: null,
    })

    const bundle = buildBundle({ version })

    const result = validateCommercialConfigForPublish(
      bundle,
      [],
    )

    assert.equal(result.valid, false)

    assert.equal(
      result.issues.some(
        (issue) =>
          issue.field === 'commercial_method_definition',
      ),
      true,
    )
  },
)

test(
  'definição estruturada incompleta é rejeitada com o motivo semântico exato',
  () => {
    const definition = buildValidMethodDefinition()
    definition.stages[0].sufficient_when = []

    const version = buildBaseVersion({
      commercial_method_contract_version:
        'commercial-method-v2',
      commercial_method_definition: definition,
    })

    const bundle = buildBundle({ version })

    const result = validateCommercialConfigForPublish(
      bundle,
      [],
    )

    assert.equal(result.valid, false)

    assert.equal(
      result.issues.some((issue) =>
        issue.field.includes('sufficient_when'),
      ),
      true,
    )
  },
)

test(
  'etapa obrigatória com condição de pular é rejeitada mesmo dentro do fluxo de publicação',
  () => {
    const definition = buildValidMethodDefinition()
    definition.stages[0].skip_conditions = [
      'Pular sempre.',
    ]

    const version = buildBaseVersion({
      commercial_method_contract_version:
        'commercial-method-v2',
      commercial_method_definition: definition,
    })

    const bundle = buildBundle({ version })

    const result = validateCommercialConfigForPublish(
      bundle,
      [],
    )

    assert.equal(result.valid, false)
  },
)
