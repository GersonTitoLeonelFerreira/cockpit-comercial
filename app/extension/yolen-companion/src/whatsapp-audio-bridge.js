;(function initYolenWhatsAppAudioBridge() {
    const MESSAGE_SOURCE = 'YOLEN_COMPANION_WHATSAPP_AUDIO_BRIDGE'
    const CONTENT_SCRIPT_SOURCE = 'YOLEN_COMPANION_CONTENT_SCRIPT'
    const MAX_AUDIO_BYTES = 15 * 1024 * 1024
    const CAPTURE_REQUEST_TIMEOUT_MS = 8000
  
    if (window.__yolenWhatsAppAudioBridgeInstalled === true) {
      return
    }
  
    window.__yolenWhatsAppAudioBridgeInstalled = true
  
    const originalCreateObjectURL = URL.createObjectURL.bind(URL)
    const originalMediaPlay = HTMLMediaElement.prototype.play
  
    let activeCaptureRequest = null
  
    const captureInFlightRequestIds = new Set()
    const completedCaptureRequestIds = new Set()
  
    function getActiveCaptureRequest() {
      if (!activeCaptureRequest) {
        return null
      }
  
      if (activeCaptureRequest.expiresAt <= Date.now()) {
        activeCaptureRequest = null
        return null
      }
  
      return activeCaptureRequest
    }
  
    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return
      }
  
      if (event.origin !== window.location.origin) {
        return
      }
  
      if (event.data?.source !== CONTENT_SCRIPT_SOURCE) {
        return
      }
  
      if (
        event.data?.action === 'CAPTURE_NEXT_AUDIO' &&
        typeof event.data?.requestId === 'string'
      ) {
        activeCaptureRequest = {
          requestId: event.data.requestId,
          targetKey: event.data.targetKey || null,
          expiresAt: Date.now() + CAPTURE_REQUEST_TIMEOUT_MS,
        }
  
        return
      }
  
      if (
        event.data?.action === 'CAPTURE_FINISHED' &&
        activeCaptureRequest?.requestId === event.data?.requestId
      ) {
        activeCaptureRequest = null
      }
    })
  
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        action: 'BRIDGE_READY',
        installedAt: Date.now(),
      },
      window.location.origin,
    )
  
    function isPotentialAudioMimeType(type) {
      const cleanType = String(type || '').toLowerCase()
  
      return (
        cleanType.startsWith('audio/') ||
        cleanType === 'application/octet-stream' ||
        cleanType === ''
      )
    }
  
    function isSupportedAudioHeader(bytes) {
      if (!bytes || bytes.length < 4) {
        return false
      }
  
      const ascii = Array.from(bytes)
        .map((byte) => String.fromCharCode(byte))
        .join('')
  
      if (ascii.startsWith('OggS')) {
        return true
      }
  
      if (ascii.startsWith('RIFF')) {
        return true
      }
  
      if (
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      ) {
        return true
      }
  
      if (ascii.startsWith('ID3')) {
        return true
      }
  
      return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
    }
  
    async function isAudioBlob(blob) {
      if (!(blob instanceof Blob)) {
        return false
      }
  
      if (!blob.size || blob.size > MAX_AUDIO_BYTES) {
        return false
      }
  
      if (!isPotentialAudioMimeType(blob.type)) {
        return false
      }
  
      if (String(blob.type || '').toLowerCase().startsWith('audio/')) {
        return true
      }
  
      try {
        const headerBuffer = await blob.slice(0, 16).arrayBuffer()
        const headerBytes = new Uint8Array(headerBuffer)
  
        return isSupportedAudioHeader(headerBytes)
      } catch {
        return false
      }
    }
  
    async function publishAudioBlob(
      blob,
      objectUrl,
      captureRequestId = null,
    ) {
      if (
        captureRequestId &&
        completedCaptureRequestIds.has(captureRequestId)
      ) {
        return false
      }
  
      const shouldPublish = await isAudioBlob(blob)
  
      if (!shouldPublish) {
        return false
      }
  
      const capturedAt = Date.now()
  
      window.__yolenCapturedAudioBlobs = [
        ...(window.__yolenCapturedAudioBlobs || []),
        {
          objectUrl,
          mimeType: blob.type || '',
          size: blob.size,
          capturedAt,
          captureRequestId,
          blob,
        },
      ].slice(-12)
  
      window.postMessage(
        {
          source: MESSAGE_SOURCE,
          action: 'AUDIO_BLOB_CAPTURED',
          audio: {
            id: `${capturedAt}-${Math.random().toString(16).slice(2)}`,
            objectUrl,
            mimeType: blob.type || '',
            size: blob.size,
            capturedAt,
            captureRequestId,
            blob,
          },
        },
        window.location.origin,
      )
  
      if (captureRequestId) {
        completedCaptureRequestIds.add(captureRequestId)
      }
  
      return true
    }
  
    function getMediaElementSource(mediaElement) {
      const directSource =
        mediaElement.currentSrc ||
        mediaElement.src ||
        ''
  
      if (directSource) {
        return directSource
      }
  
      const sourceElement = mediaElement.querySelector?.('source[src]')
  
      return (
        sourceElement?.src ||
        sourceElement?.getAttribute?.('src') ||
        ''
      )
    }
  
    async function waitForMediaElementSource(mediaElement) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const source = getMediaElementSource(mediaElement)
  
        if (source) {
          return source
        }
  
        await new Promise((resolve) => {
          window.setTimeout(resolve, 100)
        })
      }
  
      return ''
    }
  
    async function captureAudioFromMediaElement(
      mediaElement,
      captureRequestId,
    ) {
      if (!captureRequestId) {
        return
      }
  
      if (completedCaptureRequestIds.has(captureRequestId)) {
        return
      }
  
      if (captureInFlightRequestIds.has(captureRequestId)) {
        return
      }
  
      if (!(mediaElement instanceof HTMLMediaElement)) {
        return
      }
  
      if (mediaElement.tagName.toLowerCase() !== 'audio') {
        return
      }
  
      captureInFlightRequestIds.add(captureRequestId)
  
      try {
        const source = await waitForMediaElementSource(mediaElement)
  
        if (!source) {
          return
        }
  
        const response = await fetch(source, {
          credentials: 'include',
        })
  
        if (!response.ok) {
          return
        }
  
        const blob = await response.blob()
  
        await publishAudioBlob(
          blob,
          source,
          captureRequestId,
        )
      } catch {
        // O content-script exibirá a falha caso nenhum arquivo seja capturado.
      } finally {
        captureInFlightRequestIds.delete(captureRequestId)
      }
    }
  
    function captureCurrentRequestFromMediaElement(mediaElement) {
      const captureRequest = getActiveCaptureRequest()
  
      if (!captureRequest) {
        return
      }
  
      captureAudioFromMediaElement(
        mediaElement,
        captureRequest.requestId,
      )
    }
  
    HTMLMediaElement.prototype.play = function yolenTrackedMediaPlay(
      ...args
    ) {
      const result = originalMediaPlay.apply(this, args)
  
      captureCurrentRequestFromMediaElement(this)
  
      return result
    }
  
    document.addEventListener(
      'play',
      (event) => {
        captureCurrentRequestFromMediaElement(event.target)
      },
      true,
    )
  
    URL.createObjectURL = function createYolenTrackedObjectURL(value) {
      const objectUrl = originalCreateObjectURL(value)
  
      if (value instanceof Blob) {
        /*
         * Blobs capturados genericamente ficam sem requestId.
         * Somente o elemento <audio> que realmente iniciou a reprodução
         * recebe o requestId da solicitação atual.
         */
        publishAudioBlob(value, objectUrl, null)
      }
  
      return objectUrl
    }
  })()