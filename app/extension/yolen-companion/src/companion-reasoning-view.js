;(function initCompanionReasoningView(root) {
  function installAnalysisScrollFreshnessRuntime() {
    const tools =
      root.YolenCompanionNullBaseRebase ||
      root.window
        ?.YolenCompanionNullBaseRebase

    const companionApi =
      root.YolenCompanionApi ||
      root.window?.YolenCompanionApi

    if (
      !tools ||
      typeof tools
        .installAnalysisScrollFreshnessHotfix !==
        'function' ||
      !companionApi
    ) {
      return null
    }

    const target =
      root.YolenCompanionApi ===
      companionApi
        ? root
        : {
            YolenCompanionApi:
              companionApi,
            browser:
              root.browser ||
              root.window?.browser,
            chrome:
              root.chrome ||
              root.window?.chrome,
          }

    return tools
      .installAnalysisScrollFreshnessHotfix(
        target,
      )
  }

  function installAttachmentBubbleFallback() {
    const tools =
      root.YolenCompanionMessageMutations ||
      root.window
        ?.YolenCompanionMessageMutations

    const windowRef =
      root.window || root

    const documentRef =
      root.document ||
      windowRef?.document

    const MutationObserverRef =
      root.MutationObserver ||
      windowRef?.MutationObserver

    if (
      !tools ||
      !documentRef ||
      typeof MutationObserverRef !==
        'function' ||
      typeof tools.extractAttachmentFileName !==
        'function' ||
      typeof tools.readCapturedElementText !==
        'function'
    ) {
      return null
    }

    if (
      windowRef
        .__yolenAttachmentBubbleFallback
    ) {
      return windowRef
        .__yolenAttachmentBubbleFallback
    }

    const MESSAGE_SELECTOR =
      '[data-pre-plain-text]'
    const BUBBLE_SELECTOR =
      '.message-in, .message-out, [data-id]'
    const QUOTED_SELECTOR = [
      '[data-testid*="quoted" i]',
      '[data-testid*="reply" i]',
      '[aria-label*="quoted" i]',
      '[aria-label*="mensagem citada" i]',
      '[aria-label*="resposta" i]',
    ].join(',')
    const SELECTABLE_SELECTOR = [
      '[data-testid="selectable-text"]',
      'span.selectable-text.copyable-text',
    ].join(',')
    const EVIDENCE_ATTRIBUTE =
      'data-yolen-attachment-evidence'

    function uniqueMessageNodeFromBubble(
      bubble,
    ) {
      if (!bubble?.querySelectorAll) {
        return null
      }

      const nodes =
        Array.from(
          bubble.querySelectorAll(
            MESSAGE_SELECTOR,
          ),
        )

      return nodes.length === 1
        ? nodes[0]
        : null
    }

    function findSafeBubble(messageNode) {
      if (!messageNode?.closest) {
        return null
      }

      const candidates = []
      let current =
        messageNode.parentElement

      while (current) {
        if (
          current.matches?.(
            BUBBLE_SELECTOR,
          )
        ) {
          candidates.push(current)
        }

        if (
          current.matches?.(
            'main, [role="application"], #app',
          )
        ) {
          break
        }

        current =
          current.parentElement
      }

      for (const candidate of candidates) {
        if (
          uniqueMessageNodeFromBubble(
            candidate,
          ) === messageNode
        ) {
          return candidate
        }
      }

      return null
    }

    function getTextOutsideCanonicalMessage(
      bubble,
    ) {
      if (!bubble?.cloneNode) {
        return ''
      }

      const clone =
        bubble.cloneNode(true)

      clone
        .querySelectorAll?.(
          MESSAGE_SELECTOR,
        )
        .forEach((element) => {
          element.remove?.()
        })

      clone
        .querySelectorAll?.(
          QUOTED_SELECTOR,
        )
        .forEach((element) => {
          element.remove?.()
        })

      clone
        .querySelectorAll?.(
          `[${EVIDENCE_ATTRIBUTE}]`,
        )
        .forEach((element) => {
          element.remove?.()
        })

      return tools
        .readCapturedElementText(
          clone,
        )
    }

    function getBaseMessageText(
      messageNode,
    ) {
      if (!messageNode?.querySelectorAll) {
        return ''
      }

      const parts = []

      messageNode
        .querySelectorAll(
          SELECTABLE_SELECTOR,
        )
        .forEach((element) => {
          if (
            element.hasAttribute?.(
              EVIDENCE_ATTRIBUTE,
            ) ||
            element.closest?.(
              QUOTED_SELECTOR,
            )
          ) {
            return
          }

          const value =
            typeof tools
              .cleanCapturedMessageText ===
              'function'
              ? tools.cleanCapturedMessageText(
                  tools.readCapturedElementText(
                    element,
                  ),
                )
              : String(
                  tools.readCapturedElementText(
                    element,
                  ) || '',
                ).trim()

          if (value) {
            parts.push(value)
          }
        })

      return Array.from(
        new Set(parts),
      ).join('\n')
    }

    function materializeFromBubble(
      messageNode,
    ) {
      if (
        !messageNode ||
        messageNode.nodeType !== 1
      ) {
        return false
      }

      tools
        .materializeAttachmentEvidence
        ?.(
          messageNode,
        )

      if (
        messageNode.querySelector?.(
          `[${EVIDENCE_ATTRIBUTE}]`,
        )
      ) {
        return true
      }

      const bubble =
        findSafeBubble(
          messageNode,
        )

      if (!bubble) {
        return false
      }

      const outsideText =
        getTextOutsideCanonicalMessage(
          bubble,
        )

      const fileName =
        tools.extractAttachmentFileName(
          outsideText,
        )

      if (!fileName) {
        return false
      }

      const evidence =
        messageNode.ownerDocument
          ?.createElement?.('span')

      if (!evidence) {
        return false
      }

      const baseText =
        getBaseMessageText(
          messageNode,
        )

      evidence.setAttribute(
        EVIDENCE_ATTRIBUTE,
        'true',
      )
      evidence.setAttribute(
        'data-testid',
        'selectable-text',
      )
      evidence.setAttribute(
        'aria-hidden',
        'true',
      )
      evidence.style.display =
        'none'
      evidence.textContent = [
        baseText,
        `[Arquivo: ${fileName}]`,
      ]
        .filter(Boolean)
        .join('\n')

      messageNode.appendChild(
        evidence,
      )

      return true
    }

    function collectMessageNodes(node) {
      const element =
        node?.nodeType === 1
          ? node
          : node?.parentElement

      if (!element) {
        return []
      }

      const result = []

      const direct =
        element.closest?.(
          MESSAGE_SELECTOR,
        )

      if (direct) {
        result.push(direct)
      }

      element
        .querySelectorAll?.(
          MESSAGE_SELECTOR,
        )
        .forEach((messageNode) => {
          if (!result.includes(messageNode)) {
            result.push(messageNode)
          }
        })

      const bubble =
        element.closest?.(
          BUBBLE_SELECTOR,
        )

      const bubbleMessage =
        uniqueMessageNodeFromBubble(
          bubble,
        )

      if (
        bubbleMessage &&
        !result.includes(
          bubbleMessage,
        )
      ) {
        result.push(
          bubbleMessage,
        )
      }

      return result
    }

    function scanNode(node) {
      collectMessageNodes(node)
        .forEach(
          materializeFromBubble,
        )
    }

    documentRef
      .querySelectorAll(
        MESSAGE_SELECTOR,
      )
      .forEach(
        materializeFromBubble,
      )

    const observer =
      new MutationObserverRef(
        (mutations) => {
          mutations.forEach(
            (mutation) => {
              scanNode(
                mutation.target,
              )

              mutation.addedNodes
                ?.forEach?.(
                  scanNode,
                )
            },
          )
        },
      )

    observer.observe(
      documentRef.documentElement,
      {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'data-pre-plain-text',
          'title',
          'aria-label',
          'download',
        ],
      },
    )

    const installed = {
      observer,
      materializeFromBubble,
    }

    Object.defineProperty(
      windowRef,
      '__yolenAttachmentBubbleFallback',
      {
        configurable: false,
        enumerable: false,
        value: installed,
        writable: false,
      },
    )

    return installed
  }

  // Firefox pode expor a API da extensão no global isolado enquanto
  // `window.YolenCompanionApi` vive no WindowProxy da página. O hotfix de
  // freshness já existia, mas o bootstrap anterior assumia
  // `globalThis === window` e podia nunca instalá-lo nesse cenário real.
  // Este ponto roda depois de capture-resilience-null-base.js e antes do
  // content-script.js, localiza a API em qualquer um dos dois realms e
  // preserva o runtime de browser/chrome do realm da extensão.
  installAnalysisScrollFreshnessRuntime()

  // O WhatsApp pode renderizar o cartão de documento fora do nó
  // [data-pre-plain-text], dentro da mesma bolha .message-in/.message-out.
  // O adapter canônico continua sendo a primeira opção; este fallback só
  // materializa o arquivo quando há exatamente uma mensagem canônica na
  // bolha, evitando contaminar mensagens vizinhas durante virtualização.
  installAttachmentBubbleFallback()

  const base = root.YolenCompanionSellerInformationView

  if (!base || base.__reasoningWrapped === true) {
    return
  }

  const escapeHtml =
    typeof base.escapeHtml === 'function'
      ? base.escapeHtml
      : (value) => String(value ?? '')

  function text(value) {
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : null
  }

  function items(value) {
    return Array.isArray(value)
      ? value.filter(Boolean)
      : []
  }

  function renderReasoningCore(reasoning, mode) {
    if (
      !reasoning ||
      reasoning.status === 'unavailable' ||
      reasoning.status === 'silent'
    ) {
      return ''
    }

    const technique = reasoning.technique
    const whyNow = text(reasoning.why_now)
    const nextAction = text(reasoning.next_best_action)
    const doNotDo = items(reasoning.do_not_do).slice(0, 2)
    const knowledge = items(reasoning.company_knowledge).slice(0, 2)

    if (
      !technique &&
      !whyNow &&
      !nextAction &&
      doNotDo.length === 0 &&
      knowledge.length === 0
    ) {
      return ''
    }

    if (mode === 'agora') {
      return `
        <section
          class="yolen-seller-section yolen-reasoning-section"
          data-yolen-reasoning="agora"
        >
          <div class="yolen-seller-section-heading">
            <div>
              <div class="yolen-seller-section-eyebrow">Coaching</div>
              <h3>Como conduzir agora</h3>
            </div>
          </div>

          ${nextAction ? `
            <article class="yolen-seller-insight yolen-seller-insight--improvement">
              <div class="yolen-seller-insight-type">Próximo movimento</div>
              <div class="yolen-seller-insight-title">${escapeHtml(nextAction)}</div>
            </article>
          ` : ''}

          ${whyNow ? `
            <div class="yolen-seller-detail">
              <div class="yolen-seller-detail-label">Por quê</div>
              <div class="yolen-seller-detail-copy">${escapeHtml(whyNow)}</div>
            </div>
          ` : ''}

          ${
            technique || doNotDo.length > 0
              ? `
                <details
                  class="yolen-seller-secondary-details"
                  data-yolen-preserve-details="agora-technique"
                >
                  <summary>Ver técnica e cuidados</summary>

                  ${technique ? `
                    <div class="yolen-seller-detail">
                      <div class="yolen-seller-detail-label">Técnica aplicável</div>
                      <div class="yolen-seller-detail-copy">${escapeHtml(technique.title || '')}</div>
                      ${
                        text(technique.why_applicable)
                          ? `<div class="yolen-seller-detail-copy">${escapeHtml(technique.why_applicable)}</div>`
                          : ''
                      }
                    </div>
                  ` : ''}

                  ${doNotDo.length > 0 ? `
                    <div class="yolen-seller-detail">
                      <div class="yolen-seller-detail-label">Evite agora</div>
                      <ul class="yolen-seller-text-list">
                        ${doNotDo.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                      </ul>
                    </div>
                  ` : ''}
                </details>
              `
              : ''
          }
        </section>
      `
    }

    const heading =
      'Leitura comercial da Yolen'

    return `
      <section class="yolen-seller-section yolen-reasoning-section" data-yolen-reasoning="${escapeHtml(mode)}">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Commercial Brain</div>
            <h3>${escapeHtml(heading)}</h3>
          </div>
        </div>
        ${technique ? `
          <article class="yolen-seller-insight yolen-seller-insight--positive">
            <div class="yolen-seller-insight-type">Técnica aplicável</div>
            <div class="yolen-seller-insight-title">${escapeHtml(technique.title || '')}</div>
            ${text(technique.why_applicable) ? `<div class="yolen-seller-detail-copy">${escapeHtml(technique.why_applicable)}</div>` : ''}
          </article>
        ` : ''}
        ${whyNow ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Por que agora</div>
            <div class="yolen-seller-detail-copy">${escapeHtml(whyNow)}</div>
          </div>
        ` : ''}
        ${nextAction && mode !== 'agora' ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Melhor próximo movimento</div>
            <div class="yolen-seller-detail-copy">${escapeHtml(nextAction)}</div>
          </div>
        ` : ''}
        ${doNotDo.length > 0 ? `
          <div class="yolen-seller-detail">
            <div class="yolen-seller-detail-label">Evite agora</div>
            <ul class="yolen-seller-text-list">
              ${doNotDo.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${knowledge.length > 0 && mode !== 'agora' ? `
          <details class="yolen-seller-secondary-details" data-yolen-preserve-details="reasoning-knowledge">
            <summary>Regras da empresa consideradas</summary>
            <ul class="yolen-seller-text-list">
              ${knowledge.map((item) => `<li>${escapeHtml(item.title || item.source_type || 'Conhecimento publicado')}</li>`).join('')}
            </ul>
          </details>
        ` : ''}
      </section>
    `
  }

  const ROLE_LABELS = {
    prospect: 'Prospect',
    intermediary: 'Interlocutor / intermediário',
    decision_maker: 'Decisor',
    influencer: 'Influenciador',
    user: 'Usuário',
    beneficiary: 'Beneficiário',
  }

  function renderRoles(roles) {
    const visible = items(roles).slice(0, 6)

    if (visible.length === 0) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-customer-section="roles">
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Papéis na decisão</div>
            <h3>Quem é quem nesta venda</h3>
          </div>
        </div>
        <div class="yolen-seller-stack">
          ${visible.map((role) => `
            <article class="yolen-seller-insight">
              <div class="yolen-seller-insight-type">${escapeHtml(ROLE_LABELS[role.role] || role.role || 'Papel comercial')}</div>
              <div class="yolen-seller-insight-title">${escapeHtml(role.label || ROLE_LABELS[role.role] || '')}</div>
              <div class="yolen-seller-detail-copy">${role.scope === 'current_contact' ? 'Pessoa que está falando nesta conversa.' : 'Pessoa relacionada à oportunidade.'}</div>
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderReadyMessage(reasoning) {
    const message = text(
      reasoning?.message?.ready_to_send,
    )

    if (!message) {
      return ''
    }

    return `
      <section class="yolen-seller-section" data-yolen-reasoning-message-preview>
        <div class="yolen-seller-section-heading">
          <div>
            <div class="yolen-seller-section-eyebrow">Mensagem</div>
            <h3>Base pronta para enviar</h3>
          </div>
        </div>
        <div class="yolen-seller-detail-copy">${escapeHtml(message)}</div>
        <div class="yolen-message-footnote">Edite no WhatsApp antes de enviar. A Yolen não envia automaticamente.</div>
      </section>
    `
  }

  const originalAgora =
    base.renderAgoraViewModelSnapshot
      .bind(base)
  const originalAnalysis =
    base.renderAnalysisViewModel
      .bind(base)
  const originalCustomer =
    base.renderCustomerViewModel
      .bind(base)

  const enhanced = {
    ...base,

    renderAgoraViewModelSnapshot(viewModel) {
      const current = originalAgora(viewModel)

      if (!viewModel || viewModel.silent) {
        return current
      }

      return [
        current,
        renderReasoningCore(
          viewModel.reasoning,
          'agora',
        ),
      ].join('')
    },

    renderAnalysisViewModel(viewModel) {
      return originalAnalysis(viewModel)
    },

    renderCustomerViewModel(viewModel) {
      const current = originalCustomer(viewModel)

      return [
        renderRoles(
          viewModel?.roles ||
          viewModel?.reasoning?.customer_roles,
        ),
        current,
      ].join('')
    },

    renderReasoningMessagePreview(reasoning) {
      return renderReadyMessage(reasoning)
    },

    __reasoningWrapped: true,
  }

  root.YolenCompanionSellerInformationView =
    Object.freeze(enhanced)

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.YolenCompanionSellerInformationView
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
