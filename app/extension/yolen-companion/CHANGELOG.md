# Changelog — Yolen Companion (extensão)

Este changelog cobre apenas mudanças de **empacotamento/release** da
extensão de navegador. Mudanças de funcionalidade (captura, enriquecimento
de lead, inteligência gerencial etc.) são versionadas junto do restante do
Companion e não repetidas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
A versão da extensão (`manifest.json` → `version`) permanece `1.0.0` até que
uma fase futura de release decida um esquema de versionamento próprio.

## [Não lançado] — D1: Fundação isolada de Release Engineering

### Adicionado

- `scripts/build-package.mjs`: empacotamento reproduzível da extensão para
  Chrome e Firefox, a partir de uma allowlist explícita de arquivos de
  runtime (nenhum arquivo de `tests/`, `.env`, local ou temporário pode
  entrar no pacote).
- `scripts/lib/png-resize.mjs`: redimensionador de PNG em JavaScript puro
  (sem dependências novas), usado para gerar os tamanhos de ícone
  (16/32/48/128) a partir de `assets/yolen-mark.png` sem redesenhar a
  identidade visual.
- `README.md`: documentação do processo de build/release da extensão.
- Saídas de build passam a existir em `dist/yolen-companion/` (raiz do
  repositório, já fora do controle de versão).

### Não incluído nesta fase (ver README, "Status do pacote")

- Separação definitiva entre manifesto de desenvolvimento e de produção
  (remoção de `http://localhost:3000/*` do pacote final).
- Vínculo dos ícones gerados ao campo `icons` do `manifest.json`.
- Validador automático de Release Candidate.
- Workflow de CI para build/validação da extensão.
- Qualquer mudança em `manifest.json`, `package.json`, `.gitignore` ou em
  `tests/final-release-manifest.test.mjs`.
