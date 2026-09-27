import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const paths = [
  'app/api/companion/me/route.ts',
  'app/api/companion/connect/route.ts',
  'app/companion/connect/page.tsx',
]

const sources = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [
      path,
      await readFile(path, 'utf8'),
    ]),
  ),
)

test('ID-01: Companion usa a mesma RPC canônica da sessão principal para resolver o nome da empresa ativa', () => {
  for (const [path, source] of Object.entries(sources)) {
    assert.match(
      source,
      /rpc\(\s*['"]get_user_company_memberships['"]/,
      `${path} precisa obter nome/empresa pela RPC canônica`,
    )

    assert.doesNotMatch(
      source,
      /\.from\(['"]company_memberships['"]\)[\s\S]{0,500}companies\s*\(/,
      `${path} não pode depender do join companies sujeito ao RLS para formar o nome`,
    )
  }
})

test('ID-01: Companion preserva a mesma precedência de nome usada por /api/me', () => {
  for (const [path, source] of Object.entries(sources)) {
    const start = source.indexOf(
      'function getCompanyName(',
    )
    const end = source.indexOf(
      '\n}\n',
      start,
    )
    const block = source.slice(start, end + 3)

    assert.notEqual(start, -1, `${path} precisa manter getCompanyName`)
    assert.match(
      block,
      /return\s*\([\s\S]*(?:membership|source)\.trade_name[\s\S]*(?:membership\.company_name|companyName)[\s\S]*(?:membership|source)\.legal_name/,
      `${path} precisa usar trade_name > company_name > legal_name`,
    )
  }
})
