#!/usr/bin/env node
// Empacotamento reproduzível do Yolen Companion para Chrome e Firefox.
//
// Escopo (D1 — Fundação isolada de Release Engineering):
//   - Copia, a partir de uma allowlist EXPLÍCITA, somente os arquivos que o
//     manifest.json já declara como necessários em runtime.
//   - Nunca faz `cp -r`/glob da pasta da extensão: `tests/`, arquivos locais,
//     `.env` e qualquer artefato temporário são estruturalmente impossíveis
//     de entrar no pacote, porque nunca são lidos por este script.
//   - Gera os tamanhos de ícone (16/32/48/128) a partir do
//     assets/yolen-mark.png existente, sem redesenhar a identidade visual.
//
// Escopo (D3 — Separação DEV/PROD e Release Candidate de loja):
//   - `manifest.json` continua sendo a ÚNICA fonte de verdade de
//     desenvolvimento — nunca é editado por este script. Toda a diferença
//     entre DEV e PROD acontece em memória, em `toProductionManifest()`,
//     durante o build.
//   - Cada navegador agora gera DOIS pacotes: `dev` (comportamento do D1,
//     inalterado — ainda inclui `localhost:3000`, sem `icons` vinculados)
//     e `prod` (sem nenhum host de desenvolvimento, com `icons` vinculados
//     aos PNGs gerados, e com os ajustes específicos de loja por
//     navegador — ver `toProductionManifest`). Os nomes de arquivo e a
//     estrutura de diretórios dos pacotes `dev` não mudam em relação ao
//     D1/D2, para não quebrar nada que já dependa deles; os pacotes `prod`
//     usam um sufixo `-prod-` próprio, para que um nunca seja confundido
//     com o outro (ver também `build-summary.json`, que grava o campo
//     `environment` de cada pacote).
//
// Escopo (STEP 2B.1 — Canal de build E2E isolado do ManyChat):
//   - `node build-package.mjs` (sem argumento) continua gerando SOMENTE os
//     quatro pacotes de sempre (chrome/firefox × dev/prod), com
//     MANYCHAT_CAPTURE_ENABLED=false neles — o comando default nunca gera
//     e2e. Só `node build-package.mjs --e2e` gera os dois pacotes e2e
//     (chrome-e2e/firefox-e2e), isolados em `dist/yolen-companion/e2e/`,
//     com resumo próprio (`e2e-build-summary.json`) que nunca sobrescreve
//     o `build-summary.json` normal. Um argumento desconhecido falha
//     fechado (nunca ignora um typo silenciosamente).
//   - `src/manychat-feature-flags.js` (a fonte normal, sempre `false`)
//     NUNCA é editado por este script nem por ninguém — dev e prod sempre
//     leem exatamente esse arquivo. O canal e2e usa uma fonte
//     COMPLETAMENTE separada, `src/manychat-feature-flags.e2e.js`
//     (sempre `true`), que `featureFlagSourceForEnvironment()` seleciona
//     — mas dentro do pacote e2e ela é staged no MESMO pathname que o
//     manifest espera (`src/manychat-feature-flags.js`), nunca com seu
//     próprio nome. `assertFeatureFlagSourcesAreSafe()` roda antes de
//     qualquer build (normal ou e2e) e falha alto se algum dia o arquivo
//     normal deixar de ser `false` ou o arquivo e2e deixar de ser `true`
//     — isso é o que impede alguém de editar a constante normal para
//     `true` e ainda assim conseguir gerar QUALQUER pacote (inclusive
//     prod). Depois de cada staging, `assertEffectiveManyChatFlagForEnvironment`
//     relê o arquivo já copiado para dentro do pacote e falha o build se o
//     valor efetivo não bater com o esperado por ambiente (dev/prod=false,
//     e2e=true) — nunca confiando só na leitura da fonte antes de copiar.
//
// Este script não depende de nenhum pacote npm novo: usa apenas módulos
// nativos do Node (fs, path, zlib, crypto) e o binário `zip` do sistema
// operacional para gerar o arquivo final.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resizePngSquare } from './lib/png-resize.mjs'

export const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const REPO_ROOT = join(EXTENSION_ROOT, '..', '..', '..')
export const OUTPUT_ROOT = join(REPO_ROOT, 'dist', 'yolen-companion')

// Isolamento físico obrigatório (STEP 2B.1): o canal e2e nunca escreve
// dentro de OUTPUT_ROOT diretamente — sempre num subdiretório próprio, para
// que um `ls`/build normal nunca produza nem sobrescreva um artefato e2e
// por engano.
export const E2E_OUTPUT_ROOT = join(OUTPUT_ROOT, 'e2e')

// Timestamp fixo aplicado a todos os arquivos do pacote antes de zipar, para
// que o mesmo conteúdo sempre produza os mesmos bytes de saída dentro do
// MESMO ambiente/execução do `zip`. Reprodutibilidade byte-a-byte entre
// máquinas/implementações diferentes de `zip` ainda não foi validada — ver
// README.md, seção "Reprodutibilidade".
const REPRODUCIBLE_MTIME = new Date('2020-01-01T00:00:00Z')

export const ICON_SIZES = [16, 32, 48, 128]

// Allowlist explícita: todo arquivo compartilhado pelos dois pacotes.
// Cada entrada aqui corresponde a um arquivo que o manifest.json de
// desenvolvimento já declara em content_scripts, web_accessible_resources
// ou background. Nada é incluído "por estar na pasta".
export const SHARED_RUNTIME_FILES = [
  'assets/yolen-mark.png',
  'src/background.js',
  'src/capture-batch.js',
  'src/capture-resilience-null-base.js',
  'src/capture-resilience.js',
  'src/capture-transport.js',
  'src/companion-client-context-view.js',
  'src/companion-lead-summary-view.js',
  'src/companion-reasoning-view.js',
  'src/companion-seller-information-view.js',
  'src/content-script.js',
  'src/conversation-registration-tools.js',
  'src/editable-field-stability-runtime.js',
  'src/lead-automation.css',
  'src/lead-automation.js',
  'src/lead-enrichment.js',
  'src/lead-resolution-runtime-cache.js',
  'src/lead-summary-expand-state.js',
  'src/lead-summary-runtime-cache.js',
  'src/manychat-audio-background-transport.js',
  'src/manychat-audio-dispatch-runtime.js',
  'src/manychat-audio-source.js',
  'src/manychat-message-content.js',
  'src/manychat-message-identity.js',
  'src/manychat-message-semantics.js',
  'src/manychat-surface.js',
  'src/manychat-adapter.js',
  'src/manychat-capture-bootstrap.js',
  'src/manychat-capture-runtime.js',
  'src/manychat-composer.js',
  'src/manychat-contact-link-runtime.js',
  'src/manychat-context-evidence-probe.js',
  'src/manychat-dom-reader.js',
  'src/manychat-feature-flags.js',
  'src/manychat-identity-namespace.js',
  'src/manychat-mainworld-identity-probe.js',
  'src/manychat-mainworld-probe-bootstrap.js',
  'src/manychat-mainworld-report-export.js',
  'src/manychat-message-profile.js',
  'src/manychat-panel-mount.js',
  'src/manychat-seller-panel-runtime.js',
  'src/manychat-safe-identity-background.js',
  'src/manychat-safe-identity-bridge.js',
  'src/manychat-safe-identity-main.js',
  'src/platform-contract.js',
  'src/message-mutations.js',
  'src/panel-stability-runtime.js',
  'src/phase16-9-runtime-guard.js',
  'src/seller-message-runtime.js',
  'src/styles.css',
  'src/ux8-interaction-consistency-runtime.js',
  'src/whatsapp-audio-bridge.js',
  'src/whatsapp-identity-bridge.js',
  'src/yolen-api.js',
  'src/yolen-bridge.js',
  'src/yolen-page-bridge.js',
]

// Só é necessário no pacote Chrome: é o arquivo referenciado por
// background.service_worker (que por sua vez faz importScripts dos arquivos
// de background já listados acima).
export const CHROME_ONLY_FILES = ['src/background-service-worker.js']

export const TARGETS = {
  chrome: {
    files: [...SHARED_RUNTIME_FILES, ...CHROME_ONLY_FILES],
    adaptManifest(manifest) {
      const clone = structuredClone(manifest)
      delete clone.background.scripts
      return clone
    },
  },
  firefox: {
    files: [...SHARED_RUNTIME_FILES],
    adaptManifest(manifest) {
      const clone = structuredClone(manifest)
      delete clone.background.service_worker
      return clone
    },
  },
}

// Hosts que a extensão de fato precisa em produção. Qualquer host que não
// esteja nesta lista é, por definição, algo que não deveria sobreviver à
// transformação DEV → PROD.
export const PRODUCTION_HOSTS = [
  'https://web.whatsapp.com/*',
  'https://app.manychat.com/*',
  'https://manybot-files.manychat.io/*',
  'https://cockpit-comercial-vocn.vercel.app/*',
]

const DEV_HOST_PATTERN = /localhost|cockpit-comercial-vocn-git-/i

function isDevHost(entry) {
  return typeof entry === 'string' && DEV_HOST_PATTERN.test(entry)
}

// ---------------------------------------------------------------------------
// STEP 2B.1 — Canal de build E2E do ManyChat: seleção de fonte da flag,
// parser determinístico e garantias estruturais (nunca depender de alguém
// lembrar de reverter uma edição manual).
// ---------------------------------------------------------------------------

// Pathname DENTRO do pacote — o único que o manifest.json referencia
// (content_scripts do ManyChat carregam "src/manychat-feature-flags.js").
// dev/prod/e2e escrevem TODOS neste mesmo destino; o que muda entre eles é
// só de qual arquivo em disco o conteúdo veio (ver featureFlagSourceForEnvironment).
export const FEATURE_FLAGS_PATHNAME = 'src/manychat-feature-flags.js'

// Fonte normal — nunca editada, sempre MANYCHAT_CAPTURE_ENABLED=false.
// dev e prod sempre usam exatamente este arquivo.
export const FEATURE_FLAGS_SOURCE_DEFAULT = 'src/manychat-feature-flags.js'

// Fonte exclusiva do canal e2e — arquivo SEPARADO, versionado à parte,
// sempre MANYCHAT_CAPTURE_ENABLED=true. Nunca entra no zip com este nome:
// só como conteúdo copiado para FEATURE_FLAGS_PATHNAME.
export const FEATURE_FLAGS_SOURCE_E2E = 'src/manychat-feature-flags.e2e.js'

// Contrato explícito de seleção de fonte por ambiente — testado
// diretamente (STEP 2B.1, seção 12). Qualquer ambiente fora desta lista
// falha alto: nunca cai silenciosamente para um default.
export function featureFlagSourceForEnvironment(environment) {
  if (environment === 'dev' || environment === 'prod') {
    return FEATURE_FLAGS_SOURCE_DEFAULT
  }
  if (environment === 'e2e') {
    return FEATURE_FLAGS_SOURCE_E2E
  }
  throw new Error(`featureFlagSourceForEnvironment: ambiente desconhecido "${environment}".`)
}

// Valor efetivo obrigatório de MANYCHAT_CAPTURE_ENABLED por ambiente —
// única fonte de verdade usada tanto pelo build (assertEffectiveManyChatFlagForEnvironment)
// quanto pelo validador de Release Candidate.
export const EXPECTED_MANYCHAT_CAPTURE_ENABLED_BY_ENVIRONMENT = {
  dev: false,
  prod: false,
  e2e: true,
}

// Só reconhece uma declaração de verdade (`const`/`let`/`var
// MANYCHAT_CAPTURE_ENABLED = ...`) — uma menção qualquer ao nome da
// constante em outro contexto (ex.: a chave curta `{ MANYCHAT_CAPTURE_ENABLED }`
// num objeto, ou `root.MANYCHAT_CAPTURE_ENABLED`) nunca casa, porque não é
// precedida do keyword de declaração.
const MANYCHAT_CAPTURE_ENABLED_DECLARATION_PATTERN =
  /\b(?:const|let|var)\s+MANYCHAT_CAPTURE_ENABLED\s*=\s*([^\s;,)]+)/g

// Remove comentários de linha (`//...`) antes de casar a declaração —
// texto de comentário/documentação que mencione a constante (mesmo que
// pareça uma atribuição) nunca deve contar como uma segunda declaração.
// Seguro para os dois arquivos-fonte reais: nenhum dos dois tem `//`
// dentro de uma string literal.
function stripLineComments(sourceCode) {
  return String(sourceCode ?? '')
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//')
      return index === -1 ? line : line.slice(0, index)
    })
    .join('\n')
}

// Parser determinístico e explícito — nunca um `content.includes('true')`.
// Falha em três cenários distintos, cada um com sua própria mensagem:
// declaração ausente, valor que não é literalmente `true`/`false`, ou mais
// de uma declaração no mesmo arquivo (ambíguo, mesmo que concordem entre
// si — um arquivo de flags nunca deveria declarar a constante duas vezes).
export function parseManyChatCaptureEnabledFromSource(sourceCode) {
  const matches = [
    ...stripLineComments(sourceCode).matchAll(MANYCHAT_CAPTURE_ENABLED_DECLARATION_PATTERN),
  ]

  if (matches.length === 0) {
    throw new Error('MANYCHAT_CAPTURE_ENABLED não encontrado no arquivo de flags.')
  }

  if (matches.length > 1) {
    throw new Error(
      `MANYCHAT_CAPTURE_ENABLED declarado ${matches.length} vezes no mesmo arquivo — definição ambígua.`,
    )
  }

  const rawValue = matches[0][1]

  if (rawValue !== 'true' && rawValue !== 'false') {
    throw new Error(`MANYCHAT_CAPTURE_ENABLED possui valor inválido: ${rawValue}`)
  }

  return rawValue === 'true'
}

function readFeatureFlagsSourceCode(relativeSourcePath) {
  return readFileSync(join(EXTENSION_ROOT, relativeSourcePath), 'utf8')
}

// Defesa da FONTE (STEP 2B.1, seção 11) — roda antes de QUALQUER build
// (normal ou e2e). Nunca confia em "ninguém vai editar o arquivo errado":
// lê os dois arquivos-fonte do disco e falha alto se o normal não for
// exatamente `false` ou o e2e não for exatamente `true`. Isso é o que
// impede alguém de editar src/manychat-feature-flags.js para `true` e
// ainda assim conseguir gerar QUALQUER pacote — inclusive prod.
export function assertFeatureFlagSourcesAreSafe() {
  const defaultValue = parseManyChatCaptureEnabledFromSource(
    readFeatureFlagsSourceCode(FEATURE_FLAGS_SOURCE_DEFAULT),
  )
  if (defaultValue !== false) {
    throw new Error(
      `Guarda de segurança falhou: ${FEATURE_FLAGS_SOURCE_DEFAULT} precisa declarar MANYCHAT_CAPTURE_ENABLED = false ` +
        `(encontrado: ${defaultValue}). Este arquivo nunca pode virar true — o canal e2e usa ${FEATURE_FLAGS_SOURCE_E2E}.`,
    )
  }

  const e2eValue = parseManyChatCaptureEnabledFromSource(readFeatureFlagsSourceCode(FEATURE_FLAGS_SOURCE_E2E))
  if (e2eValue !== true) {
    throw new Error(
      `Guarda de segurança falhou: ${FEATURE_FLAGS_SOURCE_E2E} precisa declarar MANYCHAT_CAPTURE_ENABLED = true ` +
        `(encontrado: ${e2eValue}).`,
    )
  }
}

// Defesa do EFETIVO (STEP 2B.1, seção 10) — roda depois de o arquivo já
// estar staged dentro do pacote, relendo o conteúdo real que vai para o
// zip (nunca só a fonte antes de copiar). BUILD FAIL se o valor não bater
// com o esperado para aquele ambiente.
export function assertEffectiveManyChatFlagForEnvironment(environment, effectiveValue) {
  const expected = EXPECTED_MANYCHAT_CAPTURE_ENABLED_BY_ENVIRONMENT[environment]

  if (expected === undefined) {
    throw new Error(`assertEffectiveManyChatFlagForEnvironment: ambiente desconhecido "${environment}".`)
  }

  if (effectiveValue !== expected) {
    throw new Error(
      `BUILD FAIL: ambiente "${environment}" deveria empacotar MANYCHAT_CAPTURE_ENABLED=${expected}, ` +
        `mas o valor efetivo staged no pacote é ${effectiveValue}.`,
    )
  }
}

// Remove o host de desenvolvimento de TODOS os campos do manifest onde ele
// aparece — não só de `host_permissions`. Isso é verificado de novo, de
// forma independente, em `assertNoDevHostsRemain` logo abaixo, e outra vez
// pelo validador de Release Candidate (D2/D3), varrendo o texto inteiro do
// manifest gerado.
function stripDevHosts(manifest) {
  const clone = structuredClone(manifest)

  if (Array.isArray(clone.host_permissions)) {
    clone.host_permissions = clone.host_permissions.filter((host) => !isDevHost(host))
  }

  for (const block of clone.content_scripts ?? []) {
    if (Array.isArray(block.matches)) {
      block.matches = block.matches.filter((host) => !isDevHost(host))
    }
  }

  for (const block of clone.web_accessible_resources ?? []) {
    if (Array.isArray(block.matches)) {
      block.matches = block.matches.filter((host) => !isDevHost(host))
    }
  }

  return clone
}

// Rede de segurança: depois de tirar os hosts de dev, (1) nenhum campo de
// match pode ter ficado vazio (um bloco de content_script/recurso sem
// nenhum host vira código morto, silenciosamente quebrado) e (2) a string
// "localhost" não pode sobrar em NENHUM lugar do manifest — nem em campos
// que hoje não existem mas alguém possa adicionar no futuro sem atualizar
// este transformador.
function assertNoDevHostsRemain(manifest) {
  for (const block of manifest.content_scripts ?? []) {
    if (Array.isArray(block.matches) && block.matches.length === 0) {
      throw new Error('Transformação PROD deixou um bloco de content_scripts sem nenhum host — matches vazio.')
    }
  }
  for (const block of manifest.web_accessible_resources ?? []) {
    if (Array.isArray(block.matches) && block.matches.length === 0) {
      throw new Error('Transformação PROD deixou um bloco de web_accessible_resources sem nenhum host — matches vazio.')
    }
  }
  if (DEV_HOST_PATTERN.test(JSON.stringify(manifest))) {
    throw new Error('Transformação PROD falhou: "localhost" ainda aparece em algum lugar do manifest gerado.')
  }
}

// `icons` do manifest final aponta para os PNGs que `stageIcons` já
// escreve em `assets/icons/` — mesmos arquivos usados pelo pacote DEV,
// só que agora referenciados de fato pelo manifest.
function withProductionIcons(manifest) {
  const clone = structuredClone(manifest)
  clone.icons = Object.fromEntries(ICON_SIZES.map((size) => [String(size), `assets/icons/icon-${size}.png`]))
  return clone
}

// Manifest V3 básico (content_scripts, host_permissions,
// web_accessible_resources no formato de objeto, background.scripts como
// event page não persistente) já era suportado, fora de flag, desde o
// Firefox 109. Mas o Companion agora DEPENDE funcionalmente de
// content_scripts[].world === "MAIN" (o active-chat identity bridge só
// consegue ler o React Fiber da própria página rodando nesse world) — o
// Firefox só adicionou essa capacidade na versão 128. Por isso 128 passa
// a ser o mínimo funcional real da extensão, não apenas o mínimo de
// Manifest V3. https://www.mozilla.org/en-US/firefox/128.0/releasenotes/
export const FIREFOX_STRICT_MIN_VERSION = '128.0'

// content_scripts[].world === "MAIN" (usado pelo mesmo motivo acima) tem
// suporte pleno no Chrome a partir da versão 111 — antes disso, scripts
// declarados com "world": "MAIN" simplesmente não eram reconhecidos pelo
// manifest. Só o pacote PROD declara isso (mesmo padrão de
// FIREFOX_STRICT_MIN_VERSION/strict_min_version, que também só é aplicado
// na transformação PROD).
export const CHROME_MIN_VERSION = '111'

// Identificação forte do canal e2e (STEP 2B.1, seção 9/16) — nunca
// depender só do nome do arquivo zip. Quem abrir chrome://extensions ou
// about:debugging precisa ver imediatamente que não é a instalação normal.
export const E2E_NAME = 'Yolen Companion [E2E]'
export const E2E_DESCRIPTION_SUFFIX = ' Internal E2E build — not for distribution.'

// ID de extensão do Firefox exclusivo do canal e2e — nunca reutiliza
// silenciosamente o ID normal (manifest.json), reduzindo risco de
// confusão/colisão com uma instalação normal no mesmo perfil.
export const FIREFOX_E2E_GECKO_ID = 'yolen-companion-e2e@gerson.local'

// Transformação determinística para o canal e2e (STEP 2B.1). Preserva
// TUDO que dev preserva (hosts de desenvolvimento incluídos — o E2E
// precisa deles para o mesmo fluxo de teste local que dev já usa) e só
// muda o que é necessário para identificação forte: name/description e,
// no Firefox, o id da extensão. `manifest.json` nunca é editado — assim
// como toProductionManifest, esta função sempre recebe o manifest de
// origem e devolve um manifest NOVO, específico do navegador.
export function toE2EManifest(sourceManifest, targetName) {
  const target = TARGETS[targetName]
  if (!target) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }

  const manifest = target.adaptManifest(structuredClone(sourceManifest))

  manifest.name = E2E_NAME
  manifest.description = `${sourceManifest.description}${E2E_DESCRIPTION_SUFFIX}`

  if (targetName === 'firefox') {
    manifest.browser_specific_settings = {
      ...manifest.browser_specific_settings,
      gecko: {
        ...manifest.browser_specific_settings?.gecko,
        id: FIREFOX_E2E_GECKO_ID,
      },
    }
  }

  return manifest
}

// Transformação determinística DEV → PROD. `manifest.json` (a fonte de
// desenvolvimento) nunca é editado — esta função sempre recebe o manifest
// de origem e devolve um manifest NOVO, específico do navegador e pronto
// para distribuição oficial. É a única fonte de verdade sobre "o que muda
// entre DEV e PROD"; o validador de Release Candidate importa esta mesma
// função em vez de reimplementar a transformação.
export function toProductionManifest(sourceManifest, targetName) {
  const target = TARGETS[targetName]
  if (!target) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }

  let manifest = stripDevHosts(sourceManifest)
  manifest = withProductionIcons(manifest)
  manifest = target.adaptManifest(manifest)

  if (targetName === 'chrome') {
    // browser_specific_settings é específico de Gecko/Safari — não faz
    // sentido carregar isso num pacote Chrome de produção.
    delete manifest.browser_specific_settings
    manifest.minimum_chrome_version = CHROME_MIN_VERSION
  } else if (targetName === 'firefox') {
    manifest.browser_specific_settings = {
      ...manifest.browser_specific_settings,
      gecko: {
        ...manifest.browser_specific_settings?.gecko,
        strict_min_version: FIREFOX_STRICT_MIN_VERSION,
      },
    }
  }

  assertNoDevHostsRemain(manifest)
  return manifest
}

export function readSourceManifest() {
  const raw = readFileSync(join(EXTENSION_ROOT, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

// Verificação de deriva: garante que a allowlist acima continua cobrindo
// exatamente os arquivos que o manifest.json de origem referencia. Se
// alguém adicionar um novo arquivo ao manifest sem atualizar este script
// (ou vice-versa), o build falha alto em vez de gerar um pacote incompleto
// silenciosamente.
export function assertAllowlistMatchesManifest(manifest) {
  const referenced = new Set()

  for (const script of manifest.background?.scripts ?? []) referenced.add(script)
  if (manifest.background?.service_worker) referenced.add(manifest.background.service_worker)

  for (const block of manifest.content_scripts ?? []) {
    for (const js of block.js ?? []) referenced.add(js)
    for (const css of block.css ?? []) referenced.add(css)
  }

  for (const block of manifest.web_accessible_resources ?? []) {
    for (const resource of block.resources ?? []) referenced.add(resource)
  }

  const allowlisted = new Set([...SHARED_RUNTIME_FILES, ...CHROME_ONLY_FILES])

  const missingFromAllowlist = [...referenced].filter((file) => !allowlisted.has(file))
  const staleInAllowlist = [...allowlisted].filter((file) => !referenced.has(file))

  if (missingFromAllowlist.length > 0 || staleInAllowlist.length > 0) {
    const lines = ['Allowlist de empacotamento desalinhada com manifest.json:']
    if (missingFromAllowlist.length > 0) {
      lines.push(`  - referenciado no manifest mas ausente na allowlist: ${missingFromAllowlist.join(', ')}`)
    }
    if (staleInAllowlist.length > 0) {
      lines.push(`  - presente na allowlist mas não referenciado no manifest: ${staleInAllowlist.join(', ')}`)
    }
    lines.push('Atualize scripts/build-package.mjs antes de gerar o pacote.')
    throw new Error(lines.join('\n'))
  }
}

// Copia um arquivo de origem para um pathname de destino DIFERENTE dentro
// do staging — necessário para o canal e2e, cuja fonte da flag
// (FEATURE_FLAGS_SOURCE_E2E) precisa ocupar o mesmo pathname que o
// manifest espera (FEATURE_FLAGS_PATHNAME), nunca o próprio nome do
// arquivo `.e2e.js`.
function stageFileFromSource(sourceRelativePath, destinationRelativePath, stagingDir) {
  const source = join(EXTENSION_ROOT, sourceRelativePath)
  if (!existsSync(source)) {
    throw new Error(`Arquivo de origem não existe: ${sourceRelativePath}`)
  }
  const destination = join(stagingDir, destinationRelativePath)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  utimesSync(destination, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
}

function stageFile(relativePath, stagingDir) {
  stageFileFromSource(relativePath, relativePath, stagingDir)
}

function stageIcons(stagingDir) {
  const sourceIcon = readFileSync(join(EXTENSION_ROOT, 'assets', 'yolen-mark.png'))
  const iconsDir = join(stagingDir, 'assets', 'icons')
  mkdirSync(iconsDir, { recursive: true })

  for (const size of ICON_SIZES) {
    const resized = resizePngSquare(sourceIcon, size)
    const destination = join(iconsDir, `icon-${size}.png`)
    writeFileSync(destination, resized)
    utimesSync(destination, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
  }
}

function stageManifest(manifest, stagingDir) {
  const destination = join(stagingDir, 'manifest.json')
  writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`)
  utimesSync(destination, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
}

export function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// Lista (ordenada, determinística) de entradas que um pacote de `targetName`
// deve conter. Única fonte de verdade para "o que entra no zip" — usada
// tanto pelo build quanto pelo validador de Release Candidate (D2), para
// que os dois nunca divirjam sobre o conjunto esperado de arquivos.
export function getTargetZipEntries(targetName) {
  const target = TARGETS[targetName]
  if (!target) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }
  return [
    'manifest.json',
    ...target.files,
    ...ICON_SIZES.map((size) => `assets/icons/icon-${size}.png`),
  ].sort()
}

function createZip(stagingDir, zipPath, entries) {
  rmSync(zipPath, { force: true })
  mkdirSync(dirname(zipPath), { recursive: true })

  // -X: descarta atributos extras (uid/gid, timestamps estendidos).
  // -D: não cria entradas de diretório.
  // Lista de arquivos ordenada explicitamente para uma ordem determinística
  // dentro do zip, independente do sistema operacional.
  execFileSync('zip', ['-X', '-D', '-q', zipPath, ...entries], { cwd: stagingDir })
}

// Ambientes do build NORMAL — `node build-package.mjs` sem argumento.
// Nunca inclui 'e2e': o comando default não deve gerar rotineiramente um
// artefato com ManyChat ativo (STEP 2B.1, seção 6).
export const ENVIRONMENTS = ['dev', 'prod']

// Ambientes do canal e2e — só usados quando `--e2e` é passado
// explicitamente (ver parseBuildCliArgs/main).
export const E2E_ENVIRONMENTS = ['e2e']

export function zipFileName(targetName, environment, version) {
  if (environment === 'e2e') {
    return `yolen-companion-${targetName}-e2e-v${version}.zip`
  }
  return environment === 'prod'
    ? `yolen-companion-${targetName}-prod-v${version}.zip`
    : `yolen-companion-${targetName}-v${version}.zip`
}

function buildTarget(targetName, environment, sourceManifest, { outputRoot = OUTPUT_ROOT } = {}) {
  const target = TARGETS[targetName]
  const stagingDir =
    environment === 'prod'
      ? join(OUTPUT_ROOT, targetName, 'prod', 'staging')
      : environment === 'e2e'
        ? join(outputRoot, targetName, 'staging')
        : join(OUTPUT_ROOT, targetName, 'staging')
  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(stagingDir, { recursive: true })

  // Seleção de fonte da flag ANTES de copiar qualquer arquivo — dev/prod
  // sempre pegam o arquivo normal, e2e sempre pega o arquivo e2e, mas os
  // dois terminam no MESMO pathname dentro do staging.
  const featureFlagsSource = featureFlagSourceForEnvironment(environment)

  const sortedFiles = [...target.files].sort()
  for (const relativePath of sortedFiles) {
    if (relativePath === FEATURE_FLAGS_PATHNAME) {
      stageFileFromSource(featureFlagsSource, FEATURE_FLAGS_PATHNAME, stagingDir)
      continue
    }
    stageFile(relativePath, stagingDir)
  }

  stageIcons(stagingDir)

  const manifest =
    environment === 'prod'
      ? toProductionManifest(sourceManifest, targetName)
      : environment === 'e2e'
        ? toE2EManifest(sourceManifest, targetName)
        : target.adaptManifest(sourceManifest)
  stageManifest(manifest, stagingDir)

  // Defesa do EFETIVO: relê o arquivo já staged (nunca a fonte antes de
  // copiar) e falha o build se o valor não bater com o esperado para este
  // ambiente. Roda antes de zipar — nenhum pacote com o valor errado chega
  // a ser criado.
  const effectiveManyChatCaptureEnabled = parseManyChatCaptureEnabledFromSource(
    readFileSync(join(stagingDir, FEATURE_FLAGS_PATHNAME), 'utf8'),
  )
  assertEffectiveManyChatFlagForEnvironment(environment, effectiveManyChatCaptureEnabled)

  const zipEntries = getTargetZipEntries(targetName)

  const zipPath = join(outputRoot, zipFileName(targetName, environment, sourceManifest.version))
  createZip(stagingDir, zipPath, zipEntries)

  return {
    target: targetName,
    environment,
    zipPath,
    sha256: sha256(zipPath),
    entries: zipEntries,
    effectiveManyChatCaptureEnabled,
  }
}

// Parser explícito de argumentos de CLI (STEP 2B.1, seção 7). Sem
// argumento: comportamento normal intacto. `--e2e`: só o canal e2e.
// Qualquer outra coisa: falha fechado — nunca ignora um typo em silêncio.
export function parseBuildCliArgs(argv) {
  const args = argv.slice(2)

  if (args.length === 0) {
    return { e2e: false }
  }

  if (args.length === 1 && args[0] === '--e2e') {
    return { e2e: true }
  }

  throw new Error(`Argumento de linha de comando desconhecido: "${args.join(' ')}". Uso: build-package.mjs [--e2e]`)
}

function buildPackages(environments, sourceManifest, outputRoot) {
  mkdirSync(outputRoot, { recursive: true })
  return Object.keys(TARGETS).flatMap((targetName) =>
    environments.map((environment) => buildTarget(targetName, environment, sourceManifest, { outputRoot })),
  )
}

function writeBuildSummary({ results, sourceManifest, outputRoot, fileName, note }) {
  const summary = {
    version: sourceManifest.version,
    generatedAt: new Date().toISOString(),
    note,
    packages: results.map(({ target, environment, zipPath, sha256: hash, entries, effectiveManyChatCaptureEnabled }) => ({
      target,
      environment,
      zipPath: zipPath.replace(`${REPO_ROOT}/`, ''),
      sha256: hash,
      fileCount: entries.length,
      entries,
      effectiveManyChatCaptureEnabled,
    })),
  }

  writeFileSync(join(outputRoot, fileName), `${JSON.stringify(summary, null, 2)}\n`)
  return summary
}

function logResults(summary) {
  for (const pkg of summary.packages) {
    console.log(`\n[${pkg.target}/${pkg.environment}] ${pkg.zipPath}`)
    console.log(`  sha256: ${pkg.sha256}`)
    console.log(`  MANYCHAT_CAPTURE_ENABLED: ${pkg.effectiveManyChatCaptureEnabled}`)
    console.log(`  arquivos (${pkg.fileCount}):`)
    for (const entry of pkg.entries) {
      console.log(`    - ${entry}`)
    }
  }
}

const DEFAULT_BUILD_NOTE =
  'Pacotes "dev" ainda são internos/dev (incluem localhost, sem icons vinculados no manifest). ' +
  'Pacotes "prod" (D3) removem todo host de desenvolvimento e vinculam os ícones gerados, mas isso NÃO ' +
  'significa aprovação de loja — ver dist/yolen-companion/release-candidate-report.json. ' +
  'Este comando NUNCA gera pacotes e2e — use `--e2e` explicitamente (STEP 2B.1).'

const E2E_BUILD_NOTE =
  'Canal de build E2E (STEP 2B.1) — uso interno exclusivo para validar o ManyChat ao vivo. ' +
  'MANYCHAT_CAPTURE_ENABLED=true SOMENTE nestes dois pacotes, vindo de src/manychat-feature-flags.e2e.js ' +
  '(o arquivo normal continua false e nunca é editado). Nunca distribuir; nunca confundir com dev/prod — ' +
  'ver dist/yolen-companion/e2e/e2e-release-candidate-report.json.'

function main() {
  const { e2e } = parseBuildCliArgs(process.argv)

  const sourceManifest = readSourceManifest()
  assertAllowlistMatchesManifest(sourceManifest)
  // Defesa da fonte: roda antes de QUALQUER build, normal ou e2e.
  assertFeatureFlagSourcesAreSafe()

  if (e2e) {
    const results = buildPackages(E2E_ENVIRONMENTS, sourceManifest, E2E_OUTPUT_ROOT)
    const summary = writeBuildSummary({
      results,
      sourceManifest,
      outputRoot: E2E_OUTPUT_ROOT,
      fileName: 'e2e-build-summary.json',
      note: E2E_BUILD_NOTE,
    })
    logResults(summary)
    console.log(
      `\nResumo E2E escrito em: ${join(E2E_OUTPUT_ROOT, 'e2e-build-summary.json').replace(`${REPO_ROOT}/`, '')}`,
    )
    return
  }

  const results = buildPackages(ENVIRONMENTS, sourceManifest, OUTPUT_ROOT)
  const summary = writeBuildSummary({
    results,
    sourceManifest,
    outputRoot: OUTPUT_ROOT,
    fileName: 'build-summary.json',
    note: DEFAULT_BUILD_NOTE,
  })
  logResults(summary)
  console.log(`\nResumo escrito em: ${join(OUTPUT_ROOT, 'build-summary.json').replace(`${REPO_ROOT}/`, '')}`)
}

// Só executa o build quando o arquivo é rodado diretamente (`node
// build-package.mjs`). Isso permite que outros scripts (como o validador de
// Release Candidate do D2) importem os helpers acima sem disparar um build
// como efeito colateral do import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
