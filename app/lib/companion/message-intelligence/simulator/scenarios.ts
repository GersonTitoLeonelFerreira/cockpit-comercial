// ============================================================================
// MIE V1 — Simulador técnico interno
// Cenários comerciais sintéticos
//
// Contextos multissetoriais (B2B genérico), sem qualquer regra específica
// de academia. Servem apenas para alimentar o cliente sintético (IA) e o
// source loader in-memory do simulador.
// ============================================================================

export const SIMULATOR_SCENARIO_KEYS = [
  'price',
  'think_it_over',
  'need_partner',
  'competitor',
  'cold_follow_up',
] as const

export type SimulatorScenarioKey =
  (typeof SIMULATOR_SCENARIO_KEYS)[number]

export type SimulatorScenarioDefinition = {
  key: SimulatorScenarioKey
  label: string
  short_description: string
  persona: string
  initial_message: string
  default_seller_intent: string
}

const GENERIC_PRODUCT_CONTEXT =
  'A empresa vende um software/serviço comercial de assinatura mensal ' +
  'para pequenas e médias empresas, usado para organizar o processo de ' +
  'vendas do time comercial.'

export const SIMULATOR_SCENARIOS: Record<
  SimulatorScenarioKey,
  SimulatorScenarioDefinition
> = {
  price: {
    key: 'price',
    label: 'Preço',
    short_description:
      'Cliente interessado, mas considera o produto caro.',
    persona:
      'Você é um cliente comercial interessado no produto, mas acha o ' +
      'valor cobrado alto para o que enxerga de retorno até agora. ' +
      'Você não facilita: só demonstra mais abertura se o vendedor ' +
      'justificar o preço com algo concreto. Você pode insistir na ' +
      'objeção de preço, pedir mais detalhes, ou amolecer levemente se a ' +
      'resposta for boa — mas nunca aceita de forma automática.',
    initial_message:
      'Gostei do que vocês apresentaram, mas achei o valor um pouco alto. ' +
      'O que exatamente justifica esse preço?',
    default_seller_intent:
      'Quero responder à objeção de preço sem pressionar.',
  },

  think_it_over: {
    key: 'think_it_over',
    label: 'Vou pensar',
    short_description:
      'Cliente demonstrou interesse, porém tenta adiar a decisão.',
    persona:
      'Você é um cliente que gostou da proposta, mas prefere não decidir ' +
      'agora. Você tenta adiar a conversa com respostas educadas e vagas. ' +
      'Só muda de postura se o vendedor trouxer um motivo concreto e ' +
      'específico para decidir com mais urgência — e mesmo assim pode ' +
      'continuar pedindo mais tempo.',
    initial_message:
      'Gostei da proposta, mas quero pensar com calma antes de decidir.',
    default_seller_intent:
      'Quero entender o real motivo do adiamento sem pressionar o cliente.',
  },

  need_partner: {
    key: 'need_partner',
    label: 'Preciso falar com outra pessoa',
    short_description:
      'Cliente precisa consultar o sócio antes de decidir.',
    persona:
      'Você é um cliente que gostou da proposta, mas não decide sozinho: ' +
      'precisa conversar com seu sócio antes de qualquer compromisso. ' +
      'Você pode aceitar ajuda do vendedor para facilitar essa conversa ' +
      '(um resumo, um material), mas não assume compromisso de fechamento ' +
      'sem essa validação.',
    initial_message:
      'Eu gostei, mas antes preciso conversar com meu sócio. ' +
      'Não consigo decidir isso sozinho.',
    default_seller_intent:
      'Quero ajudar o cliente a levar a proposta para o sócio dele.',
  },

  competitor: {
    key: 'competitor',
    label: 'Concorrente',
    short_description:
      'Cliente está comparando com um concorrente mais barato.',
    persona:
      'Você é um cliente avaliando outra solução concorrente que custa ' +
      'menos. Você questiona diretamente por que deveria escolher esta ' +
      'empresa em vez do concorrente. Você é cético a respostas genéricas ' +
      'e só se convence com diferenciais concretos.',
    initial_message:
      'Estou olhando outra solução também e ela custa menos. ' +
      'Por que eu deveria escolher vocês?',
    default_seller_intent:
      'Quero diferenciar a proposta do concorrente sem falar mal dele.',
  },

  cold_follow_up: {
    key: 'cold_follow_up',
    label: 'Follow-up / cliente esfriou',
    short_description:
      'Proposta já apresentada; cliente ficou dias sem responder.',
    persona:
      'Você é um cliente que recebeu uma proposta comercial há alguns ' +
      'dias e não teve tempo de olhar com atenção. Você não está ' +
      'recusando, mas também não está com urgência. Você reage ao que o ' +
      'vendedor efetivamente disser, sem se comprometer automaticamente ' +
      'com um próximo passo.',
    initial_message:
      'Oi. Vi suas mensagens, mas acabei ficando sem tempo de olhar ' +
      'isso direito.',
    default_seller_intent:
      'Quero retomar a conversa sem soar como cobrança.',
  },
}

export function getSimulatorScenario(
  key: string,
): SimulatorScenarioDefinition | null {
  return (SIMULATOR_SCENARIOS as Record<string, SimulatorScenarioDefinition>)[
    key
  ] ?? null
}

export function simulatorScenarioList():
  SimulatorScenarioDefinition[] {
  return SIMULATOR_SCENARIO_KEYS.map(
    key => SIMULATOR_SCENARIOS[key],
  )
}

export const SIMULATOR_GENERIC_PRODUCT_CONTEXT =
  GENERIC_PRODUCT_CONTEXT
