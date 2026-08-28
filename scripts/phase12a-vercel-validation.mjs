import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const outDir = join(process.cwd(), 'public', 'phase12a-validation')
mkdirSync(outDir, { recursive: true })

const gates = [
  ['git-diff-check', 'git', ['diff', '--check']],
  ['test-companion', 'npm', ['run', 'test:companion']],
  ['typescript', 'npx', ['tsc', '--noEmit', '-p', '.']],
  ['eslint', 'npx', ['eslint', "app/admin/configuracao-comercial/AssistedMethodConstruction.tsx", "app/admin/configuracao-comercial/CommercialConfigExperience.tsx", "app/admin/configuracao-comercial/MethodPublicationPanel.tsx", "app/admin/configuracao-comercial/commercial-method-lifecycle-ux.test.mjs", "app/admin/configuracao-comercial/guided-journey/GuidedMethodJourney.tsx", "app/api/admin/commercial-method-builder/method/route.ts", "app/api/admin/commercial-method-builder/route.ts", "app/api/ai/apply-suggestion/route.test.mjs", "app/api/ai/apply-suggestion/route.ts", "app/api/companion/apply-suggestion/route.test.mjs", "app/api/companion/apply-suggestion/route.ts", "app/api/companion/message-action/route.ts", "app/api/companion/method-guidance/route.ts", "app/api/companion/resolve-lead/route.test.mjs", "app/api/companion/resolve-lead/route.ts", "app/api/companion/transcribe-audio/route.ts", "app/components/leads/LeadCopilotPanel.confirmation.test.mjs", "app/components/leads/LeadCopilotPanel.tsx", "app/extension/yolen-companion/src/capture-batch.js", "app/extension/yolen-companion/src/content-script.js", "app/extension/yolen-companion/src/lead-automation.js", "app/extension/yolen-companion/src/message-mutations.js", "app/extension/yolen-companion/src/yolen-api.js", "app/extension/yolen-companion/tests/capture-batch.test.mjs", "app/extension/yolen-companion/tests/content-script-apply-suggestion-confirmation.test.mjs", "app/extension/yolen-companion/tests/content-script-capture-wiring.test.mjs", "app/extension/yolen-companion/tests/content-script-deletion-reason.test.mjs", "app/extension/yolen-companion/tests/e3-dom/content-script-dom-lead-create-conversation-isolation.test.mjs", "app/extension/yolen-companion/tests/e3-test-support/load-content-script.mjs", "app/extension/yolen-companion/tests/lead-automation-flow.test.mjs", "app/extension/yolen-companion/tests/message-mutations.test.mjs", "app/extension/yolen-companion/tests/seller-workspace-final-ux.test.mjs", "app/lib/commercial-config/commercial-method-home.test.mjs", "app/lib/commercial-config/commercial-method-home.ts", "app/lib/commercial-config/method-recompile.test.mjs", "app/lib/companion/capture-ingestion.test.mjs", "app/lib/companion/capture-ingestion.ts", "app/lib/companion/diagnostic-input.ts", "app/lib/companion/durable-memory-seed.test.mjs", "app/lib/companion/durable-memory-seed.ts", "app/lib/companion/e2-test-support/fake-companion-token.mjs", "app/lib/companion/e2-test-support/route-alias-resolve-loader.mjs", "app/lib/companion/lead-seller-guidance-current-interaction.test.mjs", "app/lib/companion/lead-seller-guidance-stage-continuity.test.mjs", "app/lib/companion/lead-seller-guidance.ts", "app/lib/companion/phase12a-background-concurrency.test.mjs", "app/lib/companion/stateful-communication-executor.ts", "app/lib/companion/stateful-communication.test.mjs", "app/lib/companion/stateful-copilot-engine.test.mjs", "app/lib/companion/stateful-copilot-engine.ts", "app/lib/companion/stateful-copilot-execution-plan.test.mjs", "app/lib/companion/stateful-copilot-execution-plan.ts", "app/lib/companion/stateful-copilot-historical-evidence-guidance.test.mjs", "app/lib/companion/stateful-copilot-integrated-service.ts", "app/lib/companion/stateful-copilot-normalizer.test.mjs", "app/lib/companion/stateful-copilot-normalizer.ts", "app/lib/companion/stateful-copilot-real-context-loader.test.mjs", "app/lib/companion/stateful-copilot-real-context-loader.ts", "app/lib/server/commercial-method-builder.test.mjs", "app/lib/server/commercial-method-builder.ts", "app/lib/server/commercial-method-construction.test.mjs", "app/lib/server/commercial-method-construction.ts", "app/lib/server/companion-method-stage-store.test.mjs", "app/lib/server/companion-method-stage-store.ts", "app/lib/server/stateful-copilot-background-worker.ts", "app/lib/server/stateful-copilot-runtime-orchestrator.ts", "app/lib/services/ai-sales-copilot.test.mjs", "app/types/ai-sales.ts", "supabase/phase-tests/phase-12b-message-deletion-reason.test.mjs", "supabase/phase-tests/phase-12b-method-stage-state.test.mjs"]],

  ['f1b-isolation-16', 'node', ['--test', 'app/extension/yolen-companion/tests/e3-dom/content-script-dom-lead-create-conversation-isolation.test.mjs']],
  ['f1b-lead-automation-10', 'node', ['--test', 'app/extension/yolen-companion/tests/lead-automation-flow.test.mjs']],

  ['f2b-directed', 'node', [
    '--conditions=react-server',
    '--import', './scripts/register-typescript-test-loader.mjs',
    '--test',
    'app/api/ai/apply-suggestion/route.test.mjs',
    'app/api/companion/apply-suggestion/route.test.mjs',
    'app/components/leads/LeadCopilotPanel.confirmation.test.mjs',
    'app/extension/yolen-companion/tests/content-script-apply-suggestion-confirmation.test.mjs',
    'app/extension/yolen-companion/tests/content-script-deletion-reason.test.mjs',
    'app/extension/yolen-companion/tests/message-mutations.test.mjs',
    'app/extension/yolen-companion/tests/e3-dom/content-script-dom-message-mutations.test.mjs',
    'app/lib/companion/lead-seller-guidance-stage-continuity.test.mjs',
    'app/lib/companion/capture-ingestion.test.mjs',
    'app/lib/companion/durable-memory-seed.test.mjs',
    'app/lib/companion/phase12a-background-concurrency.test.mjs',
    'app/lib/server/companion-method-stage-store.test.mjs',
  ]],
  ['f2b-db-contracts', 'node', [
    '--test',
    'supabase/phase-tests/phase-12b-message-deletion-reason.test.mjs',
    'supabase/phase-tests/phase-12b-method-stage-state.test.mjs',
  ]],

  ['f3-commercial-method', 'node', [
    '--conditions=react-server',
    '--import', './scripts/register-typescript-test-loader.mjs',
    '--test',
    'app/admin/configuracao-comercial/commercial-method-lifecycle-ux.test.mjs',
    'app/lib/commercial-config/commercial-method-home.test.mjs',
    'app/lib/commercial-config/method-recompile.test.mjs',
    'app/lib/server/commercial-method-builder.test.mjs',
    'app/lib/server/commercial-method-construction.test.mjs',
  ]],

  ['adversarial', 'node', [
    '--conditions=react-server',
    '--import', './scripts/register-typescript-test-loader.mjs',
    '--test',
    'app/extension/yolen-companion/tests/e3-dom/content-script-dom-analysis-context-guard.test.mjs',
    'app/extension/yolen-companion/tests/e3-dom/content-script-dom-analysis-request-lifecycle.test.mjs',
    'app/extension/yolen-companion/tests/e3-dom/content-script-dom-deep-analysis-delivery.test.mjs',
    'app/extension/yolen-companion/tests/deep-analysis-freshness.test.mjs',
    'app/lib/companion/phase12a-background-analysis-foundation.test.mjs',
    'app/lib/server/stateful-copilot-background-job.test.mjs',
    'app/lib/server/stateful-copilot-runtime-orchestrator.test.mjs',
    'app/lib/server/companion-client-context-loader.test.mjs',
    'app/lib/server/companion-conversation-registration-loader.test.mjs',
  ]],

  ['e3-dom', 'node', ['--test', 'app/extension/yolen-companion/tests/e3-dom/*.test.mjs']],

  ['extension-build', 'node', ['app/extension/yolen-companion/scripts/build-package.mjs']],
  ['validate-release-candidate', 'node', ['app/extension/yolen-companion/scripts/validate-release-candidate.mjs']],
]

const summary = []
for (const [name, command, args] of gates) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: name === 'e3-dom',
    maxBuffer: 1024 * 1024 * 20,
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const code = typeof result.status === 'number' ? result.status : 127
  writeFileSync(join(outDir, name + '.log'), stdout + '\n--- STDERR ---\n' + stderr)
  writeFileSync(join(outDir, name + '.exit'), String(code) + '\n')
  summary.push(name + '=' + code)
  console.log('PHASE12A_GATE ' + name + '=' + code)
}

for (const [source, target] of [
  ['dist/yolen-companion/build-summary.json', 'build-summary.json'],
  ['dist/yolen-companion/release-candidate-report.json', 'release-candidate-report.json'],
  ['dist/yolen-companion/firefox/staging/manifest.json', 'firefox-staging-manifest.json'],
  ['dist/yolen-companion/firefox/prod/manifest.json', 'firefox-prod-manifest.json'],
  ['dist/yolen-companion/chrome/staging/manifest.json', 'chrome-staging-manifest.json'],
  ['dist/yolen-companion/chrome/prod/manifest.json', 'chrome-prod-manifest.json'],
]) {
  if (existsSync(source)) copyFileSync(source, join(outDir, target))
}

writeFileSync(join(outDir, 'summary.txt'), summary.join('\n') + '\n')

const build = spawnSync('npx', ['next', 'build'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 20,
})
writeFileSync(
  join(outDir, 'next-build.log'),
  (build.stdout ?? '') + '\n--- STDERR ---\n' + (build.stderr ?? ''),
)
writeFileSync(join(outDir, 'next-build.exit'), String(build.status ?? 127) + '\n')
console.log('PHASE12A_GATE next-build=' + String(build.status ?? 127))

process.exit(build.status ?? 1)
