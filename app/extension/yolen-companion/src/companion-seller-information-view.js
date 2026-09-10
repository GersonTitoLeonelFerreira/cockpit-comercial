;(function initCompanionSellerInformationView(root) {
  const METHOD_STATUS_LABELS = {
    completed: 'Concluída',
    active: 'Ativa',
    partial: 'Parcial',
    not_started: 'Não iniciada',
    skipped: 'Pulada',
    not_applicable: 'Não se aplica',
  }

  const METHOD_ADHERENCE_LABELS = {
    on_method: 'Dentro do método',
    partially_on_method: 'Parcialmente dentro do método',
    off_method: 'Fora do método',
    not_configured: 'Método não configurado',
    insufficient_evidence: 'Evidência insuficiente',
  }

  const STRENGTH_KIND_LABELS = {
    answered_question: 'Pergunta respondida',
    good_discovery: 'Boa descoberta',
    correct_information: 'Informação correta',
    respected_space: 'Espaço respeitado',
    method_alignment: 'Aderência ao método',
    clear_explanation: 'Explicação clara',
    handled_objection: 'Objeção bem conduzida',
    confirmed_information: 'Informação confirmada',
    other: 'Acerto observado',
  }

  const IMPROVEMENT_KIND_LABELS = {
    unanswered_question: 'Pergunta sem resposta',
    premature_price: 'Preço apresentado cedo demais',
    premature_presentation: 'Apresentação prematura',
    insufficient_discovery: 'Descoberta insuficiente',
    interrogation: 'Conversa em formato de interrogatório',
    repetition: 'Repetição desnecessária',
    pressure: 'Pressão comercial',
    incorrect_information: 'Informação incorreta',
    poor_objection_handling: 'Objeção mal conduzida',
    advance_without_confirmation: 'Avanço sem confirmação',
    missing_next_commitment: 'Próximo compromisso indefinido',
    method_misapplication: 'Aplicação incorreta do método',
    promise_risk: 'Risco de promessa',
    missed_commitment: 'Compromisso não cumprido',
    other: 'Melhoria observada',
  }

  const RISK_SEVERITY_LABELS = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
  }

  // FASE 16.5 (recalibração seller-facing do AGORA): as tabelas locais de
  // prioridade/tie-break (ATTENTION_PRIORITY_RANK/ATTENTION_SOURCE_RANK),
  // os conjuntos de severidade (CRITICAL_RISK_KINDS/HIGH_IMPROVEMENT_KINDS)
  // e o limiar de "cliente aguardando" (CUSTOMER_WAITING_ATTENTION_MS) que
  // existiam aqui foram removidos — eram uma segunda implementação,
  // independente e já divergente, da mesma priorização que Decision State
  // (canonical-decision-state-source.ts, FASE 16.3E) já computa
  // server-side. AGORA agora consome o AgoraViewModel pronto (ver
  // renderAgoraViewModelSnapshot mais abaixo) em vez de reconstruir a
  // decisão a partir da leitura crua — achado da auditoria da FASE 16.5.

  const AGORA_VIEW_MODEL_STATUS_LABELS = {
    respond: 'Responder agora',
    follow_up: 'Retomar contato',
    handle_objection: 'Objeção em aberto',
    escalate: 'Atenção',
    give_space: 'Dê espaço',
    deepen_discovery: 'Descoberta incompleta',
    no_intervention: 'Nada a fazer agora',
  }

  const AGORA_VIEW_MODEL_STATUS_TONE = {
    escalate: 'risk',
    handle_objection: 'warning',
    deepen_discovery: 'warning',
    respond: 'warning',
    follow_up: 'warning',
    give_space: 'information',
    no_intervention: 'information',
  }

  const PRODUCT_INTEREST_LABELS = {
    discussed: 'Produto discutido',
    interested: 'Interesse demonstrado',
    primary: 'Maior interesse',
  }

  const COMMUNICATION_OBSERVATION_LABELS = {
    event: 'Comportamento observado',
    explicit_preference: 'Preferência explícita',
    pattern: 'Padrão observado',
  }

  const COMMUNICATION_BEHAVIOR_LABELS = {
    short_responses: 'Mensagens objetivas',
    direct_questions: 'Perguntas diretas',
    requests_data_or_numbers: 'Busca dados ou números',
    frequent_audio: 'Uso frequente de áudio',
    prefers_short_explanations: 'Prefere explicações curtas',
    negative_reaction_to_pressure: 'Reação negativa à pressão',
    responds_to_clear_alternatives: 'Responde a alternativas claras',
    other_observed_behavior: 'Outro comportamento observado',
  }

  const MISSING_DISCOVERY_LABELS = {
    objective: 'Objetivo',
    problem: 'Problema',
    impact: 'Impacto',
    need: 'Necessidade',
    budget: 'Orçamento',
    timeline: 'Prazo',
    decision_maker: 'Decisor',
    priority: 'Prioridade',
    decision_criteria: 'Critério de decisão',
    current_process: 'Processo atual',
    product_fit: 'Aderência do produto',
    other: 'Outro ponto',
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function displayText(value) {
    if (typeof value !== 'string') {
      return null
    }

    const clean = value.trim()
    return clean || null
  }

  function displayItems(items) {
    return Array.isArray(items)
      ? items.filter((item) => item && typeof item === 'object')
      : []
  }

  function isNeutralCommercialSession(reading) {
    if (!reading || typeof reading !== 'object') {
      return false
    }

    if (
      reading.commercial_relevance &&
      reading.commercial_relevance !== 'commercial'
    ) {
      return true
    }

    return Boolean(
      reading.commercial_role &&
      reading.commercial_role !== 'buyer',
    )
  }

  function getNeutralSessionCopy(reading) {
    if (reading?.commercial_relevance === 'uncertain') {
      return {
        title: 'Ainda não há evidência comercial suficiente.',
        description: 'Nenhuma ação comercial será recomendada até o contexto ficar claro.',
      }
    }

    return {
      title: 'Conversa sem evidência comercial relevante.',
      description: 'Nenhuma ação comercial necessária.',
    }
  }

  function getMethodStatusLabel(status) {
    return METHOD_STATUS_LABELS[status] || null
  }

  function getMethodAdherenceLabel(status) {
    return METHOD_ADHERENCE_LABELS[status] || null
  }

  function getStatusClass(status) {
    const supported = [
      'completed',
      'active',
      'partial',
      'not_started',
      'skipped',
      'not_applicable',
    ]

    return supported.includes(status)
      ? `yolen-rich-status-${status.replaceAll('_', '-')}`
      : 'yolen-rich-status-neutral'
  }

  function getAdherenceClass(status) {
    const classes = {
      on_method: 'yolen-adherence-on',
      partially_on_method: 'yolen-adherence-partial',
      off_method: 'yolen-adherence-off',
      not_configured: 'yolen-adherence-neutral',
      insufficient_evidence: 'yolen-adherence-neutral',
    }

    return classes[status] || 'yolen-adherence-neutral'
  }

  function renderEvidence(item) {
    const messageCount = Array.isArray(item?.evidence_message_ids)
      ? item.evidence_message_ids.length
      : 0

    const memoryCount = Array.isArray(item?.memory_ids)
      ? item.memory_ids.length
      : 0

    if (messageCount === 0 && memoryCount === 0) {
      return ''
    }

    const parts = []

    if (messageCount > 0) {
      parts.push(
        `${messageCount} ${messageCount === 1 ? 'mensagem' : 'mensagens'} da conversa`,
      )
    }

    if (memoryCount > 0) {
      parts.push(
        `${memoryCount} ${memoryCount === 1 ? 'memória comercial' : 'memórias comerciais'}`,
      )
    }

    return `
      <div class="yolen-seller-evidence">
        Evidência: ${escapeHtml(parts.join(' e '))}
      </div>
    `
  }

  function renderLabeledCopy(label, value) {
    const clean = displayText(value)

    if (!clean) {
      return ''
    }

    return `
      <div class="yolen-seller-detail">
        <div class="yolen-seller-detail-label">${escapeHtml(label)}</div>
        <div class="yolen-seller-detail-copy">${escapeHtml(clean)}</div>
      </div>
    `
  }

  function renderTextList(label, items) {
    const values = Array.isArray(items)
      ? items.map(displayText).filter(Boolean)
      : []

    if (values.length === 0) {
      return ''
    }

    return `
      <div class="yolen-seller-detail">
        <div class="yolen-seller-detail-label">${escapeHtml(label)}</div>
        <ul class="yolen-seller-text-list">
          ${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}
        </ul>
      </div>
    `
  }

  function renderStrengths(strengthsList) {
    const strengths = displayItems(strengthsList)
      .map((item) => ({
        item,
        summary: displayText(item.summary),
        whyItMatters: displayText(item.why_it_matters),
        kindLabel: STRENGTH_KIND_LABELS[item.kind] || STRENGTH_KIND_LABELS.other,
      }))
      .filter((item) => item.summary)

    if (strengths.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="strengths">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Coaching</div>
            <h3>Acertos</h3>
          </div>
          <span class="yolen-seller-count">${strengths.length}</span>
        </div>

        <div class="yolen-seller-stack">
          ${strengths.map(({ item, summary, whyItMatters, kindLabel }) => `
            <article class="yolen-seller-insight yolen-seller-insight--positive">
              <div class="yolen-seller-insight-type">${escapeHtml(kindLabel)}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
              ${renderLabeledCopy('Por que isso importa', whyItMatters)}
              ${renderEvidence(item)}
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderImprovements(improvementsList) {
    const improvements = displayItems(improvementsList)
      .map((item) => ({
        item,
        summary: displayText(item.summary),
        whyItMatters: displayText(item.why_it_matters),
        impact: displayText(item.impact),
        howToImprove: displayText(item.how_to_improve),
        kindLabel: IMPROVEMENT_KIND_LABELS[item.kind] || IMPROVEMENT_KIND_LABELS.other,
      }))
      .filter((item) => item.summary)

    if (improvements.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="improvements">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Coaching</div>
            <h3>Pontos de melhoria</h3>
          </div>
          <span class="yolen-seller-count">${improvements.length}</span>
        </div>

        <div class="yolen-seller-stack">
          ${improvements.map(({ item, summary, whyItMatters, impact, howToImprove, kindLabel }) => `
            <article class="yolen-seller-insight yolen-seller-insight--improvement">
              <div class="yolen-seller-insight-type">${escapeHtml(kindLabel)}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
              ${renderLabeledCopy('Por que isso importa', whyItMatters)}
              ${renderLabeledCopy('Impacto ou risco', impact)}
              ${renderLabeledCopy('Como corrigir', howToImprove)}
              ${renderEvidence(item)}
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function isCurrentMethodStage(stage, currentStage) {
    if (!stage || !currentStage) {
      return false
    }

    if (
      Number.isSafeInteger(stage.step_order) &&
      stage.step_order === currentStage.step_order
    ) {
      return true
    }

    if (stage.stage_key && currentStage.stage_key) {
      return stage.stage_key === currentStage.stage_key
    }

    return Boolean(stage.name && stage.name === currentStage.name)
  }

  function renderMethodStages(method) {
    const currentStage = method?.current_stage

    const stages = displayItems(method?.stages)
      .map((stage) => ({
        ...stage,
        name: displayText(stage.name),
        explanation: displayText(stage.explanation),
        statusLabel: getMethodStatusLabel(stage.status),
      }))
      .filter((stage) => stage.name && stage.statusLabel)
      .sort((left, right) => (left.step_order || 0) - (right.step_order || 0))

    if (stages.length === 0) {
      return ''
    }

    return `
      <div class="yolen-method-stages">
        ${stages.map((stage) => {
          const current = isCurrentMethodStage(stage, currentStage)

          return `
            <div
              class="yolen-method-stage ${current ? 'yolen-method-stage--current' : ''}"
              data-yolen-method-stage-status="${escapeHtml(stage.status)}"
              ${current ? 'data-yolen-current-method-stage="true"' : ''}
            >
              <div class="yolen-method-stage-header">
                <div>
                  ${current ? '<div class="yolen-method-stage-current-label">Etapa atual</div>' : ''}
                  <div class="yolen-method-stage-name">${escapeHtml(stage.name)}</div>
                </div>
                <span class="yolen-rich-status ${getStatusClass(stage.status)}">
                  ${escapeHtml(stage.statusLabel)}
                </span>
              </div>
              ${stage.explanation ? `<div class="yolen-method-stage-copy">${escapeHtml(stage.explanation)}</div>` : ''}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function renderRecovery(method) {
    const adherence = method?.adherence

    if (adherence?.status !== 'off_method') {
      return ''
    }

    const deviationStage = displayItems(method.stages).find(
      (stage) => stage.step_order === adherence.deviation_stage_order,
    )

    const recovery = method.recovery_guidance
    const whereItLeft =
      displayText(deviationStage?.name) ||
      displayText(method.current_stage?.name) ||
      (Number.isSafeInteger(adherence.deviation_stage_order)
        ? `Etapa ${adherence.deviation_stage_order}`
        : null)
    const missing = [
      ...(Array.isArray(adherence.missing_information) ? adherence.missing_information : []),
      ...(Array.isArray(recovery?.missing_information) ? recovery.missing_information : []),
    ].filter((value, index, values) => displayText(value) && values.indexOf(value) === index)

    return `
      <div class="yolen-method-recovery" data-yolen-method-recovery>
        <div class="yolen-method-recovery-heading">Como voltar para o método</div>
        ${renderLabeledCopy('Onde saiu', whereItLeft)}
        ${renderLabeledCopy('O que aconteceu', adherence.what_happened)}
        ${renderTextList('O que faltou', missing)}
        ${renderLabeledCopy('Por que importa', adherence.why_it_matters)}
        ${renderLabeledCopy('Objetivo da correção', recovery?.objective)}
        ${renderLabeledCopy('Próximo movimento', recovery?.recommended_move)}
        ${renderLabeledCopy('Pergunta opcional', recovery?.optional_question)}
        ${renderEvidence(recovery || adherence)}
      </div>
    `
  }

  function renderMethod(method) {
    if (!method || typeof method !== 'object') {
      return ''
    }

    const adherenceStatus = method.adherence?.status

    if (method.configured === false || adherenceStatus === 'not_configured') {
      return `
        <section class="yolen-seller-section" data-yolen-analysis-section="method">
          <div class="yolen-seller-section-heading">
            <div>
              <div class="yolen-seller-section-eyebrow">Método</div>
              <h3>Método comercial</h3>
            </div>
          </div>
          <div class="yolen-seller-empty-state">Método comercial não configurado.</div>
        </section>
      `
    }

    if (method.configured !== true) {
      return ''
    }

    const methodName = displayText(method.name)
    const adherenceLabel = getMethodAdherenceLabel(adherenceStatus)
    const adherenceSummary = displayText(method.adherence?.summary)

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="method">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Método</div>
            <h3>${escapeHtml(methodName || 'Método comercial')}</h3>
          </div>
        </div>

        ${adherenceLabel ? `
          <div
            class="yolen-method-adherence ${getAdherenceClass(adherenceStatus)}"
            data-yolen-method-adherence="${escapeHtml(adherenceStatus)}"
          >
            <div class="yolen-method-adherence-label">${escapeHtml(adherenceLabel)}</div>
            ${adherenceSummary ? `<div class="yolen-method-adherence-copy">${escapeHtml(adherenceSummary)}</div>` : ''}
            ${adherenceStatus === 'insufficient_evidence' ? '<div class="yolen-method-adherence-note">Não há evidência suficiente para avaliar esta etapa.</div>' : ''}
          </div>
        ` : ''}

        ${renderMethodStages(method)}
        ${renderRecovery(method)}

        <div class="yolen-operational-note">
          Método comercial e etapa do CRM são avaliações independentes.
        </div>
      </section>
    `
  }

  function renderRiskGroup(label, risks, group) {
    const items = displayItems(risks)
      .map((risk) => ({
        risk,
        summary: displayText(risk.summary),
        severityLabel: RISK_SEVERITY_LABELS[risk.severity] || null,
      }))
      .filter((item) => item.summary)

    if (items.length === 0) {
      return ''
    }

    return `
      <div class="yolen-risk-group" data-yolen-risk-group="${escapeHtml(group)}">
        <div class="yolen-risk-group-title">${escapeHtml(label)}</div>
        <div class="yolen-seller-stack">
          ${items.map(({ risk, summary, severityLabel }) => `
            <article class="yolen-seller-insight yolen-seller-insight--risk">
              <div class="yolen-seller-insight-row">
                <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
                ${severityLabel ? `<span class="yolen-risk-severity yolen-risk-severity--${escapeHtml(risk.severity)}">${escapeHtml(severityLabel)}</span>` : ''}
              </div>
              ${renderEvidence(risk)}
            </article>
          `).join('')}
        </div>
      </div>
    `
  }

  // FASE 16.6 (recalibração seller-facing de ANÁLISE): `risks` já chega
  // combinado e filtrado (severidade medium/high, máximo 3) do
  // AnalysisViewModel — este presenter só particiona por `source` para
  // rotular os dois grupos, nunca reclassifica severidade nem decide o
  // que é relevante (achado da auditoria: antes, apenas `service_risks`
  // aparecia em ANÁLISE — `risks.customer_objections` nunca tinha
  // renderer, mandato §12).
  function renderRisks(risks) {
    const serviceRisks = displayItems(risks).filter((risk) => risk.source === 'service_risk')
    const objectionRisks = displayItems(risks).filter((risk) => risk.source === 'customer_objection')

    const service = renderRiskGroup('Risco no atendimento', serviceRisks, 'service')
    const objection = renderRiskGroup('Objeção com risco comercial', objectionRisks, 'objection')

    if (!service && !objection) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="risks">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Riscos e travas</div>
            <h3>Riscos da venda</h3>
          </div>
        </div>
        ${objection}
        ${service}
      </section>
    `
  }

  // Objeções ainda ABERTAS do ciclo (mandato §11) — distintas de
  // `risks` acima: `risks` vem da leitura da CONVERSA ATUAL (pode não
  // ter reavaliado uma objeção antiga), `objections` vem da memória do
  // ciclo inteiro já filtrada por `memory_status === 'active'` no
  // AnalysisViewModel — uma objeção resolvida nunca chega aqui.
  function renderObjections(objections) {
    const items = displayItems(objections)
      .map((item) => ({ item, summary: displayText(item.summary) }))
      .filter((entry) => entry.summary)

    if (items.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="objections">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Riscos e travas</div>
            <h3>Objeções ainda abertas</h3>
          </div>
          <span class="yolen-seller-count">${items.length}</span>
        </div>
        <div class="yolen-seller-stack">
          ${items.map(({ item, summary }) => `
            <article class="yolen-seller-insight yolen-seller-insight--risk">
              <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
              ${renderEvidence(item)}
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  const ANALYSIS_COMMITMENT_STATUS_LABELS = {
    overdue: 'Vencido',
    due_today: 'Previsto para hoje',
    pending: 'Pendente',
    reschedule_requested: 'Reagendamento pendente',
    completed: 'Cumprido',
    cancelled: 'Cancelado',
  }

  const ANALYSIS_COMMITMENT_STATUS_ORDER = [
    'overdue',
    'due_today',
    'pending',
    'reschedule_requested',
    'completed',
    'cancelled',
  ]

  // Compromissos do ciclo (mandato §13) — já categorizados pelo
  // AnalysisViewModel (overdue/due_today/pending/reschedule_requested/
  // completed/cancelled); este presenter só agrupa por status para
  // exibição, nunca recalcula vencimento.
  function renderCommitments(commitments) {
    const items = displayItems(commitments)
      .map((item) => ({ item, summary: displayText(item.summary) }))
      .filter((entry) => entry.summary)

    if (items.length === 0) {
      return ''
    }

    const groups = ANALYSIS_COMMITMENT_STATUS_ORDER
      .map((status) => ({
        status,
        entries: items.filter((entry) => entry.item.status === status),
      }))
      .filter((group) => group.entries.length > 0)

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="commitments">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Continuidade</div>
            <h3>Compromissos</h3>
          </div>
          <span class="yolen-seller-count">${items.length}</span>
        </div>
        <div class="yolen-seller-stack">
          ${groups.map(({ status, entries }) => `
            <div class="yolen-commitment-group" data-yolen-commitment-status="${escapeHtml(status)}">
              <div class="yolen-commitment-group-title">${escapeHtml(ANALYSIS_COMMITMENT_STATUS_LABELS[status] || status)}</div>
              ${entries.map(({ item, summary }) => `
                <article class="yolen-seller-insight">
                  <div class="yolen-seller-insight-title">${escapeHtml(summary)}</div>
                  ${item.scheduled_at ? renderLabeledCopy('Data', item.scheduled_at) : ''}
                  ${renderEvidence(item)}
                </article>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderCommercialEvolution(evolutionItems) {
    const items = displayItems(evolutionItems)
      .map((item) => ({
        label: displayText(item.label),
        explanation: displayText(item.explanation),
        status: item.status,
        statusLabel: getMethodStatusLabel(item.status) || (item.status === 'pending' ? 'Pendente' : null),
      }))
      .filter((item) => item.label && item.explanation && item.statusLabel)

    if (items.length === 0) {
      return ''
    }

    return `
      <details class="yolen-seller-secondary-details" data-yolen-preserve-details="commercial-evolution">
        <summary>Ver evolução comercial</summary>
        <div class="yolen-method-stages">
          ${items.map((item) => `
            <div class="yolen-method-stage">
              <div class="yolen-method-stage-header">
                <div class="yolen-method-stage-name">${escapeHtml(item.label)}</div>
                <span class="yolen-rich-status ${getStatusClass(item.status)}">${escapeHtml(item.statusLabel)}</span>
              </div>
              <div class="yolen-method-stage-copy">${escapeHtml(item.explanation)}</div>
            </div>
          `).join('')}
        </div>
      </details>
    `
  }

  const ANALYSIS_OPPORTUNITY_STATUS_LABELS = {
    no_intervention: 'Sem sinal comercial',
    give_space: 'Sessão pessoal',
    advancing: 'Avançando',
    follow_up: 'Aguardando retomada',
    handle_objection: 'Travada em objeção',
    escalate: 'Em risco',
    deepen_discovery: 'Descoberta incompleta',
    wait: 'Aguardando deliberadamente',
  }

  const ANALYSIS_OPPORTUNITY_STATUS_TONE = {
    no_intervention: 'information',
    give_space: 'information',
    advancing: 'positive',
    follow_up: 'warning',
    handle_objection: 'warning',
    escalate: 'risk',
    deepen_discovery: 'warning',
    wait: 'information',
  }

  // Estado da venda (mandato §8/§19) — primeira leitura da aba, nunca
  // apenas o stage do CRM (mandato §8: "stage é uma fonte operacional,
  // Commercial Reading é a interpretação comercial"). `status`/
  // `headline`/`stage_name` já vêm decididos pelo AnalysisViewModel —
  // este presenter só escolhe rótulo/tom a partir de `status`.
  function renderOpportunityHeader(opportunity, currentMoment) {
    if (!opportunity) {
      return ''
    }

    const label = ANALYSIS_OPPORTUNITY_STATUS_LABELS[opportunity.status] || 'Estado da venda'
    const tone = ANALYSIS_OPPORTUNITY_STATUS_TONE[opportunity.status] || 'information'
    const headline = displayText(opportunity.headline)
    const stageName = displayText(opportunity.stage_name)

    // Camada 1 vs camada 2 (mandato §9): uma sessão cuja atividade mais
    // recente já saiu da janela de sessão ativa não apaga a leitura —
    // só adiciona uma nota de contexto, nunca esconde a oportunidade.
    const staleNote = currentMoment?.is_active_session === false
      ? '<div class="yolen-opportunity-note">A conversa mais recente já não está ativa — a leitura abaixo reflete a última análise concluída, e a oportunidade continua registrada.</div>'
      : ''

    return `
      <section
        class="yolen-seller-section yolen-opportunity-header"
        data-yolen-analysis-section="opportunity"
        data-yolen-opportunity-status="${escapeHtml(opportunity.status)}"
      >
        <div class="yolen-opportunity-status yolen-opportunity-status--${escapeHtml(tone)}">
          <span class="yolen-opportunity-status-label">${escapeHtml(label)}</span>
          ${stageName ? `<span class="yolen-opportunity-stage">${escapeHtml(stageName)}</span>` : ''}
        </div>
        ${headline ? `<div class="yolen-opportunity-headline">${escapeHtml(headline)}</div>` : ''}
        ${staleNote}
      </section>
    `
  }

  // Continuidade da oportunidade (mandato §10/§17/§31) — nunca esvaziada
  // por sessão pessoal ou gap de sessão; sinais de outras conversas do
  // ciclo aparecem só como histórico de coaching, nunca como leitura da
  // conversa atual (mandato §14/§19).
  function renderContinuity(continuity) {
    const count = continuity?.cycle_conversation_count || 0
    const signals = displayItems(continuity?.cross_conversation_signals)

    if (count <= 1 && signals.length === 0) {
      return ''
    }

    const conversationNote = count > 1
      ? `<div class="yolen-seller-detail-copy">Esta oportunidade já teve ${count} conversas.</div>`
      : ''

    const signalsHtml = signals.length > 0
      ? `
        <div class="yolen-seller-detail">
          <div class="yolen-seller-detail-label">Coaching de outras conversas deste ciclo</div>
          <ul class="yolen-seller-text-list">
            ${signals.map((signal) => {
              const total = (signal.strengths_count || 0) + (signal.improvements_count || 0)
              return `<li>${escapeHtml(total > 0 ? `${signal.strengths_count} acerto(s), ${signal.improvements_count} ponto(s) de melhoria` : 'Sem pontos relevantes')}</li>`
            }).join('')}
          </ul>
        </div>
      `
      : ''

    return `
      <details class="yolen-seller-secondary-details" data-yolen-preserve-details="continuity">
        <summary>Ver continuidade da oportunidade</summary>
        ${conversationNote}
        ${signalsHtml}
      </details>
    `
  }

  // FASE 16.6 — adaptador de fallback (nunca o presenter canônico): a
  // tentativa de análise corrente (state.conversationAnalysis) resolve de
  // forma síncrona e local, antes de o ANÁLISE view model canônico
  // (Integrated Commercial Context, buscado à parte por
  // loadAnalysisViewModelForCurrentCycle) voltar do servidor. Sem este
  // adaptador, content-script.js teria que escolher entre mostrar uma
  // leitura já pronta com atraso artificial (esperando um fetch void
  // ANÁLISE já tem os dados) ou descartá-la (regressão de UX — mandato
  // §46, nenhuma leitura já concluída pode desaparecer da tela). Isto NÃO
  // reconstrói a leitura comercial em si (mandato §4) — a leitura já
  // veio pronta do servidor via ANALYZE_CONVERSATION/GET_ANALYSIS_JOB_STATUS;
  // aqui só traduz a MESMA leitura para a forma que renderAnalysisViewModel
  // já sabe desenhar. Por não ter Cycle Memory/Method Coaching locais,
  // objeções abertas, compromissos, estado da oportunidade e continuidade
  // ficam vazios/nulos aqui — nunca inventados, apenas ainda não
  // disponíveis nesta camada; o view model canônico os preenche assim que
  // chega (e, quando chega, sempre substitui este fallback — ver
  // getDetailedAnalysisAreaHtml em content-script.js).
  function buildAnalysisViewModelFromReading(reading) {
    if (!reading || typeof reading !== 'object') {
      return null
    }

    if (isNeutralCommercialSession(reading)) {
      const copy = getNeutralSessionCopy(reading)

      return {
        available: true,
        unavailable_reason: null,
        neutral: true,
        neutral_headline: copy.title,
        neutral_description: copy.description,
        opportunity: null,
        current_moment: { is_active_session: null },
        risks: [],
        objections_open: [],
        commitments: [],
        seller_conduct: {
          method: { configured: false, name: null, stages: [], current_stage: null, adherence: null, recovery_guidance: null },
          stage_divergence: false,
        },
        strengths: [],
        improvements: [],
        continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
        history: [],
        provenance: {},
      }
    }

    // Sem reordenar por severidade aqui de propósito (mesma lição da
    // FASE 16.5 — ver comentário logo acima, ATTENTION_PRIORITY_RANK):
    // um segundo critério de priorização no cliente duplicaria o mesmo
    // julgamento que o presenter server-side já faz
    // (RISK_SEVERITY_RANK, analysis-view-model.ts) e poderia divergir
    // dele silenciosamente. Este fallback só filtra severidade baixa e
    // limita a quantidade — a ordem/priorização fina só vem do view
    // model canônico, quando ele chega.
    const risks = [
      ...(reading.risks?.customer_objections || []).map((risk) => ({ source: 'customer_objection', ...risk })),
      ...(reading.risks?.service_risks || []).map((risk) => ({ source: 'service_risk', ...risk })),
    ]
      .filter((risk) => risk.severity !== 'low')
      .slice(0, 3)

    return {
      available: true,
      unavailable_reason: null,
      neutral: false,
      neutral_headline: null,
      neutral_description: null,
      // Sem Decision State local para traduzir best_approach.decision no
      // mesmo mapeamento do presenter server-side (DECISION_TO_OPPORTUNITY_STATUS,
      // analysis-view-model.ts) — mostrar um status adivinhado seria
      // inventar (mandato §34); melhor não mostrar cabeçalho de
      // oportunidade aqui do que mostrar um errado.
      opportunity: null,
      current_moment: { is_active_session: true },
      risks,
      objections_open: [],
      commitments: [],
      seller_conduct: {
        method: reading.method || null,
        stage_divergence: false,
      },
      strengths: (reading.seller_strengths || []).slice(0, 3),
      improvements: (reading.improvement_points || []).slice(0, 3),
      continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
      history: reading.commercial_evolution || [],
      provenance: {},
    }
  }

  // FASE 16.6 (recalibração seller-facing de ANÁLISE): ponto único de
  // renderização — traduz o AnalysisViewModel (Integrated Commercial
  // Context, FASE 16.4, via app/lib/server/analysis-view-model.ts) em
  // HTML. Nunca decide disponibilidade/neutralidade/prioridade por
  // conta própria — `available`/`neutral`/`unavailable_reason` já
  // vieram prontos do presenter server-side.
  function renderAnalysisViewModel(analysisViewModel) {
    if (!analysisViewModel || typeof analysisViewModel !== 'object') {
      return ''
    }

    if (!analysisViewModel.available) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-analysis-unavailable>
          Análise ainda não disponível.
        </div>
      `
    }

    if (analysisViewModel.neutral) {
      return [
        `
          <div class="yolen-seller-empty-state" data-yolen-analysis-neutral>
            ${escapeHtml(analysisViewModel.neutral_headline || '')} ${escapeHtml(analysisViewModel.neutral_description || '')}
          </div>
        `,
        renderCommitments(analysisViewModel.commitments),
        renderContinuity(analysisViewModel.continuity),
      ].filter(Boolean).join('')
    }

    if (analysisViewModel.unavailable_reason === 'no_reading') {
      return [
        `
          <div class="yolen-seller-empty-state" data-yolen-analysis-progressive>
            Esta conversa ainda não possui análise detalhada de condução.
          </div>
        `,
        renderObjections(analysisViewModel.objections_open),
        renderCommitments(analysisViewModel.commitments),
        renderContinuity(analysisViewModel.continuity),
      ].filter(Boolean).join('')
    }

    const sections = [
      renderOpportunityHeader(analysisViewModel.opportunity, analysisViewModel.current_moment),
      renderObjections(analysisViewModel.objections_open),
      renderRisks(analysisViewModel.risks),
      renderCommitments(analysisViewModel.commitments),
      renderMethod(analysisViewModel.seller_conduct?.method),
      renderStrengths(analysisViewModel.strengths),
      renderImprovements(analysisViewModel.improvements),
      renderContinuity(analysisViewModel.continuity),
      renderCommercialEvolution(analysisViewModel.history),
    ].filter(Boolean)

    if (sections.length === 0) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-analysis-empty>
          Esta leitura ainda não possui análise detalhada de condução.
        </div>
      `
    }

    return sections.join('')
  }

  function renderCustomerItems(label, items, field) {
    const summaries = displayItems(items)
      .map((item) => displayText(item.summary))
      .filter(Boolean)

    if (summaries.length === 0) {
      return ''
    }

    return `
      <div
        class="yolen-client-knowledge-group"
        data-yolen-client-field="${escapeHtml(field)}"
      >
        <div class="yolen-client-knowledge-label">${escapeHtml(label)}</div>
        <ul class="yolen-client-knowledge-list">
          ${summaries.map((summary) => `<li>${escapeHtml(summary)}</li>`).join('')}
        </ul>
      </div>
    `
  }

  function renderCustomerRichItems(label, items, renderItem, field) {
    const renderedItems = displayItems(items)
      .map(renderItem)
      .filter(Boolean)

    if (renderedItems.length === 0) {
      return ''
    }

    return `
      <div
        class="yolen-client-knowledge-group"
        data-yolen-client-field="${escapeHtml(field)}"
      >
        <div class="yolen-client-knowledge-label">${escapeHtml(label)}</div>
        <div class="yolen-client-rich-list">
          ${renderedItems.join('')}
        </div>
      </div>
    `
  }

  function uniqueProducts(customer) {
    const products = displayItems(customer?.discussed_products)
      .filter((item) => displayText(item.name) || displayText(item.summary))

    const primary = customer?.primary_product_interest

    if (!primary || typeof primary !== 'object') {
      return products
    }

    const alreadyIncluded = products.some((product) => (
      product.canonical_product_id === primary.canonical_product_id &&
      displayText(product.name) === displayText(primary.name) &&
      product.interest_level === primary.interest_level &&
      displayText(product.summary) === displayText(primary.summary)
    ))

    return alreadyIncluded
      ? products
      : [...products, primary]
  }

  function renderProduct(product) {
    const name = displayText(product?.name)
    const summary = displayText(product?.summary)
    const interestLabel = PRODUCT_INTEREST_LABELS[product?.interest_level]

    if ((!name && !summary) || !interestLabel) {
      return ''
    }

    const source = displayText(product.canonical_product_id)
      ? 'catalog'
      : 'observed'

    const sourceLabel = source === 'catalog'
      ? 'Produto identificado'
      : 'Menção observada'

    return `
      <article
        class="yolen-client-rich-item"
        data-yolen-client-product-source="${source}"
        data-yolen-client-product-interest="${escapeHtml(product.interest_level)}"
      >
        <div class="yolen-client-rich-item-meta">
          ${escapeHtml(sourceLabel)} · ${escapeHtml(interestLabel)}
        </div>
        <div class="yolen-client-rich-item-title">${escapeHtml(name || summary)}</div>
        ${summary && summary !== name ? `<div class="yolen-client-rich-item-copy">${escapeHtml(summary)}</div>` : ''}
      </article>
    `
  }

  function renderCompetitor(competitor) {
    const summary = displayText(competitor?.summary)
    const mentionType = competitor?.mention_type

    if (
      mentionType !== 'named' &&
      mentionType !== 'unnamed_alternative'
    ) {
      return ''
    }

    const name = mentionType === 'named'
      ? displayText(competitor.name)
      : null

    if (mentionType === 'named' && !name) {
      return ''
    }

    if (!name && !summary) {
      return ''
    }

    return `
      <article
        class="yolen-client-rich-item"
        data-yolen-client-competitor-type="${escapeHtml(mentionType)}"
      >
        <div class="yolen-client-rich-item-meta">
          ${mentionType === 'named' ? 'Concorrente identificado' : 'Alternativa sem nome'}
        </div>
        <div class="yolen-client-rich-item-title">
          ${escapeHtml(name || 'Outra solução em avaliação')}
        </div>
        ${summary && summary !== name ? `<div class="yolen-client-rich-item-copy">${escapeHtml(summary)}</div>` : ''}
      </article>
    `
  }

  function renderCommunicationObservation(observation) {
    const summary = displayText(observation?.summary)
    const observationLabel = COMMUNICATION_OBSERVATION_LABELS[
      observation?.observation_type
    ]
    const behaviorLabel = COMMUNICATION_BEHAVIOR_LABELS[
      observation?.behavior
    ]

    if (!summary || !observationLabel || !behaviorLabel) {
      return ''
    }

    return `
      <article
        class="yolen-client-rich-item"
        data-yolen-client-communication="${escapeHtml(observation.behavior)}"
        data-yolen-client-communication-type="${escapeHtml(observation.observation_type)}"
      >
        <div class="yolen-client-rich-item-meta">${escapeHtml(observationLabel)}</div>
        <div class="yolen-client-rich-item-title">${escapeHtml(behaviorLabel)}</div>
        <div class="yolen-client-rich-item-copy">${escapeHtml(summary)}</div>
      </article>
    `
  }

  // FASE 16.7 — traduz uma lacuna de conhecimento (missing_discovery, ou
  // open_questions/uncertainties como fallback — ver buildKnowledgeGaps,
  // customer-view-model.ts) em HTML. Ao contrário do antigo
  // renderMissingDiscovery, aceita `topic: null` sem descartar o item —
  // o fallback nunca tem topic, mas ainda é uma lacuna específica válida
  // (mandato §22/§23: nunca genérica, mas também nunca escondida só por
  // faltar categoria).
  function renderKnowledgeGap(gap) {
    const summary = displayText(gap?.summary)

    if (!summary) {
      return ''
    }

    const topicLabel = MISSING_DISCOVERY_LABELS[gap?.topic] || null

    return `
      <article
        class="yolen-client-rich-item yolen-client-rich-item--attention"
        data-yolen-customer-gap-topic="${escapeHtml(gap.topic || 'unspecified')}"
      >
        ${topicLabel ? `<div class="yolen-client-rich-item-meta">${escapeHtml(topicLabel)}</div>` : ''}
        <div class="yolen-client-rich-item-title">${escapeHtml(summary)}</div>
      </article>
    `
  }

  // "Como prefere interagir" (mandato §37/§12) — preferências +
  // padrões de comunicação, sempre como observação da leitura atual,
  // nunca como traço confirmado entre ciclos (não há memória durável
  // para provar recorrência — mandato §8).
  function renderCustomerPreferences(preferences, communicationPatterns) {
    const sections = [
      renderCustomerItems('Preferências observadas', preferences, 'preferences'),
      renderCustomerRichItems('Padrões de comunicação', communicationPatterns, renderCommunicationObservation, 'communication_patterns'),
    ].filter(Boolean)

    if (sections.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-customer-section="preferences">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Como prefere interagir</div>
            <h3>Preferências</h3>
          </div>
        </div>
        <div class="yolen-seller-detail-copy">Observado nesta conversa — ainda não confirmado como padrão permanente.</div>
        ${sections.join('')}
      </section>
    `
  }

  // "O que ainda falta descobrir" (mandato §22/§23) — 1 lacuna principal
  // em destaque + até 2 secundárias, nunca uma lista genérica.
  function renderCustomerKnowledgeGaps(gaps) {
    const items = displayItems(gaps).filter((item) => displayText(item.summary))

    if (items.length === 0) {
      return ''
    }

    const [principal, ...secondary] = items

    return `
      <section class="yolen-seller-section" data-yolen-customer-section="knowledge-gaps">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Ainda não sabemos</div>
            <h3>O que falta descobrir</h3>
          </div>
        </div>
        <div class="yolen-seller-stack" data-yolen-customer-gap="principal">
          ${renderKnowledgeGap(principal)}
        </div>
        ${secondary.length > 0 ? `
          <div class="yolen-client-rich-list" data-yolen-customer-gap="secondary">
            ${secondary.map(renderKnowledgeGap).join('')}
          </div>
        ` : ''}
      </section>
    `
  }

  // "Contexto desta oportunidade" — secundário, recolhido, subordinado
  // (mandato §7/§13, opção "Balanceado" do Controle Mestre FASE 16.7):
  // tudo aqui é específico deste ciclo, nunca oferecido como traço
  // durável da pessoa nem como bloco principal da aba.
  function renderCustomerOpportunityContext(context) {
    if (!context || typeof context !== 'object') {
      return ''
    }

    const products = uniqueProducts({
      discussed_products: context.discussed_products,
      primary_product_interest: context.primary_product_interest,
    })

    const groups = [
      renderCustomerItems('Objetivos', context.objectives, 'objectives'),
      renderCustomerItems('Necessidades', context.needs, 'needs'),
      renderCustomerItems('Interesses', context.interests, 'interests'),
      renderCustomerItems('Problemas', context.problems, 'problems'),
      renderCustomerItems('Impactos', context.impacts, 'impacts'),
      renderCustomerItems('Critérios de decisão', context.decision_criteria, 'decision_criteria'),
      renderCustomerRichItems('Produtos avaliados', products, renderProduct, 'discussed_products'),
      renderCustomerRichItems('Concorrentes e alternativas', context.competitors, renderCompetitor, 'competitors'),
      renderCustomerRichItems('Observações recentes', context.communication_events, renderCommunicationObservation, 'communication_events'),
    ].filter(Boolean)

    if (groups.length === 0) {
      return ''
    }

    return `
      <details class="yolen-seller-secondary-details" data-yolen-customer-section="opportunity-context" data-yolen-preserve-details="customer-opportunity-context">
        <summary>Contexto desta oportunidade</summary>
        <div class="yolen-seller-detail-copy">Específico desta oportunidade — não é uma característica permanente confirmada deste cliente.</div>
        <div class="yolen-client-intelligence-groups">
          ${groups.join('')}
        </div>
      </details>
    `
  }

  // FASE 16.7 (recalibração seller-facing de CLIENTE): ponto único de
  // renderização — traduz o CustomerViewModel (Commercial Reading
  // canônica atual, via app/lib/server/customer-view-model.ts) em HTML.
  // Nunca decide disponibilidade por conta própria —
  // `available`/`unavailable_reason` já vieram prontos do presenter
  // server-side (ou do fallback local equivalente,
  // buildCustomerViewModelFromReading, logo abaixo). Ao contrário de
  // renderAnalysisViewModel/renderAgoraViewModelSnapshot, não tem branch
  // `neutral` — mandato §19, regra não-negociável: uma sessão pessoal
  // nunca apaga o que já sabemos sobre o cliente.
  function renderCustomerViewModel(customerViewModel) {
    if (!customerViewModel || typeof customerViewModel !== 'object') {
      return ''
    }

    if (!customerViewModel.available) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-customer-unavailable>
          Ainda não há informações suficientes sobre este cliente.
        </div>
      `
    }

    const sections = [
      renderCustomerPreferences(customerViewModel.preferences, customerViewModel.communication_patterns),
      renderCustomerKnowledgeGaps(customerViewModel.knowledge_gaps),
      renderCustomerOpportunityContext(customerViewModel.opportunity_context),
    ].filter(Boolean)

    if (sections.length === 0) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-customer-empty>
          Ainda não há informações suficientes sobre preferências ou contexto deste cliente.
        </div>
      `
    }

    return `
      <div class="yolen-card yolen-client-commercial-card" data-yolen-client-intelligence>
        <div class="yolen-client-intelligence-heading">
          <div class="yolen-section-label">O que sabemos</div>
          <h3>Cliente</h3>
        </div>
        ${sections.join('')}
      </div>
    `
  }

  // FASE 16.7 — adaptador de fallback (nunca o presenter canônico):
  // mesma razão de buildAnalysisViewModelFromReading (FASE 16.6) — a
  // leitura comercial da tentativa corrente já pode estar disponível
  // localmente (via getLastKnownClientCommercialReading, o mesmo
  // snapshot com identidade que CLIENTE já usava antes desta fase)
  // antes de o CustomerViewModel canônico (fetch separado) voltar do
  // servidor. Sem este adaptador, uma leitura já pronta desapareceria
  // artificialmente da tela por um instante (regressão de UX — mesma
  // lição da FASE 16.6). Replica exatamente a mesma classificação
  // person/cycle do presenter server-side (customer-view-model.ts) —
  // nunca uma segunda interpretação diferente.
  function buildClientKnowledgeGaps(customer) {
    const activeMissingDiscovery = (customer.missing_discovery || [])
      .filter((item) => !hasClientSharedMemoryId(
        item,
        [
          ...(customer.resolved_information || []),
          ...(customer.superseded_information || []),
        ],
      ))

    if (activeMissingDiscovery.length > 0) {
      return activeMissingDiscovery.slice(0, 3).map((item) => ({
        summary: item.summary,
        topic: item.topic || null,
        evidence_message_ids: item.evidence_message_ids || [],
        memory_ids: item.memory_ids || [],
      }))
    }

    // Fallback (mandato §22): sem lacuna específica de descoberta,
    // perguntas em aberto/incertezas ainda podem apontar uma lacuna
    // concreta — mesma regra de buildKnowledgeGaps, customer-view-model.ts.
    return [
      ...(customer.open_questions || []),
      ...(customer.uncertainties || []),
    ].slice(0, 3).map((item) => ({
      summary: item.summary,
      topic: null,
      evidence_message_ids: item.evidence_message_ids || [],
      memory_ids: item.memory_ids || [],
    }))
  }

  function buildCustomerViewModelFromReading(reading) {
    const customer = reading?.customer

    if (!customer || typeof customer !== 'object') {
      return null
    }

    return {
      available: true,
      unavailable_reason: null,

      preferences: (customer.preferences || []).slice(0, 5),

      communication_patterns:
        (customer.communication?.patterns || []).slice(0, 5),

      knowledge_gaps: buildClientKnowledgeGaps(customer),

      opportunity_context: {
        objectives: (customer.objectives || []).slice(0, 5),
        needs: (customer.needs || []).slice(0, 5),
        interests: (customer.interests || []).slice(0, 5),
        problems: (customer.problems || []).slice(0, 5),
        impacts: (customer.impacts || []).slice(0, 5),
        decision_criteria: (customer.decision_criteria || []).slice(0, 5),
        discussed_products: (customer.discussed_products || []).slice(0, 5),
        primary_product_interest: customer.primary_product_interest || null,
        competitors: (customer.competitors || []).slice(0, 5),
        communication_events: (customer.communication?.events || []).slice(0, 5),
      },

      provenance: {},
    }
  }

  function hasClientSharedMemoryId(item, historyItems) {
    const memoryIds = Array.isArray(item?.memory_ids)
      ? item.memory_ids.filter(displayText)
      : []

    if (memoryIds.length === 0) {
      return false
    }

    return displayItems(historyItems).some((history) => (
      history.category === 'missing_discovery' &&
      Array.isArray(history.memory_ids) &&
      history.memory_ids.some((id) => memoryIds.includes(id))
    ))
  }

  // FASE 16.5 (recalibração seller-facing do AGORA): renderAttentionItem
  // é o único primitivo de apresentação que sobrevive daqui — ele só
  // desenha um card a partir de valores já decididos, nunca decide o que
  // mostrar. Quem decide é o AgoraViewModel (Decision State traduzido por
  // app/lib/server/agora-view-model.ts, FASE 16.3E/16.5), consumido por
  // renderAgoraViewModelSnapshot logo abaixo.
  function renderAttentionItem({
    label,
    copy,
    priority,
    source,
    tone,
    variant,
  }) {
    const clean = displayText(copy)

    if (!clean) {
      return ''
    }

    return `
      <div
        class="yolen-now-attention yolen-now-attention--${escapeHtml(tone)}"
        data-yolen-now-attention="${escapeHtml(source || '')}"
        data-yolen-alert-priority="${escapeHtml(priority || '')}"
        ${variant ? `data-yolen-now-attention-variant="${escapeHtml(variant)}"` : ''}
      >
        <div class="yolen-decision-kicker">${escapeHtml(label)}</div>
        <div class="yolen-now-attention-copy">${escapeHtml(clean)}</div>
      </div>
    `
  }

  // Traduz um AgoraViewModelSignal (primary ou um item de secondary) em
  // texto/tom seller-facing — o `headline`/`action` já vêm concretos e
  // específicos do candidato real que Decision State elegeu (mandato
  // §7/§8); este mapa só decide rótulo curto e tom visual a partir de
  // `status`, nunca reclassifica prioridade nem reescreve o texto.
  function renderAgoraSignal(signal, variant) {
    if (!signal) {
      return ''
    }

    const label =
      AGORA_VIEW_MODEL_STATUS_LABELS[signal.status] ||
      'Atenção'

    const tone =
      signal.priority === 'critical'
        ? 'risk'
        : (AGORA_VIEW_MODEL_STATUS_TONE[signal.status] || 'warning')

    return renderAttentionItem({
      label,
      copy: signal.action
        ? `${signal.headline} ${signal.action}`
        : signal.headline,
      priority: signal.priority || '',
      source: signal.status,
      tone,
      variant,
    })
  }

  // Ponto único de renderização do AGORA seller-facing (FASE 16.5): no
  // máximo 1 card primário + no máximo 2 cards secundários (mandato §4),
  // já garantido por construção em app/lib/server/agora-view-model.ts —
  // esta função nunca reordena, nunca filtra por conta própria, nunca
  // inventa um card quando `silent` é `true` (mandato §9/§23).
  function renderAgoraViewModelSnapshot(agoraViewModel) {
    if (!agoraViewModel || agoraViewModel.silent) {
      return ''
    }

    const secondaryHtml =
      (agoraViewModel.secondary || [])
        .slice(0, 2)
        .map((signal) => renderAgoraSignal(signal, 'secondary'))
        .join('')

    // `primary` pode ser `null` mesmo com `silent: false` — a decisão
    // principal foi deliberadamente suprimida (Decision State marcou
    // `primary_decision.silent`, comunicação explicitamente
    // desnecessária agora), mas um sinal secundário real sobrevive
    // (achado do Codex, PR #283, rodada 2) e ainda deve renderizar.
    const primaryHtml =
      agoraViewModel.primary
        ? renderAgoraSignal(agoraViewModel.primary, 'primary')
        : ''

    return (
      primaryHtml +
      secondaryHtml
    )
  }

  const api = Object.freeze({
    escapeHtml,
    getMethodStatusLabel,
    getMethodAdherenceLabel,
    getNeutralSessionCopy,
    isNeutralCommercialSession,
    buildAnalysisViewModelFromReading,
    buildCustomerViewModelFromReading,
    renderAgoraViewModelSnapshot,
    renderAnalysisViewModel,
    renderCustomerViewModel,
  })

  root.YolenCompanionSellerInformationView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
