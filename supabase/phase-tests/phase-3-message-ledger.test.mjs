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

test("Fase 3 cria ledger append-only, versionado e isolado por empresa", async () => {
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
    await db.exec("set search_path = public, extensions, pg_catalog");

    const tableSecurity = await db.query(`
      select
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'conversation_messages'
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
        a.attnotnull as not_null,
        a.attidentity as identity_kind
      from pg_attribute a
      where a.attrelid = 'public.conversation_messages'::regclass
        and a.attnum > 0
        and not a.attisdropped
      order by a.attnum
    `);

    assert.deepEqual(columns.rows, [
      { name: "id", type: "bigint", not_null: true, identity_kind: "a" },
      { name: "company_id", type: "uuid", not_null: true, identity_kind: "" },
      { name: "cycle_id", type: "uuid", not_null: true, identity_kind: "" },
      {
        name: "conversation_key",
        type: "text",
        not_null: true,
        identity_kind: "",
      },
      { name: "message_key", type: "text", not_null: true, identity_kind: "" },
      { name: "version", type: "integer", not_null: true, identity_kind: "" },
      { name: "direction", type: "text", not_null: true, identity_kind: "" },
      {
        name: "occurred_at",
        type: "timestamp with time zone",
        not_null: true,
        identity_kind: "",
      },
      { name: "content_type", type: "text", not_null: true, identity_kind: "" },
      { name: "text_content", type: "text", not_null: false, identity_kind: "" },
      {
        name: "audio_transcription",
        type: "text",
        not_null: false,
        identity_kind: "",
      },
      {
        name: "is_deleted",
        type: "boolean",
        not_null: true,
        identity_kind: "",
      },
      { name: "captured_by", type: "uuid", not_null: false, identity_kind: "" },
      {
        name: "ingested_at",
        type: "timestamp with time zone",
        not_null: true,
        identity_kind: "",
      },
    ]);

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
      where p.polrelid = 'public.conversation_messages'::regclass
    `);

    assert.deepEqual(policies.rows, [
      {
        name: "conversation_messages_client_access_denied",
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
      where c.oid = 'public.conversation_messages'::regclass
        and r.rolname in ('anon', 'authenticated', 'service_role')
      order by r.rolname, x.privilege_type
    `);

    assert.deepEqual(tableGrants.rows, [
      { grantee: "service_role", privilege_type: "INSERT" },
      { grantee: "service_role", privilege_type: "SELECT" },
    ]);

    const indexes = await db.query(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'conversation_messages'
      order by indexname
    `);

    assert.deepEqual(
      indexes.rows.map((row) => row.indexname),
      [
        "conversation_messages_captured_by_idx",
        "conversation_messages_cycle_occurred_idx",
        "conversation_messages_identity_version_uidx",
        "conversation_messages_pkey",
      ],
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

    await db.exec(`
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
      values (
        '${companyA}',
        '${cycleA}',
        'whatsapp:+5547999990001',
        'wamid.message-1',
        1,
        'incoming',
        '2026-07-30T10:00:00-03:00',
        'text',
        'Quero conhecer o plano.',
        '${userA}'
      );

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
      values (
        '${companyA}',
        '${cycleA}',
        'whatsapp:+5547999990001',
        'wamid.message-1',
        2,
        'incoming',
        '2026-07-30T10:00:00-03:00',
        'text',
        'Quero conhecer o plano anual.',
        '${userA}'
      );

      insert into public.conversation_messages (
        company_id,
        cycle_id,
        conversation_key,
        message_key,
        version,
        direction,
        occurred_at,
        content_type,
        is_deleted,
        captured_by
      )
      values (
        '${companyA}',
        '${cycleA}',
        'whatsapp:+5547999990001',
        'wamid.message-1',
        3,
        'incoming',
        '2026-07-30T10:00:00-03:00',
        'text',
        true,
        '${userA}'
      );

      insert into public.conversation_messages (
        company_id,
        cycle_id,
        conversation_key,
        message_key,
        version,
        direction,
        occurred_at,
        content_type,
        captured_by
      )
      values (
        '${companyB}',
        '${cycleB}',
        'whatsapp:+5547999990001',
        'wamid.message-1',
        1,
        'incoming',
        '2026-07-30T10:00:00-03:00',
        'audio',
        '${userB}'
      );
    `);

    const versionHistory = await db.query(`
      select
        company_id,
        version,
        is_deleted,
        text_content
      from public.conversation_messages
      where conversation_key = 'whatsapp:+5547999990001'
        and message_key = 'wamid.message-1'
      order by company_id, version
    `);

    assert.deepEqual(versionHistory.rows, [
      {
        company_id: companyA,
        version: 1,
        is_deleted: false,
        text_content: "Quero conhecer o plano.",
      },
      {
        company_id: companyA,
        version: 2,
        is_deleted: false,
        text_content: "Quero conhecer o plano anual.",
      },
      {
        company_id: companyA,
        version: 3,
        is_deleted: true,
        text_content: null,
      },
      {
        company_id: companyB,
        version: 1,
        is_deleted: false,
        text_content: null,
      },
    ]);

    await assertSqlRejects(
      db,
      `
        insert into public.conversation_messages (
          company_id,
          cycle_id,
          conversation_key,
          message_key,
          version,
          direction,
          occurred_at,
          content_type,
          text_content
        )
        values (
          '${companyA}',
          '${cycleA}',
          'whatsapp:+5547999990001',
          'wamid.message-1',
          1,
          'incoming',
          now(),
          'text',
          'Duplicada'
        )
      `,
      /conversation_messages_identity_version_uidx/,
    );

    await assertSqlRejects(
      db,
      `
        insert into public.conversation_messages (
          company_id,
          cycle_id,
          conversation_key,
          message_key,
          version,
          direction,
          occurred_at,
          content_type,
          text_content
        )
        values (
          '${companyB}',
          '${cycleA}',
          'whatsapp:+5547999990002',
          'wamid.cross-company',
          1,
          'outgoing',
          now(),
          'text',
          'Não pode cruzar empresas'
        )
      `,
      /conversation_messages_cycle_company_fkey/,
    );

    await assertSqlRejects(
      db,
      `
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
          is_deleted
        )
        values (
          '${companyA}',
          '${cycleA}',
          'whatsapp:+5547999990001',
          'wamid.deleted-with-content',
          1,
          'incoming',
          now(),
          'text',
          'Conteúdo indevido',
          true
        )
      `,
      /conversation_messages_content_check/,
    );

    await assertSqlRejects(
      db,
      `
        insert into public.conversation_messages (
          company_id,
          cycle_id,
          conversation_key,
          message_key,
          version,
          direction,
          occurred_at,
          content_type
        )
        values (
          '${companyA}',
          '${cycleA}',
          'whatsapp:+5547999990001',
          'wamid.empty-text',
          1,
          'incoming',
          now(),
          'text'
        )
      `,
      /conversation_messages_content_check/,
    );

    for (const clientRole of ["anon", "authenticated"]) {
      await db.exec(`set role ${clientRole}`);

      try {
        await assertSqlRejects(
          db,
          "select count(*) from public.conversation_messages",
          /permission denied for table conversation_messages/,
        );
      } finally {
        await db.exec("reset role");
      }
    }

    await db.exec("set role service_role");

    try {
      await db.exec(`
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
        values (
          '${companyA}',
          '${cycleA}',
          'whatsapp:+5547999990001',
          'wamid.service-role-insert',
          1,
          'outgoing',
          now(),
          'text',
          'Inserção server-side autorizada.',
          '${userA}'
        )
      `);

      await assertSqlRejects(
        db,
        `
          update public.conversation_messages
          set text_content = 'Sobrescrita indevida'
          where company_id = '${companyA}'
            and conversation_key = 'whatsapp:+5547999990001'
            and message_key = 'wamid.message-1'
            and version = 1
        `,
        /permission denied for table conversation_messages/,
      );

      await assertSqlRejects(
        db,
        `
          delete from public.conversation_messages
          where company_id = '${companyA}'
            and conversation_key = 'whatsapp:+5547999990001'
            and message_key = 'wamid.message-1'
            and version = 1
        `,
        /permission denied for table conversation_messages/,
      );
    } finally {
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
