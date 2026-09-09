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
 * @property {Array<{source: string, priority: 'critical'|'high'|'medium'|'low', reason: string, recommendedAction: string, expiresAt: string|null, resolveCondition: string|null, evidenceRefs: string[], createdAt: string, relatedLead: string, relatedCycle: string}>} interventionCards - AGORA: no máximo 2. Contrato, seção 4.3: todo card precisa de `expiresAt` (timestamp válido) OU `resolveCondition` (string não vazia), `evidenceRefs` não vazio (seção 12 item 5), `createdAt` (timestamp válido), `relatedLead` e `relatedCycle` — que precisam ser exatamente o `leadId`/`cycleId` do próprio cenário (achado do Codex, 8ª revisão): uma string não vazia qualquer não prova isolamento, só a identidade correta prova.
 *
 * Todo cenário tem `leadId`/`cycleId` de nível superior representando o
 * lead/ciclo ATUAL da sessão (`null` quando o cenário não tem identidade
 * individual, como o cenário 9 — grupo). `relatedLead`/`relatedCycle` de
 * qualquer card precisam ser idênticos a esses valores; um cenário com
 * cards mas sem `leadId`/`cycleId` próprios não tem como provar a quem os
 * cards pertencem.
 *
 * Todo item de `cliente.memoryItems` também tem `scope`: `'person'`
 * (sobrevive entre ciclos — preferências, sensibilidade a preço realmente
 * evidenciada, canal preferido) ou `'cycle'` (pertence só à oportunidade
 * atual — timing, agenda, descoberta pendente desta negociação; contrato,
 * seção 9/11 item 8). Um fato `cycle`-scoped nunca deve ser promovido
 * silenciosamente a `person`-scoped.
 */

export const PHASE16_SCENARIOS = [
  {
    id: 'scenario-1-active-sale-price-objection',
    leadId: 'lead-scenario-1',
    cycleId: 'cycle-scenario-1',
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
          scope: 'person',
          evidenceRefs: ['message-1'],
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
    leadId: 'lead-scenario-2',
    cycleId: 'cycle-scenario-2',
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
    // Nota (achado do Codex, 3ª revisão): "proposta enviada com preço e
    // pendência aberta" descreve a oportunidade (venda) — pertence a
    // ANÁLISE/Opportunity Reading, já representada acima em
    // analise.opportunityReadingPresent/opportunity.preserved. Um fato
    // sobre a PESSOA aqui, não sobre o estado da venda.
    cliente: {
      customerMemoryPresent: true,
      memoryItems: [
        {
          fact: 'Prefere confirmações por escrito antes de avançar.',
          origin: 'opportunity_history',
          observedAt: '2026-08-18T14:00:00-03:00',
          status: 'active',
          scope: 'person',
          evidenceRefs: ['message-scenario-2-1'],
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
    leadId: 'lead-scenario-3',
    cycleId: 'cycle-scenario-3',
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
          evidenceRefs: ['agenda-event-2026-08-22-1600'],
          createdAt: '2026-08-22T09:00:00-03:00',
          relatedLead: 'lead-scenario-3',
          relatedCycle: 'cycle-scenario-3',
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
          scope: 'cycle',
          evidenceRefs: ['agenda-event-2026-08-22-1600'],
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
    leadId: 'lead-scenario-4',
    cycleId: 'cycle-scenario-4',
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
          evidenceRefs: ['inbound-event-lead-created'],
          createdAt: '2026-08-20T08:00:00-03:00',
          relatedLead: 'lead-scenario-4',
          relatedCycle: 'cycle-scenario-4',
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
    leadId: 'lead-scenario-5',
    cycleId: 'cycle-scenario-5',
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
          evidenceRefs: ['message-2'],
          createdAt: '2026-08-21T10:16:00-03:00',
          relatedLead: 'lead-scenario-5',
          relatedCycle: 'cycle-scenario-5',
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
          scope: 'cycle',
          evidenceRefs: ['message-2'],
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
    leadId: 'lead-scenario-6',
    cycleId: 'cycle-scenario-6',
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
          evidenceRefs: ['message-support-1'],
          createdAt: '2026-08-15T11:00:00-03:00',
          relatedLead: 'lead-scenario-6',
          relatedCycle: 'cycle-scenario-6',
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
          scope: 'person',
          evidenceRefs: ['message-support-1'],
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
    leadId: 'lead-scenario-7',
    cycleId: 'cycle-scenario-7',
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
          scope: 'cycle',
          evidenceRefs: ['memory-scenario-7-old'],
        },
        {
          fact: 'Decisão adiada para o mês que vem.',
          origin: 'current_conversation',
          observedAt: '2026-08-21T10:20:00-03:00',
          status: 'active',
          scope: 'cycle',
          evidenceRefs: ['message-scenario-7-new'],
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
    leadId: 'lead-b',
    cycleId: 'cycle-b',
    title: 'Isolamento A → B',
    session: { commercial: true, isGroup: false },
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
    leadId: null,
    cycleId: null,
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
    leadId: 'lead-scenario-10',
    cycleId: 'cycle-scenario-10',
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
