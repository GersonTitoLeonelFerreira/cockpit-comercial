import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_FACT_SCOPE_TYPES,
  COMMERCIAL_FACT_SOURCE_TYPES,
  COMMERCIAL_FACT_VALIDITY_MODES,
  validateCommercialFactDefinition,
} from './commercial-fact-contract.ts'

const REFERENCE_TIME =
  '2026-08-18T12:00:00.000Z'

const REFERENCE_TIMESTAMP =
  Date.parse(
    REFERENCE_TIME,
  )

function buildScope(
  type,
  {
    productId = null,
    variantKey = null,
    referenceKey = null,
  } = {},
) {
  return {
    type,

    product_id:
      productId,

    variant_key:
      variantKey,

    reference_key:
      referenceKey,
  }
}

function buildOngoingValidity(
  validFrom = null,
) {
  return {
    mode:
      'ongoing',

    valid_from:
      validFrom,

    valid_until:
      null,
  }
}

function buildBoundedValidity(
  validFrom,
  validUntil,
) {
  return {
    mode:
      'bounded',

    valid_from:
      validFrom,

    valid_until:
      validUntil,
  }
}

function buildSource(
  type,
  reference,
  verifiedAt =
    '2026-08-18T10:00:00.000Z',
) {
  return {
    type,
    reference,

    verified_at:
      verifiedAt,
  }
}

function buildFact({
  category,
  factKey,
  factValue,
  scope,
  conditions = [],
  limitations = [],
  validity,
  source,
}) {
  return {
    contract_version:
      'commercial-fact-v2',

    fact_kind:
      'official',

    category,

    fact_key:
      factKey,

    fact_value:
      factValue,

    scope,
    conditions,
    limitations,
    validity,
    source,
  }
}

function classifyValidity(
  definition,
) {
  const validFrom =
    definition
      .validity
      .valid_from

  if (
    validFrom !== null &&
    Date.parse(validFrom) >
      REFERENCE_TIMESTAMP
  ) {
    return 'not_yet_valid'
  }

  const validUntil =
    definition
      .validity
      .valid_until

  if (
    validUntil !== null &&
    Date.parse(validUntil) <=
      REFERENCE_TIMESTAMP
  ) {
    return 'expired'
  }

  return 'current'
}

const corpus = [
  {
    id:
      'academia-empresa-politica-geral',

    segment:
      'academia',

    expectedValidity:
      'current',

    definition:
      buildFact({
        category:
          'empresa',

        factKey:
          'atendimento_humano',

        factValue:
          'A empresa possui atendimento humano durante o horário comercial.',

        scope:
          buildScope(
            'company',
          ),

        limitations: [
          'O fato não afirma disponibilidade fora do horário comercial.',
        ],

        validity:
          buildOngoingValidity(),

        source:
          buildSource(
            'internal_policy',
            'Política interna de atendimento comercial.',
          ),
      }),
  },

  {
    id:
      'saas-produto-exportacao-dados',

    segment:
      'software-saas',

    expectedValidity:
      'current',

    definition:
      buildFact({
        category:
          'produto',

        factKey:
          'exportacao_csv',

        factValue:
          'O produto permite exportação de dados em formato CSV.',

        scope:
          buildScope(
            'product',
            {
              productId:
                '11111111-1111-4111-8111-111111111111',
            },
          ),

        conditions: [
          'A funcionalidade precisa estar habilitada no produto contratado.',
        ],

        limitations: [
          'O fato não define preço, disponibilidade de estoque ou variante comercial.',
        ],

        validity:
          buildOngoingValidity(
            '2026-01-01T00:00:00.000Z',
          ),

        source:
          buildSource(
            'product_documentation',
            'Documentação oficial da funcionalidade de exportação.',
          ),
      }),
  },

  {
    id:
      'equipamento-variante-tensao',

    segment:
      'equipamentos-fitness',

    expectedValidity:
      'current',

    definition:
      buildFact({
        category:
          'especificacao_tecnica',

        factKey:
          'tensao_x900_pro',

        factValue:
          'A variante X900 Pro opera em alimentação elétrica de 220 V.',

        scope:
          buildScope(
            'product_variant',
            {
              productId:
                '22222222-2222-4222-8222-222222222222',

              variantKey:
                'x900-pro',
            },
          ),

        conditions: [
          'A identificação da variante precisa corresponder exatamente à X900 Pro.',
        ],

        limitations: [
          'O fato não deve ser generalizado para outras variantes do equipamento.',
        ],

        validity:
          buildBoundedValidity(
            '2026-08-01T00:00:00.000Z',
            '2026-08-31T23:59:59.000Z',
          ),

        source:
          buildSource(
            'manual_verification',
            'Verificação técnica da unidade X900 Pro.',
            '2026-08-10T14:00:00.000Z',
          ),
      }),
  },

  {
    id:
      'consultoria-politica-futura',

    segment:
      'consultoria-b2b',

    expectedValidity:
      'not_yet_valid',

    definition:
      buildFact({
        category:
          'politica_comercial',

        factKey:
          'aprovacao_desconto_setembro',

        factValue:
          'Em setembro, descontos excepcionais exigem aprovação da direção comercial.',

        scope:
          buildScope(
            'commercial_policy',
            {
              referenceKey:
                'discount_policy_2026_09',
            },
          ),

        conditions: [
          'A negociação utiliza a política comercial de setembro de 2026.',
        ],

        limitations: [
          'A regra não está vigente antes de setembro de 2026.',
        ],

        validity:
          buildBoundedValidity(
            '2026-09-01T00:00:00.000Z',
            '2026-09-30T23:59:59.000Z',
          ),

        source:
          buildSource(
            'contract',
            'Anexo contratual da política comercial de setembro de 2026.',
          ),
      }),
  },

  {
    id:
      'varejo-operacao-expirada',

    segment:
      'varejo',

    expectedValidity:
      'expired',

    definition:
      buildFact({
        category:
          'operacao',

        factKey:
          'retirada_sabado_julho',

        factValue:
          'Durante julho, a operação de retirada expressa funcionou aos sábados.',

        scope:
          buildScope(
            'operation',
            {
              referenceKey:
                'pickup_operation_july_2026',
            },
          ),

        conditions: [
          'O pedido estava elegível para retirada expressa.',
        ],

        limitations: [
          'A informação se refere somente à operação de julho de 2026.',
        ],

        validity:
          buildBoundedValidity(
            '2026-07-01T00:00:00.000Z',
            '2026-08-01T00:00:00.000Z',
          ),

        source:
          buildSource(
            'system_record',
            'Registro operacional de horários de julho de 2026.',
            '2026-07-31T18:00:00.000Z',
          ),
      }),
  },

  {
    id:
      'educacao-servico-carga-horaria',

    segment:
      'educacao-corporativa',

    expectedValidity:
      'current',

    definition:
      buildFact({
        category:
          'servico',

        factKey:
          'carga_horaria_in_company',

        factValue:
          'O treinamento in company possui carga horária contratual de oito horas.',

        scope:
          buildScope(
            'service',
            {
              referenceKey:
                'training_in_company_8h',
            },
          ),

        conditions: [
          'O contrato precisa corresponder ao treinamento in company de oito horas.',
        ],

        limitations: [
          'A carga horária não deve ser generalizada para outros treinamentos.',
        ],

        validity:
          buildOngoingValidity(
            '2026-03-01T00:00:00.000Z',
          ),

        source:
          buildSource(
            'contract',
            'Contrato padrão do treinamento in company de oito horas.',
          ),
      }),
  },

  {
    id:
      'ecommerce-integracao-shopify',

    segment:
      'ecommerce',

    expectedValidity:
      'current',

    definition:
      buildFact({
        category:
          'integracao',

        factKey:
          'shopify_sync_active',

        factValue:
          'A integração Shopify está habilitada para sincronização dos pedidos configurados.',

        scope:
          buildScope(
            'integration',
            {
              referenceKey:
                'shopify_orders_sync',
            },
          ),

        conditions: [
          'A integração precisa estar conectada e habilitada para a conta analisada.',
        ],

        limitations: [
          'O fato não afirma sincronização de recursos que não estejam configurados.',
        ],

        validity:
          buildBoundedValidity(
            '2026-08-01T00:00:00.000Z',
            '2026-09-01T00:00:00.000Z',
          ),

        source:
          buildSource(
            'system_record',
            'Registro do estado da integração Shopify.',
            '2026-08-18T09:00:00.000Z',
          ),
      }),
  },

  {
    id:
      'industria-seguranca-mfa',

    segment:
      'automacao-industrial',

    expectedValidity:
      'current',

    definition:
      buildFact({
        category:
          'seguranca',

        factKey:
          'mfa_painel_tecnico',

        factValue:
          'O acesso administrativo ao painel técnico exige autenticação multifator.',

        scope:
          buildScope(
            'security',
            {
              referenceKey:
                'technical_admin_access',
            },
          ),

        conditions: [
          'O acesso é realizado com perfil administrativo.',
        ],

        limitations: [
          'O fato não descreve os controles de outros perfis de acesso.',
        ],

        validity:
          buildBoundedValidity(
            '2026-06-01T00:00:00.000Z',
            '2027-06-01T00:00:00.000Z',
          ),

        source:
          buildSource(
            'regulatory_document',
            'Documento oficial de requisitos de segurança do painel técnico.',
            '2026-06-01T12:00:00.000Z',
          ),
      }),
  },

  {
    id:
      'logistica-outra-referencia-operacional',

    segment:
      'logistica',

    expectedValidity:
      'current',

    definition:
      buildFact({
        category:
          'cobertura_operacional',

        factKey:
          'rota_piloto_sc',

        factValue:
          'A cobertura homologada da rota piloto inclui Joinville e Blumenau.',

        scope:
          buildScope(
            'other',
            {
              referenceKey:
                'pilot_route_sc',
            },
          ),

        conditions: [
          'A negociação se refere à rota piloto homologada.',
        ],

        limitations: [
          'O fato não afirma cobertura em outras cidades.',
        ],

        validity:
          buildOngoingValidity(
            '2026-08-01T00:00:00.000Z',
          ),

        source:
          buildSource(
            'other',
            'Mapa operacional homologado para a rota piloto.',
            '2026-08-15T15:00:00.000Z',
          ),
      }),
  },
]

test(
  'corpus multissegmento inteiro respeita o contrato de fatos oficiais V2',
  () => {
    for (const scenario of corpus) {
      const result =
        validateCommercialFactDefinition(
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
  'corpus cobre todos os escopos oficiais do contrato',
  () => {
    const scopes = [
      ...new Set(
        corpus.map(
          scenario =>
            scenario
              .definition
              .scope
              .type,
        ),
      ),
    ].sort()

    assert.deepEqual(
      scopes,
      [
        ...COMMERCIAL_FACT_SCOPE_TYPES,
      ].sort(),
    )
  },
)

test(
  'corpus cobre todas as procedências oficiais do contrato',
  () => {
    const sources = [
      ...new Set(
        corpus.map(
          scenario =>
            scenario
              .definition
              .source
              .type,
        ),
      ),
    ].sort()

    assert.deepEqual(
      sources,
      [
        ...COMMERCIAL_FACT_SOURCE_TYPES,
      ].sort(),
    )
  },
)

test(
  'corpus cobre todos os modos de vigência do contrato',
  () => {
    const validityModes = [
      ...new Set(
        corpus.map(
          scenario =>
            scenario
              .definition
              .validity
              .mode,
        ),
      ),
    ].sort()

    assert.deepEqual(
      validityModes,
      [
        ...COMMERCIAL_FACT_VALIDITY_MODES,
      ].sort(),
    )
  },
)

test(
  'corpus prova fatos atuais futuros e expirados contra a mesma referência temporal',
  () => {
    for (const scenario of corpus) {
      assert.equal(
        classifyValidity(
          scenario.definition,
        ),
        scenario.expectedValidity,
        scenario.id,
      )
    }

    assert.deepEqual(
      [
        ...new Set(
          corpus.map(
            scenario =>
              scenario.expectedValidity,
          ),
        ),
      ].sort(),
      [
        'current',
        'expired',
        'not_yet_valid',
      ],
    )
  },
)

test(
  'corpus prova utilização em múltiplos segmentos comerciais',
  () => {
    const segments =
      corpus.map(
        scenario =>
          scenario.segment,
      )

    assert.equal(
      new Set(
        segments,
      ).size,
      corpus.length,
    )

    assert.ok(
      corpus.length >= 9,
    )

    assert.deepEqual(
      segments,
      [
        'academia',
        'software-saas',
        'equipamentos-fitness',
        'consultoria-b2b',
        'varejo',
        'educacao-corporativa',
        'ecommerce',
        'automacao-industrial',
        'logistica',
      ],
    )
  },
)

test(
  'condições e limitações permanecem qualificadores explícitos do fato',
  () => {
    assert.ok(
      corpus.some(
        scenario =>
          scenario
            .definition
            .conditions
            .length === 0,
      ),
    )

    assert.ok(
      corpus.some(
        scenario =>
          scenario
            .definition
            .conditions
            .length > 0,
      ),
    )

    assert.ok(
      corpus.every(
        scenario =>
          Array.isArray(
            scenario
              .definition
              .limitations,
          ),
      ),
    )

    assert.ok(
      corpus.some(
        scenario =>
          scenario
            .definition
            .limitations
            .length > 0,
      ),
    )
  },
)

test(
  'fatos do corpus não viram catálogo paralelo evidência de cliente ou probabilidade',
  () => {
    const forbiddenTopLevelKeys = [
      'pricing',
      'stock',
      'variants',
      'base_price',
      'confidence',
      'evidence_message_ids',
    ]

    for (const scenario of corpus) {
      for (
        const key of
        forbiddenTopLevelKeys
      ) {
        assert.equal(
          Object.prototype
            .hasOwnProperty
            .call(
              scenario.definition,
              key,
            ),
          false,
          `${scenario.id}: ${key}`,
        )
      }

      assert.equal(
        scenario
          .definition
          .fact_kind,
        'official',
        scenario.id,
      )
    }
  },
)

test(
  'chaves dos fatos permanecem únicas dentro do corpus',
  () => {
    const keys =
      corpus.map(
        scenario =>
          scenario
            .definition
            .fact_key,
      )

    assert.equal(
      new Set(keys).size,
      keys.length,
    )
  },
)
