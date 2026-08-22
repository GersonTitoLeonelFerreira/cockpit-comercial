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
    const customer = renderRiskGroup(
      'Risco ou objeção do cliente',
      reading?.risks?.customer_objections,
      'customer',
    )

    const seller = renderRiskGroup(
      'Risco na condução do vendedor',
      reading?.risks?.service_risks,
      'seller',
    )

    if (!customer && !seller) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-analysis-section="risks">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Leitura de risco</div>
            <h3>Cliente e condução</h3>
          </div>
        </div>
        ${customer}
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

  function renderCustomerItems(label, items) {
    const summaries = displayItems(items)
      .map((item) => displayText(item.summary))
      .filter(Boolean)

    if (summaries.length === 0) {
      return ''
    }

    return `
      <div class="yolen-client-knowledge-group">
        <div class="yolen-client-knowledge-label">${escapeHtml(label)}</div>
        <ul class="yolen-client-knowledge-list">
          ${summaries.map((summary) => `<li>${escapeHtml(summary)}</li>`).join('')}
        </ul>
      </div>
    `
  }

  function renderClientCommercialArea(reading) {
    const customer = reading?.customer

    if (!customer || typeof customer !== 'object') {
      return ''
    }

    const known = [
      renderCustomerItems('Necessidades', customer.needs),
      renderCustomerItems('Interesses', customer.interests),
      renderCustomerItems('Critérios de decisão', customer.decision_criteria),
      renderCustomerItems('Preferências', customer.preferences),
    ].filter(Boolean)

    const open = [
      renderCustomerItems('Perguntas em aberto', customer.open_questions),
      renderCustomerItems('Objeções do cliente', customer.objections),
      renderCustomerItems('Incertezas', customer.uncertainties),
    ].filter(Boolean)

    const sections = []

    if (known.length > 0) {
      sections.push(`
        <section class="yolen-client-knowledge-section" data-yolen-client-section="known">
          <h3>O que sabemos</h3>
          ${known.join('')}
        </section>
      `)
    }

    if (open.length > 0) {
      sections.push(`
        <section class="yolen-client-knowledge-section" data-yolen-client-section="open">
          <h3>Em aberto</h3>
          ${open.join('')}
        </section>
      `)
    }

    return sections.length > 0
      ? `<div class="yolen-card yolen-client-commercial-card">${sections.join('')}</div>`
      : ''
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
