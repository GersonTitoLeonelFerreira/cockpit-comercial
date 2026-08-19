import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_PRODUCT_PRICING_MODELS,
} from './commercial-product-contract.ts'

import {
  COMMERCIAL_COMPLEX_PRODUCT_STOCK_STATUSES,
  validateCommercialComplexProductDefinition,
} from './commercial-product-complex-contract.ts'

const CHECKED_AT =
  '2026-08-18T12:00:00.000Z'

const VALID_UNTIL =
  '2026-08-19T12:00:00.000Z'

function buildPricing(
  model,
  overrides = {},
) {
  const definitions = {
    one_time: {
      model: 'one_time',
      amount: 18000,
      currency: 'BRL',
      amount_qualifier: 'exact',
      recurrence: null,
      installment_count: null,
      installment_amount_basis: null,
      note:
        'Valor único configurado para a variante.',
    },

    recurring: {
      model: 'recurring',
      amount: 899,
      currency: 'BRL',
      amount_qualifier: 'exact',
      recurrence: 'monthly',
      installment_count: null,
      installment_amount_basis: null,
      note:
        'Valor mensal configurado para a variante.',
    },

    installment: {
      model: 'installment',
      amount: 12000,
      currency: 'BRL',
      amount_qualifier: 'exact',
      recurrence: null,
      installment_count: 12,
      installment_amount_basis: 'total',
      note:
        'O amount representa o valor total parcelado.',
    },

    quote_required: {
      model: 'quote_required',
      amount: null,
      currency: 'BRL',
      amount_qualifier: null,
      recurrence: null,
      installment_count: null,
      installment_amount_basis: null,
      note:
        'O valor depende de cotação.',
    },

    free: {
      model: 'free',
      amount: null,
      currency: 'BRL',
      amount_qualifier: null,
      recurrence: null,
      installment_count: null,
      installment_amount_basis: null,
      note:
        'Esta variante é gratuita.',
    },

    unknown: {
      model: 'unknown',
      amount: null,
      currency: 'BRL',
      amount_qualifier: null,
      recurrence: null,
      installment_count: null,
      installment_amount_basis: null,
      note:
        'O preço comercial não está publicado.',
    },
  }

  return {
    ...definitions[model],
    ...overrides,
  }
}

function buildStock(
  status,
  overrides = {},
) {
  if (
    status === 'unknown' ||
    status === 'not_tracked'
  ) {
    return {
      status,
      quantity: null,
      checked_at: null,
      valid_until: null,
      note:
        status === 'unknown'
          ? 'Disponibilidade atual desconhecida.'
          : 'Estoque não é controlado para esta variante.',
      ...overrides,
    }
  }

  if (status === 'discontinued') {
    return {
      status,
      quantity: 0,
      checked_at: CHECKED_AT,
      valid_until: null,
      note:
        'Variante descontinuada.',
      ...overrides,
    }
  }

  const quantityByStatus = {
    available: 8,
    limited: 2,
    out_of_stock: 0,
    backorder: 0,
  }

  return {
    status,
    quantity:
      quantityByStatus[status],
    checked_at:
      CHECKED_AT,
    valid_until:
      VALID_UNTIL,
    note:
      `Snapshot de estoque ${status}.`,
    ...overrides,
  }
}

function buildVariant({
  key,
  name,
  sku,
  model,
  version = '2026',
  description,
  applications,
  specifications,
  compatibleWith = [],
  incompatibleWith = [],
  limitations = [],
  recommendWhen,
  avoidWhen = [],
  pricing,
  stock,
  allowedClaims = [],
  forbiddenClaims = [],
}) {
  return {
    key,
    name,
    sku,
    model,
    version,

    commercial_description:
      description,

    compatibility: {
      compatible_with:
        compatibleWith,

      incompatible_with:
        incompatibleWith,

      notes: [
        'Confirmar os critérios técnicos relevantes antes da seleção.',
      ],
    },

    applications,

    specifications,

    limitations,

    recommend_when:
      recommendWhen,

    avoid_when:
      avoidWhen,

    pricing,
    stock,

    allowed_claims:
      allowedClaims,

    forbidden_claims:
      forbiddenClaims,
  }
}

function buildDefinition({
  name,
  category,
  description,
  audiences,
  needs,
  benefits,
  recommendWhen,
  avoidWhen = [],
  limitations = [],
  variants,
}) {
  return {
    contract_version:
      'commercial-product-v3',

    product_kind:
      'complex',

    name,
    category,

    commercial_description:
      description,

    indicated_audiences:
      audiences,

    needs_addressed:
      needs,

    benefits,

    verified_differentiators: [
      'Variantes possuem características comerciais e técnicas verificadas.',
    ],

    limitations,

    recommend_when:
      recommendWhen,

    avoid_when:
      avoidWhen,

    contract_conditions: [
      'A contratação deve respeitar a variante efetivamente selecionada.',
    ],

    payment_conditions: [
      'A condição comercial depende do preço configurado para a variante.',
    ],

    allowed_claims: [
      'As variantes possuem diferenças configuradas.',
    ],

    forbidden_claims: [
      'Qualquer variante atende qualquer necessidade.',
    ],

    variants,
  }
}

const corpus = [
  {
    id:
      'equipamento-fitness',

    segment:
      'equipamentos-fitness',

    definition:
      buildDefinition({
        name:
          'Esteira Profissional',

        category:
          'Equipamento fitness',

        description:
          'Linha profissional com variantes para diferentes volumes de operação.',

        audiences: [
          'Academias, hotéis e centros de treinamento.',
        ],

        needs: [
          'Equipar uma operação de treinamento cardiovascular.',
        ],

        benefits: [
          'Permite selecionar capacidade conforme o uso esperado.',
        ],

        recommendWhen: [
          'A operação precisa de equipamento cardiovascular profissional.',
        ],

        variants: [
          buildVariant({
            key:
              'pro',

            name:
              'Modelo Pro',

            sku:
              'FIT-PRO-001',

            model:
              'XP-900',

            description:
              'Variante para maior volume de utilização.',

            applications: [
              'Operações de alto volume.',
            ],

            specifications: [
              {
                key: 'motor',
                label: 'Motor',
                value: '5',
                unit: 'HP',
              },
            ],

            compatibleWith: [
              'Rede elétrica 220V',
            ],

            incompatibleWith: [
              'Rede elétrica exclusivamente 110V',
            ],

            limitations: [
              'Exige infraestrutura elétrica compatível.',
            ],

            recommendWhen: [
              'A operação possui alto volume e infraestrutura 220V.',
            ],

            avoidWhen: [
              'O local possui somente rede elétrica 110V.',
            ],

            pricing:
              buildPricing(
                'one_time',
              ),

            stock:
              buildStock(
                'available',
              ),

            allowedClaims: [
              'Possui motor configurado de 5 HP.',
            ],

            forbiddenClaims: [
              'Nunca necessita manutenção.',
            ],
          }),

          buildVariant({
            key:
              'compact',

            name:
              'Modelo Compact',

            sku:
              'FIT-COMPACT-001',

            model:
              'XP-500',

            description:
              'Variante para operações de menor volume.',

            applications: [
              'Operações de volume moderado.',
            ],

            specifications: [
              {
                key: 'motor',
                label: 'Motor',
                value: '3',
                unit: 'HP',
              },
            ],

            recommendWhen: [
              'A operação possui volume moderado de utilização.',
            ],

            pricing:
              buildPricing(
                'installment',
              ),

            stock:
              buildStock(
                'limited',
              ),
          }),
        ],
      }),
  },

  {
    id:
      'climatizacao-comercial',

    segment:
      'climatizacao',

    definition:
      buildDefinition({
        name:
          'Sistema de Climatização Comercial',

        category:
          'Climatização',

        description:
          'Linha de climatização com variantes elétricas e capacidades distintas.',

        audiences: [
          'Empresas com ambientes comerciais climatizados.',
        ],

        needs: [
          'Climatizar ambientes comerciais conforme infraestrutura disponível.',
        ],

        benefits: [
          'Permite selecionar capacidade e alimentação elétrica adequadas.',
        ],

        recommendWhen: [
          'A empresa precisa dimensionar climatização comercial.',
        ],

        variants: [
          buildVariant({
            key:
              '220v',

            name:
              'Linha 220V',

            sku:
              'HVAC-220-001',

            model:
              'CL-36K',

            description:
              'Variante comercial para infraestrutura 220V.',

            applications: [
              'Ambientes comerciais com alimentação 220V.',
            ],

            specifications: [
              {
                key: 'capacity',
                label: 'Capacidade',
                value: '36000',
                unit: 'BTU/h',
              },
            ],

            compatibleWith: [
              'Rede elétrica 220V',
            ],

            incompatibleWith: [
              'Instalação exclusivamente 380V sem adaptação aprovada',
            ],

            recommendWhen: [
              'A infraestrutura elétrica comprovada é 220V.',
            ],

            pricing:
              buildPricing(
                'one_time',
                {
                  amount:
                    15000,

                  amount_qualifier:
                    'starting_at',
                },
              ),

            stock:
              buildStock(
                'out_of_stock',
              ),
          }),

          buildVariant({
            key:
              '380v',

            name:
              'Linha 380V',

            sku:
              'HVAC-380-001',

            model:
              'CL-60K',

            description:
              'Variante de maior capacidade para infraestrutura 380V.',

            applications: [
              'Ambientes comerciais de maior capacidade térmica.',
            ],

            specifications: [
              {
                key: 'capacity',
                label: 'Capacidade',
                value: '60000',
                unit: 'BTU/h',
              },
            ],

            compatibleWith: [
              'Rede elétrica 380V',
            ],

            recommendWhen: [
              'A infraestrutura e o dimensionamento exigem a variante 380V.',
            ],

            pricing:
              buildPricing(
                'quote_required',
              ),

            stock:
              buildStock(
                'backorder',
              ),
          }),
        ],
      }),
  },

  {
    id:
      'software-edicoes',

    segment:
      'software-saas',

    definition:
      buildDefinition({
        name:
          'Plataforma Comercial',

        category:
          'Software SaaS',

        description:
          'Plataforma com edições distintas conforme escopo de uso.',

        audiences: [
          'Empresas com equipes comerciais.',
        ],

        needs: [
          'Organizar execução e contexto comercial.',
        ],

        benefits: [
          'Permite contratar a edição compatível com o escopo da operação.',
        ],

        recommendWhen: [
          'A empresa precisa de uma plataforma comercial recorrente.',
        ],

        variants: [
          buildVariant({
            key:
              'team',

            name:
              'Edição Team',

            sku:
              'SAAS-TEAM',

            model:
              'Team',

            description:
              'Edição recorrente para equipes comerciais.',

            applications: [
              'Equipes comerciais em operação recorrente.',
            ],

            specifications: [
              {
                key: 'edition',
                label: 'Edição',
                value: 'Team',
                unit: null,
              },
            ],

            recommendWhen: [
              'A empresa precisa de utilização recorrente pela equipe.',
            ],

            pricing:
              buildPricing(
                'recurring',
              ),

            stock:
              buildStock(
                'not_tracked',
              ),
          }),

          buildVariant({
            key:
              'trial',

            name:
              'Edição Trial',

            sku:
              'SAAS-TRIAL',

            model:
              'Trial',

            description:
              'Edição gratuita de avaliação conforme elegibilidade.',

            applications: [
              'Avaliação inicial da plataforma.',
            ],

            specifications: [
              {
                key: 'edition',
                label: 'Edição',
                value: 'Trial',
                unit: null,
              },
            ],

            limitations: [
              'A gratuidade se aplica somente à edição Trial.',
            ],

            recommendWhen: [
              'O cliente está elegível para avaliação gratuita.',
            ],

            pricing:
              buildPricing(
                'free',
              ),

            stock:
              buildStock(
                'unknown',
              ),
          }),
        ],
      }),
  },

  {
    id:
      'automacao-industrial',

    segment:
      'automacao-industrial',

    definition:
      buildDefinition({
        name:
          'Controlador Industrial',

        category:
          'Automação industrial',

        description:
          'Linha de controladores com versões para diferentes arquiteturas industriais.',

        audiences: [
          'Indústrias e integradores de automação.',
        ],

        needs: [
          'Controlar processos industriais conforme arquitetura técnica.',
        ],

        benefits: [
          'Permite selecionar a versão conforme aplicação e compatibilidade.',
        ],

        recommendWhen: [
          'A operação precisa de controlador compatível com a arquitetura instalada.',
        ],

        variants: [
          buildVariant({
            key:
              'current',

            name:
              'Controlador Atual',

            sku:
              'IND-CURRENT-001',

            model:
              'PLC-X2',

            description:
              'Versão atual da linha de controladores.',

            applications: [
              'Projetos industriais atuais.',
            ],

            specifications: [
              {
                key: 'protocol',
                label: 'Protocolo',
                value: 'Ethernet/IP',
                unit: null,
              },
            ],

            compatibleWith: [
              'Arquitetura Ethernet/IP',
            ],

            recommendWhen: [
              'O projeto utiliza arquitetura Ethernet/IP compatível.',
            ],

            pricing:
              buildPricing(
                'one_time',
              ),

            stock:
              buildStock(
                'available',
              ),
          }),

          buildVariant({
            key:
              'legacy',

            name:
              'Controlador Legacy',

            sku:
              'IND-LEGACY-001',

            model:
              'PLC-L1',

            version:
              'Legacy',

            description:
              'Versão antiga mantida apenas como referência comercial.',

            applications: [
              'Instalações legadas compatíveis.',
            ],

            specifications: [
              {
                key: 'generation',
                label: 'Geração',
                value: 'Legacy',
                unit: null,
              },
            ],

            limitations: [
              'A variante está descontinuada.',
            ],

            recommendWhen: [
              'A identificação da instalação exige verificar compatibilidade legada.',
            ],

            pricing:
              buildPricing(
                'unknown',
              ),

            stock:
              buildStock(
                'discontinued',
              ),

            forbiddenClaims: [
              'A variante está disponível para fornecimento imediato.',
            ],
          }),
        ],
      }),
  },
]

test(
  'corpus complexo multissegmento inteiro respeita o contrato V3',
  () => {
    for (const scenario of corpus) {
      const result =
        validateCommercialComplexProductDefinition(
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
  'corpus complexo prova utilização em múltiplos segmentos comerciais',
  () => {
    assert.deepEqual(
      corpus.map(
        scenario =>
          scenario.segment,
      ),
      [
        'equipamentos-fitness',
        'climatizacao',
        'software-saas',
        'automacao-industrial',
      ],
    )

    assert.equal(
      new Set(
        corpus.map(
          scenario =>
            scenario.segment,
        ),
      ).size,
      corpus.length,
    )
  },
)

test(
  'corpus cobre todos os estados de estoque do contrato complexo',
  () => {
    const statuses = [
      ...new Set(
        corpus.flatMap(
          scenario =>
            scenario
              .definition
              .variants
              .map(
                variant =>
                  variant
                    .stock
                    .status,
              ),
        ),
      ),
    ].sort()

    assert.deepEqual(
      statuses,
      [
        ...COMMERCIAL_COMPLEX_PRODUCT_STOCK_STATUSES,
      ].sort(),
    )
  },
)

test(
  'corpus cobre todos os modelos semânticos de preço nas variantes',
  () => {
    const pricingModels = [
      ...new Set(
        corpus.flatMap(
          scenario =>
            scenario
              .definition
              .variants
              .map(
                variant =>
                  variant
                    .pricing
                    .model,
              ),
        ),
      ),
    ].sort()

    assert.deepEqual(
      pricingModels,
      [
        ...COMMERCIAL_PRODUCT_PRICING_MODELS,
      ].sort(),
    )
  },
)

test(
  'variantes possuem características reais de seleção sem depender de base_price',
  () => {
    for (const scenario of corpus) {
      assert.equal(
        Object.hasOwn(
          scenario.definition,
          'base_price',
        ),
        false,
        scenario.id,
      )

      for (
        const variant of
        scenario.definition.variants
      ) {
        const hasSelectionCharacteristic =
          Boolean(
            variant.sku ||
            variant.model ||
            variant.version ||
            variant
              .applications
              .length > 0 ||
            variant
              .specifications
              .length > 0 ||
            variant
              .compatibility
              .compatible_with
              .length > 0 ||
            variant
              .compatibility
              .incompatible_with
              .length > 0,
          )

        assert.equal(
          hasSelectionCharacteristic,
          true,
          `${scenario.id}:${variant.key}`,
        )
      }
    }
  },
)

test(
  'chaves e SKUs permanecem únicos dentro de cada produto complexo',
  () => {
    for (const scenario of corpus) {
      const keys =
        scenario
          .definition
          .variants
          .map(
            variant =>
              variant.key,
          )

      const skus =
        scenario
          .definition
          .variants
          .map(
            variant =>
              variant.sku,
          )
          .filter(Boolean)

      assert.equal(
        new Set(keys).size,
        keys.length,
        `${scenario.id}: keys`,
      )

      assert.equal(
        new Set(skus).size,
        skus.length,
        `${scenario.id}: skus`,
      )
    }
  },
)
