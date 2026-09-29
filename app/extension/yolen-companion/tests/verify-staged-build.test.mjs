import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  EXTENSION_ROOT,
  FEATURE_FLAGS_PATHNAME,
  readSourceManifest,
  stageTarget,
} from '../scripts/build-package.mjs'
import { verifyStagedBuild } from '../scripts/verify-staged-build.mjs'

// Ciclo real que falhou em produção: fonte atualizada, Firefox recarregado a
// partir de um staging antigo. O verificador precisa acusar QUALQUER
// divergência entre o staging e o que as fontes atuais produzem — inclusive
// nos arquivos gerados (manifest PROD, feature flag efetiva, ícones), que
// antes eram pulados.

function isolatedCopy() {
  const root = mkdtempSync(join(tmpdir(), 'yolen-verify-staged-'))
  const extensionRoot = join(root, 'extension')

  cpSync(EXTENSION_ROOT, extensionRoot, {
    recursive: true,
    filter: (source) => !/[\\/](tests|node_modules)([\\/]|$)/.test(source.slice(EXTENSION_ROOT.length)),
  })

  return {
    root,
    extensionRoot,
    stagingDir: join(root, 'dist', 'firefox', 'prod', 'staging'),
  }
}

function build(copy) {
  return stageTarget({
    targetName: 'firefox',
    environment: 'prod',
    sourceManifest: readSourceManifest(copy.extensionRoot),
    extensionRoot: copy.extensionRoot,
    repoRoot: copy.root,
    stagingDir: copy.stagingDir,
  })
}

function verify(copy) {
  return verifyStagedBuild({
    targetName: 'firefox',
    environment: 'prod',
    extensionRoot: copy.extensionRoot,
    repoRoot: copy.root,
    stagingDir: copy.stagingDir,
  })
}

// Altera uma fonte SEM rebuild, exige DESATUALIZADO com o motivo certo,
// restaura e exige ATUAL de novo (sem rebuild: o staging volta a bater).
function assertDetectsSourceChange(copy, relativePath, mutate, expectedProblem) {
  const path = join(copy.extensionRoot, relativePath)
  const original = readFileSync(path)

  writeFileSync(path, mutate(original))

  const stale = verify(copy)
  assert.equal(stale.fresh, false, `${relativePath}: alteração não detectada`)
  assert.ok(
    stale.problems.some((problem) => expectedProblem.test(problem)),
    `${relativePath}: ${stale.problems.join(' | ')}`,
  )

  writeFileSync(path, original)

  assert.equal(verify(copy).fresh, true, `${relativePath}: restaurar a fonte deveria voltar a ATUAL`)
}

test('build → ATUAL → fonte alterada sem rebuild → DESATUALIZADO → rebuild → ATUAL', () => {
  const copy = isolatedCopy()

  try {
    const built = build(copy)
    assert.equal(built.effectiveManyChatCaptureEnabled, false)

    const fresh = verify(copy)
    assert.deepEqual(fresh.problems, [])
    assert.equal(fresh.fresh, true)
    assert.equal(fresh.identity.build_id, built.buildIdentity.build_id)
    assert.deepEqual(fresh.expectedIdentity, built.buildIdentity)

    // Manifest: mudança que NÃO é a versão (antes o manifest era pulado e
    // só a versão era comparada).
    assertDetectsSourceChange(
      copy,
      'manifest.json',
      (content) => {
        const manifest = JSON.parse(content.toString('utf8'))
        manifest.description = `${manifest.description} (alterado)`
        return `${JSON.stringify(manifest, null, 2)}\n`
      },
      /manifest\.json do staging difere do manifest prod/,
    )

    // Manifest: host novo que a transformação PROD mantém.
    assertDetectsSourceChange(
      copy,
      'manifest.json',
      (content) => {
        const manifest = JSON.parse(content.toString('utf8'))
        manifest.host_permissions = [...manifest.host_permissions, 'https://example.com/*']
        return `${JSON.stringify(manifest, null, 2)}\n`
      },
      /manifest\.json do staging difere/,
    )

    // Manifest: versão.
    assertDetectsSourceChange(
      copy,
      'manifest.json',
      (content) => {
        const manifest = JSON.parse(content.toString('utf8'))
        manifest.version = '9.9.9'
        return `${JSON.stringify(manifest, null, 2)}\n`
      },
      /Versão do pacote .* != manifest atual 9\.9\.9/,
    )

    // Feature flag: qualquer mudança na fonte selecionada para PROD.
    assertDetectsSourceChange(
      copy,
      FEATURE_FLAGS_PATHNAME,
      (content) => `${content.toString('utf8')}\n// alteração local\n`,
      /Feature flag efetiva do staging .* difere da fonte selecionada para prod/,
    )

    // Feature flag: valor efetivo virando true na fonte.
    assertDetectsSourceChange(
      copy,
      FEATURE_FLAGS_PATHNAME,
      (content) =>
        content
          .toString('utf8')
          .replace(/MANYCHAT_CAPTURE_ENABLED\s*=\s*false/, 'MANYCHAT_CAPTURE_ENABLED = true'),
      /Feature flag efetiva do staging/,
    )

    // Ícone de origem: os PNGs gerados deixam de corresponder.
    assertDetectsSourceChange(
      copy,
      'assets/yolen-mark.png',
      () => readFileSync(join(copy.stagingDir, 'assets', 'icons', 'icon-128.png')),
      /Ícone gerado difere/,
    )

    // Código de runtime.
    assertDetectsSourceChange(
      copy,
      'src/companion-core.js',
      (content) => `${content.toString('utf8')}\n// alteração local\n`,
      /Arquivo do staging difere do código-fonte atual: src\/companion-core\.js/,
    )

    // Alteração real + rebuild: volta a ATUAL com outra identidade.
    const corePath = join(copy.extensionRoot, 'src', 'companion-core.js')
    writeFileSync(corePath, `${readFileSync(corePath, 'utf8')}\n// nova versão do código\n`)
    assert.equal(verify(copy).fresh, false)

    const rebuilt = build(copy)
    const afterRebuild = verify(copy)
    assert.deepEqual(afterRebuild.problems, [])
    assert.notEqual(rebuilt.buildIdentity.build_id, built.buildIdentity.build_id)
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})

test('staging editado à mão ou com arquivo estranho é DESATUALIZADO', () => {
  const copy = isolatedCopy()

  try {
    build(copy)
    assert.equal(verify(copy).fresh, true)

    const stagedManifest = join(copy.stagingDir, 'manifest.json')
    const original = readFileSync(stagedManifest)
    writeFileSync(stagedManifest, original.toString('utf8').replace('"manifest_version": 3', '"manifest_version": 3 '))

    const tampered = verify(copy)
    assert.equal(tampered.fresh, false)
    assert.ok(tampered.problems.some((problem) => /manifest\.json do staging difere/.test(problem)))
    assert.ok(tampered.problems.some((problem) => /Fingerprint do staging/.test(problem)))

    writeFileSync(stagedManifest, original)
    writeFileSync(join(copy.stagingDir, 'src', 'debug-local.js'), '// sobra\n')

    const extra = verify(copy)
    assert.equal(extra.fresh, false)
    assert.ok(extra.problems.some((problem) => /Arquivo inesperado no staging.*src\/debug-local\.js/.test(problem)))
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})
