/* global module */

;(function initYolenCompanionMessageMutations(root) {
  const MAX_CAPTURED_MESSAGE_LENGTH = 100000
  const MAX_ANALYSIS_MESSAGE_LENGTH = 4000
  const ATTACHMENT_EVIDENCE_ATTRIBUTE =
    'data-yolen-attachment-evidence'
  const ATTACHMENT_MESSAGE_SELECTOR =
    '[data-pre-plain-text]'
  const ATTACHMENT_SCOPE_BOUNDARY_SELECTOR =
    'main, [role="application"], #app'
  const MAX_ATTACHMENT_SCOPE_ANCESTOR_DEPTH = 6
  const ATTACHMENT_MARKER_SELECTOR = [
    'a[download]',
    '[download]',
    '[data-testid*="document" i]',
    '[data-testid*="attachment" i]',
    '[data-icon*="document" i]',
    '[data-icon*="download" i]',
  ].join(',')
  const SELECTABLE_MESSAGE_TEXT_SELECTOR = [
    '[data-testid="selectable-text"]',
    'span.selectable-text.copyable-text',
  ].join(',')
  const QUOTED_MESSAGE_SELECTOR = [
    '[data-testid*="quoted" i]',
    '[data-testid*="reply" i]',
    '[aria-label*="quoted" i]',
    '[aria-label*="mensagem citada" i]',
    '[aria-label*="resposta" i]',
  ].join(',')
  const ATTACHMENT_FILE_EXTENSION_PATTERN =
    '(?:pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|jpg|jpeg|png|webp|gif|heic|mp4|mov|avi|mp3|wav|ogg|m4a)'
  const ATTACHMENT_FILE_NAME_PATTERN =
    new RegExp(
      `([^\\/\n\r?<>:"|*]{1,180}\.${ATTACHMENT_FILE_EXTENSION_PATTERN})(?=$|[\s)\],;])`,
      'i',
    )

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u200e/g, '')
      .split('\n')
      .map((line) => {
        return line
          .replace(/[ \t\f\v]+/g, ' ')
          .trim()
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  function readCapturedElementText(
    element,
  ) {
    if (!element) {
      return ''
    }

    const renderedText =
      typeof element.innerText ===
      'string'
        ? element.innerText
        : ''

    if (renderedText.trim()) {
      return renderedText
    }

    if (
      typeof element.cloneNode ===
      'function'
    ) {
      const clone =
        element.cloneNode(true)

      clone
        .querySelectorAll?.('br')
        .forEach((lineBreak) => {
          lineBreak.replaceWith?.(
            '\n',
          )
        })

      if (
        typeof clone.textContent ===
        'string'
      ) {
        return clone.textContent
      }
    }

    return typeof element.textContent ===
      'string'
      ? element.textContent
      : ''
  }

  function cleanCapturedMessageText(value) {
    const text = normalizeText(value)

    if (
      !text ||
      /^(\d{1,2}:\d{2}\s*)+$/.test(text)
    ) {
      return ''
    }

    return text.slice(
      0,
      MAX_CAPTURED_MESSAGE_LENGTH,
    )
  }

  function prepareCapturedMessageTextForAnalysis(
    value,
  ) {
    return cleanCapturedMessageText(
      value,
    ).slice(
      0,
      MAX_ANALYSIS_MESSAGE_LENGTH,
    )
  }

  function pickCapturedMessageText(
    candidates,
  ) {
    if (!Array.isArray(candidates)) {
      return ''
    }

    const normalizedCandidates =
      candidates
        .map((candidate) => {
          if (
            typeof candidate ===
            'string'
          ) {
            return {
              text:
                cleanCapturedMessageText(
                  candidate,
                ),
              isQuoted: false,
            }
          }

          return {
            text:
              cleanCapturedMessageText(
                candidate?.text,
              ),
            isQuoted:
              candidate?.isQuoted ===
              true,
          }
        })
        .filter((candidate) => {
          return (
            !candidate.isQuoted &&
            candidate.text
          )
        })

    if (
      normalizedCandidates.length === 0
    ) {
      return ''
    }

    const uniqueTexts =
      Array.from(
        new Set(
          normalizedCandidates.map(
            (candidate) =>
              candidate.text,
          ),
        ),
      )

    uniqueTexts.sort(
      (first, second) =>
        second.length - first.length,
    )

    return uniqueTexts[0] || ''
  }

  function buildStableCaptureConversationKey(
    {
      phone,
      title,
    } = {},
  ) {
    const normalizedPhone =
      String(phone || '')
        .replace(/\D/g, '')

    if (
      normalizedPhone.length >= 10 &&
      normalizedPhone.length <= 15
    ) {
      return `phone:${normalizedPhone}`
    }

    const normalizedTitle =
      normalizeText(title)
        .toLocaleLowerCase('pt-BR')
        .slice(0, 200)

    return normalizedTitle
      ? `title:${normalizedTitle}`
      : null
  }

  function inferCapturedMessageDirection(
    {
      hasOutgoingClass = false,
      hasIncomingClass = false,
      dataId = '',
      messageLeft,
      messageWidth,
      conversationLeft,
      conversationWidth,
    } = {},
  ) {
    if (hasOutgoingClass) {
      return 'outgoing'
    }

    if (hasIncomingClass) {
      return 'incoming'
    }

    const normalizedDataId =
      String(dataId || '')

    if (
      normalizedDataId.startsWith(
        'true_',
      ) ||
      normalizedDataId.includes(
        '_true_',
      )
    ) {
      return 'outgoing'
    }

    if (
      normalizedDataId.startsWith(
        'false_',
      ) ||
      normalizedDataId.includes(
        '_false_',
      )
    ) {
      return 'incoming'
    }

    const geometry = [
      messageLeft,
      messageWidth,
      conversationLeft,
      conversationWidth,
    ].map(Number)

    if (
      geometry.every(
        Number.isFinite,
      ) &&
      geometry[1] > 0 &&
      geometry[3] > 0
    ) {
      const messageCenter =
        geometry[0] +
        geometry[1] / 2

      const conversationCenter =
        geometry[2] +
        geometry[3] / 2

      return messageCenter >
        conversationCenter
        ? 'outgoing'
        : 'incoming'
    }

    return 'incoming'
  }

  function isDeletedMessageText(value) {
    const text = normalizeText(
      value,
    ).toLowerCase()

    if (!text) {
      return false
    }

    return [
      'mensagem apagada',
      'esta mensagem foi apagada',
      'você apagou esta mensagem',
      'this message was deleted',
      'you deleted this message',
    ].some((deletedText) =>
      text.includes(deletedText),
    )
  }

  function cleanAttachmentFileName(
    value,
  ) {
    return String(value || '')
      .replace(
        /^(?:download|baixar|arquivo|documento)(?:\s*[:\-]\s*|\s+)/i,
        '',
      )
      .trim()
  }

  function extractAttachmentFileName(
    value,
  ) {
    const normalized =
      normalizeText(value)

    if (!normalized) {
      return null
    }

    const decoded = (() => {
      try {
        return decodeURIComponent(
          normalized,
        )
      } catch {
        return normalized
      }
    })()

    const pathTail = decoded
      .split(/[\\/]/)
      .pop()
      ?.trim()

    const candidates = [
      pathTail,
      decoded,
    ].filter(Boolean)

    for (const candidate of candidates) {
      const exactMatch =
        candidate.match(
          new RegExp(
            `^(.{1,180}\.${ATTACHMENT_FILE_EXTENSION_PATTERN})$`,
            'i',
          ),
        )

      if (exactMatch?.[1]) {
        return cleanAttachmentFileName(
          exactMatch[1],
        )
      }

      const embeddedMatch =
        candidate.match(
          ATTACHMENT_FILE_NAME_PATTERN,
        )

      if (embeddedMatch?.[1]) {
        return cleanAttachmentFileName(
          embeddedMatch[1],
        )
      }
    }

    return null
  }

  function collectAttachmentMessageNodes(
    node,
  ) {
    if (!node || node.nodeType !== 1) {
      return []
    }

    const messageNodes = []

    if (
      node.matches?.(
        ATTACHMENT_MESSAGE_SELECTOR,
      )
    ) {
      messageNodes.push(node)
    }

    node
      .querySelectorAll?.(
        ATTACHMENT_MESSAGE_SELECTOR,
      )
      .forEach((messageNode) => {
        if (!messageNodes.includes(messageNode)) {
          messageNodes.push(messageNode)
        }
      })

    return messageNodes
  }

  function findUniqueAttachmentMessageNode(
    node,
  ) {
    if (!node || node.nodeType !== 1) {
      return null
    }

    const directOwner =
      node.closest?.(
        ATTACHMENT_MESSAGE_SELECTOR,
      )

    if (directOwner) {
      return directOwner
    }

    let current = node

    for (
      let depth = 0;
      current &&
      depth <=
        MAX_ATTACHMENT_SCOPE_ANCESTOR_DEPTH;
      depth += 1
    ) {
      if (
        depth > 0 &&
        current.matches?.(
          ATTACHMENT_SCOPE_BOUNDARY_SELECTOR,
        )
      ) {
        return null
      }

      const messageNodes =
        collectAttachmentMessageNodes(
          current,
        )

      if (messageNodes.length === 1) {
        return messageNodes[0]
      }

      if (messageNodes.length > 1) {
        return null
      }

      current = current.parentElement
    }

    return null
  }

  function findAttachmentScopeForMessage(
    messageNode,
  ) {
    if (
      !messageNode ||
      messageNode.nodeType !== 1
    ) {
      return messageNode
    }

    let scope = messageNode
    let current = messageNode

    for (
      let depth = 0;
      current &&
      depth <=
        MAX_ATTACHMENT_SCOPE_ANCESTOR_DEPTH;
      depth += 1
    ) {
      if (
        depth > 0 &&
        current.matches?.(
          ATTACHMENT_SCOPE_BOUNDARY_SELECTOR,
        )
      ) {
        break
      }

      const messageNodes =
        collectAttachmentMessageNodes(
          current,
        )

      if (messageNodes.length > 1) {
        break
      }

      if (
        messageNodes.length === 1 &&
        messageNodes[0] === messageNode
      ) {
        scope = current
      }

      current = current.parentElement
    }

    return scope
  }

  function readAttachmentOnlyText(
    scope,
  ) {
    if (!scope?.cloneNode) {
      return ''
    }

    const clone = scope.cloneNode(true)

    clone
      .querySelectorAll?.(
        SELECTABLE_MESSAGE_TEXT_SELECTOR,
      )
      .forEach((element) => {
        element.remove?.()
      })

    clone
      .querySelectorAll?.(
        QUOTED_MESSAGE_SELECTOR,
      )
      .forEach((element) => {
        element.remove?.()
      })

    clone
      .querySelectorAll?.(
        `[${ATTACHMENT_EVIDENCE_ATTRIBUTE}]`,
      )
      .forEach((element) => {
        element.remove?.()
      })

    return readCapturedElementText(
      clone,
    )
  }

  function findAttachmentFileName(
    messageNode,
  ) {
    if (!messageNode?.querySelector) {
      return null
    }

    const scope =
      findAttachmentScopeForMessage(
        messageNode,
      )

    if (!scope?.querySelectorAll) {
      return null
    }

    const marker = Array.from(
      scope.querySelectorAll(
        ATTACHMENT_MARKER_SELECTOR,
      ),
    ).find((element) => {
      return !element.closest?.(
        QUOTED_MESSAGE_SELECTOR,
      )
    })

    const attributeElements =
      scope.querySelectorAll?.(
        [
          '[download]',
          '[title]',
          '[aria-label]',
        ].join(','),
      ) || []

    for (const element of attributeElements) {
      if (
        element.closest?.(
          QUOTED_MESSAGE_SELECTOR,
        )
      ) {
        continue
      }

      const owningMessage =
        element.closest?.(
          ATTACHMENT_MESSAGE_SELECTOR,
        )

      if (
        owningMessage &&
        owningMessage !== messageNode
      ) {
        continue
      }

      const isSelectableText =
        Boolean(
          element.closest?.(
            SELECTABLE_MESSAGE_TEXT_SELECTOR,
          ),
        )

      if (
        !marker &&
        isSelectableText &&
        !element.hasAttribute?.(
          'download',
        )
      ) {
        continue
      }

      const attributeCandidates = [
        element.getAttribute?.(
          'download',
        ),
        element.getAttribute?.(
          'title',
        ),
        element.getAttribute?.(
          'aria-label',
        ),
      ]

      for (
        const candidate of
        attributeCandidates
      ) {
        const fileName =
          extractAttachmentFileName(
            candidate,
          )

        if (fileName) {
          return fileName
        }
      }
    }

    const attachmentOnlyFileName =
      extractAttachmentFileName(
        readAttachmentOnlyText(
          scope,
        ),
      )

    if (attachmentOnlyFileName) {
      return attachmentOnlyFileName
    }

    if (!marker) {
      return null
    }

    const rendered =
      readCapturedElementText(
        scope,
      )

    return extractAttachmentFileName(
      rendered,
    )
  }

  function getNonQuotedSelectableText(
    messageNode,
  ) {
    if (!messageNode?.querySelectorAll) {
      return ''
    }

    const parts = []

    messageNode
      .querySelectorAll(
        SELECTABLE_MESSAGE_TEXT_SELECTOR,
      )
      .forEach((element) => {
        if (
          element.hasAttribute?.(
            ATTACHMENT_EVIDENCE_ATTRIBUTE,
          ) ||
          element.closest?.(
            QUOTED_MESSAGE_SELECTOR,
          )
        ) {
          return
        }

        const text =
          cleanCapturedMessageText(
            readCapturedElementText(
              element,
            ),
          )

        if (text) {
          parts.push(text)
        }
      })

    return Array.from(
      new Set(parts),
    ).join('\n')
  }

  function materializeAttachmentEvidence(
    messageNode,
  ) {
    if (
      !messageNode ||
      messageNode.nodeType !== 1
    ) {
      return false
    }

    const scope =
      findAttachmentScopeForMessage(
        messageNode,
      )

    const fileName =
      findAttachmentFileName(
        messageNode,
      )

    const existingEvidence =
      messageNode.querySelector?.(
        `[${ATTACHMENT_EVIDENCE_ATTRIBUTE}]`,
      )

    if (!fileName) {
      existingEvidence?.remove?.()
      return false
    }

    const baseText =
      getNonQuotedSelectableText(
        scope,
      )

    const evidenceText = [
      baseText,
      `[Arquivo: ${fileName}]`,
    ]
      .filter(Boolean)
      .join('\n')

    if (
      existingEvidence?.textContent ===
      evidenceText
    ) {
      return false
    }

    const evidence =
      existingEvidence ||
      messageNode.ownerDocument
        ?.createElement?.('span')

    if (!evidence) {
      return false
    }

    evidence.setAttribute(
      ATTACHMENT_EVIDENCE_ATTRIBUTE,
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
    evidence.style.display = 'none'
    evidence.textContent = evidenceText

    if (!existingEvidence) {
      messageNode.appendChild(evidence)
    }

    return true
  }

  function scanAttachmentEvidenceRoot(
    node,
  ) {
    if (!node || node.nodeType !== 1) {
      return 0
    }

    const messageNodes =
      collectAttachmentMessageNodes(
        node,
      )

    const owner =
      node.closest?.(
        ATTACHMENT_MESSAGE_SELECTOR,
      )

    if (
      owner &&
      !messageNodes.includes(owner)
    ) {
      messageNodes.push(owner)
    }

    const relatedMessage =
      findUniqueAttachmentMessageNode(
        node,
      )

    if (
      relatedMessage &&
      !messageNodes.includes(
        relatedMessage,
      )
    ) {
      messageNodes.push(
        relatedMessage,
      )
    }

    return messageNodes.reduce(
      (count, messageNode) => {
        return (
          count +
          (materializeAttachmentEvidence(
            messageNode,
          )
            ? 1
            : 0)
        )
      },
      0,
    )
  }

  function installAttachmentEvidenceAdapter(
    target = root,
  ) {
    const document =
      target?.document

    const MutationObserverClass =
      target?.MutationObserver

    if (
      !document?.documentElement ||
      typeof MutationObserverClass !==
        'function'
    ) {
      return null
    }

    const installationKey =
      '__yolenAttachmentEvidenceAdapter'

    if (target[installationKey]) {
      return target[installationKey]
    }

    scanAttachmentEvidenceRoot(
      document.documentElement,
    )

    const observer =
      new MutationObserverClass(
        (mutations) => {
          mutations.forEach(
            (mutation) => {
              scanAttachmentEvidenceRoot(
                mutation.target,
              )

              mutation.addedNodes
                ?.forEach?.((addedNode) => {
                  scanAttachmentEvidenceRoot(
                    addedNode,
                  )
                })
            },
          )
        },
      )

    observer.observe(
      document.documentElement,
      {
        attributes: true,
        attributeFilter: [
          'aria-label',
          'data-icon',
          'data-testid',
          'download',
          'title',
        ],
        childList: true,
        subtree: true,
      },
    )

    const installedState = {
      observer,
      scan() {
        return scanAttachmentEvidenceRoot(
          document.documentElement,
        )
      },
    }

    Object.defineProperty(
      target,
      installationKey,
      {
        configurable: false,
        enumerable: false,
        value: installedState,
        writable: false,
      },
    )

    return installedState
  }

  function areCapturedMessagesEqual(
    currentMessage,
    nextMessage,
  ) {
    if (!currentMessage || !nextMessage) {
      return false
    }

    return (
      currentMessage.id ===
        nextMessage.id &&
      currentMessage.timestampMs ===
        nextMessage.timestampMs &&
      currentMessage.timestampLabel ===
        nextMessage.timestampLabel &&
      currentMessage.dateKey ===
        nextMessage.dateKey &&
      currentMessage.direction ===
        nextMessage.direction &&
      currentMessage.sender ===
        nextMessage.sender &&
      currentMessage.text ===
        nextMessage.text &&
      currentMessage.hasAudio ===
        nextMessage.hasAudio
    )
  }

  function getLatestDateMessageBlock(
    messages,
    limit = 80,
  ) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return []
    }

    const latestMessage =
      messages[messages.length - 1]

    const latestDateKey =
      latestMessage?.dateKey ||
      latestMessage?.date_key ||
      null

    const latestMessages =
      latestDateKey
        ? messages.filter((message) => {
            return (
              message?.dateKey ===
                latestDateKey ||
              message?.date_key ===
                latestDateKey
            )
          })
        : messages

    return latestMessages.slice(
      -Math.max(1, Number(limit) || 80),
    )
  }

  function buildFingerprint(value) {
    const text = String(value || '')
      .replace(/\r\n/g, '\n')
      .trim()

    let hash = 2166136261

    for (
      let index = 0;
      index < text.length;
      index += 1
    ) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return `${text.length}:${(
      hash >>> 0
    ).toString(16)}`
  }

  function buildMessageSnapshotFingerprint(
    messages,
    deletedMessageIds = [],
  ) {
    const messageLines = Array.isArray(
      messages,
    )
      ? messages.map((message) => {
          return [
            message?.id || '',
            message?.timestamp_ms ??
              message?.timestampMs ??
              '',
            message?.direction || '',
            message?.text || '',
            message?.audio_transcription ||
              '',
            message?.has_audio ??
              message?.hasAudio ??
              false,
          ].join('|')
        })
      : []

    const deletedLines = Array.from(
      deletedMessageIds || [],
    )
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .sort()
      .map((id) => `deleted|${id}`)

    const source = [
      ...messageLines,
      ...deletedLines,
    ].join('\n')

    if (source.length < 15) {
      return null
    }

    return buildFingerprint(source)
  }

  // Blocker 2 (Fase 12A, Frente 2B, re-auditoria do Controle Mestre):
  // a antiga findSafeDisappearedMessageIds() foi removida. Ela tentava
  // inferir exclusão a partir do desaparecimento de um elemento do DOM
  // (rolagem/virtualização do WhatsApp Web), mas isso nunca prova
  // exclusão real — o único sinal confiável é o marcador explícito de
  // exclusão do próprio WhatsApp (isDeletedMessageText). Uma mensagem
  // que só sai da consulta atual do DOM permanece ativa e intocada.

  const api = Object.freeze({
    areCapturedMessagesEqual,
    buildMessageSnapshotFingerprint,
    buildStableCaptureConversationKey,
    cleanCapturedMessageText,
    extractAttachmentFileName,
    findAttachmentFileName,
    getLatestDateMessageBlock,
    inferCapturedMessageDirection,
    installAttachmentEvidenceAdapter,
    isDeletedMessageText,
    materializeAttachmentEvidence,
    pickCapturedMessageText,
    prepareCapturedMessageTextForAnalysis,
    readCapturedElementText,
    scanAttachmentEvidenceRoot,
  })

  root.YolenCompanionMessageMutations =
    api

  if (
    root?.document &&
    typeof root?.MutationObserver ===
      'function'
  ) {
    installAttachmentEvidenceAdapter(
      root,
    )
  }

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
