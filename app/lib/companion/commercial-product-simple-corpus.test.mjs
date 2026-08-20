import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_PRODUCT_PRICING_MODELS,
  validateCommercialProductDefinition,
} from './commercial-product-contract.ts'

function buildDefinition({
  name,
  category,
  commercialDescription,
  audiences,
  needs,
  benefits,
  recommendWhen,
  avoidWhen = [],
  pricing,
  limitations = [],
  differentiators = [],
  contractConditions = [],
  paymentConditions = [],
  allowedClaims = [],
  forbiddenClaims = [],
}) {
  return {
    contract_version:
      'commercial-product-v2',

    product_kind:
      'simple',

    name,
    category,

    commercial_description:
      commercialDescription,

    indicated_audiences:
      audiences,

    needs_addressed:
      needs,

    benefits,

    verified_differentiators:
      differentiators,

    limitations,

    recommend_when:
      recommendWhen,

    avoid_when:
      avoidWhen,

    pricing,

    contract_conditions:
      contractConditions,

    payment_conditions:
      paymentConditions,

    allowed_claims:
      allowedClaims,

    forbidden_claims:
      forbiddenClaims,
  }
}

const corpus = [
  {
    id:
      'academia-recorrente-mensal',

    segment:
      'academia',

    definition:
      buildDefinition({
        name:
          'Plano Open',

        category:
          'Plano de academia',

        commercialDescription:
          'Plano recorrente para acesso à estrutura da academia.',

        audiences: [
          'Adultos que buscam atividade física recorrente.',
        ],

        needs: [
          'Acesso recorrente à academia.',
        ],

        benefits: [
          'Uso da estrutura durante a vigência do plano.',
        ],

        recommendWhen: [
          'O cliente busca frequência recorrente na academia.',
        ],

        avoidWhen: [
          'O cliente procura somente uma utilização pontual.',
        ],

        pricing: {
          model:
            'recurring',

          amount:
            149.9,

          currency:
            'BRL',

          amount_qualifier:
            'exact',

          recurrence:
            'monthly',

          installment_count:
            null,

          installment_amount_basis:
            null,

          note:
            'Valor mensal configurado.',
        },

        limitations: [
          'Serviços não descritos no plano não estão incluídos.',
        ],

        allowedClaims: [
          'O plano possui cobrança mensal.',
        ],

        forbiddenClaims: [
          'O plano garante resultado físico.',
        ],
      }),
  },

  {
    id:
      'saas-recorrente-anual-starting-at',

    segment:
      'software-saas',

    definition:
      buildDefinition({
        name:
          'Yolen Business',

        category:
          'Software comercial',

        commercialDescription:
          'Software recorrente de execução e inteligência comercial.',

        audiences: [
          'Empresas com equipe comercial.',
        ],

        needs: [
          'Organização e acompanhamento da execução comercial.',
        ],

        benefits: [
          'Centralização do contexto comercial.',
        ],

        recommendWhen: [
          'A empresa precisa estruturar acompanhamento comercial recorrente.',
        ],

        avoidWhen: [
          'A necessidade depende de funcionalidade não oferecida pelo produto.',
        ],

        pricing: {
          model:
            'recurring',

          amount:
            1290,

          currency:
            'BRL',

          amount_qualifier:
            'starting_at',

          recurrence:
            'annual',

          installment_count:
            null,

          installment_amount_basis:
            null,

          note:
            'Valor anual a partir da configuração informada.',
        },

        limitations: [
          'O preço final pode variar conforme a configuração contratada.',
        ],

        allowedClaims: [
          'O produto apoia a execução comercial.',
        ],

        forbiddenClaims: [
          'O produto garante aumento de vendas.',
        ],
      }),
  },

  {
    id:
      'consultoria-pagamento-unico',

    segment:
      'consultoria',

    definition:
      buildDefinition({
        name:
          'Diagnóstico Comercial',

        category:
          'Consultoria',

        commercialDescription:
          'Projeto pontual de diagnóstico do processo comercial.',

        audiences: [
          'Empresas que precisam revisar seu processo de vendas.',
        ],

        needs: [
          'Diagnóstico estruturado da operação comercial.',
        ],

        benefits: [
          'Identificação de gargalos comerciais.',
        ],

        recommendWhen: [
          'A empresa precisa de uma análise pontual da operação.',
        ],

        pricing: {
          model:
            'one_time',

          amount:
            3500,

          currency:
            'BRL',

          amount_qualifier:
            'exact',

          recurrence:
            null,

          installment_count:
            null,

          installment_amount_basis:
            null,

          note:
            'Valor único do projeto.',
        },

        contractConditions: [
          'Escopo limitado ao diagnóstico contratado.',
        ],

        allowedClaims: [
          'O projeto entrega um diagnóstico comercial.',
        ],

        forbiddenClaims: [
          'O projeto garante crescimento de receita.',
        ],
      }),
  },

  {
    id:
      'treinamento-parcelado-total',

    segment:
      'educacao-corporativa',

    definition:
      buildDefinition({
        name:
          'Treinamento Comercial',

        category:
          'Treinamento',

        commercialDescription:
          'Programa de capacitação comercial para equipes.',

        audiences: [
          'Equipes comerciais em processo de capacitação.',
        ],

        needs: [
          'Desenvolvimento de habilidades comerciais.',
        ],

        benefits: [
          'Capacitação estruturada da equipe.',
        ],

        recommendWhen: [
          'A empresa precisa treinar uma equipe comercial.',
        ],

        pricing: {
          model:
            'installment',

          amount:
            2400,

          currency:
            'BRL',

          amount_qualifier:
            'exact',

          recurrence:
            null,

          installment_count:
            12,

          installment_amount_basis:
            'total',

          note:
            'O amount representa o valor total do treinamento.',
        },

        paymentConditions: [
          'Pagamento dividido em 12 parcelas.',
        ],

        forbiddenClaims: [
          'O treinamento garante performance individual.',
        ],
      }),
  },

  {
    id:
      'implantacao-parcelada-por-parcela',

    segment:
      'servico-de-implantacao',

    definition:
      buildDefinition({
        name:
          'Implantação Assistida',

        category:
          'Serviço',

        commercialDescription:
          'Serviço de apoio à implantação de processo comercial.',

        audiences: [
          'Empresas que precisam de apoio durante a implantação.',
        ],

        needs: [
          'Acompanhamento durante a implantação.',
        ],

        benefits: [
          'Suporte estruturado durante o processo.',
        ],

        recommendWhen: [
          'A empresa precisa de acompanhamento na implantação.',
        ],

        pricing: {
          model:
            'installment',

          amount:
            350,

          currency:
            'BRL',

          amount_qualifier:
            'starting_at',

          recurrence:
            null,

          installment_count:
            6,

          installment_amount_basis:
            'per_installment',

          note:
            'Cada parcela começa no valor configurado.',
        },

        limitations: [
          'O escopo depende do serviço efetivamente contratado.',
        ],

        paymentConditions: [
          'Contratação em seis parcelas.',
        ],
      }),
  },

  {
    id:
      'projeto-sob-consulta',

    segment:
      'projeto-b2b',

    definition:
      buildDefinition({
        name:
          'Projeto Comercial Personalizado',

        category:
          'Projeto',

        commercialDescription:
          'Projeto comercial cujo valor depende do escopo aprovado.',

        audiences: [
          'Empresas com necessidade de projeto personalizado.',
        ],

        needs: [
          'Execução de projeto comercial sob medida.',
        ],

        benefits: [
          'Escopo adaptado à necessidade validada.',
        ],

        recommendWhen: [
          'A necessidade exige definição individual de escopo.',
        ],

        pricing: {
          model:
            'quote_required',

          amount:
            null,

          currency:
            'BRL',

          amount_qualifier:
            null,

          recurrence:
            null,

          installment_count:
            null,

          installment_amount_basis:
            null,

          note:
            'O valor depende de cotação.',
        },

        limitations: [
          'Não existe preço final antes da definição do escopo.',
        ],

        forbiddenClaims: [
          'Existe preço fechado antes da cotação.',
        ],
      }),
  },

  {
    id:
      'servico-preco-desconhecido',

    segment:
      'servico-profissional',

    definition:
      buildDefinition({
        name:
          'Serviço Especializado',

        category:
          'Serviço profissional',

        commercialDescription:
          'Serviço disponível comercialmente sem preço publicado no momento.',

        audiences: [
          'Empresas que precisam do serviço especializado.',
        ],

        needs: [
          'Execução especializada do serviço.',
        ],

        benefits: [
          'Atendimento especializado.',
        ],

        recommendWhen: [
          'A necessidade corresponde ao escopo conhecido do serviço.',
        ],

        pricing: {
          model:
            'unknown',

          amount:
            null,

          currency:
            'BRL',

          amount_qualifier:
            null,

          recurrence:
            null,

          installment_count:
            null,

          installment_amount_basis:
            null,

          note:
            'Preço comercial ainda não publicado.',
        },

        limitations: [
          'O preço não pode ser informado até existir configuração oficial.',
        ],
      }),
  },

  {
    id:
      'onboarding-gratuito',

    segment:
      'onboarding',

    definition:
      buildDefinition({
        name:
          'Onboarding Inicial',

        category:
          'Onboarding',

        commercialDescription:
          'Onboarding inicial oferecido sem cobrança.',

        audiences: [
          'Clientes elegíveis ao onboarding inicial.',
        ],

        needs: [
          'Orientação inicial de utilização.',
        ],

        benefits: [
          'Acompanhamento inicial sem cobrança.',
        ],

        recommendWhen: [
          'O cliente está elegível ao onboarding configurado.',
        ],

        pricing: {
          model:
            'free',

          amount:
            null,

          currency:
            'BRL',

          amount_qualifier:
            null,

          recurrence:
            null,

          installment_count:
            null,

          installment_amount_basis:
            null,

          note:
            'Serviço gratuito conforme configuração publicada.',
        },

        limitations: [
          'A gratuidade se aplica somente ao onboarding descrito.',
        ],

        allowedClaims: [
          'Este onboarding não possui cobrança.',
        ],
      }),
  },
]

test(
  'corpus multissegmento inteiro respeita o contrato de produto simples V2',
  () => {
    for (const scenario of corpus) {
      const result =
        validateCommercialProductDefinition(
          scenario.definition,
        )

      assert.equal(
        result.valid,
        true,
        `${scenario.id}: ${JSON.stringify(result.issues)}`,
      )

      assert.deepEqual(
        result.issues,
        [],
        scenario.id,
      )
    }
  },
)

test(
  'corpus cobre todos os modelos de preço simples do contrato',
  () => {
    const models = [
      ...new Set(
        corpus.map(
          scenario =>
            scenario
              .definition
              .pricing
              .model,
        ),
      ),
    ].sort()

    assert.deepEqual(
      models,
      [
        ...COMMERCIAL_PRODUCT_PRICING_MODELS,
      ].sort(),
    )
  },
)

test(
  'corpus diferencia valor exato de valor a partir de',
  () => {
    const qualifiers =
      new Set(
        corpus
          .map(
            scenario =>
              scenario
                .definition
                .pricing
                .amount_qualifier,
          )
          .filter(Boolean),
      )

    assert.equal(
      qualifiers.has('exact'),
      true,
    )

    assert.equal(
      qualifiers.has('starting_at'),
      true,
    )
  },
)

test(
  'preços recorrentes preservam periodicidade explícita',
  () => {
    const recurring =
      corpus.filter(
        scenario =>
          scenario
            .definition
            .pricing
            .model ===
          'recurring',
      )

    assert.deepEqual(
      recurring.map(
        scenario =>
          scenario
            .definition
            .pricing
            .recurrence,
      ),
      [
        'monthly',
        'annual',
      ],
    )

    for (const scenario of recurring) {
      assert.equal(
        scenario
          .definition
          .pricing
          .installment_count,
        null,
      )

      assert.equal(
        scenario
          .definition
          .pricing
          .installment_amount_basis,
        null,
      )
    }
  },
)

test(
  'parcelamento distingue valor total de valor por parcela',
  () => {
    const installments =
      corpus.filter(
        scenario =>
          scenario
            .definition
            .pricing
            .model ===
          'installment',
      )

    assert.deepEqual(
      installments.map(
        scenario =>
          scenario
            .definition
            .pricing
            .installment_amount_basis,
      ),
      [
        'total',
        'per_installment',
      ],
    )

    for (const scenario of installments) {
      assert.ok(
        scenario
          .definition
          .pricing
          .installment_count >= 2,
      )
    }
  },
)

test(
  'quote required free e unknown não fabricam valor numérico',
  () => {
    const nonNumericModels =
      new Set([
        'quote_required',
        'free',
        'unknown',
      ])

    const scenarios =
      corpus.filter(
        scenario =>
          nonNumericModels.has(
            scenario
              .definition
              .pricing
              .model,
          ),
      )

    assert.equal(
      scenarios.length,
      3,
    )

    for (const scenario of scenarios) {
      assert.equal(
        scenario
          .definition
          .pricing
          .amount,
        null,
      )

      assert.equal(
        scenario
          .definition
          .pricing
          .amount_qualifier,
        null,
      )

      assert.equal(
        scenario
          .definition
          .pricing
          .recurrence,
        null,
      )

      assert.equal(
        scenario
          .definition
          .pricing
          .installment_count,
        null,
      )

      assert.equal(
        scenario
          .definition
          .pricing
          .installment_amount_basis,
        null,
      )
    }
  },
)

test(
  'todos os cenários permanecem produtos simples e não dependem de semântica da A1.3',
  () => {
    const forbiddenA13Fields = [
      'sku',
      'variant',
      'variants',
      'model',
      'version',
      'compatibility',
      'application',
      'specifications',
      'technical_specifications',
      'stock',
      'inventory',
    ]

    for (const scenario of corpus) {
      assert.equal(
        scenario
          .definition
          .product_kind,
        'simple',
      )

      assert.equal(
        Object.hasOwn(
          scenario.definition,
          'base_price',
        ),
        false,
        scenario.id,
      )

      for (
        const field of
        forbiddenA13Fields
      ) {
        assert.equal(
          Object.hasOwn(
            scenario.definition,
            field,
          ),
          false,
          `${scenario.id}: ${field}`,
        )
      }
    }
  },
)

test(
  'corpus prova uso do contrato em múltiplos segmentos comerciais',
  () => {
    const segments =
      new Set(
        corpus.map(
          scenario =>
            scenario.segment,
        ),
      )

    assert.equal(
      segments.size,
      corpus.length,
    )

    assert.ok(
      segments.size >= 8,
    )
  },
)
