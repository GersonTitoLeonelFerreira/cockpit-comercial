# Changelog — Yolen Companion (extensão)

Este changelog cobre apenas mudanças de **empacotamento/release** da
extensão de navegador. Mudanças de funcionalidade (captura, enriquecimento
de lead, inteligência gerencial etc.) são versionadas junto do restante do
Companion e não repetidas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
A versão da extensão (`manifest.json` → `version`) permanece `1.0.0` até que
uma fase futura de release decida um esquema de versionamento próprio.

## [Não lançado] — D3: Separação DEV/PROD e Release Candidate de loja

### Adicionado

- `toProductionManifest(sourceManifest, targetName)` em `scripts/build-package.mjs`:
  transformação determinística DEV → PROD, aplicada em memória durante o
  build. `manifest.json` continua sendo a única fonte de desenvolvimento e
  nunca é editado. Remove `http://localhost:3000/*` de TODOS os campos onde
  aparece (`host_permissions`, cada `content_scripts[].matches`, cada
  `web_accessible_resources[].matches`), vincula `icons` aos PNGs já
  gerados, mantém só `background.service_worker` (Chrome, sem
  `browser_specific_settings`) ou só `background.scripts` +
  `browser_specific_settings.gecko.strict_min_version: "109.0"` (Firefox).
- O build agora gera **quatro** pacotes: `yolen-companion-<navegador>-v<versão>.zip`
  (dev, comportamento do D1 inalterado — mesmo SHA-256) e
  `yolen-companion-<navegador>-prod-v<versão>.zip` (prod, novo). Os pacotes
  dev nunca mudam de nome/local — só os prod são novos, para nunca serem
  confundidos.
- `tests/dev-prod-manifest-transform.test.mjs` (13 testes): prova que DEV
  continua com `localhost`, que PROD não tem `localhost` em nenhum campo
  (Chrome e Firefox), que o background fica exatamente correto por
  navegador, que os ícones estão declarados e são PNGs válidos, que o
  Firefox tem `strict_min_version`, que adulterar o manifest prod
  (reintroduzir `localhost`, remover um ícone, quebrar o background) sempre
  derruba a elegibilidade de loja, que dev e prod nunca são confundíveis, e
  que a allowlist de empacotamento continua coerente com `manifest.json`
  (prova indireta e permanente de que nenhum arquivo de runtime foi
  adicionado/removido — a prova direta de que nenhum byte de `src/` mudou
  nesta tarefa foi feita via `git diff` antes do commit, registrada no
  relatório de entrega do D3).
- Validador (`scripts/validate-release-candidate.mjs`) estendido: agora
  builda e inspeciona as quatro combinações navegador × ambiente. Para os
  pacotes prod, `STORE_ELIGIBLE_CANDIDATE` exige adicionalmente (nunca só a
  ausência de `localhost`): nenhum host/permissão inesperado em
  `host_permissions`/`permissions`, `icons` declarado e igual ao esperado,
  configuração do Firefox válida (ou ausência total de configuração do
  Firefox no Chrome), e o manifest do pacote sendo exatamente igual à
  transformação DEV → PROD prevista. Novas funções puras exportadas
  (`manifestHasDevHosts`, `manifestBackgroundMatches`, `manifestIconsMatch`,
  `manifestHostsAndPermissionsMatch`, `firefoxGeckoSettingsValid`,
  `manifestMatchesExpectedTransform`) evitam duplicar essa lógica entre o
  validador e os testes.
- CI: novo passo que lê `release-candidate-report.json` e responde
  explicitamente "Chrome PROD: ..." / "Firefox PROD: ...", falhando o job
  se qualquer um dos dois não estiver `STORE_ELIGIBLE_CANDIDATE`.

### Alterado

- `scripts/build-package.mjs`: `buildTarget` e `main()` agora iteram
  navegador × ambiente (`ENVIRONMENTS = ['dev', 'prod']`); exporta também
  `zipFileName`, `PRODUCTION_HOSTS`, `FIREFOX_STRICT_MIN_VERSION`. Pacotes
  dev continuam byte-idênticos aos gerados no D1/D2 (mesmo SHA-256).
- `README.md`: documenta a arquitetura DEV/PROD, a tabela de classificação
  por pacote, os quatro caminhos de instalação manual, e uma nova seção "O
  que ainda falta para publicação real" (conta de desenvolvedor nas lojas,
  assets de listagem, revisão manual da loja, decisão sobre o `gecko.id`
  atual — nada disso é automatizado por este diretório).

### Não incluído nesta fase

- `tests/final-release-manifest.test.mjs` não foi alterado — não era
  necessário para a separação DEV/PROD (a cobertura de PROD ficou inteira
  no novo arquivo de teste do D3), e alterá-lo sem necessidade correria o
  risco de enfraquecer garantias já existentes sobre o manifesto de
  desenvolvimento.
- `manifest.json`, `package.json`, `package-lock.json`, `.gitignore` e
  qualquer arquivo de `src/` continuam intocados.
- Publicação em Chrome Web Store ou AMO; qualquer deploy; qualquer merge
  na `main`.

## [Não lançado] — D2: Validação Automatizada de Release Candidate

### Adicionado

- `scripts/validate-release-candidate.mjs`: builda os dois pacotes do zero
  e valida deterministicamente, entre outros pontos: geração bem-sucedida,
  `manifest.json` válido, arquivos obrigatórios presentes e nenhum arquivo
  fora da allowlist, ausência de `tests/`/`.env`/source maps/artefatos
  indevidos, allowlist coerente com o manifest de origem, `background`
  adaptado corretamente por navegador (Chrome só `service_worker`, Firefox
  só `scripts`), versão consistente, ícones válidos nos tamanhos
  esperados, hashes de todo o conteúdo registrados, e limites de tamanho.
  Produz `dist/yolen-companion/release-candidate-report.json`.
- Classificação explícita do pacote em `BUILD_INVALID`,
  `INTERNAL_DEV_ONLY` ou `STORE_ELIGIBLE_CANDIDATE` — a presença de
  `localhost` nunca é tratada como falha técnica, mas também nunca
  autoriza publicação em loja. Hoje o resultado esperado é sempre
  `INTERNAL_DEV_ONLY`.
- `tests/validate-release-candidate.test.mjs`: testes determinísticos da
  lógica pura do validador (detecção de arquivos indevidos, limites de
  tamanho, classificação), incluindo uma trava de regressão que garante
  que o validador nunca se autoclassifica como elegível para loja enquanto
  `localhost` estiver presente.
- `.github/workflows/companion-extension-release.yml`: CI dedicado
  (Pull Request com filtro de caminho + `workflow_dispatch`) que instala
  dependências deterministicamente, roda `npm run test:companion`, builda
  os pacotes, roda o validador acima e `git diff --check`. Não publica em
  loja nem faz deploy — só anexa os artefatos ao próprio run para
  inspeção.

### Alterado

- `scripts/build-package.mjs`: refatorado para exportar as constantes e
  funções compartilhadas (allowlist, alvos, `getTargetZipEntries` etc.),
  para que o validador reutilize exatamente a mesma allowlist do build em
  vez de duplicá-la. Comportamento de build inalterado — os pacotes
  gerados continuam byte-idênticos aos do D1 (mesmo SHA-256).
- `README.md`: corrigida a afirmação sobre reprodutibilidade do `.zip` —
  o texto do D1 afirmava reprodutibilidade "entre execuções, máquinas e
  datas", o que não havia sido comprovado (o processo depende do binário
  externo `zip`, cujo comportamento entre implementações/SOs diferentes
  não foi testado). Agora o README afirma apenas o que está provado:
  reprodutibilidade byte-a-byte **no mesmo ambiente/implementação
  compatível** de `zip`; reprodutibilidade cross-machine fica marcada como
  não validada.

### Não incluído nesta fase (ver README, "Status do pacote")

- Separação definitiva entre manifesto de desenvolvimento e de produção
  (remoção de `http://localhost:3000/*` do pacote final).
- Vínculo dos ícones gerados ao campo `icons` do `manifest.json`.
- Qualquer mudança em `manifest.json`, `package.json`, `.gitignore` ou em
  `tests/final-release-manifest.test.mjs`.
- Publicação em Chrome Web Store ou AMO; qualquer deploy.

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
