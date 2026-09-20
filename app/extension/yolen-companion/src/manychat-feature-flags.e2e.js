;(function initYolenManyChatFeatureFlagsE2E(root) {
  'use strict'

  // Fonte-de-flags EXCLUSIVA do canal de build E2E (STEP 2B.1). Nunca é
  // copiada com este nome de arquivo para dentro de um pacote — o build
  // E2E a substitui, dentro do staging, no MESMO pathname que o manifest
  // espera para o módulo de flags (src/manychat-feature-flags.js), no
  // lugar do arquivo normal (que permanece sempre false e nunca é editado
  // — ver src/manychat-feature-flags.js). dev e prod NUNCA leem este
  // arquivo: só o modo `--e2e` de build-package.mjs o seleciona, via
  // featureFlagSourceForEnvironment('e2e').
  //
  // A captura ligada é intencional e exclusiva deste arquivo. BUILD_CHANNEL
  // identifica o canal de build de forma explícita, para que qualquer
  // inspeção futura do objeto de flags em runtime (ex.: devtools) deixe
  // claro que esta não é uma instalação normal.
  //
  // Nenhum override de runtime: sem localStorage, sem chrome.storage, sem
  // query param, sem leitura de env da própria página. A página do
  // ManyChat não tem acesso a este closure, exatamente como no arquivo
  // normal — este módulo só muda QUAL valor está fixo, nunca COMO ele é
  // lido.
  const MANYCHAT_CAPTURE_ENABLED = true
  const BUILD_CHANNEL = 'e2e'

  const api = Object.freeze({
    MANYCHAT_CAPTURE_ENABLED,
    BUILD_CHANNEL,
  })

  root.YolenManyChatFeatureFlags = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
