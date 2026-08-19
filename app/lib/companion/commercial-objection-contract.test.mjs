import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_OBJECTION_CATEGORIES,
  COMMERCIAL_OBJECTION_CONTRACT_VERSION,
  COMMERCIAL_OBJECTION_NEIGHBORING_STATES,
  COMMERCIAL_OBJECTION_SCOPE_TYPES,
  validateCommercialObjectionDefinition,
} from './commercial-objection-contract.ts'

function buildPriceObjection() {
  return {
    contract_version:
      COMMERCIAL_OBJECTION_CONTRACT_VERSION,

    objection_kind:
      'commercial_objection',

    objection_key:
      'price_value',

    objection:
      'Preço percebido como alto',

    category:
      'price',

    description:
      'Resistência em que o preço ou a relação entre preço e valor percebido está materialmente dificultando o avanço da decisão.',

    scope: {
      type:
        'company',

      product_id:
        null,

      variant_key:
        null,
    },

    signals: [
      'Está caro.',
      'Ficou acima do que eu esperava.',
    ],

    objection_when: [
      'O cliente relaciona o preço a uma resistência real para avançar.',
      'O preço é apresentado como motivo que impede ou dificulta materialmente a decisão.',
    ],

    not_objection_when: [
      'O cliente apenas pergunta qual é o preço.',
      'O cliente pede condições de pagamento sem indicar resistência ao valor.',
      'O cliente informa que precisa consultar outra pessoa sem dizer que o preço é um problema.',
    ],

    distinguish_from: [
      'question',
      'information_request',
      'condition',
      'postponement',
      'rejection',
      'uncertainty',
    ],

    discovery_questions: [
      'Quando você diz que ficou alto, o que está pesando mais nessa condição?',
    ],

    recommended_approach:
      'Compreender se a resistência é valor percebido, orçamento ou condição antes de responder. Usar somente informações comerciais comprovadas e não pressionar o cliente.',

    response_limits: [
      'Não presumir falta de dinheiro.',
      'Não oferecer desconto sem política comercial aplicável.',
      'Não discutir com o cliente nem tentar vencer a objeção.',
    ],

    resolution_criteria: [
      'A preocupação foi compreendida e está claro se ainda existe bloqueio real para a decisão.',
    ],

    wait_when: [
      'O cliente pediu tempo e assumiu compromisso explícito de retorno sem deixar ação pendente ao vendedor.',
    ],

    give_space_when: [
      'Continuar insistindo aumentaria a resistência sem acrescentar informação útil.',
    ],

    stop_when: [
      'O cliente fez uma recusa explícita e não solicitou alternativa ou continuidade.',
    ],
  }
}

test(
  'contrato representa objeção comercial sem tratá-la como gatilho automático de resposta',
  () => {
    const definition =
      buildPriceObjection()

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      true,
      JSON.stringify(
        result.issues,
        null,
        2,
      ),
    )

    assert.deepEqual(
      result.issues,
      [],
    )

    assert.equal(
      definition.objection_kind,
      'commercial_objection',
    )
  },
)

test(
  'contrato possui categorias escopos e estados vizinhos explícitos',
  () => {
    assert.deepEqual(
      COMMERCIAL_OBJECTION_SCOPE_TYPES,
      [
        'company',
        'product',
        'product_variant',
      ],
    )

    assert.deepEqual(
      COMMERCIAL_OBJECTION_NEIGHBORING_STATES,
      [
        'question',
        'information_request',
        'condition',
        'postponement',
        'rejection',
        'uncertainty',
      ],
    )

    assert.equal(
      COMMERCIAL_OBJECTION_CATEGORIES
        .includes(
          'price',
        ),
      true,
    )

    assert.equal(
      COMMERCIAL_OBJECTION_CATEGORIES
        .includes(
          'other',
        ),
      true,
    )
  },
)

test(
  'sinal comercial não é suficiente sozinho e pergunta de preço pode ser explicitamente excluída',
  () => {
    const definition =
      buildPriceObjection()

    assert.equal(
      definition.signals
        .includes(
          'Está caro.',
        ),
      true,
    )

    assert.equal(
      definition.not_objection_when
        .some(
          rule =>
            rule.includes(
              'apenas pergunta qual é o preço',
            ),
        ),
      true,
    )

    assert.equal(
      definition.distinguish_from
        .includes(
          'question',
        ),
      true,
    )
  },
)

test(
  'perguntas de descoberta podem ficar vazias sem forçar interrogatório',
  () => {
    const definition =
      buildPriceObjection()

    definition.discovery_questions =
      []

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      true,
      JSON.stringify(
        result.issues,
      ),
    )
  },
)

test(
  'objeção exige critério positivo de reconhecimento',
  () => {
    const definition =
      buildPriceObjection()

    definition.objection_when =
      []

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.path ===
          'objection_when',
      ),
      true,
    )
  },
)

test(
  'objeção exige regra explícita para evitar falso positivo',
  () => {
    const definition =
      buildPriceObjection()

    definition.not_objection_when =
      []

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.path ===
          'not_objection_when',
      ),
      true,
    )
  },
)

test(
  'objeção precisa declarar com qual estado vizinho não deve ser confundida',
  () => {
    const definition =
      buildPriceObjection()

    definition.distinguish_from =
      []

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.path ===
          'distinguish_from',
      ),
      true,
    )
  },
)

test(
  'abordagem possui limites e critério de resolução obrigatórios',
  () => {
    const withoutLimits =
      buildPriceObjection()

    withoutLimits.response_limits =
      []

    const limitsResult =
      validateCommercialObjectionDefinition(
        withoutLimits,
      )

    assert.equal(
      limitsResult.valid,
      false,
    )

    assert.equal(
      limitsResult.issues.some(
        issue =>
          issue.path ===
          'response_limits',
      ),
      true,
    )

    const withoutResolution =
      buildPriceObjection()

    withoutResolution.resolution_criteria =
      []

    const resolutionResult =
      validateCommercialObjectionDefinition(
        withoutResolution,
      )

    assert.equal(
      resolutionResult.valid,
      false,
    )

    assert.equal(
      resolutionResult.issues.some(
        issue =>
          issue.path ===
          'resolution_criteria',
      ),
      true,
    )
  },
)

test(
  'escopo de empresa não aceita produto ou variante',
  () => {
    const definition =
      buildPriceObjection()

    definition.scope.product_id =
      '11111111-1111-4111-8111-111111111111'

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'SCOPE_CONFLICT',
      ),
      true,
    )
  },
)

test(
  'escopo de produto exige product_id e proíbe variant_key',
  () => {
    const missingProduct =
      buildPriceObjection()

    missingProduct.scope = {
      type:
        'product',

      product_id:
        null,

      variant_key:
        null,
    }

    const missingResult =
      validateCommercialObjectionDefinition(
        missingProduct,
      )

    assert.equal(
      missingResult.valid,
      false,
    )

    const validProduct =
      buildPriceObjection()

    validProduct.scope = {
      type:
        'product',

      product_id:
        '11111111-1111-4111-8111-111111111111',

      variant_key:
        null,
    }

    const validResult =
      validateCommercialObjectionDefinition(
        validProduct,
      )

    assert.equal(
      validResult.valid,
      true,
      JSON.stringify(
        validResult.issues,
      ),
    )
  },
)

test(
  'escopo de variante exige produto e variant_key',
  () => {
    const definition =
      buildPriceObjection()

    definition.scope = {
      type:
        'product_variant',

      product_id:
        '11111111-1111-4111-8111-111111111111',

      variant_key:
        null,
    }

    const invalidResult =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      invalidResult.valid,
      false,
    )

    definition.scope.variant_key =
      'enterprise'

    const validResult =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      validResult.valid,
      true,
      JSON.stringify(
        validResult.issues,
      ),
    )
  },
)

test(
  'listas semânticas rejeitam duplicidade textual',
  () => {
    const definition =
      buildPriceObjection()

    definition.signals = [
      'Está caro.',
      '  ESTÁ CARO.  ',
    ]

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'DUPLICATE_ITEM',
      ),
      true,
    )
  },
)

test(
  'mesma regra não pode caracterizar e descaracterizar objeção',
  () => {
    const definition =
      buildPriceObjection()

    definition.not_objection_when = [
      ...definition
        .not_objection_when,

      definition
        .objection_when[0],
    ]

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      false,
    )

    assert.equal(
      result.issues.some(
        issue =>
          issue.code ===
          'CONTRADICTORY_RULE',
      ),
      true,
    )
  },
)

test(
  'categoria chave semântica e estado vizinho inválidos são rejeitados',
  () => {
    const invalidCategory =
      buildPriceObjection()

    invalidCategory.category =
      'anything'

    const categoryResult =
      validateCommercialObjectionDefinition(
        invalidCategory,
      )

    assert.equal(
      categoryResult.valid,
      false,
    )

    const invalidKey =
      buildPriceObjection()

    invalidKey.objection_key =
      'Preço Alto'

    const keyResult =
      validateCommercialObjectionDefinition(
        invalidKey,
      )

    assert.equal(
      keyResult.valid,
      false,
    )

    const invalidNeighbor =
      buildPriceObjection()

    invalidNeighbor.distinguish_from = [
      'question',
      'objection',
    ]

    const neighborResult =
      validateCommercialObjectionDefinition(
        invalidNeighbor,
      )

    assert.equal(
      neighborResult.valid,
      false,
    )
  },
)

test(
  'contrato consegue representar esperar dar espaço e encerrar sem obrigar contra-argumentação',
  () => {
    const definition =
      buildPriceObjection()

    assert.equal(
      definition.wait_when.length >
      0,
      true,
    )

    assert.equal(
      definition.give_space_when.length >
      0,
      true,
    )

    assert.equal(
      definition.stop_when.length >
      0,
      true,
    )

    assert.equal(
      definition.stop_when
        .some(
          condition =>
            condition.includes(
              'recusa explícita',
            ),
        ),
      true,
    )

    const result =
      validateCommercialObjectionDefinition(
        definition,
      )

    assert.equal(
      result.valid,
      true,
      JSON.stringify(
        result.issues,
      ),
    )
  },
)
