import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrations = [
  '../migrations/20260731000105_create_company_commercial_config.sql',
  '../migrations/20260826032000_create_commercial_method_builder_draft.sql',
  '../migrations/20260826043000_add_assisted_method_construction.sql',
].map((path) => fileURLToPath(new URL(path, import.meta.url)))

const ids = {
  companyA: '10000000-0000-4000-8000-000000000001',
  companyB: '10000000-0000-4000-8000-000000000002',
  adminA: '20000000-0000-4000-8000-000000000001',
  memberA: '20000000-0000-4000-8000-000000000002',
  adminB: '20000000-0000-4000-8000-000000000003',
}

const bootstrapSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;

  create table auth.users (id uuid primary key, email text);

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.uid() to authenticated, service_role;

  create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    is_active_global boolean not null default true
  );

  create table public.companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    legal_name text not null,
    trade_name text not null
  );

  create table public.company_memberships (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null check (role in ('admin', 'manager', 'member')),
    is_active boolean not null default true,
    unique (company_id, user_id)
  );

  create table public.products (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies (id) on delete cascade,
    name text not null,
    category text not null default '',
    base_price numeric not null default 0,
    active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
  );

  grant select on table public.products to authenticated, service_role;
`

async function become(db, userId, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await db.exec(`set role ${role}`)
}

async function createDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(bootstrapSql)

  for (const migration of migrations) {
    await db.exec(await readFile(migration, 'utf8'))
  }

  await db.query(
    `insert into auth.users (id, email) values
      ($1, 'admin-a@yolen.test'),
      ($2, 'member-a@yolen.test'),
      ($3, 'admin-b@yolen.test')`,
    [ids.adminA, ids.memberA, ids.adminB],
  )

  await db.query(
    'insert into public.profiles (id) values ($1), ($2), ($3)',
    [ids.adminA, ids.memberA, ids.adminB],
  )

  await db.query(
    `insert into public.companies (id, name, legal_name, trade_name) values
      ($1, 'Empresa A', 'Empresa A Ltda', 'Empresa A'),
      ($2, 'Empresa B', 'Empresa B Ltda', 'Empresa B')`,
    [ids.companyA, ids.companyB],
  )

  await db.query(
    `insert into public.company_memberships (company_id, user_id, role, is_active) values
      ($1, $2, 'admin', true),
      ($1, $3, 'member', true),
      ($4, $5, 'admin', true)`,
    [ids.companyA, ids.adminA, ids.memberA, ids.companyB, ids.adminB],
  )

  return db
}

function diagnosisData() {
  return {
    company_profile: { marker: 'diagnostico-a' },
    commercial_rules: { marker: 'base-comercial-a' },
    current_sales_process: { marker: 'processo-a' },
  }
}

function constructionData() {
  return {
    construction_version: 'assisted-method-construction-v1',
    construction_step: 'stages',
    method_name: '',
    method_description: '',
    principles: [],
    active_stage_id: 'stage-1',
    stages: [
      {
        id: 'stage-1',
        source: 'yolen_suggestion',
        suggestion_basis: ['Baseado no diagnóstico.'],
        key: 'descoberta',
        name: 'Descoberta',
        objective: '',
        requirement: 'required',
        completion_criteria: ['Critério em construção'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        dimensions: [],
      },
    ],
  }
}

function methodDefinition() {
  return {
    contract_version: 'commercial-method-v2',
    name: 'Método teste',
    description: 'Somente teste.',
    principles: ['Princípio teste.'],
    stages: [
      {
        key: 'descoberta',
        display_order: 1,
        name: 'Descoberta',
        objective: 'Objetivo teste.',
        requirement: 'required',
        completion_criteria: ['Critério teste.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: ['Suficiente teste.'],
        advance_when: ['Avançar teste.'],
        wait_when: [],
        stop_asking_when: ['Parar teste.'],
        dimensions: [],
      },
    ],
  }
}

async function seedReadyDraft(db) {
  await become(db, ids.adminA)
  await db.query(
    `insert into public.company_commercial_method_builder_drafts (
      company_id,
      current_step,
      completed_steps,
      ready_for_method,
      draft_data,
      created_by,
      updated_by
    ) values (
      $1,
      4,
      array[1,2,3,4]::smallint[],
      true,
      $2::jsonb,
      $3,
      $3
    )`,
    [ids.companyA, JSON.stringify(diagnosisData()), ids.adminA],
  )
}

test('13/14) construção persiste e somente admin da empresa consegue retomar', async () => {
  const db = await createDatabase()
  try {
    await seedReadyDraft(db)

    await db.query(
      `update public.company_commercial_method_builder_drafts
       set method_construction_status = 'editing',
           method_construction = $2::jsonb,
           method_started_at = now(),
           method_updated_at = now()
       where company_id = $1`,
      [ids.companyA, JSON.stringify(constructionData())],
    )

    const adminRead = await db.query(
      `select method_construction_status, method_construction
       from public.company_commercial_method_builder_drafts
       where company_id = $1`,
      [ids.companyA],
    )

    assert.equal(adminRead.rows.length, 1)
    assert.equal(adminRead.rows[0].method_construction_status, 'editing')
    assert.equal(adminRead.rows[0].method_construction.stages[0].completion_criteria[0], 'Critério em construção')

    await become(db, ids.memberA)
    const memberRead = await db.query('select * from public.company_commercial_method_builder_drafts')
    assert.equal(memberRead.rows.length, 0)

    await become(db, ids.adminB)
    const otherTenantRead = await db.query('select * from public.company_commercial_method_builder_drafts')
    assert.equal(otherTenantRead.rows.length, 0)
  } finally {
    await db.close()
  }
})

test('review_ready exige commercial-method-v2 e não publica commercial-config', async () => {
  const db = await createDatabase()
  try {
    await seedReadyDraft(db)

    await db.query(
      `update public.company_commercial_method_builder_drafts
       set method_construction_status = 'review_ready',
           method_construction = $2::jsonb,
           method_definition = $3::jsonb,
           method_started_at = now(),
           method_updated_at = now()
       where company_id = $1`,
      [
        ids.companyA,
        JSON.stringify(constructionData()),
        JSON.stringify(methodDefinition()),
      ],
    )

    const row = await db.query(
      `select method_construction_status, method_definition
       from public.company_commercial_method_builder_drafts
       where company_id = $1`,
      [ids.companyA],
    )
    assert.equal(row.rows[0].method_construction_status, 'review_ready')
    assert.equal(row.rows[0].method_definition.contract_version, 'commercial-method-v2')

    const published = await db.query(
      `select count(*)::int as count
       from public.company_commercial_config_versions
       where company_id = $1`,
      [ids.companyA],
    )
    assert.equal(published.rows[0].count, 0)
  } finally {
    await db.close()
  }
})

test('review_ready sem method_definition é rejeitado pelo banco', async () => {
  const db = await createDatabase()
  try {
    await seedReadyDraft(db)
    await assert.rejects(
      db.query(
        `update public.company_commercial_method_builder_drafts
         set method_construction_status = 'review_ready',
             method_construction = $2::jsonb,
             method_started_at = now(),
             method_updated_at = now()
         where company_id = $1`,
        [ids.companyA, JSON.stringify(constructionData())],
      ),
    )
  } finally {
    await db.close()
  }
})
