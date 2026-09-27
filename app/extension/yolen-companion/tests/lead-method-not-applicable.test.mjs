import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

function read(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  )
}

test('renderer fica em silêncio comercial sem etapa nem retry', () => {
  const sandbox = {
    console,
    module: { exports: {} },
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(
    read('../src/companion-lead-summary-view.js'),
    sandbox,
  )

  const html = sandbox.module.exports.renderMethodGuidance({
    status: 'not_applicable',
    method_name: 'Metodo ATO',
    stage_name: null,
    next_step: null,
  })

  assert.match(
    html,
    /Sem próximo passo comercial neste momento\./,
  )
  assert.doesNotMatch(html, /Etapa:/)
  assert.doesNotMatch(html, /Tentar novamente/)
})

// FASE 5: o teste de cache de not_applicable exercitava
// lead-method-guidance-runtime.js, runtime legado ausente de qualquer
// manifest desde a FASE 16.9 (ver phase16-regate-single-guidance-authority)
// e removido na FASE 5 junto com o seu wrapper de loadLeadSummary.
