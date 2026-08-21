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

const HARDENED_MANAGERIAL_MODULE = 'managerial-intelligence-hardening'
const HARDENED_RUNTIME_ENTRYPOINT = 'buildHardenedManagerialIntelligence'

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

function hardeningImportViolations(source) {
  const violations = []
  const staticImports = []
  const staticImportPattern =
    /\bimport\s+([^;]*?)\s+from\s*['"]([^'"]+)['"]/g

  let match
  while ((match = staticImportPattern.exec(source)) !== null) {
    if (!match[2].includes(HARDENED_MANAGERIAL_MODULE)) {
      continue
    }

    staticImports.push(match[0])
    const clause = match[1].trim()

    if (clause.startsWith('type ')) {
      continue
    }

    const namedMatch = clause.match(/^\{([\s\S]*)\}$/)
    if (!namedMatch) {
      violations.push('import não nomeado do boundary hardened')
      continue
    }

    const bindings = namedMatch[1]
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)

    for (const binding of bindings) {
      if (binding.startsWith('type ')) {
        continue
      }

      const importedName = binding.split(/\s+as\s+/)[0].trim()
      if (importedName !== HARDENED_RUNTIME_ENTRYPOINT) {
        violations.push(`importa ${importedName} do boundary hardened`)
      }
    }
  }

  const withoutStaticImports = staticImports.reduce(
    (result, statement) => result.replace(statement, ''),
    source,
  )

  const unsafePatterns = [
    new RegExp(
      `\\bimport\\s*\\(\\s*['\"][^'\"]*${HARDENED_MANAGERIAL_MODULE}[^'\"]*['\"]\\s*\\)`,
      'g',
    ),
    new RegExp(
      `\\brequire\\s*\\(\\s*['\"][^'\"]*${HARDENED_MANAGERIAL_MODULE}[^'\"]*['\"]\\s*\\)`,
      'g',
    ),
    new RegExp(
      `\\bimport\\s*['\"][^'\"]*${HARDENED_MANAGERIAL_MODULE}[^'\"]*['\"]`,
      'g',
    ),
  ]

  for (const pattern of unsafePatterns) {
    if (pattern.test(withoutStaticImports)) {
      violations.push('carrega o boundary hardened sem entrypoint nomeado')
    }
  }

  return violations
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
  'consumidores de runtime só podem entrar no boundary pelo build hardened',
  () => {
    const root = process.cwd()
    const files = []
    collectSourceFiles(root, root, files)

    const violations = []

    for (const file of files) {
      if (isManagerialTest(file.repositoryPath)) {
        continue
      }

      if (
        file.repositoryPath ===
        'app/lib/companion/managerial-intelligence-hardening.ts'
      ) {
        continue
      }

      const source = readFileSync(file.absolutePath, 'utf8')
      for (const violation of hardeningImportViolations(source)) {
        violations.push(`${file.repositoryPath}: ${violation}`)
      }
    }

    assert.deepEqual(
      violations,
      [],
      [
        'O único entrypoint de runtime da inteligência gerencial é',
        'buildHardenedManagerialIntelligence.',
        'Helpers internos do boundary não podem ser consumidos diretamente.',
      ].join(' '),
    )
  },
)

test(
  'boundary hardened continua exportando o entrypoint gerencial obrigatório',
  async () => {
    const boundary = await import('./managerial-intelligence-hardening.ts')

    assert.equal(
      typeof boundary.buildHardenedManagerialIntelligence,
      'function',
    )
  },
)
