import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL(
      '../../../scripts/typescript-test-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

const {
  composeLeadMethodGuidance,
  normalizePublishedCommercialMethod,
} = await import('./lead-method-guidance.ts')

function buildStage(overrides = {}) {
  return {
    key: 'acolher',
    display_order: 1,
    name: 'Acolher',
    objective: 'Criar abertura e compreender o contexto inicial.',
    requirement: 'required',
    completion_criteria: ['Contexto inicial compreendido'],
    partial_completion_criteria: [],
    skip_conditions: [],
    recommended_questions: ['O que trouxe você até aqui?'],
    common_mistakes: ['Pressionar cedo demais'],
    deepen_when: ['A intenção ainda estiver vaga'],
    sufficient_when: ['O motivo do contato estiver claro'],
    advance_when: ['Existe contexto para aprofundar'],
    wait_when: [],
    stop_asking_when: ['A motivação já estiver clara'],
    dimensions: [],
    ...overrides,
  }
}

function buildMethodDefinition(overrides = {}) {
  return {
    contract_version: 'commercial-method-v2',
    name: 'Metodo ATO',
    description: 'Acolher, compreender no Tour e Obter o desfecho adequado.',
    principles: ['Não transformar descoberta em interrogatório.'],
    stages: [
      buildStage(),
      buildStage({
        key: 'tour',
        display_order: 2,
        name: 'Tour',
        objective: 'Compreender a necessidade relevante.',
      }),
      buildStage({
        key: 'obter',
        display_order: 3,
        name: 'Obter',
        objective: 'Conduzir ao desfecho comercial adequado.',
      }),
    ],
    ...overrides,
  }
}

// commercial_method_name/commercial_method_description são colunas legadas
// mantidas por histórico e propositalmente divergem da definição V2: o
// Companion não pode mais lê-las como fonte de método operacional.
const publishedMethod = {
  id: 'ef09c47e-83c5-401d-867c-bdf1f909e838',
  version_number: 1,
  commercial_method_name: 'Metodo legado (não deve ser usado)',
  commercial_method_description:
    'Metodo ato são 3 passos:\nAcolher\nTour\nObter (texto legado, não deve ser parseado)',
  commercial_method_contract_version: 'commercial-method-v2',
  commercial_method_definition: buildMethodDefinition(),
  business_description: 'A Yolen organiza a execução comercial de equipes de vendas.',
  target_audience: 'Empresas com equipes comerciais.',
  value_proposition: 'Reduzir perdas e orientar o próximo movimento comercial.',
  communication_tone: 'Direta, consultiva, clara e humana.',
  required_behaviors: [
    'Considerar as informações que já foram descobertas durante o atendimento',
    'Indicar uma próxima ação concreta para o vendedor',
  ],
  prohibited_behaviors: [
    'Inventar preços, descontos ou condições',
  ],
}

function activeMethod(rawConfigRow) {
  const result = normalizePublishedCommercialMethod(rawConfigRow)
  assert.equal(result.status, 'active')
  return result.method
}

test('sem contract_version=commercial-method-v2 publicado, método não fica ativo (v1/legado nunca vira método operacional)', () => {
  const result = normalizePublishedCommercialMethod({
    ...publishedMethod,
    commercial_method_contract_version: 'commercial-method-v1',
    commercial_method_definition: null,
  })

  assert.equal(result.status, 'not_configured')
})

test('ausência total de configuração publicada não fica ativa', () => {
  assert.equal(
    normalizePublishedCommercialMethod(null).status,
    'not_configured',
  )
  assert.equal(
    normalizePublishedCommercialMethod(undefined).status,
    'not_configured',
  )
})

test('commercial-method-v2 declarado com definição inválida falha fechado (não cai para descrição nem para etapas legadas)', () => {
  const result = normalizePublishedCommercialMethod({
    ...publishedMethod,
    commercial_method_definition: buildMethodDefinition({
      stages: [
        buildStage({
          requirement: 'required',
          skip_conditions: ['Isso nunca é permitido em etapa obrigatória.'],
        }),
      ],
    }),
  })

  assert.equal(result.status, 'invalid')
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0)
})

test('commercial-method-v2 declarado sem commercial_method_definition falha fechado', () => {
  const result = normalizePublishedCommercialMethod({
    ...publishedMethod,
    commercial_method_definition: null,
  })

  assert.equal(result.status, 'invalid')
})

test('commercial-method-v2 estruturado preserva critérios completos da etapa, incluindo skip_conditions e dimensions', () => {
  const method = activeMethod({
    ...publishedMethod,
    commercial_method_definition: buildMethodDefinition({
      stages: [
        buildStage({
          requirement: 'conditional',
          skip_conditions: ['O cliente já chega com decisão tomada.'],
          dimensions: [
            {
              key: 'necessidade',
              name: 'Necessidade',
              objective: 'Compreender o resultado buscado.',
              evidence_criteria: ['A necessidade relevante foi identificada.'],
            },
          ],
        }),
      ],
    }),
  })

  assert.equal(method.structure_source, 'structured_definition')
  assert.deepEqual(method.principles, [
    'Não transformar descoberta em interrogatório.',
  ])
  assert.equal(method.stages[0].key, 'acolher')
  assert.equal(
    method.stages[0].objective,
    'Criar abertura e compreender o contexto inicial.',
  )
  assert.deepEqual(
    method.stages[0].advance_when,
    ['Existe contexto para aprofundar'],
  )
  assert.deepEqual(
    method.stages[0].skip_conditions,
    ['O cliente já chega com decisão tomada.'],
  )
  assert.equal(method.stages[0].dimensions[0].key, 'necessidade')
  assert.deepEqual(
    method.stages[0].dimensions[0].evidence_criteria,
    ['A necessidade relevante foi identificada.'],
  )
})

test('orientação V2 recebe configuração publicada em formato canônico e limita etapa ao método', async () => {
  const method = activeMethod(publishedMethod)

  const provider = async (request) => {
    const prompt = JSON.parse(request.user_prompt)

    assert.equal(
      prompt.published_commercial_context.method.name,
      'Metodo ATO',
    )
    assert.equal(
      prompt.published_commercial_context.method.structure_source,
      'structured_definition',
    )
    assert.deepEqual(
      prompt.published_commercial_context.method.stages.map(
        (stage) => stage.name,
      ),
      ['Acolher', 'Tour', 'Obter'],
    )
    assert.equal(
      prompt.published_commercial_context.business_context.target_audience,
      'Empresas com equipes comerciais.',
    )
    assert.deepEqual(
      request.structured_output_format.schema.properties.stage_name.enum,
      ['Acolher', 'Tour', 'Obter'],
    )

    return {
      content: JSON.stringify({
        stage_name: 'Obter',
        stage_reason:
          'A cliente já conhece a solução e ainda precisa transformar a avaliação em uma decisão concreta.',
        next_step:
          'Confirme se a objeção de investimento continua sendo o ponto que impede a decisão e descubra qual condição precisa estar clara para ela avançar.',
      }),
      provider: 'test',
    }
  }

  const guidance = await composeLeadMethodGuidance({
    workingSummary:
      'A cliente conhece a Yolen, discutiu preço e apresentou objeção de investimento, mas ainda não fechou.',
    method,
    provider,
  })

  assert.equal(guidance.status, 'ready')
  assert.equal(guidance.method_name, 'Metodo ATO')
  assert.equal(guidance.stage_name, 'Obter')
  assert.equal(guidance.stage_key, 'obter')
  assert.match(guidance.next_step, /objeção de investimento/i)
})

test('orientação curta mas específica continua válida', async () => {
  const method = activeMethod(publishedMethod)

  const provider = async () => ({
    content: JSON.stringify({
      stage_name: 'Acolher',
      stage_reason: 'A cliente trouxe uma dúvida operacional específica.',
      next_step: 'Confirme o status exato da cobrança em aberto na CDL.',
    }),
    provider: 'test',
  })

  const guidance = await composeLeadMethodGuidance({
    workingSummary:
      'A cliente questiona uma cobrança anterior e aguarda conferência junto à CDL.',
    method,
    provider,
  })

  assert.equal(guidance.status, 'ready')
  assert.equal(guidance.stage_name, 'Acolher')
  assert.equal(
    guidance.next_step,
    'Confirme o status exato da cobrança em aberto na CDL.',
  )
})

test('orientação genérica é rejeitada', async () => {
  const method = activeMethod(publishedMethod)

  const provider = async () => ({
    content: JSON.stringify({
      stage_name: 'Obter',
      stage_reason: 'Falta continuidade.',
      next_step: 'Retomar a negociação.',
    }),
    provider: 'test',
  })

  const guidance = await composeLeadMethodGuidance({
    workingSummary: 'Existe uma negociação aberta.',
    method,
    provider,
  })

  assert.equal(guidance.status, 'error')
  assert.equal(guidance.next_step, null)
})
