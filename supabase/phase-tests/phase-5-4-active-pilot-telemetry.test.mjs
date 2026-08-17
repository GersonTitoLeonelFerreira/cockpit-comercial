import assert from 'node:assert/strict'
import {
  readFile,
} from 'node:fs/promises'
import test from 'node:test'
import {
  fileURLToPath,
} from 'node:url'

import {
  PGlite,
} from '@electric-sql/pglite'
import {
  pgcrypto,
} from '@electric-sql/pglite/contrib/pgcrypto'
import {
  uuid_ossp,
} from '@electric-sql/pglite/contrib/uuid_ossp'

const baselinePath =
  fileURLToPath(
    new URL(
      '../migrations/20260629040658_restore_simulator_metrics_rpc_shell.sql',
      import.meta.url,
    ),
  )

const migrationPath =
  fileURLToPath(
    new URL(
      '../migrations/20260817023000_create_companion_active_pilot_telemetry.sql',
      import.meta.url,
    ),
  )

const supabaseBootstrap = `
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
  as $$ select null::uuid $$;

  create function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$ select '{}'::jsonb $$;
`

const companyId =
  '10000000-0000-4000-8000-000000000001'

const leadId =
  '20000000-0000-4000-8000-000000000001'

const cycleId =
  '30000000-0000-4000-8000-000000000001'

const userId =
  '40000000-0000-4000-8000-000000000001'

function jsonLiteral(
  value,
) {
  return `'${JSON.stringify(
    value,
  ).replaceAll(
    "'",
    "''",
  )}'::jsonb`
}

function buildTelemetry(
  overrides = {},
) {
  return {
    phase:
      'phase-5.4',

    channel:
      'active_pilot',

    event:
      'active_success',

    company_id:
      companyId,

    cycle_id:
      cycleId,

    runtime_mode:
      'active',

    response_source:
      'stateful',

    stateful_executed:
      true,

    v1_executed:
      false,

    duration_ms:
      850,

    fallback_reason:
      null,

    failure_code:
      null,

    failure_status_code:
      null,

    failure_retryable:
      null,

    engine_mode:
      'model',

    persistence_mode:
      'persisted',

    persisted:
      true,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,

    safety: {
      automatic_writes_blocked:
        true,

      persistence_confirmed_before_exposure:
        true,
    },

    health:
      'healthy',

    kill_switch_recommended:
      false,

    signals:
      [],

    ...overrides,
  }
}

async function setupDatabase() {
  const db =
    new PGlite({
      extensions: {
        pgcrypto,
        uuid_ossp,
      },
    })

  await db.exec(
    supabaseBootstrap,
  )

  await db.exec(
    await readFile(
      baselinePath,
      'utf8',
    ),
  )

  await db.exec(
    await readFile(
      migrationPath,
      'utf8',
    ),
  )

  await db.exec(
    'set search_path = public, extensions, pg_catalog',
  )

  await db.exec(`
    insert into auth.users (
      id,
      email
    )
    values (
      '${userId}',
      'operator@example.test'
    );

    insert into public.companies (
      id,
      name,
      legal_name,
      trade_name
    )
    values (
      '${companyId}',
      'Empresa A',
      'Empresa A LTDA',
      'Empresa A'
    );

    insert into public.leads (
      id,
      company_id,
      name,
      created_by
    )
    values (
      '${leadId}',
      '${companyId}',
      'Lead A',
      '${userId}'
    );

    insert into public.sales_cycles (
      id,
      company_id,
      lead_id,
      owner_user_id
    )
    values (
      '${cycleId}',
      '${companyId}',
      '${leadId}',
      '${userId}'
    );
  `)

  return db
}

async function callRpc(
  db,
  telemetry,
) {
  await db.exec(
    'set role service_role',
  )

  try {
    return await db.query(`
      select *
      from public.rpc_record_companion_active_pilot_event(
        p_company_id =>
          '${companyId}',
        p_cycle_id =>
          '${cycleId}',
        p_telemetry =>
          ${jsonLiteral(
            telemetry,
          )}
      )
    `)
  } finally {
    await db.exec(
      'reset role',
    )
  }
}

test(
  'Fase 5.4 cria armazenamento server-only com RLS forçado',
  async () => {
    const db =
      await setupDatabase()

    try {
      const table =
        await db.query(`
          select
            c.relrowsecurity
              as rls_enabled,
            c.relforcerowsecurity
              as rls_forced
          from pg_class c
          join pg_namespace n
            on n.oid =
              c.relnamespace
          where n.nspname =
              'public'
            and c.relname =
              'companion_active_pilot_events'
        `)

      assert.deepEqual(
        table.rows,
        [
          {
            rls_enabled:
              true,

            rls_forced:
              true,
          },
        ],
      )

      const tableGrants =
        await db.query(`
          select
            r.rolname
              as grantee,
            x.privilege_type
          from pg_class c
          cross join lateral
            aclexplode(c.relacl) x
          join pg_roles r
            on r.oid =
              x.grantee
          where c.relname =
              'companion_active_pilot_events'
            and r.rolname in (
              'anon',
              'authenticated',
              'service_role'
            )
          order by
            r.rolname,
            x.privilege_type
        `)

      assert.deepEqual(
        tableGrants.rows,
        [
          {
            grantee:
              'service_role',

            privilege_type:
              'SELECT',
          },
        ],
      )

      const functionGrants =
        await db.query(`
          select
            r.rolname
              as grantee,
            x.privilege_type
          from pg_proc p
          cross join lateral
            aclexplode(p.proacl) x
          join pg_roles r
            on r.oid =
              x.grantee
          where p.oid =
            'public.rpc_record_companion_active_pilot_event(
              uuid,
              uuid,
              jsonb
            )'::regprocedure
            and r.rolname in (
              'anon',
              'authenticated',
              'service_role'
            )
          order by
            r.rolname
        `)

      assert.deepEqual(
        functionGrants.rows,
        [
          {
            grantee:
              'service_role',

            privilege_type:
              'EXECUTE',
          },
        ],
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'service role persiste telemetria sem conteúdo da conversa',
  async () => {
    const db =
      await setupDatabase()

    try {
      const telemetry =
        buildTelemetry()

      const persisted =
        await callRpc(
          db,
          telemetry,
        )

      assert.equal(
        persisted.rows.length,
        1,
      )

      assert.ok(
        persisted
          .rows[0]
          .event_id,
      )

      await db.exec(
        'set role service_role',
      )

      const rows =
        await db.query(`
          select
            event_type,
            health,
            kill_switch_recommended,
            duration_ms,
            fallback_reason,
            telemetry
          from public.companion_active_pilot_events
        `)

      await db.exec(
        'reset role',
      )

      assert.equal(
        rows.rows.length,
        1,
      )

      assert.equal(
        rows.rows[0]
          .event_type,
        'active_success',
      )

      assert.equal(
        rows.rows[0]
          .health,
        'healthy',
      )

      assert.equal(
        rows.rows[0]
          .duration_ms,
        850,
      )

      assert.equal(
        rows.rows[0]
          .telemetry
          .conversation_text,
        undefined,
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'clientes não conseguem executar RPC de auditoria',
  async () => {
    const db =
      await setupDatabase()

    try {
      await db.exec(
        'set role anon',
      )

      await assert.rejects(
        () =>
          db.query(`
            select *
            from public.rpc_record_companion_active_pilot_event(
              '${companyId}',
              '${cycleId}',
              ${jsonLiteral(
                buildTelemetry(),
              )}
            )
          `),
      )

      await db.exec(
        'reset role',
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'RPC rejeita telemetria de outra empresa ou com conteúdo de conversa',
  async () => {
    const db =
      await setupDatabase()

    try {
      await assert.rejects(
        () =>
          callRpc(
            db,
            buildTelemetry({
              company_id:
                '10000000-0000-4000-8000-000000000002',
            }),
          ),
      )

      await assert.rejects(
        () =>
          callRpc(
            db,
            buildTelemetry({
              conversation_text:
                'conteúdo que não pode ser persistido',
            }),
          ),
      )
    } finally {
      await db.close()
    }
  },
)
