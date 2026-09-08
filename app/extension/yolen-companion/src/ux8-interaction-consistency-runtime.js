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
  const EDITABLE_SELECTOR = [
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([readonly]):not([disabled])',
    'textarea:not([readonly]):not([disabled])',
    'select:not([disabled])',
    '[contenteditable="true"]',
  ].join(',')

  let composerPlacementCheckQueued = false

  function getUx8Panel() {
    return document.querySelector(
      UX8_PANEL_SELECTOR,
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
    })
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
