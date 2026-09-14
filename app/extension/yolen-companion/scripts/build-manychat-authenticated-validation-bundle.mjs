import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const EXTENSION_ROOT = join(SCRIPT_DIR, '..')
export const REPO_ROOT = join(EXTENSION_ROOT, '..', '..', '..')
export const OUTPUT_DIR = join(REPO_ROOT, 'dist', 'yolen-companion-diagnostics')
export const OUTPUT_FILE = join(
  OUTPUT_DIR,
  'manychat-authenticated-validation.js',
)

export const SOURCE_FILES = Object.freeze([
  'src/platform-contract.js',
  'src/manychat-surface.js',
  'src/manychat-evidence-probe.js',
  'src/manychat-profile-gate.js',
  'src/manychat-profile-validator.js',
  'src/manychat-authenticated-validation-harness.js',
])

function sourceBanner(path) {
  return `\n/* ===== ${path} ===== */\n`
}

export function buildBundleContent(extensionRoot = EXTENSION_ROOT) {
  const pieces = [
    `/*\n * Yolen Companion — ManyChat Authenticated Validation Bundle\n * Diagnóstico manual. Não é carregado pelo manifest e não envia dados.\n */\n`,
  ]

  for (const path of SOURCE_FILES) {
    const absolutePath = join(extensionRoot, path)
    pieces.push(sourceBanner(path))
    pieces.push(readFileSync(absolutePath, 'utf8'))
    pieces.push('\n')
  }

  pieces.push(`\n;(function exposeYolenManyChatValidationFactory(root) {\n`)
  pieces.push(`  if (!root.YolenManyChatAuthenticatedValidationHarness) {\n`)
  pieces.push(`    throw new Error('Harness ManyChat não foi carregado pelo bundle.')\n`)
  pieces.push(`  }\n`)
  pieces.push(`  root.createYolenManyChatAuthenticatedValidation = function createValidation(options) {\n`)
  pieces.push(`    return root.YolenManyChatAuthenticatedValidationHarness\n`)
  pieces.push(`      .createManyChatAuthenticatedValidationHarness(options || {})\n`)
  pieces.push(`  }\n`)
  pieces.push(`})(typeof globalThis !== 'undefined' ? globalThis : this)\n`)

  return pieces.join('')
}

export function writeBundle(options = {}) {
  const outputFile = options.outputFile ?? OUTPUT_FILE
  const extensionRoot = options.extensionRoot ?? EXTENSION_ROOT
  const content = buildBundleContent(extensionRoot)

  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, content, 'utf8')

  return Object.freeze({
    outputFile,
    sourceFiles: SOURCE_FILES,
    bytes: Buffer.byteLength(content, 'utf8'),
  })
}

const directRun =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (directRun) {
  const result = writeBundle()
  process.stdout.write(`${result.outputFile}\n`)
}
