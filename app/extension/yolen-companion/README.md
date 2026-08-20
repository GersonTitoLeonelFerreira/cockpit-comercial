# Yolen Companion — extensão de navegador

Assistente comercial da Yolen para WhatsApp Web (Chrome/Firefox, Manifest V3).

Este documento cobre apenas **empacotamento e release** da extensão. Não
descreve a lógica de negócio (captura de mensagens, enriquecimento de lead,
inteligência gerencial etc.), que vive em `src/` e é tratada por outras
frentes de trabalho.

## Status do pacote (D3 = dois ambientes, ainda não publicado)

`scripts/build-package.mjs` gera **dois ambientes por navegador** — quatro
pacotes no total:

| Pacote | Contém `localhost`? | `icons` vinculado? | Classificação típica |
|---|---|---|---|
| `yolen-companion-chrome-v<versão>.zip` (dev) | sim | não | `INTERNAL_DEV_ONLY` |
| `yolen-companion-chrome-prod-v<versão>.zip` (prod) | não | sim | `STORE_ELIGIBLE_CANDIDATE` |
| `yolen-companion-firefox-v<versão>.zip` (dev) | sim | não | `INTERNAL_DEV_ONLY` |
| `yolen-companion-firefox-prod-v<versão>.zip` (prod) | não | sim | `STORE_ELIGIBLE_CANDIDATE` |

**`manifest.json` continua sendo a única fonte de desenvolvimento e nunca é
editado por nenhum script desta pasta.** Os pacotes `dev` usam exatamente o
que ele declara (com a mesma adaptação de `background` por navegador desde
o D1). Os pacotes `prod` passam por uma transformação determinística em
memória (`toProductionManifest()`, em `scripts/build-package.mjs`) que:

- remove `http://localhost:3000/*` de **todos** os campos onde ele aparece
  (`host_permissions`, cada `content_scripts[].matches`, cada
  `web_accessible_resources[].matches`);
- vincula `icons` aos PNGs já gerados a partir de `assets/yolen-mark.png`;
- para Chrome: mantém só `background.service_worker` e remove
  `browser_specific_settings` (é específico de Gecko/Safari, não faz
  sentido num pacote Chrome);
- para Firefox: mantém só `background.scripts` e adiciona
  `browser_specific_settings.gecko.strict_min_version` (ver justificativa
  técnica na seção "Ícones e ajustes específicos de navegador" abaixo).

**`STORE_ELIGIBLE_CANDIDATE` (pacotes prod) significa "tecnicamente pronto
para submissão" — não significa que a extensão foi publicada ou aprovada
pela Chrome Web Store / AMO.** Isso ainda depende de passos fora do escopo
deste repositório (conta de desenvolvedor, revisão manual da loja, assets
de listagem como screenshots e descrição longa, etc.).

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

Em todo pacote gerado (dev ou prod), cada alvo recebe **apenas** a chave de
`background` que seu navegador entende:

| Alvo    | Chave mantida               | Chave removida  |
|---------|------------------------------|-----------------|
| Chrome  | `background.service_worker`  | `background.scripts` |
| Firefox | `background.scripts`         | `background.service_worker` |

Nos pacotes **dev**, nenhum outro campo do manifest é alterado em relação
ao `manifest.json` de origem (comportamento inalterado desde o D1). Nos
pacotes **prod**, além do `background`, mudam exatamente os campos
descritos na seção anterior (hosts, `icons`, `browser_specific_settings`) —
nada além disso.

### Ícones e ajustes específicos de navegador

Os ícones (`16`, `32`, `48`, `128` px) são gerados a partir do
`assets/yolen-mark.png` existente usando um redimensionador PNG próprio em
JavaScript puro (`scripts/lib/png-resize.mjs`, apenas `node:zlib`, sem
dependências novas). Não há redesenho: é um downscale por box-filter da
mesma arte já aprovada. Os arquivos ficam em `assets/icons/` dentro de
**todo** pacote (dev e prod), mas só o manifest **prod** os referencia via
`icons`.

**`strict_min_version` do Firefox (`109.0`)**: é a primeira versão do
Firefox com suporte estável (fora de flag) a Manifest V3 —
`content_scripts`, `host_permissions`, `web_accessible_resources` no
formato de objeto (`resources` + `matches`) e `background.scripts` como
event page não persistente, exatamente o que este manifest usa. Nenhuma
API declarada aqui (a extensão só pede a permissão `storage`) exige uma
versão mais nova. Essa chave só é adicionada aos pacotes **prod** do
Firefox — o Firefox dev continua sem ela, como antes do D3.

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
  yolen-companion-chrome-v<versão>.zip         # dev — inclui localhost, sem icons
  yolen-companion-chrome-prod-v<versão>.zip    # prod — sem localhost, icons vinculados
  yolen-companion-firefox-v<versão>.zip        # dev
  yolen-companion-firefox-prod-v<versão>.zip   # prod
  build-summary.json        # SHA-256, ambiente e lista de arquivos de cada pacote
  chrome/staging/           # árvore descompactada do pacote dev do Chrome
  chrome/prod/staging/      # árvore descompactada do pacote prod do Chrome
  firefox/staging/
  firefox/prod/staging/
```

Este script não é registrado em `package.json` nesta fase (fora do escopo
autorizado) — rode-o diretamente com `node` como acima.

## Validação automatizada de Release Candidate (D2/D3)

`scripts/validate-release-candidate.mjs` builda os quatro pacotes do zero e
inspeciona byte a byte cada um, aplicando verificações determinísticas:
pacote gerado, `manifest.json` válido, todos os arquivos obrigatórios
presentes e nenhum arquivo fora da allowlist, ausência de `tests/`, `.env`,
source maps ou outros artefatos indevidos, allowlist coerente com o
manifest de origem, `background` adaptado corretamente por navegador,
versão do pacote consistente, ícones válidos nos tamanhos esperados, hashes
de todo o conteúdo registrados, e limites de tamanho — e, só para os
pacotes **prod**: ausência total de `localhost` em qualquer campo,
`host_permissions`/`permissions` sem nada além do esperado em produção,
`icons` declarado e igual ao esperado, configuração específica do Firefox
válida (ou ausência total de configuração do Firefox no Chrome), e o
manifest do pacote sendo **exatamente igual** à transformação DEV → PROD
prevista (nenhuma diferença não documentada).

```bash
node app/extension/yolen-companion/scripts/validate-release-candidate.mjs
```

Saída: `dist/yolen-companion/release-candidate-report.json` (relatório
completo, com o resultado de cada verificação e o SHA-256 de cada arquivo,
por combinação `<navegador>-<ambiente>`) e um resumo no terminal. O
processo sai com código `1` se qualquer verificação **técnica** falhar em
qualquer uma das quatro combinações.

### Classificação do pacote

A presença de `http://localhost:3000/*` num pacote **nunca** é, por si só,
tratada como falha técnica nem como aprovação — ela é só um dos fatores que
compõem a classificação. `STORE_ELIGIBLE_CANDIDATE` exige TODAS as
verificações técnicas daquela combinação passando (o que já inclui a
ausência de localhost, `icons` corretos, background correto e configuração
de navegador válida) — nunca só "não achei localhost". O validador sempre
produz uma das três classificações a seguir, por combinação
navegador × ambiente, nunca uma aprovação implícita:

| Classificação | Significa |
|---|---|
| `BUILD_INVALID` | Uma ou mais verificações técnicas falharam. Não é nem build interno válido. |
| `INTERNAL_DEV_ONLY` | Todas as verificações técnicas daquela combinação passaram, mas o pacote ainda contém `localhost`. É o resultado esperado e correto para os pacotes **dev** — um Release Candidate técnico válido para uso/teste interno, mas **não elegível para submissão à loja**. |
| `STORE_ELIGIBLE_CANDIDATE` | Todas as verificações técnicas passaram e nenhum host de desenvolvimento foi detectado. É o resultado esperado e correto para os pacotes **prod**. Significa tecnicamente preparado para submissão — **não** que a extensão foi publicada ou aprovada pela loja. |

Hoje (depois do D3), o resultado esperado e correto é: `chrome`/`firefox`
**dev** → `INTERNAL_DEV_ONLY`; `chrome`/`firefox` **prod** →
`STORE_ELIGIBLE_CANDIDATE`. Qualquer outro resultado indica regressão.

### CI

`.github/workflows/companion-extension-release.yml` roda em Pull Request
(com filtro de caminho para `app/extension/yolen-companion/**` e o próprio
workflow) e via `workflow_dispatch`. Ele instala dependências de forma
determinística (`npm ci`), roda `npm run test:companion`, gera os quatro
pacotes, roda o validador acima, checa explicitamente que
`chrome-prod`/`firefox-prod` estão como `STORE_ELIGIBLE_CANDIDATE` no
relatório (falhando o job se não estiverem), roda `git diff --check`, e
publica os `.zip` e os relatórios como artefato do próprio workflow (não é
publicação em loja nem deploy — é só para inspeção/auditoria do run).

## Instalação manual para teste (não é distribuição oficial)

Use os pacotes **dev** para testar contra `localhost:3000` durante
desenvolvimento; use os pacotes **prod** para conferir visualmente o
resultado que iria para a loja (ícones aparecendo, sem acesso a
`localhost`).

- **Chrome/Edge (MV3)**: `chrome://extensions` → "Modo do desenvolvedor" →
  "Carregar sem compactação" → aponte para `dist/yolen-companion/chrome/staging/`
  (dev) ou `dist/yolen-companion/chrome/prod/staging/` (prod) — ou
  descompacte o `.zip` correspondente.
- **Firefox**: `about:debugging#/runtime/this-firefox` → "Carregar
  extensão temporária" → selecione o `manifest.json` dentro de
  `dist/yolen-companion/firefox/staging/` (dev) ou
  `dist/yolen-companion/firefox/prod/staging/` (prod) — ou o `.zip`
  descompactado.

Essas instalações são temporárias/de desenvolvimento e não substituem o
processo de submissão oficial às lojas (Chrome Web Store / addons.mozilla.org)
— ver "O que ainda falta para publicação real" abaixo.

## O que ainda falta para publicação real

Os pacotes `prod` são `STORE_ELIGIBLE_CANDIDATE` — tecnicamente prontos
para submissão — mas publicar de verdade ainda depende de coisas fora do
escopo deste repositório/dos scripts de build:

- conta de desenvolvedor na Chrome Web Store e na AMO (Firefox), com as
  taxas/verificação de identidade que cada loja exige;
- assets de listagem que os scripts não geram: screenshots, descrição
  longa, categoria, política de privacidade pública;
- decisão sobre o `browser_specific_settings.gecko.id` atual
  (`yolen-companion@gerson.local`) — funciona tecnicamente no AMO, mas é
  uma decisão de identidade/domínio que vale confirmar antes da submissão
  oficial;
- revisão manual da loja (Chrome Web Store e AMO revisam manualmente antes
  de aprovar uma extensão nova — isso não é algo que se automatiza aqui);
- decisão de versionamento de release (a versão do manifest permanece
  `1.0.0` neste momento) e de processo de assinatura/upload nas duas
  lojas.

Nada disso está implementado ou automatizado ainda — é decisão e execução
do Controle Mestre, fora do escopo de build/validação que este diretório
cobre.
