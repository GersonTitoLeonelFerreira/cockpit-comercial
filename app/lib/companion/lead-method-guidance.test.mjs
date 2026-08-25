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

const publishedMethod = {
  id: 'ef09c47e-83c5-401d-867c-bdf1f909e838',
  version_number: 1,
  commercial_method_name: 'Metodo ATO',
  commercial_method_description: 'Metodo ato são 3 passos:\nAcolher\nTour\nObter',
}

test('usa diretamente o nome e o texto do método publicado', () => {
  const method = normalizePublishedCommercialMethod(
    publishedMethod,
  )

  assert.ok(method)
  assert.equal(method.name, 'Metodo ATO')
  assert.equal(
    method.description,
    'Metodo ato são 3 passos: Acolher Tour Obter',
  )
})

test('método publicado sem descrição não é tratado como válido', () => {
  assert.equal(
    normalizePublishedCommercialMethod({
      ...publishedMethod,
      commercial_method_description: '',
    }),
    null,
  )
})

test('orientação V2 recebe o texto publicado sem converter para etapas sintéticas', async () => {
  const method = normalizePublishedCommercialMethod(
    publishedMethod,
  )

  const provider = async (request) => {
    const prompt = JSON.parse(request.user_prompt)

    assert.deepEqual(prompt.published_method, {
      name: 'Metodo ATO',
      description: 'Metodo ato são 3 passos: Acolher Tour Obter',
    })
    assert.equal(
      request.structured_output_format.schema.properties.stage_name.type,
      'string',
    )
    assert.equal(
      'stage_key' in request.structured_output_format.schema.properties,
      false,
    )

    return {
      content: JSON.stringify({
        stage_name: 'Obter',
        stage_reason:
          'A cliente já conhece a solução e a conversa precisa avançar para uma confirmação concreta.',
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
  assert.equal(guidance.stage_key, null)
  assert.match(guidance.next_step, /objeção de investimento/i)
})

test('orientação curta mas específica continua válida', async () => {
  const method = normalizePublishedCommercialMethod(
    publishedMethod,
  )

  const provider = async () => ({
    content: JSON.stringify({
      stage_name: 'Acolher',
      stage_reason: 'A cliente trouxe uma dúvida operacional específica.',
      next_step: 'Confirme o valor exato em aberto na CDL.',
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
  assert.equal(guidance.next_step, 'Confirme o valor exato em aberto na CDL.')
})

test('orientação genérica é rejeitada', async () => {
  const method = normalizePublishedCommercialMethod(
    publishedMethod,
  )

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
