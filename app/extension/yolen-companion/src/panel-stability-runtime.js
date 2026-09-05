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
  let conversationLabel = null
  let restoring = false
  let restoreSequence = 0
  let interactionLocked = false
  let interactionMode = null
  let pendingPanelHtml = null
  let actionVisualAnchor = null
  let actionVisualRestoreSequence = 0
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

  // UX8 (FASE B.1) — helper canônico do dono do scroll seller-facing.
  // Antes da UX8, #yolen-companion-panel era, ele mesmo, o elemento
  // rolável; agora quem rola de verdade é .yolen-workspace-body (o painel
  // externo tem overflow:hidden — ver styles.css). Nunca ler/escrever
  // scrollTop/scrollHeight/clientHeight do painel operacionalmente a
  // partir daqui: sempre passar por este helper. Devolve null (nunca
  // lança, nunca inventa scroll no painel) quando o workspace-body ainda
  // não existe — modo colapsado (a casca colapsada não tem regiões) ou um
  // instante antes do primeiro render expandido — e quem chama trata isso
  // como fail-safe: sem workspace-body, não há posição de leitura para
  // capturar/restaurar.
  function getWorkspaceScrollContainer(targetPanel) {
    return (
      targetPanel?.querySelector(
        '[data-yolen-workspace-body]',
      ) || null
    )
  }

  function getConversationLabel(targetPanel) {
    return String(
      targetPanel
        ?.querySelector('.yolen-lead-name')
        ?.textContent || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
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
    const scrollTarget =
      getWorkspaceScrollContainer(
        targetPanel,
      )

    if (!scrollTarget || restoring) {
      return
    }

    const maxScroll = Math.max(
      0,
      scrollTarget.scrollHeight - scrollTarget.clientHeight,
    )
    const top = Math.max(0, scrollTarget.scrollTop)
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
      actionVisualRestoreSequence += 1
      return
    }

    actionVisualAnchor = {
      identity,
      viewportTop: rect.top,
    }
    actionVisualRestoreSequence += 1
  }

  function releaseActionVisualAnchor() {
    actionVisualAnchor = null
    actionVisualRestoreSequence += 1

    const currentPanel =
      getPanel()

    if (currentPanel) {
      captureScroll(currentPanel)
    }
  }

  function restoreActionVisualAnchor() {
    const anchor =
      actionVisualAnchor

    if (!anchor) {
      return
    }

    const sequence =
      ++actionVisualRestoreSequence

    const restore = () => {
      if (
        sequence !==
          actionVisualRestoreSequence ||
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
        const scrollTarget =
          getWorkspaceScrollContainer(
            currentPanel,
          )

        if (scrollTarget) {
          scrollTarget.scrollTop += delta
        }
      }

      captureScroll(currentPanel)
    }

    queueMicrotask(() => {
      root.requestAnimationFrame(() => {
        restore()

        root.requestAnimationFrame(
          restore,
        )
      })
    })
  }

  function getRestoreTop(targetPanel) {
    const scrollTarget =
      getWorkspaceScrollContainer(
        targetPanel,
      )

    if (!scrollTarget) {
      return 0
    }

    const maxScroll = Math.max(
      0,
      scrollTarget.scrollHeight - scrollTarget.clientHeight,
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
    const restoreTop =
      getRestoreTop(currentPanel)

    applyPanelHtml(
      currentPanel,
      pendingHtml,
    )

    bindPanel(currentPanel)

    const scrollTarget =
      getWorkspaceScrollContainer(
        currentPanel,
      )

    if (scrollTarget) {
      scrollTarget.scrollTop = Math.min(
        restoreTop,
        Math.max(
          0,
          scrollTarget.scrollHeight - scrollTarget.clientHeight,
        ),
      )
    }

    captureScroll(currentPanel)
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
        },
      },
    )
  }

  // UX8 (FASE B.1): os listeners de wheel/touchmove/scroll precisam viver
  // no dono real do scroll (.yolen-workspace-body), não no painel externo
  // — scroll não faz bubble, então um listener no painel nunca seria
  // notificado do scroll de um descendente. O dono do scroll é recriado
  // sempre que o shell é reconstruído (colapsar/expandir), por isso o
  // "já vinculado" fica marcado no próprio elemento do dono do scroll, não
  // no painel (que persiste pela vida toda da extensão).
  function bindWorkspaceScrollTarget(
    targetPanel,
    scrollTarget,
  ) {
    if (
      !scrollTarget ||
      scrollTarget.__yolenScrollBound === true
    ) {
      return
    }

    scrollTarget.__yolenScrollBound = true

    scrollTarget.addEventListener(
      'wheel',
      () => {
        releaseActionVisualAnchor()
      },
      { passive: true },
    )

    scrollTarget.addEventListener(
      'touchmove',
      () => {
        releaseActionVisualAnchor()
      },
      { passive: true },
    )

    scrollTarget.addEventListener(
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
  }

  function bindPanel(targetPanel) {
    if (!targetPanel) {
      return
    }

    patchPanelInnerHtml(targetPanel)

    bindWorkspaceScrollTarget(
      targetPanel,
      getWorkspaceScrollContainer(
        targetPanel,
      ),
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

    const sequence = ++restoreSequence
    restoring = true

    const restore = () => {
      if (sequence !== restoreSequence) {
        return
      }

      const currentPanel = getPanel()

      if (!currentPanel) {
        restoring = false
        return
      }

      bindPanel(currentPanel)

      const scrollTarget =
        getWorkspaceScrollContainer(
          currentPanel,
        )

      if (scrollTarget) {
        scrollTarget.scrollTop = getRestoreTop(currentPanel)
      }
    }

    queueMicrotask(() => {
      root.requestAnimationFrame(() => {
        restore()

        root.requestAnimationFrame(() => {
          if (sequence !== restoreSequence) {
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

    const nextConversationLabel =
      getConversationLabel(currentPanel)

    if (
      conversationLabel &&
      nextConversationLabel &&
      nextConversationLabel !== conversationLabel
    ) {
      interactionLocked = false
      interactionMode = null
      pendingPanelHtml = null
      actionVisualAnchor = null
      actionVisualRestoreSequence += 1
      conversationLabel = nextConversationLabel
      scrollSnapshot = {
        top: 0,
        distanceFromBottom: 0,
        nearBottom: false,
      }
      restoreSequence += 1
      restoring = false

      const scrollTarget =
        getWorkspaceScrollContainer(
          currentPanel,
        )

      if (scrollTarget) {
        scrollTarget.scrollTop = 0
      }

      return
    }

    if (nextConversationLabel) {
      conversationLabel = nextConversationLabel
    }

    if (actionVisualAnchor) {
      restoreActionVisualAnchor()
      return
    }

    restorePanelInteraction(currentPanel)
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

      const scrollTarget =
        getWorkspaceScrollContainer(
          currentPanel,
        )
      const intendedTop =
        scrollTarget?.scrollTop ?? null

      event.preventDefault()

      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }

      if (scrollTarget && intendedTop !== null) {
        scrollTarget.scrollTop = intendedTop
      }

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

      // Roda depois dos handlers de click do Companion. O botão clicado
      // vira a âncora visual: se o conteúdo mudar acima dele, corrigimos
      // apenas a diferença real de posição, sem ficar regravando um
      // scrollTop absoluto em vários frames concorrentes.
      queueMicrotask(() => {
        if (interactionMode === 'action') {
          unlockInteraction()
        }

        restoreActionVisualAnchor()
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
    conversationLabel = getConversationLabel(panel) || null
  }

  root.YolenCompanionPanelStabilityRuntime = Object.freeze({
    capture() {
      const currentPanel = getPanel()
      bindPanel(currentPanel)
      captureScroll(currentPanel)
    },
    restore() {
      restorePanelInteraction(getPanel())
    },
    isInteractionLocked() {
      return interactionLocked
    },
    isResumeGuardActive,
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
