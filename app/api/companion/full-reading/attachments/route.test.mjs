// Rodada 11 (HML), item B6: POST /api/companion/full-reading/attachments
// ("Incluir na leitura"). Matriz de autorização de ponta a ponta (route.ts
// real), com o cliente de serviço simulado (nada toca o banco), token real
// assinado e o modelo simulado (nenhuma chamada sai). Ids e arquivos
// sintéticos.
//
// - Flag desligada (ou fora de preview): 404 antes de qualquer leitura.
// - Sem token, token vencido: 401. Sem vínculo ativo, perfil inativo: 403.
//   Ciclo de outro vendedor (membro): 403. Ciclo de outra empresa: 404.
//   Nesses casos nada é gravado e o modelo não é chamado.
// - Gestor/admin pode incluir em ciclo de outro vendedor; o ator é sempre
//   o do token.
// - Sem a tabela (defesa: banco sem a migração): 409, sem chamar o modelo.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { bearerHeader, buildExpiredToken, buildToken, installFakeSupabaseEnv } from '../../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()

const IDS = {
  company: '9c000000-0000-4000-8000-000000000001',
  otherCompany: '9c000000-0000-4000-8000-000000000002',
  me: '9c000000-0000-4000-8000-0000000000a1',
  other: '9c000000-0000-4000-8000-0000000000a2',
  lead: '9c000000-0000-4000-8000-0000000000b1',
  cycle: '9c000000-0000-4000-8000-0000000000c1',
}

const CONVERSATION = 'phone:5511900000012'
const MESSAGE = 'false_5511900000012@c.us_SINTETICOPDF02'

const box = { admin: null }

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => box.admin,
  },
})

const { POST, OPTIONS } = await import('./route.ts')

function fakeAdmin({
  role = 'member',
  profileActive = true,
  owner = IDS.me,
  cycleCompany = IDS.company,
  attachmentsTable = true,
} = {}) {
  const calls = { writes: [], reads: [] }

  const tables = {
    company_memberships: role ? [{ company_id: IDS.company, user_id: IDS.me, role, is_active: true }] : [],
    profiles: [{ id: IDS.me, is_active_global: profileActive }],
    sales_cycles: [{ id: IDS.cycle, company_id: cycleCompany, lead_id: IDS.lead, owner_user_id: owner }],
    conversation_messages: [{ company_id: IDS.company, conversation_key: CONVERSATION, message_key: MESSAGE }],
    companion_conversation_attachments: [],
    companion_full_reading_runs: [],
  }

  return {
    calls,
    from(table) {
      const filters = []
      let op = 'select'
      let payload = null
      let single = false

      const result = () => {
        if (table === 'companion_conversation_attachments' && !attachmentsTable) {
          return { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }
        }

        if (op !== 'select') {
          calls.writes.push({ table, op, payload })
          return { data: null, error: null }
        }

        calls.reads.push(table)

        const rows = (tables[table] ?? []).filter((row) =>
          filters.every(([column, value]) => !(column in row) || row[column] === value))

        return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
      }

      const chain = {
        select() { return chain },
        insert(values) { op = 'insert'; payload = values; return chain },
        update(values) { op = 'update'; payload = values; return chain },
        eq(column, value) { filters.push([column, value]); return chain },
        gte() { return chain },
        limit() { return chain },
        maybeSingle() { single = true; return chain },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }

      return chain
    },
  }
}

function pdfBase64() {
  return Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n2 0 obj << /Type /Page >> endobj\n%%EOF', 'latin1').toString('base64')
}

const BODY = {
  cycle_id: IDS.cycle,
  conversation_key: CONVERSATION,
  message_key: MESSAGE,
  kind: 'pdf',
  media_type: 'application/pdf',
  file_name: 'Proposta.pdf',
  size_bytes: 80,
  content_base64: pdfBase64(),
}

function request(body, { token = buildToken({ sub: IDS.me, companyId: IDS.company }), method = 'POST' } = {}) {
  return new Request('http://localhost/api/companion/full-reading/attachments', {
    method,
    headers: {
      ...(token ? bearerHeader(token) : {}),
      'content-type': 'application/json',
      origin: 'moz-extension://teste',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

async function withFlag(on, fn) {
  const previous = {
    panel: process.env.COMPANION_FULL_READING_PANEL,
    env: process.env.VERCEL_ENV,
    key: process.env.ANTHROPIC_API_KEY,
    fetch: globalThis.fetch,
  }

  process.env.COMPANION_FULL_READING_PANEL = on ? 'on' : 'off'
  process.env.VERCEL_ENV = 'preview'
  process.env.ANTHROPIC_API_KEY = 'chave-sintetica-de-teste'

  const claude = []

  globalThis.fetch = async (url, init) => {
    claude.push({ url: String(url), body: JSON.parse(init.body) })
    return new Response(JSON.stringify({
      model: 'claude-haiku-4-5',
      content: [{ type: 'text', text: 'Proposta do plano anual: R$ 100,00 por mês.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 900, output_tokens: 40 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const originalInfo = console.info
  console.info = () => {}

  try {
    return await fn(claude)
  } finally {
    console.info = originalInfo
    globalThis.fetch = previous.fetch

    for (const [name, value] of [['COMPANION_FULL_READING_PANEL', previous.panel], ['VERCEL_ENV', previous.env], ['ANTHROPIC_API_KEY', previous.key]]) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  }
}

async function post(admin, body = BODY, options) {
  box.admin = admin
  const response = await POST(request(body, options))
  const text = await response.text()

  return { response, payload: text.startsWith('{') ? JSON.parse(text) : text }
}

test('B6: flag desligada (ou fora de preview) — 404, sem ler nada', async () => {
  await withFlag(false, async (claude) => {
    const admin = fakeAdmin()
    const { response } = await post(admin)

    assert.equal(response.status, 404)
    assert.deepEqual(admin.calls.reads, [])
    assert.equal(claude.length, 0)

    box.admin = admin
    assert.equal((await OPTIONS(request(null, { method: 'OPTIONS' }))).status, 404)
  })

  await withFlag(true, async (claude) => {
    process.env.VERCEL_ENV = 'production'

    const admin = fakeAdmin()
    const { response } = await post(admin)

    assert.equal(response.status, 404)
    assert.equal(claude.length, 0)
  })
})

test('B6: sem sessão do Companion (sem token ou vencido) — 401', async () => {
  await withFlag(true, async (claude) => {
    for (const token of [null, buildExpiredToken({ sub: IDS.me, companyId: IDS.company }), 'token-forjado']) {
      const admin = fakeAdmin()
      const { response, payload } = await post(admin, BODY, { token })

      assert.equal(response.status, 401)
      assert.equal(payload.code, 'INVALID_COMPANION_SESSION')
      assert.deepEqual(admin.calls.writes, [])
    }

    assert.equal(claude.length, 0)
  })
})

test('B6: sem vínculo, perfil inativo, ciclo de outro vendedor ou de outra empresa — recusado, nada gravado, modelo não chamado', async () => {
  await withFlag(true, async (claude) => {
    const cases = [
      { admin: fakeAdmin({ role: null }), status: 403 },
      { admin: fakeAdmin({ profileActive: false }), status: 403 },
      { admin: fakeAdmin({ owner: IDS.other }), status: 403 },
      { admin: fakeAdmin({ cycleCompany: IDS.otherCompany }), status: 404 },
    ]

    for (const entry of cases) {
      const { response, payload } = await post(entry.admin)

      assert.equal(response.status, entry.status, JSON.stringify(payload))
      assert.equal(payload.ok, false)
      assert.equal(typeof payload.error, 'string')
      assert.deepEqual(entry.admin.calls.writes, [])
      assert.equal(entry.admin.calls.reads.includes('conversation_messages'), false)
    }

    // Token de outra empresa: o vínculo é procurado na empresa do token.
    const otherCompany = fakeAdmin()
    const { response } = await post(otherCompany, BODY, { token: buildToken({ sub: IDS.me, companyId: IDS.otherCompany }) })

    assert.equal(response.status, 403)
    assert.equal(claude.length, 0)
  })
})

test('B6: dono do ciclo inclui — um resumo, só o resumo gravado, ator do token; gestor e admin também', async () => {
  await withFlag(true, async (claude) => {
    const admin = fakeAdmin()
    const { response, payload } = await post(admin)

    assert.equal(response.status, 200, JSON.stringify(payload))
    assert.deepEqual(payload, { ok: true, data: { status: 'incluido', message_key: MESSAGE } })
    assert.equal(claude.length, 1)
    assert.match(claude[0].url, /api\.anthropic\.com/)
    assert.equal(claude[0].body.model, 'claude-haiku-4-5')

    const [claim, done] = admin.calls.writes

    assert.equal(claim.table, 'companion_conversation_attachments')
    assert.equal(claim.payload.included_by, IDS.me)
    assert.equal(claim.payload.company_id, IDS.company)
    assert.equal(done.payload.status, 'incluido')
    assert.doesNotMatch(JSON.stringify(admin.calls.writes), new RegExp(BODY.content_base64.slice(0, 20).replace(/[+/]/g, '\\$&')))

    // O resumo não volta na resposta (só o status).
    assert.doesNotMatch(JSON.stringify(payload), /Proposta do plano/)

    for (const role of ['manager', 'admin']) {
      const managed = fakeAdmin({ role, owner: IDS.other })
      const result = await post(managed)

      assert.equal(result.response.status, 200, role)
      assert.equal(managed.calls.writes[0].payload.included_by, IDS.me)
    }
  })
})

test('B5/B6: sem a tabela (defesa: banco sem a migração) — 409, sem chamar o modelo; arquivo que não está no ledger — 404', async () => {
  await withFlag(true, async (claude) => {
    const missing = fakeAdmin({ attachmentsTable: false })
    const { response, payload } = await post(missing)

    assert.equal(response.status, 409)
    assert.equal(payload.code, 'ATTACHMENTS_UNAVAILABLE')
    assert.equal(payload.error, 'A inclusão de arquivos não está disponível agora.')

    const unknown = fakeAdmin()
    const other = await post(unknown, { ...BODY, message_key: 'mensagem-que-nao-existe' })

    assert.equal(other.response.status, 404)
    assert.equal(claude.length, 0)
  })
})

test('B4/B6: o servidor recusa arquivo fora do formato e endereço no lugar do arquivo', async () => {
  await withFlag(true, async (claude) => {
    const cases = [
      { body: { ...BODY, kind: 'documento' }, status: 400 },
      { body: { ...BODY, content_base64: Buffer.from('<html>').toString('base64') }, status: 400 },
      { body: { ...BODY, content_base64: 'https://exemplo.test/arquivo.pdf' }, status: 400 },
      { body: { ...BODY, content_base64: Buffer.alloc(3 * 1024 * 1024 + 10, 65).toString('base64') }, status: 413 },
    ]

    for (const entry of cases) {
      const admin = fakeAdmin()
      const { response } = await post(admin, entry.body)

      assert.equal(response.status, entry.status)
      assert.deepEqual(admin.calls.writes, [])
    }

    assert.equal(claude.length, 0)
  })
})

// ---------------------------------------------------------------------
// Rodada 16 (botão de produção, parte 2): a rota existe com a flag 'on'
// (preview ou produção); depois do token, a regra por usuário decide. Em
// produção, só quem está em COMPANION_FULL_READING_SELLER_IDS; fora da
// lista, o mesmo 404 de hoje, sem leitura, gravação ou modelo.
// ---------------------------------------------------------------------

// `panel: undefined` explícito apaga a flag (o padrão é 'on').
async function withProduction(list, fn, options = {}) {
  const panel = 'panel' in options ? options.panel : 'on'

  return withFlag(true, async (claude) => {
    const previousList = process.env.COMPANION_FULL_READING_SELLER_IDS

    process.env.VERCEL_ENV = 'production'

    if (panel === undefined) delete process.env.COMPANION_FULL_READING_PANEL
    else process.env.COMPANION_FULL_READING_PANEL = panel

    if (list === undefined) delete process.env.COMPANION_FULL_READING_SELLER_IDS
    else process.env.COMPANION_FULL_READING_SELLER_IDS = list

    try {
      return await fn(claude)
    } finally {
      if (previousList === undefined) delete process.env.COMPANION_FULL_READING_SELLER_IDS
      else process.env.COMPANION_FULL_READING_SELLER_IDS = previousList
    }
  })
}

test('R16 anexos: produção com o usuário do token na lista — inclui como no HML (OPTIONS 204)', async () => {
  await withProduction(` ${IDS.other}, ${IDS.me.toUpperCase()} `, async (claude) => {
    box.admin = fakeAdmin()
    assert.equal((await OPTIONS(request(null, { method: 'OPTIONS' }))).status, 204)

    const admin = fakeAdmin()
    const { response, payload } = await post(admin)

    assert.equal(response.status, 200, JSON.stringify(payload))
    assert.deepEqual(payload, { ok: true, data: { status: 'incluido', message_key: MESSAGE } })
    assert.equal(claude.length, 1)
    assert.equal(admin.calls.writes[0].payload.included_by, IDS.me)
  })
})

test('R16 anexos: produção com o usuário fora da lista (ou lista vazia) — 404 de hoje, sem leitura, gravação nem modelo', async () => {
  for (const list of [IDS.other, '', undefined]) {
    await withProduction(list, async (claude) => {
      const admin = fakeAdmin()
      const { response, payload } = await post(admin)

      assert.equal(response.status, 404, String(list))
      assert.equal(payload, 'Not Found')
      assert.deepEqual(admin.calls.reads, [])
      assert.deepEqual(admin.calls.writes, [])
      assert.equal(claude.length, 0)
    })
  }
})

test('R16 anexos: flag desligada em produção, mesmo com o usuário na lista — 404 (OPTIONS e POST), sem ler nada', async () => {
  for (const panel of [undefined, 'off']) {
    await withProduction(IDS.me, async (claude) => {
      const admin = fakeAdmin()
      box.admin = admin

      assert.equal((await OPTIONS(request(null, { method: 'OPTIONS' }))).status, 404)

      const { response } = await post(admin)

      assert.equal(response.status, 404)
      assert.deepEqual(admin.calls.reads, [])
      assert.equal(claude.length, 0)
    }, { panel })
  }
})

test('R16 anexos: flag on em produção e token inválido — 401 (antes da regra por usuário)', async () => {
  await withProduction(IDS.me, async (claude) => {
    for (const token of [null, buildExpiredToken({ sub: IDS.me, companyId: IDS.company }), 'token-forjado']) {
      const admin = fakeAdmin()
      const { response, payload } = await post(admin, BODY, { token })

      assert.equal(response.status, 401)
      assert.equal(payload.code, 'INVALID_COMPANION_SESSION')
      assert.deepEqual(admin.calls.reads, [])
    }

    assert.equal(claude.length, 0)
  })
})

test('R16 anexos: preview com a flag ligada — igual a hoje para qualquer usuário, com ou sem lista', async () => {
  await withFlag(true, async (claude) => {
    process.env.COMPANION_FULL_READING_SELLER_IDS = IDS.other

    try {
      const admin = fakeAdmin()
      const { response } = await post(admin)

      assert.equal(response.status, 200)
      assert.equal(claude.length, 1)
    } finally {
      delete process.env.COMPANION_FULL_READING_SELLER_IDS
    }
  })
})
