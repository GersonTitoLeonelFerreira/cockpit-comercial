import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
  buildCommercialIntelligenceLibrary,
  buildCompanyCommercialIntelligence,
  rankCommercialIntelligence,
} from './commercial-intelligence-library.ts'

function buildInput({
  companyId = 'company-a',
  productId = 'product-a',
} = {}) {
  return {
    company_id:
      companyId,
    commercial_context: {
      configured: true,
      config_version_id:
        `config-${companyId}`,
      config_version_number: 1,
      config_contract_version:
        'phase-2-v1',
      business_description:
        'Empresa de serviços recorrentes.',
      target_audience:
        'Adultos que buscam acompanhamento.',
      value_proposition:
        'Acompanhamento próximo e previsível.',
      communication_tone:
        'Claro e consultivo.',
      required_behaviors: [
        'Responder a pergunta do cliente antes de avançar.',
      ],
      prohibited_behaviors: [
        'Inventar desconto.',
      ],
      sales_method: {
        configured: true,
        contract_version:
          'commercial-method-v2',
        name:
          'Método consultivo',
        description:
          'Diagnóstico antes da recomendação.',
        principles: [
          'Descobrir antes de apresentar.',
        ],
        definition: null,
        steps: [],
      },
      products: [
        {
          product_id:
            productId,
          contract_version:
            'commercial-product-v1',
          definition: null,
          name:
            'Plano Premium',
          category:
            'Plano',
          base_price: 199,
          active: true,
          indicated_audiences: [],
          needs_addressed: [
            'Acompanhamento contínuo',
          ],
          benefits: [
            'Atendimento recorrente',
          ],
          verified_differentiators: [
            'Acompanhamento próximo',
          ],
          limitations: [
            'Não inclui serviço externo.',
          ],
          contract_conditions: [
            'Contrato recorrente.',
          ],
          payment_conditions: [
            'Pagamento por cartão ou Pix conforme política publicada.',
          ],
          allowed_claims: [],
          forbidden_claims: [
            'Garantia de resultado.',
          ],
        },
      ],
      facts: [
        {
          contract_version:
            'commercial-fact-v1',
          definition: null,
          validity_status:
            'current',
          category:
            'payment',
          fact_key:
            'pix_available',
          fact_value:
            'Pix disponível conforme política comercial.',
          source_note:
            'Configuração publicada.',
        },
        {
          contract_version:
            'commercial-fact-v1',
          definition: null,
          validity_status:
            'expired',
          category:
            'payment',
          fact_key:
            'old_rule',
          fact_value:
            'Regra antiga.',
          source_note: null,
        },
      ],
      objection_guides: [
        {
          contract_version:
            'commercial-objection-v1',
          definition: null,
          sort_order: 1,
          objection:
            'Sem cartão',
          signals: [
            'sem cartão',
            'sem limite',
          ],
          discovery_questions: [
            'Qual é exatamente o bloqueio com o cartão?',
          ],
          recommended_approach:
            'Diagnosticar a causa e só então consultar alternativas permitidas.',
          response_limits: [
            'Não prometer condição fora da política.',
          ],
        },
      ],
    },
  }
}

test(
  'catálogo geral contém técnica, princípio, anti-padrão e risco sem script pronto',
  () => {
    const kinds =
      new Set(
        GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY
          .map(entry => entry.kind),
      )

    assert.ok(kinds.has('technique'))
    assert.ok(kinds.has('principle'))
    assert.ok(kinds.has('anti_pattern'))
    assert.ok(kinds.has('risk'))

    for (
      const entry of
      GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY
    ) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          entry,
          'suggested_message',
        ),
        false,
      )
      assert.ok(entry.when_to_use.length > 0)
      assert.ok(entry.risks.length > 0)
    }
  },
)

test(
  'objeção de pagamento ranqueia diagnóstico de objeção e conhecimento da empresa',
  () => {
    const input = buildInput()

    const ranked =
      rankCommercialIntelligence({
        entries:
          buildCommercialIntelligenceLibrary(
            input,
          ),
        query: {
          company_id:
            input.company_id,
          product_ids: [
            'product-a',
          ],
          situations: [
            'payment_objection',
            'objection_handling',
          ],
          signals: [
            'objection_open',
            'claim_requires_company_knowledge',
          ],
          objectives: [
            'diagnóstico',
          ],
          limit: 8,
        },
      })

    const ids =
      ranked.map(item => item.entry.id)

    assert.ok(
      ids.includes(
        'technique.objection_diagnosis',
      ),
    )
    assert.ok(
      ids.some(
        id =>
          id.startsWith(
            'company.company-a.',
          ),
      ),
    )
  },
)

test(
  'waiting_on customer prioriza espera disciplinada e anti-padrão de repetição',
  () => {
    const ranked =
      rankCommercialIntelligence({
        entries:
          GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
        query: {
          company_id: 'company-a',
          product_ids: [],
          situations: [
            'waiting_for_customer',
          ],
          signals: [
            'waiting_on_customer',
            'seller_action_already_performed',
          ],
          objectives: [],
          limit: 5,
        },
      })

    const ids =
      ranked.map(item => item.entry.id)

    assert.ok(
      ids.includes(
        'technique.commitment_wait',
      ),
    )
    assert.ok(
      ids.includes(
        'anti_pattern.repeat_completed_action',
      ),
    )
  },
)

test(
  'conhecimento de empresa não vaza entre company_id diferentes',
  () => {
    const entriesA =
      buildCompanyCommercialIntelligence(
        buildInput({
          companyId:
            'company-a',
        }),
      )

    const rankedForB =
      rankCommercialIntelligence({
        entries:
          entriesA,
        query: {
          company_id:
            'company-b',
          product_ids: [
            'product-a',
          ],
          situations: [
            'company_policy',
            'product_claim',
          ],
          signals: [
            'claim_requires_company_knowledge',
          ],
          objectives: [],
          limit: 20,
        },
      })

    assert.deepEqual(
      rankedForB,
      [],
    )
  },
)

test(
  'conhecimento de produto só aparece quando o product_id está no contexto da consulta',
  () => {
    const input = buildInput()
    const entries =
      buildCompanyCommercialIntelligence(
        input,
      )

    const withoutProduct =
      rankCommercialIntelligence({
        entries,
        query: {
          company_id:
            input.company_id,
          product_ids: [],
          situations: [
            'product_claim',
          ],
          signals: [
            'claim_requires_company_knowledge',
          ],
          objectives: [],
          limit: 20,
        },
      })

    assert.equal(
      withoutProduct.some(
        item =>
          item.entry.scope ===
          'product',
      ),
      false,
    )

    const withProduct =
      rankCommercialIntelligence({
        entries,
        query: {
          company_id:
            input.company_id,
          product_ids: [
            'product-a',
          ],
          situations: [
            'product_claim',
          ],
          signals: [
            'claim_requires_company_knowledge',
            'product:product-a',
          ],
          objectives: [],
          limit: 20,
        },
      })

    assert.equal(
      withProduct.some(
        item =>
          item.entry.scope ===
          'product' &&
          item.entry.provenance.product_id ===
            'product-a',
      ),
      true,
    )
  },
)

test(
  'fatos expirados não entram na biblioteca de conhecimento da empresa',
  () => {
    const entries =
      buildCompanyCommercialIntelligence(
        buildInput(),
      )

    assert.equal(
      entries.some(
        entry =>
          entry.id.endsWith(
            '.fact.old_rule',
          ),
      ),
      false,
    )
  },
)
