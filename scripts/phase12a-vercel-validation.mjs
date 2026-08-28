import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const BASE = '369bccbc2da091b6a464f24d9ecea4f1e63cd123'
const CANDIDATE = '39e724b0fbe87c3dd2f0432b437d6183ed7ac705'
const outDir = path.join(process.cwd(), 'public', 'phase12a-validation')
mkdirSync(outDir, { recursive: true })

function run(name, command) {
  const startedAt = new Date().toISOString()
  const result = spawnSync('bash', ['-lc', command], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const output = [result.stdout || '', result.stderr || ''].join('\n')
  const exitCode = typeof result.status === 'number' ? result.status : 1
  writeFileSync(path.join(outDir, `${name}.log.txt`), output)
  return {
    name,
    command,
    exitCode,
    startedAt,
    finishedAt: new Date().toISOString(),
    tail: output.slice(-24000),
  }
}

const gates = []

gates.push(run(
  'diff-check',
  `git fetch origin ${BASE} --depth=1 && git diff --check ${BASE} HEAD`,
))

gates.push(run('test-companion', 'npm run test:companion'))
gates.push(run('typescript', 'npx tsc --noEmit -p .'))

gates.push(run(
  'eslint',
  `FILES="$(git diff --name-only ${BASE} HEAD -- '*.ts' '*.tsx' '*.js' '*.mjs' | tr '\\n' ' ')"; if [ -z "$FILES" ]; then echo "No lintable changed files"; exit 0; fi; npx eslint $FILES`,
))

gates.push(run(
  'f1b-isolation-16',
  'node --test app/extension/yolen-companion/tests/e3-dom/content-script-dom-lead-create-conversation-isolation.test.mjs',
))

gates.push(run(
  'f1b-lead-automation-10',
  'node --test app/extension/yolen-companion/tests/lead-automation-flow.test.mjs',
))

gates.push(run(
  'f2b-directed',
  'node --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs --test app/api/ai/apply-suggestion/route.test.mjs app/api/companion/apply-suggestion/route.test.mjs app/extension/yolen-companion/tests/content-script-apply-suggestion-confirmation.test.mjs app/extension/yolen-companion/tests/content-script-deletion-reason.test.mjs app/extension/yolen-companion/tests/message-mutations.test.mjs app/lib/companion/lead-seller-guidance-stage-continuity.test.mjs app/lib/server/companion-method-stage-store.test.mjs app/lib/companion/durable-memory-seed.test.mjs app/lib/companion/capture-ingestion.test.mjs app/lib/companion/phase12a-background-concurrency.test.mjs',
))

gates.push(run(
  'f2b-db-contracts',
  'node --test supabase/phase-tests/phase-12b-message-deletion-reason.test.mjs supabase/phase-tests/phase-12b-method-stage-state.test.mjs',
))

gates.push(run(
  'f3-commercial-method',
  'node --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs --test app/lib/commercial-config/assisted-method-construction.test.mjs app/lib/commercial-config/buyer-decision-architecture.test.mjs app/lib/commercial-config/method-recompile.test.mjs app/lib/commercial-config/smart-method-synthesis.test.mjs app/lib/commercial-config/validation.test.mjs app/lib/commercial-config/onda8-final-academia-end-to-end.test.mjs app/lib/commercial-config/commercial-method-builder.test.mjs app/lib/server/commercial-method-builder.test.mjs app/lib/server/commercial-method-construction.test.mjs app/lib/server/commercial-method-publish.test.mjs app/lib/server/commercial-config.test.mjs app/admin/configuracao-comercial/commercial-method-builder-text-editing.test.mjs app/admin/configuracao-comercial/commercial-method-lifecycle-ux.test.mjs app/lib/commercial-config/commercial-method-home.test.mjs',
))

gates.push(run(
  'e3-dom',
  'node --test app/extension/yolen-companion/tests/e3-dom/*.test.mjs',
))

gates.push(run(
  'build-extension',
  'node app/extension/yolen-companion/scripts/build-package.mjs',
))

gates.push(run(
  'validate-release-candidate',
  'node app/extension/yolen-companion/scripts/validate-release-candidate.mjs',
))

const reports = {}
for (const [key, file] of [
  ['buildSummary', 'dist/yolen-companion/build-summary.json'],
  ['releaseCandidate', 'dist/yolen-companion/release-candidate-report.json'],
]) {
  if (existsSync(file)) {
    try {
      reports[key] = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      reports[key] = null
    }
  }
}

const summary = {
  candidate: CANDIDATE,
  base: BASE,
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  gates,
  reports,
}

writeFileSync(
  path.join(process.cwd(), 'public', 'phase12a-validation.json'),
  JSON.stringify(summary, null, 2),
)

console.log(JSON.stringify({
  candidate: CANDIDATE,
  gates: gates.map(({ name, exitCode }) => ({ name, exitCode })),
}, null, 2))

process.exit(0)
