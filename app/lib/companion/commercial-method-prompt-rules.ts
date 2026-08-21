// ============================================================================
// Yolen — Inteligência Comercial
// Regras de interpretação do método comercial pelo modelo.
//
// Este módulo não escolhe uma ação comercial.
// Ele apenas define como o método configurado deve orientar o raciocínio.
// A taxonomia de decisões pertence à A2.
// ============================================================================

import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

export const COMMERCIAL_METHOD_PROMPT_RULES_VERSION =
  'commercial-method-prompt-rules-v1' as const

type DiagnosticSalesMethod =
  CompanionDiagnosticInput[
    'commercial_context'
  ]['sales_method']

export function buildCommercialMethodPromptRules(
  salesMethod: DiagnosticSalesMethod,
): string {
  if (!salesMethod.configured) {
    return [
      'O método comercial não está configurado.',
      'Não invente etapas, princípios, critérios, perguntas ou regras comerciais ausentes.',
    ].join('\n')
  }

  const baseRules = [
    'Aplique o método comercial configurado como orientação estratégica, nunca como roteiro mecânico, checklist de perguntas ou sequência obrigatória de mensagens.',

    'A ordem das etapas ajuda a compreender progressão comercial, mas não obriga o vendedor a percorrê-las mecanicamente quando a própria conversa já fornecer as evidências necessárias.',

    'Perguntas recomendadas são possibilidades de investigação, nunca perguntas obrigatórias.',

    'Evite interrogatório: descoberta consultiva não significa continuar fazendo perguntas indefinidamente quando já existe contexto suficiente para responder ao que o comprador quer compreender.',

    'Continue aprofundando a descoberta somente quando a informação faltante puder alterar a compreensão, a aderência da solução, a prioridade, o valor percebido ou a segurança da recomendação.',

    'Quando o contexto já demonstrar uma necessidade relevante e uma capacidade configurada responder diretamente a ela, conecte a solução ao problema antes de continuar coletando detalhes opcionais.',
  ]

  if (
    salesMethod.contract_version !==
      'commercial-method-v2' ||
    !salesMethod.definition
  ) {
    return baseRules.join('\n')
  }

  return [
    ...baseRules,

    'Quando sales_method.contract_version=commercial-method-v2, sales_method.definition é o contrato semântico vinculante do método.',

    'sales_method.principles e sales_method.definition.principles são princípios de raciocínio comercial e precisam ser respeitados em toda interpretação do método.',

    'definition.stages[].display_order é referência de leitura e progressão, não obrigação de executar uma etapa após a outra.',

    'definition.stages[].completion_criteria descreve evidências que permitem considerar uma etapa suficientemente concluída. Essas evidências podem já existir na conversa e não precisam ter sido obtidas por uma pergunta específica do vendedor.',

    'definition.stages[].partial_completion_criteria representa progresso real sem comprovar conclusão suficiente. Não trate progresso parcial como etapa concluída.',

    'Use definition.stages[].deepen_when para decidir se ainda existe motivo comercial para aprofundar a compreensão. Não aprofunde apenas para preencher campos ou completar um roteiro.',

    'Use definition.stages[].sufficient_when para reconhecer quando já existe informação suficiente. Quando uma condição de suficiência estiver atendida, não continue investigando apenas porque outras perguntas seriam possíveis.',

    'Use definition.stages[].stop_asking_when como regra explícita para interromper perguntas que deixaram de acrescentar valor. Não recomende nova pergunta quando uma dessas condições estiver comprovadamente satisfeita.',

    'definition.stages[].advance_when indica condições nas quais avançar pode fazer sentido; não transforma avanço em obrigação automática.',

    'Quando definition.stages[].wait_when estiver comprovadamente satisfeita, esperar ou dar espaço é uma decisão comercial válida. Não invente pergunta, mensagem, compromisso, Agenda ou mudança de CRM apenas para produzir um próximo passo.',

    'Use definition.stages[].skip_conditions somente conforme o próprio contrato permitir. Não marque uma etapa obrigatória como pulada apenas porque ainda não existem evidências suficientes para concluí-la.',

    'Etapas opcionais podem permanecer não utilizadas quando não acrescentarem valor ao caso atual.',

    'definition.stages[].dimensions são lentes internas para compreender uma etapa, não subetapas obrigatórias nem uma sequência de perguntas.',

    'definition.stages[].dimensions[].evidence_criteria descreve que evidência é relevante para aquela dimensão. Não transforme cada critério em uma pergunta obrigatória.',

    'Se a conversa já trouxer espontaneamente a evidência necessária para uma etapa ou dimensão, reconheça essa evidência sem fazer o vendedor perguntar novamente.',

    'A aplicação correta do método pode resultar em aprofundar, avançar, responder, permanecer como está ou esperar. O método não exige movimento comercial artificial.',
  ].join('\n')
}
