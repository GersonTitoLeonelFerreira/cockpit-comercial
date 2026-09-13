;(function initPhase169RuntimeGuard(root) {
  const INSTALL_KEY =
    '__yolenPhase169RuntimeGuardInstalled'
  const SYNTHETIC_ATTRIBUTE =
    'data-yolen-phase16-9-attachment-message'
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

  const windowRef =
    root.window || root
  const documentRef =
    root.document ||
    windowRef?.document
  const MutationObserverRef =
    root.MutationObserver ||
    windowRef?.MutationObserver
  const NodeRef =
    root.Node ||
    windowRef?.Node

  if (
    !windowRef ||
    !documentRef ||
    windowRef[INSTALL_KEY] === true
  ) {
    return
  }

  // FASE 16.9 — retry manual de análise ("Tentar novamente") passou a ser
  // resolvido inteiramente pelo caminho canônico em yolen-api.js
  // (analyzeConversation/getAnalysisJobStatus), que já não condiciona a
  // intenção explícita do vendedor a messageDomRevision/captureRevision.
  // Este arquivo não precisa mais envolver analyzeConversation com um
  // wrapper próprio de retry — a responsabilidade dele aqui é só a
  // materialização de bubbles somente-anexo (PDF/documento) abaixo.

  function getTools() {
    return (
      root.YolenCompanionMessageMutations ||
      windowRef
        .YolenCompanionMessageMutations ||
      null
    )
  }

  function readText(element) {
    const tools = getTools()

    if (
      tools &&
      typeof tools
        .readCapturedElementText ===
        'function'
    ) {
      return tools
        .readCapturedElementText(
          element,
        )
    }

    return String(
      element?.innerText ||
      element?.textContent ||
      '',
    )
  }

  function normalizeRenderedText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u200e/g, '')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  function extractFileName(value) {
    const tools = getTools()
    const normalized =
      normalizeRenderedText(value)

    if (!normalized) {
      return null
    }

    if (
      tools &&
      typeof tools
        .extractAttachmentFileName ===
        'function'
    ) {
      const fromTools =
        tools.extractAttachmentFileName(
          normalized,
        )

      if (fromTools) {
        return fromTools
      }
    }

    const match =
      normalized.match(
        /([^\\/?<>:"|*]{1,180}\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|jpg|jpeg|png|webp|gif|heic|mp4|mov|avi|mp3|wav|ogg|m4a))(?=$|[\s)\],;])/i,
      )

    return match?.[1]?.trim() || null
  }

  function readFileNameFromBubble(
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
          extractFileName(
            element.getAttribute?.(
              attribute,
            ),
          )

        if (fileName) {
          return fileName
        }
      }
    }

    return extractFileName(
      readText(bubble),
    )
  }

  function parseDateFromPrePlainText(
    value,
  ) {
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

  function inferDateFromNeighbors(
    bubble,
  ) {
    if (!NodeRef) {
      return null
    }

    let precedingDate = null
    let followingDate = null

    const messages =
      Array.from(
        documentRef.querySelectorAll(
          MESSAGE_SELECTOR,
        ),
      ).filter((node) => {
        return (
          !bubble.contains?.(node) &&
          node.getAttribute?.(
            SYNTHETIC_ATTRIBUTE,
          ) !== 'true' &&
          !node.closest?.(
            QUOTED_SELECTOR,
          )
        )
      })

    for (const node of messages) {
      const date =
        parseDateFromPrePlainText(
          node.getAttribute?.(
            'data-pre-plain-text',
          ),
        )

      if (!date) {
        continue
      }

      const position =
        node.compareDocumentPosition?.(
          bubble,
        ) || 0

      if (
        position &
        NodeRef.DOCUMENT_POSITION_FOLLOWING
      ) {
        precedingDate = date
        continue
      }

      if (
        position &
        NodeRef.DOCUMENT_POSITION_PRECEDING
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

  function getAttachmentDescriptor(
    bubble,
  ) {
    const rawText = readText(bubble)
    const normalizedText =
      normalizeRenderedText(rawText)
    const fileName =
      readFileNameFromBubble(bubble)

    if (!fileName) {
      return null
    }

    const hasDocumentMarker =
      Boolean(
        bubble.querySelector?.(
          DOCUMENT_MARKER_SELECTOR,
        ),
      )

    const hasMetadata =
      /\b(?:pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|jpg|jpeg|png|webp|gif|heic|mp4|mov|avi|mp3|wav|ogg|m4a)\b/i.test(
        normalizedText,
      ) &&
      (
        /\b\d+(?:[.,]\d+)?\s*(?:bytes?|kb|kib|mb|mib|gb|gib)\b/i.test(
          normalizedText,
        ) ||
        /\b\d+\s*p[aá]ginas?\b/i.test(
          normalizedText,
        )
      )

    if (
      !hasDocumentMarker &&
      !hasMetadata
    ) {
      return null
    }

    const timeMatches =
      Array.from(
        normalizedText.matchAll(
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

  function materializeAttachmentOnlyBubble(
    bubble,
  ) {
    if (
      !bubble ||
      !bubble.matches?.(
        BUBBLE_SELECTOR,
      ) ||
      bubble.closest?.(
        QUOTED_SELECTOR,
      ) ||
      bubble.querySelector?.(
        `[${SYNTHETIC_ATTRIBUTE}="true"]`,
      ) ||
      bubble.querySelector?.(
        MESSAGE_SELECTOR,
      )
    ) {
      return false
    }

    const dataId =
      bubble.getAttribute?.('data-id')
        ?.trim()

    if (!dataId) {
      return false
    }

    const descriptor =
      getAttachmentDescriptor(bubble)
    const date =
      inferDateFromNeighbors(bubble)

    if (!descriptor || !date) {
      return false
    }

    const synthetic =
      documentRef.createElement('div')

    synthetic.setAttribute(
      SYNTHETIC_ATTRIBUTE,
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
      'data-id',
      dataId,
    )
    synthetic.setAttribute(
      'aria-hidden',
      'true',
    )
    synthetic.style.display = 'none'

    if (bubble.matches?.('.message-out')) {
      synthetic.classList.add(
        'message-out',
      )
    } else if (
      bubble.matches?.('.message-in')
    ) {
      synthetic.classList.add(
        'message-in',
      )
    }

    const evidence =
      documentRef.createElement('span')

    evidence.setAttribute(
      'data-testid',
      'selectable-text',
    )
    evidence.setAttribute(
      'data-yolen-attachment-evidence',
      'true',
    )
    evidence.setAttribute(
      'aria-hidden',
      'true',
    )
    evidence.textContent =
      `[Arquivo: ${descriptor.fileName}]`

    synthetic.appendChild(evidence)
    bubble.appendChild(synthetic)

    return true
  }

  function scanAttachmentOnlyBubbles(
    node = documentRef,
  ) {
    const element =
      node?.nodeType === 1
        ? node
        : node?.documentElement ||
          node?.parentElement

    if (!element) {
      return 0
    }

    const bubbles = []

    const direct =
      element.closest?.(
        BUBBLE_SELECTOR,
      )

    if (direct) {
      bubbles.push(direct)
    }

    if (
      element.matches?.(
        BUBBLE_SELECTOR,
      ) &&
      !bubbles.includes(element)
    ) {
      bubbles.push(element)
    }

    element
      .querySelectorAll?.(
        BUBBLE_SELECTOR,
      )
      .forEach((bubble) => {
        if (!bubbles.includes(bubble)) {
          bubbles.push(bubble)
        }
      })

    return bubbles.reduce(
      (count, bubble) =>
        count +
        (
          materializeAttachmentOnlyBubble(
            bubble,
          )
            ? 1
            : 0
        ),
      0,
    )
  }

  scanAttachmentOnlyBubbles(
    documentRef,
  )

  if (
    typeof MutationObserverRef ===
      'function' &&
    documentRef.documentElement
  ) {
    const observer =
      new MutationObserverRef(
        (mutations) => {
          mutations.forEach(
            (mutation) => {
              scanAttachmentOnlyBubbles(
                mutation.target,
              )

              mutation.addedNodes
                ?.forEach?.((node) => {
                  scanAttachmentOnlyBubbles(
                    node,
                  )
                })
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
          'aria-label',
          'data-icon',
          'data-testid',
          'download',
          'title',
        ],
      },
    )

    windowRef
      .__yolenPhase169AttachmentObserver =
      observer
  }

  Object.defineProperty(
    windowRef,
    INSTALL_KEY,
    {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    },
  )

  windowRef.YolenPhase169RuntimeGuard =
    Object.freeze({
      materializeAttachmentOnlyBubble,
      scanAttachmentOnlyBubbles,
    })
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
