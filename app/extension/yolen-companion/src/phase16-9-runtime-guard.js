;(function initPhase169RuntimeGuard(root) {
  const INSTALL_KEY =
    '__yolenPhase169RuntimeGuardInstalled'
  const SYNTHETIC_ATTRIBUTE =
    'data-yolen-phase16-9-attachment-message'
  const ANALYSIS_CONTINUITY_ATTRIBUTE =
    'data-yolen-analysis-continuity-view'
  const ANALYSIS_CONTINUITY_KEY_ATTRIBUTE =
    'data-yolen-analysis-continuity-key'
  const MESSAGE_SELECTOR =
    '[data-pre-plain-text]'
  const BUBBLE_SELECTOR =
    '.message-in, .message-out, [data-id], [role="row"]'
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
  // O guard é carregado antes do content-script no manifest. Se o PDF já
  // estiver visível no momento do bootstrap, materializá-lo imediatamente
  // pode acontecer antes de observeWhatsAppChanges() existir; nesse caso o
  // nó sintético fica correto no DOM, mas nenhuma ingestão é rearmada.
  // A pequena defasagem deixa o content-script concluir seu bootstrap antes
  // da primeira materialização sem atrasar attachments que chegam depois.
  const INITIAL_ATTACHMENT_SCAN_DELAY_MS = 250

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
  // resolvido inteiramente pelo caminho canônico em yolen-api.js para jobs
  // failed/succeeded. Existe, porém, um estado terminal diferente:
  // `superseded`. O endpoint normal é idempotente por watermark e devolve o
  // MESMO superseded para sempre; o yolen-api canônico não o reabre porque
  // reexecutar o requested_at antigo seria causalmente incorreto. O wrapper
  // abaixo trata SOMENTE esse beco sem saída e pede ao backend um refresh
  // explícito, que cria uma nova identidade/corte causal. Não duplica a regra
  // de retry de failed/succeeded.
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
      windowRef.browser?.runtime ||
      windowRef.chrome?.runtime ||
      null
    )
  }

  function installSupersededManualRefresh() {
    const api =
      root.YolenCompanionApi ||
      windowRef.YolenCompanionApi

    if (
      !api ||
      typeof api.analyzeConversation !== 'function' ||
      api.analyzeConversation
        .__yolenPhase169SupersededRefreshWrapped === true
    ) {
      return false
    }

    const original =
      api.analyzeConversation.bind(api)

    async function analyzeConversationWithSupersededRefresh(
      payload,
    ) {
      const result =
        await original(payload)

      const deepAnalysis =
        result?.payload?.data?.deep_analysis

      if (
        payload?.force_reanalysis !== true ||
        !deepAnalysis?.analysis_job_id ||
        deepAnalysis.status !== 'superseded'
      ) {
        return result
      }

      const runtime =
        getCompanionRuntime()

      if (!runtime?.sendMessage) {
        return result
      }

      let refreshedResult = null

      try {
        refreshedResult =
          await runtime.sendMessage({
            source:
              'YOLEN_COMPANION',
            action:
              'RETRY_ANALYSIS_JOB',
            baseUrl:
              typeof api.getBaseUrl ===
                'function'
                ? api.getBaseUrl()
                : undefined,
            payload: {
              analysis_job_id:
                deepAnalysis.analysis_job_id,
              // O backend interpreta allow_succeeded=true como intenção
              // explícita de refresh de um estado terminal. Para
              // superseded ele NÃO reabre a fotografia antiga: cria um
              // novo job com requested_at atual.
              allow_succeeded:
                true,
            },
          })
      } catch {
        return result
      }

      const refreshed =
        refreshedResult?.payload?.data

      if (
        refreshedResult?.ok !== true ||
        refreshedResult?.payload?.ok !== true ||
        !refreshed?.analysis_job_id ||
        !(
          refreshed.status === 'queued' ||
          refreshed.status === 'running'
        )
      ) {
        return result
      }

      result.payload.data.deep_analysis = {
        ...deepAnalysis,
        analysis_job_id:
          refreshed.analysis_job_id,
        status:
          refreshed.status,
        message_watermark:
          refreshed.message_watermark ||
          deepAnalysis.message_watermark,
      }

      return result
    }

    Object.defineProperty(
      analyzeConversationWithSupersededRefresh,
      '__yolenPhase169SupersededRefreshWrapped',
      {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      },
    )

    api.analyzeConversation =
      analyzeConversationWithSupersededRefresh

    return true
  }

  // Há uma responsabilidade seller-facing distinta: uma tentativa nova pode
  // falhar enquanto já existe AnalysisViewModel canônico e persistido para a
  // mesma conversa. A continuidade abaixo preserva essa última leitura sem
  // falsificar o resultado da tentativa nova.
  let latestAnalysisViewRequestKey = null
  let cachedAnalysisView = null

  function getAnalysisViewRequestKey(payload) {
    const cycleId =
      typeof payload?.cycle_id === 'string'
        ? payload.cycle_id.trim()
        : ''
    const conversationKey =
      typeof payload?.conversation_key === 'string'
        ? payload.conversation_key.trim()
        : ''

    if (!cycleId || !conversationKey) {
      return null
    }

    return `${cycleId}::${conversationKey}`
  }

  function getSellerInformationViewTools() {
    return (
      root.YolenCompanionSellerInformationView ||
      windowRef.YolenCompanionSellerInformationView ||
      null
    )
  }

  function installAnalysisViewModelContinuity() {
    const api =
      root.YolenCompanionApi ||
      windowRef.YolenCompanionApi

    if (
      !api ||
      typeof api.loadAnalysisViewModel !== 'function' ||
      api.loadAnalysisViewModel
        .__yolenPhase169ContinuityWrapped === true
    ) {
      return false
    }

    const original =
      api.loadAnalysisViewModel.bind(api)

    async function loadAnalysisViewModelWithContinuity(
      payload,
    ) {
      const requestKey =
        getAnalysisViewRequestKey(payload)

      if (requestKey) {
        latestAnalysisViewRequestKey =
          requestKey
      }

      const result =
        await original(payload)

      const data =
        result?.payload?.data

      if (
        requestKey &&
        requestKey ===
          latestAnalysisViewRequestKey &&
        result?.ok === true &&
        result?.payload?.ok === true &&
        data &&
        typeof data === 'object'
      ) {
        cachedAnalysisView = {
          key: requestKey,
          data,
        }

        Promise.resolve().then(() => {
          reconcileAnalysisViewModelContinuity()
        })
      }

      return result
    }

    Object.defineProperty(
      loadAnalysisViewModelWithContinuity,
      '__yolenPhase169ContinuityWrapped',
      {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      },
    )

    api.loadAnalysisViewModel =
      loadAnalysisViewModelWithContinuity

    return true
  }

  function reconcileAnalysisViewModelContinuity() {
    if (
      !cachedAnalysisView ||
      cachedAnalysisView.key !==
        latestAnalysisViewRequestKey
    ) {
      return false
    }

    const errorNode =
      documentRef.querySelector?.(
        '[data-yolen-seller-panel="analysis"] [data-yolen-analysis-error]',
      )

    if (!errorNode) {
      return false
    }

    const card =
      errorNode.closest?.(
        '.yolen-card',
      )

    if (!card) {
      return false
    }

    if (
      card.getAttribute?.(
        ANALYSIS_CONTINUITY_KEY_ATTRIBUTE,
      ) === cachedAnalysisView.key &&
      card.querySelector?.(
        `[${ANALYSIS_CONTINUITY_ATTRIBUTE}="true"]`,
      )
    ) {
      return false
    }

    const viewTools =
      getSellerInformationViewTools()

    if (
      !viewTools ||
      typeof viewTools.renderAnalysisViewModel !==
        'function'
    ) {
      return false
    }

    const rendered =
      viewTools.renderAnalysisViewModel(
        cachedAnalysisView.data,
      )

    if (
      typeof rendered !== 'string' ||
      !rendered.trim()
    ) {
      return false
    }

    card
      .querySelectorAll?.(
        `[${ANALYSIS_CONTINUITY_ATTRIBUTE}="true"]`,
      )
      .forEach((node) => node.remove())

    errorNode.style.display = 'none'
    errorNode.setAttribute(
      'aria-hidden',
      'true',
    )

    const continuity =
      documentRef.createElement('div')

    continuity.setAttribute(
      ANALYSIS_CONTINUITY_ATTRIBUTE,
      'true',
    )

    const warning =
      documentRef.createElement('div')

    warning.className =
      'yolen-operational-note yolen-status-warning'
    warning.setAttribute(
      'data-yolen-analysis-refresh-warning',
      'true',
    )
    warning.setAttribute(
      'role',
      'status',
    )
    warning.textContent =
      'A última atualização da análise não foi concluída. Exibindo a última leitura comercial válida.'

    const content =
      documentRef.createElement('div')

    content.setAttribute(
      'data-yolen-analysis-canonical-view',
      'true',
    )
    content.innerHTML = rendered

    continuity.appendChild(warning)
    continuity.appendChild(content)

    const actions =
      card.querySelector?.(
        '.yolen-inline-actions',
      )

    if (actions) {
      card.insertBefore(
        continuity,
        actions,
      )
    } else {
      card.appendChild(
        continuity,
      )
    }

    card.setAttribute(
      ANALYSIS_CONTINUITY_KEY_ATTRIBUTE,
      cachedAnalysisView.key,
    )

    return true
  }

  installSupersededManualRefresh()
  installAnalysisViewModelContinuity()

  function getTools() {
    return (
      root.YolenCompanionMessageMutations ||
      windowRef.YolenCompanionMessageMutations ||
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

    // Firefox/WhatsApp nem sempre expõe o nome em title/download. Lê cada
    // nó textual relevante separadamente antes de cair para o texto agregado;
    // isso evita perder nomes quando a UI quebra visualmente o filename em
    // múltiplos elementos/linhas.
    const textCandidates = [
      bubble,
      ...Array.from(
        bubble.querySelectorAll(
          'span, div',
        ),
      ),
    ]

    for (const element of textCandidates) {
      if (
        element !== bubble &&
        element.closest?.(
          QUOTED_SELECTOR,
        )
      ) {
        continue
      }

      const fileName =
        extractFileName(
          readText(element),
        )

      if (fileName) {
        return fileName
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

  function getBubbleDataId(
    bubble,
  ) {
    if (!bubble) {
      return null
    }

    const owner =
      bubble.matches?.('[data-id]')
        ? bubble
        : bubble.closest?.('[data-id]') ||
          bubble.querySelector?.('[data-id]')

    return (
      owner
        ?.getAttribute?.('data-id')
        ?.trim() ||
      null
    )
  }

  function inferBubbleDirection(
    bubble,
    dataId,
  ) {
    const hasOutgoingClass =
      Boolean(
        bubble.matches?.('.message-out') ||
        bubble.closest?.('.message-out') ||
        bubble.querySelector?.('.message-out'),
      )

    const hasIncomingClass =
      Boolean(
        bubble.matches?.('.message-in') ||
        bubble.closest?.('.message-in') ||
        bubble.querySelector?.('.message-in'),
      )

    const tools = getTools()

    if (
      tools &&
      typeof tools
        .inferCapturedMessageDirection ===
        'function'
    ) {
      return tools.inferCapturedMessageDirection({
        hasOutgoingClass,
        hasIncomingClass,
        dataId:
          dataId || '',
      })
    }

    if (hasOutgoingClass) {
      return 'outgoing'
    }

    if (hasIncomingClass) {
      return 'incoming'
    }

    if (
      String(dataId || '')
        .startsWith('true_') ||
      String(dataId || '')
        .includes('_true_')
    ) {
      return 'outgoing'
    }

    return 'incoming'
  }

  function materializeAttachmentOnlyBubble(
    bubble,
  ) {
    const mainConversation =
      documentRef.querySelector?.('#main')

    if (
      !bubble ||
      !bubble.matches?.(
        BUBBLE_SELECTOR,
      ) ||
      (
        mainConversation &&
        !mainConversation.contains?.(
          bubble,
        )
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
      getBubbleDataId(
        bubble,
      )

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

    const direction =
      inferBubbleDirection(
        bubble,
        dataId,
      )

    const synthetic =
      documentRef.createElement('div')

    synthetic.setAttribute(
      SYNTHETIC_ATTRIBUTE,
      'true',
    )
    synthetic.setAttribute(
      'data-pre-plain-text',
      `[${descriptor.time}, ${date}] ${
        direction === 'outgoing'
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

    synthetic.classList.add(
      direction === 'outgoing'
        ? 'message-out'
        : 'message-in',
    )

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

  function runInitialRuntimeReconciliation() {
    scanAttachmentOnlyBubbles(
      documentRef,
    )
    reconcileAnalysisViewModelContinuity()
  }

  if (
    typeof windowRef.setTimeout ===
      'function'
  ) {
    windowRef.setTimeout(
      runInitialRuntimeReconciliation,
      INITIAL_ATTACHMENT_SCAN_DELAY_MS,
    )
  } else {
    runInitialRuntimeReconciliation()
  }

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

          reconcileAnalysisViewModelContinuity()
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
      installSupersededManualRefresh,
      installAnalysisViewModelContinuity,
      reconcileAnalysisViewModelContinuity,
      materializeAttachmentOnlyBubble,
      scanAttachmentOnlyBubbles,
    })
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
