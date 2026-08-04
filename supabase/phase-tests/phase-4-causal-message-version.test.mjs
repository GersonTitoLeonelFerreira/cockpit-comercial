import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

function migrationPath(fileName) {
  return fileURLToPath(
    new URL(
      `../migrations/${fileName}`,
      import.meta.url,
    ),
  );
}

const migrationPaths = [
  migrationPath(
    "20260629040658_restore_simulator_metrics_rpc_shell.sql",
  ),
  migrationPath(
    "20260730155903_create_conversation_messages_ledger.sql",
  ),
  migrationPath(
    "20260730170515_create_conversation_capture_state.sql",
  ),
  migrationPath(
    "20260731235900_create_companion_message_ingestion_rpc.sql",
  ),
  migrationPath(
    "20260803064000_harden_companion_message_ingestion_rpc.sql",
  ),
  migrationPath(
    "20260803223345_prevent_stale_companion_captures.sql",
  ),
  migrationPath(
    "20260804120000_add_causal_companion_message_versions.sql",
  ),
];

const ids = {
  company:
    "10000000-0000-4000-8000-000000000001",
  lead:
    "20000000-0000-4000-8000-000000000001",
  cycle:
    "30000000-0000-4000-8000-000000000001",
  user:
    "40000000-0000-4000-8000-000000000001",
  deviceA:
    "50000000-0000-4000-8000-000000000001",
  deviceB:
    "50000000-0000-4000-8000-000000000002",
  deviceC:
    "50000000-0000-4000-8000-000000000003",
};

const conversationKey =
  "Cliente Causal::data:5511999990001";

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
    message_key: "message-causal-001",
    direction: "incoming",
    occurred_at:
      "2026-08-04T12:00:00.000Z",
    observed_at:
      "2026-08-04T12:00:05.000Z",
    base_version: null,
    content_type: "text",
    text_content:
      "Estado original da mensagem.",
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  };
}

async function callIngestion(
  db,
  {
    deviceKey = ids.deviceA,
    messages = [buildMessage()],
    role = "service_role",
  } = {},
) {
  await db.exec("reset role");
  await db.exec(`set role ${role}`);

  try {
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
        ids.user,
        conversationKey,
        deviceKey,
        JSON.stringify(messages),
      ],
    );

    return result.rows[0];
  } finally {
    await db.exec("reset role");
  }
}

function numberValue(value) {
  return Number(value);
}

function getMessageResult(
  ingestion,
  messageKey = "message-causal-001",
) {
  assert.ok(
    Array.isArray(
      ingestion.message_results,
    ),
    "A RPC precisa retornar message_results.",
  );

  const result =
    ingestion.message_results.find(
      (item) =>
        item.message_key ===
        messageKey,
    );

  assert.ok(
    result,
    `Resultado da mensagem ${messageKey} não encontrado.`,
  );

  return result;
}

function assertIngestionCounts(
  ingestion,
  {
    inserted,
    unchanged,
    conflicts,
  },
) {
  assert.equal(
    numberValue(
      ingestion.inserted_count,
    ),
    inserted,
  );

  assert.equal(
    numberValue(
      ingestion.unchanged_count,
    ),
    unchanged,
  );

  assert.equal(
    numberValue(
      ingestion.conflict_count,
    ),
    conflicts,
  );
}

test(
  "Fase 4 usa versões causais entre dispositivos sem sobrescrever estado canônico",
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
        uuid_ossp,
      },
    });

    try {
      await db.exec(
        supabaseBootstrap,
      );

      for (
        const path of migrationPaths
      ) {
        await db.exec(
          await readFile(
            path,
            "utf8",
          ),
        );
      }

      await db.exec(
        "set search_path = public, extensions, pg_catalog",
      );

      await db.exec(`
        insert into auth.users (
          id,
          email
        )
        values (
          '${ids.user}',
          'causal-user@example.test'
        );

        insert into public.profiles (
          id,
          full_name,
          email,
          is_active_global
        )
        values (
          '${ids.user}',
          'Usuário Causal',
          'causal-user@example.test',
          true
        );

        insert into public.companies (
          id,
          name,
          legal_name,
          trade_name
        )
        values (
          '${ids.company}',
          'Empresa Causal',
          'Empresa Causal LTDA',
          'Empresa Causal'
        );

        insert into public.company_memberships (
          company_id,
          user_id,
          role,
          is_active
        )
        values (
          '${ids.company}',
          '${ids.user}',
          'member',
          true
        );

        insert into public.leads (
          id,
          company_id,
          name,
          created_by
        )
        values (
          '${ids.lead}',
          '${ids.company}',
          'Lead Causal',
          '${ids.user}'
        );

        insert into public.sales_cycles (
          id,
          company_id,
          lead_id,
          owner_user_id
        )
        values (
          '${ids.cycle}',
          '${ids.company}',
          '${ids.lead}',
          '${ids.user}'
        );
      `);

      const deviceTableSecurity =
        await db.query(`
          select
            relation.relrowsecurity
              as rls_enabled,
            relation.relforcerowsecurity
              as rls_forced
          from pg_class relation
          join pg_namespace namespace
            on namespace.oid =
              relation.relnamespace
          where namespace.nspname =
              'public'
            and relation.relname =
              'conversation_message_device_state'
        `);

      assert.deepEqual(
        deviceTableSecurity.rows,
        [
          {
            rls_enabled: true,
            rls_forced: true,
          },
        ],
      );

      const functionGrants =
        await db.query(`
          select
            role.rolname as grantee,
            privilege.privilege_type
          from pg_proc procedure
          cross join lateral
            aclexplode(
              procedure.proacl
            ) privilege
          join pg_roles role
            on role.oid =
              privilege.grantee
          where procedure.oid =
            'public.rpc_ingest_companion_messages(
              uuid,
              uuid,
              uuid,
              text,
              text,
              jsonb
            )'::regprocedure
            and role.rolname in (
              'anon',
              'authenticated',
              'service_role'
            )
          order by
            role.rolname,
            privilege.privilege_type
        `);

      assert.deepEqual(
        functionGrants.rows,
        [
          {
            grantee:
              "service_role",
            privilege_type:
              "EXECUTE",
          },
        ],
      );

      /*
       * Cenário 1:
       * primeira captura cria a versão
       * canônica 1.
       */
      const firstIngestion =
        await callIngestion(db, {
          deviceKey:
            ids.deviceA,
          messages: [
            buildMessage(),
          ],
        });

      assertIngestionCounts(
        firstIngestion,
        {
          inserted: 1,
          unchanged: 0,
          conflicts: 0,
        },
      );

      assert.deepEqual(
        getMessageResult(
          firstIngestion,
        ),
        {
          message_key:
            "message-causal-001",
          synced: true,
          canonical_version: "1",
          reason: null,
        },
      );

      /*
       * Cenário 2:
       * outro dispositivo encontra
       * estado idêntico e confirma
       * a versão 1 sem duplicar.
       */
      const identicalBaseline =
        await callIngestion(db, {
          deviceKey:
            ids.deviceB,
          messages: [
            buildMessage({
              observed_at:
                "2026-08-04T12:01:00.000Z",
            }),
          ],
        });

      assertIngestionCounts(
        identicalBaseline,
        {
          inserted: 0,
          unchanged: 1,
          conflicts: 0,
        },
      );

      assert.deepEqual(
        getMessageResult(
          identicalBaseline,
        ),
        {
          message_key:
            "message-causal-001",
          synced: true,
          canonical_version: "1",
          reason: null,
        },
      );

      /*
       * Cenário 3:
       * dispositivo A altera a mensagem
       * usando a versão-base correta.
       */
      const correctBaseEdit =
        await callIngestion(db, {
          deviceKey:
            ids.deviceA,
          messages: [
            buildMessage({
              observed_at:
                "2026-08-04T12:02:00.000Z",
              base_version: "1",
              text_content:
                "Estado editado e confirmado.",
            }),
          ],
        });

      assertIngestionCounts(
        correctBaseEdit,
        {
          inserted: 1,
          unchanged: 0,
          conflicts: 0,
        },
      );

      assert.deepEqual(
        getMessageResult(
          correctBaseEdit,
        ),
        {
          message_key:
            "message-causal-001",
          synced: true,
          canonical_version: "2",
          reason: null,
        },
      );

      /*
       * Cenário 4:
       * dispositivo C abre cache inicial
       * antigo depois da edição.
       * Não possui versão confirmada e
       * não pode substituir a versão 2.
       */
      const staleInitialCache =
        await callIngestion(db, {
          deviceKey:
            ids.deviceC,
          messages: [
            buildMessage({
              observed_at:
                "2026-08-04T12:03:00.000Z",
              base_version: null,
              text_content:
                "Estado original da mensagem.",
            }),
          ],
        });

      assertIngestionCounts(
        staleInitialCache,
        {
          inserted: 0,
          unchanged: 1,
          conflicts: 1,
        },
      );

      assert.deepEqual(
        getMessageResult(
          staleInitialCache,
        ),
        {
          message_key:
            "message-causal-001",
          synced: false,
          canonical_version: "2",
          reason:
            "VERSION_CONFLICT",
        },
      );

      /*
       * Nova mutação correta:
       * dispositivo A conhece a versão 2
       * e registra a exclusão como versão 3.
       */
      const correctBaseDeletion =
        await callIngestion(db, {
          deviceKey:
            ids.deviceA,
          messages: [
            buildMessage({
              observed_at:
                "2026-08-04T12:04:00.000Z",
              base_version: "2",
              text_content: null,
              is_deleted: true,
            }),
          ],
        });

      assertIngestionCounts(
        correctBaseDeletion,
        {
          inserted: 1,
          unchanged: 0,
          conflicts: 0,
        },
      );

      assert.deepEqual(
        getMessageResult(
          correctBaseDeletion,
        ),
        {
          message_key:
            "message-causal-001",
          synced: true,
          canonical_version: "3",
          reason: null,
        },
      );

      /*
       * Cenário 5:
       * um retry atrasado ainda carrega
       * base_version 2, mas o dispositivo
       * já confirmou a versão 3.
       */
      const delayedRetry =
        await callIngestion(db, {
          deviceKey:
            ids.deviceA,
          messages: [
            buildMessage({
              observed_at:
                "2026-08-04T12:02:30.000Z",
              base_version: "2",
              text_content:
                "Estado editado e confirmado.",
              is_deleted: false,
            }),
          ],
        });

      assertIngestionCounts(
        delayedRetry,
        {
          inserted: 0,
          unchanged: 1,
          conflicts: 1,
        },
      );

      assert.deepEqual(
        getMessageResult(
          delayedRetry,
        ),
        {
          message_key:
            "message-causal-001",
          synced: false,
          canonical_version: "3",
          reason:
            "VERSION_CONFLICT",
        },
      );

      /*
       * O ledger precisa continuar
       * append-only com três versões.
       */
      const ledger =
        await db.query(`
          select
            version,
            text_content,
            is_deleted
          from public.conversation_messages
          where company_id =
              '${ids.company}'
            and conversation_key =
              '${conversationKey}'
            and message_key =
              'message-causal-001'
          order by version
        `);

      assert.deepEqual(
        ledger.rows.map((row) => {
          return {
            version:
              numberValue(
                row.version,
              ),
            text_content:
              row.text_content,
            is_deleted:
              row.is_deleted,
          };
        }),
        [
          {
            version: 1,
            text_content:
              "Estado original da mensagem.",
            is_deleted: false,
          },
          {
            version: 2,
            text_content:
              "Estado editado e confirmado.",
            is_deleted: false,
          },
          {
            version: 3,
            text_content: null,
            is_deleted: true,
          },
        ],
      );

      /*
       * O estado canônico deve continuar
       * na exclusão da versão 3.
       */
      const canonicalState =
        await db.query(`
          select
            reconciliation.causal_version,
            message.version,
            message.text_content,
            message.is_deleted
          from
            public.conversation_message_reconciliation_state
              reconciliation
          join public.conversation_messages
            message
            on message.id =
              reconciliation.current_message_id
          where reconciliation.company_id =
              '${ids.company}'
            and reconciliation.conversation_key =
              '${conversationKey}'
            and reconciliation.message_key =
              'message-causal-001'
        `);

      assert.deepEqual(
        {
          causal_version:
            numberValue(
              canonicalState.rows[0]
                .causal_version,
            ),
          version:
            numberValue(
              canonicalState.rows[0]
                .version,
            ),
          text_content:
            canonicalState.rows[0]
              .text_content,
          is_deleted:
            canonicalState.rows[0]
              .is_deleted,
        },
        {
          causal_version: 3,
          version: 3,
          text_content: null,
          is_deleted: true,
        },
      );

      /*
       * Dispositivo A confirmou a versão 3.
       * Dispositivo B continua na versão 1.
       * Dispositivo C não é confirmado,
       * pois recebeu conflito.
       */
      const deviceStates =
        await db.query(`
          select
            device_key,
            confirmed_causal_version
          from
            public.conversation_message_device_state
          where company_id =
              '${ids.company}'
            and conversation_key =
              '${conversationKey}'
            and message_key =
              'message-causal-001'
          order by device_key
        `);

      assert.deepEqual(
        deviceStates.rows.map((row) => {
          return {
            device_key:
              row.device_key,
            confirmed_causal_version:
              numberValue(
                row.confirmed_causal_version,
              ),
          };
        }),
        [
          {
            device_key:
              ids.deviceA,
            confirmed_causal_version: 3,
          },
          {
            device_key:
              ids.deviceB,
            confirmed_causal_version: 1,
          },
        ],
      );

      await assert.rejects(
        callIngestion(db, {
          role: "authenticated",
          messages: [
            buildMessage(),
          ],
        }),
        /permission denied/i,
      );
    } finally {
      await db.close();
    }
  },
);
