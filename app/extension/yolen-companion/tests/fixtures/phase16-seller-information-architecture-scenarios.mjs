// Projeção machine-readable dos cenários canônicos da FASE 16.1.
//
// Fonte narrativa (fonte principal): ../../../../../docs/companion-v2/product/
// phase16-seller-information-architecture-scenarios.md — os 10 cenários
// abaixo têm o mesmo `id` e a mesma numeração daquele documento. Qualquer
// mudança de um lado precisa ser refletida no outro.
//
// Este arquivo é contrato normativo desta fase, não runtime de produção:
// nenhum dos campos abaixo (`agora`, `analise`, `cliente`, `mensagem`,
// `operationalSignal`, `isolation`, `group`) corresponde a uma tabela, tipo
// TypeScript ou motor real ainda existente. Eles existem para que
// `phase16-seller-information-architecture-contract.test.mjs` possa
// verificar deterministicamente que os cenários respeitam a fronteira das
// quatro áreas (contrato de produto, seção 2) — e para impedir que uma
// edição futura desta fixture reintroduza a confusão que motivou a FASE
// 16.1 sem quebrar o gate de teste.

/**
 * @typedef {Object} ScenarioArea
 * @property {string|null} primaryDecision - AGORA: no máximo uma decisão principal (nunca array).
 * @property {Array<{source: string, priority: 'critical'|'high'|'medium'|'low', reason: string, recommendedAction: string, expiresAt: string|null, resolveCondition: string|null}>} interventionCards - AGORA: no máximo 2. Contrato, seção 4.3: todo card precisa de `expiresAt` OU `resolveCondition` (ciclo de vida).
 */

export const PHASE16_SCENARIOS = [
  {
    id: 'scenario-1-active-sale-price-objection',
    title: 'Venda ativa / pergunta de preço',
    session: { commercial: true, isGroup: false },
    operationalSignal: { present: false, type: null },
    opportunity: { active: true, preserved: true },
    agora: {
      momentoAtual: 'Cliente questionou o investimento.',
      primaryDecision: 'Entenda o que está pesando antes de oferecer condição.',
      interventionCards: [],
      proactive: false,
      treatsSessionAsCommercial: true,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['current_conversation', 'persisted_state'],
      includesCoaching: true,
      includesMethod: true,
      includesRisks: true,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: true,
      memoryItems: [
        {
          fact: 'Sensibilidade a preço evidenciada nesta conversa.',
          origin: 'current_conversation',
          observedAt: '2026-08-21T10:15:00-03:00',
          status: 'active',
        },
      ],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
  {
    id: 'scenario-2-personal-conversation-active-opportunity',
    title: 'Conversa pessoal + oportunidade ativa',
    session: { commercial: false, isGroup: false },
    operationalSignal: { present: false, type: null },
    opportunity: { active: true, preserved: true },
    agora: {
      momentoAtual: 'Conversa pessoal.',
      primaryDecision: null,
      interventionCards: [],
      proactive: false,
      treatsSessionAsCommercial: false,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['persisted_state', 'opportunity_history'],
      includesCoaching: true,
      includesMethod: true,
      includesRisks: true,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: true,
      memoryItems: [
        {
          fact: 'Proposta enviada com preço e pendência aberta.',
          origin: 'opportunity_history',
          observedAt: '2026-08-18T14:00:00-03:00',
          status: 'active',
        },
      ],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
  {
    id: 'scenario-3-personal-conversation-upcoming-commercial-agenda',
    title: 'Conversa pessoal + agenda comercial próxima',
    session: { commercial: false, isGroup: false },
    operationalSignal: { present: true, type: 'agenda' },
    opportunity: { active: true, preserved: true },
    agora: {
      momentoAtual: 'Conversa pessoal.',
      primaryDecision: null,
      interventionCards: [
        {
          source: 'agenda',
          priority: 'high',
          reason: 'Existe retorno comercial agendado para hoje às 16h.',
          recommendedAction: 'Confirmar o retorno comercial das 16h.',
          expiresAt: '2026-08-22T16:00:00-03:00',
          resolveCondition: null,
        },
      ],
      proactive: true,
      treatsSessionAsCommercial: false,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['persisted_state', 'opportunity_history'],
      includesCoaching: true,
      includesMethod: true,
      includesRisks: true,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: true,
      memoryItems: [
        {
          fact: 'Retorno comercial agendado para hoje às 16h.',
          origin: 'agenda',
          observedAt: '2026-08-22T09:00:00-03:00',
          status: 'active',
        },
      ],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
  {
    id: 'scenario-4-priority-inbound-without-new-message',
    title: 'Inbound prioritário sem mensagem',
    session: { commercial: false, isGroup: false },
    operationalSignal: { present: true, type: 'inbound' },
    opportunity: { active: false, preserved: true },
    agora: {
      momentoAtual: 'Nenhuma mensagem nova nesta sessão.',
      primaryDecision: null,
      interventionCards: [
        {
          source: 'inbound',
          priority: 'high',
          reason: 'Lead inbound sem primeiro contato há tempo suficiente para exigir ação.',
          recommendedAction: 'Fazer o primeiro contato agora.',
          expiresAt: null,
          resolveCondition: 'primeiro_contato_realizado',
        },
      ],
      proactive: true,
      treatsSessionAsCommercial: false,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['persisted_state'],
      includesCoaching: false,
      includesMethod: false,
      includesRisks: false,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: false,
      memoryItems: [],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
  {
    id: 'scenario-5-seller-off-method',
    title: 'Vendedor saindo do método',
    session: { commercial: true, isGroup: false },
    operationalSignal: { present: false, type: null },
    opportunity: { active: true, preserved: true },
    agora: {
      momentoAtual: 'Preço apresentado antes de confirmar o impacto.',
      primaryDecision: null,
      interventionCards: [
        {
          source: 'off_method',
          priority: 'high',
          reason: 'Preço foi apresentado antes de confirmar o impacto do problema.',
          recommendedAction: 'Retome a descoberta antes de defender preço.',
          expiresAt: null,
          resolveCondition: 'descoberta_de_impacto_confirmada',
        },
      ],
      proactive: false,
      treatsSessionAsCommercial: true,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['current_conversation', 'persisted_state'],
      includesCoaching: true,
      includesMethod: true,
      includesRisks: true,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: true,
      memoryItems: [
        {
          fact: 'Impacto do problema ainda não confirmado.',
          origin: 'current_conversation',
          observedAt: '2026-08-21T10:16:00-03:00',
          status: 'active',
        },
      ],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
  {
    id: 'scenario-6-support-administrative-active-opportunity',
    title: 'Suporte/administrativo + oportunidade ativa',
    session: { commercial: false, isGroup: false },
    operationalSignal: { present: true, type: 'support' },
    opportunity: { active: true, preserved: true },
    agora: {
      momentoAtual: 'Cliente trata de um assunto de suporte/administrativo.',
      primaryDecision: null,
      interventionCards: [
        {
          source: 'support',
          priority: 'medium',
          reason: 'Assunto operacional identificado (contrato/boleto/suporte).',
          recommendedAction: 'Encaminhar para o time de suporte.',
          expiresAt: null,
          resolveCondition: 'assunto_de_suporte_resolvido',
        },
      ],
      proactive: false,
      treatsSessionAsCommercial: false,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['persisted_state', 'opportunity_history'],
      includesCoaching: true,
      includesMethod: true,
      includesRisks: true,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: true,
      // Nota (achado do Codex na revisão desta PR): o estado "oportunidade
      // ativa" é venda (ANÁLISE/Opportunity Reading — já representado acima
      // em analise.opportunityReadingPresent/opportunity.preserved), não
      // memória sobre a pessoa. Colocá-lo aqui violaria a fronteira
      // ANÁLISE=VENDA / CLIENTE=PESSOA que este próprio contrato formaliza.
      memoryItems: [
        {
          fact: 'Prefere tratar assuntos administrativos por e-mail.',
          origin: 'current_conversation',
          observedAt: '2026-08-15T11:00:00-03:00',
          status: 'active',
        },
      ],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
  {
    id: 'scenario-7-contradicted-old-memory',
    title: 'Memória antiga contradita',
    session: { commercial: true, isGroup: false },
    operationalSignal: { present: false, type: null },
    opportunity: { active: true, preserved: true },
    agora: {
      momentoAtual: 'Cliente adiou a decisão para o mês que vem.',
      primaryDecision: 'Registrar o novo prazo e ajustar a condução.',
      interventionCards: [],
      proactive: false,
      treatsSessionAsCommercial: true,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['current_conversation', 'persisted_state'],
      includesCoaching: false,
      includesMethod: false,
      includesRisks: true,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: true,
      memoryItems: [
        {
          fact: 'Pretendia decidir na sexta.',
          origin: 'opportunity_history',
          observedAt: '2026-08-14T09:00:00-03:00',
          status: 'superseded',
        },
        {
          fact: 'Decisão adiada para o mês que vem.',
          origin: 'current_conversation',
          observedAt: '2026-08-21T10:20:00-03:00',
          status: 'active',
        },
      ],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
  {
    id: 'scenario-8-lead-isolation-a-to-b',
    title: 'Isolamento A → B',
    session: { commercial: true, isGroup: false },
    // Campo de topo (fora do bloco opcional `isolation`) para que a
    // validação exija o bloco de isolamento em vez de só verificar seu
    // conteúdo quando ele existe — remover o bloco `isolation` inteiro
    // deve quebrar o gate, não passar silenciosamente.
    isolationRequired: true,
    operationalSignal: { present: false, type: null },
    // O Lead B começa sem histórico de oportunidade próprio nesta projeção
    // — o ponto do cenário é que nada de A atravessa para B, não que B já
    // tenha uma oportunidade ativa preservada.
    opportunity: { active: false, preserved: false },
    agora: {
      momentoAtual: 'Sessão do Lead B, recalculada do zero.',
      primaryDecision: null,
      interventionCards: [],
      proactive: false,
      treatsSessionAsCommercial: true,
    },
    analise: {
      opportunityReadingPresent: true,
      basedOn: ['current_conversation'],
      includesCoaching: false,
      includesMethod: false,
      includesRisks: false,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: false,
      memoryItems: [],
      aindaNaoSabemosPresent: true,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
    isolation: { crossLeadLeak: false, previousLeadId: 'lead-a', currentLeadId: 'lead-b' },
  },
  {
    id: 'scenario-9-group-conversation',
    title: 'Grupo',
    session: { commercial: false, isGroup: true },
    operationalSignal: { present: false, type: null },
    opportunity: { active: false, preserved: false },
    agora: {
      momentoAtual: 'Conversa de grupo — sem leitura individual.',
      primaryDecision: null,
      interventionCards: [],
      proactive: false,
      treatsSessionAsCommercial: false,
    },
    analise: {
      opportunityReadingPresent: false,
      basedOn: [],
      includesCoaching: false,
      includesMethod: false,
      includesRisks: false,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: false,
      memoryItems: [],
      aindaNaoSabemosPresent: false,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: false,
      ownFactsIntroduced: false,
      output: 'silence',
    },
    group: { individualContextRendered: false },
  },
  {
    id: 'scenario-10-nothing-to-do',
    title: 'Nada para fazer',
    session: { commercial: false, isGroup: false },
    operationalSignal: { present: false, type: null },
    opportunity: { active: false, preserved: false },
    agora: {
      momentoAtual: 'Nenhuma relevância comercial ou sinal operacional nesta sessão.',
      primaryDecision: null,
      interventionCards: [],
      proactive: false,
      treatsSessionAsCommercial: false,
    },
    analise: {
      opportunityReadingPresent: false,
      basedOn: [],
      includesCoaching: false,
      includesMethod: false,
      includesRisks: false,
      reducedToLastBurst: false,
    },
    cliente: {
      customerMemoryPresent: false,
      memoryItems: [],
      aindaNaoSabemosPresent: false,
      containsSellerEvaluation: false,
    },
    mensagem: {
      decisionStateConsumed: true,
      ownFactsIntroduced: false,
      output: 'silence',
    },
  },
]

export default PHASE16_SCENARIOS
