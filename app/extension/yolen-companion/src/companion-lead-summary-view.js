;(function initCompanionLeadSummaryView(root) {
  // O Companion gira em torno do WORKING SUMMARY automático. O vendedor não
  // escreve resumo manualmente. A orientação do método lê esse mesmo resumo
  // e entrega somente o próximo passo; mensagem sugerida continua fora desta
  // etapa da reconstrução.

  const COMPACT_SUMMARY_CHAR_THRESHOLD = 220

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function formatAbsoluteDate(isoValue) {
    if (!isoValue) {
      return null
    }

    const parsed = new Date(isoValue)

    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    const day = String(parsed.getDate()).padStart(2, '0')
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const hours = String(parsed.getHours()).padStart(2, '0')
    const minutes = String(parsed.getMinutes()).padStart(2, '0')

    return `${day}/${month} ${hours}:${minutes}`
  }

  function renderModeStyles() {
    return (
      '<style>' +
      '.yolen-lead-summary-card > .yolen-section-label{display:none!important;}' +
      
      '.yolen-lead-summary-details{margin:0;}' +
      '.yolen-lead-summary-toggle{display:block;list-style:none;cursor:pointer;outline:none;}' +
      '.yolen-lead-summary-toggle::-webkit-details-marker{display:none;}' +
      '.yolen-lead-summary-preview{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;color:#edf5ff;font-size:12px;font-weight:600;line-height:1.55;white-space:pre-wrap;}' +
      '.yolen-lead-summary-expand-label{display:inline-block;margin-top:8px;color:#93c5fd;font-size:11px;font-weight:800;}' +
      '.yolen-lead-summary-expand-label--open{display:none;}' +
      '.yolen-lead-summary-details[open] .yolen-lead-summary-preview{display:none;}' +
      '.yolen-lead-summary-details[open] .yolen-lead-summary-expand-label--closed{display:none;}' +
      '.yolen-lead-summary-details[open] .yolen-lead-summary-expand-label--open{display:inline-block;margin-top:0;}' +
      '.yolen-lead-summary-full-text{margin-top:9px;color:#edf5ff;font-size:12px;font-weight:600;line-height:1.55;white-space:pre-wrap;}' +
      '.yolen-method-guidance{margin-top:13px;padding-top:13px;border-top:1px solid rgba(126,153,194,.16);}' +
      '.yolen-method-guidance-label{color:#8ea0b8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px;}' +
      '.yolen-method-guidance-next-step{color:#f5f9ff;font-size:13px;font-weight:700;line-height:1.55;}' +
      '.yolen-method-guidance-meta{margin-top:8px;color:#93a6bf;font-size:10px;font-weight:700;line-height:1.4;}' +
      '.yolen-method-guidance-note{margin-top:12px;padding-top:10px;border-top:1px solid rgba(126,153,194,.12);color:#9fb0c6;font-size:11px;line-height:1.45;}' +
      '.yolen-method-guidance-error-detail{margin-top:6px;color:#7f91aa;font-size:10px;line-height:1.45;}' +
      '.yolen-method-guidance-retry{margin-top:9px;}' +
      '</style>'
    )
  }

  function getSourceLabel(source) {
    const labels = {
      canonical: 'Resumo salvo na Yolen',
      canonical_plus_conversation: 'Resumo salvo + conversa atual',
      canonical_plus_history: 'Resumo salvo + histórico confirmado',
      canonical_plus_history_plus_conversation: 'Resumo salvo + histórico + conversa atual',
      registered_history: 'Conversa registrada na Yolen',
      registered_history_plus_conversation: 'Conversa registrada + conversa atual',
      legacy_history: 'Histórico já salvo na Yolen',
      legacy_history_plus_conversation: 'Histórico da Yolen + conversa atual',
      conversation_only: 'Conversa atual',
      empty: 'Sem conteúdo disponível',
    }

    return labels[source] || 'Contexto atual'
  }

  function renderLoadingState() {
    return (
      renderModeStyles() +
      '<div class="yolen-section-label">Resumo atual</div>' +
      '<div class="yolen-lead-summary yolen-lead-summary--loading">' +
      'Atualizando resumo…' +
      '</div>'
    )
  }

  function renderErrorState(message) {
    const safeMessage = escapeHtml(
      message || 'Não foi possível atualizar o resumo.',
    )

    return (
      renderModeStyles() +
      '<div class="yolen-section-label">Resumo atual</div>' +
      '<div class="yolen-lead-summary yolen-lead-summary--error">' +
      safeMessage +
      '</div>' +
      '<div class="yolen-inline-actions">' +
      '<button type="button" class="yolen-secondary-button" data-yolen-action="refresh">' +
      'Tentar novamente' +
      '</button>' +
      '</div>'
    )
  }

  function renderSaveFeedback(state) {
    const saveStatus = state?.saveStatus || 'idle'

    if (saveStatus === 'conflict') {
      return (
        '<div class="yolen-lead-summary-feedback yolen-lead-summary-feedback--conflict">' +
        'O resumo foi atualizado por outra ação. Atualize antes de salvar novamente.' +
        '</div>'
      )
    }

    if (saveStatus === 'error') {
      return (
        '<div class="yolen-lead-summary-feedback yolen-lead-summary-feedback--error">' +
        escapeHtml(state?.saveError || 'Não foi possível salvar o resumo.') +
        '</div>'
      )
    }

    if (saveStatus === 'saving') {
      return (
        '<div class="yolen-lead-summary-feedback">' +
        'Salvando resumo…' +
        '</div>'
      )
    }

    return ''
  }

  function shouldCollapseSummary(summary) {
    return (
      summary.length > COMPACT_SUMMARY_CHAR_THRESHOLD ||
      summary.split(/\r?\n/).length > 5
    )
  }

  function buildCompactPreview(summary) {
    const normalized = summary.replace(/\s+/g, ' ').trim()

    if (normalized.length <= COMPACT_SUMMARY_CHAR_THRESHOLD) {
      return normalized
    }

    const candidate = normalized.slice(0, COMPACT_SUMMARY_CHAR_THRESHOLD + 1)
    const minimumUsefulCut = Math.floor(COMPACT_SUMMARY_CHAR_THRESHOLD * 0.55)
    let sentenceCut = -1

    for (let index = minimumUsefulCut; index < candidate.length; index += 1) {
      if (
        (candidate[index] === '.' || candidate[index] === '!' || candidate[index] === '?') &&
        (index === candidate.length - 1 || /\s/.test(candidate[index + 1]))
      ) {
        sentenceCut = index + 1
      }
    }

    if (sentenceCut > 0) {
      return candidate.slice(0, sentenceCut).trim()
    }

    const wordCut = candidate.lastIndexOf(' ', COMPACT_SUMMARY_CHAR_THRESHOLD)
    const cutAt = wordCut >= minimumUsefulCut
      ? wordCut
      : COMPACT_SUMMARY_CHAR_THRESHOLD

    return `${candidate.slice(0, cutAt).trim()}…`
  }

  function renderWorkingSummary(summary) {
    const safeSummary = escapeHtml(summary)

    if (!shouldCollapseSummary(summary)) {
      return (
        '<div class="yolen-lead-summary-text">' +
        safeSummary +
        '</div>'
      )
    }

    const safePreview = escapeHtml(buildCompactPreview(summary))

    return (
      '<details ' +
      'class="yolen-lead-summary-details" ' +
      'data-yolen-preserve-details="lead-summary-full"' +
      '>' +
      '<summary class="yolen-lead-summary-toggle">' +
      '<span class="yolen-lead-summary-preview">' +
      safePreview +
      '</span>' +
      '<span class="yolen-lead-summary-expand-label yolen-lead-summary-expand-label--closed">' +
      'Ver resumo completo' +
      '</span>' +
      '<span class="yolen-lead-summary-expand-label yolen-lead-summary-expand-label--open">' +
      'Ocultar resumo' +
      '</span>' +
      '</summary>' +
      '<div class="yolen-lead-summary-full-text">' +
      safeSummary +
      '</div>' +
      '</details>'
    )
  }

  function renderMethodGuidance(guidance) {
    if (!guidance || guidance.status === 'no_summary') {
      return ''
    }

    if (guidance.status === 'loading') {
      return (
        '<div class="yolen-method-guidance-note">' +
        'Definindo próximo passo pelo método…' +
        '</div>'
      )
    }

    if (guidance.status === 'not_applicable') {
      return (
        '<div class="yolen-method-guidance-note">' +
        'Sem próximo passo comercial neste momento.' +
        '</div>'
      )
    }

    if (
      guidance.status === 'ready' &&
      typeof guidance.next_step === 'string' &&
      guidance.next_step.trim()
    ) {
      const methodName =
        typeof guidance.method_name === 'string'
          ? guidance.method_name.trim()
          : ''
      const stageName =
        typeof guidance.stage_name === 'string'
          ? guidance.stage_name.trim()
          : ''

      const meta = [
        methodName ? `Método: ${methodName}` : null,
        stageName ? `Etapa: ${stageName}` : null,
      ].filter(Boolean).join(' · ')

      return (
        '<div class="yolen-method-guidance">' +
        '<div class="yolen-method-guidance-label">Próximo passo</div>' +
        '<div class="yolen-method-guidance-next-step">' +
        escapeHtml(guidance.next_step) +
        '</div>' +
        (meta
          ? '<div class="yolen-method-guidance-meta">' + escapeHtml(meta) + '</div>'
          : '') +
        '</div>'
      )
    }

    if (guidance.status === 'missing_method') {
      return (
        '<div class="yolen-method-guidance-note">' +
        'Método comercial ainda não publicado na Yolen.' +
        '</div>'
      )
    }

    if (guidance.status === 'invalid_method') {
      return (
        '<div class="yolen-method-guidance-note">' +
        'O método comercial publicado precisa ser revisado antes de orientar o próximo passo.' +
        '</div>'
      )
    }

    if (guidance.status === 'error') {
      const technicalDetail =
        typeof guidance.error === 'string' && guidance.error.trim()
          ? guidance.error.trim()
          : ''

      return (
        '<div class="yolen-method-guidance-note">' +
        'Não foi possível definir o próximo passo agora.' +
        (technicalDetail
          ? '<div class="yolen-method-guidance-error-detail">' +
              escapeHtml(technicalDetail) +
            '</div>'
          : '') +
        '<button type="button" class="yolen-secondary-button yolen-method-guidance-retry" data-yolen-action="retry-method-guidance">' +
        'Tentar novamente' +
        '</button>' +
        '</div>'
      )
    }

    return ''
  }

  function renderReadyState(state) {
    const data = state?.data || {}
    const savedSummary = data.summary || null
    const workingSummary =
      typeof data.working_summary === 'string' && data.working_summary.trim()
        ? data.working_summary.trim()
        : savedSummary?.summary || null

    const hasUnsavedChanges =
      typeof data.has_unsaved_changes === 'boolean'
        ? data.has_unsaved_changes
        : Boolean(workingSummary && !savedSummary)

    const saving = state?.saveStatus === 'saving'
    const sourceLabel = getSourceLabel(data.working_summary_source)

    if (!workingSummary) {
      return (
        renderModeStyles() +
        '<div class="yolen-section-label">Resumo atual</div>' +
        '<div class="yolen-lead-summary yolen-lead-summary--ready">' +
        '<div class="yolen-seller-empty-state">' +
        'Ainda não há mensagens ou histórico suficientes para formar o resumo deste lead.' +
        '</div>' +
        '</div>'
      )
    }

    const savedMeta = savedSummary
      ? (
          `Versão ${escapeHtml(savedSummary.version)}` +
          (formatAbsoluteDate(savedSummary.updated_at)
            ? ` · salva em ${formatAbsoluteDate(savedSummary.updated_at)}`
            : '')
        )
      : 'Ainda não consolidado na memória nova da Yolen'

    return (
      renderModeStyles() +
      '<div class="yolen-section-label">Resumo atual</div>' +
      '<div class="yolen-lead-summary yolen-lead-summary--ready">' +
      renderWorkingSummary(workingSummary) +
      '<div class="yolen-lead-summary-meta">' +
      escapeHtml(sourceLabel) +
      ' · ' +
      escapeHtml(savedMeta) +
      '</div>' +
      '<div data-yolen-method-guidance-slot>' +
      renderMethodGuidance(data.method_guidance) +
      '</div>' +
      '<div data-yolen-seller-message-mount></div>' +
      '<input type="hidden" data-yolen-textarea="lead-summary" value="' +
      escapeHtml(workingSummary) +
      '">' +
      renderSaveFeedback(state) +
      (hasUnsavedChanges
        ? (
            '<button ' +
            'type="button" ' +
            'class="yolen-secondary-button yolen-lead-summary-save-button" ' +
            'data-yolen-action="save-lead-summary" ' +
            (saving ? 'disabled' : '') +
            '>' +
            (saving ? 'Salvando…' : 'Salvar resumo na Yolen') +
            '</button>'
          )
        : (
            '<div class="yolen-operational-note">Resumo salvo na Yolen.</div>'
          )) +
      '</div>'
    )
  }

  function renderLeadSummarySection(state) {
    const status = state?.status || 'idle'

    if (status === 'loading') {
      return renderLoadingState()
    }

    if (status === 'error') {
      return renderErrorState(state?.error)
    }

    if (status === 'ready') {
      return renderReadyState(state)
    }

    return renderLoadingState()
  }

  const api = Object.freeze({
    renderLeadSummarySection,
    renderMethodGuidance,
    escapeHtml,
    formatAbsoluteDate,
  })

  root.YolenCompanionLeadSummaryView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
