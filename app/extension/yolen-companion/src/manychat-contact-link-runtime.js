;(function initYolenManyChatContactLinkRuntime(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SOURCE = 'YOLEN_COMPANION'

  // STEP 2A.3 — UI segura de CONTACT_NOT_LINKED -> buscar -> selecionar ->
  // confirmar -> first-link. Só é instanciado pelo bootstrap depois do
  // kill switch (manychat-feature-flags.js) já ter aprovado — este módulo
  // em si não tem nenhum efeito colateral ao ser carregado: só passa a
  // agir quando createManyChatContactLinkRuntime(...) é chamado
  // explicitamente, e mesmo aí só reage a chamadas explícitas das funções
  // devolvidas (nunca instala listeners nem toca a rede sozinho).
  //
  // Único endpoint de vínculo permitido: FIRST_LINK_EXTERNAL_IDENTITY
  // (POST /api/companion/link-lead, RPC rpc_link_companion_external_identity_first).
  // Nunca chama nem referencia a RPC de relink
  // (rpc_link_companion_external_identity).

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

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

  function isPhoneLikeQuery(digits) {
    return digits.length >= 4
  }

  // Mesma ideia de sanitização de wildcard do backend
  // (companion-lead-access.ts: sanitizeSearchTerm) — usada aqui SÓ para
  // decidir se vale a pena disparar a busca, nunca como regra de
  // autorização (o servidor continua sendo a autoridade final). "__",
  // "_%" e "%_" nunca deveriam virar uma chamada de rede.
  function sanitizeForLocalLengthCheck(value) {
    return String(value ?? '')
      .trim()
      .replace(/[%_\\(),']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Cria o runtime de vínculo. Nenhum efeito colateral aqui — só devolve
  // as funções de ação; quem instala listeners de DOM é o bootstrap
  // (mesmo padrão já usado para data-yolen-apply-suggestion).
  function createManyChatContactLinkRuntime(options = {}) {
    const sendMessage = options.sendMessage
    if (typeof sendMessage !== 'function') {
      throw new Error('options.sendMessage é obrigatório.')
    }

    const panelMountApi = options.panelMountApi ?? root.YolenManyChatPanelMount ?? null

    const getSafeIdentity =
      typeof options.getSafeIdentity === 'function'
        ? options.getSafeIdentity
        : async () => {
            const response = await sendMessage({ source: SOURCE, action: 'GET_MANYCHAT_SAFE_IDENTITY' })
            if (response?.ok !== true || response?.payload?.ready !== true) {
              return null
            }
            return response.payload.safe ?? null
          }

    const getCurrentConversationKey =
      typeof options.getCurrentConversationKey === 'function'
        ? options.getCurrentConversationKey
        : () => null

    const onLinked = typeof options.onLinked === 'function' ? options.onLinked : null

    const stateByConversationKey = new Map()

    function defaultState() {
      return {
        phase: 'prompt',
        query: '',
        searching: false,
        results: [],
        selectedLead: null,
        error: null,
        lockedIdentity: null,
        lockedConversationKey: null,
        generation: 0,
      }
    }

    function getState(conversationKey) {
      if (!stateByConversationKey.has(conversationKey)) {
        stateByConversationKey.set(conversationKey, defaultState())
      }
      return stateByConversationKey.get(conversationKey)
    }

    function resetState(conversationKey) {
      const previousGeneration = getState(conversationKey).generation
      const fresh = defaultState()
      fresh.generation = previousGeneration
      stateByConversationKey.set(conversationKey, fresh)
    }

    // Hardening (STEP 2A.3, auditoria de race A→B): chamado pelo bootstrap
    // QUANDO a conversa muda de verdade (conversation_changed autoritativo
    // do reader), ANTES de deixar a nova conversa assumir o painel. Nunca
    // chamado por causa de uma resposta assíncrona de rede — só por uma
    // troca de conversa real.
    //
    // Incrementa generation (invalida qualquer startLinkFlow/runSearch/
    // confirmLink ainda em voo para esta conversationKey — a checagem
    // `state.generation !== generation` feita depois de cada await passa a
    // falhar e a resposta é descartada) e volta o estado para 'prompt'
    // limpo: nunca reabre automaticamente uma busca/seleção/confirmação
    // antiga quando o vendedor eventualmente voltar a esta conversa.
    function invalidateConversation(conversationKey) {
      if (!stateByConversationKey.has(conversationKey)) return

      const state = getState(conversationKey)
      state.generation += 1
      state.phase = 'prompt'
      state.query = ''
      state.searching = false
      state.results = []
      state.selectedLead = null
      state.error = null
      state.lockedIdentity = null
      state.lockedConversationKey = null
    }

    function renderResultItem(lead) {
      const name = escapeHtml(lead?.name ?? 'Sem nome')
      const phoneHint = lead?.phone_hint ? escapeHtml(lead.phone_hint) : ''
      const ownerName = lead?.owner_name ? escapeHtml(lead.owner_name) : ''
      const cycleStatus = lead?.cycle_status ? escapeHtml(lead.cycle_status) : ''
      const id = escapeHtml(lead?.id ?? '')

      return `
        <li class="yolen-contact-link-result-item">
          <button
            type="button"
            class="yolen-contact-link-result"
            data-yolen-link-lead-select="${id}"
          >
            <span class="yolen-contact-link-result-name">${name}</span>
            ${phoneHint ? `<span class="yolen-contact-link-result-phone">${phoneHint}</span>` : ''}
            ${ownerName ? `<span class="yolen-contact-link-result-owner">${ownerName}</span>` : ''}
            ${cycleStatus ? `<span class="yolen-contact-link-result-status">${cycleStatus}</span>` : ''}
          </button>
        </li>
      `
    }

    function renderErrorBlock(error) {
      if (!error) return ''
      return `<div class="yolen-error" data-yolen-link-lead-error="${escapeHtml(error.code ?? '')}">${escapeHtml(
        error.message,
      )}</div>`
    }

    function renderHtml(state) {
      if (state.phase === 'prompt') {
        return `
          <div class="yolen-contact-link yolen-contact-link-prompt">
            <div class="yolen-status">Este contato ainda não está vinculado a um lead da Yolen.</div>
            <button type="button" class="yolen-link-lead-button" data-yolen-link-lead-start>Vincular lead</button>
          </div>
        `
      }

      if (state.phase === 'error') {
        return `
          <div class="yolen-contact-link yolen-contact-link-error">
            ${renderErrorBlock(state.error)}
            <button type="button" class="yolen-link-lead-button" data-yolen-link-lead-retry>Tentar novamente</button>
          </div>
        `
      }

      if (state.phase === 'confirm' || state.phase === 'linking') {
        const leadName = escapeHtml(state.selectedLead?.name ?? 'este lead')
        const linking = state.phase === 'linking'

        return `
          <div class="yolen-contact-link yolen-contact-link-confirm">
            <p class="yolen-contact-link-confirm-text">Vincular este contato a ${leadName}?</p>
            ${renderErrorBlock(state.error)}
            <div class="yolen-contact-link-confirm-actions">
              <button
                type="button"
                class="yolen-link-lead-button"
                data-yolen-link-lead-confirm
                ${linking ? 'disabled' : ''}
              >${linking ? 'Vinculando…' : 'Vincular'}</button>
              <button
                type="button"
                class="yolen-link-lead-button yolen-link-lead-button-secondary"
                data-yolen-link-lead-cancel
                ${linking ? 'disabled' : ''}
              >Cancelar</button>
            </div>
          </div>
        `
      }

      // phase === 'search' (default)
      const resultsHtml = state.results.map(renderResultItem).join('')

      return `
        <div class="yolen-contact-link yolen-contact-link-search">
          <label class="yolen-contact-link-label" for="yolen-link-lead-query">Buscar lead</label>
          <input
            id="yolen-link-lead-query"
            type="text"
            class="yolen-contact-link-input"
            data-yolen-link-lead-query
            placeholder="Nome ou telefone"
            value="${escapeHtml(state.query)}"
          />
          <button type="button" class="yolen-link-lead-button" data-yolen-link-lead-search>Buscar</button>
          ${state.searching ? '<div class="yolen-status">Buscando…</div>' : ''}
          ${renderErrorBlock(state.error)}
          <ul class="yolen-contact-link-results">${resultsHtml}</ul>
        </div>
      `
    }

    // Hardening (STEP 2A.3, auditoria de race A→B): uma resposta
    // assíncrona antiga de A (identidade, busca, first-link) nunca pode
    // repintar o painel se, no momento em que ela finalmente chega, a
    // conversa realmente aberta já não é mais A. `getCurrentConversationKey`
    // é sempre derivado ao vivo do adapter/URL (nunca uma variável que este
    // callback desatualizado poderia ter sobrescrito) — ver bootstrap.
    function render(conversationKey) {
      if (!panelMountApi) return
      if (getCurrentConversationKey() !== conversationKey) return
      const state = getState(conversationKey)
      panelMountApi.setPanelContent(renderHtml(state))
    }

    // Ponto de entrada chamado pelo bootstrap sempre que a resolução atual
    // for CONTACT_NOT_LINKED — nunca escreve nada sozinho fora disso.
    function renderContactLinkPanel(conversationKey) {
      render(conversationKey)
    }

    async function startLinkFlow(conversationKey) {
      const state = getState(conversationKey)
      const generation = ++state.generation

      const identity = await getSafeIdentity()

      // Uma nova ação (outro clique, outra troca de conversa) já superou
      // esta chamada assíncrona — nunca aplica um resultado desatualizado.
      if (state.generation !== generation) return

      if (!identity?.platform_identity?.key) {
        state.phase = 'error'
        state.error = { code: 'IDENTITY_NOT_READY', message: resolveErrorMessage('IDENTITY_NOT_READY') }
        render(conversationKey)
        return
      }

      state.phase = 'search'
      state.query = ''
      state.results = []
      state.selectedLead = null
      state.error = null
      state.searching = false
      // Guardado SOMENTE em memória JS deste módulo — nunca em DOM,
      // data-*, input hidden, localStorage, sessionStorage, log ou
      // telemetria (STEP 2A.3, gate P1).
      state.lockedIdentity = {
        platform: identity.platform,
        key: identity.platform_identity.key,
      }
      state.lockedConversationKey = conversationKey

      render(conversationKey)
    }

    async function runSearch(conversationKey, rawQuery) {
      const state = getState(conversationKey)
      if (state.phase !== 'search') return

      const trimmed = String(rawQuery ?? '').trim()
      const digits = trimmed.replace(/\D/g, '')
      const sanitizedForLength = sanitizeForLocalLengthCheck(rawQuery)
      const hasEnoughToSearch = isPhoneLikeQuery(digits) || sanitizedForLength.length >= 2

      state.query = trimmed

      if (!hasEnoughToSearch) {
        // Nunca dispara uma chamada de rede por um termo curto demais — o
        // servidor continua sendo a autoridade final (QUERY_TOO_SHORT
        // ainda é tratado abaixo se, mesmo assim, ele discordar).
        state.results = []
        state.error = null
        render(conversationKey)
        return
      }

      const generation = ++state.generation
      state.searching = true
      state.error = null
      render(conversationKey)

      let response
      try {
        response = await sendMessage({
          source: SOURCE,
          action: 'SEARCH_LINKABLE_LEADS',
          payload: { query: trimmed },
        })
      } catch {
        if (state.generation !== generation) return
        state.searching = false
        state.error = { code: 'NETWORK_ERROR', message: resolveErrorMessage('NETWORK_ERROR') }
        render(conversationKey)
        return
      }

      if (state.generation !== generation) return

      state.searching = false

      if (response?.ok !== true) {
        const status = response?.payload?.status
        state.error = { code: status ?? 'UNKNOWN_ERROR', message: resolveErrorMessage(status) }
        state.results = []
        render(conversationKey)
        return
      }

      state.results = Array.isArray(response.payload?.leads) ? response.payload.leads : []
      state.error = null
      render(conversationKey)
    }

    function selectLead(conversationKey, leadId) {
      const state = getState(conversationKey)
      if (state.phase !== 'search') return

      const lead = state.results.find((candidate) => candidate?.id === leadId)
      if (!lead) return

      state.selectedLead = lead
      state.phase = 'confirm'
      state.error = null
      render(conversationKey)
    }

    function cancelSelection(conversationKey) {
      const state = getState(conversationKey)
      if (state.phase !== 'confirm') return

      state.phase = 'search'
      state.selectedLead = null
      state.error = null
      render(conversationKey)
    }

    // Gate crítico (STEP 2A.3, seção 11/12): revalida identidade segura E
    // conversation_key IMEDIATAMENTE antes de enviar o vínculo — nunca
    // confia na identidade capturada quando o fluxo começou. Qualquer
    // divergência aborta sem nenhuma chamada a FIRST_LINK_EXTERNAL_IDENTITY.
    async function confirmLink(conversationKey) {
      const state = getState(conversationKey)
      // O próprio guard de fase já dedupla o duplo clique: assim que o
      // primeiro clique muda a fase para 'linking', um segundo clique
      // encontra fase !== 'confirm' e é ignorado.
      if (state.phase !== 'confirm') return

      const generation = ++state.generation
      state.phase = 'linking'
      state.error = null
      render(conversationKey)

      const freshIdentity = await getSafeIdentity()

      if (state.generation !== generation) return

      const currentConversationKey = getCurrentConversationKey()
      const identityKeyMatches =
        freshIdentity?.platform_identity?.key &&
        freshIdentity.platform_identity.key === state.lockedIdentity?.key
      const conversationMatches =
        currentConversationKey === state.lockedConversationKey &&
        currentConversationKey === conversationKey

      if (!freshIdentity || !identityKeyMatches || !conversationMatches) {
        state.phase = 'error'
        state.error = { code: 'CONTACT_CHANGED', message: resolveErrorMessage('CONTACT_CHANGED') }
        render(conversationKey)
        return
      }

      const channel = freshIdentity.channel_identity?.channel === 'whatsapp' ? 'whatsapp' : null

      let response
      try {
        response = await sendMessage({
          source: SOURCE,
          action: 'FIRST_LINK_EXTERNAL_IDENTITY',
          payload: {
            platform: freshIdentity.platform,
            platform_contact_key: freshIdentity.platform_identity.key,
            lead_id: state.selectedLead.id,
            confirmed: true,
            channel,
          },
        })
      } catch {
        if (state.generation !== generation) return
        state.phase = 'error'
        state.error = { code: 'NETWORK_ERROR', message: resolveErrorMessage('NETWORK_ERROR') }
        render(conversationKey)
        return
      }

      // Hardening (auditoria STEP 2A.3, "FIRST-LINK SUCCESS DURING
      // INVALIDATION"): a partir daqui a resposta do servidor é verdade
      // imutável sobre ESTA conversationKey/identidade, mesmo que
      // invalidateConversation tenha incrementado state.generation enquanto
      // a chamada estava em voo (ex.: o vendedor trocou de conversa e
      // voltou). Um early-return aqui perderia PARA SEMPRE um vínculo
      // realmente confirmado pelo servidor: onLinked precisa rodar de
      // qualquer forma para refletir o estado real (refreshLeadResolution),
      // já que ele mesmo revalida conversa/identidade antes de persistir
      // qualquer coisa. Só as mutações de UI (reset/erro/render) ficam
      // condicionadas a esta chamada ainda ser a mais recente — uma
      // invalidação já limpou a UI e não deve ser sobrescrita.
      const isSuperseded = state.generation !== generation

      const status = response?.payload?.status

      // Capturado ANTES de qualquer resetState (que zera lockedIdentity):
      // é a identidade que foi REALMENTE vinculada nesta chamada — quem
      // recebe onLinked precisa saber exatamente qual conversa/identidade
      // validar antes de persistir qualquer resolução nova (STEP 2A.3,
      // hardening final, item 4/5).
      const linkedContext = {
        conversationKey,
        expectedPlatform: freshIdentity.platform,
        expectedIdentityKey: freshIdentity.platform_identity.key,
      }

      if (response?.ok === true && (status === 'LINKED' || status === 'IDEMPOTENT_ALREADY_LINKED_TO_TARGET')) {
        if (!isSuperseded) {
          resetState(conversationKey)
          // Repinta imediatamente com o estado limpo (placeholder honesto
          // enquanto a resolução real chega) — nunca deixa "Vinculando…"
          // congelado se, por algum motivo, o refresh de resolução
          // (onLinked) não produzir uma re-renderização própria.
          render(conversationKey)
        }
        if (onLinked) {
          await onLinked(linkedContext)
        }
        return
      }

      if (status === 'ALREADY_LINKED_CONFLICT') {
        // Nunca oferece "forçar vínculo", nunca chama relink — só informa
        // e reexecuta a resolução real (STEP 2A.3, seção 17).
        if (!isSuperseded) {
          state.phase = 'error'
          state.error = { code: 'ALREADY_LINKED_CONFLICT', message: resolveErrorMessage('ALREADY_LINKED_CONFLICT') }
          render(conversationKey)
        }
        if (onLinked) {
          await onLinked(linkedContext)
        }
        return
      }

      if (isSuperseded) return

      state.phase = 'error'
      state.error = { code: status ?? 'UNKNOWN_ERROR', message: resolveErrorMessage(status) }
      render(conversationKey)
    }

    function getConversationLinkState(conversationKey) {
      return getState(conversationKey)
    }

    return Object.freeze({
      PLATFORM,
      renderContactLinkPanel,
      startLinkFlow,
      runSearch,
      selectLead,
      cancelSelection,
      confirmLink,
      invalidateConversation,
      getConversationLinkState,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    ERROR_MESSAGES,
    createManyChatContactLinkRuntime,
  })

  root.YolenManyChatContactLinkRuntime = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
