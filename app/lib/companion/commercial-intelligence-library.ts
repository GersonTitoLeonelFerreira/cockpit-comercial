import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import {
  COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION,
  validateCommercialIntelligenceEntry,
  type CommercialIntelligenceEntry,
  type CommercialIntelligenceQuery,
  type RankedCommercialIntelligenceEntry,
} from './commercial-intelligence-contract'

function unique(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(Boolean),
    ),
  )
}

function generalEntry(
  entry: Omit<
    CommercialIntelligenceEntry,
    'contract_version' | 'scope' | 'provenance'
  >,
): CommercialIntelligenceEntry {
  return validateCommercialIntelligenceEntry({
    ...entry,
    contract_version:
      COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION,
    scope:
      'general',
    provenance: {
      source_type:
        'general_library',
      source_id:
        entry.id,
      company_id: null,
      product_id: null,
      config_version_id: null,
    },
  })
}

export const GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY:
  readonly CommercialIntelligenceEntry[] = [
  generalEntry({
    id: 'technique.guided_choice',
    kind: 'technique',
    title: 'Escolha guiada',
    objective:
      'Reduzir fricção de decisão quando o cliente precisa escolher entre poucas alternativas já válidas.',
    description:
      'Organiza opções reais em uma decisão simples sem fabricar urgência nem esconder critérios relevantes.',
    situations: [
      'scheduling_choice',
      'product_choice',
      'next_step_choice',
    ],
    signals: [
      'customer_waiting_for_options',
      'seller_already_asked_open_question',
      'multiple_valid_options',
    ],
    when_to_use: [
      'Há duas ou três alternativas concretas e comparáveis.',
      'O cliente já demonstrou intenção suficiente para decidir entre opções.',
    ],
    when_not_to_use: [
      'Ainda falta descobrir um requisito que muda a recomendação.',
      'Uma das alternativas não é permitida pelas regras da empresa.',
    ],
    risks: [
      'Virar pressão artificial se a escolha for apresentada antes de entender o critério do cliente.',
    ],
    examples: [
      {
        situation:
          'Cliente quer agendar, mas ainda não escolheu entre dois horários disponíveis.',
        application:
          'Apresentar as duas opções reais e pedir escolha entre elas, sem repetir a pergunta aberta já feita.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.objection_diagnosis',
    kind: 'technique',
    title: 'Diagnóstico de objeção',
    objective:
      'Descobrir a causa real de uma objeção antes de prescrever argumento ou condição comercial.',
    description:
      'Separa sintoma de causa para evitar responder automaticamente a preço, pagamento, prazo ou confiança.',
    situations: [
      'payment_objection',
      'price_objection',
      'trust_objection',
      'timing_objection',
    ],
    signals: [
      'objection_open',
      'unclear_objection_cause',
      'customer_resistance',
    ],
    when_to_use: [
      'A objeção está clara, mas a causa ou restrição ainda não está comprovada.',
      'Existem regras ou alternativas da empresa que só fazem sentido depois do diagnóstico.',
    ],
    when_not_to_use: [
      'A causa já foi explicitamente confirmada e existe resposta factual direta.',
      'O cliente já tomou uma decisão final inequívoca que não depende de esclarecimento.',
    ],
    risks: [
      'Transformar diagnóstico em interrogatório.',
      'Responder com solução genérica que não atende à causa real.',
    ],
    examples: [
      {
        situation:
          'Cliente diz que não consegue pagar no cartão.',
        application:
          'Entender se o bloqueio é ausência de cartão, limite, preferência ou política antes de sugerir qualquer alternativa permitida.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.third_party_handoff',
    kind: 'technique',
    title: 'Handoff para o prospect real',
    objective:
      'Preservar o interlocutor como ponte sem confundi-lo com a pessoa que realmente decide ou usa a oferta.',
    description:
      'Quando alguém fala por outra pessoa, organiza a transição para obter identidade, contato e próximo passo do prospect correto.',
    situations: [
      'third_party_referral',
      'intermediary_contact',
    ],
    signals: [
      'third_party_prospect',
      'intermediary_detected',
    ],
    when_to_use: [
      'O interlocutor declara que a compra, uso ou decisão pertence a outra pessoa.',
      'É necessário continuar a oportunidade sem atribuir fatos ao interlocutor errado.',
    ],
    when_not_to_use: [
      'O interlocutor é também o comprador ou decisor comprovado.',
      'Não existe consentimento ou contexto suficiente para solicitar dados de terceiro.',
    ],
    risks: [
      'Misturar identidade do interlocutor com a do prospect.',
      'Registrar objetivo, objeção ou compromisso na pessoa errada.',
    ],
    examples: [
      {
        situation:
          'Contato diz que a irmã quer contratar.',
        application:
          'Tratar o contato como intermediário e conduzir a obtenção do nome/contato ou uma passagem clara para a irmã antes de completar etapas atribuídas a ela.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.discovery_before_prescription',
    kind: 'principle',
    title: 'Diagnosticar antes de prescrever',
    objective:
      'Evitar recomendações prematuras quando a decisão depende de contexto ainda não comprovado.',
    description:
      'Prioriza uma pergunta de alto valor informacional antes de apresentar produto, condição ou solução.',
    situations: [
      'discovery_gap',
      'complex_need',
      'health_or_sensitive_context',
    ],
    signals: [
      'missing_decision_criterion',
      'missing_need',
      'missing_context',
    ],
    when_to_use: [
      'Existe lacuna que muda materialmente a recomendação.',
    ],
    when_not_to_use: [
      'A pergunta já foi feita e o cliente ainda precisa responder.',
      'A informação já está disponível na memória canônica.',
    ],
    risks: [
      'Repetir descoberta já concluída.',
      'Virar questionário mecânico.',
    ],
    examples: [
      {
        situation:
          'Cliente menciona cirurgia ou limitação sem explicar impacto atual.',
        application:
          'Entender a condição relevante para a decisão antes de despejar regra técnica ou produto.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.contextual_reengagement',
    kind: 'technique',
    title: 'Retomada contextual',
    objective:
      'Reabrir uma oportunidade que esfriou sem repetir a ação já executada nem reiniciar a venda.',
    description:
      'Retoma a intenção comprovada do cliente, reconhece a continuidade da conversa e busca um microcompromisso diferente da pergunta que já ficou sem resposta.',
    situations: [
      'method_alignment',
      'duplicate_followup',
      'next_step_choice',
    ],
    signals: [
      'sequence_break',
      'seller_already_asked_open_question',
      'customer_intent_hot',
      'seller_action_already_performed',
    ],
    when_to_use: [
      'O cliente já demonstrou uma intenção comercial clara e a conversa perdeu continuidade antes de concluir o próximo passo.',
      'O vendedor já fez a pergunta necessária e uma nova retomada precisa reduzir fricção em vez de repetir a mesma cobrança.',
    ],
    when_not_to_use: [
      'O cliente trouxe um fato novo que exige resposta direta.',
      'Ainda não existe intenção comercial sustentada por evidência.',
    ],
    risks: [
      'Transformar a retomada em pressão disfarçada.',
      'Reformular a mesma pergunta anterior sem mudar o microcompromisso.',
    ],
    examples: [
      {
        situation:
          'O cliente pediu uma demonstração, o vendedor perguntou disponibilidade, houve silêncio e depois a conversa desviou para outra oferta.',
        application:
          'Retomar a intenção de demonstração e confirmar se ainda faz sentido avançar, sem perguntar novamente o mesmo dia/horário e sem inventar disponibilidade.',
      },
    ],
  }),

  // -------------------------------------------------------------------
  // Reativação e recuperação de momentum — competência comercial própria.
  // Selecionadas pelo contexto temporal canônico (momentum, frescor da
  // intenção, tentativas sem resposta), nunca por vertical ou palavra-chave.
  // -------------------------------------------------------------------
  generalEntry({
    id: 'technique.state_change_reactivation',
    kind: 'technique',
    title: 'Reativação por mudança de estado',
    objective:
      'Recuperar uma oportunidade dormente descobrindo o estado ATUAL do interesse antes de retomar o fluxo antigo.',
    description:
      'Relembra de forma concreta o que o cliente estava avaliando (recuperação de contexto) e faz uma única pergunta de baixo esforço sobre o que mudou desde então — continua, adiou, resolveu ou mudou de ideia —, sem tratar a intenção antiga como atual.',
    situations: [
      'reactivation',
    ],
    signals: [
      'dormant_opportunity',
      'stale_customer_intent',
      'requalification_needed',
      'intent_time_window_expired',
      'reactivation_needed',
    ],
    when_to_use: [
      'A última manifestação do cliente é antiga, a conversa perdeu continuidade e não há confirmação de que o interesse continua.',
      'O próximo passo operacional anterior (data, horário, proposta) pode ter ficado superado pelo tempo.',
    ],
    when_not_to_use: [
      'O cliente respondeu recentemente e a conversa está ativa.',
      'O cliente declarou explicitamente que encerrou ou resolveu por outro caminho.',
    ],
    risks: [
      'Soar como cobrança se a pergunta pedir decisão em vez de estado.',
      'Presumir que o interesse continua ou que foi perdido sem evidência.',
    ],
    examples: [
      {
        situation:
          'Cliente pediu uma demonstração há semanas, não respondeu à tentativa de agendamento e depois recebeu uma oferta sem retorno.',
        application:
          'Relembrar a demonstração que ela quis fazer e perguntar como ficou essa avaliação desde então, sem pedir data nem reenviar oferta.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.permission_based_reengagement',
    kind: 'technique',
    title: 'Retomada com permissão',
    objective:
      'Reabrir a conversa pedindo permissão para retomar, reduzindo pressão depois de tentativas sem resposta.',
    description:
      'Reconhece que o próximo passo ficou em aberto e pergunta, de forma simples e fácil de responder, se ainda faz sentido retomar — preservando a autonomia do cliente e oferecendo uma saída sem constrangimento.',
    situations: [
      'reactivation',
      'follow_up_cadence',
    ],
    signals: [
      'seller_outbound_streak',
      'cooling_conversation',
      'reactivation_needed',
    ],
    when_to_use: [
      'Já existem tentativas do vendedor sem resposta e insistir no mesmo pedido aumentaria pressão.',
      'A conversa esfriou mas ainda há intenção recente o bastante para ser retomada.',
    ],
    when_not_to_use: [
      'O cliente está aguardando uma resposta do vendedor.',
      'A conversa está ativa e o cliente acabou de responder.',
    ],
    risks: [
      'Pergunta genérica de "ainda tem interesse?" sem contexto concreto soa automática.',
    ],
    examples: [
      {
        situation:
          'Vendedor enviou duas mensagens sobre uma proposta e não houve resposta.',
        application:
          'Retomar a proposta pelo que o cliente buscava e perguntar se ainda faz sentido conversar sobre isso agora.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.pattern_interrupt_reengagement',
    kind: 'technique',
    title: 'Quebra de padrão na retomada',
    objective:
      'Mudar o formato da abordagem quando o mesmo tipo de mensagem já foi enviado sem resposta.',
    description:
      'Em vez de repetir oferta, lista ou cobrança, envia uma mensagem curta, diferente das anteriores e ancorada no que o próprio cliente trouxe, com uma única pergunta fácil de responder.',
    situations: [
      'reactivation',
      'follow_up_cadence',
    ],
    signals: [
      'seller_outbound_streak',
      'dormant_opportunity',
      'reactivation_needed',
    ],
    when_to_use: [
      'Há duas ou mais tentativas seguidas do vendedor sem resposta, especialmente com conteúdo longo ou promocional.',
    ],
    when_not_to_use: [
      'Ainda não houve nenhuma tentativa sem resposta.',
      'O cliente trouxe fato novo que exige resposta direta.',
    ],
    risks: [
      'Confundir quebra de padrão com mensagem chamativa, curiosidade artificial ou urgência falsa.',
    ],
    examples: [
      {
        situation:
          'Depois de uma pergunta de agenda sem resposta, o vendedor enviou uma oferta extensa com links; o cliente segue em silêncio.',
        application:
          'Não reenviar oferta; enviar uma frase curta que recupera o objetivo original do cliente e pergunta algo simples sobre o momento atual dele.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.delayed_response_recovery',
    kind: 'technique',
    title: 'Recuperação de resposta atrasada',
    objective:
      'Responder ao cliente que ficou esperando, reconhecendo o atraso sem desculpas longas e tratando o pedido original.',
    description:
      'Quando a próxima resposta era do vendedor e o tempo passou, a mensagem reconhece brevemente a demora, responde ao que o cliente pediu e, se o momento indicado pelo cliente já passou, confirma o que ainda faz sentido agora.',
    situations: [
      'delayed_response_recovery',
    ],
    signals: [
      'customer_waiting_for_seller',
      'seller_response_delayed',
      'high_intent_response_delayed',
    ],
    when_to_use: [
      'O cliente fez uma pergunta ou pedido e o vendedor ainda não respondeu depois de um intervalo relevante.',
    ],
    when_not_to_use: [
      'A resposta do vendedor já foi enviada e a próxima ação está com o cliente.',
    ],
    risks: [
      'Fingir que nenhum tempo passou e responder como se o pedido tivesse sido feito agora.',
      'Transformar a desculpa em justificativa longa que desvia do pedido.',
    ],
    examples: [
      {
        situation:
          'Cliente pediu uma visita para "amanhã" e ficou quatro dias sem resposta.',
        application:
          'Reconhecer a demora em uma frase, retomar a visita pedida e perguntar se ainda faz sentido marcá-la, sem presumir a data antiga.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.respectful_closure',
    kind: 'technique',
    title: 'Encerramento respeitoso',
    objective:
      'Respeitar a decisão do cliente de encerrar ou de resolver por outro caminho, preservando a relação sem pressão.',
    description:
      'Quando o cliente declarou que resolveu, contratou em outro lugar ou não tem mais interesse, a condução correta é agradecer, respeitar a decisão e, no máximo, deixar a porta aberta — nunca insistir na oferta.',
    situations: [
      'closed_by_customer',
    ],
    signals: [
      'opportunity_closed_by_customer',
    ],
    when_to_use: [
      'Há declaração explícita do cliente de encerramento ou de solução por outro caminho.',
    ],
    when_not_to_use: [
      'O cliente só está em silêncio — silêncio não é encerramento.',
    ],
    risks: [
      'Tentar reverter a decisão com oferta ou urgência.',
    ],
    examples: [
      {
        situation:
          'Cliente informa que já fechou com outro fornecedor.',
        application:
          'Agradecer, desejar sucesso e dizer que fica disponível caso algo mude — sem nova proposta.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.commitment_wait',
    kind: 'technique',
    title: 'Espera disciplinada',
    objective:
      'Evitar follow-up redundante quando a próxima ação está claramente com o cliente.',
    description:
      'Distingue falta de movimento de um compromisso ainda em prazo e protege a conversa contra pressão desnecessária.',
    situations: [
      'customer_commitment_pending',
      'waiting_for_customer',
    ],
    signals: [
      'waiting_on_customer',
      'seller_action_already_performed',
      'customer_future_action',
    ],
    when_to_use: [
      'O cliente assumiu uma próxima ação concreta ou o vendedor acabou de fazer a pergunta necessária.',
    ],
    when_not_to_use: [
      'O prazo combinado venceu.',
      'O cliente trouxe nova pergunta ou nova objeção que exige resposta.',
    ],
    risks: [
      'Confundir espera disciplinada com abandono da oportunidade.',
    ],
    examples: [
      {
        situation:
          'Cliente diz que vai verificar o cartão e avisar.',
        application:
          'Não repetir a objeção nem inventar nova ação imediata; preservar o compromisso e agir quando houver resposta ou vencimento do prazo.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.decision_criteria_clarification',
    kind: 'technique',
    title: 'Clarificação de critérios de decisão',
    objective:
      'Descobrir quais critérios realmente determinam a escolha antes de comparar ou recomendar alternativas.',
    description:
      'Tira a conversa do nível de preferência genérica e identifica o que precisa ser verdadeiro para a decisão fazer sentido para o cliente.',
    situations: [
      'decision_criteria_gap',
      'discovery_gap',
      'comparison_context',
      'product_fit',
    ],
    signals: [
      'missing_decision_criterion',
      'customer_comparing_options',
    ],
    when_to_use: [
      'O cliente demonstra interesse, mas ainda não está claro como ele vai decidir.',
      'Existe comparação entre alternativas sem critério explícito.',
    ],
    when_not_to_use: [
      'Os critérios já estão claros e o cliente está apenas executando o próximo passo.',
    ],
    risks: [
      'Transformar a conversa em checklist de perguntas sem usar as respostas para avançar.',
    ],
    examples: [
      {
        situation:
          'Cliente está comparando duas soluções e pergunta qual é melhor.',
        application:
          'Descobrir os dois ou três critérios que mais pesam na decisão e só então comparar pelas dimensões relevantes.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.impact_exploration',
    kind: 'technique',
    title: 'Exploração de impacto',
    objective:
      'Conectar o problema relatado ao impacto real que torna a mudança relevante.',
    description:
      'Aprofunda consequência, frequência ou custo do problema sem dramatizar e sem fabricar dor.',
    situations: [
      'impact_gap',
      'discovery_gap',
      'complex_need',
    ],
    signals: [
      'problem_without_impact',
      'missing_impact',
    ],
    when_to_use: [
      'O problema está comprovado, mas ainda não está claro por que ele importa agora.',
    ],
    when_not_to_use: [
      'O impacto já está explícito e suficiente para orientar a decisão.',
    ],
    risks: [
      'Exagerar consequência ou induzir medo para aumentar pressão.',
    ],
    examples: [
      {
        situation:
          'Cliente relata retrabalho, mas não explicou como isso afeta operação ou resultado.',
        application:
          'Entender o efeito concreto do retrabalho antes de conectar a solução ao valor.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.value_linkage',
    kind: 'technique',
    title: 'Conexão valor-contexto',
    objective:
      'Explicar valor ligando benefício real do produto a uma necessidade, objetivo ou critério comprovado do cliente.',
    description:
      'Substitui lista genérica de benefícios por uma ponte explícita entre contexto do cliente e capacidade oficial da solução.',
    situations: [
      'value_explanation',
      'product_fit',
      'recommendation',
    ],
    signals: [
      'need_known',
      'product_interest',
      'claim_requires_company_knowledge',
    ],
    when_to_use: [
      'Já existe necessidade ou critério conhecido e há conhecimento oficial de produto relevante.',
    ],
    when_not_to_use: [
      'Ainda falta contexto que muda materialmente a recomendação.',
    ],
    risks: [
      'Voltar a despejar benefícios genéricos sem conexão com o que o cliente disse.',
    ],
    examples: [
      {
        situation:
          'Cliente valorizou rapidez de implantação e existe uma capacidade oficial relacionada.',
        application:
          'Explicar essa capacidade especificamente em relação ao critério de rapidez, sem listar recursos irrelevantes.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.objection_isolation',
    kind: 'technique',
    title: 'Isolamento de objeção',
    objective:
      'Confirmar se a objeção atual é realmente a principal trava antes de investir em uma resposta longa ou concessão.',
    description:
      'Depois de entender a causa, verifica se resolver esse ponto efetivamente libera o avanço ou se existem outras travas relevantes.',
    situations: [
      'objection_handling',
      'price_objection',
      'payment_objection',
    ],
    signals: [
      'objection_open',
      'customer_resistance',
    ],
    when_to_use: [
      'A causa da objeção está razoavelmente clara, mas ainda não se sabe se ela é a única trava.',
    ],
    when_not_to_use: [
      'A objeção ainda não foi diagnosticada.',
    ],
    risks: [
      'Soar como tentativa de encurralar o cliente ou obter compromisso artificial.',
    ],
    examples: [
      {
        situation:
          'Cliente diz que preço é a trava principal.',
        application:
          'Confirmar se, resolvido esse ponto dentro das condições reais, existe outro impedimento relevante para avançar.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.evidence_based_reassurance',
    kind: 'technique',
    title: 'Reforço por evidência',
    objective:
      'Reduzir incerteza usando apenas prova, política, capacidade ou evidência oficial pertinente ao receio do cliente.',
    description:
      'Responde insegurança com fatos verificáveis da empresa ou do produto, sem promessas vagas nem garantia de resultado.',
    situations: [
      'uncertainty_handling',
      'trust_objection',
      'value_explanation',
      'product_fit',
    ],
    signals: [
      'uncertainty_open',
      'claim_requires_company_knowledge',
    ],
    when_to_use: [
      'Existe incerteza ou necessidade de confiança que pode ser respondida com conhecimento oficial relevante.',
    ],
    when_not_to_use: [
      'Não há evidência oficial suficiente para sustentar a afirmação.',
    ],
    risks: [
      'Transformar prova em promessa ou usar evidência irrelevante para a preocupação real.',
    ],
    examples: [
      {
        situation:
          'Cliente demonstra receio sobre implantação ou suporte.',
        application:
          'Usar somente a informação oficial diretamente ligada a implantação ou suporte e explicar como ela responde ao receio.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.stakeholder_mapping',
    kind: 'technique',
    title: 'Mapeamento de decisão',
    objective:
      'Entender quem participa, influencia, aprova ou usa a solução quando a decisão depende de mais de uma pessoa.',
    description:
      'Organiza o processo decisório sem presumir que o interlocutor atual controla sozinho a compra.',
    situations: [
      'third_party_referral',
      'intermediary_contact',
      'stakeholder_gap',
      'complex_decision',
    ],
    signals: [
      'intermediary_detected',
      'third_party_prospect',
      'missing_decision_process',
    ],
    when_to_use: [
      'Há terceiros explícitos ou sinais de que outra pessoa participa da decisão.',
    ],
    when_not_to_use: [
      'A decisão é individual e isso já está comprovado.',
    ],
    risks: [
      'Forçar acesso a terceiros sem necessidade ou consentimento.',
    ],
    examples: [
      {
        situation:
          'Interlocutor precisa validar com sócio, cônjuge, gestor ou área técnica.',
        application:
          'Entender o papel de cada pessoa e combinar o próximo passo adequado sem tratar o interlocutor como mero obstáculo.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.commitment_ladder',
    kind: 'technique',
    title: 'Escada de compromisso',
    objective:
      'Converter intenção em um próximo compromisso pequeno, claro e proporcional ao estágio real da negociação.',
    description:
      'Avança uma etapa por vez, buscando a menor decisão útil que move a venda sem pressionar por um fechamento prematuro.',
    situations: [
      'next_step_choice',
      'close_execution',
      'discovery_complete',
    ],
    signals: [
      'customer_intent_hot',
      'microcommitment_available',
    ],
    when_to_use: [
      'O cliente já demonstrou intenção e existe um próximo passo concreto menor que o fechamento final.',
    ],
    when_not_to_use: [
      'O cliente já pediu explicitamente para fechar e não há bloqueio pendente.',
    ],
    risks: [
      'Adicionar etapas desnecessárias e esfriar uma decisão que já está pronta.',
    ],
    examples: [
      {
        situation:
          'Cliente quer avançar, mas ainda falta escolher uma opção, reunião, visita ou confirmação operacional.',
        application:
          'Pedir somente esse próximo compromisso em vez de reiniciar descoberta ou exigir decisão maior.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.explicit_close_execution',
    kind: 'technique',
    title: 'Execução do fechamento explícito',
    objective:
      'Responder a uma intenção clara de compra executando o próximo passo necessário sem reiniciar descoberta já concluída.',
    description:
      'Quando o cliente já decidiu avançar, reduz perguntas desnecessárias e concentra a conversa no requisito operacional real para concluir.',
    situations: [
      'close_execution',
      'next_step_choice',
    ],
    signals: [
      'customer_intent_hot',
      'explicit_close_intent',
      'late_discovery_after_close_intent',
    ],
    when_to_use: [
      'Existe intenção explícita de contratar, comprar, assinar ou concluir.',
    ],
    when_not_to_use: [
      'Ainda existe objeção, condição essencial ou requisito não resolvido que impede o fechamento.',
    ],
    risks: [
      'Confundir curiosidade com intenção real de fechamento.',
    ],
    examples: [
      {
        situation:
          'Cliente pergunta como assinar ou confirma que quer contratar.',
        application:
          'Executar o passo operacional necessário e não voltar a uma descoberta genérica.',
      },
    ],
  }),

  generalEntry({
    id: 'technique.comparison_by_criteria',
    kind: 'technique',
    title: 'Comparação por critérios',
    objective:
      'Comparar alternativas pelos critérios que o cliente declarou importantes, não por uma lista genérica de recursos.',
    description:
      'Estrutura trade-offs de forma transparente e ancora a comparação em critérios reais e conhecimento oficial.',
    situations: [
      'comparison_context',
      'value_explanation',
      'product_choice',
    ],
    signals: [
      'customer_comparing_options',
      'decision_criteria_known',
      'claim_requires_company_knowledge',
    ],
    when_to_use: [
      'O cliente está comparando alternativas e existem critérios conhecidos para orientar a comparação.',
    ],
    when_not_to_use: [
      'Os critérios ainda não foram esclarecidos.',
    ],
    risks: [
      'Manipular comparação omitindo limitações ou usando afirmações não publicadas.',
    ],
    examples: [
      {
        situation:
          'Cliente compara duas opções com prioridades diferentes.',
        application:
          'Comparar somente pelos critérios declarados e explicitar trade-offs e limitações relevantes.',
      },
    ],
  }),

  generalEntry({
    id: 'anti_pattern.repeat_completed_action',
    kind: 'anti_pattern',
    title: 'Repetir ação já executada',
    objective:
      'Impedir que o vendedor refaça pergunta, envio ou orientação que já aconteceu na conversa.',
    description:
      'Anti-padrão que aparece quando o sistema confunde pendência da venda com pendência de ação do vendedor.',
    situations: [
      'duplicate_followup',
      'waiting_for_customer',
    ],
    signals: [
      'seller_action_already_performed',
      'waiting_on_customer',
    ],
    when_to_use: [
      'Como restrição de reasoning quando a mesma ação já está comprovada no histórico atual.',
    ],
    when_not_to_use: [
      'A ação anterior ficou incompleta, inválida ou precisa ser corrigida por fato novo.',
    ],
    risks: [
      'Gerar sensação de automação burra e pressionar o cliente.',
    ],
    examples: [
      {
        situation:
          'Vendedor já perguntou o horário e o cliente ainda não respondeu.',
        application:
          'Bloquear recomendação de repetir “qual horário prefere?” e considerar espera ou escolha guiada quando houver opções concretas.',
      },
    ],
  }),

  generalEntry({
    id: 'risk.premature_stage_advance',
    kind: 'risk',
    title: 'Avanço prematuro de etapa',
    objective:
      'Evitar que linguagem comercial superficial seja confundida com negociação real.',
    description:
      'Exige sinais combinados de jornada antes de promover estágio ou recomendar fechamento.',
    situations: [
      'stage_inference',
    ],
    signals: [
      'single_weak_signal',
      'missing_transaction_evidence',
    ],
    when_to_use: [
      'Como guard quando apenas uma palavra isolada como preço ou plano aparece.',
    ],
    when_not_to_use: [
      'Existem sinais fortes combinados de compra, pagamento, proposta, contrato ou fechamento.',
    ],
    risks: [
      'Inflar pipeline e produzir orientação agressiva sem base.',
    ],
    examples: [
      {
        situation:
          'Conversa pessoal menciona o preço do almoço.',
        application:
          'Não promover relevância ou estágio por palavra isolada.',
      },
    ],
  }),

  generalEntry({
    id: 'principle.company_rules_before_claim',
    kind: 'principle',
    title: 'Regra da empresa antes da afirmação',
    objective:
      'Garantir que condição, promessa, pagamento e limitação venham do conhecimento oficial da empresa.',
    description:
      'Toda resposta factual específica deve respeitar produtos, fatos, políticas, limites e objection guides publicados.',
    situations: [
      'company_policy',
      'payment_rule',
      'product_claim',
      'objection_handling',
    ],
    signals: [
      'claim_requires_company_knowledge',
      'policy_question',
    ],
    when_to_use: [
      'A orientação depende de regra, preço, condição, promessa ou capacidade do produto.',
    ],
    when_not_to_use: [
      'A decisão é puramente relacional e não exige afirmar regra específica.',
    ],
    risks: [
      'Inventar condição comercial ou funcionalidade.',
      'Usar técnica geral contra regra específica da empresa.',
    ],
    examples: [
      {
        situation:
          'Cliente pergunta por forma de pagamento alternativa.',
        application:
          'Consultar payment_conditions e fatos oficiais antes de sugerir qualquer alternativa.',
      },
    ],
  }),
] as const

function companyEntry({
  companyId,
  configVersionId,
  sourceType,
  sourceId,
  id,
  title,
  objective,
  description,
  situations,
  signals,
  whenToUse,
  whenNotToUse,
  risks,
  productId = null,
}: {
  companyId: string
  configVersionId: string | null
  sourceType:
    | 'commercial_config'
    | 'sales_method'
    | 'official_fact'
    | 'objection_guide'
    | 'seller_guideline'
    | 'product_profile'
  sourceId: string | null
  id: string
  title: string
  objective: string
  description: string
  situations: string[]
  signals: string[]
  whenToUse: string[]
  whenNotToUse: string[]
  risks: string[]
  productId?: string | null
}): CommercialIntelligenceEntry {
  return validateCommercialIntelligenceEntry({
    contract_version:
      COMMERCIAL_INTELLIGENCE_CONTRACT_VERSION,
    id,
    kind:
      'company_knowledge',
    scope:
      productId
        ? 'product'
        : 'company',
    title,
    objective,
    description,
    situations:
      unique(situations),
    signals:
      unique(signals),
    when_to_use:
      unique(whenToUse),
    when_not_to_use:
      unique(whenNotToUse),
    risks:
      unique(risks),
    examples: [],
    provenance: {
      source_type:
        sourceType,
      source_id:
        sourceId,
      company_id:
        companyId,
      product_id:
        productId,
      config_version_id:
        configVersionId,
    },
  })
}

function productName(
  product:
    CompanionDiagnosticInput[
      'commercial_context'
    ]['products'][number],
): string {
  return (
    product.name ??
    product.definition?.name ??
    product.product_id
  )
}

export function buildCompanyCommercialIntelligence(
  input: CompanionDiagnosticInput,
): CommercialIntelligenceEntry[] {
  const context =
    input.commercial_context

  const companyId =
    input.company_id

  const configVersionId =
    context.config_version_id

  const entries:
    CommercialIntelligenceEntry[] = []

  if (
    context.business_description ||
    context.target_audience ||
    context.value_proposition
  ) {
    entries.push(
      companyEntry({
        companyId,
        configVersionId,
        sourceType:
          'commercial_config',
        sourceId:
          configVersionId,
        id:
          `company.${companyId}.positioning`,
        title:
          'Posicionamento comercial publicado',
        objective:
          'Manter a condução alinhada ao negócio, público e proposta de valor da empresa.',
        description: [
          context.business_description,
          context.target_audience,
          context.value_proposition,
        ]
          .filter(Boolean)
          .join(' | '),
        situations: [
          'positioning',
          'value_explanation',
        ],
        signals: [
          'claim_requires_company_knowledge',
        ],
        whenToUse: [
          'Ao explicar valor, adequação ou posicionamento da oferta.',
        ],
        whenNotToUse: [],
        risks: [
          'Reduzir posicionamento a promessa não publicada.',
        ],
      }),
    )
  }

  if (context.sales_method.configured) {
    entries.push(
      companyEntry({
        companyId,
        configVersionId,
        sourceType:
          'sales_method',
        sourceId:
          context.config_version_id,
        id:
          `company.${companyId}.sales-method`,
        title:
          context.sales_method.name ??
          'Método comercial publicado',
        objective:
          'Respeitar a sequência, princípios e critérios do método comercial da empresa sem transformá-lo em roteiro rígido.',
        description: [
          context.sales_method.description,
          ...context.sales_method.principles,
          ...context.sales_method.steps.map(
            step => [
              `Etapa ${step.step_order}: ${step.name}.`,
              `Objetivo: ${step.objective}.`,
              step.completion_criteria.length > 0
                ? `Critérios de conclusão: ${step.completion_criteria.join('; ')}.`
                : null,
              step.recommended_questions.length > 0
                ? `Perguntas recomendadas: ${step.recommended_questions.join('; ')}.`
                : null,
            ]
              .filter(Boolean)
              .join(' '),
          ),
        ]
          .filter(Boolean)
          .join(' | '),
        situations: [
          'method_alignment',
          'stage_reasoning',
        ],
        signals: [
          'method_configured',
        ],
        whenToUse: [
          'Ao avaliar qualidade da condução e decidir o próximo movimento comercial.',
        ],
        whenNotToUse: [
          'Quando a sessão atual não possui relevância comercial confirmada.',
        ],
        risks: [
          'Aplicar etapas de forma mecânica ignorando evidência espontânea.',
        ],
      }),
    )
  }

  context.required_behaviors.forEach(
    (behavior, index) => {
      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'seller_guideline',
          sourceId:
            `required:${index + 1}`,
          id:
            `company.${companyId}.required-behavior.${index + 1}`,
          title:
            'Comportamento obrigatório do vendedor',
          objective:
            'Aplicar uma diretriz obrigatória publicada pela empresa.',
          description:
            behavior,
          situations: [
            'seller_behavior',
          ],
          signals: [
            'seller_guideline_relevant',
          ],
          whenToUse: [
            'Quando a conduta avaliada estiver no escopo desta diretriz.',
          ],
          whenNotToUse: [],
          risks: [
            'Ignorar uma regra explícita da empresa.',
          ],
        }),
      )
    },
  )

  context.prohibited_behaviors.forEach(
    (behavior, index) => {
      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'seller_guideline',
          sourceId:
            `prohibited:${index + 1}`,
          id:
            `company.${companyId}.prohibited-behavior.${index + 1}`,
          title:
            'Comportamento proibido pela empresa',
          objective:
            'Bloquear conduta incompatível com a política comercial publicada.',
          description:
            behavior,
          situations: [
            'seller_behavior',
            'risk_control',
          ],
          signals: [
            'seller_guideline_relevant',
          ],
          whenToUse: [
            'Sempre que uma recomendação puder entrar em conflito com esta proibição.',
          ],
          whenNotToUse: [],
          risks: [
            'Recomendar uma ação explicitamente proibida.',
          ],
        }),
      )
    },
  )

  context.facts
    .filter(
      fact =>
        fact.validity_status ===
          'current',
    )
    .forEach(
      (fact) => {
        entries.push(
          companyEntry({
            companyId,
            configVersionId,
            sourceType:
              'official_fact',
            sourceId:
              fact.fact_key,
            id:
              `company.${companyId}.fact.${fact.fact_key}`,
            title:
              `Fato oficial: ${fact.fact_key}`,
            objective:
              'Groundear afirmações comerciais em informação oficial vigente.',
            description:
              `${fact.fact_value}${fact.source_note ? ` | Fonte: ${fact.source_note}` : ''}`,
            situations: [
              'company_policy',
              'factual_answer',
            ],
            signals: [
              'claim_requires_company_knowledge',
            ],
            whenToUse: [
              'Quando a pergunta ou orientação depender deste fato específico.',
            ],
            whenNotToUse: [
              'Quando o fato não responde ao assunto atual.',
            ],
            risks: [
              'Usar fato fora do contexto ou depois de perder validade.',
            ],
          }),
        )
      },
    )

  context.objection_guides.forEach(
    (guide, index) => {
      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'objection_guide',
          sourceId:
            `objection:${index + 1}`,
          id:
            `company.${companyId}.objection.${index + 1}`,
          title:
            `Guia de objeção: ${guide.objection}`,
          objective:
            'Tratar a objeção respeitando descoberta, abordagem e limites publicados pela empresa.',
          description: [
            guide.recommended_approach,
            ...guide.discovery_questions,
          ]
            .filter(Boolean)
            .join(' | '),
          situations: [
            'objection_handling',
          ],
          signals: [
            ...guide.signals,
            'objection_open',
          ],
          whenToUse: [
            `Quando a objeção atual corresponder a: ${guide.objection}.`,
          ],
          whenNotToUse: [
            ...guide.response_limits,
          ],
          risks: [
            'Aplicar o guia a uma objeção diferente apenas por semelhança superficial.',
          ],
        }),
      )
    },
  )

  context.products.forEach(
    (product) => {
      const name =
        productName(product)

      entries.push(
        companyEntry({
          companyId,
          configVersionId,
          sourceType:
            'product_profile',
          sourceId:
            product.product_id,
          id:
            `company.${companyId}.product.${product.product_id}`,
          title:
            `Conhecimento do produto: ${name}`,
          objective:
            'Usar somente atributos, condições e limites publicados para este produto.',
          description: [
            `Produto: ${name}.`,
            product.category
              ? `Categoria: ${product.category}.`
              : null,
            product.indicated_audiences.length > 0
              ? `Indicado para: ${product.indicated_audiences.join('; ')}.`
              : null,
            product.needs_addressed.length > 0
              ? `Necessidades atendidas: ${product.needs_addressed.join('; ')}.`
              : null,
            product.benefits.length > 0
              ? `Benefícios publicados: ${product.benefits.join('; ')}.`
              : null,
            product.verified_differentiators.length > 0
              ? `Diferenciais verificados: ${product.verified_differentiators.join('; ')}.`
              : null,
            product.contract_conditions.length > 0
              ? `Condições contratuais: ${product.contract_conditions.join('; ')}.`
              : null,
            product.payment_conditions.length > 0
              ? `Condições de pagamento: ${product.payment_conditions.join('; ')}.`
              : null,
            product.allowed_claims.length > 0
              ? `Afirmações permitidas: ${product.allowed_claims.join('; ')}.`
              : null,
            product.limitations.length > 0
              ? `Limitações: ${product.limitations.join('; ')}.`
              : null,
          ]
            .filter(Boolean)
            .join(' | '),
          situations: [
            'product_fit',
            'product_claim',
            'payment_rule',
          ],
          signals: [
            'claim_requires_company_knowledge',
            `product:${product.product_id}`,
          ],
          whenToUse: [
            `Quando ${name} estiver realmente em discussão ou comparação.`,
          ],
          whenNotToUse: [
            ...product.limitations,
            ...product.forbidden_claims,
          ],
          risks: [
            'Inventar benefício, condição ou promessa não publicada.',
          ],
          productId:
            product.product_id,
        }),
      )
    },
  )

  return entries
}

function normalizeMatchText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function intersection(
  left: string[],
  right: string[],
): string[] {
  const normalizedRight =
    new Map(
      right.map(
        value => [
          normalizeMatchText(value),
          value,
        ],
      ),
    )

  return unique(
    left
      .map(value => ({
        original: value,
        normalized:
          normalizeMatchText(value),
      }))
      .filter(
        item =>
          normalizedRight.has(
            item.normalized,
          ),
      )
      .map(item => item.original),
  )
}

function objectiveMatches(
  entry: CommercialIntelligenceEntry,
  objectives: string[],
): string[] {
  const haystack =
    normalizeMatchText(
      `${entry.objective} ${entry.description} ${entry.title}`,
    )

  return unique(
    objectives.filter(
      objective => {
        const normalized =
          normalizeMatchText(objective)

        return (
          normalized.length >= 3 &&
          haystack.includes(normalized)
        )
      },
    ),
  )
}

function isEntryVisible(
  entry: CommercialIntelligenceEntry,
  query: CommercialIntelligenceQuery,
): boolean {
  if (entry.scope === 'general') {
    return true
  }

  if (
    entry.provenance.company_id !==
    query.company_id
  ) {
    return false
  }

  if (entry.scope === 'company') {
    return true
  }

  return Boolean(
    entry.provenance.product_id &&
    query.product_ids.includes(
      entry.provenance.product_id,
    ),
  )
}

export function rankCommercialIntelligence({
  entries,
  query,
}: {
  entries: readonly CommercialIntelligenceEntry[]
  query: CommercialIntelligenceQuery
}): RankedCommercialIntelligenceEntry[] {
  const limit =
    Math.max(
      1,
      Math.min(
        query.limit ?? 8,
        20,
      ),
    )

  return entries
    .filter(
      entry =>
        isEntryVisible(
          entry,
          query,
        ),
    )
    .map(
      (entry) => {
        const matchedSignals =
          intersection(
            entry.signals,
            query.signals,
          )

        const matchedSituations =
          intersection(
            entry.situations,
            query.situations,
          )

        const matchedObjectives =
          objectiveMatches(
            entry,
            query.objectives,
          )

        let score = 0
        const reasons: string[] = []

        if (matchedSignals.length > 0) {
          score +=
            matchedSignals.length * 5
          reasons.push(
            `Sinais compatíveis: ${matchedSignals.join(', ')}.`,
          )
        }

        if (matchedSituations.length > 0) {
          score +=
            matchedSituations.length * 4
          reasons.push(
            `Situações compatíveis: ${matchedSituations.join(', ')}.`,
          )
        }

        if (matchedObjectives.length > 0) {
          score +=
            matchedObjectives.length * 3
          reasons.push(
            `Objetivos compatíveis: ${matchedObjectives.join(', ')}.`,
          )
        }

        if (entry.scope === 'product') {
          score += 2
          reasons.push(
            'Conhecimento específico do produto em discussão.',
          )
        } else if (entry.scope === 'company') {
          score += 1
          reasons.push(
            'Conhecimento publicado da empresa.',
          )
        }

        return {
          entry,
          score,
          matched_signals:
            matchedSignals,
          matched_situations:
            matchedSituations,
          matched_objectives:
            matchedObjectives,
          ranking_reasons:
            reasons,
        }
      },
    )
    .filter(
      item => item.score > 0,
    )
    .sort(
      (left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score
        }

        if (
          left.entry.scope !==
          right.entry.scope
        ) {
          const scopeRank = {
            product: 3,
            company: 2,
            general: 1,
          } as const

          return (
            scopeRank[right.entry.scope] -
            scopeRank[left.entry.scope]
          )
        }

        return left.entry.id.localeCompare(
          right.entry.id,
          'en',
        )
      },
    )
    .slice(0, limit)
}

export function buildCommercialIntelligenceLibrary(
  input: CompanionDiagnosticInput,
): CommercialIntelligenceEntry[] {
  return [
    ...GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
    ...buildCompanyCommercialIntelligence(
      input,
    ),
  ]
}
