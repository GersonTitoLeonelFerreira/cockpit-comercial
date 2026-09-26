/* global browser, chrome */

;(function initUx8InteractionConsistencyRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const UX8_PANEL_SELECTOR =
    `#${PANEL_ID}[data-yolen-ux-build="UX8"]`
  const SELLER_AREA_TAB_SELECTOR =
    '[data-yolen-seller-area]'
  const SELLER_INFORMATION_REGION_SELECTOR =
    '[data-yolen-region="seller-information-architecture"]'
  const SELLER_MESSAGE_MOUNT_SELECTOR =
    '[data-yolen-seller-message-mount]'
  const SELLER_MESSAGE_BOX_SELECTOR =
    '[data-yolen-seller-message-box]'
  const ANALYZE_ACTION_SELECTOR =
    '[data-yolen-action="analyze-conversation"]'
  const EDITABLE_SELECTOR = [
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([readonly]):not([disabled])',
    'textarea:not([readonly]):not([disabled])',
    'select:not([disabled])',
    '[contenteditable="true"]',
  ].join(',')

  let composerPlacementCheckQueued = false
  let capturedAnalyzeClickHandler = null

  function getUx8Panel() {
    return document.querySelector(
      UX8_PANEL_SELECTOR,
    )
  }

  function getCompanionRuntime() {
    if (
      typeof browser !== 'undefined' &&
      browser.runtime?.sendMessage
    ) {
      return browser.runtime
    }

    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime?.sendMessage
    ) {
      return chrome.runtime
    }

    return (
      root.browser?.runtime ||
      root.chrome?.runtime ||
      root.window?.browser?.runtime ||
      root.window?.chrome?.runtime ||
      null
    )
  }

  // FASE 16.9 — retry seller-facing (clique em "Tentar novamente") passou a
  // ser resolvido inteiramente pelo caminho canônico em yolen-api.js
  // (analyzeConversation/getAnalysisJobStatus), sem depender de
  // messageDomRevision/captureRevision. Este arquivo não precisa mais
  // envolver analyzeConversation com um wrapper próprio de retry — manter
  // um segundo lugar reimplementando a mesma decisão só criava risco de
  // ordens de wrapper divergentes entre scripts. Ver yolen-api.js para a
  // regra única de "quando reabrir um job failed".

  function isAnalyzeActionElement(value) {
    return Boolean(
      value &&
      value.nodeType === 1 &&
      typeof value.matches === 'function' &&
      value.matches(
        ANALYZE_ACTION_SELECTOR,
      ),
    )
  }

  // content-script.js instala o handler real de análise diretamente no
  // botão renderizado. panel-stability-runtime.js e
  // editable-field-stability-runtime.js podem, legitimamente, substituir
  // panel.innerHTML inteiro depois disso para preservar scroll/foco. O
  // novo botão visual criado por essa substituição não carrega listeners
  // JS nem a propriedade __yolenWiredEvents do node anterior — ficava com
  // aparência clicável, mas o clique não chegava a analyzeCurrentConversation.
  //
  // Capturamos UMA vez a closure real instalada pelo content-script antes
  // de os runtimes de estabilidade começarem a substituir nodes. Depois
  // restauramos EventTarget.prototype.addEventListener imediatamente para
  // não manter nenhum monkey-patch global durante a vida da página.
  function installAnalyzeActionHandlerCapture() {
    const eventTargetPrototype =
      root.EventTarget?.prototype ||
      globalThis.EventTarget?.prototype

    const originalAddEventListener =
      eventTargetPrototype
        ?.addEventListener

    if (
      !eventTargetPrototype ||
      typeof originalAddEventListener !==
        'function'
    ) {
      return null
    }

    const wrappedAddEventListener =
      function yolenAnalyzeActionAwareAddEventListener(
        type,
        listener,
        options,
      ) {
        if (
          type === 'click' &&
          typeof listener === 'function' &&
          isAnalyzeActionElement(this)
        ) {
          capturedAnalyzeClickHandler =
            listener

          queueMicrotask(() => {
            if (
              eventTargetPrototype
                .addEventListener ===
              wrappedAddEventListener
            ) {
              eventTargetPrototype
                .addEventListener =
                originalAddEventListener
            }
          })
        }

        return originalAddEventListener.call(
          this,
          type,
          listener,
          options,
        )
      }

    eventTargetPrototype.addEventListener =
      wrappedAddEventListener

    return {
      restore() {
        if (
          eventTargetPrototype
            .addEventListener ===
          wrappedAddEventListener
        ) {
          eventTargetPrototype
            .addEventListener =
            originalAddEventListener
        }
      },
    }
  }

  function invokeCapturedAnalyzeHandlerWhenNodeLost(
    event,
  ) {
    const action =
      event.target?.closest?.(
        ANALYZE_ACTION_SELECTOR,
      )

    if (
      !action ||
      typeof capturedAnalyzeClickHandler !==
        'function'
    ) {
      return
    }

    const panel =
      document.getElementById(
        PANEL_ID,
      )

    if (
      !panel ||
      !panel.contains(action)
    ) {
      return
    }

    // Um botão ainda ligado pelo wireOnce() possui essa marca e executará
    // o próprio listener normal no target. O fallback só assume a ação
    // quando um full innerHTML replacement criou um node novo e, portanto,
    // perdeu simultaneamente marca + listener.
    if (
      action.__yolenWiredEvents
        ?.has?.('click')
    ) {
      return
    }

    capturedAnalyzeClickHandler.call(
      action,
      event,
    )
  }

  function releasePreviousSellerAreaInteraction(
    event,
  ) {
    const tab =
      event.target?.closest?.(
        SELLER_AREA_TAB_SELECTOR,
      )
    const panel = getUx8Panel()

    if (
      !tab ||
      !panel ||
      !panel.contains(tab) ||
      tab.getAttribute('aria-selected') ===
        'true'
    ) {
      return
    }

    const sellerRegion =
      panel.querySelector(
        SELLER_INFORMATION_REGION_SELECTOR,
      )

    if (!sellerRegion) {
      return
    }

    // Uma troca deliberada de aba sempre vence qualquer lock visual que
    // tenha sobrado da área anterior. Esse lock só protege o intervalo
    // pointerdown -> click de uma ação local; quando o vendedor já está
    // clicando outra aba, manter o lock bloquearia a navegação inteira.
    if (
      sellerRegion.dataset
        ?.yolenRegionActionLock === 'true'
    ) {
      delete sellerRegion.dataset
        .yolenRegionActionLock
    }

    const active = document.activeElement

    if (
      !active ||
      !sellerRegion.contains(active)
    ) {
      return
    }

    const editable =
      active.closest?.(
        EDITABLE_SELECTOR,
      )

    if (
      !editable ||
      !sellerRegion.contains(editable)
    ) {
      return
    }

    // Firefox/macOS pode manter a textarea como document.activeElement
    // durante o click da tab. content-script.js interpreta um editable
    // focado como interação ativa e adia o HTML da nova área; o resultado
    // era a tab CLIENTE selecionada com o conteúdo de MENSAGEM ainda
    // visível. O seller intent já é persistido no evento input do runtime,
    // então liberar o foco aqui não perde texto nem estado.
    try {
      editable.blur()
    } catch {
      // Fail-safe: se o browser recusar blur por qualquer motivo, não
      // inventamos foco nem bloqueamos o click da tab.
    }
  }

  function enforceUx8ComposerPlacement() {
    const panel = getUx8Panel()

    if (!panel) {
      return
    }

    const dedicatedMount =
      panel.querySelector(
        SELLER_MESSAGE_MOUNT_SELECTOR,
      )

    panel
      .querySelectorAll(
        SELLER_MESSAGE_BOX_SELECTOR,
      )
      .forEach((box) => {
        if (
          !dedicatedMount ||
          box.parentElement !== dedicatedMount
        ) {
          box.remove()
        }
      })
  }

  function queueComposerPlacementCheck() {
    if (composerPlacementCheckQueued) {
      return
    }

    composerPlacementCheckQueued = true

    queueMicrotask(() => {
      composerPlacementCheckQueued = false
      enforceUx8ComposerPlacement()
    })
  }

  installAnalyzeActionHandlerCapture()

  // Delegação de segurança instalada antes de content-script.js. Em nodes
  // normais ela é no-op; em um clone visual sem listener, reutiliza a
  // closure real capturada e mantém toda a regra de retry/ownership no
  // único dono existente, sem duplicar lógica de análise neste runtime.
  document.addEventListener(
    'click',
    invokeCapturedAnalyzeHandlerWhenNodeLost,
    true,
  )

  // Capture phase: executa antes dos handlers de click das tabs instalados
  // por content-script.js. pointerdown cobre o fluxo real do mouse/touch;
  // click cobre ativação sintética/assistiva em que não houve pointerdown.
  document.addEventListener(
    'pointerdown',
    releasePreviousSellerAreaInteraction,
    true,
  )
  document.addEventListener(
    'click',
    releasePreviousSellerAreaInteraction,
    true,
  )

  const observer = new MutationObserver(
    queueComposerPlacementCheck,
  )

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    },
  )

  queueComposerPlacementCheck()

  root.YolenCompanionUx8InteractionConsistencyRuntime =
    Object.freeze({
      enforceComposerPlacement:
        enforceUx8ComposerPlacement,
      hasCapturedAnalyzeHandler() {
        return (
          typeof capturedAnalyzeClickHandler ===
          'function'
        )
      },
    })
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
