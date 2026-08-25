;(function initCompanionLeadSummaryView(root) {
  // Módulo puro (sem DOM) que traduz o estado do "Resumo persistente do
  // lead" — Etapa 1 da reconstrução controlada do Companion — em HTML.
  // Mesmo padrão de companion-client-context-view.js: toda a lógica de "o
  // que mostrar" mora aqui; content-script.js só busca os dados (via
  // yolen-api.js) e injeta o HTML retornado no DOM real.
  //
  // Este bloco NUNCA salva nada sozinho: o botão "Salvar resumo na Yolen"
  // só existe para content-script.js poder disparar uma ação EXPLÍCITA do
  // vendedor. Não há geração automática de resumo aqui.

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

  function renderLoadingState() {
    return (
      '<div class="yolen-lead-summary yolen-lead-summary--loading">' +
      'Carregando resumo salvo na Yolen…' +
      '</div>'
    )
  }

  function renderErrorState(message) {
    const safeMessage = escapeHtml(
      message || 'Não foi possível carregar o resumo salvo na Yolen.',
    )

    return (
      '<div class="yolen-lead-summary yolen-lead-summary--error">' +
      safeMessage +
      '</div>'
    )
  }

  function renderSaveFeedback(state) {
    const saveStatus = state?.saveStatus || 'idle'

    if (saveStatus === 'conflict') {
      return (
        '<div class="yolen-lead-summary-feedback yolen-lead-summary-feedback--conflict">' +
        'O resumo foi atualizado por outra ação desde a última leitura. ' +
        'Recarregue antes de salvar novamente.' +
        '</div>'
      )
    }

    if (saveStatus === 'error') {
      const safeMessage = escapeHtml(
        state?.saveError || 'Não foi possível salvar o resumo.',
      )

      return (
        '<div class="yolen-lead-summary-feedback yolen-lead-summary-feedback--error">' +
        safeMessage +
        '</div>'
      )
    }

    return ''
  }

  function renderEditor(state) {
    const summary = state?.data?.summary || null
    const draftValue = escapeHtml(
      typeof state?.draftValue === 'string'
        ? state.draftValue
        : summary?.summary || '',
    )
    const saving = state?.saveStatus === 'saving'

    return (
      '<div class="yolen-lead-summary-editor">' +
      '<textarea ' +
      'class="yolen-lead-summary-textarea" ' +
      'data-yolen-textarea="lead-summary" ' +
      'placeholder="Escreva ou ajuste o resumo deste lead…" ' +
      (saving ? 'disabled ' : '') +
      `>${draftValue}</textarea>` +
      renderSaveFeedback(state) +
      '<button ' +
      'type="button" ' +
      'class="yolen-primary-button yolen-lead-summary-save-button" ' +
      'data-yolen-action="save-lead-summary" ' +
      (saving ? 'disabled' : '') +
      '>' +
      (saving ? 'Salvando…' : 'Salvar resumo na Yolen') +
      '</button>' +
      '</div>'
    )
  }

  function renderReadyState(state) {
    const summary = state?.data?.summary || null

    const summaryBlock = summary
      ? '<div class="yolen-lead-summary-text">' +
        escapeHtml(summary.summary) +
        '</div>' +
        '<div class="yolen-lead-summary-meta">' +
        `Versão ${escapeHtml(summary.version)}` +
        (formatAbsoluteDate(summary.updated_at)
          ? ` · atualizado em ${formatAbsoluteDate(summary.updated_at)}`
          : '') +
        '</div>'
      : '<div class="yolen-seller-empty-state">' +
        'Ainda não existe resumo salvo para este lead.' +
        '</div>'

    return (
      '<div class="yolen-lead-summary yolen-lead-summary--ready">' +
      summaryBlock +
      renderEditor(state) +
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
