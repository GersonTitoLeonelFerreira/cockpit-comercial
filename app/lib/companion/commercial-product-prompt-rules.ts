// ============================================================================
// Yolen — Inteligência Comercial
// Regras de interpretação de produtos e serviços pelo modelo.
//
// Este módulo não escolhe uma ação comercial.
// Ele define como a configuração de produto deve limitar e orientar o
// raciocínio. A taxonomia de decisões comerciais pertence à A2.
// ============================================================================

import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

export const COMMERCIAL_PRODUCT_PROMPT_RULES_VERSION =
  'commercial-product-prompt-rules-v1' as const

type DiagnosticCommercialProduct =
  CompanionDiagnosticInput[
    'commercial_context'
  ]['products'][number]

export function buildCommercialProductPromptRules(
  products: DiagnosticCommercialProduct[],
): string {
  if (products.length === 0) {
    return [
      'Nenhum produto ou serviço comercial está configurado para esta análise.',
      'Não invente produto, preço, condição, benefício, diferencial, disponibilidade, limitação ou promessa ausente.',
      'Sem informação de produto suficiente, não conclua aderência comercial positiva nem recomende uma solução específica.',
    ].join('\n')
  }

  const baseRules = [
    'Os produtos configurados descrevem o que a empresa pode comercializar; a simples existência de um produto não prova interesse, necessidade ou aderência do comprador.',

    'Nunca invente produto, preço, condição, benefício, diferencial, disponibilidade, escopo, resultado ou promessa que não esteja configurado.',

    'product.active=false significa que o produto não deve ser recomendado como oferta disponível. product.active=null significa que a disponibilidade não está comprovada.',

    'indicated_audiences descreve públicos normalmente compatíveis, mas pertencer a um público não prova sozinho que o produto é adequado ao caso atual.',

    'needs_addressed descreve necessidades que o produto realmente pode atender. Relacione o produto à necessidade somente quando a conversa ou memória válida comprovar correspondência relevante.',

    'benefits descreve benefícios configurados do produto. Não transforme benefício possível em resultado garantido para o comprador.',

    'verified_differentiators contém somente diferenças comercialmente verificadas. Não crie comparação, superioridade ou vantagem competitiva além do que estiver configurado.',

    'limitations são restrições vinculantes. Nunca esconda, contradiga ou ultrapasse uma limitação configurada para tornar a recomendação mais atraente.',

    'allowed_claims define afirmações comercialmente autorizadas sobre o produto. Isso não transforma a afirmação em evidência de que o produto é adequado para aquele comprador.',

    'forbidden_claims é uma proibição rígida. Nunca use, parafraseie como promessa equivalente ou recomende ao vendedor uma afirmação presente em forbidden_claims.',

    'contract_conditions e payment_conditions são condições configuradas. Não invente flexibilização, desconto, prazo, fidelidade, cancelamento, parcelamento ou exceção ausente.',

    'Em commercial-product-v1, base_price é um valor legado sem semântica comercial suficiente. Nunca deduza apenas de base_price que o valor seja mensal, anual, total, parcela, pagamento único ou valor a partir de.',

    'Quando o significado comercial de um preço V1 não estiver explicitamente comprovado, preserve a incerteza em vez de completar a informação por inferência.',

    'Ao comparar mais de um produto, use somente diferenças configuradas e necessidades comprovadas. Não fabrique ranking, produto vencedor ou recomendação apenas para escolher alguma opção.',

    'Uma conclusão comercial válida pode ser que nenhum produto configurado seja adequado ou que ainda falte informação para recomendar com segurança. Não force uma recomendação.',
  ]

  const hasSemanticV2 =
    products.some(
      product =>
        product.contract_version ===
          'commercial-product-v2' &&
        product.definition !== null,
    )

  if (!hasSemanticV2) {
    return baseRules.join('\n')
  }

  return [
    ...baseRules,

    'Quando product.contract_version=commercial-product-v2, product.definition é a fonte semântica vinculante daquele produto publicado.',

    'definition.commercial_description explica comercialmente o que o produto é; não trate essa descrição como promessa de resultado.',

    'definition.recommend_when descreve condições que favorecem uma recomendação. Uma condição configurada só pode sustentar aderência quando o contexto do comprador realmente a comprovar.',

    'definition.recommend_when não transforma recomendação em obrigação automática. Mesmo quando houver correspondência, considere limitações, avoid_when e informação ainda ausente.',

    'definition.avoid_when descreve condições nas quais o produto não deve ser recomendado normalmente. Quando uma dessas condições estiver comprovada e for material para a necessidade do comprador, não declare aderência plena.',

    'Se uma limitation configurada impedir uma necessidade essencial do comprador, trate isso como conflito real de aderência; não omita a limitação nem compense com benefícios não relacionados.',

    'Se a evidência disponível não permitir verificar recommend_when, avoid_when ou uma limitação material, preserve a incerteza em vez de assumir correspondência.',

    'definition.pricing é a única fonte semântica de preço para commercial-product-v2. Nunca reinterprete product.base_price como preço comercial do V2.',

    'pricing.model=one_time significa pagamento único do amount configurado.',

    'pricing.model=recurring exige interpretar amount junto com pricing.recurrence. Nunca omita ou invente a periodicidade.',

    'pricing.model=installment exige interpretar amount junto com installment_count e installment_amount_basis. Não confunda valor total com valor por parcela.',

    'pricing.model=quote_required significa que o preço depende de cotação. Não invente valor numérico.',

    'pricing.model=free autoriza tratar o preço como gratuito somente para o produto cuja definição declara explicitamente esse modelo.',

    'pricing.model=unknown significa que o preço comercial não é conhecido. Não use outro número do catálogo para preencher essa ausência.',

    'pricing.amount_qualifier=exact significa valor definido. pricing.amount_qualifier=starting_at significa valor mínimo ou "a partir de"; nunca apresente starting_at como preço final garantido.',

    'pricing.note complementa a interpretação do preço, mas nunca substitui ou contradiz model, amount, recurrence, installment_count ou installment_amount_basis.',

    'Para produto V2, ignore base_price como fonte de significado comercial mesmo que algum dado legado o contenha.',

    'A interpretação correta pode concluir recomendar, não recomendar ou não possuir informação suficiente sobre aderência. Não force avanço, pergunta, mensagem, CRM ou Agenda apenas porque existe um produto configurado.',
  ].join('\n')
}
