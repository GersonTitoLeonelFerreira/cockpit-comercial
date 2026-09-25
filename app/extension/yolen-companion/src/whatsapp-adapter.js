;(function initYolenCompanionWhatsAppAdapter(root) {
function createWhatsAppAdapter({
  normalizePrePlainText,
} = {}) {
  // Normalização explícita do cabeçalho `data-pre-plain-text` (formatos de
  // data/hora do WhatsApp) — antes feita por um patch global em
  // Element.prototype.getAttribute (capture-resilience.js).
  function readPrePlainTextAttribute(element) {
    const value =
      element?.getAttribute?.(
        'data-pre-plain-text',
      )

    return typeof normalizePrePlainText === 'function'
      ? normalizePrePlainText(value)
      : value
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms)
    })
  }

  function normalizeMessageText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\u200e/g, '')
      .trim()
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
  }

  function isLikelyPhone(value) {
    const digits = onlyDigits(value)

    if (digits.length < 10 || digits.length > 13) {
      return false
    }

    if (/^(\d)\1+$/.test(digits)) {
      return false
    }

    return true
  }

  const PANEL_ID = 'yolen-companion-panel'

  const messageMutationTools =
    globalThis
      .YolenCompanionMessageMutations

  function getExtensionRuntime() {
    return globalThis.browser?.runtime || globalThis.chrome?.runtime || null
  }
  const WHATSAPP_APP_SELECTOR = '#app'
  // O bridge de identidade responde de forma essencialmente síncrona (lê
  // um React Fiber já presente na página e responde no mesmo ciclo) — o
  // timeout aqui só cobre o caso do bridge ainda não estar instalado ou a
  // página não ter carregado o header ainda, nunca uma espera normal.
  const IDENTITY_BRIDGE_RESPONSE_TIMEOUT_MS = 1200
  let capturedAudioBlobEntries = []

  // conversationKey -> epoch em que o identity bridge PROVOU
  // afirmativamente (status 'resolved') que a conversa NÃO é grupo.
  // getConversationPhone() só pode aceitar o título/cabeçalho como
  // telefone (fonte fraca — ver 'Cabeçalho da conversa'/'Contato
  // selecionado') quando esta entrada existir E bater com o epoch ATUAL:
  // sem isso, um grupo recém-aberto cujo título por coincidência parece
  // telefone seria resolvido como lead antes de qualquer chance do bridge
  // dizer que é grupo — e a checagem por epoch (não só por conversationKey)
  // impede que essa autorização vaze para um homônimo B (grupo) só porque
  // a MESMA chave textual já foi liberada para A (1:1) num epoch anterior.
  // NUNCA marcado em 'unavailable'/inconclusivo: um timeout do bridge não é
  // prova de que a conversa não é grupo, só de que o bridge não respondeu a
  // tempo — ver regressão AJ.
  const nonGroupClassifiedEpochByConversationKey = new Map()

  // Evidência forte do identity bridge para a conversa ATUAL.
  // O título/header é informação de apresentação e pode mudar durante
  // mutations da MESMA conversa. Por isso, quando disponível, a identidade
  // estrutural da linha selecionada é a autoridade para manter ou descartar
  // a classificação de grupo. conversationKey é apenas o fallback quando
  // não existe uma identidade estrutural observável.
  let bridgeConfirmedGroupContext = null

  // Identidade a persistir para uma confirmação de grupo OU de contato
  // resolvido pelo bridge. NUNCA usa getSelectedChatStableIdentity() aqui —
  // essa função cai para `title:<nome>` quando a linha selecionada não
  // expõe data-id/avatar, e título não é identidade única (dois chats
  // homônimos sem data-id/avatar no momento da leitura produziriam o mesmo
  // valor). Prioridade: 1) o chatId retornado pelo próprio identity bridge
  // (JID real do chat, lido do Fiber — sempre presente numa resposta do
  // bridge, seja grupo ou contato resolvido); 2) o data-id estrutural real
  // da linha selecionada, só como defesa caso o bridge excepcionalmente
  // não traga chatId. Sem nenhum dos dois, a confirmação fica sem
  // stableIdentity e as comparações caem para o fallback conservador por
  // conversationKey.
  //
  // Usa o mesmo prefixo `data:` de getSelectedChatStableIdentity() para o
  // chatId do bridge: os dois representam o mesmo espaço de valores (o JID
  // serializado do WhatsApp), e a linha selecionada do MESMO chat
  // normalmente expõe esse JID como data-id assim que renderizada — sem
  // essa unificação, a comparação veria `chat:<jid>` (persistido aqui) e
  // `data:<jid>` (lido do DOM na mesma conversa) como identidades
  // diferentes e derrubaria a classificação em qualquer mutation
  // subsequente.
  function getBridgeStrongIdentity(bridgeChatId) {
    if (bridgeChatId) {
      return `data:${bridgeChatId}`
    }

    return getSelectedChatStrongIdentity()
  }

  // Comparação por identidade FORTE apenas (chatId do bridge/data-id
  // estrutural — nunca avatar/título, que getSelectedChatStableIdentity()
  // aceitaria). Três resultados possíveis:
  //   - stored e current fortes e IGUAIS      -> confirmado (true)
  //   - stored e current fortes e DIFERENTES  -> prova real de troca (false)
  //   - current ausente (DOM sem data-id agora, ex.: mutation/virtualização
  //     temporária) -> AMBÍGUO: ausência de identidade forte não é prova de
  //     troca, então fail-closed (true) — quem chama isto é responsável por
  //     agendar uma revalidação via bridge para resolver a ambiguidade.
  function isBridgeConfirmedGroupForConversation(
    conversationKey,
  ) {
    if (!bridgeConfirmedGroupContext) {
      return false
    }

    if (bridgeConfirmedGroupContext.stableIdentity) {
      const currentStrongIdentity =
        getSelectedChatStrongIdentity()

      if (!currentStrongIdentity) {
        return true
      }

      return (
        bridgeConfirmedGroupContext.stableIdentity ===
        currentStrongIdentity
      )
    }

    return (
      bridgeConfirmedGroupContext.conversationKey ===
      conversationKey
    )
  }

  // true quando a evidência de grupo persistida só continua valendo por
  // fail-closed (identidade forte ausente no DOM agora), não porque foi
  // reconfirmada. Sinal para agendar uma revalidação via identity bridge —
  // sem ela, uma conversationKey coincidente (título homônimo) ficaria
  // travada como grupo para sempre, e nenhum participante escapa pelo
  // fallback de DOM enquanto isso (fail-closed continua bloqueando
  // getConversationPhone/resolveCurrentLead até o bridge decidir).
  function isBridgeConfirmedGroupContextAmbiguous() {
    return Boolean(
      bridgeConfirmedGroupContext?.stableIdentity &&
        !getSelectedChatStrongIdentity(),
    )
  }

  // Identidade forte (chatId do bridge) do último contato 1:1 RESOLVIDO
  // PELO BRIDGE, associada à conversationKey visual em que ele foi obtido
  // E ao "epoch" da instância estrutural da conversa naquele momento (ver
  // ACTIVE CHAT EPOCH abaixo). Existe porque cachedPhonesByConversationKey/
  // conversationKey visual podem colidir entre dois contatos homônimos sem
  // data-id/avatar disponível — "João" com chatId 5511111111111@c.us e
  // outro "João" com chatId 5511222222222@c.us produzem a MESMA
  // conversationKey. Sem isto, o telefone resolvido para o primeiro "João"
  // seria reaplicado ao segundo só porque a chave visual é igual:
  // vazamento de identidade entre clientes. bridgeResult.chatId é a
  // autoridade; título/avatar nunca provam que dois contatos resolvidos
  // pelo bridge são o mesmo.
  let bridgeResolvedContactContext = null

  // ============================================================
  // ACTIVE CHAT EPOCH
  // ============================================================
  // Contador monotônico de "instância estrutural" da conversa atual,
  // independente de conversationKey/título/avatar (que podem colidir entre
  // dois contatos homônimos). Incrementa quando o próprio nó do container
  // da conversa (#main), do seu header ou da linha estrutural selecionada
  // muda de referência — sem usar título/avatar como identidade. IDs fortes
  // iguais preservam o epoch mesmo se React recriar a linha; IDs fortes
  // diferentes (ou referências diferentes sem ID forte) provam a fronteira.
  // distinto de uma mutation comum dentro da MESMA conversa (nova
  // mensagem, header ganhando um span, data-id sumindo/voltando), que só
  // adiciona/remove filhos sem substituir esses nós.
  //
  // Usado para duas coisas:
  // 1) Qualquer bridgeResolvedContactContext/pedido ao bridge carrega o
  //    epoch vigente no momento em que foi criado/enviado. Uma resposta
  //    aplicada só quando o epoch da resposta bate com o epoch ATUAL —
  //    isso descarta uma resposta atrasada que descreve a conversa
  //    ANTERIOR mesmo quando a conversationKey textual colide com a nova
  //    (o ponto cego que uma checagem só por conversationKey não cobre).
  // 2) bridgeResolvedContactContext.epoch !== epoch atual já é, sozinho,
  //    motivo para suspender o telefone/contexto cacheados (ver
  //    refreshConversationSnapshot()) — nunca precisa esperar a
  //    confirmação do bridge para deixar de mostrar o dado antigo.
  //
  // Chamado tanto direto no callback bruto do MutationObserver (antes de
  // qualquer debounce/gate de "lookup em voo", para não perder uma troca
  // estrutural que acontece enquanto um pedido anterior ainda está em voo)
  // quanto no início de refreshConversationSnapshot() (garante o valor já
  // estabelecido antes do primeiro lookup e mantém consistência).
  let activeChatStructuralSignature = null
  let activeChatEpoch = 0

  function refreshActiveChatEpoch() {
    const mainRoot = getMainConversationRoot()
    const header = mainRoot
      ? mainRoot.querySelector('header')
      : null
    const selectedChatRow =
      getSelectedChatStructuralRow()
    const selectedChatStrongIdentity =
      getSelectedChatRowStrongIdentity(
        selectedChatRow,
      )

    const previousSelectedChatRow =
      activeChatStructuralSignature
        ?.selectedChatRow || null
    const previousSelectedChatStrongIdentity =
      activeChatStructuralSignature
        ?.selectedChatStrongIdentity || null

    let selectedChatChanged = false

    if (
      selectedChatRow &&
      previousSelectedChatRow
    ) {
      selectedChatChanged =
        selectedChatStrongIdentity &&
        previousSelectedChatStrongIdentity
          ? selectedChatStrongIdentity !==
            previousSelectedChatStrongIdentity
          : selectedChatRow !==
            previousSelectedChatRow
    } else if (
      selectedChatRow &&
      activeChatStructuralSignature &&
      !previousSelectedChatRow
    ) {
      selectedChatChanged = true
    }

    const changed =
      !activeChatStructuralSignature ||
      activeChatStructuralSignature.mainRoot !==
        mainRoot ||
      activeChatStructuralSignature.header !==
        header ||
      selectedChatChanged

    activeChatStructuralSignature = {
      mainRoot,
      header,
      // aria-selected pode desaparecer por alguns frames durante a
      // reconciliação. Preserve a última linha nesse intervalo para
      // não criar epoch/reset/request storm na mesma conversa.
      selectedChatRow:
        selectedChatRow ||
        previousSelectedChatRow,
      selectedChatStrongIdentity:
        selectedChatRow
          ? selectedChatStrongIdentity ||
            (selectedChatRow ===
            previousSelectedChatRow
              ? previousSelectedChatStrongIdentity
              : null)
          : previousSelectedChatStrongIdentity,
    }

    if (changed) {
      activeChatEpoch += 1
    }

    return activeChatEpoch
  }

  // true quando o telefone bridge-resolved cacheado para conversationKey
  // pode continuar sendo mostrado: nenhum contexto ainda (ou o contexto é
  // de outra chave visual), ou o contexto foi estabelecido na MESMA
  // instância estrutural da conversa atual (epoch igual). NUNCA autoriza
  // reuso só porque a identidade forte está ausente no DOM agora — essa
  // ambiguidade era exatamente o que permitia o telefone de um contato
  // vazar para outro homônimo antes desta correção. O epoch, não a
  // presença/ausência de data-id/avatar, é quem decide "ainda é a mesma
  // conversa": ausência de data-id sem nenhuma troca estrutural detectada
  // continua autorizada (evita reset a cada mutation de uma conversa sem
  // data-id persistente); qualquer troca estrutural detectada já suspende
  // o reuso, mesmo sem nenhuma identidade forte disponível para provar
  // quem é a conversa nova.
  function isBridgeResolvedContactAuthorizedForConversation(
    conversationKey,
  ) {
    if (
      !bridgeResolvedContactContext ||
      bridgeResolvedContactContext.conversationKey !==
        conversationKey
    ) {
      return true
    }

    return (
      bridgeResolvedContactContext.epoch ===
      activeChatEpoch
    )
  }

  const cachedPhonesByConversationKey = new Map()
  const cachedPhoneEpochByConversationKey = new Map()
  const cachedPhonesByLookupIdentity = new Map()

  // Identity bridge (page world): protocolo request/response por
  // requestId, sem polling. Só um pedido pode estar em voo por vez porque
  // só é disparado de dentro de runAutomaticContactLookup, que já é
  // single-flight (autoContactLookupInFlight).
  let identityBridgeInstalled = false
  let identityRequestSequence = 0
  const identityBridgeResponseWaiters = new Map()

  function waitForWhatsAppApp() {
    return new Promise((resolve) => {
      const existingApp = document.querySelector(WHATSAPP_APP_SELECTOR)

      if (existingApp) {
        resolve(existingApp)
        return
      }

      const observer = new MutationObserver(() => {
        const app = document.querySelector(WHATSAPP_APP_SELECTOR)

        if (app) {
          observer.disconnect()
          resolve(app)
        }
      })

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    })
  }

  function injectWhatsAppAudioBridge() {
    const runtime = getExtensionRuntime()

    if (!runtime?.getURL) {
      return
    }

    if (document.getElementById('yolen-whatsapp-audio-bridge-script')) {
      return
    }

    const script = document.createElement('script')
    script.id = 'yolen-whatsapp-audio-bridge-script'
    script.src = runtime.getURL('src/whatsapp-audio-bridge.js')
    script.async = false

    script.onload = () => {
      script.remove()
    }

    document.documentElement.appendChild(script)
  }

  // src/whatsapp-identity-bridge.js roda no MAIN world por declaração
  // nativa no manifest.json (content_scripts com "world": "MAIN",
  // "run_at": "document_start") — não por injeção manual de <script src>.
  // Isso é necessário porque um <script src> injetado via
  // document.createElement (o padrão usado por whatsapp-audio-bridge.js)
  // não conseguiu, na prática, executar a tempo/no contexto certo para
  // enxergar as props do React da própria aplicação do WhatsApp
  // (confirmado por diagnóstico real: bridgeInstalled permanecia false).
  // O content script isolado só precisa escutar as respostas.
  function listenToWhatsAppIdentityBridge() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return
      }

      if (event.origin !== window.location.origin) {
        return
      }

      if (
        event.data?.source !==
        'YOLEN_COMPANION_WHATSAPP_IDENTITY_BRIDGE'
      ) {
        return
      }

      if (event.data?.action === 'BRIDGE_READY') {
        identityBridgeInstalled = true
        return
      }

      if (event.data?.action !== 'ACTIVE_CHAT_IDENTITY') {
        return
      }

      const requestId = event.data?.requestId

      if (typeof requestId !== 'string') {
        return
      }

      const waiter =
        identityBridgeResponseWaiters.get(requestId)

      // Sem waiter conhecido: resposta de um requestId que já expirou (ou
      // nunca foi nosso) — descarta silenciosamente, nunca aplica.
      if (!waiter) {
        return
      }

      waiter(event.data.identity || null)
    })
  }

  // Dispara UM pedido (nunca polling) e devolve uma promise que resolve
  // com a identidade recebida, ou null se o bridge não responder dentro
  // do timeout (bridge ausente/ainda não instalado — o chamador cai no
  // fallback existente sem quebrar).
  function requestActiveChatIdentity(timeoutMs) {
    const requestId = `yolen-identity-${Date.now()}-${Math.random().toString(16).slice(2)}`

    identityRequestSequence += 1
    const sequence = identityRequestSequence

    return new Promise((resolve) => {
      let settled = false

      const finish = (identity) => {
        if (settled) {
          return
        }

        settled = true
        identityBridgeResponseWaiters.delete(requestId)
        resolve(identity)
      }

      identityBridgeResponseWaiters.set(requestId, finish)

      window.setTimeout(() => finish(null), timeoutMs)

      window.postMessage(
        {
          source: 'YOLEN_COMPANION_CONTENT_SCRIPT',
          action: 'GET_ACTIVE_CHAT_IDENTITY',
          requestId,
          sequence,
        },
        window.location.origin,
      )
    })
  }

  function extractPhoneFromText(value) {
    const text = String(value || '')
    const matches = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || []

    for (const match of matches) {
      if (isLikelyPhone(match)) {
        return onlyDigits(match)
      }
    }

    return null
  }

  // JIDs do WhatsApp Web codificam identidades bem diferentes no mesmo
  // formato "<id>@<domínio>": só "@c.us" e "@s.whatsapp.net" são o número
  // de telefone real de uma pessoa. "@g.us" é grupo, "@lid" é um
  // identificador opaco de privacidade (NÃO é o telefone) e
  // "@broadcast"/"@newsletter" não são conversas individuais — por isso a
  // allowlist explícita em vez de só validar o formato dos dígitos.
  const PHONE_JID_DOMAINS = new Set(['c.us', 's.whatsapp.net'])

  function extractPhoneFromJid(rawValue) {
    const match = String(rawValue || '').match(/(\d{8,15})@([a-z0-9.]+)/i)

    if (!match) {
      return null
    }

    const [, digits, domain] = match

    if (!PHONE_JID_DOMAINS.has(domain.toLowerCase())) {
      return null
    }

    return isLikelyPhone(digits) ? onlyDigits(digits) : null
  }

  // Diferente de extractPhoneFromJid() rejeitar "@g.us" (não é telefone):
  // esta função existe para o CHAMADOR distinguir "não é telefone porque
  // não reconheço o formato" de "não é telefone porque É um grupo" — a
  // segunda é prova estrutural definitiva de grupo, nunca motivo para
  // continuar procurando telefone em outro lugar (ver
  // resolvePassivePhoneForConversation()).
  function isGroupJid(rawValue) {
    return /@g\.us/i.test(
      String(rawValue || ''),
    )
  }

  // Valida a identidade recebida do whatsapp-identity-bridge (page world).
  // Mesma allowlist de PHONE_JID_DOMAINS: LID nunca vira telefone, grupo
  // nunca resolve, e qualquer inconsistência entre phoneJid e
  // user@server é motivo de falha fechada — a evidência não é confiável.
  function validateBridgeIdentityPhone(identity) {
    if (!identity || typeof identity !== 'object' || identity.isGroup) {
      return null
    }

    const phoneServer = String(identity.phoneServer || '').toLowerCase()

    if (!PHONE_JID_DOMAINS.has(phoneServer)) {
      return null
    }

    const phoneUser = String(identity.phone || '')

    if (!isLikelyPhone(phoneUser)) {
      return null
    }

    const digits = onlyDigits(phoneUser)

    if (identity.phoneJid) {
      const expectedSerialized = `${digits}@${phoneServer}`

      if (
        String(identity.phoneJid).toLowerCase() !==
        expectedSerialized
      ) {
        return null
      }
    }

    return digits
  }

  function isProfileOrContactPanelText(value) {
    const normalized = String(value || '').trim().toLowerCase()

    return (
      normalized === 'dados do contato' ||
      normalized === 'dados do perfil' ||
      normalized === 'contact info' ||
      normalized === 'profile'
    )
  }

  function isIgnoredHeaderText(value) {
    const normalized = String(value || '').trim().toLowerCase()

    return (
      !normalized ||
      normalized === 'dados do contato' ||
      normalized === 'dados do perfil' ||
      normalized === 'clique para mostrar os dados do contato' ||
      normalized === 'click here for contact info'
    )
  }

  function getMainConversationRoot() {
    return (
      document.querySelector('#main') ||
      document.querySelector('[data-testid="conversation-panel-wrapper"]') ||
      null
    )
  }

  function getMainHeader() {
    const main = getMainConversationRoot()

    if (!main) {
      return null
    }

    return main.querySelector('header')
  }

  function getMainHeaderTextCandidates() {
    const header = getMainHeader()
    const candidates = []

    if (!header) {
      return candidates
    }

    header.querySelectorAll('[title]').forEach((element) => {
      const title = element.getAttribute('title')?.trim()

      if (title && !title.startsWith('wds-') && title.length > 1) {
        candidates.push(title)
      }
    })

    header.querySelectorAll('span, div').forEach((element) => {
      const text = element.textContent?.trim()

      if (text && !text.startsWith('wds-') && text.length > 1 && text.length < 120) {
        candidates.push(text)
      }
    })

    return Array.from(new Set(candidates)).filter((candidate) => {
      return !isIgnoredHeaderText(candidate)
    })
  }

  function getSelectedChatElement() {
    const selectedElements =
      Array.from(
        document.querySelectorAll(
          '[aria-selected="true"]',
        ),
      )

    return (
      selectedElements.find((element) => {
        if (
          element.closest?.(
            `#${PANEL_ID}`,
          ) ||
          element.closest?.('#main')
        ) {
          return false
        }

        const chatRowSelector =
          '[data-testid="cell-frame-container"], [role="row"], [role="listitem"], [data-id]'

        const chatRow =
          element.matches?.(
            chatRowSelector,
          )
            ? element
            : element.closest?.(
                chatRowSelector,
              )

        if (!chatRow) {
          return false
        }

        return Boolean(
          chatRow.matches?.(
            '[data-testid="cell-frame-title"]',
          ) ||
          chatRow.querySelector?.(
            '[data-testid="cell-frame-title"], span[title], [dir="auto"][title]',
          ),
        )
      }) ||
      null
    )
  }

  function getSelectedChatStructuralRow() {
    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return null
    }

    const chatRowSelector =
      '[data-testid="cell-frame-container"], [role="row"], [role="listitem"], [data-id]'

    return selectedElement.matches?.(
      chatRowSelector,
    )
      ? selectedElement
      : selectedElement.closest?.(
          chatRowSelector,
        ) || null
  }

  function getSelectedChatRowStrongIdentity(
    selectedChatRow,
  ) {
    if (!selectedChatRow) {
      return null
    }

    const dataId =
      selectedChatRow
        .getAttribute?.('data-id')
        ?.trim() ||
      selectedChatRow
        .querySelector?.('[data-id]')
        ?.getAttribute?.('data-id')
        ?.trim() ||
      ''

    return dataId ? `data:${dataId}` : null
  }

  function getSelectedChatTitle() {
    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return null
    }

    const titleElements = selectedElement.querySelectorAll('[title]')

    for (const titleElement of titleElements) {
      const title = titleElement.getAttribute('title')?.trim()

      if (title && title.length > 1 && !title.startsWith('wds-')) {
        return title
      }
    }

    const autoTextElements = selectedElement.querySelectorAll('[dir="auto"]')

    for (const autoTextElement of autoTextElements) {
      const text = autoTextElement.textContent?.trim()

      if (text && text.length > 1 && text.length < 90) {
        return text
      }
    }

    return null
  }

  // Sobe pela cadeia de ancestrais a partir do elemento marcado como
  // selecionado até achar um que de fato carregue (direto ou num
  // descendente) o data-id real — NUNCA para no primeiro ancestral que
  // apenas combina com alguma alternativa ampla do seletor de row
  // (ex.: [data-testid="cell-frame-container"], [role="row"] sem
  // data-id). O próprio elemento aria-selected pode combinar com uma
  // dessas alternativas amplas sem carregar o data-id — nesse caso o
  // data-id real vive um nível (ou mais) acima, na row ancestral, e só
  // continuar subindo enxerga essa row.
  function getSelectedChatDataIdBearingRow(selectedElement) {
    if (!selectedElement) {
      return null
    }

    const chatRowSelector =
      '[data-testid="cell-frame-container"], [role="row"], [role="listitem"], [data-id]'

    let candidate =
      selectedElement.matches?.(
        chatRowSelector,
      )
        ? selectedElement
        : selectedElement.closest?.(
            chatRowSelector,
          )

    while (candidate) {
      const hasDataId =
        Boolean(
          candidate.getAttribute?.('data-id') ||
          candidate.querySelector?.('[data-id]'),
        )

      if (hasDataId) {
        return candidate
      }

      candidate =
        candidate.parentElement?.closest?.(
          chatRowSelector,
        ) || null
    }

    return null
  }

  function getSelectedChatDataId() {
    const dataIdBearingRow =
      getSelectedChatDataIdBearingRow(
        getSelectedChatElement(),
      )

    if (!dataIdBearingRow) {
      return ''
    }

    const directDataId =
      dataIdBearingRow.getAttribute?.('data-id') || ''

    const nestedDataId =
      dataIdBearingRow
        .querySelector?.('[data-id]')
        ?.getAttribute?.('data-id') || ''

    return directDataId || nestedDataId
  }

  function getSelectedChatStableIdentity() {
    const dataId = getSelectedChatDataId()

    if (dataId) {
      return `data:${dataId}`
    }

    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return ''
    }

    const avatarSource =
      selectedElement
        .querySelector?.('img[src]')
        ?.getAttribute?.('src') || ''

    if (avatarSource) {
      return `avatar:${avatarSource}`
    }

    const selectedTitle =
      getSelectedChatTitle()

    return selectedTitle
      ? `title:${selectedTitle}`
      : ''
  }

  // Só data-id: nunca cai para avatar/título. Usada onde uma identidade
  // FRACA (título, ou até avatar — WhatsApp reaproveita a mesma imagem
  // padrão entre vários contatos/grupos sem foto) não pode ser aceita como
  // prova de que a conversa mudou. Ausência de retorno aqui significa
  // apenas "o DOM não expõe identidade estrutural agora" — nunca "é outra
  // conversa".
  function getSelectedChatStrongIdentity() {
    return getSelectedChatRowStrongIdentity(
      getSelectedChatStructuralRow(),
    )
  }

  function getConversationKey(title) {
    const safeTitle =
      String(title || '').trim()

    const stableIdentity =
      getSelectedChatStableIdentity()

    if (stableIdentity) {
      return `${safeTitle}::${stableIdentity}`
    }

    return safeTitle
  }

  function getAutomaticContactLookupIdentity(title) {
    return String(title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('pt-BR')
  }

  function getMainHeaderPrimaryTitle() {
    const header = getMainHeader()

    if (!header) {
      return null
    }

    const lines =
      String(
        header.innerText ||
        header.textContent ||
        '',
      )
        .split('\n')
        .map((value) =>
          value
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean)

    const primaryTitle =
      lines.find((value) => {
        return (
          !isIgnoredHeaderText(value) &&
          value.length < 120
        )
      })

    return primaryTitle || null
  }

  function isGroupConversationHeader() {
    const header = getMainHeader()

    if (!header) {
      return false
    }

    const ariaLabels =
      Array.from(
        header.querySelectorAll('[aria-label]'),
      )
        .map((element) =>
          String(
            element.getAttribute('aria-label') || '',
          )
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('pt-BR'),
        )
        .filter(Boolean)

    return ariaLabels.some((label) => {
      return (
        label.includes('em grupo') ||
        label.includes('group video call') ||
        label.includes('video call in group') ||
        label.includes('group voice call') ||
        label.includes('voice call in group') ||
        label === 'group call'
      )
    })
  }

  function findContactInfoPanel() {
    const possibleTitles = Array.from(document.querySelectorAll('span, div, h1, h2, header'))

    for (const element of possibleTitles) {
      const text = element.textContent?.trim()

      if (!isProfileOrContactPanelText(text)) {
        continue
      }

      let current = element

      for (let index = 0; index < 10; index += 1) {
        const parent = current.parentElement

        if (!parent || parent === document.body || parent.id === PANEL_ID) {
          break
        }

        const parentText = parent.textContent || ''
        const parentTextLength = parentText.length

        if (
          parentTextLength > 40 &&
          parentTextLength < 7000 &&
          parentText.toLowerCase().includes(text.toLowerCase())
        ) {
          return parent
        }

        current = parent
      }
    }

    return null
  }

  let contactInfoPanelStructuralContext = null

  // Vincula o painel ao epoch em que ele foi OBSERVADO por esta função pela
  // primeira vez — nunca ao epoch de quem primeiro precisou consultá-lo.
  // Chamada tanto no callback bruto do MutationObserver (a cada mutation
  // relevante, para capturar o momento real em que o painel aparece,
  // mesmo quando nenhum lookup automático chega a rodar — ex.: conversa já
  // com conversationPhone resolvido) quanto por getContactInfoPanelForEpoch
  // (fallback síncrono para quando um lookup consulta o painel antes do
  // observer ter tido a chance de rodar). Um painel que sobrevive a uma
  // troca estrutural (mesmo nó DOM, WhatsApp não o desmontou) mantém o
  // epoch em que apareceu; só um nó novo pode ser vinculado ao epoch atual.
  function refreshContactInfoPanelStructuralContext(
    epoch,
  ) {
    const panel = findContactInfoPanel()

    if (!panel) {
      contactInfoPanelStructuralContext = null

      return null
    }

    if (
      !contactInfoPanelStructuralContext ||
      contactInfoPanelStructuralContext.panel !== panel
    ) {
      contactInfoPanelStructuralContext = {
        panel,
        epoch,
      }
    }

    return panel
  }

  function getContactInfoPanelForEpoch(epoch) {
    const panel =
      refreshContactInfoPanelStructuralContext(
        epoch,
      )

    if (!panel) {
      return {
        panel: null,
        authorized: false,
      }
    }

    return {
      panel,
      authorized:
        contactInfoPanelStructuralContext.epoch ===
        epoch,
    }
  }

  function collectContactPhoneCandidate(
    candidates,
    element,
  ) {
    if (!element) {
      return
    }

    const title =
      element
        .getAttribute?.('title')
        ?.trim()

    const text =
      element
        .textContent
        ?.trim()

    if (
      title &&
      title.length < 140
    ) {
      candidates.push(title)
    }

    if (
      text &&
      text.length < 220
    ) {
      candidates.push(text)
    }
  }

  function findPhoneInContactCandidates(
    candidates,
  ) {
    for (
      const candidate of
      Array.from(new Set(candidates))
    ) {
      const phone =
        extractPhoneFromText(
          candidate,
        )

      if (phone) {
        return phone
      }
    }

    return null
  }

  function getContactPanelPhone() {
    const header =
      findContactInfoHeader()

    const panel =
      findContactInfoPanel()

    if (!header && !panel) {
      return null
    }

    const candidates = []

    if (panel) {
      panel
        .querySelectorAll(
          '[title], span, div, a',
        )
        .forEach((element) => {
          collectContactPhoneCandidate(
            candidates,
            element,
          )
        })
    }

    const panelPhone =
      findPhoneInContactCandidates(
        candidates,
      )

    if (panelPhone) {
      return panelPhone
    }

    if (!header) {
      return null
    }

    const headerRect =
      header.getBoundingClientRect()

    const companionPanel =
      document.getElementById(
        PANEL_ID,
      )

    const companionRect =
      companionPanel
        ?.getBoundingClientRect?.()

    const rightBoundary =
      companionRect &&
      companionRect.left >
        headerRect.left
        ? companionRect.left
        : window.innerWidth

    const bottomBoundary =
      Math.min(
        window.innerHeight,
        headerRect.bottom + 650,
      )

    document
      .querySelectorAll(
        '[title], span, div, a',
      )
      .forEach((element) => {
        if (
          element.closest?.(
            `#${PANEL_ID}`,
          ) ||
          !isVisibleDomElement(
            element,
          )
        ) {
          return
        }

        const rect =
          element
            .getBoundingClientRect()

        if (
          rect.left <
            headerRect.left - 24 ||
          rect.left >=
            rightBoundary ||
          rect.top <
            headerRect.bottom - 8 ||
          rect.top >
            bottomBoundary
        ) {
          return
        }

        collectContactPhoneCandidate(
          candidates,
          element,
        )
      })

    return findPhoneInContactCandidates(
      candidates,
    )
  }

  function isSelfConversationTitle(title) {
    const normalized = String(title || '').toLowerCase()

    return (
      normalized.includes('(você)') ||
      normalized.includes('mensagens para mim') ||
      normalized.includes('message yourself')
    )
  }

  function getConversationTitle() {
    const main =
      getMainConversationRoot()

    if (!main) {
      return null
    }

    const primaryHeaderTitle =
      getMainHeaderPrimaryTitle()

    if (primaryHeaderTitle) {
      return primaryHeaderTitle
    }

    const headerCandidates =
      getMainHeaderTextCandidates()

    const headerTitle =
      headerCandidates.find(
        (candidate) =>
          !isIgnoredHeaderText(candidate),
      )

    if (headerTitle) {
      return headerTitle
    }

    // Sem um header real da conversa, não usamos nenhum item
    // selecionado da barra lateral como identidade do contato.
    return null
  }

  function getConversationPhone(title, conversationKey) {
    // Título/cabeçalho é a fonte MAIS FRACA de telefone (contato 1:1 não
    // salvo — WhatsApp mostra o número cru como título) e só pode
    // autorizar resolução depois que o identity bridge já teve sua chance
    // completa de classificar ESTE epoch como não-grupo (ver
    // runAutomaticContactLookup() -> nonGroupClassifiedEpochByConversationKey).
    // Sem este gate, um grupo recém-aberto cujo título por coincidência
    // parece telefone seria resolvido como lead antes de qualquer chance do
    // bridge dizer que é grupo.
    const weakTitlePhoneAuthorized =
      nonGroupClassifiedEpochByConversationKey.get(
        conversationKey,
      ) === activeChatEpoch

    if (weakTitlePhoneAuthorized) {
      const headerCandidates = getMainHeaderTextCandidates()

      for (const candidate of headerCandidates) {
        if (isLikelyPhone(candidate)) {
          return {
            phone: onlyDigits(candidate),
            source: 'Cabeçalho da conversa',
          }
        }
      }
    }

    if (isSelfConversationTitle(title)) {
      return {
        phone: null,
        source: null,
      }
    }

    if (weakTitlePhoneAuthorized) {
      const selectedTitle = getSelectedChatTitle()

      if (selectedTitle && isLikelyPhone(selectedTitle)) {
        return {
          phone: onlyDigits(selectedTitle),
          source: 'Contato selecionado',
        }
      }
    }

    // cachedPhonesByLookupIdentity é indexado pelo NOME normalizado da
    // conversa (getAutomaticContactLookupIdentity), não por uma identidade
    // única — dois contatos homônimos colidiriam nessa chave. Por isso não
    // é mais fonte autoritativa aqui: só cachedPhonesByConversationKey
    // (chave única por conversa real) resolve automaticamente.
    const cachedPhone =
      cachedPhonesByConversationKey.get(
        conversationKey,
      )

    // A própria conversationKey visual também pode colidir (dois contatos
    // 1:1 homônimos sem data-id/avatar disponível): um telefone cacheado
    // aqui a partir de uma resolução do bridge só pode ser reutilizado
    // enquanto a identidade forte (chatId) que o originou ainda é
    // compatível com o que o DOM mostra agora — nunca por título/avatar
    // coincidirem.
    if (
      cachedPhone &&
      isBridgeResolvedContactAuthorizedForConversation(
        conversationKey,
      )
    ) {
      return {
        phone: cachedPhone,
        source: 'Dados do contato automático',
      }
    }

    return {
      phone: null,
      source: null,
    }
  }

  function collectPhoneJidCandidatesInMain() {
    const main = getMainConversationRoot()

    if (!main) {
      return []
    }

    const phones = new Set()

    main.querySelectorAll('[data-id]').forEach((element) => {
      const phone = extractPhoneFromJid(
        element.getAttribute('data-id'),
      )

      if (phone) {
        phones.add(phone)
      }
    })

    return Array.from(phones)
  }

  // Última etapa, estritamente passiva, da resolução automática de
  // telefone: nenhuma navegação, nenhum clique, nenhuma abertura de
  // painel — só leitura de atributos já presentes no DOM da conversa
  // ATUAL. Grupo e auto-conversa nunca chegam a escanear JIDs de
  // mensagens (evidência de "quem está na conversa" não se aplica a eles).
  function resolvePassivePhoneForConversation({
    conversationKey,
    title,
  }) {
    if (
      !conversationKey ||
      isSelfConversationTitle(title) ||
      isGroupConversationHeader()
    ) {
      return null
    }

    const selectedChatDataId =
      getSelectedChatDataId()

    // Um data-id "@g.us" na linha selecionada é prova estrutural
    // definitiva de que esta conversa é um grupo — mesmo que
    // extractPhoneFromJid() rejeite corretamente esse domínio (não é
    // telefone), continuar para o scan de #main abaixo pegaria o JID de
    // um PARTICIPANTE (@c.us) da mensagem e o trataria como se fosse o
    // contato da conversa. Grupo aqui é terminal: nem tenta ler mensagens.
    if (
      isGroupJid(
        selectedChatDataId,
      )
    ) {
      return null
    }

    const selectedChatPhone =
      extractPhoneFromJid(
        selectedChatDataId,
      )

    if (selectedChatPhone) {
      return {
        phone: selectedChatPhone,
        source: 'JID da conversa selecionada',
      }
    }

    // Várias linhas de mensagem podem carregar `data-id`s diferentes
    // (ex.: mensagens próprias vs. do contato). Sem uma linha selecionada
    // confiável, um único telefone candidato ainda é seguro de usar — mas
    // dois ou mais candidatos distintos são ambíguos: falha fechado em vez
    // de escolher um arbitrariamente.
    const mainPhones = collectPhoneJidCandidatesInMain()

    if (mainPhones.length === 1) {
      return {
        phone: mainPhones[0],
        source: 'JID das mensagens',
      }
    }

    return null
  }

  function isVisibleDomElement(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return false
    }

    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0
    )
  }

  function getMessageContainer(element) {
    if (!element || typeof element.closest !== 'function') {
      return null
    }

    return (
      element.closest('[data-pre-plain-text]') ||
      element.closest('.message-in, .message-out') ||
      element.closest('[data-id]') ||
      element.closest('[role="row"]')
    )
  }

  function getMessageDataId(element) {
    const container =
      getMessageContainer(element)

    if (!container) {
      return null
    }

    const dataIdElement =
      container.matches?.('[data-id]')
        ? container
        : container.closest?.('[data-id]') ||
          container.querySelector?.('[data-id]')

    const dataId =
      dataIdElement
        ?.getAttribute?.('data-id')
        ?.trim()

    return dataId || null
  }

  function getMessagePrePlainText(element) {
    if (!element) {
      return ''
    }

    const source =
      element.matches?.(
        '[data-pre-plain-text]',
      )
        ? element
        : element.closest?.(
              '[data-pre-plain-text]',
            ) ||
          element.querySelector?.(
            '[data-pre-plain-text]',
          )

    return (
      readPrePlainTextAttribute(source)
        ?.trim() || ''
    )
  }

  function parseWhatsAppMessageTimestamp(
    value,
  ) {
    const text =
      String(value || '').trim()

    const timeFirstMatch = text.match(
      /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*,\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/,
    )

    const dateFirstMatch = text.match(
      /(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s*,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/,
    )

    let day
    let month
    let year
    let hour
    let minute
    let second

    if (timeFirstMatch) {
      hour = Number(timeFirstMatch[1])
      minute = Number(timeFirstMatch[2])
      second = Number(
        timeFirstMatch[3] || 0,
      )
      day = Number(timeFirstMatch[4])
      month = Number(timeFirstMatch[5])
      year = Number(timeFirstMatch[6])
    } else if (dateFirstMatch) {
      day = Number(dateFirstMatch[1])
      month = Number(dateFirstMatch[2])
      year = Number(dateFirstMatch[3])
      hour = Number(dateFirstMatch[4])
      minute = Number(dateFirstMatch[5])
      second = Number(
        dateFirstMatch[6] || 0,
      )
    } else {
      return null
    }

    if (year < 100) {
      year += 2000
    }

    const date = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      0,
    )

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute
    ) {
      return null
    }

    return {
      timestampMs: date.getTime(),
      dateKey: [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
      ].join('-'),
      timestampLabel: [
        `${String(day).padStart(2, '0')}/${String(
          month,
        ).padStart(2, '0')}/${year}`,
        `${String(hour).padStart(2, '0')}:${String(
          minute,
        ).padStart(2, '0')}`,
      ].join(' '),
    }
  }

  function getMessageSenderFromPrePlainText(
    value,
  ) {
    const text =
      String(value || '').trim()

    const bracketIndex =
      text.lastIndexOf(']')

    if (bracketIndex < 0) {
      return null
    }

    const sender = text
      .slice(bracketIndex + 1)
      .replace(/:\s*$/, '')
      .trim()

    return sender || null
  }

  function messageContainerHasAudio(
    container,
  ) {
    if (!container) {
      return false
    }

    return Boolean(
      container.querySelector(
        [
          'audio',
          '[data-icon="audio-download"]',
          '[data-icon="ptt"]',
          '[data-icon="audio-play"]',
          '[data-icon="audio-pip"]',
          'button[aria-label*="mensagem de voz" i]',
          'button[aria-label*="voice message" i]',
          'button[aria-label*="reproduzir áudio" i]',
          'button[aria-label*="play audio" i]',
        ].join(','),
      ),
    )
  }

  function getCapturedMessageBodyText(
    node,
  ) {
    const container =
      getMessageContainer(node) ||
      node

    const selector = [
      '[data-testid="selectable-text"]',
      'span.selectable-text.copyable-text',
    ].join(',')

    const elements = []

    if (node.matches?.(selector)) {
      elements.push(node)
    }

    container
      .querySelectorAll?.(selector)
      .forEach((element) => {
        elements.push(element)
      })

    const candidates =
      elements.map((element) => {
        const owner =
          element.closest?.(
            '[data-pre-plain-text]',
          )

        const belongsToAnotherMessage =
          owner &&
          owner !== node &&
          owner !== container

        const isQuoted = Boolean(
          element.closest?.(
            [
              '[data-testid*="quoted" i]',
              '[data-testid*="reply" i]',
              '[aria-label*="quoted" i]',
              '[aria-label*="mensagem citada" i]',
              '[aria-label*="resposta" i]',
            ].join(','),
          ),
        )

        return {
          text:
            belongsToAnotherMessage
              ? ''
              : messageMutationTools
                  .readCapturedElementText(
                    element,
                  ),
          isQuoted,
        }
      })

    return messageMutationTools
      .pickCapturedMessageText(
        candidates,
      )
  }

  function isDeletedMessageNode(node) {
    const container =
      getMessageContainer(node) ||
      node

    if (
      container.querySelector?.(
        '[data-icon*="revoke"]',
      )
    ) {
      return true
    }

    return messageMutationTools
      .isDeletedMessageText(
        container.textContent,
      )
  }

    function buildReliableMessageFromNode(
    node,
    observedAt,
  ) {
    const id = getMessageDataId(node)

    if (!id) {
      return null
    }

    const prePlainText =
      getMessagePrePlainText(node)

    const timestamp =
      parseWhatsAppMessageTimestamp(
        prePlainText,
      )

    if (!timestamp) {
      return null
    }

    const container =
      getMessageContainer(node)

    const hasAudio =
      messageContainerHasAudio(container)

    // Q6 (FASE 5): anexo (documento/arquivo) descrito em memória — o
    // texto capturado passa a ser "legenda + [Arquivo: nome]" sem escrever
    // nenhum marcador no DOM do WhatsApp.
    const attachment =
      messageMutationTools
        ?.describeBubbleAttachmentEvidence
        ?.(node) || null

    const text =
      attachment
        ? attachment.evidenceText
        : getCapturedMessageBodyText(
            node,
          )

    if (!text && !hasAudio) {
      return null
    }

    return {
      id,
      timestampMs:
        timestamp.timestampMs,
      timestampLabel:
        timestamp.timestampLabel,
      dateKey: timestamp.dateKey,
      direction:
        isOutgoingMessageNode(
          container || node,
        )
          ? 'outgoing'
          : 'incoming',
      sender:
        getMessageSenderFromPrePlainText(
          prePlainText,
        ),
        text,
        hasAudio,
        observedAt,
      }
  }

  // Lê as mensagens visíveis da conversa aberta e devolve entradas
  // normalizadas em memória (sem escrever no DOM do WhatsApp). O ledger e
  // a decisão de captura pertencem ao Core; aqui só existe leitura física.
  function readVisibleMessageEntries({
    observedAt,
    getPreviousMessage,
  }) {
    const main =
      getMainConversationRoot()

    if (!main) {
      return null
    }

    const entries = []

    main
      .querySelectorAll(
        '[data-pre-plain-text]',
      )
      .forEach((node) => {
        const messageId =
          getMessageDataId(node)

        if (!messageId) {
          return
        }

        if (isDeletedMessageNode(node)) {
          entries.push({
            messageId,
            deleted: true,
            buildDeletedSnapshot: () => {
              const previousMessage =
                getPreviousMessage(
                  messageId,
                )

              return buildDeletedMessageSnapshotFromNode(
                node,
                previousMessage,
                observedAt,
              )
            },
          })

          return
        }

        entries.push({
          messageId,
          deleted: false,
          message:
            buildReliableMessageFromNode(
              node,
              observedAt,
            ),
        })
      })

    // Q6 (FASE 5): bolhas só de anexo, que o WhatsApp renderiza sem
    // nenhum nó [data-pre-plain-text], viram mensagens normalizadas em
    // memória (identidade = data-id da bolha; data = vizinhos cronológicos;
    // horário/arquivo = cartão visível). Nada é escrito no DOM.
    const seenMessageIds =
      new Set(
        entries.map((entry) => entry.messageId),
      )

    main
      .querySelectorAll(
        '[data-id]',
      )
      .forEach((bubble) => {
        const messageId =
          bubble.getAttribute?.('data-id')?.trim()

        if (
          !messageId ||
          seenMessageIds.has(messageId)
        ) {
          return
        }

        const message =
          buildAttachmentOnlyMessageFromBubble(
            bubble,
            messageId,
            main,
            observedAt,
          )

        if (!message) {
          return
        }

        seenMessageIds.add(messageId)

        entries.push({
          messageId,
          deleted: false,
          message,
        })
      })

    return entries
  }

  function parseDateFromPrePlainText(value) {
    const text = String(value || '')

    const match =
      text.match(
        /\d{1,2}:\d{2}(?::\d{2})?\s*,\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/,
      ) ||
      text.match(
        /(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s*,\s*\d{1,2}:\d{2}/,
      )

    if (!match) {
      return null
    }

    const day = Number(match[1])
    const month = Number(match[2])
    let year = Number(match[3])

    if (year < 100) {
      year += 2000
    }

    const date = new Date(year, month - 1, day)

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null
    }

    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  }

  // Data de uma bolha sem cabeçalho: a das mensagens canônicas vizinhas
  // (anterior e/ou seguinte). Se as duas existirem e divergirem, não há
  // prova da data — a bolha não é capturada.
  function inferAttachmentDateFromNeighbors(bubble, main) {
    const DOCUMENT_POSITION_PRECEDING = 2
    const DOCUMENT_POSITION_FOLLOWING = 4

    let precedingDate = null
    let followingDate = null

    for (const node of main.querySelectorAll('[data-pre-plain-text]')) {
      if (
        bubble.contains?.(node) ||
        node.closest?.(
          '[data-testid*="quoted" i], [data-testid*="reply" i], [aria-label*="quoted" i], [aria-label*="mensagem citada" i], [aria-label*="resposta" i]',
        )
      ) {
        continue
      }

      const date =
        parseDateFromPrePlainText(
          readPrePlainTextAttribute(node),
        )

      if (!date) {
        continue
      }

      const position =
        node.compareDocumentPosition?.(bubble) || 0

      if (position & DOCUMENT_POSITION_FOLLOWING) {
        precedingDate = date
        continue
      }

      if (position & DOCUMENT_POSITION_PRECEDING) {
        followingDate = date
        break
      }
    }

    if (
      precedingDate &&
      followingDate &&
      precedingDate !== followingDate
    ) {
      return null
    }

    return precedingDate || followingDate || null
  }

  function buildAttachmentOnlyMessageFromBubble(
    bubble,
    messageId,
    main,
    observedAt,
  ) {
    const descriptor =
      messageMutationTools
        ?.describeAttachmentOnlyBubble
        ?.(bubble) || null

    if (!descriptor) {
      return null
    }

    const date =
      inferAttachmentDateFromNeighbors(
        bubble,
        main,
      )

    if (!date) {
      return null
    }

    const outgoing =
      isOutgoingMessageNode(bubble)

    const prePlainText =
      `[${descriptor.time}, ${date}] ${outgoing ? 'Yolen' : 'Cliente'}: `

    const timestamp =
      parseWhatsAppMessageTimestamp(
        prePlainText,
      )

    if (!timestamp) {
      return null
    }

    return {
      id: messageId,
      timestampMs:
        timestamp.timestampMs,
      timestampLabel:
        timestamp.timestampLabel,
      dateKey: timestamp.dateKey,
      direction:
        outgoing
          ? 'outgoing'
          : 'incoming',
      sender:
        getMessageSenderFromPrePlainText(
          prePlainText,
        ),
      text:
        descriptor.evidenceText,
      hasAudio: false,
      observedAt,
    }
  }

  function buildDeletedMessageSnapshotFromNode(
    node,
    previousMessage = null,
    observedAt,
  ) {
    if (previousMessage) {
      return {
        ...previousMessage,
        observedAt,
        // Este builder só é chamado a partir do caminho de marcador
        // explícito do WhatsApp (isDeletedMessageNode), nunca a partir
        // da heurística de desaparecimento do DOM — por isso a razão é
        // sempre 'explicit_deletion' aqui, mesmo reaproveitando o
        // conteúdo de uma mensagem já conhecida.
        deletionReason: 'explicit_deletion',
      }
    }

    const id =
      getMessageDataId(node)

    const prePlainText =
      getMessagePrePlainText(node)

    const timestamp =
      parseWhatsAppMessageTimestamp(
        prePlainText,
      )

    if (!id || !timestamp) {
      return null
    }

    const container =
      getMessageContainer(node)

    return {
      id,
      timestampMs:
        timestamp.timestampMs,
      timestampLabel:
        timestamp.timestampLabel,
      dateKey:
        timestamp.dateKey,
      direction:
        isOutgoingMessageNode(
          container || node,
        )
          ? 'outgoing'
          : 'incoming',
      sender:
        getMessageSenderFromPrePlainText(
          prePlainText,
        ),
      text: '',
      hasAudio:
        messageContainerHasAudio(
          container,
        ),
      observedAt,
      deletionReason: 'explicit_deletion',
    }
  }

  function isRealAudioElement(element) {
    if (!isVisibleDomElement(element)) {
      return false
    }

    if (element.closest(`#${PANEL_ID}`)) {
      return false
    }

    const messageContainer = getMessageContainer(element)

    if (!messageContainer || !isVisibleDomElement(messageContainer)) {
      return false
    }

    const text = normalizeMessageText(
      [
        element.getAttribute?.('aria-label') || '',
        element.getAttribute?.('title') || '',
        element.textContent || '',
        messageContainer.getAttribute?.('aria-label') || '',
        messageContainer.textContent || '',
      ].join(' '),
    ).toLowerCase()

    const icon = element.getAttribute?.('data-icon') || ''

    if (
      icon === 'audio-download' ||
      icon === 'ptt' ||
      icon === 'audio-play' ||
      icon === 'audio-pip'
    ) {
      return true
    }

    if (element.tagName?.toLowerCase() === 'audio') {
      return true
    }

    return (
      text.includes('mensagem de voz') ||
      text.includes('voice message') ||
      text.includes('reproduzir áudio') ||
      text.includes('play audio')
    )
  }

  function getAudioTargetDurationSeconds(container) {
    const messageRoot =
      container.closest?.('.message-in, .message-out, [data-id], [role="row"]') ||
      container

    const text = normalizeMessageText(messageRoot?.textContent)
    const matches = Array.from(text.matchAll(/\b(\d{1,2}):(\d{2})\b/g))

    const durations = matches
      .map((match) => {
        const minutes = Number(match[1])
        const seconds = Number(match[2])

        if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) {
          return null
        }

        return minutes * 60 + seconds
      })
      .filter((value) => Number.isFinite(value) && value > 0)

    return durations.length > 0 ? Math.min(...durations) : null
  }

  function getAudioTargetKey(container, index) {
    const dataId =
      container.closest?.('[data-id]')?.getAttribute?.('data-id') || ''

    if (dataId) {
      return dataId
    }

    const prePlainText =
      readPrePlainTextAttribute(container) ||
      readPrePlainTextAttribute(
        container.querySelector?.('[data-pre-plain-text]'),
      ) ||
      ''

    const durationSeconds = getAudioTargetDurationSeconds(container)

    return [
      normalizeMessageText(prePlainText) || 'sem-horario',
      durationSeconds ?? 'sem-duracao',
      index,
    ].join('::')
  }

  function getVisibleAudioTargets() {
    const main = getMainConversationRoot()

    if (!main) {
      return []
    }

    const audioSelectors = [
      'audio',
      '[data-icon="audio-download"]',
      '[data-icon="ptt"]',
      '[data-icon="audio-play"]',
      '[data-icon="audio-pip"]',
      'button[aria-label*="mensagem de voz" i]',
      'button[aria-label*="voice message" i]',
      'button[aria-label*="reproduzir áudio" i]',
      'button[aria-label*="play audio" i]',
      '[role="button"][aria-label*="mensagem de voz" i]',
      '[role="button"][aria-label*="voice message" i]',
      '[role="button"][aria-label*="reproduzir áudio" i]',
      '[role="button"][aria-label*="play audio" i]',
    ]

    const detectedMessageContainers = new Map()

    main.querySelectorAll(audioSelectors.join(',')).forEach((element) => {
      if (!isRealAudioElement(element)) {
        return
      }

      const messageContainer = getMessageContainer(element)

      if (!messageContainer || detectedMessageContainers.has(messageContainer)) {
        return
      }

      const index = detectedMessageContainers.size

      detectedMessageContainers.set(messageContainer, {
        index,
        key: getAudioTargetKey(messageContainer, index),
        durationSeconds: getAudioTargetDurationSeconds(messageContainer),
        container: messageContainer,
        element,
      })
    })

    return Array.from(detectedMessageContainers.values())
  }

  function isValidCapturedAudioBlobEntry(entry) {
    return (
      entry &&
      entry.blob &&
      entry.blob.size > 100 &&
      entry.blob.size <= 15 * 1024 * 1024
    )
  }

  function isAudioOnlyCapturedEntry(entry) {
    if (!isValidCapturedAudioBlobEntry(entry)) {
      return false
    }

    const mimeType = String(
      entry.mimeType || entry.blob?.type || '',
    ).toLowerCase()

    return (
      mimeType.startsWith('audio/') ||
      mimeType === 'application/octet-stream' ||
      mimeType === ''
    )
  }

  function getBlobDurationSeconds(blob) {
    return new Promise((resolve) => {
      if (!blob?.size) {
        resolve(null)
        return
      }

      const objectUrl = URL.createObjectURL(blob)
      const audio = document.createElement('audio')
      let finished = false

      const finish = (value) => {
        if (finished) {
          return
        }

        finished = true
        window.clearTimeout(timeoutId)
        audio.removeAttribute('src')
        URL.revokeObjectURL(objectUrl)
        resolve(Number.isFinite(value) ? value : null)
      }

      const timeoutId = window.setTimeout(() => {
        finish(null)
      }, 3000)

      audio.preload = 'metadata'

      audio.addEventListener(
        'loadedmetadata',
        () => {
          finish(audio.duration)
        },
        {
          once: true,
        },
      )

      audio.addEventListener(
        'error',
        () => {
          finish(null)
        },
        {
          once: true,
        },
      )

      audio.src = objectUrl
    })
  }

  async function ensureCapturedEntryDuration(entry) {
    if (Number.isFinite(entry.durationSeconds)) {
      return entry.durationSeconds
    }

    const durationSeconds = await getBlobDurationSeconds(entry.blob)

    capturedAudioBlobEntries = capturedAudioBlobEntries.map((currentEntry) => {
      return currentEntry.id === entry.id
        ? {
            ...currentEntry,
            durationSeconds,
          }
        : currentEntry
    })

    return durationSeconds
  }

  async function findBestCapturedAudioEntryForTarget(
    target,
    captureRequestId = null,
  ) {
    const candidates = capturedAudioBlobEntries.filter((entry) => {
      if (!isAudioOnlyCapturedEntry(entry)) {
        return false
      }

      if (
        entry.assignedTargetKey &&
        entry.assignedTargetKey !== target.key
      ) {
        return false
      }

      if (
        captureRequestId &&
        entry.captureRequestId !== captureRequestId
      ) {
        return false
      }

      return true
    })

    if (candidates.length === 0) {
      return null
    }

    if (Number.isFinite(target.durationSeconds)) {
      const candidatesWithDistance = await Promise.all(
        candidates.map(async (entry) => {
          const durationSeconds = await ensureCapturedEntryDuration(entry)

          return {
            entry,
            distance: Number.isFinite(durationSeconds)
              ? Math.abs(durationSeconds - target.durationSeconds)
              : Number.POSITIVE_INFINITY,
          }
        }),
      )

      const matchingCandidates = candidatesWithDistance
        .filter((candidate) => candidate.distance <= 2)
        .sort((a, b) => {
          if (a.distance !== b.distance) {
            return a.distance - b.distance
          }

          return b.entry.capturedAt - a.entry.capturedAt
        })

      if (matchingCandidates.length > 0) {
        return matchingCandidates[0].entry
      }
    }

    return candidates.length === 1 ? candidates[0] : null
  }

  function assignCapturedAudioEntryToTarget(entry, target) {
    capturedAudioBlobEntries = capturedAudioBlobEntries.map((currentEntry) => {
      return currentEntry.id === entry.id
        ? {
            ...currentEntry,
            assignedTargetKey: target.key,
          }
        : currentEntry
    })

    return capturedAudioBlobEntries.find((currentEntry) => {
      return currentEntry.id === entry.id
    }) || entry
  }

  function buildBlobFromCapturedEntry(entry) {
    return new Blob([entry.blob], {
      type: entry.mimeType || entry.blob.type || 'audio/webm',
    })
  }

  function getAudioSourceFromTarget(target) {
    const audioElement =
      target.element?.tagName?.toLowerCase() === 'audio'
        ? target.element
        : target.container.querySelector('audio')

    if (audioElement?.currentSrc || audioElement?.src) {
      return {
        source: audioElement.currentSrc || audioElement.src,
        mimeType: audioElement.getAttribute('type') || '',
      }
    }

    const sourceElement = target.container.querySelector(
      'audio source[src], source[type^="audio/"][src]',
    )

    if (sourceElement?.src || sourceElement?.getAttribute?.('src')) {
      return {
        source: sourceElement.src || sourceElement.getAttribute('src') || '',
        mimeType: sourceElement.getAttribute('type') || '',
      }
    }

    return {
      source: '',
      mimeType: '',
    }
  }

  function clickAudioTarget(target) {
    const button =
      target.element?.closest?.('button,[role="button"]') ||
      target.container.querySelector('button[aria-label*="reproduzir" i]') ||
      target.container.querySelector('button[aria-label*="play" i]') ||
      target.container.querySelector(
        '[role="button"][aria-label*="reproduzir" i]',
      ) ||
      target.container.querySelector(
        '[role="button"][aria-label*="play" i]',
      ) ||
      target.container
        .querySelector('[data-icon="audio-play"]')
        ?.closest?.('button,[role="button"]') ||
      target.container
        .querySelector('[data-icon="ptt"]')
        ?.closest?.('button,[role="button"]')

    if (!button) {
      return false
    }

    button.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )

    button.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )

    button.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )

    return true
  }

  async function waitForAudioSourceFromTarget(target) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const audioSource = getAudioSourceFromTarget(target)

      if (audioSource.source) {
        return audioSource
      }

      await sleep(250)
    }

    return {
      source: '',
      mimeType: '',
    }
  }

  function isProbablyAudioBlob(blob) {
    const type = String(blob?.type || '').toLowerCase()

    return (
      type.startsWith('audio/') ||
      type === 'application/octet-stream' ||
      type === ''
    )
  }

  function requestTargetedAudioCapture(target) {
    const requestId = [
      'yolen-audio',
      Date.now(),
      Math.random().toString(16).slice(2),
    ].join('-')

    window.postMessage(
      {
        source: 'YOLEN_COMPANION_CONTENT_SCRIPT',
        action: 'CAPTURE_NEXT_AUDIO',
        requestId,
        targetKey: target.key,
      },
      window.location.origin,
    )

    return requestId
  }

  function finishTargetedAudioCapture(requestId) {
    window.postMessage(
      {
        source: 'YOLEN_COMPANION_CONTENT_SCRIPT',
        action: 'CAPTURE_FINISHED',
        requestId,
      },
      window.location.origin,
    )
  }

  async function waitForTargetedAudioEntry(target, requestId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const entry = await findBestCapturedAudioEntryForTarget(
        target,
        requestId,
      )

      if (entry) {
        return entry
      }

      await sleep(250)
    }

    return null
  }

  async function getAudioBlobForTarget(target) {
    const audioSource = getAudioSourceFromTarget(target)

    if (audioSource.source) {
      const response = await fetch(audioSource.source)

      if (response.ok) {
        const blob = await response.blob()

        if (blob.size && isProbablyAudioBlob(blob)) {
          return {
            blob: new Blob([blob], {
              type: audioSource.mimeType || blob.type || 'audio/webm',
            }),
            capturedBlobId: null,
          }
        }
      }
    }

    const matchedExistingEntry =
      await findBestCapturedAudioEntryForTarget(target)

    if (matchedExistingEntry) {
      const assignedEntry = assignCapturedAudioEntryToTarget(
        matchedExistingEntry,
        target,
      )

      return {
        blob: buildBlobFromCapturedEntry(assignedEntry),
        capturedBlobId: assignedEntry.id,
      }
    }

    const requestId = requestTargetedAudioCapture(target)

    await sleep(80)
    clickAudioTarget(target)

    try {
      const targetedEntry = await waitForTargetedAudioEntry(
        target,
        requestId,
      )

      if (targetedEntry) {
        const assignedEntry = assignCapturedAudioEntryToTarget(
          targetedEntry,
          target,
        )

        return {
          blob: buildBlobFromCapturedEntry(assignedEntry),
          capturedBlobId: assignedEntry.id,
        }
      }

      const fallbackEntry =
        await findBestCapturedAudioEntryForTarget(target)

      if (fallbackEntry) {
        const assignedEntry = assignCapturedAudioEntryToTarget(
          fallbackEntry,
          target,
        )

        return {
          blob: buildBlobFromCapturedEntry(assignedEntry),
          capturedBlobId: assignedEntry.id,
        }
      }

      const loadedSource = await waitForAudioSourceFromTarget(target)

      if (loadedSource.source) {
        const response = await fetch(loadedSource.source)

        if (response.ok) {
          const blob = await response.blob()

          if (blob.size && isProbablyAudioBlob(blob)) {
            return {
              blob: new Blob([blob], {
                type: loadedSource.mimeType || blob.type || 'audio/webm',
              }),
              capturedBlobId: null,
            }
          }
        }
      }

      throw new Error(
        `Não foi possível associar o arquivo ao áudio correto. Duração visível: ${
          Number.isFinite(target.durationSeconds)
            ? `${target.durationSeconds}s`
            : 'não identificada'
        }. O Companion não enviou nenhum arquivo para transcrição.`,
      )
    } finally {
      finishTargetedAudioCapture(requestId)
    }
  }

  function getSelectedChatActivitySnapshot() {
    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return ''
    }

    return normalizeMessageText(
      selectedElement.textContent,
    ).slice(0, 600)
  }

  function clickElement(element) {
    if (!element) {
      return false
    }

    const rect = element.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2

    element.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    )

    element.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    )

    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    )

    return true
  }

  function findContactInfoHeader() {
    const headers =
      Array.from(
        document.querySelectorAll('header'),
      )

    return (
      headers.find((header) => {
        if (header.closest?.(`#${PANEL_ID}`)) {
          return false
        }

        const text =
          String(
            header.innerText ||
            header.textContent ||
            '',
          )
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('pt-BR')

        return (
          text.includes('dados do contato') ||
          text.includes('dados do perfil') ||
          text.includes('contact info') ||
          text === 'profile'
        )
      }) ||
      null
    )
  }

  function getContactInfoCloseControl() {
    const header =
      findContactInfoHeader()

    const panel =
      findContactInfoPanel()

    const roots =
      [header, panel]
        .filter(Boolean)

    for (const root of roots) {
      const labeledControl =
        root.querySelector(
          '[aria-label*="Fechar" i], [aria-label*="Close" i]',
        )

      if (labeledControl) {
        return labeledControl
      }

      const closeIcon =
        root.querySelector(
          '[data-icon="x"]',
        )

      if (closeIcon) {
        return (
          closeIcon.closest(
            'button,[role="button"],[tabindex]',
          ) ||
          closeIcon
        )
      }
    }

    return (
      header?.querySelector(
        'button,[role="button"],[tabindex]',
      ) ||
      null
    )
  }

  function activateContactInfoCloseControl(
    element,
  ) {
    if (!element) {
      return false
    }

    if (
      typeof element.click ===
      'function'
    ) {
      try {
        element.click()
        return true
      } catch {
        // Usa o fallback visual abaixo.
      }
    }

    return clickElement(element)
  }

  function closeContactInfoPanel() {
    const header =
      findContactInfoHeader()

    const panel =
      findContactInfoPanel()

    if (!header && !panel) {
      return true
    }

    const closeControl =
      getContactInfoCloseControl()

    if (!closeControl) {
      return false
    }

    return (
      activateContactInfoCloseControl(
        closeControl,
      )
    )
  }

  async function waitForContactInfoPanelClosed(
    attempts,
  ) {
    for (
      let attempt = 0;
      attempt < attempts;
      attempt += 1
    ) {
      await sleep(100)

      if (
        !findContactInfoHeader() &&
        !findContactInfoPanel()
      ) {
        await sleep(100)
        return true
      }
    }

    return false
  }

  async function closeContactInfoPanelAndWait() {
    const closeTriggered =
      closeContactInfoPanel()

    if (!closeTriggered) {
      return false
    }

    return waitForContactInfoPanelClosed(
      10,
    )
  }

  async function waitForContactPanelPhone(timeoutMs) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const phone = getContactPanelPhone()

      if (phone) {
        return phone
      }

      await sleep(200)
    }

    return null
  }

  function getWhatsAppComposer() {
    const main = getMainConversationRoot()
    const root = main || document

    const selectors = [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      'footer [contenteditable="true"]',
      '[data-testid="conversation-compose-box-input"]',
      '[contenteditable="true"][role="textbox"]',
    ]

    for (const selector of selectors) {
      const candidates = Array.from(root.querySelectorAll(selector))

      const composer = candidates.find((element) => {
        if (element.closest(`#${PANEL_ID}`)) {
          return false
        }

        const ariaLabel = element.getAttribute('aria-label') || ''
        const dataLexicalEditor = element.getAttribute('data-lexical-editor')

        if (/pesquisar|search|filtrar|buscar/i.test(ariaLabel)) {
          return false
        }

        return dataLexicalEditor === 'true' || element.isContentEditable
      })

      if (composer) {
        return composer
      }
    }

    return null
  }

  function selectComposerContents(composer) {
    const selection = window.getSelection()

    if (!selection) {
      return false
    }

    const range = document.createRange()
    range.selectNodeContents(composer)

    selection.removeAllRanges()
    selection.addRange(range)

    return true
  }

  function dispatchComposerInput(composer, message) {
    try {
      composer.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: message,
        }),
      )
    } catch {
      composer.dispatchEvent(
        new Event('input', {
          bubbles: true,
          cancelable: true,
        }),
      )
    }

    composer.dispatchEvent(
      new Event('change', {
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  function writeTextInComposer(composer, message) {
    composer.focus()
    selectComposerContents(composer)

    let inserted = false

    try {
      document.execCommand('delete')
      inserted = document.execCommand('insertText', false, message)
    } catch {
      inserted = false
    }

    if (!inserted) {
      composer.textContent = message
    }

    dispatchComposerInput(composer, message)
    composer.focus()

    return true
  }

  function getComposerText() {
    const composer = getWhatsAppComposer()

    if (!composer) {
      return ''
    }

    return normalizeMessageText(composer.textContent)
  }

  function isWhatsAppSendButtonTarget(target) {
    if (!target || typeof target.closest !== 'function') {
      return false
    }

    const button = target.closest('button,[role="button"]')

    if (!button || button.closest(`#${PANEL_ID}`)) {
      return false
    }

    const main = getMainConversationRoot()
    const footer = main?.querySelector('footer')

    if (
      !main ||
      !main.contains(button) ||
      (
        footer &&
        !footer.contains(button)
      )
    ) {
      return false
    }

    const ariaLabel = button.getAttribute('aria-label') || ''
    const title = button.getAttribute('title') || ''
    const text = `${ariaLabel} ${title}`

    if (/enviar|send/i.test(text)) {
      return true
    }

    return Boolean(
      button.querySelector('[data-icon="send"]') ||
        button.querySelector('[data-testid="send"]'),
    )
  }

  function isComposerEnterTarget(target) {
    if (!target || typeof target.closest !== 'function') {
      return false
    }

    const composer = target.closest('[contenteditable="true"]')

    if (!composer || composer.closest(`#${PANEL_ID}`)) {
      return false
    }

    return composer === getWhatsAppComposer()
  }

  function isOutgoingMessageNode(node) {
    if (
      !node ||
      typeof node.closest !==
        'function'
    ) {
      return false
    }

    const main =
      getMainConversationRoot()

    const layoutContainer =
      node.closest(
        '[data-testid="msg-container"]',
      ) ||
      node.closest('[role="row"]') ||
      getMessageContainer(node) ||
      node

    const dataIdElement =
      node.closest('[data-id]') ||
      node.querySelector?.('[data-id]')

    const messageRect =
      typeof layoutContainer
        .getBoundingClientRect ===
      'function'
        ? layoutContainer
            .getBoundingClientRect()
        : null

    const conversationRect =
      typeof main
        ?.getBoundingClientRect ===
      'function'
        ? main.getBoundingClientRect()
        : null

    const direction =
      messageMutationTools
        .inferCapturedMessageDirection({
          hasOutgoingClass:
            Boolean(
              node.closest(
                '.message-out',
              ),
            ),
          hasIncomingClass:
            Boolean(
              node.closest(
                '.message-in',
              ),
            ),
          dataId:
            dataIdElement
              ?.getAttribute?.(
                'data-id',
              ) || '',
          messageLeft:
            messageRect?.left,
          messageWidth:
            messageRect?.width,
          conversationLeft:
            conversationRect?.left,
          conversationWidth:
            conversationRect?.width,
        })

    return direction === 'outgoing'
  }

  function getLatestOutgoingVisibleMessageText() {
    const main = getMainConversationRoot()

    if (!main) {
      return ''
    }

    const nodes = Array.from(main.querySelectorAll('[data-pre-plain-text]')).reverse()

    for (const node of nodes) {
      if (!isOutgoingMessageNode(node)) {
        continue
      }

      const text =
        normalizeMessageText(
          getCapturedMessageBodyText(
            node,
          ),
        )

      if (text && text.length >= 2) {
        return text
      }
    }

    return ''
  }

  function getWhatsAppSendButton() {
    const main =
      getMainConversationRoot()

    const scope =
      main?.querySelector('footer') ||
      main

    if (!scope) {
      return null
    }

    const candidates =
      scope.querySelectorAll(
        'button,[role="button"]',
      )

    for (const candidate of candidates) {
      if (
        isWhatsAppSendButtonTarget(
          candidate,
        )
      ) {
        return candidate
      }
    }

    return null
  }

  // Contrato §7 (ChannelAdapter): capacidades técnicas do composer. O
  // elemento nunca sai do adapter; o Core recebe só estado e motivos
  // técnicos (composer_not_found, apply_verification_failed,
  // send_control_not_found, send_failed) e decide a copy.
  function isProbablySameMessage(actualMessage, expectedMessage) {
    const actual = normalizeMessageText(actualMessage)
    const expected = normalizeMessageText(expectedMessage)

    if (!actual || !expected) {
      return false
    }

    if (actual === expected) {
      return true
    }

    if (expected.length >= 24 && actual.includes(expected)) {
      return true
    }

    if (actual.length >= 24 && expected.includes(actual)) {
      return true
    }

    const expectedStart = expected.slice(0, 80)

    return expectedStart.length >= 24 && actual.includes(expectedStart)
  }

  function getComposerState() {
    const composer = getWhatsAppComposer()

    if (!composer) {
      return {
        available: false,
        busy: false,
        reason: 'composer_not_found',
        hasText: false,
      }
    }

    return {
      available: true,
      busy: false,
      reason: null,
      hasText: Boolean(
        normalizeMessageText(composer.textContent),
      ),
    }
  }

  async function applyMessage(message) {
    const composer = getWhatsAppComposer()

    if (!composer) {
      return {
        applied: false,
        reason: 'composer_not_found',
      }
    }

    try {
      writeTextInComposer(
        composer,
        message,
      )
    } catch {
      // O WhatsApp pode substituir o composer durante os eventos de input.
      // A confirmação real da inserção é feita abaixo pelo conteúdo atual.
    }

    let insertedComposerText = ''

    for (
      let attempt = 0;
      attempt < 8;
      attempt += 1
    ) {
      const composerAfterWrite =
        getWhatsAppComposer() ||
        composer

      insertedComposerText =
        normalizeMessageText(
          composerAfterWrite
            ?.textContent,
        )

      if (
        isProbablySameMessage(
          insertedComposerText,
          message,
        )
      ) {
        break
      }

      await sleep(50)
    }

    if (
      !isProbablySameMessage(
        insertedComposerText,
        message,
      )
    ) {
      return {
        applied: false,
        reason: 'apply_verification_failed',
      }
    }

    return {
      applied: true,
      reason: null,
    }
  }

  function focusComposer() {
    getWhatsAppComposer()?.focus()
  }

  function hasSendControl() {
    return Boolean(getWhatsAppSendButton())
  }

  function triggerSend() {
    const sendButton =
      getWhatsAppSendButton()

    if (!sendButton?.click) {
      return {
        sent: false,
        reason: 'send_control_not_found',
      }
    }

    try {
      sendButton.click()
    } catch {
      return {
        sent: false,
        reason: 'send_failed',
      }
    }

    return {
      sent: true,
      reason: null,
    }
  }


  // Escrita do texto sugerido pela aba MENSAGEM no campo de mensagem do
  // WhatsApp (FASE 5: mecânica de plataforma que antes vivia no runtime de
  // mensagem). Só preenche um campo vazio, nunca envia. Devolve um código:
  // inserted | composer_unavailable | composer_not_empty | insert_failed |
  // insert_unconfirmed. O Core decide o feedback seller-facing.
  function findEmptyDraftComposer() {
    const main =
      document.querySelector('#main')

    const scope =
      main?.querySelector('footer') ||
      main

    if (!scope) {
      return null
    }

    const preferred = [
      '[data-testid="conversation-compose-box-input"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
    ]

    for (const selector of preferred) {
      const candidate = scope.querySelector(selector)

      if (
        candidate &&
        !candidate.closest(`#${PANEL_ID}`)
      ) {
        return candidate
      }
    }

    return null
  }

  function normalizeComposerDraftText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function insertTextIntoEmptyComposer(text) {
    const composer = findEmptyDraftComposer()

    if (!composer) {
      return 'composer_unavailable'
    }

    if (normalizeComposerDraftText(composer.textContent)) {
      composer.focus()
      return 'composer_not_empty'
    }

    composer.focus()

    let inserted = false

    try {
      if (typeof document.execCommand === 'function') {
        inserted =
          document.execCommand(
            'insertText',
            false,
            text,
          ) === true
      }
    } catch {
      inserted = false
    }

    if (!inserted) {
      try {
        composer.textContent = text
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: text,
          }),
        )
      } catch {
        return 'insert_failed'
      }
    }

    const currentText =
      normalizeComposerDraftText(composer.textContent)
    const expected =
      normalizeComposerDraftText(text)

    if (
      !currentText ||
      currentText.slice(0, 40) !==
        expected.slice(0, 40)
    ) {
      return 'insert_unconfirmed'
    }

    composer.focus()
    return 'inserted'
  }

  // Registro explícito do contexto de identidade confirmado pelo Core a
  // partir da resposta do identity bridge (antes, o Core escrevia direto
  // nas variáveis do adapter).
  function recordBridgeConfirmedGroupContext(value) {
    bridgeConfirmedGroupContext = value || null
  }

  function recordBridgeResolvedContactContext(value) {
    bridgeResolvedContactContext = value || null
  }

  function resetCapturedAudio() {
    capturedAudioBlobEntries = []
  }

  function rememberCapturedAudioBlob(audio) {
    const blob = audio?.blob

    if (!blob || typeof blob.arrayBuffer !== 'function' || !blob.size) {
      return false
    }

    const existingIndex = capturedAudioBlobEntries.findIndex((entry) => {
      return entry.objectUrl && entry.objectUrl === audio.objectUrl
    })

    const nextEntry = {
      id: audio.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      blob,
      mimeType: audio.mimeType || blob.type || '',
      size: blob.size,
      objectUrl: audio.objectUrl || '',
      capturedAt: Number(audio.capturedAt) || Date.now(),
      captureRequestId: audio.captureRequestId || null,
      durationSeconds: null,
      assignedTargetKey: null,
    }

    if (existingIndex >= 0) {
      capturedAudioBlobEntries = capturedAudioBlobEntries.map((entry, index) => {
        return index === existingIndex
          ? {
              ...entry,
              ...nextEntry,
              assignedTargetKey: entry.assignedTargetKey || null,
            }
          : entry
      })
    } else {
      capturedAudioBlobEntries = [...capturedAudioBlobEntries, nextEntry].slice(-12)
    }

    getBlobDurationSeconds(blob).then((durationSeconds) => {
      if (!Number.isFinite(durationSeconds)) {
        return
      }

      capturedAudioBlobEntries = capturedAudioBlobEntries.map((entry) => {
        return entry.id === nextEntry.id
          ? {
              ...entry,
              durationSeconds,
            }
          : entry
      })
    })

    return true
  }

  // Escuta o bridge de áudio do page world (whatsapp-audio-bridge.js) e
  // guarda os blobs capturados; o Core recebe só eventos de status.
  function listenToAudioBridge({
    onBridgeReady,
    onAudioCaptured,
  } = {}) {
    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return
      }

      if (event.origin !== window.location.origin) {
        return
      }

      if (event.data?.source !== 'YOLEN_COMPANION_WHATSAPP_AUDIO_BRIDGE') {
        return
      }

      if (event.data?.action === 'BRIDGE_READY') {
        onBridgeReady?.()
        return
      }

      if (event.data?.action !== 'AUDIO_BLOB_CAPTURED') {
        return
      }

      if (rememberCapturedAudioBlob(event.data.audio)) {
        onAudioCaptured?.({
          capturedCount: capturedAudioBlobEntries.length,
        })
      }
    })
  }

  // Eventos de canal emitidos ao Core (FASE 5): o adapter é quem escuta o
  // documento da plataforma; o Core recebe só o evento normalizado.
  function observeHostChanges(onChange) {
    const observedRoot =
      document.body ||
      document.documentElement

    const observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) => {
        const target = mutation.target

        const targetElement =
          target instanceof Element
            ? target
            : target.parentElement

        if (!targetElement) {
          return false
        }

        return !targetElement.closest(`#${PANEL_ID}`)
      })

      if (!hasRelevantMutation) {
        return
      }

      // Antes de qualquer gate do Core: uma troca estrutural real
      // (#main/header remontados) é detectada em tempo real (ACTIVE CHAT
      // EPOCH), e o painel "Dados do contato" é registrado pelo epoch em
      // que é observado aqui — nunca pelo epoch de quem primeiro precisar
      // lê-lo (evita atribuir o painel de um homônimo à conversa nova).
      const previousActiveChatEpoch =
        activeChatEpoch

      refreshActiveChatEpoch()

      refreshContactInfoPanelStructuralContext(
        activeChatEpoch,
      )

      onChange({
        conversationInstanceChanged:
          activeChatEpoch !== previousActiveChatEpoch,
      })
    })

    observer.observe(observedRoot, {
      attributes: true,
      attributeFilter: [
        'aria-selected',
        'data-id',
      ],
      childList: true,
      subtree: true,
      characterData: true,
    })

    return observer
  }

  function onComposerDraftInput(onDraft) {
    document.addEventListener(
      'input',
      (event) => {
        if (
          !isComposerEnterTarget(
            event.target,
          )
        ) {
          return
        }

        onDraft(
          event.target
            ?.textContent ||
          '',
        )
      },
      true,
    )
  }

  function onSendAttempt(onAttempt) {
    window.addEventListener(
      'click',
      (event) => {
        if (
          !isWhatsAppSendButtonTarget(
            event.target,
          )
        ) {
          return
        }

        onAttempt(event)
      },
      true,
    )

    window.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key !== 'Enter' ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.isComposing ||
          event.keyCode === 229 ||
          !isComposerEnterTarget(
            event.target,
          )
        ) {
          return
        }

        onAttempt(event)
      },
      true,
    )
  }
  // ---------------------------------------------------------------------
  // Identidade e evidência de contato (FASE 5 — contrato §6/§7:
  // getCurrentConversation / getContactEvidence / requestVisibleContactDetails
  // / subscribeToConversationChanges). Toda a mecânica do WhatsApp — identity
  // bridge (page world), epoch estrutural da conversa ativa, contextos de
  // grupo/contato confirmados, caches de telefone, leitura passiva de JID,
  // título como telefone e o painel "Dados do contato" — vive aqui. O Core
  // recebe apenas resultados técnicos e decide estado, copy, tentativas e
  // resolução. Os dados da conversa conhecida pelo Core entram por callbacks
  // (isCurrentConversation / getKnownConversationTitle), nunca por leitura
  // do estado do Core.

  function getCurrentConversationKey() {
    return getConversationKey(
      getConversationTitle(),
    )
  }

  function isVisibleConversation(
    conversationKey,
    fallbackTitle,
  ) {
    return (
      getConversationKey(
        getMainHeaderPrimaryTitle() ||
        fallbackTitle,
      ) === conversationKey
    )
  }

  function hasOpenContactDetails() {
    return Boolean(findContactInfoPanel())
  }

  function hasAuthorizedContactDetails() {
    return getContactInfoPanelForEpoch(
      activeChatEpoch,
    ).authorized
  }

  function forgetContactEvidence(conversationKey) {
    cachedPhonesByConversationKey.delete(
      conversationKey,
    )
  }

  // Fonte mais forte que o fallback passivo por JID de DOM (que só vê
  // atributos, não o modelo real do WhatsApp): pede a identidade da
  // conversa ativa ao whatsapp-identity-bridge (page world) e valida o
  // resultado contra a conversa que originou o pedido antes de aplicar —
  // o pedido é assíncrono (postMessage) e a conversa pode ter trocado
  // enquanto ele estava em voo.
  async function tryResolveViaIdentityBridge(
    conversationKey,
    expectedTitle,
    isCurrentConversation,
  ) {
    if (!conversationKey) {
      return {
        status: 'unavailable',
      }
    }

    const identity = await requestActiveChatIdentity(
      IDENTITY_BRIDGE_RESPONSE_TIMEOUT_MS,
    )

    if (!identity) {
      return {
        status: 'unavailable',
      }
    }

    if (
      !isCurrentConversation(
        conversationKey,
      ) ||
      !isVisibleConversation(
        conversationKey,
        expectedTitle,
      )
    ) {
      return {
        status: 'unavailable',
      }
    }

    if (identity.isGroup === true) {
      return {
        status: 'group',
        // chatId aqui é o JID real do grupo (identity.chatId, lido do
        // Fiber do WhatsApp) — a única identidade estruturalmente única
        // que esta confirmação de grupo pode oferecer. Nunca cai para
        // título: dois chats homônimos sem data-id/avatar no momento da
        // leitura produziriam o mesmo título, mas nunca o mesmo chatId.
        chatId:
          typeof identity.chatId === 'string' &&
          identity.chatId
            ? identity.chatId
            : null,
      }
    }

    const phone = validateBridgeIdentityPhone(identity)

    if (!phone) {
      return {
        status: 'unavailable',
      }
    }

    return {
      status: 'resolved',
      phone,
      // chatId aqui é o JID real do contato (identity.chatId, lido do
      // Fiber) — a única identidade estruturalmente única que este
      // resultado pode oferecer. Dois contatos 1:1 homônimos sem
      // data-id/avatar no momento da leitura produzem o mesmo
      // conversationKey visual, mas nunca o mesmo chatId.
      chatId:
        typeof identity.chatId === 'string' &&
        identity.chatId
          ? identity.chatId
          : null,
      source: 'Identidade ativa do WhatsApp',
    }
  }

  // Leitura da conversa aberta (getCurrentConversation) com a evidência de
  // telefone disponível agora, já descartando evidência que não pertence
  // mais à instância estrutural atual da conversa. Devolve só dados
  // técnicos; o Core decide fronteira, reset e resolução.
  function readConversationSnapshot() {
    const conversationTitle =
      getConversationTitle()

    const conversationKey =
      getConversationKey(
        conversationTitle,
      )

    // Reavalia o epoch estrutural (ver ACTIVE CHAT EPOCH) antes de
    // qualquer decisão — garante o valor já estabelecido mesmo quando
    // refreshActiveChatEpoch() ainda não rodou pelo evento de mudança
    // (ex.: primeiro snapshot da sessão).
    refreshActiveChatEpoch()

    const isSelfConversation =
      isSelfConversationTitle(
        conversationTitle,
      )

    // Além de decidir isGroupConversation, também é o sinal de que uma
    // evidência de grupo persistida (bridgeConfirmedGroupContext) já não
    // corresponde à conversa que o DOM mostra agora — mesmo quando
    // conversationKey não mudou (homônimos).
    const bridgeSaysGroup =
      isBridgeConfirmedGroupForConversation(
        conversationKey,
      )

    const isGroupConversation =
      bridgeSaysGroup ||
      isGroupConversationHeader()

    // Ausência de identidade forte no DOM nunca prova troca de conversa —
    // bridgeSaysGroup fica fail-closed. Só o bridge pode desambiguar: o
    // Core agenda a revalidação quando a única razão de ainda confiar na
    // classificação de grupo guardada é a ambiguidade.
    const needsIdentityRevalidation =
      isBridgeConfirmedGroupContextAmbiguous()

    // Fronteira estrutural para um telefone bridge-resolved cacheado: o
    // epoch decide sozinho, de forma síncrona, se a instância estrutural
    // mudou desde que este telefone foi resolvido; se mudou, a associação
    // stale é descartada agora.
    const bridgeResolvedContactStale =
      Boolean(bridgeResolvedContactContext) &&
      bridgeResolvedContactContext.conversationKey ===
        conversationKey &&
      !isBridgeResolvedContactAuthorizedForConversation(
        conversationKey,
      )

    if (bridgeResolvedContactStale) {
      cachedPhonesByConversationKey.delete(
        conversationKey,
      )
      cachedPhoneEpochByConversationKey.delete(
        conversationKey,
      )
      recordBridgeResolvedContactContext(null)
    }

    const cachedPhoneEpoch =
      cachedPhoneEpochByConversationKey.get(
        conversationKey,
      )

    const cachedPhoneStale =
      cachedPhonesByConversationKey.has(
        conversationKey,
      ) &&
      cachedPhoneEpoch !== activeChatEpoch

    if (cachedPhoneStale) {
      cachedPhonesByConversationKey.delete(
        conversationKey,
      )
      cachedPhoneEpochByConversationKey.delete(
        conversationKey,
      )
    }

    const contactLookupIdentity =
      getAutomaticContactLookupIdentity(
        conversationTitle,
      )

    const phoneResult =
      isGroupConversation
        ? {
            phone: null,
            source: null,
          }
        : getConversationPhone(
            conversationTitle,
            conversationKey,
          )

    // A evidência de grupo vale apenas para a conversa em que o identity
    // bridge a produziu; deixa de valer assim que não corresponde mais à
    // conversa ATUAL (troca real ou homônimo com identidade diferente).
    let groupEvidenceDropped = false

    if (
      bridgeConfirmedGroupContext &&
      !bridgeSaysGroup
    ) {
      recordBridgeConfirmedGroupContext(null)
      groupEvidenceDropped = true
    }

    return {
      conversationTitle,
      conversationKey,
      isSelfConversation,
      isGroupConversation,
      needsIdentityRevalidation,
      contactEvidenceStale:
        bridgeResolvedContactStale ||
        cachedPhoneStale,
      groupEvidenceDropped,
      contactLookupIdentity,
      phone: phoneResult.phone,
      phoneSource: phoneResult.source,
    }
  }

  // getContactEvidence + requestVisibleContactDetails: busca o telefone da
  // conversa pela fonte mais forte disponível (identity bridge → JID
  // passivo no DOM → título → painel "Dados do contato" já aberto pelo
  // vendedor). O Core recebe um resultado técnico:
  //   stale | group | phone | phone_unavailable |
  //   contact_details_phone_missing | contact_details_close_failed
  // e controla a política de tentativa por callbacks chamados nos mesmos
  // pontos em que a tentativa é consumida/liberada.
  async function acquireContactEvidence({
    conversationKey,
    lookupTitle,
    contactDetailsTimeoutMs,
    isCurrentConversation,
    getKnownConversationTitle,
    onLookupAttemptConsumed,
    onLookupAttemptReleased,
  }) {
    const lookupIdentity =
      getAutomaticContactLookupIdentity(
        lookupTitle,
      )

    // Capturado ANTES do pedido: se uma troca estrutural real acontecer
    // enquanto o bridge está em voo (ver ACTIVE CHAT EPOCH), o epoch muda
    // mesmo quando conversationKey textual colide com a conversa nova
    // (homônimo).
    const requestEpoch = activeChatEpoch

    const bridgeResult =
      await tryResolveViaIdentityBridge(
        conversationKey,
        lookupTitle,
        isCurrentConversation,
      )

    if (activeChatEpoch !== requestEpoch) {
      // A conversa mudou de instância estrutural enquanto o pedido estava
      // em voo — descarta sem consumir a tentativa.
      return {
        outcome: 'stale',
      }
    }

    if (bridgeResult.status === 'group') {
      recordBridgeConfirmedGroupContext({
        conversationKey,
        stableIdentity:
          getBridgeStrongIdentity(
            bridgeResult.chatId,
          ),
      })

      onLookupAttemptConsumed()

      return {
        outcome: 'group',
      }
    }

    if (bridgeResult.status === 'resolved') {
      const resolvedIdentity =
        getBridgeStrongIdentity(
          bridgeResult.chatId,
        )

      // Revalidação de corrida para homônimos: se o DOM já mostra uma
      // identidade forte AGORA e ela diverge do chatId desta resposta, a
      // resposta descreve outro chat — descarta sem aplicar nada e sem
      // consumir a tentativa.
      const currentStrongIdentityNow =
        getSelectedChatStrongIdentity()

      if (
        currentStrongIdentityNow &&
        resolvedIdentity &&
        currentStrongIdentityNow !==
          resolvedIdentity
      ) {
        return {
          outcome: 'stale',
        }
      }

      // O bridge acabou de provar que esta conversa NÃO é grupo — só
      // agora getConversationPhone() pode aceitar o título desta conversa,
      // NESTE epoch, como fonte fraca de telefone.
      nonGroupClassifiedEpochByConversationKey.set(
        conversationKey,
        activeChatEpoch,
      )

      onLookupAttemptConsumed()

      cachedPhonesByConversationKey.set(
        conversationKey,
        bridgeResult.phone,
      )

      cachedPhoneEpochByConversationKey.set(
        conversationKey,
        activeChatEpoch,
      )

      // Ancora o telefone à identidade forte provada para ESTA
      // conversationKey e ao epoch vigente.
      recordBridgeResolvedContactContext({
        conversationKey,
        epoch: activeChatEpoch,
        stableIdentity: resolvedIdentity,
      })

      return {
        outcome: 'phone',
        phone: bridgeResult.phone,
        source: bridgeResult.source,
        lookupIdentity,
      }
    }

    // Etapa passiva: JIDs já presentes no DOM da conversa atual. Nenhuma
    // navegação, nenhum clique.
    const passiveResult =
      resolvePassivePhoneForConversation({
        conversationKey,
        title: lookupTitle,
      })

    if (passiveResult) {
      // A leitura síncrona pode já ter atravessado uma troca A -> B desde
      // que este lookup foi agendado.
      if (
        !isCurrentConversation(
          conversationKey,
        ) ||
        !isVisibleConversation(
          conversationKey,
          getKnownConversationTitle(),
        )
      ) {
        return {
          outcome: 'stale',
        }
      }

      onLookupAttemptConsumed()

      cachedPhonesByConversationKey.set(
        conversationKey,
        passiveResult.phone,
      )

      cachedPhoneEpochByConversationKey.set(
        conversationKey,
        activeChatEpoch,
      )

      return {
        outcome: 'phone',
        phone: passiveResult.phone,
        source: passiveResult.source,
        lookupIdentity,
      }
    }

    // O bridge teve sua chance completa e não confirmou grupo: a fonte
    // mais fraca (título parece telefone) está autorizada neste epoch.
    const titleResult =
      getConversationPhone(
        lookupTitle,
        conversationKey,
      )

    if (titleResult.phone) {
      if (
        !isCurrentConversation(
          conversationKey,
        ) ||
        !isVisibleConversation(
          conversationKey,
          getKnownConversationTitle(),
        )
      ) {
        return {
          outcome: 'stale',
        }
      }

      onLookupAttemptConsumed()

      return {
        outcome: 'phone',
        phone: titleResult.phone,
        source: titleResult.source,
        lookupIdentity,
      }
    }

    const contactPanelForRequest =
      getContactInfoPanelForEpoch(
        requestEpoch,
      )

    const hadContactPanelOpen =
      contactPanelForRequest.authorized

    if (!hadContactPanelOpen) {
      // A Yolen não altera a navegação do WhatsApp para buscar o dado: a
      // tentativa é consumida (sem retry ilimitado) e só volta a valer
      // quando o vendedor abrir o painel de contato.
      onLookupAttemptConsumed()

      return {
        outcome: 'phone_unavailable',
      }
    }

    onLookupAttemptConsumed()

    const phone =
      await waitForContactPanelPhone(
        contactDetailsTimeoutMs,
      )

    if (activeChatEpoch !== requestEpoch) {
      // O painel começou a ser lido em outra instância estrutural da
      // conversa: nada do que apareceu pode ser aplicado.
      onLookupAttemptReleased()

      return {
        outcome: 'stale',
      }
    }

    if (!hadContactPanelOpen) {
      const panelClosed =
        await closeContactInfoPanelAndWait()

      if (!panelClosed) {
        return {
          outcome: 'contact_details_close_failed',
        }
      }
    }

    if (
      !isCurrentConversation(
        conversationKey,
      ) ||
      !isVisibleConversation(
        conversationKey,
        getKnownConversationTitle(),
      )
    ) {
      return {
        outcome: 'stale',
      }
    }

    if (!phone) {
      return {
        outcome: 'contact_details_phone_missing',
      }
    }

    cachedPhonesByConversationKey.set(
      conversationKey,
      phone,
    )

    cachedPhoneEpochByConversationKey.set(
      conversationKey,
      activeChatEpoch,
    )

    cachedPhonesByLookupIdentity.set(
      lookupIdentity,
      phone,
    )

    return {
      outcome: 'phone',
      phone,
      source: hadContactPanelOpen
        ? 'Dados do contato'
        : 'Dados do contato automático',
      lookupIdentity,
    }
  }

  // Revalidação da identidade pelo bridge quando a classificação de grupo
  // guardada ficou ambígua. Resultado técnico:
  //   stale | unavailable | group { contactReplacedByGroup } |
  //   resolved { identityChanged }
  async function revalidateConversationIdentity({
    conversationKey,
    title,
    isCurrentConversation,
  }) {
    const requestEpoch = activeChatEpoch

    const bridgeResult =
      await tryResolveViaIdentityBridge(
        conversationKey,
        title,
        isCurrentConversation,
      )

    if (
      !isCurrentConversation(
        conversationKey,
      ) ||
      activeChatEpoch !== requestEpoch
    ) {
      return {
        outcome: 'stale',
      }
    }

    const previousContactContext =
      bridgeResolvedContactContext?.conversationKey ===
      conversationKey
        ? bridgeResolvedContactContext
        : null

    const hadGroupContextForKey = Boolean(
      bridgeConfirmedGroupContext?.conversationKey ===
        conversationKey,
    )

    if (bridgeResult.status === 'group') {
      recordBridgeConfirmedGroupContext({
        conversationKey,
        stableIdentity:
          getBridgeStrongIdentity(
            bridgeResult.chatId,
          ),
      })

      // Havia um contato resolvido para esta MESMA chave e o bridge provou
      // que é um grupo: nada do contato anterior pode sobreviver.
      if (previousContactContext) {
        recordBridgeResolvedContactContext(null)
        cachedPhonesByConversationKey.delete(
          conversationKey,
        )
      }

      return {
        outcome: 'group',
        contactReplacedByGroup:
          Boolean(previousContactContext),
      }
    }

    if (bridgeResult.status === 'resolved') {
      // Provado que NÃO é grupo — libera o título como fonte fraca neste
      // epoch. 'unavailable' NÃO libera (continua fail-closed).
      nonGroupClassifiedEpochByConversationKey.set(
        conversationKey,
        activeChatEpoch,
      )

      const resolvedIdentity =
        getBridgeStrongIdentity(
          bridgeResult.chatId,
        )

      // Só é uma troca REAL de identidade se havia classificação guardada
      // para esta chave (grupo, ou contato com identidade forte DIFERENTE
      // da agora provada) — uma reconfirmação não é fronteira.
      const identityChanged =
        hadGroupContextForKey ||
        (Boolean(
          previousContactContext?.stableIdentity,
        ) &&
          Boolean(resolvedIdentity) &&
          previousContactContext.stableIdentity !==
            resolvedIdentity)

      cachedPhonesByConversationKey.set(
        conversationKey,
        bridgeResult.phone,
      )

      cachedPhoneEpochByConversationKey.set(
        conversationKey,
        activeChatEpoch,
      )

      recordBridgeResolvedContactContext({
        conversationKey,
        epoch: activeChatEpoch,
        stableIdentity: resolvedIdentity,
      })

      recordBridgeConfirmedGroupContext(null)

      return {
        outcome: 'resolved',
        identityChanged,
      }
    }

    return {
      outcome: 'unavailable',
    }
  }

  return {
    // Identificador estável do canal e nome de exibição (contrato §7).
    platform: Object.freeze({
      id: 'whatsapp',
      displayName: 'WhatsApp',
    }),
    acquireContactEvidence,
    forgetContactEvidence,
    getCurrentConversationKey,
    hasAuthorizedContactDetails,
    hasOpenContactDetails,
    readConversationSnapshot,
    revalidateConversationIdentity,
    observeHostChanges,
    onComposerDraftInput,
    onSendAttempt,
    listenToAudioBridge,
    resetCapturedAudio,
    insertTextIntoEmptyComposer,
    readVisibleMessageEntries,
    waitForWhatsAppApp,
    injectWhatsAppAudioBridge,
    listenToWhatsAppIdentityBridge,
    getVisibleAudioTargets,
    getAudioBlobForTarget,
    getSelectedChatActivitySnapshot,
    getComposerState,
    applyMessage,
    focusComposer,
    hasSendControl,
    triggerSend,
    getComposerText,
    getLatestOutgoingVisibleMessageText,
  }
}

const api = Object.freeze({
  create: createWhatsAppAdapter,
})

root.YolenCompanionWhatsAppAdapter = api

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
