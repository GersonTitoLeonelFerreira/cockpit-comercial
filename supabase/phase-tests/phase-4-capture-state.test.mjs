import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const phase3MigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260730155903_create_conversation_messages_ledger.sql",
    import.meta.url,
  ),
);

const phase4MigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260730170515_create_conversation_capture_state.sql",
    import.meta.url,
  ),
);

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
`;

const companyA = "10000000-0000-4000-8000-000000000001";
const companyB = "10000000-0000-4000-8000-000000000002";
const leadA = "20000000-0000-4000-8000-000000000001";
const leadB = "20000000-0000-4000-8000-000000000002";
const cycleA = "30000000-0000-4000-8000-000000000001";
const cycleB = "30000000-0000-4000-8000-000000000002";
const userA = "40000000-0000-4000-8000-000000000001";
const userB = "40000000-0000-4000-8000-000000000002";

async function assertSqlRejects(db, sql, pattern) {
  await assert.rejects(db.exec(sql), pattern);
}

test(
  "Fase 4 cria cursor relacional isolado por empresa, conversa e dispositivo",
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
        uuid_ossp,
      },
    });

    try {
      await db.exec(supabaseBootstrap);
      await db.exec(await readFile(baselinePath, "utf8"));
      await db.exec(await readFile(phase3MigrationPath, "utf8"));
      await db.exec(await readFile(phase4MigrationPath, "utf8"));
      await db.exec("set search_path = public, extensions, pg_catalog");

      const tableSecurity = await db.query(`
        select
          c.relrowsecurity as rls_enabled,
          c.relforcerowsecurity as rls_forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'conversation_capture_state'
          and c.relkind = 'r'
      `);

      assert.deepEqual(tableSecurity.rows, [
        {
          rls_enabled: true,
          rls_forced: true,
        },
      ]);

      const columns = await db.query(`
        select
          a.attname as name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
          a.attnotnull as not_null
        from pg_attribute a
        where a.attrelid = 'public.conversation_capture_state'::regclass
          and a.attnum > 0
          and not a.attisdropped
        order by a.attnum
      `);

      assert.deepEqual(columns.rows, [
        { name: "company_id", type: "uuid", not_null: true },
        { name: "conversation_key", type: "text", not_null: true },
        { name: "device_key", type: "text", not_null: true },
        {
          name: "last_observed_message_id",
          type: "bigint",
          not_null: false,
        },
        {
          name: "last_observed_at",
          type: "timestamp with time zone",
          not_null: false,
        },
        {
          name: "last_processed_message_id",
          type: "bigint",
          not_null: false,
        },
        {
          name: "last_processed_at",
          type: "timestamp with time zone",
          not_null: false,
        },
        { name: "state_version", type: "bigint", not_null: true },
        {
          name: "created_at",
          type: "timestamp with time zone",
          not_null: true,
        },
        {
          name: "updated_at",
          type: "timestamp with time zone",
          not_null: true,
        },
      ]);

      const jsonColumns = await db.query(`
        select a.attname
        from pg_attribute a
        where a.attrelid = 'public.conversation_capture_state'::regclass
          and a.attnum > 0
          and not a.attisdropped
          and pg_catalog.format_type(a.atttypid, a.atttypmod)
            in ('json', 'jsonb')
      `);

      assert.deepEqual(
        jsonColumns.rows,
        [],
        "O cursor canônico não pode voltar a depender de JSON de coaching.",
      );

      const policies = await db.query(`
        select
          p.polname as name,
          p.polpermissive as permissive,
          array(
            select r.rolname
            from pg_roles r
            where r.oid = any(p.polroles)
            order by r.rolname
          ) as roles
        from pg_policy p
        where p.polrelid = 'public.conversation_capture_state'::regclass
      `);

      assert.deepEqual(policies.rows, [
        {
          name: "conversation_capture_state_client_access_denied",
          permissive: false,
          roles: ["anon", "authenticated"],
        },
      ]);

      const tableGrants = await db.query(`
        select
          r.rolname as grantee,
          x.privilege_type
        from pg_class c
        cross join lateral aclexplode(c.relacl) x
        join pg_roles r on r.oid = x.grantee
        where c.oid = 'public.conversation_capture_state'::regclass
          and r.rolname in ('anon', 'authenticated', 'service_role')
        order by r.rolname, x.privilege_type
      `);

      assert.deepEqual(tableGrants.rows, [
        { grantee: "service_role", privilege_type: "INSERT" },
        { grantee: "service_role", privilege_type: "SELECT" },
        { grantee: "service_role", privilege_type: "UPDATE" },
      ]);

      const indexes = await db.query(`
        select tablename, indexname
        from pg_indexes
        where schemaname = 'public'
          and (
            tablename = 'conversation_capture_state'
            or indexname =
              'conversation_messages_company_conversation_id_uidx'
          )
        order by tablename, indexname
      `);

      assert.deepEqual(indexes.rows, [
        {
          tablename: "conversation_capture_state",
          indexname: "conversation_capture_state_observed_message_idx",
        },
        {
          tablename: "conversation_capture_state",
          indexname: "conversation_capture_state_pkey",
        },
        {
          tablename: "conversation_capture_state",
          indexname: "conversation_capture_state_processed_message_idx",
        },
        {
          tablename: "conversation_messages",
          indexname: "conversation_messages_company_conversation_id_uidx",
        },
      ]);

      const foreignKeys = await db.query(`
        select
          c.conname as name,
          pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        where c.conrelid = 'public.conversation_capture_state'::regclass
          and c.contype = 'f'
        order by c.conname
      `);

      assert.deepEqual(
        foreignKeys.rows.map((row) => row.name),
        [
          "conversation_capture_state_company_fkey",
          "conversation_capture_state_observed_message_fkey",
          "conversation_capture_state_processed_message_fkey",
        ],
      );
      assert.equal(
        foreignKeys.rows.some((row) =>
          row.definition.includes("ai_coaching_notes"),
        ),
        false,
      );

      await db.exec(`
        insert into auth.users (id, email)
        values
          ('${userA}', 'operator-a@example.test'),
          ('${userB}', 'operator-b@example.test');

        insert into public.companies (id, name, legal_name, trade_name)
        values
          ('${companyA}', 'Empresa A', 'Empresa A LTDA', 'Empresa A'),
          ('${companyB}', 'Empresa B', 'Empresa B LTDA', 'Empresa B');

        insert into public.leads (id, company_id, name, created_by)
        values
          ('${leadA}', '${companyA}', 'Lead A', '${userA}'),
          ('${leadB}', '${companyB}', 'Lead B', '${userB}');

        insert into public.sales_cycles (
          id,
          company_id,
          lead_id,
          owner_user_id
        )
        values
          ('${cycleA}', '${companyA}', '${leadA}', '${userA}'),
          ('${cycleB}', '${companyB}', '${leadB}', '${userB}');
      `);

      const messages = await db.query(`
        insert into public.conversation_messages (
          company_id,
          cycle_id,
          conversation_key,
          message_key,
          version,
          direction,
          occurred_at,
          content_type,
          text_content,
          captured_by
        )
        values
          (
            '${companyA}',
            '${cycleA}',
            'whatsapp:+5547999990001',
            'wamid.a-1',
            1,
            'incoming',
            '2026-07-30T10:00:00-03:00',
            'text',
            'Quero conhecer o plano.',
            '${userA}'
          ),
          (
            '${companyA}',
            '${cycleA}',
            'whatsapp:+5547999990001',
            'wamid.a-2',
            1,
            'outgoing',
            '2026-07-30T10:02:00-03:00',
            'text',
            'Posso te explicar as opções.',
            '${userA}'
          ),
          (
            '${companyA}',
            '${cycleA}',
            'whatsapp:+5547999990099',
            'wamid.a-other',
            1,
            'incoming',
            '2026-07-30T10:04:00-03:00',
            'text',
            'Outra conversa.',
            '${userA}'
          ),
          (
            '${companyB}',
            '${cycleB}',
            'whatsapp:+5547999990001',
            'wamid.b-1',
            1,
            'incoming',
            '2026-07-30T10:06:00-03:00',
            'text',
            'Mesma chave externa em outra empresa.',
            '${userB}'
          )
        returning id, company_id, conversation_key, message_key
      `);

      const messageA1 = messages.rows.find(
        (row) => row.message_key === "wamid.a-1",
      );
      const messageA2 = messages.rows.find(
        (row) => row.message_key === "wamid.a-2",
      );
      const messageAOther = messages.rows.find(
        (row) => row.message_key === "wamid.a-other",
      );
      const messageB1 = messages.rows.find(
        (row) => row.message_key === "wamid.b-1",
      );

      assert.ok(messageA1);
      assert.ok(messageA2);
      assert.ok(messageAOther);
      assert.ok(messageB1);

      await db.exec(`
        set role service_role;

        insert into public.conversation_capture_state (
          company_id,
          conversation_key,
          device_key,
          last_observed_message_id,
          last_observed_at,
          last_processed_message_id,
          last_processed_at,
          created_at,
          updated_at
        )
        values
          (
            '${companyA}',
            'whatsapp:+5547999990001',
            'install-a',
            ${messageA2.id},
            '2026-07-30T13:03:00Z',
            ${messageA1.id},
            '2026-07-30T13:02:00Z',
            '2026-07-30T13:01:00Z',
            '2026-07-30T13:03:00Z'
          ),
          (
            '${companyA}',
            'whatsapp:+5547999990001',
            'install-b',
            ${messageA1.id},
            '2026-07-30T13:02:00Z',
            null,
            null,
            '2026-07-30T13:01:00Z',
            '2026-07-30T13:02:00Z'
          ),
          (
            '${companyB}',
            'whatsapp:+5547999990001',
            'install-a',
            ${messageB1.id},
            '2026-07-30T13:07:00Z',
            ${messageB1.id},
            '2026-07-30T13:07:00Z',
            '2026-07-30T13:06:00Z',
            '2026-07-30T13:07:00Z'
          );

        reset role;
      `);

      const independentStates = await db.query(`
        select
          company_id,
          conversation_key,
          device_key,
          last_observed_message_id,
          last_processed_message_id,
          state_version
        from public.conversation_capture_state
        order by company_id, device_key
      `);

      assert.equal(independentStates.rows.length, 3);
      assert.deepEqual(
        independentStates.rows.map((row) => row.device_key),
        ["install-a", "install-b", "install-a"],
      );

      await db.exec(`
        set role service_role;

        insert into public.conversation_capture_state (
          company_id,
          conversation_key,
          device_key,
          last_observed_message_id,
          last_observed_at,
          last_processed_message_id,
          last_processed_at,
          state_version,
          created_at,
          updated_at
        )
        values (
          '${companyA}',
          'whatsapp:+5547999990001',
          'install-b',
          ${messageA2.id},
          '2026-07-30T13:05:00Z',
          ${messageA2.id},
          '2026-07-30T13:06:00Z',
          2,
          '2026-07-30T13:01:00Z',
          '2026-07-30T13:06:00Z'
        )
        on conflict (
          company_id,
          conversation_key,
          device_key
        )
        do update set
          last_observed_message_id =
            excluded.last_observed_message_id,
          last_observed_at =
            excluded.last_observed_at,
          last_processed_message_id =
            excluded.last_processed_message_id,
          last_processed_at =
            excluded.last_processed_at,
          state_version =
            public.conversation_capture_state.state_version + 1,
          updated_at =
            excluded.updated_at;

        reset role;
      `);

      const advancedState = await db.query(`
        select
          last_observed_message_id,
          last_processed_message_id,
          state_version
        from public.conversation_capture_state
        where company_id = '${companyA}'
          and conversation_key = 'whatsapp:+5547999990001'
          and device_key = 'install-b'
      `);

      assert.deepEqual(advancedState.rows, [
        {
          last_observed_message_id: messageA2.id,
          last_processed_message_id: messageA2.id,
          state_version: 2,
        },
      ]);

      await assertSqlRejects(
        db,
        `
          insert into public.conversation_capture_state (
            company_id,
            conversation_key,
            device_key,
            last_observed_message_id,
            last_observed_at
          )
          values (
            '${companyA}',
            'whatsapp:+5547999990001',
            'cross-company',
            ${messageB1.id},
            '2026-07-30T13:08:00Z'
          )
        `,
        /foreign key constraint/i,
      );

      await assertSqlRejects(
        db,
        `
          insert into public.conversation_capture_state (
            company_id,
            conversation_key,
            device_key,
            last_observed_message_id,
            last_observed_at
          )
          values (
            '${companyA}',
            'whatsapp:+5547999990001',
            'cross-conversation',
            ${messageAOther.id},
            '2026-07-30T13:08:00Z'
          )
        `,
        /foreign key constraint/i,
      );

      await assertSqlRejects(
        db,
        `
          insert into public.conversation_capture_state (
            company_id,
            conversation_key,
            device_key,
            last_observed_message_id,
            last_observed_at,
            last_processed_message_id,
            last_processed_at
          )
          values (
            '${companyA}',
            'whatsapp:+5547999990001',
            'processed-ahead',
            ${messageA1.id},
            '2026-07-30T13:02:00Z',
            ${messageA2.id},
            '2026-07-30T13:03:00Z'
          )
        `,
        /processed_not_ahead_check/i,
      );

      await assertSqlRejects(
        db,
        `
          insert into public.conversation_capture_state (
            company_id,
            conversation_key,
            device_key,
            last_observed_message_id
          )
          values (
            '${companyA}',
            'whatsapp:+5547999990001',
            'orphan-observed-time',
            ${messageA1.id}
          )
        `,
        /observed_pair_check/i,
      );

      await assertSqlRejects(
        db,
        `
          insert into public.conversation_capture_state (
            company_id,
            conversation_key,
            device_key,
            state_version
          )
          values (
            '${companyA}',
            'whatsapp:+5547999990001',
            'invalid-version',
            0
          )
        `,
        /version_check/i,
      );

      for (const role of ["anon", "authenticated"]) {
        await assertSqlRejects(
          db,
          `
            set role ${role};
            select *
            from public.conversation_capture_state;
            reset role;
          `,
          /permission denied/i,
        );

        await db.exec("reset role");
      }

      await assertSqlRejects(
        db,
        `
          set role service_role;
          delete from public.conversation_capture_state
          where company_id = '${companyA}';
          reset role;
        `,
        /permission denied/i,
      );

      await db.exec("reset role");

      await assertSqlRejects(
        db,
        `
          delete from public.conversation_messages
          where id = ${messageA2.id}
        `,
        /foreign key constraint/i,
      );
    } finally {
      await db.close();
    }
  },
);
