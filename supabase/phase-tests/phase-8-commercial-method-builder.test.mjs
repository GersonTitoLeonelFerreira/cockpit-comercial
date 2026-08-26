import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const baseCommercialConfigMigrationPath = fileURLToPath(
  new URL(
    '../migrations/20260731000105_create_company_commercial_config.sql',
    import.meta.url,
  ),
)

const builderMigrationPath = fileURLToPath(
  new URL(
    '../migrations/20260826032000_create_commercial_method_builder_draft.sql',
    import.meta.url,
  ),
)

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

  create table auth.users (
    id uuid primary key,
    email text
  );

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(
      current_setting('request.jwt.claim.sub', true),
      ''
    )::uuid
  $$;

  grant usage on schema auth
  to authenticated, service_role;

  grant execute on function auth.uid()
  to authenticated, service_role;

  create table public.profiles (
    id uuid primary key
      references auth.users (id) on delete cascade,
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
    company_id uuid not null
      references public.companies (id) on delete cascade,
    user_id uuid not null
      references auth.users (id) on delete cascade,
    role text not null
      check (role in ('admin', 'manager', 'member')),
    is_active boolean not null default true,
    unique (company_id, user_id)
  );

  create table public.products (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null
      references public.companies (id) on delete cascade,
    name text not null,
    category text not null default '',
    base_price numeric not null default 0,
    active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
  );

  grant select on table public.products
  to authenticated, service_role;
`

async function become(db, userId, role = 'authenticated') {
  await db.exec('reset role')
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [userId],
  )
  await db.exec(`set role ${role}`)
}

async function becomePostgres(db) {
  await db.exec('reset role')
  await db.query(
    "select set_config('request.jwt.claim.sub', '', false)",
  )
}

async function createDatabase() {
  const db = new PGlite({
    extensions: {
      pgcrypto,
    },
  })

  await db.exec(bootstrapSql)

  const [baseMigration, builderMigration] = await Promise.all([
    readFile(baseCommercialConfigMigrationPath, 'utf8'),
    readFile(builderMigrationPath, 'utf8'),
  ])

  await db.exec(baseMigration)
  await db.exec(builderMigration)

  await db.query(
    `
      insert into auth.users (id, email)
      values
        ($1, 'admin-a@yolen.test'),
        ($2, 'member-a@yolen.test'),
        ($3, 'admin-b@yolen.test')
    `,
    [ids.adminA, ids.memberA, ids.adminB],
  )

  await db.query(
    `
      insert into public.profiles (id)
      values ($1), ($2), ($3)
    `,
    [ids.adminA, ids.memberA, ids.adminB],
  )

  await db.query(
    `
      insert into public.companies (id, name, legal_name, trade_name)
      values
        ($1, 'Empresa A', 'Empresa A Ltda', 'Empresa A'),
        ($2, 'Empresa B', 'Empresa B Ltda', 'Empresa B')
    `,
    [ids.companyA, ids.companyB],
  )

  await db.query(
    `
      insert into public.company_memberships (
        company_id,
        user_id,
        role,
        is_active
      )
      values
        ($1, $2, 'admin', true),
        ($1, $3, 'member', true),
        ($4, $5, 'admin', true)
    `,
    [
      ids.companyA,
      ids.adminA,
      ids.memberA,
      ids.companyB,
      ids.adminB,
    ],
  )

  return db
}

function draftData(label) {
  return {
    company_profile: {
      marker: label,
    },
    commercial_rules: {},
    current_sales_process: {},
  }
}

test('builder draft: admin cria e continua o próprio rascunho por empresa', async () => {
  const db = await createDatabase()

  try {
    await become(db, ids.adminA)

    await db.query(
      `
        insert into public.company_commercial_method_builder_drafts (
          company_id,
          current_step,
          completed_steps,
          ready_for_method,
          draft_data,
          created_by,
          updated_by
        )
        values ($1, 2, array[1]::smallint[], false, $2::jsonb, $3, $3)
      `,
      [ids.companyA, JSON.stringify(draftData('A')), ids.adminA],
    )

    const firstRead = await db.query(
      `
        select company_id, current_step, completed_steps, draft_data
        from public.company_commercial_method_builder_drafts
      `,
    )

    assert.equal(firstRead.rows.length, 1)
    assert.equal(firstRead.rows[0].company_id, ids.companyA)
    assert.equal(firstRead.rows[0].current_step, 2)
    assert.equal(firstRead.rows[0].draft_data.company_profile.marker, 'A')

    await db.query(
      `
        update public.company_commercial_method_builder_drafts
        set current_step = 3,
            completed_steps = array[1, 2]::smallint[],
            draft_data = $2::jsonb
        where company_id = $1
      `,
      [ids.companyA, JSON.stringify(draftData('A atualizado'))],
    )

    const updated = await db.query(
      `
        select current_step, completed_steps, draft_data, updated_by
        from public.company_commercial_method_builder_drafts
        where company_id = $1
      `,
      [ids.companyA],
    )

    assert.equal(updated.rows[0].current_step, 3)
    assert.deepEqual(updated.rows[0].completed_steps, [1, 2])
    assert.equal(
      updated.rows[0].draft_data.company_profile.marker,
      'A atualizado',
    )
    assert.equal(updated.rows[0].updated_by, ids.adminA)
  } finally {
    await db.close()
  }
})

test('builder draft: empresa B não lê nem altera dados da empresa A', async () => {
  const db = await createDatabase()

  try {
    await become(db, ids.adminA)
    await db.query(
      `
        insert into public.company_commercial_method_builder_drafts (
          company_id,
          draft_data,
          created_by,
          updated_by
        )
        values ($1, $2::jsonb, $3, $3)
      `,
      [ids.companyA, JSON.stringify(draftData('segredo A')), ids.adminA],
    )

    await become(db, ids.adminB)

    const read = await db.query(
      `
        select company_id
        from public.company_commercial_method_builder_drafts
        where company_id = $1
      `,
      [ids.companyA],
    )

    assert.equal(read.rows.length, 0)

    const update = await db.query(
      `
        update public.company_commercial_method_builder_drafts
        set current_step = 4
        where company_id = $1
        returning id
      `,
      [ids.companyA],
    )

    assert.equal(update.rows.length, 0)
  } finally {
    await db.close()
  }
})

test('builder draft: member sem permissão administrativa não edita configuração', async () => {
  const db = await createDatabase()

  try {
    await become(db, ids.adminA)
    await db.query(
      `
        insert into public.company_commercial_method_builder_drafts (
          company_id,
          draft_data,
          created_by,
          updated_by
        )
        values ($1, $2::jsonb, $3, $3)
      `,
      [ids.companyA, JSON.stringify(draftData('A')), ids.adminA],
    )

    await become(db, ids.memberA)

    const read = await db.query(
      `
        select id
        from public.company_commercial_method_builder_drafts
        where company_id = $1
      `,
      [ids.companyA],
    )
    assert.equal(read.rows.length, 0)

    await assert.rejects(
      () =>
        db.query(
          `
            insert into public.company_commercial_method_builder_drafts (
              company_id,
              draft_data,
              created_by,
              updated_by
            )
            values ($1, '{}'::jsonb, $2, $2)
          `,
          [ids.companyA, ids.memberA],
        ),
      /row-level security|policy/i,
    )
  } finally {
    await db.close()
  }
})

test('builder draft: anon não possui acesso à tabela', async () => {
  const db = await createDatabase()

  try {
    await becomePostgres(db)
    await db.exec('set role anon')

    await assert.rejects(
      () =>
        db.query(
          'select * from public.company_commercial_method_builder_drafts',
        ),
      /permission denied/i,
    )
  } finally {
    await db.close()
  }
})
