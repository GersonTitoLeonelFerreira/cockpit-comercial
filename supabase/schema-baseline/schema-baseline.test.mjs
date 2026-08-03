import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

const baselinePath = fileURLToPath(
  new URL(
    "../migrations/20260629040658_restore_simulator_metrics_rpc_shell.sql",
    import.meta.url,
  ),
);
const manifestPath = fileURLToPath(new URL("./manifest.json", import.meta.url));
const migrationsPath = fileURLToPath(new URL("../migrations/", import.meta.url));
const legacyMigrationsPath = fileURLToPath(
  new URL("../migrations_legacy/", import.meta.url),
);

const byJson = (left, right) =>
  JSON.stringify(left).localeCompare(JSON.stringify(right), "en");

const assertUnorderedRowsEqual = (actual, expected) => {
  assert.deepEqual([...actual].sort(byJson), [...expected].sort(byJson));
};

const normalizeColumnPositions = (columns) => {
  const positionsByTable = new Map();

  return columns.map((column) => {
    const nextPosition = (positionsByTable.get(column.table_name) ?? 0) + 1;
    positionsByTable.set(column.table_name, nextPosition);

    return {
      ...column,
      ordinal_position: nextPosition,
    };
  });
};

const expectedCanonicalTables = [
  "ai_coaching_notes",
  "companies",
  "company_memberships",
  "cycle_events",
  "lead_conversation_analyses",
  "leads",
  "profiles",
  "sales_cycles",
];

const forbiddenV2Tables = [
  "conversation_analysis_runs",
  "conversation_capture_state",
  "conversation_message_reconciliation_state",
  "conversation_coaching_outputs",
  "conversation_decisions",
  "conversation_messages",
];

const supabaseBootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

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
`;

test("baseline recria o schema public canônico do zero", async () => {
  const db = new PGlite({
    extensions: {
      pgcrypto,
      uuid_ossp,
    },
  });

  try {
    await db.exec(supabaseBootstrap);

    const baselineSql = await readFile(baselinePath, "utf8");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    const migrationFiles = (await readdir(migrationsPath))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const legacyMigrationFiles = (await readdir(legacyMigrationsPath)).filter(
      (name) => name.endsWith(".sql"),
    );

    assert.deepEqual(
      migrationFiles.slice(0, manifest.remote_migrations.length),
      manifest.remote_migrations,
    );

    const migrationsAfterBaseline = migrationFiles.slice(
      manifest.remote_migrations.length,
    );
    const lastBaselineMigration = manifest.remote_migrations.at(-1);

    assert.ok(lastBaselineMigration);
    assert.ok(
      migrationsAfterBaseline.every(
        (name) =>
          /^\d{14}_[a-z0-9_]+\.sql$/.test(name) &&
          name > lastBaselineMigration,
      ),
      "Toda migration posterior ao baseline deve ter timestamp crescente e nome válido.",
    );
    assert.equal(legacyMigrationFiles.length, 94);

    await db.exec(baselineSql);
    await db.exec("set search_path = public, extensions, pg_catalog");

    const tables = await db.query(`
      select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
      order by c.relname
    `);

    assert.deepEqual(
      tables.rows.map((row) => row.name),
      manifest.tables,
    );

    const columns = await db.query(`
      select
        c.relname as table_name,
        a.attnum as ordinal_position,
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        a.attnotnull as not_null,
        a.attgenerated as generated_kind,
        case
          when a.atthasdef then pg_get_expr(ad.adbin, ad.adrelid, true)
        end as default_expression
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a
        on a.attrelid = c.oid
       and a.attnum > 0
       and not a.attisdropped
      left join pg_attrdef ad
        on ad.adrelid = a.attrelid
       and ad.adnum = a.attnum
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
      order by c.relname, a.attnum
    `);

    assert.deepEqual(
      columns.rows,
      normalizeColumnPositions(manifest.columns),
    );

    const constraints = await db.query(`
      select
        cl.relname as table_name,
        c.conname as name,
        c.contype as type
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public'
        and cl.relkind in ('r', 'p')
        and c.contype in ('p', 'u', 'c', 'f')
      order by cl.relname, c.conname
    `);

    assertUnorderedRowsEqual(constraints.rows, manifest.constraints);

    const indexes = await db.query(`
      select
        tc.relname as table_name,
        ic.relname as name
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
      where n.nspname = 'public'
        and not exists (
          select 1
          from pg_constraint c
          where c.conindid = i.indexrelid
            and c.contype in ('p', 'u', 'x')
        )
      order by tc.relname, ic.relname
    `);

    assertUnorderedRowsEqual(indexes.rows, manifest.indexes);

    const functions = await db.query(`
      select
        p.proname as name,
        pg_get_function_identity_arguments(p.oid) as identity_args,
        l.lanname as language
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname = 'public'
      order by p.proname, identity_args
    `);

    assertUnorderedRowsEqual(functions.rows, manifest.functions);

    const views = await db.query(`
      select
        c.relname as name,
        coalesce(c.reloptions, array[]::text[]) as reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
      order by c.relname
    `);

    assertUnorderedRowsEqual(views.rows, manifest.views);

    const triggers = await db.query(`
      select
        c.relname as table_name,
        t.tgname as name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and not t.tgisinternal
      order by c.relname, t.tgname
    `);

    assertUnorderedRowsEqual(triggers.rows, manifest.triggers);

    const policies = await db.query(`
      select
        c.relname as table_name,
        p.polname as name
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
      order by c.relname, p.polname
    `);

    assertUnorderedRowsEqual(policies.rows, manifest.policies);

    const relationGrants = await db.query(`
      select
        c.relname as name,
        coalesce(r.rolname, 'public') as grantee,
        x.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(
        coalesce(c.relacl, acldefault('r', c.relowner))
      ) x
      left join pg_roles r on r.oid = x.grantee
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v')
        and (
          x.grantee = 0
          or r.rolname in ('anon', 'authenticated', 'service_role')
        )
      order by c.relname, grantee, x.privilege_type
    `);

    assertUnorderedRowsEqual(
      relationGrants.rows,
      manifest.relation_grants,
    );

    const functionGrants = await db.query(`
      select
        p.proname as name,
        pg_get_function_identity_arguments(p.oid) as identity_args,
        coalesce(r.rolname, 'public') as grantee,
        x.privilege_type
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) x
      left join pg_roles r on r.oid = x.grantee
      where n.nspname = 'public'
        and (
          x.grantee = 0
          or r.rolname in ('anon', 'authenticated', 'service_role')
        )
      order by p.proname, identity_args, grantee, x.privilege_type
    `);

    assertUnorderedRowsEqual(
      functionGrants.rows,
      manifest.function_grants,
    );

    const canonicalTables = await db.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name
      `,
      [expectedCanonicalTables],
    );

    assert.deepEqual(
      canonicalTables.rows.map((row) => row.table_name),
      expectedCanonicalTables,
    );

    const unexpectedV2Tables = await db.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
      `,
      [forbiddenV2Tables],
    );

    assert.equal(unexpectedV2Tables.rows.length, 0);

    const tablesWithoutRls = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity
      order by c.relname
    `);

    assert.deepEqual(tablesWithoutRls.rows, []);
    assert.deepEqual(
      tables.rows.map((row) => row.name),
      manifest.rls_tables,
    );

    const leadStatuses = await db.query(`
      select e.enumlabel
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'lead_status'
      order by e.enumsortorder
    `);

    assert.deepEqual(
      leadStatuses.rows.map((row) => row.enumlabel),
      [
        "novo",
        "contato",
        "respondeu",
        "negociacao",
        "ganho",
        "pausado",
        "perdido",
        "cancelado",
      ],
    );
  } finally {
    await db.close();
  }
});
