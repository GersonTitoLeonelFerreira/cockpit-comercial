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
  'commercial-product-prompt-rules-v2' as const

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

  const hasSemanticV3 =
    products.some(
      product =>
        product.contract_version ===
          'commercial-product-v3' &&
        product.definition !== null,
    )

  if (
    !hasSemanticV2 &&
    !hasSemanticV3
  ) {
    return baseRules.join('\n')
  }

  const semanticRules = [
    'Quando product.contract_version for commercial-product-v2 ou commercial-product-v3, product.definition é a fonte semântica vinculante daquele produto publicado.',

    'definition.commercial_description explica comercialmente o que o produto é; não trate essa descrição como promessa de resultado.',

    'definition.recommend_when descreve condições que favorecem uma recomendação. Uma condição configurada só pode sustentar aderência quando o contexto do comprador realmente a comprovar.',

    'definition.recommend_when não transforma recomendação em obrigação automática. Mesmo quando houver correspondência, considere limitações, avoid_when e informação ainda ausente.',

    'definition.avoid_when descreve condições nas quais o produto não deve ser recomendado normalmente. Quando uma dessas condições estiver comprovada e for material para a necessidade do comprador, não declare aderência plena.',

    'Se uma limitation configurada impedir uma necessidade essencial do comprador, trate isso como conflito real de aderência; não omita a limitação nem compense com benefícios não relacionados.',

    'Se a evidência disponível não permitir verificar recommend_when, avoid_when ou uma limitação material, preserve a incerteza em vez de assumir correspondência.',
  ]

  const v2Rules =
    hasSemanticV2
      ? [
          'Para commercial-product-v2, definition.pricing é a única fonte semântica de preço. Nunca reinterprete product.base_price como preço comercial do V2.',

          'pricing.model=one_time significa pagamento único do amount configurado.',

          'pricing.model=recurring exige interpretar amount junto com pricing.recurrence. Nunca omita ou invente a periodicidade.',

          'pricing.model=installment exige interpretar amount junto com installment_count e installment_amount_basis. Não confunda valor total com valor por parcela.',

          'pricing.model=quote_required significa que o preço depende de cotação. Não invente valor numérico.',

          'pricing.model=free autoriza tratar o preço como gratuito somente para o produto cuja definição declara explicitamente esse modelo.',

          'pricing.model=unknown significa que o preço comercial não é conhecido. Não use outro número do catálogo para preencher essa ausência.',

          'pricing.amount_qualifier=exact significa valor definido. pricing.amount_qualifier=starting_at significa valor mínimo ou "a partir de"; nunca apresente starting_at como preço final garantido.',

          'pricing.note complementa a interpretação do preço, mas nunca substitui ou contradiz model, amount, recurrence, installment_count ou installment_amount_basis.',

          'Para produto V2, ignore base_price como fonte de significado comercial mesmo que algum dado legado o contenha.',
        ]
      : []

  const v3Rules =
    hasSemanticV3
      ? [
          'Em commercial-product-v3, definition.variants representa as variantes oficiais selecionáveis do mesmo produto complexo. Não invente uma variante adicional nem trate cada variante como produto independente.',

          'Nunca selecione uma variante apenas porque ela aparece primeiro, possui preço menor ou maior, ou possui estoque aparentemente disponível.',

          'A seleção de variante precisa ser sustentada por evidência do comprador e pelos campos configurados da própria variante: recommend_when, avoid_when, applications, compatibility, specifications e limitations.',

          'variant.key, variant.name, variant.sku, variant.model e variant.version identificam a variante. Esses identificadores não provam sozinhos desempenho, compatibilidade, benefício ou adequação.',

          'variant.compatibility.compatible_with declara compatibilidades configuradas, mas só sustenta a seleção quando o contexto relevante do comprador estiver comprovado.',

          'variant.compatibility.incompatible_with é conflito real quando o contexto comprovado do comprador corresponde à incompatibilidade. Não recomende essa variante como plenamente adequada nesse caso.',

          'variant.specifications contém fatos técnicos configurados. Não transforme uma especificação em benefício, superioridade ou necessidade do comprador sem evidência que conecte esses conceitos.',

          'variant.limitations são restrições vinculantes da variante e não podem ser compensadas por benefícios, preço ou estoque.',

          'Em commercial-product-v3, variant.pricing é a fonte semântica de preço daquela variante. Nunca derive o preço da variante de product.base_price, do preço de outra variante ou de qualquer número não configurado.',

          'Para variant.pricing, preserve exatamente a semântica de one_time, recurring, installment, quote_required, free, unknown, amount_qualifier, recurrence, installment_count e installment_amount_basis.',

          'variant.stock descreve disponibilidade e não aderência. Uma variante disponível não se torna adequada apenas por estar em estoque.',

          'variant.stock.status=out_of_stock significa que a variante não pode ser apresentada como atualmente disponível.',

          'variant.stock.status=backorder significa disponibilidade posterior ou condicionada; não trate como disponibilidade imediata.',

          'variant.stock.status=discontinued significa que a variante não deve ser tratada como oferta atual disponível.',

          'variant.stock.status=unknown ou variant.stock.status=not_tracked significa que a disponibilidade atual não está comprovada; nunca converta ausência de informação em estoque disponível.',

          'variant.stock.status=available ou limited só pode ser tratado como informação atual dentro da validade temporal configurada do snapshot.',

          'Se analysis_precondition.limitations contiver product_stock_information_stale, não trate estoque temporário do V3 como disponibilidade atual; preserve explicitamente a incerteza sobre estoque.',

          'Quando mais de uma variante permanecer plausível e a evidência não distinguir qual atende melhor aos critérios materiais, não escolha arbitrariamente. Preserve a incerteza até existir informação suficiente.',

          'Uma conclusão válida pode ser que nenhuma variante configurada atende ao caso atual ou que ainda não existe informação suficiente para selecionar uma variante com segurança.',
        ]
      : []

  return [
    ...baseRules,
    ...semanticRules,
    ...v2Rules,
    ...v3Rules,

    'A interpretação correta pode concluir recomendar, não recomendar ou não possuir informação suficiente sobre aderência. Não force avanço, pergunta, mensagem, CRM ou Agenda apenas porque existe um produto ou variante configurada.',
  ].join('\n')
}
