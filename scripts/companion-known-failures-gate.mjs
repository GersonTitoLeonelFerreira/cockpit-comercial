import { spawnSync } from 'node:child_process'

const knownFailures = {
  companion: new Set([
    'B3.3 renderiza método, etapa atual e seis status oficiais',
    'AGORA mantém decisão principal e acrescenta técnica contextual sem criar nova prioridade',
    'melhoria mostra ocorrência, importância, impacto e correção',
    'mensagem de texto não entra no gate de áudio',
    'Final Release autoriza somente produção e desenvolvimento local',
    'acerto do vendedor exige ação concreta e evidência da conversa',
    'ponto de melhoria exige problema comprovado em mensagem',
    'guardrail exige recovery completo quando a conversa sai do método',
  ]),

  e3: new Set([
    'runtime final captura cartão PDF sem data-pre-plain-text usando data cronológica dos vizinhos',
    'V2 rico distribui prioridade, coaching, método, recovery e cliente nas áreas corretas',
  ]),
}

const suites = {
  companion: {
    label: 'TEST:COMPANION',
    command: [
      'node',
      '--conditions=react-server',
      '--import ./scripts/register-typescript-test-loader.mjs',
      '--test',
      '--test-reporter=tap',
      'app/lib/companion/*.test.mjs',
      'app/extension/yolen-companion/tests/*.test.mjs',
    ].join(' '),
  },

  e3: {
    label: 'E3',
    command: [
      'node',
      '--test',
      '--test-force-exit',
      '--test-reporter=tap',
      'app/extension/yolen-companion/tests/e3-dom/*.test.mjs',
    ].join(' '),
  },
}

function normalizeTestName(value) {
  return String(value || '')
    .replace(/\s+#.*$/, '')
    .trim()
}

function collectFailedTests(output) {
  const failures = []

  const pattern =
    /^\s*not ok\s+\d+\s*-\s*(.+)$/gm

  for (const match of output.matchAll(pattern)) {
    const name =
      normalizeTestName(match[1])

    if (name) {
      failures.push(name)
    }
  }

  return [...new Set(failures)]
}

function printList(title, values) {
  console.log(`\n${title}:`)

  if (values.length === 0) {
    console.log('  NONE')
    return
  }

  for (const value of values) {
    console.log(`  - ${value}`)
  }
}

const suiteName =
  process.argv[2]

if (!Object.prototype.hasOwnProperty.call(suites, suiteName)) {
  console.error(
    'Uso: node scripts/companion-known-failures-gate.mjs <companion|e3>',
  )

  process.exit(2)
}

const suite =
  suites[suiteName]

const allowed =
  knownFailures[suiteName]

console.log(
  `\n=== ${suite.label} — ZERO NEW REGRESSIONS GATE ===`,
)

console.log(`\nCommand:\n${suite.command}\n`)

const result =
  spawnSync(
    'bash',
    [
      '-lc',
      suite.command,
    ],
    {
      encoding: 'utf8',
      env: process.env,
      maxBuffer:
        50 * 1024 * 1024,
    },
  )

if (result.stdout) {
  process.stdout.write(result.stdout)
}

if (result.stderr) {
  process.stderr.write(result.stderr)
}

if (result.error) {
  console.error(
    '\nTEST RUNNER ERROR:',
    result.error,
  )

  process.exit(1)
}

if (result.signal) {
  console.error(
    `\nTEST RUNNER TERMINATED BY SIGNAL: ${result.signal}`,
  )

  process.exit(1)
}

const combinedOutput =
  `${result.stdout || ''}\n${result.stderr || ''}`

const failedTests =
  collectFailedTests(
    combinedOutput,
  )

if (
  result.status !== 0 &&
  failedTests.length === 0
) {
  console.error(
    '\nThe test command failed but no TAP test failure could be identified.',
  )

  console.error(
    'Treating this as runner/infrastructure failure.',
  )

  process.exit(1)
}

const knownRemaining =
  failedTests.filter(
    (name) =>
      allowed.has(name),
  )

const newFailures =
  failedTests.filter(
    (name) =>
      !allowed.has(name),
  )

const resolvedFailures =
  [...allowed].filter(
    (name) =>
      !failedTests.includes(name),
  )

printList(
  'KNOWN FAILURE',
  knownRemaining,
)

printList(
  'RESOLVED FAILURE',
  resolvedFailures,
)

printList(
  'NEW FAILURE',
  newFailures,
)

console.log(
  `\nSUMMARY: ${failedTests.length} failure(s), ${knownRemaining.length} known, ${newFailures.length} new.`,
)

if (newFailures.length > 0) {
  console.error(
    '\nGATE: FAIL — new regression detected.',
  )

  process.exit(1)
}

console.log(
  '\nGATE: PASS — no new regression detected.',
)

process.exit(0)
