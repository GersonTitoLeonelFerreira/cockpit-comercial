;(function initYolenManyChatAudioDispatchRuntime(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const MESSAGE_SELECTOR =
    '[data-test-id="chat-messages-list"] > div > div[data-title-at][data-title-offset-bottom][data-title]'
  const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
  const PROBE_HASH = '#yolen-audio-probe'
  const PROBE_BUTTON_ID = 'yolen-manychat-audio-probe'
  const PROBE_CYCLE_ID = '00000000-0000-4000-8000-000000000000'
  const PROBE_CHANNEL = 'whatsapp'

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function normalizeChannel(value) {
    const channel = requiredText(value)?.toLowerCase() || null
    return channel && CHANNEL_PATTERN.test(channel) ? channel : null
  }

  function dependency(name, method) {
    const api = root[name]
    if (!api || typeof api[method] !== 'function') {
      const error = new Error(`${name}.${method} indisponível.`)
      error.name = 'YolenManyChatAudioDispatchRuntimeError'
      error.code = 'DEPENDENCY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function extensionApi() {
    const api = root.browser ?? root.chrome
    if (!api?.runtime || typeof api.runtime.sendMessage !== 'function') {
      const error = new Error('runtime.sendMessage indisponível.')
      error.name = 'YolenManyChatAudioDispatchRuntimeError'
      error.code = 'EXTENSION_RUNTIME_UNAVAILABLE'
      throw error
    }
    return api
  }

  function getVisibleMessageNodes(documentRef) {
    if (!documentRef || typeof documentRef.querySelectorAll !== 'function') {
      return []
    }

    try {
      return Array.from(documentRef.querySelectorAll(MESSAGE_SELECTOR))
    } catch {
      return []
    }
  }

  async function sha256Hex(value, cryptoImpl = root.crypto) {
    const text = requiredText(value)
    if (!text || !cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
      return null
    }

    const Encoder = root.TextEncoder ?? TextEncoder
    const bytes = new Encoder().encode(text)
    const digest = await cryptoImpl.subtle.digest('SHA-256', bytes)

    return Array.from(new Uint8Array(digest))
      .map((item) => item.toString(16).padStart(2, '0'))
      .join('')
  }

  async function buildAudioCandidate(node) {
    const identityApi = dependency(
      'YolenManyChatMessageIdentity',
      'extractManyChatMessageIdentity',
    )
    const sourceApi = dependency(
      'YolenManyChatAudioSource',
      'extractManyChatAudioSource',
    )

    const identity = identityApi.extractManyChatMessageIdentity(node)
    const source = sourceApi.extractManyChatAudioSource(node)

    if (
      identity?.ready !== true ||
      identity?.message_key_eligible !== true ||
      !requiredText(identity?.native_message_id) ||
      source?.source_ready !== true ||
      source?.source_kind !== 'https' ||
      !requiredText(source?.source_url)
    ) {
      return null
    }

    const digest = await sha256Hex(identity.native_message_id)
    if (!digest) return null

    return Object.freeze({
      author_kind: identity.author_kind,
      direction: identity.direction,
      occurred_at: identity.occurred_at,
      audio_url: source.source_url,
      audio_target_key: `manychat:sha256:${digest}`,
      mime_type: source.mime_type ?? null,
      duration_seconds:
        typeof source.duration_seconds === 'number' &&
        Number.isFinite(source.duration_seconds)
          ? source.duration_seconds
          : null,
    })
  }

  async function findSingleAudioCandidate(documentRef) {
    const nodes = getVisibleMessageNodes(documentRef)
    const candidates = []

    for (const node of nodes) {
      const candidate = await buildAudioCandidate(node)
      if (candidate) candidates.push(candidate)
    }

    if (candidates.length !== 1) {
      return Object.freeze({
        ready: false,
        reason:
          candidates.length === 0
            ? 'validated_audio_message_not_found'
            : 'validated_audio_message_ambiguous',
        candidate_count: candidates.length,
        candidate: null,
      })
    }

    return Object.freeze({
      ready: true,
      reason: null,
      candidate_count: 1,
      candidate: candidates[0],
    })
  }

  function sendRuntimeMessage(message, api = extensionApi()) {
    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime.sendMessage(message)
    }

    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage(message, (response) => {
          const runtimeError = api.runtime.lastError
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Falha no runtime da extensão.'))
            return
          }
          resolve(response)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  function safeBackendView(result) {
    const data = isObject(result?.payload?.data) ? result.payload.data : null
    const text = typeof data?.text === 'string' ? data.text : null

    return Object.freeze({
      ok: result?.ok === true,
      status_code: Number(result?.statusCode) || 0,
      backend_ok: result?.payload?.ok === true,
      event_type: requiredText(data?.event_type),
      platform: requiredText(data?.platform),
      channel: requiredText(data?.channel),
      already_transcribed: data?.already_transcribed === true,
      transcription_present: Boolean(text),
      transcription_length: text?.length ?? 0,
      audio_size_bytes: Number(data?.audio_size_bytes) || 0,
      error_present: Boolean(requiredText(result?.payload?.error)),
      transport: isObject(result?.transport)
        ? result.transport
        : isObject(result?.payload?.transport)
          ? result.payload.transport
          : null,
      privacy: Object.freeze({
        raw_transcription_exposed: false,
        raw_audio_url_exposed: false,
        raw_native_message_id_exposed: false,
      }),
    })
  }

  async function dispatchCurrentAudio({
    cycle_id: cycleId,
    channel,
    audio_index: audioIndex = 0,
    document: documentRef = root.document,
  } = {}) {
    const normalizedCycleId = requiredText(cycleId)
    const normalizedChannel = normalizeChannel(channel)

    if (!normalizedCycleId) {
      return Object.freeze({
        ok: false,
        stage: 'request_validation',
        reason: 'cycle_id_required',
      })
    }

    if (!normalizedChannel) {
      return Object.freeze({
        ok: false,
        stage: 'request_validation',
        reason: 'channel_invalid',
      })
    }

    const selected = await findSingleAudioCandidate(documentRef)
    if (!selected.ready || !selected.candidate) {
      return Object.freeze({
        ok: false,
        stage: 'dom_evidence',
        reason: selected.reason,
        candidate_count: selected.candidate_count,
      })
    }

    const candidate = selected.candidate
    const result = await sendRuntimeMessage({
      source: 'YOLEN_COMPANION',
      action: 'TRANSCRIBE_MANYCHAT_AUDIO',
      payload: {
        audio_url: candidate.audio_url,
        cycle_id: normalizedCycleId,
        audio_target_key: candidate.audio_target_key,
        channel: normalizedChannel,
        audio_index:
          Number.isFinite(Number(audioIndex))
            ? Math.max(0, Math.floor(Number(audioIndex)))
            : 0,
      },
    })

    return Object.freeze({
      ok: result?.ok === true,
      stage: 'background_dispatch',
      reason: result?.ok === true ? null : 'background_dispatch_failed',
      candidate_count: 1,
      audio: Object.freeze({
        author_kind: candidate.author_kind,
        direction: candidate.direction,
        occurred_at_valid:
          typeof candidate.occurred_at === 'string' &&
          Number.isFinite(Date.parse(candidate.occurred_at)),
        mime_type: candidate.mime_type,
        duration_seconds: candidate.duration_seconds,
        target_key_scheme: 'manychat:sha256',
      }),
      backend: safeBackendView(result),
      privacy: Object.freeze({
        raw_audio_url_exposed: false,
        raw_native_message_id_exposed: false,
        raw_transcription_exposed: false,
      }),
    })
  }

  function probePassed(result) {
    return Boolean(
      result?.backend?.transport?.ready === true &&
      result?.backend?.status_code === 404 &&
      result?.backend?.error_present === true,
    )
  }

  function installDiagnosticProbe({
    window: windowRef = root.window,
    document: documentRef = root.document,
  } = {}) {
    if (
      !windowRef ||
      !documentRef?.body ||
      windowRef.location?.hash !== PROBE_HASH
    ) {
      return null
    }

    const existing = documentRef.getElementById?.(PROBE_BUTTON_ID)
    if (existing) return existing

    const button = documentRef.createElement('button')
    button.id = PROBE_BUTTON_ID
    button.type = 'button'
    button.textContent = 'Yolen · validar transporte de áudio'
    button.setAttribute('aria-label', 'Validar transporte de áudio ManyChat da Yolen')
    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483647',
      padding: '10px 14px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,.2)',
      background: '#111318',
      color: '#edf2f7',
      font: '600 12px/1.2 system-ui, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    })

    button.addEventListener('click', async (event) => {
      if (event.isTrusted !== true || button.disabled) return

      button.disabled = true
      button.textContent = 'Yolen · validando…'

      try {
        const result = await dispatchCurrentAudio({
          cycle_id: PROBE_CYCLE_ID,
          channel: PROBE_CHANNEL,
          document: documentRef,
        })

        button.dataset.yolenProbeResult = JSON.stringify(result)
        button.dataset.yolenProbePassed = probePassed(result) ? 'true' : 'false'
        button.textContent = probePassed(result)
          ? 'Yolen · transporte OK (404 esperado)'
          : `Yolen · falhou (${result?.backend?.status_code || result?.reason || 'erro'})`
      } catch (error) {
        const safe = {
          ok: false,
          stage: 'runtime_exception',
          reason: error?.code || 'runtime_exception',
        }
        button.dataset.yolenProbeResult = JSON.stringify(safe)
        button.dataset.yolenProbePassed = 'false'
        button.textContent = 'Yolen · falhou (runtime)'
      } finally {
        button.disabled = false
      }
    })

    documentRef.body.appendChild(button)
    return button
  }

  const api = Object.freeze({
    PLATFORM,
    MESSAGE_SELECTOR,
    PROBE_HASH,
    PROBE_BUTTON_ID,
    PROBE_CYCLE_ID,
    PROBE_CHANNEL,
    sha256Hex,
    findSingleAudioCandidate,
    dispatchCurrentAudio,
    probePassed,
    installDiagnosticProbe,
  })

  root.YolenManyChatAudioDispatchRuntime = api

  const runtimeWindow = root.window ?? root
  const runtimeDocument =
    root.document ?? runtimeWindow?.document ?? null

  const autoInstallDiagnosticProbe = () => {
    if (
      !runtimeDocument ||
      root.__YOLEN_MANYCHAT_AUDIO_DISPATCH_RUNTIME_INSTALLED__
    ) {
      return
    }

    const installed = installDiagnosticProbe({
      window: runtimeWindow,
      document: runtimeDocument,
    })

    if (installed) {
      root.__YOLEN_MANYCHAT_AUDIO_DISPATCH_RUNTIME_INSTALLED__ = true
    }
  }

  autoInstallDiagnosticProbe()

  if (
    !root.__YOLEN_MANYCHAT_AUDIO_DISPATCH_RUNTIME_INSTALLED__ &&
    typeof runtimeWindow?.addEventListener === 'function'
  ) {
    runtimeWindow.addEventListener(
      'hashchange',
      autoInstallDiagnosticProbe,
    )
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
