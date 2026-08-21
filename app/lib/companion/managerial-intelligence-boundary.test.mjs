import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import test from 'node:test'

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
])

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.vercel',
  'node_modules',
  'coverage',
  'dist',
  'build',
])

const INTERNAL_MANAGERIAL_MODULES = [
  'managerial-evidence-extractor',
  'managerial-evidence-aggregator',
  'managerial-signal-classifier',
  'managerial-priority-classifier',
  'managerial-recommendation-classifier',
  'managerial-intelligence-assembler',
]

const ALLOWED_RUNTIME_INTERNAL_CONSUMERS = new Set([
  'app/lib/companion/managerial-evidence-aggregator.ts',
  'app/lib/companion/managerial-signal-classifier.ts',
  'app/lib/companion/managerial-priority-classifier.ts',
  'app/lib/companion/managerial-recommendation-classifier.ts',
  'app/lib/companion/managerial-intelligence-assembler.ts',
  'app/lib/companion/managerial-intelligence-hardening.ts',
])

function normalizePath(value) {
  return value.split('\\').join('/')
}

function collectSourceFiles(directory, root, result) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        collectSourceFiles(join(directory, entry.name), root, result)
      }
      continue
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) {
      continue
    }

    const absolutePath = join(directory, entry.name)
    result.push({
      absolutePath,
      repositoryPath: normalizePath(relative(root, absolutePath)),
    })
  }
}

function importedSpecifiers(source) {
  const specifiers = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1])
    }
  }

  return specifiers
}

function isManagerialTest(repositoryPath) {
  return /^app\/lib\/companion\/managerial-.*\.test\.mjs$/.test(
    repositoryPath,
  )
}

function isAllowedInternalConsumer(repositoryPath) {
  return (
    ALLOWED_RUNTIME_INTERNAL_CONSUMERS.has(repositoryPath) ||
    isManagerialTest(repositoryPath)
  )
}

test(
  'consumidores futuros da inteligência gerencial não podem pular o boundary hardened',
  () => {
    const root = process.cwd()
    const files = []
    collectSourceFiles(root, root, files)

    const violations = []

    for (const file of files) {
      if (isAllowedInternalConsumer(file.repositoryPath)) {
        continue
      }

      const source = readFileSync(file.absolutePath, 'utf8')
      const specifiers = importedSpecifiers(source)

      for (const specifier of specifiers) {
        const internalModule = INTERNAL_MANAGERIAL_MODULES.find(moduleName =>
          specifier.includes(moduleName),
        )

        if (internalModule) {
          violations.push(
            `${file.repositoryPath} importa diretamente ${internalModule}`,
          )
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      [
        'A inteligência gerencial endurecida é o boundary obrigatório.',
        'Consumidores de runtime devem usar buildHardenedManagerialIntelligence',
        'em managerial-intelligence-hardening.ts, nunca o pipeline A5 diretamente.',
      ].join(' '),
    )
  },
)

test(
  'boundary hardened continua exportando o único entrypoint gerencial de runtime',
  async () => {
    const boundary = await import('./managerial-intelligence-hardening.ts')

    assert.equal(
      typeof boundary.buildHardenedManagerialIntelligence,
      'function',
    )
  },
)
