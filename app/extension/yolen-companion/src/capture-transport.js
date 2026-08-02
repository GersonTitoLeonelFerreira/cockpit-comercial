;(function initYolenCompanionCaptureTransport(root, factory) {
    const api = factory()

    if (typeof module !== 'undefined' && module.exports) {
      module.exports = api
    }

    root.YolenCompanionCaptureTransport = api
  })(typeof globalThis !== 'undefined' ? globalThis : this, function createCaptureTransport() {
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    function isRecord(value) {
      return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      )
    }

    function isUuid(value) {
      return (
        typeof value === 'string' &&
        UUID_PATTERN.test(value.trim())
      )
    }

    function formatUuidBytes(bytes) {
      const hexadecimal = Array.from(bytes, (value) => {
        return value.toString(16).padStart(2, '0')
      }).join('')

      return [
        hexadecimal.slice(0, 8),
        hexadecimal.slice(8, 12),
        hexadecimal.slice(12, 16),
        hexadecimal.slice(16, 20),
        hexadecimal.slice(20, 32),
      ].join('-')
    }

    function createDeviceKey(cryptoApi = globalThis.crypto) {
      if (typeof cryptoApi?.randomUUID === 'function') {
        const generated = cryptoApi.randomUUID()

        if (isUuid(generated)) {
          return generated.toLowerCase()
        }
      }

      if (typeof cryptoApi?.getRandomValues !== 'function') {
        throw new Error(
          'Gerador criptográfico indisponível para criar o identificador da instalação.',
        )
      }

      const bytes = new Uint8Array(16)

      cryptoApi.getRandomValues(bytes)

      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80

      const generated = formatUuidBytes(bytes)

      if (!isUuid(generated)) {
        throw new Error(
          'Não foi possível criar um identificador válido para a instalação.',
        )
      }

      return generated.toLowerCase()
    }

    function buildIngestionRequestBody(payload, deviceKey) {
      if (!isRecord(payload)) {
        throw new Error(
          'O conteúdo da ingestão precisa ser um objeto.',
        )
      }

      if (!isUuid(deviceKey)) {
        throw new Error(
          'O identificador da instalação é inválido.',
        )
      }

      return {
        ...payload,
        device_key: deviceKey.trim().toLowerCase(),
      }
    }

    return {
      isUuid,
      createDeviceKey,
      buildIngestionRequestBody,
    }
  })
