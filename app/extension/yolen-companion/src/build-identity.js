;(function initYolenCompanionBuildIdentity(root) {
  // Identidade do pacote exibida no painel (versão + commit de origem).
  //
  // Este arquivo-fonte é a versão "source": carregado direto do repositório
  // (sem build), ele se identifica como tal. O build-package.mjs substitui o
  // conteúdo DENTRO do staging/zip pela identidade real e determinística do
  // pacote (versão do manifest, commit, fingerprint do código empacotado),
  // para que um Firefox/Chrome carregando um dist antigo seja reconhecível à
  // primeira vista. Nenhum dado sensível: só versão e hashes do código.
  const identity = Object.freeze({
    version: null,
    commit: null,
    commit_short: null,
    dirty: null,
    source_fingerprint: null,
    build_id: null,
    environment: 'source',
  })

  root.YolenCompanionBuildIdentity = identity
})(typeof globalThis !== 'undefined' ? globalThis : window)
