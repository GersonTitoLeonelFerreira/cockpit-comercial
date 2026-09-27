;(function initYolenCompanionContactLinkController(root) {
// FASE 7 — vínculo manual de identidade externa, dono único no Core.
//
// Substitui o runtime paralelo do ManyChat (manychat-contact-link-runtime):
// CONTACT_NOT_LINKED (capability can_link_lead do backend) + identidade
// externa segura da conversa atual → buscar → selecionar → confirmar →
// FIRST_LINK_EXTERNAL_IDENTITY → nova resolução pelo Core. Só first-link
// (nunca relink). Toda resposta assíncrona é conferida contra o contexto
// imutável da operação (conversa/geração/empresa/sessão) e contra a
// identidade travada no início do fluxo; a identidade é revalidada pelo
// ChannelAdapter imediatamente antes do vínculo.
function createCompanionContactLinkController(ctx) {
  const {
    escapeHtml,
    renderPanel,
    resolveCurrentLead,
    captureOperationContext,
    isOperationContextCurrent,
    channelAdapter,
    clearLeadResolutionCache,
  } = ctx

  const ERROR_MESSAGES = Object.freeze({
    INVALID_COMPANION_TOKEN: 'Sessão da Yolen expirada. Reconecte a extensão.',
    NO_COMPANY_PERMISSION: 'Você não tem permissão para vincular leads nesta empresa.',
    QUERY_TOO_SHORT: 'Digite pelo menos 2 letras do nome ou 4 dígitos do telefone.',
    LEAD_ACCESS_DENIED: 'Você não tem permissão para vincular este lead.',
    SOFT_DELETED: 'Este lead foi arquivado ou excluído.',
    LEAD_NOT_FOUND: 'Lead não encontrado.',
    CONFIRMATION_REQUIRED: 'Confirmação obrigatória antes de vincular.',
    ALREADY_LINKED_CONFLICT: 'Este contato foi vinculado enquanto você concluía esta ação.',
    NETWORK_ERROR: 'Erro de conexão. Tente novamente.',
    CONTACT_CHANGED: 'Você mudou de conversa. Inicie o vínculo novamente.',
    IDENTITY_NOT_READY: 'Identidade do contato ainda não está pronta. Tente novamente.',
  })

  const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir. Tente novamente.'

  function resolveErrorMessage(code) {
    return ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE
  }

  // Mesma sanitização local do backend (sanitizeSearchTerm) — só decide se
  // vale disparar a busca; o servidor segue sendo a autoridade.
  function hasEnoughToSearch(rawQuery) {
    const digits = String(rawQuery ?? '').replace(/\D/g, '')
    const sanitized = String(rawQuery ?? '')
      .trim()
      .replace(/[%_\\(),']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return digits.length >= 4 || sanitized.length >= 2
  }

  // Um único fluxo, sempre preso ao contexto de operação em que começou.
  let flow = null

  function createIdleFlow() {
    return {
      phase: 'prompt',
      context: null,
      lockedIdentity: null,
      query: '',
      results: [],
      selectedIndex: null,
      searching: false,
      error: null,
      sequence: 0,
    }
  }

  function getCurrentExternalIdentity() {
    const identity =
      ctx.state.conversationExternalIdentity

    return identity?.platform && identity?.key
      ? identity
      : null
  }

  // O fluxo só existe para a conversa/contato em que começou.
  function getCurrentFlow() {
    if (
      !flow ||
      !flow.context ||
      !isOperationContextCurrent(flow.context) ||
      getCurrentExternalIdentity()?.key !==
        flow.lockedIdentity?.key
    ) {
      flow = null
      return null
    }

    return flow
  }

  function isLinkAvailable() {
    const resolution =
      ctx.state.leadResolutionViewModel

    return Boolean(
      ctx.state.connected &&
      !ctx.state.leadResolutionLoading &&
      resolution?.status === 'CONTACT_NOT_LINKED' &&
      resolution.capabilities?.can_link_lead === true &&
      getCurrentExternalIdentity(),
    )
  }

  function isStillCurrent(currentFlow, sequence) {
    return (
      flow === currentFlow &&
      currentFlow.sequence === sequence &&
      Boolean(getCurrentFlow())
    )
  }

  function renderErrorBlock(error) {
    return error
      ? `<div class="yolen-lead-create-status" data-tone="error">${escapeHtml(error.message)}</div>`
      : ''
  }

  function renderResultItem(lead, index) {
    const details = [
      lead?.phone_hint ? `Tel. ${lead.phone_hint}` : null,
      lead?.owner_name ? `Carteira: ${lead.owner_name}` : null,
      lead?.cycle_status ? `Etapa: ${lead.cycle_status}` : null,
    ].filter(Boolean)

    return `
      <li class="yolen-contact-link-result">
        <button type="button" class="yolen-secondary-button" data-yolen-action="contact-link-select" data-yolen-link-index="${index}">
          <strong>${escapeHtml(lead?.name ?? 'Lead sem nome')}</strong>
          ${details.length > 0 ? `<span>${escapeHtml(details.join(' · '))}</span>` : ''}
        </button>
      </li>
    `
  }

  function getContactLinkHtml() {
    if (!isLinkAvailable()) {
      return ''
    }

    const current = getCurrentFlow()

    if (!current || current.phase === 'prompt') {
      return `
        <div class="yolen-contact-link" data-yolen-contact-link="prompt">
          <button class="yolen-secondary-button" type="button" data-yolen-action="contact-link-start">
            Vincular a um lead da Yolen
          </button>
        </div>
      `
    }

    if (current.phase === 'error') {
      return `
        <div class="yolen-contact-link" data-yolen-contact-link="error">
          ${renderErrorBlock(current.error)}
          <button class="yolen-secondary-button" type="button" data-yolen-action="contact-link-start">
            Tentar novamente
          </button>
        </div>
      `
    }

    if (current.phase === 'confirm' || current.phase === 'linking') {
      const lead = current.results[current.selectedIndex]
      const linking = current.phase === 'linking'

      return `
        <div class="yolen-contact-link" data-yolen-contact-link="${linking ? 'linking' : 'confirm'}">
          <p>Vincular este contato a ${escapeHtml(lead?.name ?? 'este lead')}?</p>
          ${renderErrorBlock(current.error)}
          <button class="yolen-primary-button" type="button" data-yolen-action="contact-link-confirm" ${linking ? 'disabled' : ''}>
            ${linking ? 'Vinculando...' : 'Confirmar vínculo'}
          </button>
          <button class="yolen-secondary-button" type="button" data-yolen-action="contact-link-cancel" ${linking ? 'disabled' : ''}>
            Cancelar
          </button>
        </div>
      `
    }

    return `
      <div class="yolen-contact-link" data-yolen-contact-link="search">
        <label class="yolen-field-label">
          Buscar lead
          <input type="text" class="yolen-input" data-yolen-link-query placeholder="Nome ou telefone" value="${escapeHtml(current.query)}" />
        </label>
        <button class="yolen-secondary-button" type="button" data-yolen-action="contact-link-search">
          Buscar
        </button>
        ${current.searching ? '<div class="yolen-lead-create-status" data-tone="loading">Buscando...</div>' : ''}
        ${renderErrorBlock(current.error)}
        <ul class="yolen-contact-link-results">${current.results.map(renderResultItem).join('')}</ul>
      </div>
    `
  }

  function startContactLink() {
    const identity = getCurrentExternalIdentity()

    if (!isLinkAvailable()) {
      return
    }

    flow = {
      ...createIdleFlow(),
      phase: identity ? 'search' : 'error',
      context: captureOperationContext(),
      // Só em memória do Core — nunca em DOM, storage ou log.
      lockedIdentity: identity
        ? { platform: identity.platform, key: identity.key, channel: identity.channel ?? null }
        : null,
      error: identity
        ? null
        : { code: 'IDENTITY_NOT_READY', message: resolveErrorMessage('IDENTITY_NOT_READY') },
    }

    renderPanel()
  }

  async function searchContactLink(rawQuery) {
    const current = getCurrentFlow()

    if (!current || current.phase !== 'search') {
      return
    }

    const query = String(rawQuery ?? '').trim()
    current.query = query

    if (!hasEnoughToSearch(query)) {
      current.results = []
      current.error = null
      renderPanel()
      return
    }

    const sequence = ++current.sequence
    current.searching = true
    current.error = null
    renderPanel()

    let response = null

    try {
      response = await window.YolenCompanionApi.searchLinkableLeads({ query })
    } catch {
      response = null
    }

    if (!isStillCurrent(current, sequence)) {
      return
    }

    current.searching = false

    if (!response) {
      current.error = { code: 'NETWORK_ERROR', message: resolveErrorMessage('NETWORK_ERROR') }
    } else if (response.ok !== true || response.payload?.ok === false) {
      const status = response.payload?.status ?? null
      current.results = []
      current.error = { code: status ?? 'UNKNOWN_ERROR', message: resolveErrorMessage(status) }
    } else {
      current.results = Array.isArray(response.payload?.leads)
        ? response.payload.leads.filter((lead) => lead && typeof lead.id === 'string')
        : []
      current.error = null
    }

    renderPanel()
  }

  function selectContactLinkLead(index) {
    const current = getCurrentFlow()
    const selectedIndex = Number(index)

    if (
      !current ||
      current.phase !== 'search' ||
      !Number.isInteger(selectedIndex) ||
      !current.results[selectedIndex]
    ) {
      return
    }

    current.selectedIndex = selectedIndex
    current.phase = 'confirm'
    current.error = null
    renderPanel()
  }

  function cancelContactLinkSelection() {
    const current = getCurrentFlow()

    if (!current || current.phase !== 'confirm') {
      return
    }

    current.phase = 'search'
    current.selectedIndex = null
    current.error = null
    renderPanel()
  }

  async function confirmContactLink() {
    const current = getCurrentFlow()

    // O guard de fase deduplica o clique duplo: o primeiro clique leva a
    // 'linking'; o segundo encontra outra fase e é ignorado.
    if (!current || current.phase !== 'confirm') {
      return
    }

    const lead = current.results[current.selectedIndex]
    const sequence = ++current.sequence
    current.phase = 'linking'
    current.error = null
    renderPanel()

    // Revalida o contato imediatamente antes do vínculo: identidade
    // diferente sob a mesma rota ou troca de conversa → nenhum vínculo.
    let revalidation = null

    try {
      revalidation = await channelAdapter.revalidateConversationIdentity({
        conversationKey: current.context.conversationKey,
        isCurrentConversation: (key) => ctx.state.conversationKey === key,
      })
    } catch {
      revalidation = null
    }

    if (!isStillCurrent(current, sequence)) {
      return
    }

    if (revalidation?.outcome !== 'resolved' || revalidation.identityChanged === true) {
      current.phase = 'error'
      current.error = { code: 'CONTACT_CHANGED', message: resolveErrorMessage('CONTACT_CHANGED') }
      renderPanel()
      return
    }

    let response = null

    try {
      response = await window.YolenCompanionApi.firstLinkExternalIdentity({
        platform: current.lockedIdentity.platform,
        platform_contact_key: current.lockedIdentity.key,
        lead_id: lead.id,
        confirmed: true,
        channel: current.lockedIdentity.channel ?? null,
      })
    } catch {
      response = null
    }

    const status = response?.payload?.status ?? null
    const linked =
      response?.ok === true &&
      (status === 'LINKED' || status === 'IDEMPOTENT_ALREADY_LINKED_TO_TARGET')

    // Um vínculo confirmado (ou conflito) é verdade do servidor: o cache
    // de resolução não pode mais servir CONTACT_NOT_LINKED.
    if (linked || status === 'ALREADY_LINKED_CONFLICT') {
      clearLeadResolutionCache()
    }

    if (!isStillCurrent(current, sequence)) {
      return
    }

    if (linked) {
      flow = null
      renderPanel()
      void resolveCurrentLead()
      return
    }

    current.phase = 'error'
    current.error = response
      ? { code: status ?? 'UNKNOWN_ERROR', message: resolveErrorMessage(status) }
      : { code: 'NETWORK_ERROR', message: resolveErrorMessage('NETWORK_ERROR') }
    renderPanel()

    if (status === 'ALREADY_LINKED_CONFLICT') {
      // Nunca oferece relink: só reexecuta a resolução real.
      void resolveCurrentLead()
    }
  }

  function resetContactLink() {
    flow = null
  }

  return Object.freeze({
    getContactLinkHtml,
    startContactLink,
    searchContactLink,
    selectContactLinkLead,
    cancelContactLinkSelection,
    confirmContactLink,
    resetContactLink,
  })
}

const api = Object.freeze({
  create: createCompanionContactLinkController,
})

root.YolenCompanionContactLinkController = api

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api
}
})(typeof globalThis !== 'undefined' ? globalThis : this)
