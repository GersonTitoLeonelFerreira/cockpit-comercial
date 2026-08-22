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

  const COMMITMENT_STATUS_LABELS = {
    proposed: 'Proposto',
    confirmed: 'Confirmado',
    reschedule_requested: 'Reagendamento solicitado',
    cancelled: 'Cancelado',
    completed: 'Concluído',
  }

  const CUSTOMER_HISTORY_CATEGORY_LABELS = {
    objective: 'Objetivo',
    problem: 'Problema',
    impact: 'Impacto',
    need: 'Necessidade',
    interest: 'Interesse',
    decision_criterion: 'Critério de decisão',
    preference: 'Preferência',
    open_question: 'Pergunta em aberto',
    objection: 'Objeção',
    uncertainty: 'Incerteza',
    missing_discovery: 'Descoberta',
    product: 'Produto',
    competitor: 'Concorrente',
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

  function displayDateTime(value) {
    const clean = displayText(value)

    if (!clean) {
      return null
    }

    const date = new Date(clean)

    if (Number.isNaN(date.getTime())) {
      return clean
    }

    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
    } catch {
      return clean
    }
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

  function renderStrengths(reading) {
    const strengths = displayItems(reading?.seller_strengths)
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

  function renderImprovements(reading) {
    const improvements = displayItems(reading?.improvement_points)
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

  function renderMethod(reading) {
    const method = reading?.method

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

  function renderRisks(reading) {
    const seller = renderRiskGroup(
      'Risco na condução do vendedor',
      reading?.risks?.service_risks,
      'seller',
    )

    if (!seller) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="risks">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Condução</div>
            <h3>Riscos no atendimento</h3>
          </div>
        </div>
        ${seller}
      </section>
    `
  }

  function renderCommercialEvolution(reading) {
    const items = displayItems(reading?.commercial_evolution)
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
      <details class="yolen-seller-secondary-details">
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

  function renderAnalysisArea(reading) {
    if (!reading || typeof reading !== 'object') {
      return ''
    }

    if (isNeutralCommercialSession(reading)) {
      return `
        <div class="yolen-seller-empty-state" data-yolen-analysis-neutral>
          Esta conversa não possui análise comercial atual.
        </div>
      `
    }

    const sections = [
      renderStrengths(reading),
      renderImprovements(reading),
      renderMethod(reading),
      renderRisks(reading),
      renderCommercialEvolution(reading),
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

  function renderCustomerGroup({
    key,
    title,
    sections,
    count,
  }) {
    const content = sections.filter(Boolean)

    if (content.length === 0 || count <= 0) {
      return ''
    }

    return `
      <details
        class="yolen-client-intelligence-group"
        data-yolen-client-intelligence-group="${escapeHtml(key)}"
      >
        <summary>
          <span>${escapeHtml(title)}</span>
          <span class="yolen-client-group-count">${escapeHtml(count)}</span>
        </summary>
        <div class="yolen-client-intelligence-group-content">
          ${content.join('')}
        </div>
      </details>
    `
  }

  function customerItemCount(items) {
    return displayItems(items)
      .filter((item) => displayText(item.summary))
      .length
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

  function renderMissingDiscovery(item) {
    const summary = displayText(item?.summary)
    const topicLabel = MISSING_DISCOVERY_LABELS[item?.topic]

    if (!summary || !topicLabel) {
      return ''
    }

    return `
      <article
        class="yolen-client-rich-item yolen-client-rich-item--attention"
        data-yolen-client-missing-topic="${escapeHtml(item.topic)}"
      >
        <div class="yolen-client-rich-item-meta">${escapeHtml(topicLabel)}</div>
        <div class="yolen-client-rich-item-title">${escapeHtml(summary)}</div>
      </article>
    `
  }

  function renderCommitment(commitment) {
    const summary = displayText(commitment?.summary)
    const statusLabel = COMMITMENT_STATUS_LABELS[commitment?.status]

    if (!summary || !statusLabel) {
      return ''
    }

    const scheduledAt = displayDateTime(commitment.scheduled_at)

    return `
      <article
        class="yolen-client-rich-item"
        data-yolen-client-commitment-status="${escapeHtml(commitment.status)}"
      >
        <div class="yolen-client-rich-item-meta">${escapeHtml(statusLabel)}</div>
        <div class="yolen-client-rich-item-title">${escapeHtml(summary)}</div>
        ${scheduledAt ? `<div class="yolen-client-rich-item-copy">Data combinada: ${escapeHtml(scheduledAt)}</div>` : ''}
      </article>
    `
  }

  function renderCustomerHistoryItem(item, state) {
    const summary = displayText(item?.summary)
    const categoryLabel = CUSTOMER_HISTORY_CATEGORY_LABELS[item?.category]

    if (!summary || !categoryLabel) {
      return ''
    }

    return `
      <article
        class="yolen-client-rich-item yolen-client-rich-item--history"
        data-yolen-client-history-state="${escapeHtml(state)}"
        data-yolen-client-history-category="${escapeHtml(item.category)}"
      >
        <div class="yolen-client-rich-item-meta">${escapeHtml(categoryLabel)}</div>
        <div class="yolen-client-rich-item-copy">${escapeHtml(summary)}</div>
      </article>
    `
  }

  function hasSharedMemoryId(item, historyItems) {
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

  function getActiveMissingDiscovery(customer) {
    const history = [
      ...displayItems(customer?.resolved_information),
      ...displayItems(customer?.superseded_information),
    ]

    return displayItems(customer?.missing_discovery)
      .filter((item) => !hasSharedMemoryId(item, history))
  }

  function renderCustomerSummary(customer, products, missingDiscovery) {
    const summaryItems = []
    const objective = displayItems(customer.objectives)
      .map((item) => displayText(item.summary))
      .find(Boolean)

    if (objective) {
      summaryItems.push({
        label: 'Objetivo',
        value: objective,
      })
    }

    const primary = customer.primary_product_interest
    const primaryName = displayText(primary?.name)

    if (primaryName) {
      summaryItems.push({
        label: primary.canonical_product_id
          ? 'Produto principal'
          : 'Maior interesse observado',
        value: primaryName,
      })
    }

    if (summaryItems.length === 0) {
      const fallbacks = [
        ['Necessidade', customer.needs],
        ['Problema', customer.problems],
        ['Interesse', customer.interests],
        ['Objeção atual', customer.objections],
      ]

      for (const [label, items] of fallbacks) {
        const value = displayItems(items)
          .map((item) => displayText(item.summary))
          .find(Boolean)

        if (value) {
          summaryItems.push({ label, value })
          break
        }
      }
    }

    if (missingDiscovery.length > 0) {
      summaryItems.push({
        label: 'Descoberta',
        value: `${missingDiscovery.length} ${missingDiscovery.length === 1 ? 'ponto ainda precisa' : 'pontos ainda precisam'} ser confirmado${missingDiscovery.length === 1 ? '' : 's'}.`,
      })
    }

    if (summaryItems.length === 0 && products.length > 0) {
      const productName = displayText(products[0].name)

      if (productName) {
        summaryItems.push({
          label: products[0].canonical_product_id
            ? 'Produto identificado'
            : 'Menção observada',
          value: productName,
        })
      }
    }

    if (summaryItems.length === 0) {
      return ''
    }

    return `
      <div class="yolen-client-intelligence-summary" data-yolen-client-summary>
        ${summaryItems.slice(0, 3).map(({ label, value }) => `
          <div class="yolen-client-summary-item">
            <div class="yolen-client-summary-label">${escapeHtml(label)}</div>
            <div class="yolen-client-summary-copy">${escapeHtml(value)}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function renderClientCommercialArea(reading) {
    const customer = reading?.customer

    if (!customer || typeof customer !== 'object') {
      return ''
    }

    const products = uniqueProducts(customer)
    const communicationPatterns = displayItems(customer.communication?.patterns)
    const communicationEvents = displayItems(customer.communication?.events)
    const missingDiscovery = getActiveMissingDiscovery(customer)
    const resolvedInformation = displayItems(customer.resolved_information)
    const supersededInformation = displayItems(customer.superseded_information)

    const groups = [
      renderCustomerGroup({
        key: 'wants',
        title: 'O que ele quer',
        count:
          customerItemCount(customer.objectives) +
          customerItemCount(customer.needs) +
          customerItemCount(customer.interests),
        sections: [
          renderCustomerItems('Objetivos', customer.objectives, 'objectives'),
          renderCustomerItems('Necessidades', customer.needs, 'needs'),
          renderCustomerItems('Interesses', customer.interests, 'interests'),
        ],
      }),
      renderCustomerGroup({
        key: 'context',
        title: 'Contexto e problema',
        count:
          customerItemCount(customer.problems) +
          customerItemCount(customer.impacts),
        sections: [
          renderCustomerItems('Problemas', customer.problems, 'problems'),
          renderCustomerItems('Impactos', customer.impacts, 'impacts'),
        ],
      }),
      renderCustomerGroup({
        key: 'decision',
        title: 'Como ele decide',
        count:
          customerItemCount(customer.decision_criteria) +
          customerItemCount(customer.preferences) +
          products.length +
          displayItems(customer.competitors).length,
        sections: [
          renderCustomerItems('Critérios de decisão', customer.decision_criteria, 'decision_criteria'),
          renderCustomerItems('Preferências comerciais', customer.preferences, 'preferences'),
          renderCustomerRichItems('Produtos avaliados', products, renderProduct, 'discussed_products'),
          renderCustomerRichItems('Concorrentes e alternativas', customer.competitors, renderCompetitor, 'competitors'),
        ],
      }),
      renderCustomerGroup({
        key: 'communication',
        title: 'Comunicação observada',
        count: communicationPatterns.length + communicationEvents.length,
        sections: [
          renderCustomerRichItems('Padrões e preferências', communicationPatterns, renderCommunicationObservation, 'communication_patterns'),
          renderCustomerRichItems('Observações recentes', communicationEvents, renderCommunicationObservation, 'communication_events'),
        ],
      }),
      renderCustomerGroup({
        key: 'missing-discovery',
        title: 'Ainda precisamos descobrir',
        count: missingDiscovery.length,
        sections: [
          renderCustomerRichItems('Pontos de descoberta', missingDiscovery, renderMissingDiscovery, 'missing_discovery'),
        ],
      }),
      renderCustomerGroup({
        key: 'open',
        title: 'Outros pontos em aberto',
        count:
          customerItemCount(customer.open_questions) +
          customerItemCount(customer.uncertainties),
        sections: [
          renderCustomerItems('Perguntas em aberto', customer.open_questions, 'open_questions'),
          renderCustomerItems('Incertezas', customer.uncertainties, 'uncertainties'),
        ],
      }),
      renderCustomerGroup({
        key: 'objections',
        title: 'Objeções atuais do cliente',
        count: customerItemCount(customer.objections),
        sections: [
          renderCustomerItems('Objeções', customer.objections, 'objections'),
        ],
      }),
      renderCustomerGroup({
        key: 'commitments',
        title: 'Compromissos comerciais',
        count: customerItemCount(customer.commitments),
        sections: [
          renderCustomerRichItems('Compromissos', customer.commitments, renderCommitment, 'commitments'),
        ],
      }),
      renderCustomerGroup({
        key: 'history',
        title: 'Informações resolvidas e atualizadas',
        count: resolvedInformation.length + supersededInformation.length,
        sections: [
          renderCustomerRichItems(
            'O que já foi resolvido',
            resolvedInformation,
            (item) => renderCustomerHistoryItem(item, 'resolved'),
            'resolved_information',
          ),
          renderCustomerRichItems(
            'Informações anteriores substituídas',
            supersededInformation,
            (item) => renderCustomerHistoryItem(item, 'superseded'),
            'superseded_information',
          ),
        ],
      }),
    ].filter(Boolean)

    if (groups.length === 0) {
      return ''
    }

    return `
      <div class="yolen-card yolen-client-commercial-card" data-yolen-client-intelligence>
        <div class="yolen-client-intelligence-heading">
          <div class="yolen-section-label">Inteligência comercial</div>
          <h3>Cliente</h3>
        </div>
        ${renderCustomerSummary(customer, products, missingDiscovery)}
        <div class="yolen-client-intelligence-groups">
          ${groups.join('')}
        </div>
      </div>
    `
  }

  function renderNowMethodSnapshot(reading) {
    if (!reading || isNeutralCommercialSession(reading)) {
      return ''
    }

    const method = reading.method

    if (!method || typeof method !== 'object') {
      return ''
    }

    const adherenceStatus = method.adherence?.status

    if (method.configured === false || adherenceStatus === 'not_configured') {
      return `
        <div class="yolen-now-snapshot" data-yolen-now-method>
          <div class="yolen-decision-kicker">Método</div>
          <div class="yolen-now-snapshot-copy">Método comercial não configurado.</div>
        </div>
      `
    }

    if (method.configured !== true) {
      return ''
    }

    const currentStage = method.current_stage
    const stage = displayItems(method.stages).find((item) => isCurrentMethodStage(item, currentStage))
    const stageName = displayText(currentStage?.name) || displayText(stage?.name)
    const statusLabel = getMethodStatusLabel(stage?.status)
    const adherenceLabel = getMethodAdherenceLabel(adherenceStatus)

    if (!stageName && !adherenceLabel) {
      return ''
    }

    return `
      <div class="yolen-now-snapshot" data-yolen-now-method>
        <div class="yolen-decision-kicker">Método</div>
        ${stageName ? `<div class="yolen-now-snapshot-copy">${escapeHtml(stageName)}${statusLabel ? ` · ${escapeHtml(statusLabel)}` : ''}</div>` : ''}
        ${adherenceLabel ? `<div class="yolen-now-snapshot-meta ${getAdherenceClass(adherenceStatus)}">${escapeHtml(adherenceLabel)}</div>` : ''}
      </div>
    `
  }

  function renderAttentionItem(label, copy, level, source) {
    const clean = displayText(copy)

    if (!clean) {
      return ''
    }

    return `
      <div
        class="yolen-now-attention yolen-now-attention--${escapeHtml(level)}"
        data-yolen-now-attention="${escapeHtml(source)}"
      >
        <div class="yolen-decision-kicker">${escapeHtml(label)}</div>
        <div class="yolen-now-attention-copy">${escapeHtml(clean)}</div>
      </div>
    `
  }

  function renderNowAttentionSnapshot(reading, clientContextState) {
    if (!reading || isNeutralCommercialSession(reading)) {
      return ''
    }

    const alerts = []
    const adherence = reading.method?.adherence

    if (adherence?.status === 'off_method') {
      alerts.push(
        renderAttentionItem(
          'Atenção · Fora do método',
          adherence.summary || adherence.what_happened,
          'warning',
          'off_method',
        ),
      )
    }

    const context = clientContextState?.status === 'ready'
      ? clientContextState.data
      : null

    const sla = context?.sla

    if (
      sla?.configured === true &&
      sla?.applicable === true &&
      (sla.risk === 'high' || sla.risk === 'medium')
    ) {
      alerts.push(
        renderAttentionItem(
          'Atenção · Prazo de atendimento',
          `${sla.risk === 'high' ? 'Risco alto' : 'Risco médio'} na etapa ${sla.stage_label || sla.stage || 'atual'}.`,
          sla.risk === 'high' ? 'risk' : 'warning',
          'sla',
        ),
      )
    }

    const serviceRisk = displayItems(reading.risks?.service_risks)
      .find((risk) => risk.severity === 'high' || risk.severity === 'medium')

    if (serviceRisk) {
      alerts.push(
        renderAttentionItem(
          'Atenção na condução',
          serviceRisk.summary,
          serviceRisk.severity === 'high' ? 'risk' : 'warning',
          'service_risk',
        ),
      )
    }

    if (alerts.filter(Boolean).length === 0) {
      const improvement = displayItems(reading.improvement_points)
        .find((item) => displayText(item.summary))

      if (improvement) {
        alerts.push(
          renderAttentionItem(
            'Atenção na condução',
            improvement.summary,
            'warning',
            'improvement',
          ),
        )
      }
    }

    return alerts.filter(Boolean).slice(0, 2).join('')
  }

  const api = Object.freeze({
    escapeHtml,
    getMethodStatusLabel,
    getMethodAdherenceLabel,
    getNeutralSessionCopy,
    isNeutralCommercialSession,
    renderAnalysisArea,
    renderClientCommercialArea,
    renderNowAttentionSnapshot,
    renderNowMethodSnapshot,
  })

  root.YolenCompanionSellerInformationView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
