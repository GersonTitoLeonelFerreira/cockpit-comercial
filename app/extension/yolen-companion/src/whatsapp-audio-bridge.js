;(function initYolenWhatsAppAudioBridge() {
    const MESSAGE_SOURCE = 'YOLEN_COMPANION_WHATSAPP_AUDIO_BRIDGE'
    const MAX_AUDIO_BYTES = 15 * 1024 * 1024
  
    if (window.__yolenWhatsAppAudioBridgeInstalled === true) {
      return
    }
  
    window.__yolenWhatsAppAudioBridgeInstalled = true
  
    const originalCreateObjectURL = URL.createObjectURL.bind(URL)

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
        cleanType === 'video/webm' ||
        cleanType === 'video/mp4' ||
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
  
      if (ascii.includes('ftyp')) {
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
  
      if (String(blob.type || '').toLowerCase() === 'video/webm') {
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
  
    async function publishAudioBlob(blob, objectUrl) {
        const shouldPublish = await isAudioBlob(blob)
    
        if (!shouldPublish) {
          return
        }
    
        window.__yolenCapturedAudioBlobs = [
          ...(window.__yolenCapturedAudioBlobs || []),
          {
            objectUrl,
            mimeType: blob.type || '',
            size: blob.size,
            capturedAt: Date.now(),
            blob,
          },
        ].slice(-12)
    
        window.postMessage(
          {
            source: MESSAGE_SOURCE,
            action: 'AUDIO_BLOB_CAPTURED',
            audio: {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              objectUrl,
              mimeType: blob.type || '',
              size: blob.size,
              capturedAt: Date.now(),
              blob,
            },
          },
          window.location.origin,
        )
      }
  
    URL.createObjectURL = function createYolenTrackedObjectURL(value) {
      const objectUrl = originalCreateObjectURL(value)
  
      if (value instanceof Blob) {
        publishAudioBlob(value, objectUrl)
      }
  
      return objectUrl
    }
  })()