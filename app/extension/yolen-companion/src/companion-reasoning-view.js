;(function initCompanionReasoningView(root) {
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
        'function' ||
      typeof tools.materializeAttachmentEvidence !==
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
    const DOCUMENT_MARKER_SELECTOR = [
      'a[download]',
      '[download]',
      '[data-testid*="document" i]',
      '[data-testid*="attachment" i]',
      '[data-icon*="document" i]',
      '[data-icon*="download" i]',
    ].join(',')
    const EVIDENCE_ATTRIBUTE =
      'data-yolen-attachment-evidence'
    const BRIDGE_ATTRIBUTE =
      'data-yolen-attachment-bubble-bridge'
    const SYNTHETIC_MESSAGE_ATTRIBUTE =
      'data-yolen-attachment-synthetic-message'

    function getCanonicalMessageNodes(
      bubble,
    ) {
      if (!bubble?.querySelectorAll) {
        return []
      }

      return Array.from(
        bubble.querySelectorAll(
          MESSAGE_SELECTOR,
        ),
      ).filter((node) => {
        return !node.closest?.(
          QUOTED_SELECTOR,
        )
      })
    }

    function uniqueMessageNodeFromBubble(
      bubble,
    ) {
      const nodes =
        getCanonicalMessageNodes(
          bubble,
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

    function cloneBubbleForAttachmentRead(
      bubble,
      {
        removeCanonicalMessages = false,
      } = {},
    ) {
      if (!bubble?.cloneNode) {
        return null
      }

      const clone =
        bubble.cloneNode(true)

      if (removeCanonicalMessages) {
        clone
          .querySelectorAll?.(
            MESSAGE_SELECTOR,
          )
          .forEach((element) => {
            element.remove?.()
          })
      }

      clone
        .querySelectorAll?.(
          QUOTED_SELECTOR,
        )
        .forEach((element) => {
          element.remove?.()
        })

      clone
        .querySelectorAll?.(
          `[${EVIDENCE_ATTRIBUTE}], [${BRIDGE_ATTRIBUTE}], [${SYNTHETIC_MESSAGE_ATTRIBUTE}]`,
        )
        .forEach((element) => {
          element.remove?.()
        })

      return clone
    }

    function getTextOutsideCanonicalMessage(
      bubble,
    ) {
      const clone =
        cloneBubbleForAttachmentRead(
          bubble,
          {
            removeCanonicalMessages:
              true,
          },
        )

      return clone
        ? tools.readCapturedElementText(
            clone,
          )
        : ''
    }

    function getWholeBubbleAttachmentText(
      bubble,
    ) {
      const clone =
        cloneBubbleForAttachmentRead(
          bubble,
        )

      return clone
        ? tools.readCapturedElementText(
            clone,
          )
        : ''
    }

    function readAttachmentFileNameFromAttributes(
      bubble,
    ) {
      if (!bubble?.querySelectorAll) {
        return null
      }

      const candidates = [
        bubble,
        ...Array.from(
          bubble.querySelectorAll(
            '[download], [title], [aria-label]',
          ),
        ),
      ]

      for (const element of candidates) {
        if (
          element.closest?.(
            QUOTED_SELECTOR,
          )
        ) {
          continue
        }

        for (const attribute of [
          'download',
          'title',
          'aria-label',
        ]) {
          const fileName =
            tools.extractAttachmentFileName(
              element.getAttribute?.(
                attribute,
              ),
            )

          if (fileName) {
            return fileName
          }
        }
      }

      return null
    }

    function getAttachmentOnlyDescriptor(
      bubble,
    ) {
      if (!bubble?.querySelector) {
        return null
      }

      const text =
        getWholeBubbleAttachmentText(
          bubble,
        )

      const fileName =
        readAttachmentFileNameFromAttributes(
          bubble,
        ) ||
        tools.extractAttachmentFileName(
          text,
        )

      if (!fileName) {
        return null
      }

      const hasDocumentMarker =
        Boolean(
          bubble.querySelector(
            DOCUMENT_MARKER_SELECTOR,
          ),
        )

      const hasFileMetadata =
        /\b(?:pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|jpg|jpeg|png|webp|gif|heic|mp4|mov|avi|mp3|wav|ogg|m4a)\b/i.test(
          text,
        ) &&
        (
          /\b\d+(?:[.,]\d+)?\s*(?:bytes?|kb|kib|mb|mib|gb|gib)\b/i.test(
            text,
          ) ||
          /\b\d+\s*p[aá]ginas?\b/i.test(
            text,
          )
        )

      if (
        !hasDocumentMarker &&
        !hasFileMetadata
      ) {
        return null
      }

      const timeMatches =
        Array.from(
          String(text || '')
            .matchAll(
              /(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g,
            ),
        )

      const lastTime =
        timeMatches.at(-1)

      if (!lastTime) {
        return null
      }

      return {
        fileName,
        time:
          `${String(lastTime[1]).padStart(2, '0')}:${lastTime[2]}`,
      }
    }

    function getDateFromPrePlainText(
      value,
    ) {
      const text =
        String(value || '')

      const timeFirst =
        text.match(
          /\d{1,2}:\d{2}(?::\d{2})?\s*,\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/,
        )

      const dateFirst =
        text.match(
          /(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s*,\s*\d{1,2}:\d{2}/,
        )

      const match =
        timeFirst || dateFirst

      if (!match) {
        return null
      }

      let year = Number(match[3])

      if (year < 100) {
        year += 2000
      }

      const day = Number(match[1])
      const month = Number(match[2])
      const date = new Date(
        year,
        month - 1,
        day,
      )

      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null
      }

      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
    }

    function inferBubbleDateFromNeighbors(
      bubble,
    ) {
      if (!bubble) {
        return null
      }

      const NodeRef =
        windowRef.Node

      const precedingFlag =
        NodeRef?.DOCUMENT_POSITION_PRECEDING ??
        2
      const followingFlag =
        NodeRef?.DOCUMENT_POSITION_FOLLOWING ??
        4

      let precedingDate = null
      let followingDate = null

      const allMessageNodes =
        Array.from(
          documentRef.querySelectorAll(
            MESSAGE_SELECTOR,
          ),
        ).filter((node) => {
          return (
            !bubble.contains?.(node) &&
            !node.hasAttribute?.(
              SYNTHETIC_MESSAGE_ATTRIBUTE,
            ) &&
            !node.closest?.(
              QUOTED_SELECTOR,
            )
          )
        })

      for (const node of allMessageNodes) {
        const position =
          bubble.compareDocumentPosition?.(
            node,
          ) || 0

        const date =
          getDateFromPrePlainText(
            node.getAttribute?.(
              'data-pre-plain-text',
            ),
          )

        if (!date) {
          continue
        }

        if (
          position & precedingFlag
        ) {
          precedingDate = date
          continue
        }

        if (
          position & followingFlag
        ) {
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

      return (
        precedingDate ||
        followingDate ||
        null
      )
    }

    function createSyntheticCanonicalMessage(
      bubble,
    ) {
      if (
        !bubble ||
        getCanonicalMessageNodes(
          bubble,
        ).length !== 0
      ) {
        return null
      }

      const descriptor =
        getAttachmentOnlyDescriptor(
          bubble,
        )

      const date =
        inferBubbleDateFromNeighbors(
          bubble,
        )

      if (!descriptor || !date) {
        return null
      }

      const synthetic =
        documentRef.createElement(
          'span',
        )

      synthetic.setAttribute(
        SYNTHETIC_MESSAGE_ATTRIBUTE,
        'true',
      )
      synthetic.setAttribute(
        'data-pre-plain-text',
        `[${descriptor.time}, ${date}] ${
          bubble.matches?.('.message-out')
            ? 'Yolen'
            : 'Cliente'
        }: `,
      )
      synthetic.setAttribute(
        'aria-hidden',
        'true',
      )
      synthetic.style.display =
        'none'

      bubble.appendChild(
        synthetic,
      )

      return synthetic
    }

    function reconcileBubbleBridge(
      messageNode,
    ) {
      if (
        !messageNode ||
        messageNode.nodeType !== 1
      ) {
        return false
      }

      const bubble =
        findSafeBubble(
          messageNode,
        )

      if (!bubble) {
        return tools
          .materializeAttachmentEvidence(
            messageNode,
          )
      }

      const fileName =
        tools.extractAttachmentFileName(
          getTextOutsideCanonicalMessage(
            bubble,
          ),
        )

      const existingBridge =
        messageNode.querySelector?.(
          `[${BRIDGE_ATTRIBUTE}]`,
        )

      if (!fileName) {
        existingBridge?.remove?.()

        return tools
          .materializeAttachmentEvidence(
            messageNode,
          )
      }

      const bridge =
        existingBridge ||
        messageNode.ownerDocument
          ?.createElement?.('span')

      if (!bridge) {
        return false
      }

      let changed = false

      if (!existingBridge) {
        bridge.setAttribute(
          BRIDGE_ATTRIBUTE,
          'true',
        )
        bridge.setAttribute(
          'data-testid',
          'document',
        )
        bridge.setAttribute(
          'aria-hidden',
          'true',
        )
        bridge.style.display =
          'none'
        messageNode.appendChild(
          bridge,
        )
        changed = true
      }

      if (
        bridge.getAttribute?.(
          'title',
        ) !== fileName
      ) {
        bridge.setAttribute(
          'title',
          fileName,
        )
        changed = true
      }

      const evidenceChanged =
        tools
          .materializeAttachmentEvidence(
            messageNode,
          )

      return Boolean(
        changed ||
        evidenceChanged ||
        messageNode.querySelector?.(
          `[${EVIDENCE_ATTRIBUTE}]`,
        ),
      )
    }

    function reconcileBubble(
      bubble,
    ) {
      if (!bubble?.querySelectorAll) {
        return false
      }

      let messageNode =
        uniqueMessageNodeFromBubble(
          bubble,
        )

      if (!messageNode) {
        if (
          getCanonicalMessageNodes(
            bubble,
          ).length !== 0
        ) {
          return false
        }

        messageNode =
          createSyntheticCanonicalMessage(
            bubble,
          )
      }

      return messageNode
        ? reconcileBubbleBridge(
            messageNode,
          )
        : false
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

      return result
    }

    function collectBubbles(node) {
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
          BUBBLE_SELECTOR,
        )

      if (direct) {
        result.push(direct)
      }

      element
        .querySelectorAll?.(
          BUBBLE_SELECTOR,
        )
        .forEach((bubble) => {
          if (!result.includes(bubble)) {
            result.push(bubble)
          }
        })

      return result
    }

    function scanNode(node) {
      collectBubbles(node)
        .forEach(
          reconcileBubble,
        )

      collectMessageNodes(node)
        .forEach(
          reconcileBubbleBridge,
        )
    }

    documentRef
      .querySelectorAll(
        BUBBLE_SELECTOR,
      )
      .forEach(
        reconcileBubble,
      )

    documentRef
      .querySelectorAll(
        MESSAGE_SELECTOR,
      )
      .forEach(
        reconcileBubbleBridge,
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
      reconcileBubble,
      reconcileBubbleBridge,
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

  // FASE 16.9 — o hotfix de freshness de scroll/DOM que vivia aqui foi
  // removido: a regra de retry/polling de análise agora é resolvida
  // inteiramente por yolen-api.js (analyzeConversation/
  // getAnalysisJobStatus), sem depender de messageDomRevision nem de
  // localizar YolenCompanionApi em realms diferentes. Ver yolen-api.js.

  // O WhatsApp pode renderizar o cartão de documento fora do nó
  // [data-pre-plain-text], dentro da mesma bolha .message-in/.message-out.
  // O adapter canônico continua sendo o dono da evidência. Este fallback
  // cria o marcador dentro do nó canônico quando ele existe e, para cartões
  // document-only do Firefox que não expõem [data-pre-plain-text], cria um
  // nó canônico oculto somente quando arquivo + metadata visual + horário +
  // data cronológica dos vizinhos estão comprovados. Assim o ledger deixa
  // de depender de uma estrutura DOM que o WhatsApp não garante.
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
