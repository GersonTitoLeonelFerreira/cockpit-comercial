;(function initCompanionClientContextView(root) {
  // Módulo puro (sem DOM) que traduz um CompanionClientContext — ou um
  // estado de carregamento/erro/vazio — em HTML. Mantido separado de
  // content-script.js para poder ser testado diretamente com node:test,
  // sem jsdom: toda a lógica de "o que mostrar" mora aqui; content-script.js
  // só busca os dados e injeta o HTML retornado no DOM real.

  const WAITING_STATE_LABELS = {
    customer_waiting_for_seller:
      'Cliente aguardando você',

    seller_waiting_for_customer:
      'Aguardando resposta do cliente',

    no_pending_response:
      'Sem pendência de resposta',

    unknown:
      'Ainda sem dados suficientes',
  }

  const SLA_RISK_LABELS = {
    low: 'Risco baixo',
    medium: 'Risco médio',
    high: 'Risco alto',
  }

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
    const year = parsed.getFullYear()

    return `${day}/${month}/${year}`
  }

  function formatRelativeDuration(durationMs) {
    if (
      typeof durationMs !== 'number' ||
      !Number.isFinite(durationMs) ||
      durationMs < 0
    ) {
      return null
    }

    const minutes = Math.floor(durationMs / 60000)

    if (minutes < 1) {
      return 'agora mesmo'
    }

    if (minutes < 60) {
      return `há ${minutes}min`
    }

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours < 24) {
      return remainingMinutes > 0
        ? `há ${hours}h${String(remainingMinutes).padStart(2, '0')}`
        : `há ${hours}h`
    }

    const days = Math.floor(hours / 24)

    if (days < 30) {
      return `há ${days} dia${days === 1 ? '' : 's'}`
    }

    const months = Math.floor(days / 30)

    return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
  }

  function renderLoadingState() {
    return (
      '<div class="yolen-client-relationship yolen-client-relationship--loading">' +
      'Carregando relacionamento com o cliente…' +
      '</div>'
    )
  }

  function renderErrorState(message) {
    const safeMessage =
      escapeHtml(
        message ||
          'Não foi possível carregar o relacionamento com o cliente.',
      )

    return (
      '<div class="yolen-client-relationship yolen-client-relationship--error">' +
      safeMessage +
      '</div>'
    )
  }

  function renderEmptyState() {
    return (
      '<div class="yolen-client-relationship yolen-client-relationship--empty">' +
      'Ainda não há histórico suficiente com este cliente.' +
      '</div>'
    )
  }

  function renderWaitingRow(waiting) {
    const label =
      WAITING_STATE_LABELS[waiting?.state] ||
      WAITING_STATE_LABELS.unknown

    const duration =
      formatRelativeDuration(
        waiting?.waiting_duration_ms,
      )

    return (
      '<div class="yolen-client-relationship-row yolen-client-relationship-waiting" ' +
      `data-yolen-waiting-state="${escapeHtml(waiting?.state || 'unknown')}">` +
      `<span class="yolen-client-relationship-label">Situação</span>` +
      `<span class="yolen-client-relationship-value">${escapeHtml(label)}${
        duration ? ` · ${escapeHtml(duration)}` : ''
      }</span>` +
      '</div>'
    )
  }

  function renderRelationshipRows(relationship) {
    const rows = []

    const firstContact =
      formatAbsoluteDate(
        relationship?.first_known_interaction_at,
      )

    if (firstContact) {
      rows.push(
        `<div class="yolen-client-relationship-row">` +
          `<span class="yolen-client-relationship-label">Primeiro contato</span>` +
          `<span class="yolen-client-relationship-value">${escapeHtml(firstContact)}</span>` +
          '</div>',
      )
    }

    const relationshipAge =
      formatRelativeDuration(
        relationship?.relationship_age_ms,
      )

    if (relationshipAge) {
      rows.push(
        `<div class="yolen-client-relationship-row">` +
          `<span class="yolen-client-relationship-label">Em conversa há</span>` +
          `<span class="yolen-client-relationship-value">${escapeHtml(relationshipAge)}</span>` +
          '</div>',
      )
    }

    const lastCustomerMessage =
      formatRelativeDuration(
        relationship
          ?.latest_customer_message_at
          ? Date.now() -
              new Date(
                relationship.latest_customer_message_at,
              ).getTime()
          : null,
      )

    if (lastCustomerMessage) {
      rows.push(
        `<div class="yolen-client-relationship-row">` +
          `<span class="yolen-client-relationship-label">Última mensagem do cliente</span>` +
          `<span class="yolen-client-relationship-value">${escapeHtml(lastCustomerMessage)}</span>` +
          '</div>',
      )
    }

    const lastSellerMessage =
      formatRelativeDuration(
        relationship
          ?.latest_seller_message_at
          ? Date.now() -
              new Date(
                relationship.latest_seller_message_at,
              ).getTime()
          : null,
      )

    if (lastSellerMessage) {
      rows.push(
        `<div class="yolen-client-relationship-row">` +
          `<span class="yolen-client-relationship-label">Última mensagem do vendedor</span>` +
          `<span class="yolen-client-relationship-value">${escapeHtml(lastSellerMessage)}</span>` +
          '</div>',
      )
    }

    if (
      typeof relationship?.known_interaction_count ===
        'number' &&
      relationship.known_interaction_count > 0
    ) {
      rows.push(
        `<div class="yolen-client-relationship-row">` +
          `<span class="yolen-client-relationship-label">Interações conhecidas</span>` +
          `<span class="yolen-client-relationship-value">${relationship.known_interaction_count}</span>` +
          '</div>',
      )
    }

    return rows.join('')
  }

  function renderSlaRow(sla) {
    if (
      !sla ||
      !sla.applicable ||
      !sla.configured ||
      !sla.risk
    ) {
      return ''
    }

    const riskLabel =
      SLA_RISK_LABELS[sla.risk] ||
      sla.risk

    return (
      `<div class="yolen-client-relationship-row yolen-client-relationship-sla" ` +
      `data-yolen-sla-risk="${escapeHtml(sla.risk)}">` +
      `<span class="yolen-client-relationship-label">Tempo na etapa "${escapeHtml(
        sla.stage_label || sla.stage || '',
      )}"</span>` +
      `<span class="yolen-client-relationship-value">${escapeHtml(
        riskLabel,
      )}</span>` +
      '</div>'
    )
  }

  function renderTimelineList(timeline) {
    if (
      !Array.isArray(timeline) ||
      timeline.length === 0
    ) {
      return ''
    }

    const items = timeline
      .map((event) => {
        const date =
          formatAbsoluteDate(
            event.occurred_at,
          ) || ''

        const detail =
          event.detail
            ? ` — ${escapeHtml(event.detail)}`
            : ''

        return (
          '<li class="yolen-client-timeline-item">' +
          `<span class="yolen-client-timeline-date">${escapeHtml(date)}</span> ` +
          `<span class="yolen-client-timeline-label">${escapeHtml(
            event.label,
          )}${detail}</span>` +
          '</li>'
        )
      })
      .join('')

    return (
      '<details class="yolen-client-timeline">' +
      '<summary>Histórico da relação</summary>' +
      `<ul class="yolen-client-timeline-list">${items}</ul>` +
      '</details>'
    )
  }

  function renderRelationshipCard(context) {
    if (
      !context ||
      !context.relationship ||
      !context.relationship
        .first_known_interaction_at
    ) {
      return renderEmptyState()
    }

    const rows =
      renderRelationshipRows(
        context.relationship,
      ) +
      renderWaitingRow(
        context.waiting,
      ) +
      renderSlaRow(
        context.sla,
      )

    const timeline =
      renderTimelineList(
        context.timeline,
      )

    return (
      '<div class="yolen-client-relationship yolen-client-relationship--ready">' +
      `<div class="yolen-client-relationship-rows">${rows}</div>` +
      timeline +
      '</div>'
    )
  }

  function renderClientContextSection(state) {
    const status =
      state?.status ||
      'idle'

    if (status === 'loading') {
      return renderLoadingState()
    }

    if (status === 'error') {
      return renderErrorState(
        state?.error,
      )
    }

    if (
      status === 'ready' &&
      state?.data
    ) {
      return renderRelationshipCard(
        state.data,
      )
    }

    return renderEmptyState()
  }

  const api = Object.freeze({
    renderClientContextSection,
    renderRelationshipCard,
    formatRelativeDuration,
    formatAbsoluteDate,
    escapeHtml,
  })

  root.YolenCompanionClientContextView =
    api

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
