/**
 * Registro de perguntas — Capítulos 1, 2, 3 e parte do Capítulo 4 (evidência
 * de decisão, formalização, follow-up, perdas e renovação) da Jornada
 * Guiada. Opera sobre `CommercialMethodBuilderData`, a mesma estrutura já
 * persistida pelo Construtor Assistido (Fase 1/2) — por isso um rascunho
 * criado pelo formulário antigo chega aqui com várias perguntas já
 * respondidas (seção 21 — migração de draft antigo).
 *
 * "Base comercial" (seção 9, Q86-Q96) não é um capítulo separado na
 * navegação principal: essas perguntas são fatos da empresa (preço,
 * pagamento, contrato, documentos, restrições) e aparecem como uma
 * mini-trilha ao final do Capítulo 1, escritas nos mesmos campos que o
 * editor avançado já usa (`commercial_rules`). Elas nunca viram etapas do
 * método.
 */

import type {
  CommercialBuilderOfferItem,
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'
import type { GuidedQuestion } from './types'

type Data = CommercialMethodBuilderData

function withOffer(
  data: Data,
  updater: (offer: Data['company_profile']['offer']) => Data['company_profile']['offer'],
): Data {
  return {
    ...data,
    company_profile: {
      ...data.company_profile,
      offer: updater(data.company_profile.offer),
    },
  }
}

function withCustomer(
  data: Data,
  updater: (customer: Data['company_profile']['customer']) => Data['company_profile']['customer'],
): Data {
  return {
    ...data,
    company_profile: {
      ...data.company_profile,
      customer: updater(data.company_profile.customer),
    },
  }
}

function withComplexity(
  data: Data,
  updater: (complexity: Data['company_profile']['complexity']) => Data['company_profile']['complexity'],
): Data {
  return {
    ...data,
    company_profile: {
      ...data.company_profile,
      complexity: updater(data.company_profile.complexity),
    },
  }
}

function withCompanyProfile(
  data: Data,
  updater: (profile: Data['company_profile']) => Data['company_profile'],
): Data {
  return { ...data, company_profile: updater(data.company_profile) }
}

function withBuyerBehavior(
  data: Data,
  updater: (
    value: NonNullable<Data['company_profile']['buyer_behavior']>,
  ) => NonNullable<Data['company_profile']['buyer_behavior']>,
): Data {
  const current = data.company_profile.buyer_behavior
  if (!current) return data
  return withCompanyProfile(data, (profile) => ({
    ...profile,
    buyer_behavior: updater(current),
  }))
}

function withFirstOffer(
  data: Data,
  updater: (offer: CommercialBuilderOfferItem) => CommercialBuilderOfferItem,
): Data {
  const offers = data.commercial_rules.offers
  if (offers.length === 0) return data
  return {
    ...data,
    commercial_rules: {
      ...data.commercial_rules,
      offers: offers.map((offer, index) => (index === 0 ? updater(offer) : offer)),
    },
  }
}

function withPayment(
  data: Data,
  updater: (payment: Data['commercial_rules']['payment']) => Data['commercial_rules']['payment'],
): Data {
  return {
    ...data,
    commercial_rules: { ...data.commercial_rules, payment: updater(data.commercial_rules.payment) },
  }
}

function withDiscounts(
  data: Data,
  updater: (discounts: Data['commercial_rules']['discounts']) => Data['commercial_rules']['discounts'],
): Data {
  return {
    ...data,
    commercial_rules: { ...data.commercial_rules, discounts: updater(data.commercial_rules.discounts) },
  }
}

function withContracts(
  data: Data,
  updater: (contracts: Data['commercial_rules']['contracts']) => Data['commercial_rules']['contracts'],
): Data {
  return {
    ...data,
    commercial_rules: { ...data.commercial_rules, contracts: updater(data.commercial_rules.contracts) },
  }
}

function withDocumentation(
  data: Data,
  updater: (
    documentation: Data['commercial_rules']['documentation'],
  ) => Data['commercial_rules']['documentation'],
): Data {
  return {
    ...data,
    commercial_rules: {
      ...data.commercial_rules,
      documentation: updater(data.commercial_rules.documentation),
    },
  }
}

function withRestrictions(
  data: Data,
  updater: (
    restrictions: Data['commercial_rules']['restrictions'],
  ) => Data['commercial_rules']['restrictions'],
): Data {
  return {
    ...data,
    commercial_rules: {
      ...data.commercial_rules,
      restrictions: updater(data.commercial_rules.restrictions),
    },
  }
}

function withPolicies(
  data: Data,
  updater: (policies: Data['commercial_rules']['policies']) => Data['commercial_rules']['policies'],
): Data {
  return {
    ...data,
    commercial_rules: { ...data.commercial_rules, policies: updater(data.commercial_rules.policies) },
  }
}

function withLeadEntry(
  data: Data,
  updater: (
    leadEntry: Data['current_sales_process']['lead_entry'],
  ) => Data['current_sales_process']['lead_entry'],
): Data {
  return {
    ...data,
    current_sales_process: {
      ...data.current_sales_process,
      lead_entry: updater(data.current_sales_process.lead_entry),
    },
  }
}

function withDiscovery(
  data: Data,
  updater: (
    discovery: Data['current_sales_process']['discovery'],
  ) => Data['current_sales_process']['discovery'],
): Data {
  return {
    ...data,
    current_sales_process: {
      ...data.current_sales_process,
      discovery: updater(data.current_sales_process.discovery),
    },
  }
}

function withDiscoveryDepth(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['discovery_depth']>,
  ) => NonNullable<Data['current_sales_process']['discovery_depth']>,
): Data {
  const current = data.current_sales_process.discovery_depth
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, discovery_depth: updater(current) },
  }
}

function withProblemContext(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['problem_context']>,
  ) => NonNullable<Data['current_sales_process']['problem_context']>,
): Data {
  const current = data.current_sales_process.problem_context
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, problem_context: updater(current) },
  }
}

function withPresentation(
  data: Data,
  updater: (
    value: Data['current_sales_process']['presentation'],
  ) => Data['current_sales_process']['presentation'],
): Data {
  return {
    ...data,
    current_sales_process: {
      ...data.current_sales_process,
      presentation: updater(data.current_sales_process.presentation),
    },
  }
}

function withPresentationDepth(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['presentation_depth']>,
  ) => NonNullable<Data['current_sales_process']['presentation_depth']>,
): Data {
  const current = data.current_sales_process.presentation_depth
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, presentation_depth: updater(current) },
  }
}

function withCommercial(
  data: Data,
  updater: (
    value: Data['current_sales_process']['commercial'],
  ) => Data['current_sales_process']['commercial'],
): Data {
  return {
    ...data,
    current_sales_process: {
      ...data.current_sales_process,
      commercial: updater(data.current_sales_process.commercial),
    },
  }
}

function withPricingFlow(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['pricing_flow']>,
  ) => NonNullable<Data['current_sales_process']['pricing_flow']>,
): Data {
  const current = data.current_sales_process.pricing_flow
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, pricing_flow: updater(current) },
  }
}

function withObjections(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['objections']>,
  ) => NonNullable<Data['current_sales_process']['objections']>,
): Data {
  const current = data.current_sales_process.objections
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, objections: updater(current) },
  }
}

function withClosing(
  data: Data,
  updater: (value: Data['current_sales_process']['closing']) => Data['current_sales_process']['closing'],
): Data {
  return {
    ...data,
    current_sales_process: {
      ...data.current_sales_process,
      closing: updater(data.current_sales_process.closing),
    },
  }
}

function withDecisionEvidence(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['decision_evidence']>,
  ) => NonNullable<Data['current_sales_process']['decision_evidence']>,
): Data {
  const current = data.current_sales_process.decision_evidence
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, decision_evidence: updater(current) },
  }
}

function withFormalization(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['formalization']>,
  ) => NonNullable<Data['current_sales_process']['formalization']>,
): Data {
  const current = data.current_sales_process.formalization
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, formalization: updater(current) },
  }
}

function withFollowUp(
  data: Data,
  updater: (value: Data['current_sales_process']['follow_up']) => Data['current_sales_process']['follow_up'],
): Data {
  return {
    ...data,
    current_sales_process: {
      ...data.current_sales_process,
      follow_up: updater(data.current_sales_process.follow_up),
    },
  }
}

function withRenewal(
  data: Data,
  updater: (
    value: NonNullable<Data['current_sales_process']['renewal']>,
  ) => NonNullable<Data['current_sales_process']['renewal']>,
): Data {
  const current = data.current_sales_process.renewal
  if (!current) return data
  return {
    ...data,
    current_sales_process: { ...data.current_sales_process, renewal: updater(current) },
  }
}

function withCurrentSalesProcess(
  data: Data,
  updater: (value: Data['current_sales_process']) => Data['current_sales_process'],
): Data {
  return { ...data, current_sales_process: updater(data.current_sales_process) }
}

const isB2B = (data: Data) =>
  data.company_profile.customer.buyer_type === 'company' ||
  data.company_profile.customer.buyer_type === 'both'

const isLongerSale = (data: Data) =>
  ['weeks', 'months', 'varies'].includes(data.company_profile.complexity.typical_timing)

const isFewComplex = (data: Data) =>
  data.company_profile.buyer_behavior?.workload_pattern === 'few_complex'

export const DIAGNOSIS_QUESTIONS: GuidedQuestion<Data>[] = [
  // ── CAPÍTULO 1 — Conhecendo sua empresa ────────────────────────────────
  {
    id: 'Q01',
    chapterId: 'company',
    title: 'O que sua empresa vende?',
    whyItMatters: 'Isso ajuda a Yolen a entender o formato geral do seu negócio antes de entrar em detalhes.',
    answerType: 'single_choice',
    options: [
      { value: 'product', label: 'Produtos' },
      { value: 'service', label: 'Serviços' },
      { value: 'both', label: 'Produtos e serviços' },
    ],
    getValue: (data) => data.company_profile.offer.type,
    setValue: (data, value) => withOffer(data, (offer) => ({ ...offer, type: value as typeof offer.type })),
    writesTo: 'company_profile.offer.type',
  },
  {
    id: 'Q02',
    chapterId: 'company',
    title: 'Quais são as principais coisas que um cliente pode comprar ou contratar?',
    helper: 'Comece pelas ofertas que mais aparecem no seu comercial. Você poderá editar depois.',
    example: 'Plano mensal, Consultoria avulsa',
    answerType: 'multiline_list',
    getValue: (data) => data.company_profile.offer.main_offerings,
    setValue: (data, value) => withOffer(data, (offer) => ({ ...offer, main_offerings: value as string[] })),
    writesTo: 'company_profile.offer.main_offerings',
  },
  {
    id: 'Q03',
    chapterId: 'company',
    title: 'Essas opções são praticamente iguais para todos ou mudam conforme cada cliente?',
    whyItMatters: 'Ofertas muito personalizadas normalmente exigem mais descoberta antes de apresentar preço.',
    answerType: 'single_choice',
    options: [
      { value: 'standard', label: 'Praticamente iguais' },
      { value: 'some_adjustments', label: 'Alguns ajustes' },
      { value: 'highly_customized', label: 'Muito personalizadas' },
    ],
    getValue: (data) => data.company_profile.offer.customization_depth,
    setValue: (data, value) =>
      withOffer(data, (offer) => ({ ...offer, customization_depth: value as typeof offer.customization_depth })),
    activatesPrinciples: ['customization_depth'],
    writesTo: 'company_profile.offer.customization_depth',
  },
  {
    id: 'Q04',
    chapterId: 'company',
    title: 'O cliente normalmente compra uma vez ou continua pagando/renovando?',
    answerType: 'single_choice',
    options: [
      { value: 'one_time', label: 'Compra única' },
      { value: 'recurring', label: 'Recorrente' },
      { value: 'both', label: 'Os dois' },
    ],
    getValue: (data) => data.company_profile.offer.purchase_frequency,
    setValue: (data, value) =>
      withOffer(data, (offer) => ({ ...offer, purchase_frequency: value as typeof offer.purchase_frequency })),
    writesTo: 'company_profile.offer.purchase_frequency',
  },
  {
    id: 'Q05',
    chapterId: 'company',
    title: 'Existem planos, pacotes ou versões diferentes da oferta?',
    answerType: 'yes_no',
    getValue: (data) => data.company_profile.offer.has_plans_or_packages,
    setValue: (data, value) => withOffer(data, (offer) => ({ ...offer, has_plans_or_packages: value as boolean })),
    writesTo: 'company_profile.offer.has_plans_or_packages',
  },
  {
    id: 'Q06',
    chapterId: 'company',
    title: 'O que normalmente muda entre essas opções?',
    answerType: 'multiple_choice',
    options: [
      { value: 'price', label: 'Preço' },
      { value: 'benefits', label: 'Benefícios' },
      { value: 'quantity', label: 'Quantidade' },
      { value: 'term', label: 'Prazo' },
      { value: 'access', label: 'Acesso' },
      { value: 'service_level', label: 'Nível de serviço' },
      { value: 'other', label: 'Outro' },
    ],
    showWhen: (data) => data.company_profile.offer.has_plans_or_packages === true,
    getValue: (data) => data.company_profile.offer.plan_variation_dimensions,
    setValue: (data, value) =>
      withOffer(data, (offer) => ({ ...offer, plan_variation_dimensions: value as string[] })),
    writesTo: 'company_profile.offer.plan_variation_dimensions',
  },

  // ── CAPÍTULO 2 — Como seus clientes compram ─────────────────────────────
  {
    id: 'Q07',
    chapterId: 'buyers',
    title: 'Quem normalmente compra de vocês?',
    answerType: 'single_choice',
    options: [
      { value: 'person', label: 'Pessoa física' },
      { value: 'company', label: 'Empresa' },
      { value: 'both', label: 'Ambos' },
    ],
    getValue: (data) => data.company_profile.customer.buyer_type,
    setValue: (data, value) =>
      withCustomer(data, (customer) => ({ ...customer, buyer_type: value as typeof customer.buyer_type })),
    writesTo: 'company_profile.customer.buyer_type',
  },
  {
    id: 'Q08',
    chapterId: 'buyers',
    title: 'Existe mais de um tipo importante de cliente?',
    answerType: 'yes_no',
    getValue: (data) => data.company_profile.buyer_behavior?.has_multiple_customer_types ?? null,
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({ ...buyer, has_multiple_customer_types: value as boolean })),
    writesTo: 'company_profile.buyer_behavior.has_multiple_customer_types',
  },
  {
    id: 'Q09',
    chapterId: 'buyers',
    title: 'Quais tipos de cliente aparecem com mais frequência?',
    answerType: 'multiline_list',
    showWhen: (data) => data.company_profile.buyer_behavior?.has_multiple_customer_types === true,
    getValue: (data) => data.company_profile.customer.priority_segments,
    setValue: (data, value) =>
      withCustomer(data, (customer) => ({ ...customer, priority_segments: value as string[] })),
    writesTo: 'company_profile.customer.priority_segments',
  },
  {
    id: 'Q10',
    chapterId: 'buyers',
    title: 'Tipos diferentes de cliente normalmente precisam de abordagens diferentes?',
    answerType: 'single_choice',
    options: [
      { value: 'rarely', label: 'Quase nunca' },
      { value: 'sometimes', label: 'Às vezes' },
      { value: 'often', label: 'Frequentemente' },
    ],
    showWhen: (data) => data.company_profile.buyer_behavior?.has_multiple_customer_types === true,
    getValue: (data) => data.company_profile.buyer_behavior?.types_need_different_approach ?? '',
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({
        ...buyer,
        types_need_different_approach: value as typeof buyer.types_need_different_approach,
      })),
    writesTo: 'company_profile.buyer_behavior.types_need_different_approach',
  },
  {
    id: 'Q11',
    chapterId: 'buyers',
    title: 'Quem conversa com o vendedor normalmente também decide a compra?',
    answerType: 'yes_no_sometimes',
    getValue: (data) => data.company_profile.buyer_behavior?.contact_is_decision_maker ?? '',
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({
        ...buyer,
        contact_is_decision_maker: value as typeof buyer.contact_is_decision_maker,
      })),
    activatesPrinciples: ['single_decision_maker'],
    writesTo: 'company_profile.buyer_behavior.contact_is_decision_maker',
  },
  {
    id: 'Q12',
    chapterId: 'buyers',
    title: 'Quanto tempo normalmente passa entre o primeiro contato e a decisão?',
    answerType: 'single_choice',
    options: [
      { value: 'first_contact', label: 'No mesmo atendimento' },
      { value: 'days', label: 'Alguns dias' },
      { value: 'weeks', label: 'Algumas semanas' },
      { value: 'months', label: 'Meses' },
      { value: 'varies', label: 'Varia muito' },
    ],
    getValue: (data) => data.company_profile.complexity.typical_timing,
    setValue: (data, value) =>
      withComplexity(data, (complexity) => ({
        ...complexity,
        typical_timing: value as typeof complexity.typical_timing,
      })),
    activatesPrinciples: ['longer_sale'],
    writesTo: 'company_profile.complexity.typical_timing',
  },
  {
    id: 'Q13',
    chapterId: 'buyers',
    title: 'A maior parte das vendas fecha no primeiro atendimento?',
    answerType: 'yes_no',
    getValue: (data) => data.company_profile.buyer_behavior?.closes_on_first_contact ?? null,
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({ ...buyer, closes_on_first_contact: value as boolean })),
    writesTo: 'company_profile.buyer_behavior.closes_on_first_contact',
  },
  {
    id: 'Q14',
    chapterId: 'buyers',
    title: 'Como é o volume de trabalho da equipe?',
    answerType: 'single_choice',
    options: [
      { value: 'high_volume_short', label: 'Muitas vendas curtas por dia' },
      { value: 'balanced', label: 'Equilibrado' },
      { value: 'few_complex', label: 'Poucas oportunidades, mas mais complexas' },
    ],
    getValue: (data) => data.company_profile.buyer_behavior?.workload_pattern ?? '',
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({ ...buyer, workload_pattern: value as typeof buyer.workload_pattern })),
    writesTo: 'company_profile.buyer_behavior.workload_pattern',
  },
  {
    id: 'Q15',
    chapterId: 'buyers',
    title: 'É comum precisar conversar várias vezes antes da decisão?',
    answerType: 'single_choice',
    options: [
      { value: 'rarely', label: 'Raramente' },
      { value: 'sometimes', label: 'Às vezes' },
      { value: 'often', label: 'Frequentemente' },
    ],
    getValue: (data) => data.company_profile.buyer_behavior?.needs_multiple_conversations ?? '',
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({
        ...buyer,
        needs_multiple_conversations: value as typeof buyer.needs_multiple_conversations,
      })),
    writesTo: 'company_profile.buyer_behavior.needs_multiple_conversations',
  },
  {
    id: 'Q16',
    chapterId: 'buyers',
    title: 'Por onde normalmente chegam novas oportunidades ou pessoas interessadas?',
    answerType: 'multiple_choice',
    options: [
      { value: 'WhatsApp', label: 'WhatsApp' },
      { value: 'Telefone', label: 'Telefone' },
      { value: 'Presencial', label: 'Presencial' },
      { value: 'Site', label: 'Site' },
      { value: 'Instagram/redes sociais', label: 'Instagram/redes sociais' },
      { value: 'Indicação', label: 'Indicação' },
      { value: 'Prospecção ativa', label: 'Prospecção ativa' },
      { value: 'Parceiros', label: 'Parceiros' },
    ],
    getValue: (data) => data.company_profile.channels,
    setValue: (data, value) => withCompanyProfile(data, (profile) => ({ ...profile, channels: value as string[] })),
    writesTo: 'company_profile.channels',
  },
  {
    id: 'Q16b',
    chapterId: 'buyers',
    title: 'Existe algum outro canal importante que não apareceu na lista?',
    answerType: 'multiline_list',
    getValue: (data) => data.company_profile.other_channels,
    setValue: (data, value) =>
      withCompanyProfile(data, (profile) => ({ ...profile, other_channels: value as string[] })),
    writesTo: 'company_profile.other_channels',
  },
  {
    id: 'Q17',
    chapterId: 'buyers',
    title: 'Quem normalmente inicia o contato?',
    answerType: 'single_choice',
    options: [
      { value: 'customer', label: 'O cliente' },
      { value: 'seller', label: 'O vendedor' },
      { value: 'both', label: 'Os dois' },
    ],
    getValue: (data) => data.company_profile.buyer_behavior?.initiator ?? '',
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({ ...buyer, initiator: value as typeof buyer.initiator })),
    writesTo: 'company_profile.buyer_behavior.initiator',
  },
  {
    id: 'Q18',
    chapterId: 'buyers',
    title: 'O cliente normalmente já chega procurando um produto ou serviço específico?',
    answerType: 'yes_no_sometimes',
    getValue: (data) => data.company_profile.buyer_behavior?.arrives_knowing_specific_offer ?? '',
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({
        ...buyer,
        arrives_knowing_specific_offer: value as typeof buyer.arrives_knowing_specific_offer,
      })),
    writesTo: 'company_profile.buyer_behavior.arrives_knowing_specific_offer',
  },
  {
    id: 'Q19',
    chapterId: 'buyers',
    title: 'Ele normalmente já sabe qual problema ou resultado quer resolver?',
    helper: 'Isso é diferente da pergunta anterior: aqui é sobre entender o problema, não sobre já saber qual produto quer.',
    answerType: 'yes_no_sometimes',
    getValue: (data) => data.company_profile.buyer_behavior?.arrives_knowing_problem ?? '',
    setValue: (data, value) =>
      withBuyerBehavior(data, (buyer) => ({
        ...buyer,
        arrives_knowing_problem: value as typeof buyer.arrives_knowing_problem,
      })),
    writesTo: 'company_profile.buyer_behavior.arrives_knowing_problem',
  },

  // ── CAPÍTULO 3 — Como sua equipe vende hoje ─────────────────────────────
  {
    id: 'Q20',
    chapterId: 'sales_today',
    title: 'Para indicar a melhor opção, o vendedor precisa entender algo sobre o cliente antes?',
    answerType: 'yes_no_sometimes',
    getValue: (data) => data.current_sales_process.discovery_depth?.needs_understanding_before_recommending ?? null,
    setValue: (data, value) => {
      const mapped = value === 'yes' ? true : value === 'no' ? false : null
      return withDiscoveryDepth(data, (depth) => ({ ...depth, needs_understanding_before_recommending: mapped }))
    },
    activatesPrinciples: ['discovery_required'],
    writesTo: 'current_sales_process.discovery_depth.needs_understanding_before_recommending',
  },
  {
    id: 'Q21',
    chapterId: 'sales_today',
    title: 'O que o vendedor precisa entender para não indicar a solução errada?',
    answerType: 'multiline_list',
    showWhen: (data) => data.current_sales_process.discovery_depth?.needs_understanding_before_recommending !== false,
    getValue: (data) => data.current_sales_process.discovery.needs_to_discover,
    setValue: (data, value) => withDiscovery(data, (discovery) => ({ ...discovery, needs_to_discover: value as string[] })),
    writesTo: 'current_sales_process.discovery.needs_to_discover',
  },
  {
    id: 'Q22',
    chapterId: 'sales_today',
    title: 'Quais dessas informações podem mudar qual produto, plano ou solução será recomendado?',
    answerType: 'multiline_list',
    showWhen: (data) => data.current_sales_process.discovery.needs_to_discover.length > 0,
    getValue: (data) => data.current_sales_process.discovery_depth?.changes_recommendation ?? [],
    setValue: (data, value) => withDiscoveryDepth(data, (depth) => ({ ...depth, changes_recommendation: value as string[] })),
    writesTo: 'current_sales_process.discovery_depth.changes_recommendation',
  },
  {
    id: 'Q23',
    chapterId: 'sales_today',
    title: 'Sem qual informação o vendedor não deveria avançar?',
    helper: 'Essa resposta vira critério mínimo do seu método.',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.discovery.indispensable_information,
    setValue: (data, value) =>
      withDiscovery(data, (discovery) => ({ ...discovery, indispensable_information: value as string[] })),
    writesTo: 'current_sales_process.discovery.indispensable_information',
  },
  {
    id: 'Q24',
    chapterId: 'sales_today',
    title: 'Existe informação útil, mas que não precisa ser conhecida em toda venda?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.discovery_depth?.has_nice_to_have_info ?? null,
    setValue: (data, value) => withDiscoveryDepth(data, (depth) => ({ ...depth, has_nice_to_have_info: value as boolean })),
    writesTo: 'current_sales_process.discovery_depth.has_nice_to_have_info',
  },
  {
    id: 'Q24b',
    chapterId: 'sales_today',
    title: 'Quais informações são úteis, mas opcionais?',
    answerType: 'multiline_list',
    showWhen: (data) => data.current_sales_process.discovery_depth?.has_nice_to_have_info === true,
    getValue: (data) => data.current_sales_process.discovery_depth?.nice_to_have_info ?? [],
    setValue: (data, value) => withDiscoveryDepth(data, (depth) => ({ ...depth, nice_to_have_info: value as string[] })),
    writesTo: 'current_sales_process.discovery_depth.nice_to_have_info',
  },
  {
    id: 'Q25',
    chapterId: 'sales_today',
    title: 'Fazer perguntas demais pode prejudicar seu atendimento?',
    answerType: 'yes_no_sometimes',
    getValue: (data) => data.current_sales_process.discovery_depth?.too_many_questions_hurts ?? '',
    setValue: (data, value) =>
      withDiscoveryDepth(data, (depth) => ({
        ...depth,
        too_many_questions_hurts: value as typeof depth.too_many_questions_hurts,
      })),
    writesTo: 'current_sales_process.discovery_depth.too_many_questions_hurts',
  },
  {
    id: 'Q26',
    chapterId: 'sales_today',
    title: 'Quando o vendedor já sabe o suficiente e deveria parar de investigar?',
    answerType: 'long_text',
    showWhen: (data) => {
      const value = data.current_sales_process.discovery_depth?.too_many_questions_hurts
      return value === 'yes' || value === 'sometimes'
    },
    getValue: (data) => data.current_sales_process.discovery_depth?.stop_asking_when ?? '',
    setValue: (data, value) => withDiscoveryDepth(data, (depth) => ({ ...depth, stop_asking_when: value as string })),
    activatesPrinciples: ['interrogation_guard'],
    writesTo: 'current_sales_process.discovery_depth.stop_asking_when',
  },
  {
    id: 'Q27',
    chapterId: 'sales_today',
    title: 'Para vender bem, é importante entender o objetivo que o cliente quer alcançar?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.problem_context?.objective_matters ?? null,
    setValue: (data, value) => withProblemContext(data, (ctx) => ({ ...ctx, objective_matters: value as boolean })),
    activatesPrinciples: ['objective_driven'],
    writesTo: 'current_sales_process.problem_context.objective_matters',
  },
  {
    id: 'Q28',
    chapterId: 'sales_today',
    title: 'É importante entender o problema ou situação atual dele?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.problem_context?.problem_matters ?? null,
    setValue: (data, value) => withProblemContext(data, (ctx) => ({ ...ctx, problem_matters: value as boolean })),
    writesTo: 'current_sales_process.problem_context.problem_matters',
  },
  {
    id: 'Q29',
    chapterId: 'sales_today',
    title: 'Também é importante entender por que esse problema realmente importa?',
    answerType: 'yes_no',
    showWhen: (data) => data.current_sales_process.problem_context?.problem_matters === true,
    getValue: (data) => data.current_sales_process.problem_context?.problem_importance_matters ?? null,
    setValue: (data, value) =>
      withProblemContext(data, (ctx) => ({ ...ctx, problem_importance_matters: value as boolean })),
    writesTo: 'current_sales_process.problem_context.problem_importance_matters',
  },
  {
    id: 'Q30',
    chapterId: 'sales_today',
    title: 'O que pode acontecer se o cliente não resolver essa situação costuma influenciar a decisão?',
    answerType: 'yes_no',
    showWhen: (data) => isLongerSale(data) || isFewComplex(data),
    getValue: (data) => data.current_sales_process.problem_context?.consequence_influences_decision ?? null,
    setValue: (data, value) =>
      withProblemContext(data, (ctx) => ({ ...ctx, consequence_influences_decision: value as boolean })),
    writesTo: 'current_sales_process.problem_context.consequence_influences_decision',
  },
  {
    id: 'Q31',
    chapterId: 'sales_today',
    title: 'O cliente precisa visualizar um resultado futuro para perceber valor?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.problem_context?.needs_future_vision ?? null,
    setValue: (data, value) => withProblemContext(data, (ctx) => ({ ...ctx, needs_future_vision: value as boolean })),
    writesTo: 'current_sales_process.problem_context.needs_future_vision',
  },
  {
    id: 'Q32',
    chapterId: 'sales_today',
    title: 'Antes da decisão, costuma acontecer alguma destas coisas?',
    answerType: 'multiple_choice',
    options: [
      { value: 'Tour', label: 'Tour' },
      { value: 'Demonstração', label: 'Demonstração' },
      { value: 'Teste', label: 'Teste' },
      { value: 'Diagnóstico', label: 'Diagnóstico' },
      { value: 'Avaliação', label: 'Avaliação' },
      { value: 'Reunião', label: 'Reunião' },
      { value: 'Proposta', label: 'Proposta' },
      { value: 'Orçamento', label: 'Orçamento' },
    ],
    getValue: (data) => data.company_profile.complexity.sales_events,
    setValue: (data, value) =>
      withComplexity(data, (complexity) => ({ ...complexity, sales_events: value as string[] })),
    writesTo: 'company_profile.complexity.sales_events',
  },
  {
    id: 'Q33_36',
    chapterId: 'sales_today',
    title: 'Vamos detalhar cada um desses momentos',
    helper:
      'Para cada momento marcado: ele acontece em toda venda, o que precisa acontecer para realmente ajudar a avançar, e se ele muda conforme o que já sabemos sobre o cliente.',
    answerType: 'compound_event_list',
    showWhen: (data) => data.company_profile.complexity.sales_events.length > 0,
    getValue: (data) => {
      const events = data.company_profile.complexity.sales_events
      const existing = data.current_sales_process.sales_events_detail ?? []
      return events.map(
        (event) =>
          existing.find((item) => item.event === event) ?? {
            event,
            frequency: '',
            success_definition: '',
            depends_on_customer_knowledge: '',
          },
      )
    },
    setValue: (data, value) =>
      withCurrentSalesProcess(data, (process) => ({
        ...process,
        sales_events_detail: value as Data['current_sales_process']['sales_events_detail'],
      })),
    isAnswered: (data) => {
      const events = data.company_profile.complexity.sales_events
      if (events.length === 0) return false
      const existing = data.current_sales_process.sales_events_detail ?? []
      return events.every((event) => {
        const detail = existing.find((item) => item.event === event)
        return Boolean(detail?.frequency)
      })
    },
    writesTo: 'current_sales_process.sales_events_detail',
  },
  {
    id: 'Q37',
    chapterId: 'sales_today',
    title: 'O vendedor normalmente apresenta a mesma opção para todos ou adapta a apresentação?',
    answerType: 'single_choice',
    options: [
      { value: 'standard', label: 'Quase igual' },
      { value: 'some_adjustments', label: 'Alguns ajustes' },
      { value: 'highly_customized', label: 'Muito personalizada' },
    ],
    getValue: (data) => data.current_sales_process.presentation_depth?.style ?? '',
    setValue: (data, value) =>
      withPresentationDepth(data, (depth) => ({ ...depth, style: value as typeof depth.style })),
    writesTo: 'current_sales_process.presentation_depth.style',
  },
  {
    id: 'Q38',
    chapterId: 'sales_today',
    title: 'O que precisa estar claro antes de apresentar uma solução?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.presentation_depth?.must_be_clear_before ?? [],
    setValue: (data, value) =>
      withPresentationDepth(data, (depth) => ({ ...depth, must_be_clear_before: value as string[] })),
    writesTo: 'current_sales_process.presentation_depth.must_be_clear_before',
  },
  {
    id: 'Q39',
    chapterId: 'sales_today',
    title: 'O que uma boa apresentação precisa deixar claro para o cliente?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.presentation_depth?.must_be_clear_to_customer ?? [],
    setValue: (data, value) =>
      withPresentationDepth(data, (depth) => ({ ...depth, must_be_clear_to_customer: value as string[] })),
    writesTo: 'current_sales_process.presentation_depth.must_be_clear_to_customer',
  },
  {
    id: 'Q40',
    chapterId: 'sales_today',
    title: 'Existe algo que sua equipe costuma apresentar cedo demais?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.presentation_depth?.presented_too_early ?? [],
    setValue: (data, value) =>
      withPresentationDepth(data, (depth) => ({ ...depth, presented_too_early: value as string[] })),
    writesTo: 'current_sales_process.presentation_depth.presented_too_early',
  },
  {
    id: 'Q41',
    chapterId: 'sales_today',
    title: 'Existe algo que a equipe costuma explicar demais mesmo quando não é necessário?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.presentation_depth?.over_explained ?? [],
    setValue: (data, value) =>
      withPresentationDepth(data, (depth) => ({ ...depth, over_explained: value as string[] })),
    writesTo: 'current_sales_process.presentation_depth.over_explained',
  },
  {
    id: 'Q42',
    chapterId: 'sales_today',
    title: 'Quando o preço normalmente é apresentado?',
    answerType: 'single_choice',
    options: [
      { value: 'early', label: 'Logo no começo' },
      { value: 'after_understanding', label: 'Depois de entender o cliente' },
      { value: 'after_demo', label: 'Depois de tour/demo/apresentação' },
      { value: 'in_proposal', label: 'Em proposta/orçamento' },
      { value: 'varies', label: 'Varia' },
    ],
    getValue: (data) => data.current_sales_process.pricing_flow?.timing ?? '',
    setValue: (data, value) => withPricingFlow(data, (flow) => ({ ...flow, timing: value as typeof flow.timing })),
    writesTo: 'current_sales_process.pricing_flow.timing',
  },
  {
    id: 'Q43',
    chapterId: 'sales_today',
    title: 'O preço é praticamente fixo ou depende do cliente?',
    answerType: 'single_choice',
    options: [
      { value: 'fixed', label: 'Fixo' },
      { value: 'ranges', label: 'Faixas' },
      { value: 'personalized', label: 'Personalizado' },
    ],
    getValue: (data) => data.current_sales_process.pricing_flow?.model ?? '',
    setValue: (data, value) => withPricingFlow(data, (flow) => ({ ...flow, model: value as typeof flow.model })),
    writesTo: 'current_sales_process.pricing_flow.model',
  },
  {
    id: 'Q44',
    chapterId: 'sales_today',
    title: 'Existe informação que precisa ser conhecida antes de calcular ou apresentar o preço?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.pricing_flow?.needed_before_pricing ?? [],
    setValue: (data, value) =>
      withPricingFlow(data, (flow) => ({ ...flow, needed_before_pricing: value as string[] })),
    writesTo: 'current_sales_process.pricing_flow.needed_before_pricing',
  },
  {
    id: 'Q45',
    chapterId: 'sales_today',
    title: 'Mostrar preço cedo demais costuma prejudicar a venda?',
    answerType: 'yes_no_sometimes',
    getValue: (data) => data.current_sales_process.pricing_flow?.early_price_hurts ?? '',
    setValue: (data, value) =>
      withPricingFlow(data, (flow) => ({ ...flow, early_price_hurts: value as typeof flow.early_price_hurts })),
    writesTo: 'current_sales_process.pricing_flow.early_price_hurts',
  },
  {
    id: 'Q46',
    chapterId: 'sales_today',
    title: 'O vendedor pode alterar preço ou condição?',
    answerType: 'single_choice',
    options: [
      { value: 'no', label: 'Não' },
      { value: 'with_limit', label: 'Dentro de um limite' },
      { value: 'with_approval', label: 'Somente com aprovação' },
    ],
    getValue: (data) => data.current_sales_process.pricing_flow?.seller_can_change_price ?? '',
    setValue: (data, value) =>
      withPricingFlow(data, (flow) => ({
        ...flow,
        seller_can_change_price: value as typeof flow.seller_can_change_price,
      })),
    writesTo: 'current_sales_process.pricing_flow.seller_can_change_price',
  },
  {
    id: 'Q47',
    chapterId: 'sales_today',
    title: 'Qual é a regra?',
    helper: 'Isso será registrado como regra comercial, não como etapa do método.',
    answerType: 'long_text',
    showWhen: (data) => data.current_sales_process.pricing_flow?.seller_can_change_price !== 'no',
    getValue: (data) => data.current_sales_process.pricing_flow?.change_rule ?? '',
    setValue: (data, value) => withPricingFlow(data, (flow) => ({ ...flow, change_rule: value as string })),
    writesTo: 'current_sales_process.pricing_flow.change_rule',
  },
  {
    id: 'Q48',
    chapterId: 'sales_today',
    title: 'Quais dúvidas aparecem com frequência?',
    helper: 'Dúvida: falta uma informação. Objeção: existe algo impedindo ou atrasando a decisão.',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.objections?.common_doubts ?? [],
    setValue: (data, value) => withObjections(data, (obj) => ({ ...obj, common_doubts: value as string[] })),
    writesTo: 'current_sales_process.objections.common_doubts',
  },
  {
    id: 'Q49',
    chapterId: 'sales_today',
    title: 'Quais objeções realmente impedem ou atrasam a compra?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.objections?.blocking_objections ?? [],
    setValue: (data, value) => withObjections(data, (obj) => ({ ...obj, blocking_objections: value as string[] })),
    writesTo: 'current_sales_process.objections.blocking_objections',
  },
  {
    id: 'Q50',
    chapterId: 'sales_today',
    title: 'Antes de responder uma objeção, o vendedor geralmente precisa entender melhor o motivo dela?',
    answerType: 'yes_no_sometimes',
    getValue: (data) => data.current_sales_process.objections?.needs_understanding_before_response ?? '',
    setValue: (data, value) =>
      withObjections(data, (obj) => ({
        ...obj,
        needs_understanding_before_response: value as typeof obj.needs_understanding_before_response,
      })),
    writesTo: 'current_sales_process.objections.needs_understanding_before_response',
  },
  {
    id: 'Q51',
    chapterId: 'sales_today',
    title: 'Existem objeções que podem mostrar que sua solução realmente não é adequada?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.objections?.disqualifying_objections ?? [],
    setValue: (data, value) =>
      withObjections(data, (obj) => ({ ...obj, disqualifying_objections: value as string[] })),
    writesTo: 'current_sales_process.objections.disqualifying_objections',
  },
  {
    id: 'Q52',
    chapterId: 'sales_today',
    title: 'Quando o vendedor deveria parar de tentar convencer porque não existe um bom encaixe?',
    answerType: 'long_text',
    getValue: (data) => data.current_sales_process.objections?.stop_convincing_when ?? '',
    setValue: (data, value) => withObjections(data, (obj) => ({ ...obj, stop_convincing_when: value as string })),
    writesTo: 'current_sales_process.objections.stop_convincing_when',
  },

  // ── CAPÍTULO 4 (parte diagnóstico) — decisão, formalização, follow-up, perdas, renovação ──
  {
    id: 'Q63',
    chapterId: 'decision',
    title: 'Qual fato mostra que o cliente realmente decidiu comprar?',
    helper: 'Descreva uma ação ou confirmação do lado do cliente, não uma ação do vendedor.',
    answerType: 'short_text',
    getValue: (data) => data.current_sales_process.decision_evidence?.real_decision_fact ?? '',
    setValue: (data, value) =>
      withDecisionEvidence(data, (evidence) => ({ ...evidence, real_decision_fact: value as string })),
    microfeedback: (data) => {
      const text = (data.current_sales_process.decision_evidence?.real_decision_fact ?? '').toLowerCase()
      if (/enviei proposta|mandei proposta|enviamos a proposta/.test(text)) {
        return 'Essa é uma ação do vendedor. O que aconteceu do lado do cliente para demonstrar que a decisão avançou?'
      }
      return null
    },
    writesTo: 'current_sales_process.decision_evidence.real_decision_fact',
  },
  {
    id: 'Q64',
    chapterId: 'decision',
    title: 'Antes da compra definitiva, o cliente costuma assumir algum compromisso?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.decision_evidence?.assumed_commitment ?? null,
    setValue: (data, value) =>
      withDecisionEvidence(data, (evidence) => ({ ...evidence, assumed_commitment: value as boolean })),
    writesTo: 'current_sales_process.decision_evidence.assumed_commitment',
  },
  {
    id: 'Q65',
    chapterId: 'decision',
    title: 'Qual?',
    answerType: 'short_text',
    showWhen: (data) => data.current_sales_process.decision_evidence?.assumed_commitment === true,
    getValue: (data) => data.current_sales_process.decision_evidence?.commitment_description ?? '',
    setValue: (data, value) =>
      withDecisionEvidence(data, (evidence) => ({ ...evidence, commitment_description: value as string })),
    writesTo: 'current_sales_process.decision_evidence.commitment_description',
  },
  {
    id: 'Q66',
    chapterId: 'decision',
    title: 'É comum sua equipe considerar uma venda avançada mesmo sem nenhum compromisso real do cliente?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.decision_evidence?.team_advances_without_commitment ?? null,
    setValue: (data, value) =>
      withDecisionEvidence(data, (evidence) => ({
        ...evidence,
        team_advances_without_commitment: value as boolean,
      })),
    microfeedback: (data) =>
      data.current_sales_process.decision_evidence?.team_advances_without_commitment === true
        ? 'Isso é um alerta de processo: tratar atividade do vendedor como avanço real pode distorcer previsões e cobrança da equipe.'
        : null,
    writesTo: 'current_sales_process.decision_evidence.team_advances_without_commitment',
  },
  {
    id: 'Q67',
    chapterId: 'decision',
    title: 'Depois que o cliente decidiu comprar, o que ainda precisa acontecer para formalizar?',
    answerType: 'multiple_choice',
    options: [
      { value: 'Pagamento', label: 'Pagamento' },
      { value: 'Contrato', label: 'Contrato' },
      { value: 'Assinatura', label: 'Assinatura' },
      { value: 'Cadastro', label: 'Cadastro' },
      { value: 'Matrícula', label: 'Matrícula' },
      { value: 'Documentos', label: 'Documentos' },
      { value: 'Aprovação', label: 'Aprovação' },
    ],
    getValue: (data) => data.current_sales_process.formalization?.steps ?? [],
    setValue: (data, value) => withFormalization(data, (formalization) => ({ ...formalization, steps: value as string[] })),
    writesTo: 'current_sales_process.formalization.steps',
  },
  {
    id: 'Q68',
    chapterId: 'decision',
    title: 'Alguma dessas etapas ainda pode fazer a venda voltar atrás?',
    answerType: 'yes_no',
    showWhen: (data) => (data.current_sales_process.formalization?.steps.length ?? 0) > 0,
    getValue: (data) => data.current_sales_process.formalization?.can_reverse ?? null,
    setValue: (data, value) => withFormalization(data, (formalization) => ({ ...formalization, can_reverse: value as boolean })),
    writesTo: 'current_sales_process.formalization.can_reverse',
  },
  {
    id: 'Q69',
    chapterId: 'decision',
    title: 'Existe alguma aprovação operacional depois da decisão?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.formalization?.operational_approval_after_decision ?? null,
    setValue: (data, value) =>
      withFormalization(data, (formalization) => ({
        ...formalization,
        operational_approval_after_decision: value as boolean,
      })),
    writesTo: 'current_sales_process.formalization.operational_approval_after_decision',
  },
  {
    id: 'Q70',
    chapterId: 'decision',
    title: 'Em qual momento você considera a venda realmente concluída?',
    helper: 'Pense separadamente em decisão, formalização e registro administrativo.',
    answerType: 'long_text',
    getValue: (data) => data.current_sales_process.formalization?.sale_completed_when ?? '',
    setValue: (data, value) =>
      withFormalization(data, (formalization) => ({ ...formalization, sale_completed_when: value as string })),
    writesTo: 'current_sales_process.formalization.sale_completed_when',
  },
  {
    id: 'Q71',
    chapterId: 'decision',
    title: 'Quando o cliente não decide no primeiro contato, sua equipe faz acompanhamento?',
    answerType: 'yes_no',
    getValue: (data) => data.current_sales_process.follow_up.happens,
    setValue: (data, value) => withFollowUp(data, (followUp) => ({ ...followUp, happens: value as boolean })),
    writesTo: 'current_sales_process.follow_up.happens',
  },
  {
    id: 'Q72',
    chapterId: 'decision',
    title: 'Por quais motivos o vendedor precisa retornar?',
    answerType: 'multiline_list',
    showWhen: (data) => data.current_sales_process.follow_up.happens === true,
    getValue: (data) => data.current_sales_process.follow_up.reasons,
    setValue: (data, value) => withFollowUp(data, (followUp) => ({ ...followUp, reasons: value as string[] })),
    writesTo: 'current_sales_process.follow_up.reasons',
  },
  {
    id: 'Q74',
    chapterId: 'decision',
    title: 'Existe um momento em que continuar tentando deixa de fazer sentido?',
    answerType: 'long_text',
    showWhen: (data) => data.current_sales_process.follow_up.happens === true,
    getValue: (data) => data.current_sales_process.follow_up.cadence,
    setValue: (data, value) => withFollowUp(data, (followUp) => ({ ...followUp, cadence: value as string })),
    writesTo: 'current_sales_process.follow_up.cadence',
  },
  {
    id: 'Q77',
    chapterId: 'decision',
    title: 'Quais são os motivos mais comuns de perda?',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.losses,
    setValue: (data, value) => withCurrentSalesProcess(data, (process) => ({ ...process, losses: value as string[] })),
    writesTo: 'current_sales_process.losses',
  },
  {
    id: 'Q78_80',
    chapterId: 'decision',
    title: 'Existem sinais que mostram que uma oportunidade não faz sentido e a equipe deveria desistir mais cedo?',
    helper: 'Inclua também perfis de cliente que não deveriam receber determinada oferta.',
    answerType: 'multiline_list',
    getValue: (data) => data.current_sales_process.disqualification_signals ?? [],
    setValue: (data, value) =>
      withCurrentSalesProcess(data, (process) => ({
        ...process,
        disqualification_signals: value as string[],
      })),
    writesTo: 'current_sales_process.disqualification_signals',
  },
  {
    id: 'Q81',
    chapterId: 'decision',
    title: 'Existe renovação explícita?',
    answerType: 'yes_no',
    showWhen: (data) => data.company_profile.offer.purchase_frequency !== 'one_time',
    getValue: (data) => data.current_sales_process.renewal?.has_explicit_renewal ?? null,
    setValue: (data, value) => withRenewal(data, (renewal) => ({ ...renewal, has_explicit_renewal: value as boolean })),
    writesTo: 'current_sales_process.renewal.has_explicit_renewal',
  },
  {
    id: 'Q82',
    chapterId: 'decision',
    title: 'Quando o processo de renovação normalmente começa?',
    answerType: 'short_text',
    showWhen: (data) =>
      data.company_profile.offer.purchase_frequency !== 'one_time' &&
      data.current_sales_process.renewal?.has_explicit_renewal === true,
    getValue: (data) => data.current_sales_process.renewal?.when_starts ?? '',
    setValue: (data, value) => withRenewal(data, (renewal) => ({ ...renewal, when_starts: value as string })),
    writesTo: 'current_sales_process.renewal.when_starts',
  },
  {
    id: 'Q83',
    chapterId: 'decision',
    title: 'O cliente pode fazer upgrade, contratar algo adicional ou expandir?',
    answerType: 'yes_no',
    showWhen: (data) => data.company_profile.offer.purchase_frequency !== 'one_time',
    getValue: (data) => data.current_sales_process.renewal?.can_expand ?? null,
    setValue: (data, value) => withRenewal(data, (renewal) => ({ ...renewal, can_expand: value as boolean })),
    writesTo: 'current_sales_process.renewal.can_expand',
  },
  {
    id: 'Q84',
    chapterId: 'decision',
    title: 'O que normalmente indica oportunidade de expansão?',
    answerType: 'short_text',
    showWhen: (data) =>
      data.company_profile.offer.purchase_frequency !== 'one_time' &&
      data.current_sales_process.renewal?.can_expand === true,
    getValue: (data) => data.current_sales_process.renewal?.expansion_signal ?? '',
    setValue: (data, value) => withRenewal(data, (renewal) => ({ ...renewal, expansion_signal: value as string })),
    writesTo: 'current_sales_process.renewal.expansion_signal',
  },
  {
    id: 'Q85',
    chapterId: 'decision',
    title: 'A renovação segue praticamente o mesmo processo da primeira venda?',
    answerType: 'single_choice',
    options: [
      { value: 'same', label: 'Sim' },
      { value: 'similar', label: 'Parecido' },
      { value: 'different', label: 'Bem diferente' },
    ],
    showWhen: (data) =>
      data.company_profile.offer.purchase_frequency !== 'one_time' &&
      data.current_sales_process.renewal?.has_explicit_renewal === true,
    getValue: (data) => data.current_sales_process.renewal?.same_as_first_sale ?? '',
    setValue: (data, value) =>
      withRenewal(data, (renewal) => ({ ...renewal, same_as_first_sale: value as typeof renewal.same_as_first_sale })),
    writesTo: 'current_sales_process.renewal.same_as_first_sale',
  },

  // ── Base comercial (mini-trilha contextual — não vira etapa) ────────────
  {
    id: 'Q86',
    chapterId: 'company',
    title: 'Como você chamaria sua principal oferta em uma frase?',
    helper: 'Fatos comerciais da sua empresa — isso não vira etapa do método.',
    answerType: 'short_text',
    getValue: (data) => data.commercial_rules.offers[0]?.name ?? '',
    setValue: (data, value) => withFirstOffer(data, (offer) => ({ ...offer, name: value as string })),
    writesTo: 'commercial_rules.offers[0].name',
  },
  {
    id: 'Q87',
    chapterId: 'company',
    title: 'Quais são os principais benefícios confirmados dessa oferta?',
    answerType: 'multiline_list',
    getValue: (data) => data.commercial_rules.offers[0]?.benefits ?? [],
    setValue: (data, value) => withFirstOffer(data, (offer) => ({ ...offer, benefits: value as string[] })),
    writesTo: 'commercial_rules.offers[0].benefits',
  },
  {
    id: 'Q88',
    chapterId: 'company',
    title: 'Quais diferenciais verificados vocês têm?',
    answerType: 'multiline_list',
    getValue: (data) => data.commercial_rules.offers[0]?.differentiators ?? [],
    setValue: (data, value) => withFirstOffer(data, (offer) => ({ ...offer, differentiators: value as string[] })),
    writesTo: 'commercial_rules.offers[0].differentiators',
  },
  {
    id: 'Q89',
    chapterId: 'company',
    title: 'Quais limitações importantes o vendedor precisa saber?',
    answerType: 'multiline_list',
    getValue: (data) => data.commercial_rules.offers[0]?.limitations ?? [],
    setValue: (data, value) => withFirstOffer(data, (offer) => ({ ...offer, limitations: value as string[] })),
    writesTo: 'commercial_rules.offers[0].limitations',
  },
  {
    id: 'Q90',
    chapterId: 'company',
    title: 'Quais formas de pagamento vocês aceitam?',
    answerType: 'multiline_list',
    getValue: (data) => data.commercial_rules.payment.methods,
    setValue: (data, value) => withPayment(data, (payment) => ({ ...payment, methods: value as string[] })),
    writesTo: 'commercial_rules.payment.methods',
  },
  {
    id: 'Q91',
    chapterId: 'company',
    title: 'Como funciona a política de descontos?',
    answerType: 'single_choice',
    options: [
      { value: 'none', label: 'Não concedemos desconto' },
      { value: 'seller_with_limit', label: 'Vendedor pode conceder até um limite' },
      { value: 'manager_only', label: 'Somente gestor pode aprovar' },
      { value: 'case_by_case', label: 'Analisado caso a caso' },
    ],
    getValue: (data) => data.commercial_rules.discounts.policy,
    setValue: (data, value) =>
      withDiscounts(data, (discounts) => ({ ...discounts, policy: value as typeof discounts.policy })),
    writesTo: 'commercial_rules.discounts.policy',
  },
  {
    id: 'Q92',
    chapterId: 'company',
    title: 'Sua empresa utiliza contrato?',
    answerType: 'yes_no',
    getValue: (data) => data.commercial_rules.contracts.uses_contract,
    setValue: (data, value) =>
      withContracts(data, (contracts) => ({ ...contracts, uses_contract: value as boolean })),
    writesTo: 'commercial_rules.contracts.uses_contract',
  },
  {
    id: 'Q93',
    chapterId: 'company',
    title: 'Quais documentos são obrigatórios antes da contratação?',
    answerType: 'multiline_list',
    getValue: (data) => data.commercial_rules.documentation.required_documents,
    setValue: (data, value) =>
      withDocumentation(data, (documentation) => ({ ...documentation, required_documents: value as string[] })),
    writesTo: 'commercial_rules.documentation.required_documents',
  },
  {
    id: 'Q94',
    chapterId: 'company',
    title: 'Como funciona o cancelamento?',
    answerType: 'long_text',
    getValue: (data) => data.commercial_rules.policies.cancellation,
    setValue: (data, value) =>
      withPolicies(data, (policies) => ({ ...policies, cancellation: value as string })),
    writesTo: 'commercial_rules.policies.cancellation',
  },
  {
    id: 'Q95',
    chapterId: 'company',
    title: 'O que o vendedor não pode prometer?',
    helper: 'Promessas que exigem cuidado — a Yolen vai orientar sua equipe a evitá-las.',
    answerType: 'multiline_list',
    getValue: (data) => data.commercial_rules.restrictions.forbidden_promises,
    setValue: (data, value) =>
      withRestrictions(data, (restrictions) => ({ ...restrictions, forbidden_promises: value as string[] })),
    writesTo: 'commercial_rules.restrictions.forbidden_promises',
  },
  {
    id: 'Q96',
    chapterId: 'company',
    title: 'Quais condições dependem de aprovação?',
    answerType: 'multiline_list',
    getValue: (data) => data.commercial_rules.restrictions.approval_required,
    setValue: (data, value) =>
      withRestrictions(data, (restrictions) => ({ ...restrictions, approval_required: value as string[] })),
    writesTo: 'commercial_rules.restrictions.approval_required',
  },
]

export { isB2B, isLongerSale, isFewComplex }
