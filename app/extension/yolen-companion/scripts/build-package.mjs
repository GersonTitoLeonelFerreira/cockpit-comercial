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
// Escopo (canal HOMOLOG — extensão e backend do MESMO HEAD):
//   - `node build-package.mjs --homolog` gera SOMENTE os pacotes homolog
//     (chrome/firefox), em `dist/yolen-companion/<alvo>/homolog/staging/`
//     (nunca reaproveita o staging prod) e zips `-homolog-`, com resumo
//     próprio (`homolog-build-summary.json`).
//   - O backend vem de YOLEN_COMPANION_HOMOLOG_BASE_URL — nunca de uma
//     edição manual da fonte. O build falha se a variável faltar, não for
//     HTTPS ou não for uma origem exata (sem caminho, porta, wildcard).
//   - Uma única configuração canônica por canal (src/companion-environment.js,
//     GERADA aqui para cada pacote) decide backend e origens da Yolen
//     autorizadas: PROD aceita só produção, DEV produção + localhost,
//     HOMOLOG só o preview configurado. O manifest homolog troca o host de
//     produção pelo host EXATO do preview em host_permissions, na bridge e
//     em web_accessible_resources.
//
// Variante HOMOLOG + ManyChat (`--homolog-manychat`):
//   - O MESMO canal homolog (mesmo backend de preview, mesmas validações,
//     backend_match_required=true, mesmo id Firefox — substitui a extensão
//     HML em vez de rodar junto), com MANYCHAT_CAPTURE_ENABLED=true vindo da
//     fonte separada src/manychat-feature-flags.e2e.js (a fonte normal
//     continua false e nunca é editada). Um pacote só para WhatsApp e
//     ManyChat.
//   - Saída própria: dist/yolen-companion/<alvo>/homolog-manychat/staging/,
//     zips `-homolog-manychat-` e homolog-manychat-build-summary.json. Os
//     comandos padrão (dev/prod sem ManyChat), --homolog e --e2e não mudam.
//
// Este script não depende de nenhum pacote npm novo: usa apenas módulos
// nativos do Node (fs, path, zlib, crypto) e o binário `zip` do sistema
// operacional para gerar o arquivo final.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
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
  'src/build-identity.js',
  'src/capture-batch.js',
  'src/capture-resilience-null-base.js',
  'src/capture-resilience.js',
  'src/capture-transport.js',
  'src/companion-background-privacy.js',
  'src/companion-client-context-view.js',
  'src/companion-conversation-boundary.js',
  'src/companion-analysis-controller.js',
  'src/companion-lead-creation-controller.js',
  'src/companion-contact-link-controller.js',
  'src/companion-conversation-registration-controller.js',
  'src/companion-lead-enrichment-controller.js',
  'src/companion-enrichment-comparison.js',
  'src/companion-environment.js',
  'src/companion-lead-summary-controller.js',
  'src/companion-message-controller.js',
  'src/companion-core-api-composition.js',
  'src/companion-client-controller.js',
  'src/companion-core.js',
  'src/companion-bootstrap.js',
  'src/companion-lead-resolution-controller.js',
  'src/companion-lead-summary-view.js',
  'src/companion-reasoning-view.js',
  'src/companion-seller-information-view.js',
  'src/companion-workspace-runtime.js',
  'src/content-script.js',
  'src/conversation-registration-tools.js',
  'src/editable-field-stability-runtime.js',
  'src/lead-automation.css',
  'src/lead-automation.js',
  'src/lead-enrichment.js',
  'src/lead-summary-expand-state.js',
  'src/manychat-audio-background-transport.js',
  'src/manychat-audio-source.js',
  'src/manychat-channel-adapter.js',
  'src/manychat-message-content.js',
  'src/manychat-message-identity.js',
  'src/manychat-message-semantics.js',
  'src/manychat-surface.js',
  'src/manychat-composer.js',
  'src/manychat-content-script.js',
  'src/manychat-dom-reader.js',
  'src/manychat-feature-flags.js',
  'src/manychat-identity-namespace.js',
  'src/manychat-mainworld-identity-probe.js',
  'src/manychat-mainworld-probe-bootstrap.js',
  'src/manychat-mainworld-report-export.js',
  'src/manychat-message-profile.js',
  'src/manychat-phone-evidence.js',
  'src/manychat-safe-identity-background.js',
  'src/manychat-safe-identity-bridge.js',
  'src/manychat-safe-identity-main.js',
  'src/message-mutations.js',
  'src/panel-stability-runtime.js',
  'src/platform-contract.js',
  'src/styles.css',
  'src/ux8-interaction-consistency-runtime.js',
  'src/whatsapp-adapter.js',
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

// ---------------------------------------------------------------------------
// Configuração canônica de ambiente por canal (backend + origens da Yolen
// autorizadas). ÚNICA fonte de verdade consumida em runtime por background,
// yolen-api, bridges e Core via src/companion-environment.js — que cada
// pacote recebe GERADO por esta função (nunca copiado da fonte).
// ---------------------------------------------------------------------------
export const PRODUCTION_BASE_URL = 'https://cockpit-comercial-vocn.vercel.app'
export const LOCAL_BASE_URL = 'http://localhost:3000'

// Toda origem conhecida de PRODUÇÃO do projeto Vercel: domínio canônico,
// alias do time e alias da branch de produção. Nenhuma pode ser backend
// de homologação (o runtime HML ainda exige que o backend se declare
// preview antes de receber qualquer token).
export const PRODUCTION_ORIGINS = [
  PRODUCTION_BASE_URL,
  'https://cockpit-comercial-vocn-yolen.vercel.app',
  'https://cockpit-comercial-vocn-git-main-yolen.vercel.app',
]
export const COMPANION_ENVIRONMENT_PATHNAME = 'src/companion-environment.js'
export const HOMOLOG_BASE_URL_ENV = 'YOLEN_COMPANION_HOMOLOG_BASE_URL'

// Variante do canal homolog com o ManyChat ligado (`--homolog-manychat`).
export const HOMOLOG_MANYCHAT_ENVIRONMENT = 'homolog-manychat'

// Canal homolog e sua variante ManyChat: backend = preview configurado.
export function isHomologEnvironment(environment) {
  return environment === 'homolog' || environment === HOMOLOG_MANYCHAT_ENVIRONMENT
}

// Hosts de canal de conversa que o pacote homolog mantém além do preview.
export const CHANNEL_HOSTS = [
  'https://web.whatsapp.com/*',
  'https://app.manychat.com/*',
  'https://manybot-files.manychat.io/*',
]

// Valida a URL do backend de homologação e devolve a ORIGEM canônica.
// Falha fechado: ausente, não-HTTPS, com caminho/query/fragmento/porta/
// credenciais, com wildcard ou apontando para produção.
export function parseHomologBaseUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''

  if (!value) {
    throw new Error(
      `${HOMOLOG_BASE_URL_ENV} ausente: o canal homolog exige a origem exata do backend de homologação ` +
        '(ex.: https://<preview>.vercel.app).',
    )
  }

  if (value.includes('*')) {
    throw new Error(`${HOMOLOG_BASE_URL_ENV} inválida: wildcard não é permitido ("${value}").`)
  }

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${HOMOLOG_BASE_URL_ENV} inválida: "${value}" não é uma URL.`)
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${HOMOLOG_BASE_URL_ENV} inválida: precisa ser HTTPS ("${value}").`)
  }

  if (
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    value.replace(/\/$/, '').toLowerCase() !== url.origin
  ) {
    throw new Error(
      `${HOMOLOG_BASE_URL_ENV} inválida: precisa ser uma origem exata (https://host), sem caminho, porta, ` +
        `query, fragmento ou credenciais ("${value}").`,
    )
  }

  if (PRODUCTION_ORIGINS.includes(url.origin)) {
    throw new Error(`${HOMOLOG_BASE_URL_ENV} inválida: homologação não pode apontar para produção.`)
  }

  return url.origin
}

export function companionEnvironmentFor(environment, { homologBaseUrl = null } = {}) {
  if (environment === 'dev' || environment === 'e2e') {
    return {
      channel: environment,
      api_base_url: PRODUCTION_BASE_URL,
      allowed_base_urls: [PRODUCTION_BASE_URL, LOCAL_BASE_URL],
      backend_match_required: false,
    }
  }

  if (environment === 'prod') {
    return {
      channel: 'prod',
      api_base_url: PRODUCTION_BASE_URL,
      allowed_base_urls: [PRODUCTION_BASE_URL],
      backend_match_required: false,
    }
  }

  if (environment === 'homolog') {
    const baseUrl = parseHomologBaseUrl(homologBaseUrl)

    return {
      channel: 'homolog',
      api_base_url: baseUrl,
      allowed_base_urls: [baseUrl],
      backend_match_required: true,
    }
  }

  // Mesmo canal homolog (o runtime trata igual: só o preview, conferência
  // de commit, debug HML); `variant` só identifica o pacote com ManyChat
  // ligado no cabeçalho.
  if (environment === HOMOLOG_MANYCHAT_ENVIRONMENT) {
    return {
      ...companionEnvironmentFor('homolog', { homologBaseUrl }),
      variant: 'manychat',
    }
  }

  throw new Error(`companionEnvironmentFor: ambiente desconhecido "${environment}".`)
}

export function renderCompanionEnvironmentSource(config) {
  return [
    ';(function initYolenCompanionEnvironment(root) {',
    '  // Configuração canônica do canal: backend e origens da Yolen',
    '  // autorizadas. Esta fonte versionada é o canal dev; cada pacote',
    '  // (prod, homolog, e2e) recebe este arquivo GERADO por',
    '  // scripts/build-package.mjs. Nunca edite para apontar outro backend:',
    '  // o build falha se esta fonte divergir do canal dev.',
    `  const config = ${JSON.stringify(config, null, 2).replace(/\n/g, '\n  ')}`,
    '',
    '  root.YolenCompanionEnvironment = Object.freeze({',
    '    ...config,',
    '    allowed_base_urls: Object.freeze([...config.allowed_base_urls]),',
    '  })',
    "})(typeof globalThis !== 'undefined' ? globalThis : window)",
    '',
  ].join('\n')
}

export function parseCompanionEnvironmentSource(sourceCode) {
  const match = String(sourceCode).match(/const config = (\{[\s\S]*?\n {2}\})\n/)
  if (!match) {
    return null
  }

  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

// A fonte versionada precisa continuar sendo exatamente o canal dev: ninguém
// aponta o Companion para outro backend editando o arquivo e esquecendo de
// reverter. Roda antes de qualquer build e no verificador.
export function assertCompanionEnvironmentSourceIsSafe({ extensionRoot = EXTENSION_ROOT } = {}) {
  const source = readFileSync(join(extensionRoot, COMPANION_ENVIRONMENT_PATHNAME), 'utf8')

  if (source !== renderCompanionEnvironmentSource(companionEnvironmentFor('dev'))) {
    throw new Error(
      `Guarda de segurança falhou: ${COMPANION_ENVIRONMENT_PATHNAME} foi editado à mão. A fonte versionada ` +
        'precisa ser o canal dev; backends de prod/homolog são injetados pelo build.',
    )
  }
}

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
  if (environment === 'dev' || environment === 'prod' || environment === 'homolog') {
    return FEATURE_FLAGS_SOURCE_DEFAULT
  }
  // homolog-manychat reaproveita a fonte true do e2e (arquivo separado):
  // a fonte normal nunca é editada.
  if (environment === 'e2e' || environment === HOMOLOG_MANYCHAT_ENVIRONMENT) {
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
  homolog: false,
  e2e: true,
  [HOMOLOG_MANYCHAT_ENVIRONMENT]: true,
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

function readFeatureFlagsSourceCode(relativeSourcePath, extensionRoot = EXTENSION_ROOT) {
  return readFileSync(join(extensionRoot, relativeSourcePath), 'utf8')
}

// Defesa da FONTE (STEP 2B.1, seção 11) — roda antes de QUALQUER build
// (normal ou e2e). Nunca confia em "ninguém vai editar o arquivo errado":
// lê os dois arquivos-fonte do disco e falha alto se o normal não for
// exatamente `false` ou o e2e não for exatamente `true`. Isso é o que
// impede alguém de editar src/manychat-feature-flags.js para `true` e
// ainda assim conseguir gerar QUALQUER pacote — inclusive prod.
export function assertFeatureFlagSourcesAreSafe({ extensionRoot = EXTENSION_ROOT } = {}) {
  const defaultValue = parseManyChatCaptureEnabledFromSource(
    readFeatureFlagsSourceCode(FEATURE_FLAGS_SOURCE_DEFAULT, extensionRoot),
  )
  if (defaultValue !== false) {
    throw new Error(
      `Guarda de segurança falhou: ${FEATURE_FLAGS_SOURCE_DEFAULT} precisa declarar MANYCHAT_CAPTURE_ENABLED = false ` +
        `(encontrado: ${defaultValue}). Este arquivo nunca pode virar true — o canal e2e usa ${FEATURE_FLAGS_SOURCE_E2E}.`,
    )
  }

  const e2eValue = parseManyChatCaptureEnabledFromSource(
    readFeatureFlagsSourceCode(FEATURE_FLAGS_SOURCE_E2E, extensionRoot),
  )
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

// `icons` do manifest final aponta para os PNGs que `stageTarget` já
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
// Commit de origem do pacote e2e (FASE 10, LIVE-01): um pacote e2e de um
// commit anterior tinha nome, versão, id e caminho idênticos ao aprovado e
// só se distinguia pelo conteúdo. O nome carrega o commit — visível no
// about:debugging/chrome://extensions — e o validador e2e, que recalcula o
// manifest esperado a partir do checkout atual, recusa um pacote de outro
// commit.
export function readE2ESourceCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

// ---------------------------------------------------------------------------
// Identidade rastreável do pacote (recuperação do especialista comercial,
// release): source atualizado → main atualizada → Firefox recarregado → dist
// antigo já aconteceu. A identidade do pacote não pode depender de memória
// humana. Ela é DETERMINÍSTICA (mesmo código + mesmo commit = mesma
// identidade, preservando a reprodutibilidade do zip) e aparece no painel.
// O horário de build fica só em build-identity.json (fora do zip).
// ---------------------------------------------------------------------------
export const BUILD_IDENTITY_PATHNAME = 'src/build-identity.js'
export const BUILD_IDENTITY_JSON = 'build-identity.json'

function gitOutput(args, cwd = REPO_ROOT) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

// Fontes que de fato entram (ou geram algo que entra) em algum pacote. É
// sobre elas que "alterações locais" é calculado: editar um teste não
// muda o pacote e não deve marcar a identidade como suja.
export function packagedSourcePaths() {
  return [
    ...new Set([
      'manifest.json',
      ...SHARED_RUNTIME_FILES,
      ...CHROME_ONLY_FILES,
      FEATURE_FLAGS_SOURCE_DEFAULT,
      FEATURE_FLAGS_SOURCE_E2E,
      'assets/yolen-mark.png',
    ]),
  ].sort()
}

export function readSourceGitIdentity({ repoRoot = REPO_ROOT, extensionRoot = EXTENSION_ROOT } = {}) {
  const commit = gitOutput(['rev-parse', 'HEAD'], repoRoot)
  const extensionPath = relative(repoRoot, extensionRoot) || '.'
  const status = gitOutput(
    ['status', '--porcelain', '--', ...packagedSourcePaths().map((path) => join(extensionPath, path))],
    repoRoot,
  )

  return {
    commit: commit || null,
    commit_short: commit ? commit.slice(0, 8) : null,
    // Alterações locais não commitadas no código empacotado: o painel
    // mostra "+" para que um pacote de código não versionado nunca se passe
    // por um commit conhecido.
    dirty: status === null ? null : status.length > 0,
  }
}

// Fingerprint do conteúdo de um pacote. Recebe um leitor de conteúdo para
// que o build (bytes já staged) e o verificador (bytes ESPERADOS a partir
// das fontes atuais) usem exatamente o mesmo cálculo.
export function computeFingerprintFromContents(entries, readEntry) {
  const hash = createHash('sha256')

  for (const entry of [...entries].sort()) {
    if (entry === BUILD_IDENTITY_PATHNAME) {
      continue
    }

    hash.update(entry)
    hash.update('\u0000')
    hash.update(readEntry(entry))
    hash.update('\u0000')
  }

  return hash.digest('hex').slice(0, 16)
}

export function computeSourceFingerprint(stagingDir, entries) {
  return computeFingerprintFromContents(entries, (entry) => readFileSync(join(stagingDir, entry)))
}

export function buildIdentityFor({ version, environment, targetName, git, fingerprint, apiBaseUrl = null }) {
  const buildId = createHash('sha256')
    .update([version, environment, targetName, git.commit ?? 'no-commit', git.dirty ? 'dirty' : 'clean', fingerprint].join('|'))
    .digest('hex')
    .slice(0, 12)

  return {
    version,
    commit: git.commit,
    commit_short: git.commit_short,
    dirty: git.dirty,
    source_fingerprint: fingerprint,
    build_id: buildId,
    environment: `${targetName}-${environment}`,
    // Backend que ESTE pacote usa (canal homolog: o preview configurado).
    api_base_url: apiBaseUrl,
  }
}

export function renderBuildIdentitySource(identity) {
  return [
    ';(function initYolenCompanionBuildIdentity(root) {',
    '  // GERADO por build-package.mjs — identidade real deste pacote.',
    `  const identity = Object.freeze(${JSON.stringify(identity, null, 2).replace(/\n/g, '\n  ')})`,
    '',
    '  root.YolenCompanionBuildIdentity = identity',
    "})(typeof globalThis !== 'undefined' ? globalThis : window)",
    '',
  ].join('\n')
}

export function parseBuildIdentitySource(sourceCode) {
  const match = String(sourceCode).match(/Object\.freeze\((\{[\s\S]*?\})\)/)
  if (!match) {
    return null
  }

  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function stampBuildIdentity({ stagingDir, targetName, environment, sourceManifest, entries, repoRoot, extensionRoot, homologBaseUrl }) {
  const git = readSourceGitIdentity({ repoRoot, extensionRoot })
  const fingerprint = computeSourceFingerprint(stagingDir, entries)
  const identity = buildIdentityFor({
    version: sourceManifest.version,
    environment,
    targetName,
    git,
    fingerprint,
    apiBaseUrl: companionEnvironmentFor(environment, { homologBaseUrl }).api_base_url,
  })

  writeFileSync(join(stagingDir, BUILD_IDENTITY_PATHNAME), renderBuildIdentitySource(identity))
  writeFileSync(
    join(stagingDir, BUILD_IDENTITY_JSON),
    `${JSON.stringify({ ...identity, built_at: new Date().toISOString() }, null, 2)}\n`,
  )

  return identity
}

export function toE2EManifest(sourceManifest, targetName, { sourceCommit = readE2ESourceCommit() } = {}) {
  const target = TARGETS[targetName]
  if (!target) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }

  const manifest = target.adaptManifest(structuredClone(sourceManifest))

  manifest.name = `${E2E_NAME} ${sourceCommit}`
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

// Identificação forte do canal homolog: quem abre about:debugging /
// chrome://extensions vê que não é a instalação de produção. Id próprio no
// Firefox: sessão/armazenamento separados da extensão PROD no mesmo perfil.
export const HOMOLOG_NAME = 'Yolen Companion [HML]'
export const HOMOLOG_DESCRIPTION_SUFFIX = ' Homologação interna (backend de preview) — não distribuir.'
export const FIREFOX_HOMOLOG_GECKO_ID = 'yolen-companion-hml@gerson.local'

// Variante com ManyChat: mesmo id Firefox (substitui a HML atual no perfil,
// nunca abre dois painéis no WhatsApp); nome deixa o ManyChat explícito.
export const HOMOLOG_MANYCHAT_NAME = 'Yolen Companion [HML + ManyChat]'
export const HOMOLOG_MANYCHAT_DESCRIPTION_SUFFIX =
  ' Homologação interna (backend de preview) com captura do ManyChat ligada — não distribuir.'

// Transformação PROD → HOMOLOG: mesmo pacote de produção, com o host de
// produção trocado pelo host EXATO do preview configurado em
// host_permissions, content_scripts (bridge da Yolen) e
// web_accessible_resources (page bridge). Nenhum wildcard, nenhum
// localhost, nenhum host de produção sobra.
export function toHomologManifest(sourceManifest, targetName, { homologBaseUrl, manyChat = false } = {}) {
  const baseUrl = parseHomologBaseUrl(homologBaseUrl)
  const previewPattern = `${baseUrl}/*`
  const productionPattern = `${PRODUCTION_BASE_URL}/*`
  const swap = (patterns) => patterns.map((pattern) => (pattern === productionPattern ? previewPattern : pattern))

  const manifest = toProductionManifest(sourceManifest, targetName)

  manifest.name = manyChat ? HOMOLOG_MANYCHAT_NAME : HOMOLOG_NAME
  manifest.description = `${sourceManifest.description}${
    manyChat ? HOMOLOG_MANYCHAT_DESCRIPTION_SUFFIX : HOMOLOG_DESCRIPTION_SUFFIX
  }`
  manifest.host_permissions = swap(manifest.host_permissions ?? [])

  for (const block of [...(manifest.content_scripts ?? []), ...(manifest.web_accessible_resources ?? [])]) {
    if (Array.isArray(block.matches)) {
      block.matches = swap(block.matches)
    }
  }

  if (targetName === 'firefox') {
    manifest.browser_specific_settings = {
      ...manifest.browser_specific_settings,
      gecko: {
        ...manifest.browser_specific_settings?.gecko,
        id: FIREFOX_HOMOLOG_GECKO_ID,
      },
    }
  }

  assertHomologManifestHosts(manifest, baseUrl)
  return manifest
}

// Rede de segurança do manifest homolog: todo host é um canal de conversa
// ou o preview exato; o preview está na permissão, na bridge e no page
// bridge; produção/localhost/wildcard não aparecem em lugar nenhum.
export function assertHomologManifestHosts(manifest, baseUrl) {
  const previewPattern = `${baseUrl}/*`
  const allowed = new Set([...CHANNEL_HOSTS, previewPattern])
  const patterns = [
    ...(manifest.host_permissions ?? []),
    ...(manifest.content_scripts ?? []).flatMap((block) => block.matches ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((block) => block.matches ?? []),
  ]

  const unexpected = patterns.filter((pattern) => !allowed.has(pattern))
  if (unexpected.length > 0) {
    throw new Error(`Manifest homolog com host inesperado: ${[...new Set(unexpected)].join(', ')}`)
  }

  const bridge = (manifest.content_scripts ?? []).find((block) => block.js?.includes('src/yolen-bridge.js'))
  const pageBridge = (manifest.web_accessible_resources ?? []).find((block) =>
    block.resources?.includes('src/yolen-page-bridge.js'),
  )

  if (
    !manifest.host_permissions?.includes(previewPattern) ||
    JSON.stringify(bridge?.matches) !== JSON.stringify([previewPattern]) ||
    JSON.stringify(pageBridge?.matches) !== JSON.stringify([previewPattern])
  ) {
    throw new Error(`Manifest homolog precisa do host exato ${previewPattern} na permissão, na bridge e no page bridge.`)
  }

  const serialized = JSON.stringify(manifest)
  if (/localhost|\*\./i.test(serialized) || PRODUCTION_ORIGINS.some((origin) => serialized.includes(origin))) {
    throw new Error('Manifest homolog não pode conter localhost, wildcard de host nem o host de produção.')
  }
}

export function readSourceManifest(extensionRoot = EXTENSION_ROOT) {
  const raw = readFileSync(join(extensionRoot, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

// Manifest que o pacote de cada ambiente carrega — única implementação,
// usada pelo build e pelo verificador de staging.
export function manifestForEnvironment(sourceManifest, targetName, environment, { homologBaseUrl = null } = {}) {
  const target = TARGETS[targetName]
  if (!target) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }

  if (environment === 'homolog') {
    return toHomologManifest(sourceManifest, targetName, { homologBaseUrl })
  }

  if (environment === HOMOLOG_MANYCHAT_ENVIRONMENT) {
    return toHomologManifest(sourceManifest, targetName, { homologBaseUrl, manyChat: true })
  }

  return environment === 'prod'
    ? toProductionManifest(sourceManifest, targetName)
    : environment === 'e2e'
      ? toE2EManifest(sourceManifest, targetName)
      : target.adaptManifest(sourceManifest)
}

export function renderStagedManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

const ICON_ENTRY_PATTERN = /^assets\/icons\/icon-(\d+)\.png$/

// Conteúdo CANÔNICO esperado de cada arquivo do pacote a partir das fontes
// atuais: manifest transformado para o alvo/ambiente, fonte da feature flag
// selecionada para o ambiente, ícones redimensionados e arquivos copiados.
// O build escreve exatamente estes bytes; o verificador compara o staging
// com eles. A identidade de build (src/build-identity.js) depende do
// fingerprint do restante — ver expectedBuildIdentity.
export function expectedStagedEntryContent({
  entry,
  targetName,
  environment,
  sourceManifest,
  extensionRoot = EXTENSION_ROOT,
  homologBaseUrl = null,
}) {
  if (entry === BUILD_IDENTITY_PATHNAME) {
    throw new Error('A identidade de build depende do fingerprint do pacote — use expectedBuildIdentity.')
  }

  if (entry === 'manifest.json') {
    return Buffer.from(
      renderStagedManifest(manifestForEnvironment(sourceManifest, targetName, environment, { homologBaseUrl })),
    )
  }

  // Configuração do canal: sempre gerada (nunca copiada da fonte).
  if (entry === COMPANION_ENVIRONMENT_PATHNAME) {
    return Buffer.from(renderCompanionEnvironmentSource(companionEnvironmentFor(environment, { homologBaseUrl })))
  }

  if (entry === FEATURE_FLAGS_PATHNAME) {
    return readFileSync(join(extensionRoot, featureFlagSourceForEnvironment(environment)))
  }

  const icon = entry.match(ICON_ENTRY_PATTERN)
  if (icon) {
    return resizePngSquare(readFileSync(join(extensionRoot, 'assets', 'yolen-mark.png')), Number(icon[1]))
  }

  const source = join(extensionRoot, entry)
  if (!existsSync(source)) {
    throw new Error(`Arquivo de origem não existe: ${entry}`)
  }

  return readFileSync(source)
}

// Identidade que um build das fontes atuais carimbaria, calculada sem
// escrever nada (mesmo fingerprint, mesma função de identidade).
export function expectedBuildIdentity({
  targetName,
  environment,
  sourceManifest,
  extensionRoot = EXTENSION_ROOT,
  repoRoot = REPO_ROOT,
  contents = null,
  homologBaseUrl = null,
}) {
  const entries = getTargetZipEntries(targetName)
  const expected =
    contents ??
    new Map(
      entries
        .filter((entry) => entry !== BUILD_IDENTITY_PATHNAME)
        .map((entry) => [
          entry,
          expectedStagedEntryContent({ entry, targetName, environment, sourceManifest, extensionRoot, homologBaseUrl }),
        ]),
    )

  return buildIdentityFor({
    version: sourceManifest.version,
    environment,
    targetName,
    git: readSourceGitIdentity({ repoRoot, extensionRoot }),
    fingerprint: computeFingerprintFromContents(entries, (entry) => expected.get(entry)),
    apiBaseUrl: companionEnvironmentFor(environment, { homologBaseUrl }).api_base_url,
  })
}

export function stagingDirFor(targetName, environment) {
  if (environment === 'prod') {
    return join(OUTPUT_ROOT, targetName, 'prod', 'staging')
  }
  if (environment === 'e2e') {
    return join(E2E_OUTPUT_ROOT, targetName, 'staging')
  }
  if (environment === 'homolog') {
    return join(OUTPUT_ROOT, targetName, 'homolog', 'staging')
  }
  if (environment === HOMOLOG_MANYCHAT_ENVIRONMENT) {
    return join(OUTPUT_ROOT, targetName, HOMOLOG_MANYCHAT_ENVIRONMENT, 'staging')
  }
  return join(OUTPUT_ROOT, targetName, 'staging')
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

function writeStagedEntry(stagingDir, entry, content) {
  const destination = join(stagingDir, entry)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, content)
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

// Canal homolog — só com `--homolog` e YOLEN_COMPANION_HOMOLOG_BASE_URL.
export const HOMOLOG_ENVIRONMENTS = ['homolog']

// Variante homolog com ManyChat — só com `--homolog-manychat` e a mesma URL.
export const HOMOLOG_MANYCHAT_ENVIRONMENTS = [HOMOLOG_MANYCHAT_ENVIRONMENT]

export function zipFileName(targetName, environment, version) {
  if (environment === 'e2e') {
    return `yolen-companion-${targetName}-e2e-v${version}.zip`
  }
  if (environment === 'homolog') {
    return `yolen-companion-${targetName}-homolog-v${version}.zip`
  }
  if (environment === HOMOLOG_MANYCHAT_ENVIRONMENT) {
    return `yolen-companion-${targetName}-homolog-manychat-v${version}.zip`
  }
  return environment === 'prod'
    ? `yolen-companion-${targetName}-prod-v${version}.zip`
    : `yolen-companion-${targetName}-v${version}.zip`
}

// Monta o staging de um alvo/ambiente a partir das fontes. Toda entrada é
// escrita com expectedStagedEntryContent — a MESMA função que o verificador
// usa para saber o que o staging deveria conter. Raízes injetáveis para que
// o ciclo build → verificar → alterar fonte → verificar seja testável numa
// cópia isolada.
export function stageTarget({
  targetName,
  environment,
  sourceManifest,
  extensionRoot = EXTENSION_ROOT,
  repoRoot = REPO_ROOT,
  stagingDir = stagingDirFor(targetName, environment),
  homologBaseUrl = null,
}) {
  if (!TARGETS[targetName]) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }

  // Falha fechado ANTES de apagar/escrever qualquer coisa: ambiente
  // desconhecido ou homolog sem origem válida nunca gera staging.
  const companionEnvironment = companionEnvironmentFor(environment, { homologBaseUrl })

  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(stagingDir, { recursive: true })

  const zipEntries = getTargetZipEntries(targetName)

  // dev/prod sempre pegam a fonte normal da flag, e2e sempre a fonte e2e,
  // mas as duas terminam no MESMO pathname dentro do staging.
  for (const entry of zipEntries) {
    if (entry === BUILD_IDENTITY_PATHNAME) {
      continue
    }
    writeStagedEntry(
      stagingDir,
      entry,
      expectedStagedEntryContent({ entry, targetName, environment, sourceManifest, extensionRoot, homologBaseUrl }),
    )
  }

  // Defesa do EFETIVO da configuração do canal: relê o arquivo staged.
  const stagedEnvironment = parseCompanionEnvironmentSource(
    readFileSync(join(stagingDir, COMPANION_ENVIRONMENT_PATHNAME), 'utf8'),
  )
  if (JSON.stringify(stagedEnvironment) !== JSON.stringify(companionEnvironment)) {
    throw new Error(`BUILD FAIL: ${COMPANION_ENVIRONMENT_PATHNAME} staged não corresponde ao canal "${environment}".`)
  }

  // Defesa do EFETIVO: relê o arquivo já staged (nunca a fonte antes de
  // copiar) e falha o build se o valor não bater com o esperado para este
  // ambiente. Roda antes de zipar — nenhum pacote com o valor errado chega
  // a ser criado.
  const effectiveManyChatCaptureEnabled = parseManyChatCaptureEnabledFromSource(
    readFileSync(join(stagingDir, FEATURE_FLAGS_PATHNAME), 'utf8'),
  )
  assertEffectiveManyChatFlagForEnvironment(environment, effectiveManyChatCaptureEnabled)

  const buildIdentity = stampBuildIdentity({
    stagingDir,
    targetName,
    environment,
    sourceManifest,
    entries: zipEntries,
    repoRoot,
    extensionRoot,
    homologBaseUrl,
  })
  utimesSync(join(stagingDir, BUILD_IDENTITY_PATHNAME), REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)

  return {
    stagingDir,
    entries: zipEntries,
    effectiveManyChatCaptureEnabled,
    companionEnvironment,
    buildIdentity,
  }
}

function buildTarget(targetName, environment, sourceManifest, { outputRoot = OUTPUT_ROOT, homologBaseUrl = null } = {}) {
  const { stagingDir, entries, effectiveManyChatCaptureEnabled, buildIdentity } = stageTarget({
    targetName,
    environment,
    sourceManifest,
    homologBaseUrl,
  })

  const zipPath = join(outputRoot, zipFileName(targetName, environment, sourceManifest.version))
  createZip(stagingDir, zipPath, entries)

  return {
    target: targetName,
    environment,
    zipPath,
    stagingDir,
    sha256: sha256(zipPath),
    entries,
    effectiveManyChatCaptureEnabled,
    buildIdentity,
  }
}

// Parser explícito de argumentos de CLI (STEP 2B.1, seção 7). Sem
// argumento: comportamento normal intacto. `--e2e`: só o canal e2e.
// Qualquer outra coisa: falha fechado — nunca ignora um typo em silêncio.
export function parseBuildCliArgs(argv) {
  const args = argv.slice(2)

  if (args.length === 0) {
    return { e2e: false, homolog: false, homologManyChat: false }
  }

  if (args.length === 1 && args[0] === '--e2e') {
    return { e2e: true, homolog: false, homologManyChat: false }
  }

  if (args.length === 1 && args[0] === '--homolog') {
    return { e2e: false, homolog: true, homologManyChat: false }
  }

  if (args.length === 1 && args[0] === '--homolog-manychat') {
    return { e2e: false, homolog: false, homologManyChat: true }
  }

  throw new Error(
    `Argumento de linha de comando desconhecido: "${args.join(' ')}". ` +
      'Uso: build-package.mjs [--e2e | --homolog | --homolog-manychat]',
  )
}

function buildPackages(environments, sourceManifest, outputRoot, { homologBaseUrl = null } = {}) {
  mkdirSync(outputRoot, { recursive: true })
  return Object.keys(TARGETS).flatMap((targetName) =>
    environments.map((environment) =>
      buildTarget(targetName, environment, sourceManifest, { outputRoot, homologBaseUrl }),
    ),
  )
}

function writeBuildSummary({ results, sourceManifest, outputRoot, fileName, note }) {
  const summary = {
    version: sourceManifest.version,
    generatedAt: new Date().toISOString(),
    note,
    packages: results.map(({ target, environment, zipPath, stagingDir, sha256: hash, entries, effectiveManyChatCaptureEnabled, buildIdentity }) => ({
      target,
      environment,
      zipPath: zipPath.replace(`${REPO_ROOT}/`, ''),
      stagingDir: stagingDir.replace(`${REPO_ROOT}/`, ''),
      sha256: hash,
      fileCount: entries.length,
      entries,
      effectiveManyChatCaptureEnabled,
      buildIdentity,
    })),
  }

  writeFileSync(join(outputRoot, fileName), `${JSON.stringify(summary, null, 2)}\n`)
  return summary
}

function logResults(summary) {
  for (const pkg of summary.packages) {
    console.log(`\n[${pkg.target}/${pkg.environment}] ${pkg.zipPath}`)
    console.log(`  sha256: ${pkg.sha256}`)
    console.log(`  identidade: v${pkg.buildIdentity.version} · commit ${pkg.buildIdentity.commit_short}${pkg.buildIdentity.dirty ? ' (+ alterações locais)' : ''} · build ${pkg.buildIdentity.build_id}`)
    console.log(`  staging: ${pkg.stagingDir}`)
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

const HOMOLOG_MANYCHAT_BUILD_NOTE =
  'Canal HOMOLOG + ManyChat — o mesmo pacote HML (mesmo backend de preview em ' +
  `${HOMOLOG_BASE_URL_ENV}, nunca produção, conferência de commit, mesmo id Firefox), com ` +
  'MANYCHAT_CAPTURE_ENABLED=true vindo de src/manychat-feature-flags.e2e.js. Um pacote para WhatsApp e ' +
  'ManyChat. Nunca distribuir.'

const HOMOLOG_BUILD_NOTE =
  'Canal HOMOLOG — extensão para homologar contra o backend de preview configurado em ' +
  `${HOMOLOG_BASE_URL_ENV}. Aceita SOMENTE esse backend (nunca produção), MANYCHAT_CAPTURE_ENABLED=false, ` +
  'e o painel compara o commit do pacote com o commit do backend. Nunca distribuir.'

function main() {
  const { e2e, homolog, homologManyChat } = parseBuildCliArgs(process.argv)

  // Homolog sem origem válida falha antes de qualquer outra coisa.
  const homologBaseUrl =
    homolog || homologManyChat ? parseHomologBaseUrl(process.env[HOMOLOG_BASE_URL_ENV]) : null

  const sourceManifest = readSourceManifest()
  assertAllowlistMatchesManifest(sourceManifest)
  // Defesa da fonte: roda antes de QUALQUER build, normal ou e2e.
  assertFeatureFlagSourcesAreSafe()
  assertCompanionEnvironmentSourceIsSafe()

  if (homologManyChat) {
    const results = buildPackages(HOMOLOG_MANYCHAT_ENVIRONMENTS, sourceManifest, OUTPUT_ROOT, { homologBaseUrl })
    const summary = writeBuildSummary({
      results,
      sourceManifest,
      outputRoot: OUTPUT_ROOT,
      fileName: 'homolog-manychat-build-summary.json',
      note: HOMOLOG_MANYCHAT_BUILD_NOTE,
    })
    logResults(summary)
    console.log(`\nBackend HML: ${homologBaseUrl} · ManyChat: ligado`)
    console.log(
      `Resumo HOMOLOG + ManyChat escrito em: ${join(OUTPUT_ROOT, 'homolog-manychat-build-summary.json').replace(`${REPO_ROOT}/`, '')}`,
    )
    return
  }

  if (homolog) {
    const results = buildPackages(HOMOLOG_ENVIRONMENTS, sourceManifest, OUTPUT_ROOT, { homologBaseUrl })
    const summary = writeBuildSummary({
      results,
      sourceManifest,
      outputRoot: OUTPUT_ROOT,
      fileName: 'homolog-build-summary.json',
      note: HOMOLOG_BUILD_NOTE,
    })
    logResults(summary)
    console.log(`\nBackend HML: ${homologBaseUrl}`)
    console.log(
      `Resumo HOMOLOG escrito em: ${join(OUTPUT_ROOT, 'homolog-build-summary.json').replace(`${REPO_ROOT}/`, '')}`,
    )
    return
  }

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
