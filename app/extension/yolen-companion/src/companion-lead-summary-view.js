;(function initCompanionLeadSummaryView(root) {
  // Etapa 1B — este módulo mostra o WORKING SUMMARY automático.
  // O vendedor não escreve resumo manualmente. A única ação humana desta
  // camada é confirmar quando o resumo atual deve virar memória persistida
  // na Yolen.

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
    // Enquanto AGORA está sendo reconstruído, o seller-facing antigo fica
    // fora da tela. O código antigo continua disponível para a etapa futura
    // de ANÁLISE, mas não concorre visualmente com o novo resumo central.
    return (
      '<style>' +
      '.yolen-lead-summary-card > .yolen-section-label{display:none!important;}' +
      '.yolen-seller-panel[data-yolen-seller-panel="now"]{display:none!important;}' +
      '</style>'
    )
  }

  function getSourceLabel(source) {
    const labels = {
      canonical: 'Resumo salvo na Yolen',
      canonical_plus_conversation: 'Resumo salvo + conversa atual',
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
      '<div class="yolen-lead-summary-text">' +
      escapeHtml(workingSummary) +
      '</div>' +
      '<div class="yolen-lead-summary-meta">' +
      escapeHtml(sourceLabel) +
      ' · ' +
      escapeHtml(savedMeta) +
      '</div>' +
      // O content-script existente lê `.value` de data-yolen-textarea.
      // Mantemos apenas um input hidden de compatibilidade; não há campo
      // editável/manual na interface.
      '<input type="hidden" data-yolen-textarea="lead-summary" value="' +
      escapeHtml(workingSummary) +
      '">' +
      renderSaveFeedback(state) +
      (hasUnsavedChanges
        ? (
            '<button ' +
            'type="button" ' +
            'class="yolen-primary-button yolen-lead-summary-save-button" ' +
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
    escapeHtml,
    formatAbsoluteDate,
  })

  root.YolenCompanionLeadSummaryView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
