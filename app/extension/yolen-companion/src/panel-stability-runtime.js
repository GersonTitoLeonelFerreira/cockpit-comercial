;(function initPanelStabilityRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const INTENT_SELECTOR = '[data-yolen-seller-message-intent]'
  const ACTION_SELECTOR = [
    'button',
    '[role="button"]',
    'a[href]',
    'summary',
    'input[type="button"]',
    'input[type="submit"]',
  ].join(',')
  const BOTTOM_THRESHOLD_PX = 80
  const RESUME_GUARD_MS = 2000

  const elementInnerHtmlDescriptor =
    typeof Element !== 'undefined'
      ? Object.getOwnPropertyDescriptor(
          Element.prototype,
          'innerHTML',
        )
      : null

  // Outro runtime (editable-field-stability-runtime.js) também substitui
  // `innerHTML` no mesmo painel. Não importa qual dos dois roda primeiro:
  // aqui sempre resolvemos o descriptor já instalado na instância (se
  // algum outro runtime já rodou) antes de cair para o nativo do
  // Element.prototype, para nunca sobrescrever/descartar uma proteção que
  // já esteja ativa nesse nó específico.
  function resolveBaseInnerHtmlDescriptor(targetPanel) {
    return (
      Object.getOwnPropertyDescriptor(
        targetPanel,
        'innerHTML',
      ) || elementInnerHtmlDescriptor
    )
  }

  let panel = null
  // Uma única sequência compartilhada entre restoreActionVisualAnchor() e
  // restorePanelInteraction(): qualquer chamada nova a QUALQUER uma das
  // duas invalida passes ainda em voo da outra. Antes disso eram dois
  // contadores independentes (restoreSequence/actionVisualRestoreSequence)
  // que só se protegiam contra si mesmos — um restore por âncora ainda em
  // andamento não cancelava um restore absoluto concorrente (e vice-versa),
  // então os dois podiam escrever scrollTop em frames diferentes para a
  // MESMA transição.
  let scrollRestoreSequence = 0
  // Dono exclusivo: só restorePanelInteraction() escreve `true`. Existe
  // para impedir que captureScroll() capture, como se fosse um scroll real
  // do vendedor, o próprio scrollTop que restorePanelInteraction ainda está
  // no meio de escrever (uma escrita absoluta se espalha por duas
  // passagens de rAF). QUALQUER bump de scrollRestoreSequence encerra essa
  // posse imediatamente — ver nextScrollRestoreSequence() logo abaixo — em
  // vez de deixar para as próprias passagens (já invalidadas, e por isso
  // nunca mais executadas) perceberem isso sozinhas mais tarde.
  let restoring = false
  let interactionLocked = false
  let interactionMode = null
  let pendingPanelHtml = null
  let actionVisualAnchor = null
  let resumeGuardUntil = 0
  let resumeGuardTimerId = 0
  let windowWasBlurred = false
  const cachedLeadResolutions = new Map()
  let scrollSnapshot = {
    top: 0,
    distanceFromBottom: 0,
    nearBottom: false,
  }

  function getPanel() {
    return document.getElementById(PANEL_ID)
  }

  // Único ponto que avança scrollRestoreSequence. Cada chamada representa
  // uma nova operação assumindo a autoridade sobre o scroll — e assumir
  // autoridade cancela, AGORA, qualquer restauração absoluta que ainda
  // estivesse em voo (restorePanelInteraction espalha sua escrita por duas
  // passagens de rAF). Sem isto, `restoring` só voltava a `false` quando a
  // própria passagem cancelada checava sua sequência e desistia sozinha —
  // e uma passagem cancelada NUNCA roda esse código, porque o próprio
  // motivo dela ser cancelada é justamente não rodar. `restoring` ficava
  // preso em `true` para sempre, e captureScroll() (que ignora scroll
  // enquanto `restoring` é true) parava de atualizar scrollSnapshot a
  // partir daí — inclusive para scroll manual legítimo do vendedor depois
  // disso, que um render de fundo seguinte então reescrevia por cima com a
  // posição antiga. Centralizar aqui garante que cancelar uma operação
  // sempre libera o que ela possuía, no mesmo instante em que ela deixa de
  // ser a dona — não é uma autoridade nova, é a mesma autoridade única
  // (scrollRestoreSequence) também dona do lifecycle de `restoring`.
  function nextScrollRestoreSequence() {
    restoring = false
    return ++scrollRestoreSequence
  }

  function isResumeGuardActive() {
    return Date.now() < resumeGuardUntil
  }

  function getLeadResolutionCacheKey(payload) {
    const phone = String(
      payload?.phone || '',
    ).trim()
    const displayName = String(
      payload?.display_name || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('pt-BR')

    if (!phone && !displayName) {
      return null
    }

    return `${phone}::${displayName}`
  }

  function installResumeLeadResolutionCache() {
    const api = root.YolenCompanionApi

    if (
      !api ||
      typeof api.resolveLead !== 'function' ||
      api.__resumeLeadResolutionCacheInstalled === true
    ) {
      return
    }

    const originalResolveLead =
      api.resolveLead.bind(api)

    api.resolveLead = async function resolveLeadWithResumeCache(payload) {
      const key =
        getLeadResolutionCacheKey(payload)

      if (
        isResumeGuardActive() &&
        key &&
        cachedLeadResolutions.has(key)
      ) {
        return cachedLeadResolutions.get(key)
      }

      const result =
        await originalResolveLead(payload)

      if (
        key &&
        result?.ok &&
        result?.payload?.ok &&
        result?.payload?.data
      ) {
        cachedLeadResolutions.set(
          key,
          result,
        )
      }

      return result
    }

    api.__resumeLeadResolutionCacheInstalled = true
  }

  function captureScroll(targetPanel) {
    if (!targetPanel || restoring) {
      return
    }

    const maxScroll = Math.max(
      0,
      targetPanel.scrollHeight - targetPanel.clientHeight,
    )
    const top = Math.max(0, targetPanel.scrollTop)
    const distanceFromBottom = Math.max(
      0,
      maxScroll - top,
    )

    scrollSnapshot = {
      top,
      distanceFromBottom,
      nearBottom:
        distanceFromBottom <= BOTTOM_THRESHOLD_PX,
    }
  }

  const ACTION_IDENTITY_ATTRIBUTES = [
    'data-yolen-seller-message-action',
    'data-yolen-action',
    'data-yolen-seller-area',
    'data-yolen-seller-message-preset',
  ]

  function getActionIdentity(action) {
    if (!action) {
      return null
    }

    const enrichmentAction =
      action.getAttribute?.(
        'data-yolen-action',
      )
    const enrichmentKey =
      action.getAttribute?.(
        'data-yolen-enrichment-key',
      )

    if (
      enrichmentAction &&
      enrichmentKey
    ) {
      return {
        type: 'attribute-pair',
        firstAttribute:
          'data-yolen-action',
        firstValue:
          enrichmentAction,
        secondAttribute:
          'data-yolen-enrichment-key',
        secondValue:
          enrichmentKey,
      }
    }

    for (const attribute of ACTION_IDENTITY_ATTRIBUTES) {
      const value =
        action.getAttribute?.(attribute)

      if (value !== null && value !== undefined) {
        return {
          type: 'attribute',
          attribute,
          value,
        }
      }
    }

    const clientGroup =
      action.closest?.(
        'details[data-yolen-client-intelligence-group]',
      )

    if (
      action.tagName === 'SUMMARY' &&
      clientGroup
    ) {
      return {
        type: 'client-summary',
        value:
          clientGroup.getAttribute(
            'data-yolen-client-intelligence-group',
          ),
      }
    }

    const region =
      action.closest?.(
        '[data-yolen-region]',
      )

    if (!region) {
      return null
    }

    const actions =
      Array.from(
        region.querySelectorAll(
          ACTION_SELECTOR,
        ),
      )

    const index =
      actions.indexOf(action)

    if (index < 0) {
      return null
    }

    return {
      type: 'region-index',
      regionKey:
        region.getAttribute(
          'data-yolen-region',
        ),
      index,
    }
  }

  function findActionByIdentity(
    targetPanel,
    identity,
  ) {
    if (!targetPanel || !identity) {
      return null
    }

    if (identity.type === 'attribute') {
      return (
        Array.from(
          targetPanel.querySelectorAll(
            ACTION_SELECTOR,
          ),
        ).find(
          (action) =>
            action.getAttribute?.(
              identity.attribute,
            ) === identity.value,
        ) || null
      )
    }

    if (
      identity.type ===
      'attribute-pair'
    ) {
      return (
        Array.from(
          targetPanel.querySelectorAll(
            ACTION_SELECTOR,
          ),
        ).find(
          (action) =>
            action.getAttribute?.(
              identity.firstAttribute,
            ) ===
              identity.firstValue &&
            action.getAttribute?.(
              identity.secondAttribute,
            ) ===
              identity.secondValue,
        ) || null
      )
    }

    if (identity.type === 'client-summary') {
      return (
        Array.from(
          targetPanel.querySelectorAll(
            'details[data-yolen-client-intelligence-group] > summary',
          ),
        ).find(
          (summary) =>
            summary.parentElement
              ?.getAttribute(
                'data-yolen-client-intelligence-group',
              ) === identity.value,
        ) || null
      )
    }

    if (identity.type === 'region-index') {
      const region =
        Array.from(
          targetPanel.querySelectorAll(
            '[data-yolen-region]',
          ),
        ).find(
          (candidate) =>
            candidate.getAttribute(
              'data-yolen-region',
            ) === identity.regionKey,
        )

      if (!region) {
        return null
      }

      return (
        region.querySelectorAll(
          ACTION_SELECTOR,
        )[identity.index] || null
      )
    }

    return null
  }

  function captureActionVisualAnchor(
    action,
  ) {
    const identity =
      getActionIdentity(action)

    const rect =
      action?.getBoundingClientRect?.()

    if (
      !identity ||
      !rect ||
      !Number.isFinite(rect.top)
    ) {
      actionVisualAnchor = null
      nextScrollRestoreSequence()
      return
    }

    actionVisualAnchor = {
      identity,
      viewportTop: rect.top,
    }
    nextScrollRestoreSequence()
  }

  function releaseActionVisualAnchor() {
    actionVisualAnchor = null
    nextScrollRestoreSequence()

    const currentPanel =
      getPanel()

    if (currentPanel) {
      captureScroll(currentPanel)
    }
  }

  // Corrige a posição do controle clicado em relação à viewport e depois
  // SOLTA a âncora — ela não pode continuar viva indefinidamente. Antes,
  // nada liberava a âncora depois de um clique bem-sucedido: ela seguia
  // "dona" do scroll até o vendedor fazer um wheel/touchmove/Tab/pointerdown
  // fora da ação. Qualquer coisa no meio do caminho (um render assíncrono
  // chegando minutos depois, um scroll de rolagem pela barra, inércia de
  // trackpad — nenhum dos quais dispara esses gestos específicos) era
  // tratada como "não é navegação real" e revertida, puxando o painel de
  // volta para o botão antigo. Isso é o que produzia o painel brigando com
  // o próprio scroll bem depois do clique já ter sido corrigido. Limitar a
  // âncora à janela de assentamento do PRÓPRIO clique (as duas passagens de
  // rAF abaixo) faz o scroll manual e os renders de fundo posteriores
  // voltarem a vencer, como pedido.
  function restoreActionVisualAnchor() {
    const anchor =
      actionVisualAnchor

    if (!anchor) {
      return
    }

    const sequence =
      nextScrollRestoreSequence()

    const settle = (isFinalPass) => {
      if (
        sequence !==
          scrollRestoreSequence ||
        actionVisualAnchor !== anchor
      ) {
        return
      }

      const currentPanel =
        getPanel()

      if (!currentPanel) {
        return
      }

      const action =
        findActionByIdentity(
          currentPanel,
          anchor.identity,
        )

      const rect =
        action?.getBoundingClientRect?.()

      if (
        !action ||
        !rect ||
        !Number.isFinite(rect.top)
      ) {
        // A própria ação pode desaparecer como resultado legítimo do
        // clique (ex.: Ignorar um enriquecimento). Nesse caso não existe
        // mais um controle visual que possa servir de âncora. Libera o
        // estado imediatamente para que scroll e renders seguintes voltem
        // ao fluxo normal, em vez de manter uma referência obsoleta.
        if (
          actionVisualAnchor ===
          anchor
        ) {
          releaseActionVisualAnchor()
        }

        return
      }

      const delta =
        rect.top -
        anchor.viewportTop

      if (Math.abs(delta) > 0.5) {
        currentPanel.scrollTop += delta
      }

      captureScroll(currentPanel)

      if (
        isFinalPass &&
        actionVisualAnchor === anchor
      ) {
        releaseActionVisualAnchor()
      }
    }

    queueMicrotask(() => {
      root.requestAnimationFrame(() => {
        settle(false)

        root.requestAnimationFrame(() => {
          settle(true)
        })
      })
    })
  }

  // Ponto único de decisão sobre scroll depois de uma atualização de DOM já
  // aplicada: chamado explicitamente por quem PRODUZIU a mutação (o setter
  // de innerHTML do próprio painel logo abaixo, e content-script.js depois
  // de aplicar uma região) — nunca mais por um MutationObserver reagindo
  // genericamente a qualquer mutation dentro do painel. Ver handlePanelMutation().
  function restoreAfterRender() {
    if (actionVisualAnchor) {
      restoreActionVisualAnchor()
      return
    }

    restorePanelInteraction(getPanel())
  }

  function getRestoreTop(targetPanel) {
    const maxScroll = Math.max(
      0,
      targetPanel.scrollHeight - targetPanel.clientHeight,
    )

    if (scrollSnapshot.nearBottom) {
      return Math.max(
        0,
        maxScroll - scrollSnapshot.distanceFromBottom,
      )
    }

    return Math.min(
      scrollSnapshot.top,
      maxScroll,
    )
  }

  function applyPanelHtml(targetPanel, html) {
    const baseDescriptor =
      targetPanel?.__yolenPanelStabilityBaseDescriptor

    if (!targetPanel || !baseDescriptor?.set) {
      return
    }

    baseDescriptor.set.call(
      targetPanel,
      html,
    )
  }

  function applyPendingPanelHtml() {
    if (
      interactionLocked ||
      isResumeGuardActive()
    ) {
      return
    }

    const currentPanel = getPanel()
    const pendingHtml = pendingPanelHtml

    if (
      !currentPanel ||
      pendingHtml === null
    ) {
      return
    }

    pendingPanelHtml = null

    applyPanelHtml(
      currentPanel,
      pendingHtml,
    )

    bindPanel(currentPanel)

    // Este é OUTRO ponto que escreve o DOM de verdade (o setter de
    // innerHTML chama isto quando uma escrita que tinha ficado retida por
    // interactionLocked/resume guard finalmente é liberada). Precisa
    // passar pela MESMA autoridade única do setter — restoreAfterRender(),
    // que sabe decidir entre âncora de ação e snapshot absoluto — em vez
    // de ter sua própria lógica de restauração paralela. A versão anterior
    // sempre fazia um restore absoluto aqui, ignorando uma âncora de ação
    // ativa: dependendo da ordem em que os dois runtimes de estabilidade
    // instalam seus descriptors de innerHTML, uma escrita retida durante o
    // clique podia ser aplicada por ESTE caminho em vez do setter direto —
    // e como só o setter chamava restoreAfterRender(), a âncora nunca
    // recebia sua correção nem se liberava, ficando presa indefinidamente.
    restoreAfterRender()
  }

  function finishResumeGuard() {
    if (isResumeGuardActive()) {
      return
    }

    resumeGuardUntil = 0
    resumeGuardTimerId = 0
    applyPendingPanelHtml()
  }

  function beginResumeGuard() {
    const currentPanel = getPanel()

    if (currentPanel) {
      bindPanel(currentPanel)
      captureScroll(currentPanel)
    }

    resumeGuardUntil =
      Date.now() + RESUME_GUARD_MS

    if (resumeGuardTimerId) {
      root.clearTimeout(
        resumeGuardTimerId,
      )
    }

    resumeGuardTimerId =
      root.setTimeout(
        finishResumeGuard,
        RESUME_GUARD_MS + 50,
      )
  }

  function patchPanelInnerHtml(targetPanel) {
    if (
      !targetPanel ||
      targetPanel.__yolenInnerHtmlGuardInstalled === true
    ) {
      return
    }

    const baseDescriptor =
      resolveBaseInnerHtmlDescriptor(targetPanel)

    if (!baseDescriptor?.get || !baseDescriptor?.set) {
      return
    }

    targetPanel.__yolenInnerHtmlGuardInstalled = true
    targetPanel.__yolenPanelStabilityBaseDescriptor =
      baseDescriptor

    Object.defineProperty(
      targetPanel,
      'innerHTML',
      {
        configurable: true,
        enumerable: false,
        get() {
          return baseDescriptor.get.call(this)
        },
        set(value) {
          const mustPreserveCurrentDom =
            interactionLocked ||
            (
              isResumeGuardActive() &&
              this.childElementCount > 0
            )

          if (mustPreserveCurrentDom) {
            pendingPanelHtml = String(value ?? '')
            return
          }

          baseDescriptor.set.call(
            this,
            value,
          )

          // O ponto em que o painel INTEIRO é substituído (retração/
          // expansão do Companion, primeira renderização) ainda passa por
          // aqui. É a própria escrita que decide, na hora, se scroll
          // precisa ser corrigido — não um MutationObserver observando a
          // mutation resultante de fora.
          restoreAfterRender()
        },
      },
    )
  }

  function bindPanel(targetPanel) {
    if (!targetPanel) {
      return
    }

    patchPanelInnerHtml(targetPanel)

    if (targetPanel.__yolenStabilityBound === true) {
      return
    }

    targetPanel.__yolenStabilityBound = true

    targetPanel.addEventListener(
      'wheel',
      () => {
        releaseActionVisualAnchor()
      },
      { passive: true },
    )

    targetPanel.addEventListener(
      'touchmove',
      () => {
        releaseActionVisualAnchor()
      },
      { passive: true },
    )

    targetPanel.addEventListener(
      'scroll',
      () => {
        if (actionVisualAnchor) {
          restoreActionVisualAnchor()
          return
        }

        captureScroll(targetPanel)
      },
      { passive: true },
    )

    captureScroll(targetPanel)
  }

  function restorePanelInteraction(targetPanel) {
    if (
      !targetPanel ||
      interactionLocked ||
      isResumeGuardActive()
    ) {
      return
    }

    const sequence = nextScrollRestoreSequence()
    restoring = true

    const restore = () => {
      if (sequence !== scrollRestoreSequence) {
        return
      }

      const currentPanel = getPanel()

      if (!currentPanel) {
        restoring = false
        return
      }

      bindPanel(currentPanel)
      currentPanel.scrollTop = getRestoreTop(currentPanel)
    }

    queueMicrotask(() => {
      root.requestAnimationFrame(() => {
        restore()

        root.requestAnimationFrame(() => {
          if (sequence !== scrollRestoreSequence) {
            return
          }

          restore()
          restoring = false
        })
      })
    })
  }

  function lockInteraction(target, mode) {
    const currentPanel = getPanel()

    if (
      !currentPanel ||
      !target ||
      !currentPanel.contains(target)
    ) {
      return
    }

    bindPanel(currentPanel)
    captureScroll(currentPanel)

    if (mode === 'action') {
      captureActionVisualAnchor(
        target,
      )
    }

    if (!interactionLocked) {
      pendingPanelHtml = null
    }

    interactionLocked = true
    interactionMode = mode
  }

  function unlockInteraction({
    applyPending = true,
  } = {}) {
    if (!interactionLocked) {
      return
    }

    interactionLocked = false
    interactionMode = null

    if (applyPending) {
      applyPendingPanelHtml()
    } else {
      pendingPanelHtml = null
    }
  }

  // Zera toda a memória de scroll/interação do runtime porque a conversa
  // MUDOU DE VERDADE. Só existe UMA autoridade que chama isto:
  // content-script.js, explicitamente, de dentro de
  // clearLeadStateForNewConversation() (via resetForNewConversation() na
  // API pública abaixo) — o único lugar do código que decide com certeza,
  // a partir de state.conversationKey, que a conversa mudou.
  //
  // Uma versão anterior desta função também era chamada por
  // handlePanelMutation() a partir de um heurístico de TEXTO: comparar o
  // textContent de `.yolen-lead-name` entre uma mutation e a próxima, e
  // tratar qualquer diferença como "troca real de conversa". Isso
  // demonstrou ser um FALSO POSITIVO concreto, não só uma preocupação
  // teórica: a MESMA conversa, no meio de um `refresh`/nova resolução,
  // passa por um estado intermediário em que `.yolen-lead-name` mostra o
  // telefone (fallback) antes de voltar a mostrar o nome resolvido — duas
  // mudanças de texto para a mesma conversa. O heurístico via isso como
  // duas trocas de conversa e zerava o scroll para 0 no meio de uma
  // atualização em segundo plano comum, sem nenhum clique nem navegação
  // do vendedor envolvidos. Um MutationObserver reagindo a texto não tem
  // como distinguir "o rótulo mudou porque a conversa mudou" de "o rótulo
  // mudou porque o MESMO lead está sendo re-resolvido" — só quem inicia a
  // resolução (content-script.js) sabe a diferença.
  function resetConversationScrollState(
    currentPanel,
  ) {
    interactionLocked = false
    interactionMode = null
    pendingPanelHtml = null
    actionVisualAnchor = null
    // Também encerra a posse de `restoring`, se alguma restauração
    // absoluta estivesse em voo — ver nextScrollRestoreSequence().
    nextScrollRestoreSequence()
    scrollSnapshot = {
      top: 0,
      distanceFromBottom: 0,
      nearBottom: false,
    }

    if (currentPanel) {
      currentPanel.scrollTop = 0
    }
  }

  // Responsabilidade ÚNICA e reduzida do MutationObserver global (ver seção
  // 10 do mandato): só identidade do node do painel (o painel foi
  // remontado por fora do fluxo de content-script.js — ex.: uma navegação
  // de SPA do WhatsApp recriando tudo do zero?). Ele NÃO decide mais nada
  // sobre scroll — nem restoreActionVisualAnchor() nem
  // restorePanelInteraction() nem reset de conversa são chamados a partir
  // daqui. Antes, QUALQUER childList mutation dentro do painel (inclusive a
  // de uma região totalmente alheia ao clique, ou a própria mutation
  // resultante do flush que content-script.js já ia restaurar sozinho)
  // reiniciava uma cadeia de restauração nova aqui, competindo com quem
  // realmente produziu a mutação — e o heurístico de texto para detecção de
  // troca de conversa (removido, ver resetConversationScrollState() acima)
  // chegava a disparar um reset completo de scroll por causa de uma
  // atualização em segundo plano comum. Essas eram autoridades concorrentes
  // reagindo à mesma mutação em momentos diferentes — a causa raiz do
  // painel “brigando” com o próprio scroll.
  function handlePanelMutation() {
    const currentPanel = getPanel()

    if (!currentPanel) {
      panel = null
      interactionLocked = false
      interactionMode = null
      pendingPanelHtml = null
      return
    }

    if (panel !== currentPanel) {
      panel = currentPanel
      bindPanel(currentPanel)
    }
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      const currentPanel = getPanel()
      const target = event.target

      if (!currentPanel || !target?.closest) {
        return
      }

      const intent = target.closest(INTENT_SELECTOR)

      if (intent && currentPanel.contains(intent)) {
        releaseActionVisualAnchor()
        lockInteraction(intent, 'intent')
        return
      }

      const action = target.closest(ACTION_SELECTOR)

      if (action && currentPanel.contains(action)) {
        // Impede que um refresh assíncrono substitua o botão entre o
        // pointerdown e o click, situação em que o usuário percebe que o
        // botão "desclicou" sem executar a ação.
        lockInteraction(action, 'action')
        return
      }

      if (
        currentPanel.contains(target)
      ) {
        // Qualquer pointerdown que não seja numa ação representa navegação
        // real do vendedor (inclusive arrastar a barra de rolagem).
        releaseActionVisualAnchor()
      }

      if (
        interactionLocked &&
        !target.closest(`#${PANEL_ID}`)
      ) {
        unlockInteraction()
      }
    },
    true,
  )

  document.addEventListener(
    'mousedown',
    (event) => {
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (!input) {
        return
      }

      const currentPanel = getPanel()

      if (!currentPanel) {
        return
      }

      lockInteraction(input, 'intent')
      const intendedTop = currentPanel.scrollTop

      event.preventDefault()

      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }

      currentPanel.scrollTop = intendedTop
      captureScroll(currentPanel)
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      const action = event.target?.closest?.(ACTION_SELECTOR)
      const currentPanel = getPanel()

      if (
        interactionMode !== 'action' ||
        !action ||
        !currentPanel?.contains(action)
      ) {
        return
      }

      // Só destrava a interação aqui. A correção de scroll em si NÃO roda
      // mais a partir deste listener: quem aplica a mutação de DOM
      // resultante do clique (o setter de innerHTML do painel, ou
      // content-script.js depois de renderPanel()/flushPendingPanelRegions())
      // é quem chama restoreAfterRender(), exatamente uma vez, logo depois
      // de escrever o DOM — nunca antes, nunca "no escuro" a partir do
      // próprio evento de click.
      queueMicrotask(() => {
        if (interactionMode === 'action') {
          unlockInteraction()
        }
      })
    },
    true,
  )

  document.addEventListener(
    'keydown',
    (event) => {
      const currentPanel = getPanel()

      if (
        !currentPanel ||
        !currentPanel.contains(
          event.target,
        )
      ) {
        return
      }

      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          'Tab',
          ' ',
        ].includes(event.key)
      ) {
        releaseActionVisualAnchor()
      }
    },
    true,
  )

  document.addEventListener(
    'focusin',
    (event) => {
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (input) {
        lockInteraction(input, 'intent')
      }
    },
    true,
  )

  document.addEventListener(
    'focusout',
    (event) => {
      if (!event.target?.closest?.(INTENT_SELECTOR)) {
        return
      }

      queueMicrotask(() => {
        // Clicar em um botão tira o foco do textarea antes do evento click.
        // Nesse caso a trava precisa continuar até o click concluir.
        if (interactionMode === 'action') {
          return
        }

        if (
          document.activeElement?.closest?.(INTENT_SELECTOR)
        ) {
          return
        }

        unlockInteraction()
      })
    },
    true,
  )

  document.addEventListener(
    'input',
    (event) => {
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (input) {
        lockInteraction(input, 'intent')
      }
    },
    true,
  )

  for (const eventName of ['pointercancel', 'dragstart']) {
    document.addEventListener(
      eventName,
      () => {
        if (interactionMode === 'action') {
          unlockInteraction()
        }
      },
      true,
    )
  }

  // `focus` da window só representa retomada real quando houve um `blur`
  // anterior da própria janela. Um campo interno do Companion pode perder
  // foco sem que o usuário tenha saído da aba; esse caso não deve ativar o
  // resume guard nem reter rerenders legítimos.
  root.addEventListener(
    'blur',
    (event) => {
      if (
        event.target !==
        document.defaultView
      ) {
        return
      }

      windowWasBlurred = true
    },
  )

  root.addEventListener(
    'focus',
    (event) => {
      if (
        event.target !==
          document.defaultView ||
        windowWasBlurred !== true
      ) {
        return
      }

      windowWasBlurred = false
      beginResumeGuard()
    },
  )

  root.addEventListener(
    'pageshow',
    () => {
      beginResumeGuard()
    },
    true,
  )

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.visibilityState === 'visible'
      ) {
        beginResumeGuard()
      }
    },
    true,
  )

  const observer = new MutationObserver((mutations) => {
    const currentPanel = getPanel()

    if (!currentPanel) {
      return
    }

    const panelChanged = mutations.some((mutation) => {
      const target = mutation.target

      if (
        target === currentPanel ||
        currentPanel.contains(target)
      ) {
        return true
      }

      return Array.from(mutation.addedNodes || []).some(
        (node) =>
          node === currentPanel ||
          node?.contains?.(currentPanel),
      )
    })

    if (panelChanged) {
      handlePanelMutation()
    }
  })

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    },
  )

  installResumeLeadResolutionCache()

  panel = getPanel()

  if (panel) {
    bindPanel(panel)
  }

  root.YolenCompanionPanelStabilityRuntime = Object.freeze({
    capture() {
      const currentPanel = getPanel()
      bindPanel(currentPanel)
      captureScroll(currentPanel)
    },
    // Entrypoint explícito para quem PRODUZIU uma mutação de DOM no painel
    // (content-script.js, depois de renderPanel()/flushPendingPanelRegions())
    // avisar que terminou e que agora é hora de corrigir o scroll — uma
    // única vez, decidindo entre âncora de ação ou snapshot absoluto
    // conforme o que estiver ativo no momento da chamada.
    restore() {
      restoreAfterRender()
    },
    // content-script.js chama isto de dentro de
    // clearLeadStateForNewConversation() — o único lugar que sabe, com
    // certeza e sincronamente, que a conversa mudou de verdade (ver
    // resetConversationScrollState() acima para o porquê de não haver
    // nenhum heurístico assíncrono equivalente aqui dentro). Sem isto, o
    // renderPanel() que já vem a seguir podia chamar restoreAfterRender()
    // usando âncora/scrollSnapshot ainda da conversa anterior.
    resetForNewConversation() {
      resetConversationScrollState(
        getPanel(),
      )
    },
    isInteractionLocked() {
      return interactionLocked
    },
    isResumeGuardActive,
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
