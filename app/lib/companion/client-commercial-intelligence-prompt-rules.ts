import {
  CLIENT_COMMERCIAL_COMMUNICATION_FACT_KINDS,
  CLIENT_COMMERCIAL_COMPETITOR_FACT_KINDS,
  CLIENT_COMMERCIAL_FACT_KINDS,
  CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX,
  CLIENT_COMMERCIAL_OPEN_QUESTION_KIND,
  CLIENT_COMMERCIAL_PRODUCT_FACT_KINDS,
} from './client-commercial-intelligence-contract'

import {
  COMMERCIAL_READING_COMMUNICATION_BEHAVIORS,
  COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS,
} from './commercial-reading-contract'

export const CLIENT_COMMERCIAL_INTELLIGENCE_PROMPT_RULES_VERSION =
  'client-commercial-intelligence-rules-v1' as const

export function buildClientCommercialIntelligencePromptRules(): string {
  return [
    'INTELIGÊNCIA COMERCIAL DO CLIENTE: state_patch é a única camada que decide e atualiza a memória comercial do cliente. A camada de comunicação apenas consumirá esse estado; não deixe fatos para ela redescobrir.',

    'Registre somente afirmações sustentadas diretamente por mensagens incoming da sessão atual. Mensagem outgoing do vendedor pode contextualizar, mas não prova objetivo, problema, impacto, necessidade, preferência, critério, interesse, concorrente ou padrão do cliente.',

    'Nunca preencha uma categoria por obrigação. Quando não houver evidência suficiente, não adicione fato. Use incerteza/missing discovery somente quando a ausência for comercialmente relevante para a condução.',

    'Objetivo, problema, impacto e necessidade são conceitos distintos. Objetivo é o resultado que o cliente busca; problema é a situação atual indesejada; impacto é a consequência comprovada; necessidade é o que precisa existir para melhorar. Nunca copie a mesma frase para mais de uma categoria.',

    `Use facts_to_add.kind somente com estes tipos reservados quando representar cliente: ${CLIENT_COMMERCIAL_FACT_KINDS.join(', ')}. Para esses tipos, value deve ser null e summary contém a afirmação comprovada.`,

    'Use needs_to_add somente para uma necessidade comprovada. Interesse, objetivo, problema e impacto não pertencem automaticamente a needs_to_add.',

    `Use open_loops_to_add.kind=${CLIENT_COMMERCIAL_OPEN_QUESTION_KIND} para pergunta comercial do cliente ainda sem resposta. Resolva pelo ID exato quando a resposta ficar comprovada.`,

    'Use objections_to_add para objeção comercial aberta. Quando a conversa comprovar que deixou de ser obstáculo, use objection_ids_to_resolve. Quando uma objeção anterior for substituída por outra formulação atual, use objection_ids_to_supersede no ID anterior e preserve a nova separadamente. Nunca resolva e substitua o mesmo ID no mesmo ciclo.',

    `Para missing discovery, use uncertainties_to_add.kind=${CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX}<topic>, onde topic é um de: ${COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS.join(', ')}. Resolva o ID assim que a informação for obtida; não continue cobrando descoberta já concluída.`,

    'Use uncertainties_to_add sem o prefixo reservado apenas para ambiguidade comercial real que não seja uma descoberta faltante conhecida.',

    `Produtos oficiais discutidos usam facts_to_add.kind em: ${CLIENT_COMMERCIAL_PRODUCT_FACT_KINDS.filter(kind => kind.includes('.catalog.')).join(', ')} e value precisa ser o product_id canônico exato. A existência do catálogo não prova discussão nem interesse.`,

    `Produto ou serviço mencionado que não corresponda seguramente ao catálogo usa: ${CLIENT_COMMERCIAL_PRODUCT_FACT_KINDS.filter(kind => kind.includes('.observed.')).join(', ')} e value preserva literalmente o nome observado. Nunca force correspondência nem invente product_id.`,

    'Use nível discussed quando houve apenas menção; interested quando o cliente demonstrou interesse; primary somente quando a evidência comprovar que é o produto/serviço de maior interesse atual. Pode existir no máximo um primary ativo.',

    `Concorrente nominal usa kind=${CLIENT_COMMERCIAL_COMPETITOR_FACT_KINDS[0]} e value contém somente o nome comprovado. “Outra empresa”, “outras opções” ou equivalente usa kind=${CLIENT_COMMERCIAL_COMPETITOR_FACT_KINDS[1]} e value=null. Nunca adivinhe o nome.`,

    `Comunicação observada usa kind em: ${CLIENT_COMMERCIAL_COMMUNICATION_FACT_KINDS.join(', ')} e value em: ${COMMERCIAL_READING_COMMUNICATION_BEHAVIORS.join(', ')}.`,

    'client.communication.event representa um comportamento isolado e não autoriza dizer “costuma” ou “prefere”. client.communication.explicit_preference exige preferência declarada pelo próprio cliente. client.communication.pattern exige pelo menos duas mensagens incoming distintas que sustentem recorrência.',

    'Descreva somente comportamento observável. É proibido inferir ansiedade, dominância, insegurança, dificuldade, DISC, personalidade ou perfil psicológico.',

    'Quando prioridade, critério, objetivo, preferência ou produto principal mudar, use fact_ids_to_supersede com o ID ativo anterior e adicione o fato atual. Não apague história nem mantenha duas verdades atuais contraditórias.',

    'Compromissos em commitments_to_upsert são exclusivamente comerciais. Promessa pessoal, currículo, foto, rotina, deslocamento ou chamada sem objeto de venda não pertence à memória comercial.',

    'Se commercial_relevance não for commercial, não adicione, resolva nem substitua nenhuma inteligência comercial do cliente. O estado anterior será preservado deterministicamente.',
  ].join('\n')
}
