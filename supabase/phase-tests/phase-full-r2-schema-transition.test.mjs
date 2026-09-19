import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

// R2 — gate final "transição completa do schema": prova, num único
// Postgres efêmero (PGlite — nunca o projeto Supabase real, nenhuma
// migration é aplicada em produção por este teste), que
//
//   FULL R2 SCHEMA = schema pré-R2 relevante ao ledger de mensagens
//   (mesmo subconjunto curado já usado por
//   phase-4-causal-message-version.test.mjs: baseline, ledger, capture
//   state, ingestão, hardening, reconciliação, versões causais)
//   + 20260915010000_add_message_author_kind.sql
//   + 20260915020000_create_lead_external_identities.sql
//
// funciona como um único estado coerente: as duas migrations novas são
// aplicadas na mesma sessão de banco, em ordem, sobre esse schema, e cada
// garantia (A-J) é verificada nessa mesma sessão — nunca em bancos
// separados por migration.
//
// NÃO usa a árvore completa e literal de migrations. O antigo
// supabase/migrations/20260829010000_add_message_deletion_reason.sql
// tinha um `do $ ... $;` com dollar-quoting inválido (deveria ser
// `do $$ ... $$;`) — sintaxe que falha em qualquer Postgres real, e
// nunca foi o arquivo que rodou de fato em produção: a migration
// realmente aplicada é 20260829042244_add_message_deletion_reason_safe.
// A reconciliação de histórico de migrations já corrigiu esse drift:
// o arquivo antigo quebrado foi arquivado (supabase/migrations_archive/)
// e 20260829042244_add_message_deletion_reason_safe.sql — com o SQL
// exato recuperado do projeto Supabase real — passou a existir em
// supabase/migrations/. Este teste continua reproduzindo o END-STATE
// verificado de conversation_messages.deletion_reason (coluna +
// constraint) em vez de reexecutar a árvore completa, seguindo a mesma
// metodologia que todo outro phase-test deste repositório já usa
// (nenhum deles reproduz a árvore inteira).

function migrationPath(fileName) {
  return fileURLToPath(new URL(`../migrations/${fileName}`, import.meta.url));
}

const preR2MigrationPaths = [
  migrationPath("20260629040658_restore_simulator_metrics_rpc_shell.sql"),
  migrationPath("20260730155903_create_conversation_messages_ledger.sql"),
  migrationPath("20260730170515_create_conversation_capture_state.sql"),
  migrationPath("20260803030154_create_companion_message_ingestion_rpc.sql"),
  migrationPath("20260803223345_prevent_stale_companion_captures.sql"),
  migrationPath(
    "20260804120000_add_causal_companion_message_versions.sql",
  ),
];

const authorKindMigrationPath = migrationPath(
  "20260915010000_add_message_author_kind.sql",
);
const externalIdentityMigrationPath = migrationPath(
  "20260915020000_create_lead_external_identities.sql",
);

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  otherCompany: "10000000-0000-4000-8000-000000000002",
  lead: "20000000-0000-4000-8000-000000000001",
  leadTwo: "20000000-0000-4000-8000-000000000002",
  leadOtherCompany: "20000000-0000-4000-8000-000000000003",
  cycle: "30000000-0000-4000-8000-000000000001",
  user: "40000000-0000-4000-8000-000000000001",
  deviceA: "50000000-0000-4000-8000-000000000001",
};

const conversationKey = "Cliente Schema Transition::data:5511999990001";

const PLATFORM = "manychat";
const EXTERNAL_IDENTITY_KEY = "manychat:contact:v1:sha256:schematransition";

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

function buildMessage(overrides = {}) {
  return {
    message_key: "message-001",
    direction: "incoming",
    occurred_at: "2026-09-15T15:20:00-03:00",
    observed_at: "2026-09-15T18:20:05.000Z",
    content_type: "text",
    text_content: "Mensagem de transição de schema.",
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  };
}

async function callIngestion(
  db,
  { messages, deviceKey = ids.deviceA, capturedBy = ids.user } = {},
) {
  const result = await db.query(
    `
      select *
      from public.rpc_ingest_companion_messages(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::text,
        $5::text,
        $6::jsonb
      )
    `,
    [
      ids.company,
      ids.cycle,
      capturedBy,
      conversationKey,
      deviceKey,
      JSON.stringify(messages),
    ],
  );

  return result.rows[0];
}

async function callLink(db, { leadId, actorUserId = ids.user } = {}) {
  const result = await db.query(
    `
      select *
      from public.rpc_link_companion_external_identity(
        $1::uuid,
        $2::uuid,
        $3::text,
        $4::text,
        $5::text,
        $6::uuid
      )
    `,
    [
      ids.company,
      leadId,
      PLATFORM,
      EXTERNAL_IDENTITY_KEY,
      "manychat_dom_reader",
      actorUserId,
    ],
  );

  return result.rows[0];
}

async function callTouch(db) {
  await db.query(
    `
      select public.rpc_touch_companion_external_identity_last_seen(
        $1::uuid,
        $2::text,
        $3::text
      )
    `,
    [ids.company, PLATFORM, EXTERNAL_IDENTITY_KEY],
  );
}

async function resolveByIdentity(db) {
  const result = await db.query(
    `
      select lead_id
      from public.lead_external_identities
      where company_id = $1
        and platform = $2
        and external_identity_key = $3
    `,
    [ids.company, PLATFORM, EXTERNAL_IDENTITY_KEY],
  );

  return result.rows[0]?.lead_id ?? null;
}

async function assertAuthorKindColumnAndConstraints(db) {
  // A. conversation_messages.author_kind existe.
  const column = await db.query(`
    select data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_messages'
      and column_name = 'author_kind'
  `);

  assert.equal(column.rows.length, 1);
  assert.equal(column.rows[0].data_type, "text");

  // B. author_kind possui as constraints corretas: NOT NULL + CHECK
  // restringindo aos quatro valores canônicos.
  assert.equal(column.rows[0].is_nullable, "NO");

  const checkConstraint = await db.query(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conname = 'conversation_messages_author_kind_check'
  `);

  assert.equal(checkConstraint.rows.length, 1);

  for (const value of ["customer", "human_agent", "automation", "unknown"]) {
    assert.ok(
      checkConstraint.rows[0].definition.includes(value),
      `CHECK precisa mencionar '${value}'`,
    );
  }
}

async function assertIngestionRpcExecutable(db, messageKeyPrefix) {
  // C. rpc_ingest_companion_messages continua executável.
  // D. payload legado WhatsApp sem author_kind continua funcionando.
  const legacyIncoming = await callIngestion(db, {
    messages: [
      buildMessage({
        message_key: `${messageKeyPrefix}-legacy-incoming`,
        direction: "incoming",
        text_content: "Payload legado sem author_kind (incoming).",
      }),
    ],
  });

  assert.equal(Number(legacyIncoming.inserted_count), 1);

  const legacyOutgoing = await callIngestion(db, {
    messages: [
      buildMessage({
        message_key: `${messageKeyPrefix}-legacy-outgoing`,
        direction: "outgoing",
        text_content: "Payload legado sem author_kind (outgoing).",
      }),
    ],
  });

  assert.equal(Number(legacyOutgoing.inserted_count), 1);

  const legacyRows = await db.query(
    `
      select message_key, direction, author_kind
      from public.conversation_messages
      where company_id = $1
        and conversation_key = $2
        and message_key in ($3, $4)
    `,
    [
      ids.company,
      conversationKey,
      `${messageKeyPrefix}-legacy-incoming`,
      `${messageKeyPrefix}-legacy-outgoing`,
    ],
  );

  const byKey = Object.fromEntries(
    legacyRows.rows.map((row) => [row.message_key, row.author_kind]),
  );

  assert.equal(
    byKey[`${messageKeyPrefix}-legacy-incoming`],
    "customer",
  );
  assert.equal(
    byKey[`${messageKeyPrefix}-legacy-outgoing`],
    "human_agent",
  );

  // E. payload novo com customer / human_agent / automation / unknown
  // persiste corretamente.
  const explicitKinds = [
    "customer",
    "human_agent",
    "automation",
    "unknown",
  ];

  for (const [index, authorKind] of explicitKinds.entries()) {
    const messageKey = `${messageKeyPrefix}-explicit-${authorKind}`;

    const result = await callIngestion(db, {
      messages: [
        buildMessage({
          message_key: messageKey,
          direction: index % 2 === 0 ? "incoming" : "outgoing",
          author_kind: authorKind,
          text_content: `Payload novo com author_kind=${authorKind}.`,
        }),
      ],
    });

    assert.equal(Number(result.inserted_count), 1);
  }

  const explicitRows = await db.query(
    `
      select message_key, author_kind
      from public.conversation_messages
      where company_id = $1
        and conversation_key = $2
        and message_key = any($3::text[])
    `,
    [
      ids.company,
      conversationKey,
      explicitKinds.map(
        (authorKind) => `${messageKeyPrefix}-explicit-${authorKind}`,
      ),
    ],
  );

  const explicitByKey = Object.fromEntries(
    explicitRows.rows.map((row) => [row.message_key, row.author_kind]),
  );

  for (const authorKind of explicitKinds) {
    assert.equal(
      explicitByKey[`${messageKeyPrefix}-explicit-${authorKind}`],
      authorKind,
    );
  }
}

test(
  "FULL R2 SCHEMA (author_kind + external identity) funciona como um único estado coerente",
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
        uuid_ossp,
      },
    });

    try {
      await db.exec(supabaseBootstrap);

      // Aplica o schema pré-R2 relevante ao ledger de mensagens — o
      // estado real que já existe na main hoje.
      for (const path of preR2MigrationPaths) {
        await db.exec(await readFile(path, "utf8"));
      }

      // conversation_messages.deletion_reason: reproduz o end-state REAL
      // do projeto Supabase (coluna + constraint, confirmados ao vivo,
      // read-only). O antigo arquivo local com dollar-quoting inválido
      // (20260829010000_add_message_deletion_reason.sql) nunca foi o que
      // rodou de fato e já foi arquivado pela reconciliação de histórico
      // de migrations (ver cabeçalho deste arquivo); este teste continua
      // reproduzindo o end-state diretamente em vez de reexecutar a
      // migration real (20260829042244_add_message_deletion_reason_safe.sql).
      await db.exec(`
        alter table public.conversation_messages
          add column if not exists deletion_reason text;

        update public.conversation_messages
        set deletion_reason = 'dom_disappearance'
        where is_deleted = true
          and deletion_reason is null;

        update public.conversation_messages
        set deletion_reason = null
        where is_deleted = false
          and deletion_reason is not null;

        alter table public.conversation_messages
          add constraint conversation_messages_deletion_reason_check
          check (
            (
              is_deleted = false
              and deletion_reason is null
            )
            or
            (
              is_deleted = true
              and deletion_reason is not null
              and deletion_reason in (
                'explicit_deletion',
                'dom_disappearance'
              )
            )
          );
      `);

      await db.exec(
        "set search_path = public, extensions, pg_catalog",
      );

      await db.exec(`
        insert into auth.users (id, email)
        values ('${ids.user}', 'schema-transition@example.test');

        insert into public.profiles (
          id, full_name, email, is_active_global
        )
        values (
          '${ids.user}',
          'Usuário Transição',
          'schema-transition@example.test',
          true
        );

        insert into public.companies (id, name, legal_name, trade_name)
        values
          (
            '${ids.company}',
            'Empresa Transição',
            'Empresa Transição LTDA',
            'Empresa Transição'
          ),
          (
            '${ids.otherCompany}',
            'Empresa Transição B',
            'Empresa Transição B LTDA',
            'Empresa Transição B'
          );

        insert into public.company_memberships (
          company_id, user_id, role, is_active
        )
        values (
          '${ids.company}', '${ids.user}', 'member', true
        );

        insert into public.leads (id, company_id, name, created_by)
        values
          (
            '${ids.lead}', '${ids.company}', 'Lead Transição', '${ids.user}'
          ),
          (
            '${ids.leadTwo}',
            '${ids.company}',
            'Lead Transição Dois',
            '${ids.user}'
          ),
          (
            '${ids.leadOtherCompany}',
            '${ids.otherCompany}',
            'Lead De Outra Empresa',
            '${ids.user}'
          );

        insert into public.sales_cycles (
          id, company_id, lead_id, owner_user_id
        )
        values (
          '${ids.cycle}', '${ids.company}', '${ids.lead}', '${ids.user}'
        );
      `);

      // ---------------------------------------------------------------
      // 1) Aplica 20260915010000_add_message_author_kind.sql
      // ---------------------------------------------------------------
      await db.exec(
        await readFile(authorKindMigrationPath, "utf8"),
      );
      await db.exec(
        "set search_path = public, extensions, pg_catalog",
      );

      await assertAuthorKindColumnAndConstraints(db);
      await assertIngestionRpcExecutable(db, "pre-identity");

      const ingestionGrantsBeforeIdentity = await db.query(`
        select role.rolname as grantee
        from pg_proc procedure
        cross join lateral aclexplode(procedure.proacl) privilege
        join pg_roles role on role.oid = privilege.grantee
        where procedure.proname = 'rpc_ingest_companion_messages'
      `);

      // ---------------------------------------------------------------
      // 2) Aplica 20260915020000_create_lead_external_identities.sql
      //    NA MESMA SESSÃO DE BANCO.
      // ---------------------------------------------------------------
      await db.exec(
        await readFile(externalIdentityMigrationPath, "utf8"),
      );
      await db.exec(
        "set search_path = public, extensions, pg_catalog",
      );

      // F. lead_external_identities existe.
      const identityTable = await db.query(`
        select 1
        from pg_class relation
        join pg_namespace namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'lead_external_identities'
      `);
      assert.equal(identityTable.rows.length, 1);

      // G. rpc_link_companion_external_identity executa.
      const linked = await callLink(db, { leadId: ids.lead });
      assert.equal(linked.lead_id, ids.lead);

      // H. rpc_touch_companion_external_identity_last_seen executa.
      await callTouch(db);

      // I. resolve/read da identidade externa continua apontando para
      // o lead correto.
      const resolved = await resolveByIdentity(db);
      assert.equal(resolved, ids.lead);

      // J. a migration de external identity não invalida nada que a de
      // author_kind criou: reprova A-E e os grants de
      // rpc_ingest_companion_messages NA MESMA sessão, agora com as
      // duas migrations aplicadas.
      await assertAuthorKindColumnAndConstraints(db);
      await assertIngestionRpcExecutable(db, "post-identity");

      const ingestionGrantsAfterIdentity = await db.query(`
        select role.rolname as grantee
        from pg_proc procedure
        cross join lateral aclexplode(procedure.proacl) privilege
        join pg_roles role on role.oid = privilege.grantee
        where procedure.proname = 'rpc_ingest_companion_messages'
      `);

      assert.deepEqual(
        ingestionGrantsAfterIdentity.rows
          .map((row) => row.grantee)
          .sort(),
        ingestionGrantsBeforeIdentity.rows
          .map((row) => row.grantee)
          .sort(),
      );

      // J (recíproco) — o vínculo de identidade criado antes continua
      // íntegro depois de qualquer nova ingestão de mensagens no mesmo
      // ciclo.
      const stillResolved = await resolveByIdentity(db);
      assert.equal(stillResolved, ids.lead);
    } finally {
      await db.close();
    }
  },
);
