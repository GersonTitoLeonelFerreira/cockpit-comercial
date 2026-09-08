;(function initYolenWhatsAppIdentityBridge() {
    const MESSAGE_SOURCE = 'YOLEN_COMPANION_WHATSAPP_IDENTITY_BRIDGE'
    const CONTENT_SCRIPT_SOURCE = 'YOLEN_COMPANION_CONTENT_SCRIPT'
    // Limite explícito de subida na árvore de fibers a partir do header —
    // confirmado por diagnóstico real que o chat aparece no depth 1, mas o
    // depth não é hardcoded: profundidades diferentes de build para build
    // do WhatsApp Web não devem quebrar a leitura.
    const MAX_FIBER_DEPTH = 30

    if (window.__yolenWhatsAppIdentityBridgeInstalled === true) {
      return
    }

    window.__yolenWhatsAppIdentityBridgeInstalled = true

    function findReactFiberKey(node) {
      // A chave real é "__reactFiber$<hash aleatório por carregamento>" —
      // nunca fixa, por isso é preciso descobri-la a cada leitura.
      return (
        Object.keys(node).find((key) => key.startsWith('__reactFiber$')) ||
        null
      )
    }

    function getChatFromFiber(node) {
      if (!node || typeof node !== 'object') {
        return null
      }

      const fiberKey = findReactFiberKey(node)

      if (!fiberKey) {
        return null
      }

      let fiber = node[fiberKey]

      for (
        let depth = 0;
        depth < MAX_FIBER_DEPTH && fiber;
        depth += 1
      ) {
        const props = fiber.memoizedProps

        if (
          props &&
          typeof props === 'object' &&
          props.chat &&
          typeof props.chat === 'object'
        ) {
          return props.chat
        }

        fiber = fiber.return
      }

      return null
    }

    function toWid(value) {
      if (!value || typeof value !== 'object') {
        return null
      }

      return {
        server: typeof value.server === 'string' ? value.server : null,
        user: typeof value.user === 'string' ? value.user : null,
        serialized:
          typeof value._serialized === 'string' ? value._serialized : null,
      }
    }

    // Payload mínimo: só identidade, nunca conteúdo. isSelf não é
    // reportado (não há evidência real comprovada de um campo estável para
    // isso nesta build) — o content-script já detecta auto-conversa pelo
    // próprio título do header, uma fonte já validada.
    function readActiveChatIdentity() {
      const header = document.querySelector('#main header')
      const chat = getChatFromFiber(header)

      if (!chat) {
        return null
      }

      const chatId = toWid(chat.__x_id || chat.id)
      // Quando o próprio id do chat já é um PN (chat "normal", sem LID),
      // ele É o telefone — não há necessidade (nem sempre há um campo
      // separado) de olhar contact.__x_phoneNumber nesse caso. Só quando
      // o id do chat não é um PN (ex.: @lid) é que o telefone real
      // precisa vir do mapeamento LID -> PN no objeto de contato.
      const chatIdIsAlreadyPhone =
        chatId &&
        (chatId.server === 'c.us' ||
          chatId.server === 's.whatsapp.net')

      const contact = chat.__x_contact || chat.contact || null
      const phoneWid = chatIdIsAlreadyPhone
        ? chatId
        : toWid(
            (contact &&
              (contact.__x_phoneNumber || contact.phoneNumber)) ||
              null,
          )

      return {
        chatId: (chatId && chatId.serialized) || null,
        chatIdType: (chatId && chatId.server) || null,
        phone: (phoneWid && phoneWid.user) || null,
        phoneJid: (phoneWid && phoneWid.serialized) || null,
        phoneServer: (phoneWid && phoneWid.server) || null,
        isGroup: Boolean(chatId && chatId.server === 'g.us'),
      }
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return
      }

      if (event.origin !== window.location.origin) {
        return
      }

      if (event.data?.source !== CONTENT_SCRIPT_SOURCE) {
        return
      }

      if (event.data?.action !== 'GET_ACTIVE_CHAT_IDENTITY') {
        return
      }

      if (typeof event.data?.requestId !== 'string') {
        return
      }

      let identity = null

      try {
        identity = readActiveChatIdentity()
      } catch {
        identity = null
      }

      window.postMessage(
        {
          source: MESSAGE_SOURCE,
          action: 'ACTIVE_CHAT_IDENTITY',
          requestId: event.data.requestId,
          sequence:
            typeof event.data.sequence === 'number'
              ? event.data.sequence
              : null,
          observedAt: Date.now(),
          identity,
        },
        window.location.origin,
      )
    })

    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        action: 'BRIDGE_READY',
        installedAt: Date.now(),
      },
      window.location.origin,
    )
  })()
