;(function initYolenCompanion() {
  // Content script do WhatsApp: cria o ChannelAdapter do canal e entrega a
  // composição ao bootstrap compartilhado (companion-bootstrap.js), que
  // monta o Companion Core único com as ferramentas compartilhadas.
  const captureResilienceTools =
    globalThis
      .YolenCompanionCaptureResilience

  if (!captureResilienceTools) {
    throw new Error(
      'Módulos de resiliência da captura do Companion não carregados.',
    )
  }

  // ChannelAdapter do WhatsApp: toda leitura/escrita física da plataforma.
  const whatsAppAdapter =
    globalThis
      .YolenCompanionWhatsAppAdapter
      .create({
        normalizePrePlainText:
          captureResilienceTools
            .normalizeWhatsAppPrePlainText,
      })

  globalThis
    .YolenCompanionBootstrap
    .create({
      channelAdapter: whatsAppAdapter,
    })
    .start()
})()
