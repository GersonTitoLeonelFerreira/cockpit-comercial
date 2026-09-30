;(function initYolenCompanionEnvironment(root) {
  // Configuração canônica do canal: backend e origens da Yolen
  // autorizadas. Esta fonte versionada é o canal dev; cada pacote
  // (prod, homolog, e2e) recebe este arquivo GERADO por
  // scripts/build-package.mjs. Nunca edite para apontar outro backend:
  // o build falha se esta fonte divergir do canal dev.
  const config = {
    "channel": "dev",
    "api_base_url": "https://cockpit-comercial-vocn.vercel.app",
    "allowed_base_urls": [
      "https://cockpit-comercial-vocn.vercel.app",
      "http://localhost:3000"
    ],
    "backend_match_required": false
  }

  root.YolenCompanionEnvironment = Object.freeze({
    ...config,
    allowed_base_urls: Object.freeze([...config.allowed_base_urls]),
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
