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

  const LEAD_STATUS_LABELS = {
    novo: 'Novo',
    contato: 'Contato',
    respondeu: 'Agenda',
    negociacao: 'Negociação',
    pausado: 'Pausado',
    ganho: 'Ganho',
    perdido: 'Perdido',
    cancelado: 'Cancelado',
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

  // `generatedAt` + `now` permitem "crescer" localmente um valor que o
  // servidor calculou uma vez (ex.: quanto tempo o cliente já está
  // esperando), sem precisar de uma nova chamada de rede a cada minuto que
  // passa. Quando `now` não é informado (todo o resto do módulo, incluindo
  // todos os testes existentes), o comportamento é idêntico ao valor
  // estático que já vinha do servidor — só content-script.js, ao renderizar
  // o painel de verdade, passa `Date.now()` para ativar o crescimento.
  function computeGrownValue(
    baseValue,
    generatedAt,
    now,
    unitMs,
  ) {
    if (
      typeof baseValue !== 'number'
    ) {
      return null
    }

    if (
      typeof now !== 'number' ||
      !generatedAt
    ) {
      return baseValue
    }

    const anchor = new Date(
      generatedAt,
    ).getTime()

    if (
      !Number.isFinite(anchor)
    ) {
      return baseValue
    }

    // O crescimento nunca pode ser negativo: se `now` vier antes de
    // `generatedAt` (relógio do dispositivo adiantado/atrasado, ou um
    // `generated_at` já no passado do servidor mas "no futuro" do
    // navegador por alguns segundos), o valor relatado pelo servidor é
    // mantido como está — nunca reduzido. Diminuir um tempo de espera ou
    // um risco de SLA por causa de desvio de relógio esconderia um risco
    // real, o que é pior do que simplesmente não crescer ainda.
    const elapsedSinceGeneratedAt =
      Math.max(
        0,
        now - anchor,
      )

    return (
      baseValue +
      elapsedSinceGeneratedAt /
        unitMs
    )
  }

  function computeRiskForElapsed(
    sla,
    elapsedMinutes,
  ) {
    if (
      typeof elapsedMinutes !==
      'number'
    ) {
      return sla?.risk ?? null
    }

    if (
      typeof sla.danger_minutes ===
        'number' &&
      elapsedMinutes >=
        sla.danger_minutes
    ) {
      return 'high'
    }

    if (
      typeof sla.warning_minutes ===
        'number' &&
      elapsedMinutes >=
        sla.warning_minutes
    ) {
      return 'medium'
    }

    if (
      typeof sla.target_minutes ===
        'number' ||
      typeof sla.warning_minutes ===
        'number' ||
      typeof sla.danger_minutes ===
        'number'
    ) {
      return 'low'
    }

    return sla?.risk ?? null
  }

  function renderWaitingRow(
    waiting,
    generatedAt,
    now,
  ) {
    const label =
      WAITING_STATE_LABELS[waiting?.state] ||
      WAITING_STATE_LABELS.unknown

    const durationMs =
      computeGrownValue(
        waiting?.waiting_duration_ms,
        generatedAt,
        now,
        1,
      )

    const duration =
      formatRelativeDuration(
        durationMs,
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

  function renderIdentityRows(identity) {
    const status =
      identity?.current_status

    if (!status) {
      return ''
    }

    return (
      '<div class="yolen-client-relationship-row yolen-client-identity-row">' +
      '<span class="yolen-client-relationship-label">Etapa atual</span>' +
      `<span class="yolen-client-relationship-value">${escapeHtml(
        LEAD_STATUS_LABELS[status] || status,
      )}</span>` +
      '</div>'
    )
  }

  function renderSlaRow(
    sla,
    generatedAt,
    now,
  ) {
    if (
      !sla ||
      !sla.applicable ||
      !sla.configured
    ) {
      return ''
    }

    const elapsedMinutes =
      computeGrownValue(
        sla.elapsed_minutes,
        generatedAt,
        now,
        60000,
      )

    // Sem `now` (chamada estática, ex.: testes), confiamos no `risk` que o
    // servidor já calculou. Com `now`, recalculamos localmente contra os
    // mesmos limites reais (`warning_minutes`/`danger_minutes`) que o
    // servidor já enviou — nunca inventando um novo limite, só reaplicando
    // a regra real com o tempo decorrido atualizado.
    const risk =
      typeof now === 'number'
        ? computeRiskForElapsed(
            sla,
            elapsedMinutes,
          )
        : sla.risk

    if (!risk) {
      return ''
    }

    const riskLabel =
      SLA_RISK_LABELS[risk] ||
      risk

    return (
      `<div class="yolen-client-relationship-row yolen-client-relationship-sla" ` +
      `data-yolen-sla-risk="${escapeHtml(risk)}">` +
      `<span class="yolen-client-relationship-label">Tempo na etapa "${escapeHtml(
        sla.stage_label || sla.stage || '',
      )}"</span>` +
      `<span class="yolen-client-relationship-value">${escapeHtml(
        riskLabel,
      )}</span>` +
      '</div>'
    )
  }

  function renderNoMessageHistoryRow() {
    return (
      '<div class="yolen-client-relationship-row yolen-client-relationship-no-history">' +
      '<span class="yolen-client-relationship-value">Sem histórico de conversa ainda.</span>' +
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
      '<details class="yolen-client-timeline" data-yolen-preserve-open="client-timeline">' +
      '<summary>Ver histórico</summary>' +
      `<ul class="yolen-client-timeline-list">${items}</ul>` +
      '</details>'
    )
  }

  function renderRelationshipCard(
    context,
    now,
  ) {
    if (!context) {
      return renderEmptyState()
    }

    const hasMessageHistory =
      Boolean(
        context.relationship
          ?.first_known_interaction_at,
      )

    // Um lead recém-importado pode não ter mensagens ainda e mesmo assim
    // já estar há muito tempo numa etapa com SLA configurado — "sem
    // histórico de conversa" não é o mesmo que "sem inteligência
    // operacional nenhuma". Por isso o SLA é calculado antes de decidir
    // se cai no estado vazio.
    const slaRow =
      renderSlaRow(
        context.sla,
        context.generated_at,
        now,
      )

    if (
      !hasMessageHistory &&
      !slaRow
    ) {
      return renderEmptyState()
    }

    const rows = hasMessageHistory
      ? renderIdentityRows(
          context.identity,
        ) +
        renderRelationshipRows(
          context.relationship,
        ) +
        renderWaitingRow(
          context.waiting,
          context.generated_at,
          now,
        ) +
        slaRow
      : renderIdentityRows(
          context.identity,
        ) +
        renderNoMessageHistoryRow() +
        slaRow

    const timeline = hasMessageHistory
      ? renderTimelineList(
          context.timeline,
        )
      : ''

    return (
      '<div class="yolen-client-relationship yolen-client-relationship--ready">' +
      `<div class="yolen-client-relationship-rows">${rows}</div>` +
      timeline +
      '</div>'
    )
  }

  function renderClientContextSection(
    state,
    now,
  ) {
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
        now,
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
