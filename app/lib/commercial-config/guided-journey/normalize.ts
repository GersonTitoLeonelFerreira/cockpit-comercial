import {
  createEmptyBuyerBehavior,
  createEmptyDecisionEvidence,
  createEmptyDiscoveryDepth,
  createEmptyFormalization,
  createEmptyObjections,
  createEmptyPresentationDepth,
  createEmptyPricingFlow,
  createEmptyProblemContext,
  createEmptyRenewal,
} from '@/app/types/commercial-method-builder'
import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'

/**
 * Preenche com valores padrão os campos opcionais adicionados pela Jornada
 * Guiada (Onda 8 / Fase 2B) em rascunhos existentes.
 *
 * Rascunhos criados pelo formulário anterior (Fase 1/2) não possuem essas
 * chaves. Isso é esperado — nunca torne essas chaves obrigatórias na
 * validação do rascunho (`isCommercialMethodBuilderData`), pois isso
 * rejeitaria drafts antigos. Em vez disso, esta função é chamada sempre que
 * a Jornada Guiada carrega um rascunho, garantindo que o restante do código
 * da jornada possa acessar esses campos sem checagens de undefined.
 *
 * Campos já preenchidos (mesmo old drafts do formulário Fase 1/2, que
 * escrevem nos campos originais como `offer.type` ou `customer.buyer_type`)
 * são preservados sem alteração — essa é a base da migração de draft
 * antigo (seção 21): a Jornada Guiada detecta "já respondido" observando os
 * próprios campos estruturados, que são os mesmos que o formulário antigo
 * já escrevia.
 */
export function normalizeCommercialMethodBuilderData(
  data: CommercialMethodBuilderData,
): CommercialMethodBuilderData {
  return {
    ...data,
    company_profile: {
      ...data.company_profile,
      offer: {
        ...data.company_profile.offer,
        customization_depth: data.company_profile.offer.customization_depth ?? '',
        purchase_frequency: data.company_profile.offer.purchase_frequency ?? '',
        plan_variation_dimensions: data.company_profile.offer.plan_variation_dimensions ?? [],
      },
      buyer_behavior: {
        ...createEmptyBuyerBehavior(),
        ...(data.company_profile.buyer_behavior ?? {}),
      },
    },
    current_sales_process: {
      ...data.current_sales_process,
      problem_context: {
        ...createEmptyProblemContext(),
        ...(data.current_sales_process.problem_context ?? {}),
      },
      discovery_depth: {
        ...createEmptyDiscoveryDepth(),
        ...(data.current_sales_process.discovery_depth ?? {}),
      },
      sales_events_detail: data.current_sales_process.sales_events_detail ?? [],
      presentation_depth: {
        ...createEmptyPresentationDepth(),
        ...(data.current_sales_process.presentation_depth ?? {}),
      },
      pricing_flow: {
        ...createEmptyPricingFlow(),
        ...(data.current_sales_process.pricing_flow ?? {}),
      },
      objections: {
        ...createEmptyObjections(),
        ...(data.current_sales_process.objections ?? {}),
      },
      decision_evidence: {
        ...createEmptyDecisionEvidence(),
        ...(data.current_sales_process.decision_evidence ?? {}),
      },
      formalization: {
        ...createEmptyFormalization(),
        ...(data.current_sales_process.formalization ?? {}),
      },
      renewal: {
        ...createEmptyRenewal(),
        ...(data.current_sales_process.renewal ?? {}),
      },
      disqualification_signals: data.current_sales_process.disqualification_signals ?? [],
    },
  }
}
