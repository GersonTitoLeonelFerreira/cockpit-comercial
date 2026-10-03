// Rodada 15 (botão de produção, parte 1): a leitura completa por usuário.
//
// - preview: COMPANION_FULL_READING_PANEL=on liga para qualquer usuário
//   (igual a hoje);
// - production: só com a flag on e o usuário em
//   COMPANION_FULL_READING_SELLER_IDS;
// - qualquer outro ambiente: desligado.
// A regra global (isFullReadingPanelEnabled / isLegacyCompanionAiDisabled)
// continua só no preview. IDs sintéticos; nenhum banco real.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isFullReadingEnabledForUser,
  isFullReadingPanelEnabled,
  isLegacyCompanionAiDisabled,
  parseFullReadingSellerIds,
} from '../server/full-reading-flag.ts'

import {
  loadFullReadingPanelForRequest,
} from '../server/full-reading-panel.ts'

const USER = '10000000-0000-4000-8000-0000000000a1'
const OTHER = '10000000-0000-4000-8000-0000000000a2'
const COMPANY = '10000000-0000-4000-8000-000000000001'
const CYCLE = '20000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000000'
const NOW = '2026-10-03T15:00:00.000Z'

const PRODUCTION = { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' }

// Sem o segundo argumento, o usuário é USER; `undefined` explícito vale.
function enabled(env, ...user) {
  return isFullReadingEnabledForUser({ env, userId: user.length > 0 ? user[0] : USER })
}

test('regra: preview com a flag ligada liga para qualquer usuário (igual a hoje); desligada, ninguém', () => {
  const preview = { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }

  assert.equal(enabled(preview, USER), true)
  assert.equal(enabled(preview, OTHER), true)
  // Preview não depende da lista nem do usuário.
  assert.equal(enabled({ ...preview, COMPANION_FULL_READING_SELLER_IDS: OTHER }, USER), true)
  assert.equal(enabled(preview, undefined), true)

  for (const env of [
    { VERCEL_ENV: 'preview' },
    { COMPANION_FULL_READING_PANEL: 'off', VERCEL_ENV: 'preview' },
    { COMPANION_FULL_READING_PANEL: 'ON', VERCEL_ENV: 'preview' },
    { COMPANION_FULL_READING_PANEL: '', VERCEL_ENV: 'preview', COMPANION_FULL_READING_SELLER_IDS: USER },
  ]) {
    assert.equal(enabled(env), false, JSON.stringify(env))
  }
})

test('regra: produção liga só com a flag ligada e o usuário na lista', () => {
  assert.equal(enabled({ ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: `${OTHER},${USER}` }), true)
  assert.equal(enabled({ ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: USER }), true)

  // Fora da lista.
  assert.equal(enabled({ ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: OTHER }), false)

  // Na lista, mas com a flag desligada.
  assert.equal(enabled({ VERCEL_ENV: 'production', COMPANION_FULL_READING_SELLER_IDS: USER }), false)
  assert.equal(
    enabled({ COMPANION_FULL_READING_PANEL: 'off', VERCEL_ENV: 'production', COMPANION_FULL_READING_SELLER_IDS: USER }),
    false,
  )
})

test('regra: produção sem usuário, com usuário inválido ou com a lista vazia/ausente → desligada', () => {
  const listed = { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: USER }

  for (const userId of [undefined, null, '', '   ', 'nao-e-uuid', 42, {}, `${USER}x`]) {
    assert.equal(enabled(listed, userId), false, String(userId))
  }

  for (const list of [undefined, '', ' ', ',', ' , ,']) {
    const env = list === undefined ? PRODUCTION : { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: list }

    assert.equal(enabled(env), false, JSON.stringify(list))
  }
})

test('regra: a lista ignora espaços, maiúsculas e entradas que não são UUID', () => {
  const list =
    `  nao-e-uuid , ${OTHER.toUpperCase()} ,\n ${USER.toUpperCase()}  , 1234, ${USER}-extra,`

  assert.deepEqual([...parseFullReadingSellerIds(list)].sort(), [USER, OTHER].sort())

  const env = { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: list }

  assert.equal(enabled(env, USER), true)
  assert.equal(enabled(env, USER.toUpperCase()), true)
  assert.equal(enabled(env, `  ${OTHER}  `), true)
  assert.equal(enabled(env, '10000000-0000-4000-8000-0000000000a3'), false)

  // Entrada inválida não liga ninguém, nem como pedaço de outra.
  assert.equal(
    enabled({ ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: `${USER}-extra; ${OTHER}` }, USER),
    false,
  )
})

test('regra: development, sem VERCEL_ENV ou outro ambiente → desligada, com ou sem lista', () => {
  for (const vercelEnv of [undefined, 'development', 'test', 'Production', 'PREVIEW']) {
    const env = {
      COMPANION_FULL_READING_PANEL: 'on',
      COMPANION_FULL_READING_SELLER_IDS: USER,
      ...(vercelEnv === undefined ? {} : { VERCEL_ENV: vercelEnv }),
      NODE_ENV: 'development',
    }

    assert.equal(enabled(env), false, String(vercelEnv))
  }
})

test('regra global: continua só no preview (filas e pontos sem usuário), mesmo com o usuário na lista', () => {
  const listed = { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: USER }

  assert.equal(isFullReadingPanelEnabled(listed), false)
  assert.equal(isLegacyCompanionAiDisabled(listed), false)
  assert.equal(isFullReadingPanelEnabled({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }), true)
  assert.equal(isLegacyCompanionAiDisabled({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }), true)
})

// Admin que registra qualquer acesso (consulta, escrita, RPC).
function recordingAdmin() {
  const touched = []

  const admin = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return undefined
      }

      touched.push(String(property))
      throw new Error(`o painel tocou no banco (${String(property)})`)
    },
  })

  return { admin, touched }
}

function panelRequest({ admin, userId, env, scheduled, createdRunIds }) {
  return loadFullReadingPanelForRequest({
    admin,
    userId,
    companyId: COMPANY,
    cycleId: CYCLE,
    conversationKey: CONVERSATION,
    force: true,
    forceMode: 'full',
    referenceTime: NOW,
    schedule: (task) => {
      scheduled.push(task)
    },
    createRunId: () => {
      const id = `run-${createdRunIds.length + 1}`
      createdRunIds.push(id)
      return id
    },
    env: { ...env, ANTHROPIC_API_KEY: 'sk-ant-teste' },
    route: '/api/companion/decision-state',
  })
}

test('painel em produção, usuário fora da lista: devolve null sem consultar, agendar ou gravar nada', async () => {
  for (const [label, env, userId] of [
    ['fora da lista', { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: OTHER }, USER],
    ['lista vazia', { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: '' }, USER],
    ['sem lista', PRODUCTION, USER],
    ['sem usuário', { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: USER }, undefined],
    ['flag desligada', { VERCEL_ENV: 'production', COMPANION_FULL_READING_SELLER_IDS: USER }, USER],
  ]) {
    const { admin, touched } = recordingAdmin()
    const scheduled = []
    const createdRunIds = []

    const result =
      await panelRequest({ admin, userId, env, scheduled, createdRunIds })

    assert.equal(result, null, label)
    assert.deepEqual(touched, [], label)
    assert.deepEqual(scheduled, [], label)
    assert.deepEqual(createdRunIds, [], label)
  }
})

test('painel em produção, usuário na lista: segue o mesmo caminho do preview (lê o próprio estado)', async () => {
  for (const env of [
    { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: ` ${OTHER}, ${USER.toUpperCase()} ` },
    { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' },
  ]) {
    const { admin, touched } = recordingAdmin()
    const scheduled = []
    const createdRunIds = []

    // O admin falso recusa tudo: o painel não consegue ler o estado e
    // devolve null (nunca derruba a rota), mas a regra deixou passar.
    const result =
      await panelRequest({ admin, userId: USER, env, scheduled, createdRunIds })

    assert.equal(result, null)
    assert.ok(touched.length > 0, JSON.stringify(env))
  }
})
