# Yolen Companion — extensão de navegador

Assistente comercial da Yolen para WhatsApp Web (Chrome/Firefox, Manifest V3).

Este documento cobre apenas **empacotamento e release** da extensão. Não
descreve a lógica de negócio (captura de mensagens, enriquecimento de lead,
inteligência gerencial etc.), que vive em `src/` e é tratada por outras
frentes de trabalho.

## Status do pacote (D1 = interno/dev)

Os pacotes gerados por `scripts/build-package.mjs` hoje ainda são
**builds internos/dev**, não candidatos prontos para publicação nas lojas.
Em particular:

- `manifest.json` de origem inclui `http://localhost:3000/*` em
  `host_permissions`, `content_scripts` e `web_accessible_resources`, e o
  pacote herda isso sem alteração.
- Os ícones gerados (`assets/icons/icon-16.png`, `icon-32.png`,
  `icon-48.png`, `icon-128.png`) **ainda não estão referenciados** no
  `manifest.json` empacotado — ficam disponíveis no pacote para uso futuro,
  mas o campo `icons` do manifest não é escrito nesta fase.
- Não há `strict_min_version` (Firefox) nem validação de política de loja.

A separação definitiva entre configuração de desenvolvimento e de
distribuição oficial (remover `localhost` do pacote final, ligar os ícones
ao manifest, versionamento de release etc.) é escopo de uma fase futura
("D3") e depende de autorização própria antes de ser implementada.

## Estrutura de origem

```
app/extension/yolen-companion/
  manifest.json          # manifesto de desenvolvimento (não é alterado pelo build)
  assets/yolen-mark.png  # identidade visual (fonte única dos ícones gerados)
  src/                    # código-fonte carregado pelo manifest
  tests/                  # testes do Companion (nunca entra em pacote nenhum)
  scripts/
    build-package.mjs     # gera os pacotes Chrome e Firefox
    lib/png-resize.mjs    # redimensiona o PNG de origem sem dependências externas
```

## Como o empacotamento funciona

`scripts/build-package.mjs` **não copia a pasta inteira**. Ele mantém uma
allowlist explícita (`SHARED_RUNTIME_FILES` + `CHROME_ONLY_FILES`) com
exatamente os arquivos que `manifest.json` já declara como necessários em
runtime (`background`, `content_scripts`, `web_accessible_resources`). Como
resultado:

- `tests/`, qualquer arquivo `.env`, arquivo local ou artefato temporário
  **nunca são lidos** pelo script — não é um filtro de exclusão, é uma
  allowlist de inclusão, então esses arquivos não têm como entrar no pacote.
- Antes de copiar qualquer coisa, o script compara a allowlist com o que o
  `manifest.json` de fato referencia (`assertAllowlistMatchesManifest`). Se
  alguém adicionar um arquivo novo ao manifest sem atualizar a allowlist (ou
  vice-versa), o build falha alto em vez de gerar um pacote incompleto ou
  desatualizado silenciosamente.

### Adaptação de `background` por navegador

O `manifest.json` de desenvolvimento declara **os dois** formatos de
background ao mesmo tempo (truque de compatibilidade cruzada já existente e
coberto por `tests/final-release-manifest.test.mjs`):

```json
"background": {
  "scripts": ["src/capture-transport.js", "src/background.js"],
  "service_worker": "src/background-service-worker.js"
}
```

No pacote gerado, cada alvo recebe **apenas** a chave que seu navegador
entende — essa é a única adaptação de manifest feita nesta fase:

| Alvo    | Chave mantida               | Chave removida  |
|---------|------------------------------|-----------------|
| Chrome  | `background.service_worker`  | `background.scripts` |
| Firefox | `background.scripts`         | `background.service_worker` |

Nenhum outro campo do manifest (permissões, hosts, content_scripts,
web_accessible_resources, versão, nome, descrição) é alterado entre os
pacotes ou em relação ao `manifest.json` de origem.

### Ícones

Os ícones (`16`, `32`, `48`, `128` px) são gerados a partir do
`assets/yolen-mark.png` existente usando um redimensionador PNG próprio em
JavaScript puro (`scripts/lib/png-resize.mjs`, apenas `node:zlib`, sem
dependências novas). Não há redesenho: é um downscale por box-filter da
mesma arte já aprovada. Os arquivos ficam em `assets/icons/` dentro do
pacote, prontos para serem referenciados no manifest quando a fase de
distribuição oficial (D3) decidir wire isso.

### Reprodutibilidade

Todo arquivo copiado para o pacote recebe um timestamp fixo
(`2020-01-01T00:00:00Z`) antes de ser zipado, e a lista de arquivos passada
ao `zip` é sempre ordenada explicitamente. Isso garante que, para o mesmo
conteúdo de origem, o `.zip` gerado é **byte-idêntico entre execuções no
mesmo ambiente** (mesma máquina, mesma versão/implementação do binário
`zip`) — verificado automaticamente pelo validador de Release Candidate
(D2), que builda duas vezes e compara os SHA-256.

**O que ainda não está provado:** reprodutibilidade *entre máquinas ou
implementações diferentes* de `zip` (por exemplo, `zip` do Info-ZIP em uma
distro Linux vs. outra versão em macOS/Windows/CI) depende de detalhes de
formato (metadados de compressão, versão do "created by", etc.) que este
projeto ainda não testou nem comparou. Até que essa validação cross-machine
seja feita explicitamente, trate a reprodutibilidade como garantida
**dentro de um mesmo ambiente/pipeline** (ex.: sempre gerado pelo mesmo
runner de CI), não como uma garantia universal entre ambientes diferentes.

## Como gerar os pacotes

Pré-requisito: binário `zip` do sistema operacional (já presente em
ambientes Linux/macOS típicos; não é uma dependência npm nova).

```bash
node app/extension/yolen-companion/scripts/build-package.mjs
```

Saída (fora do controle de versão, em `dist/` na raiz do repositório — já
coberto pelo `.gitignore` existente):

```
dist/yolen-companion/
  yolen-companion-chrome-v<versão>.zip
  yolen-companion-firefox-v<versão>.zip
  build-summary.json        # SHA-256 e lista de arquivos de cada pacote
  chrome/staging/           # árvore descompactada usada para gerar o zip
  firefox/staging/
```

Este script não é registrado em `package.json` nesta fase (fora do escopo
autorizado) — rode-o diretamente com `node` como acima.

## Validação automatizada de Release Candidate (D2)

`scripts/validate-release-candidate.mjs` builda os dois pacotes do zero e
inspeciona byte a byte o resultado, aplicando verificações determinísticas:
pacote gerado, `manifest.json` válido, todos os arquivos obrigatórios
presentes e nenhum arquivo fora da allowlist, ausência de `tests/`, `.env`,
source maps ou outros artefatos indevidos, allowlist coerente com o
manifest de origem, `background` adaptado corretamente por navegador,
versão do pacote consistente, ícones válidos nos tamanhos esperados,
hashes de todo o conteúdo registrados, e limites de tamanho.

```bash
node app/extension/yolen-companion/scripts/validate-release-candidate.mjs
```

Saída: `dist/yolen-companion/release-candidate-report.json` (relatório
completo, com o resultado de cada verificação e o SHA-256 de cada arquivo
do pacote) e um resumo no terminal. O processo sai com código `1` se
qualquer verificação **técnica** falhar.

### Classificação do pacote

A presença de `http://localhost:3000/*` no pacote **nunca** é tratada como
falha técnica (é esperada nesta fase — ver "Status do pacote" acima), mas
também nunca autoriza publicação em loja. O validador sempre produz uma
das três classificações a seguir, nunca uma aprovação implícita:

| Classificação | Significa |
|---|---|
| `BUILD_INVALID` | Uma ou mais verificações técnicas falharam. Não é nem build interno válido. |
| `INTERNAL_DEV_ONLY` | Todas as verificações técnicas passaram, mas o pacote ainda contém `localhost`. É um **Release Candidate técnico**, válido para uso/teste interno, mas **não elegível para submissão à loja**. É o resultado esperado enquanto o D3 não for executado. |
| `STORE_ELIGIBLE_CANDIDATE` | Todas as verificações técnicas passaram e nenhum host de desenvolvimento foi detectado. Só deve ocorrer depois do D3. |

Hoje (D1/D2, antes do D3), o resultado esperado e correto é sempre
`INTERNAL_DEV_ONLY`.

### CI

`.github/workflows/companion-extension-release.yml` roda em Pull Request
(com filtro de caminho para `app/extension/yolen-companion/**` e o próprio
workflow) e via `workflow_dispatch`. Ele instala dependências de forma
determinística (`npm ci`), roda `npm run test:companion`, gera os pacotes,
roda o validador acima, roda `git diff --check`, e publica os `.zip` e os
relatórios como artefato do próprio workflow (não é publicação em loja nem
deploy — é só para inspeção/auditoria do run).

## Instalação manual para teste (não é distribuição oficial)

- **Chrome/Edge (MV3)**: `chrome://extensions` → "Modo do desenvolvedor" →
  "Carregar sem compactação" → aponte para `dist/yolen-companion/chrome/staging/`
  (ou descompacte o `.zip` correspondente).
- **Firefox**: `about:debugging#/runtime/this-firefox` → "Carregar
  extensão temporária" → selecione o `manifest.json` dentro de
  `dist/yolen-companion/firefox/staging/` (ou o `.zip` descompactado).

Essas instalações são temporárias/de desenvolvimento e não substituem o
processo de submissão oficial às lojas (Chrome Web Store / addons.mozilla.org),
que depende da separação dev/prod ainda não implementada (D3).
