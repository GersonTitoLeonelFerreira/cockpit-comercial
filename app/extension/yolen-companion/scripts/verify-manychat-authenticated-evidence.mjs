import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const artifactApi = require('../src/manychat-authenticated-evidence-artifact.js')

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

function main() {
  const reportPath = process.argv[2]
  const expectedProfileFingerprint = process.argv[3] ?? null

  if (!reportPath) {
    fail(
      'Uso: node app/extension/yolen-companion/scripts/verify-manychat-authenticated-evidence.mjs <report.json> [expectedProfileFingerprint]',
    )
    return
  }

  let report
  try {
    report = JSON.parse(readFileSync(resolve(reportPath), 'utf8'))
  } catch (error) {
    fail(`Não foi possível ler o relatório JSON: ${error.message}`)
    return
  }

  try {
    const artifact = artifactApi.verifyAuthenticatedEvidenceReport(report, {
      expectedProfileFingerprint,
    })
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`)
  } catch (error) {
    fail(`${error.code ?? 'EVIDENCE_VERIFICATION_FAILED'}: ${error.message}`)
  }
}

main()
