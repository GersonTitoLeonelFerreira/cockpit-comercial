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

const ledgerMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260730155903_create_conversation_messages_ledger.sql",
    import.meta.url,
  ),
);

const captureStateMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260730170515_create_conversation_capture_state.sql",
    import.meta.url,
  ),
);

const ingestionMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260731235900_create_companion_message_ingestion_rpc.sql",
    import.meta.url,
  ),
);

const ingestionHardeningMigrationPath =
  fileURLToPath(
    new URL(
      "../migrations/20260803064000_harden_companion_message_ingestion_rpc.sql",
      import.meta.url,
    ),
  );

const ids = {
  companyA: "10000000-0000-4000-8000-000000000001",
  companyB: "10000000-0000-4000-8000-000000000002",

  leadA: "20000000-0000-4000-8000-000000000001",
  leadB: "20000000-0000-4000-8000-000000000002",

  cycleA: "30000000-0000-4000-8000-000000000001",
  cycleB: "30000000-0000-4000-8000-000000000002",

  userA: "40000000-0000-4000-8000-000000000001",
  userOther: "40000000-0000-4000-8000-000000000002",
  userInactive: "40000000-0000-4000-8000-000000000003",
  userB: "40000000-0000-4000-8000-000000000004",

  deviceA: "50000000-0000-4000-8000-000000000001",
  deviceB: "50000000-0000-4000-8000-000000000002",
};

const conversationA = "Cliente Exemplo::data:5511999990001";
const conversationB = "Cliente Empresa B::data:5511999990001";

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

function buildTextMessage(overrides = {}) {
  return {
    message_key: "message-001",
    direction: "incoming",
    occurred_at: "2026-07-31T15:20:00-03:00",
    content_type: "text",
    text_content: "Olá, quero conhecer os planos.",
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  };
}

function buildAudioMessage(overrides = {}) {
  return {
    message_key: "audio-001",
    direction: "outgoing",
    occurred_at: "2026-07-31T15:22:00-03:00",
    content_type: "audio",
    text_content: null,
    audio_transcription: "Vou explicar as opções disponíveis.",
    is_deleted: false,
    ...overrides,
  };
}

async function callIngestion(
  db,
  {
    companyId = ids.companyA,
    cycleId = ids.cycleA,
    capturedBy = ids.userA,
    conversationKey = conversationA,
    deviceKey = ids.deviceA,
    messages = [buildTextMessage()],
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
        companyId,
        cycleId,
        capturedBy,
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

test(
  "Fase 4 ingere mensagens de forma idempotente, versionada e isolada",
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
      await db.exec(await readFile(ledgerMigrationPath, "utf8"));
      await db.exec(await readFile(captureStateMigrationPath, "utf8"));
      await db.exec(await readFile(ingestionMigrationPath, "utf8"));
      await db.exec(
        await readFile(
          ingestionHardeningMigrationPath,
          "utf8",
        ),
      );
      await db.exec(
        "set search_path = public, extensions, pg_catalog",
      );

      const functionMetadata = await db.query(`
        select
          procedure.prosecdef as security_definer,
          procedure.proconfig as settings
        from pg_proc procedure
        where procedure.oid =
          'public.rpc_ingest_companion_messages(
            uuid,
            uuid,
            uuid,
            text,
            text,
            jsonb
          )'::regprocedure
      `);

      assert.equal(
        functionMetadata.rows[0].security_definer,
        true,
      );

      assert.ok(
        functionMetadata.rows[0].settings.some((setting) =>
          setting.startsWith("search_path="),
        ),
      );

      assert.ok(
        functionMetadata.rows[0].settings.includes(
          "row_security=off",
        ),
      );

      const functionGrants = await db.query(`
        select
          role.rolname as grantee,
          privilege.privilege_type
        from pg_proc procedure
        cross join lateral aclexplode(procedure.proacl) privilege
        join pg_roles role
          on role.oid = privilege.grantee
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
        order by role.rolname, privilege.privilege_type
      `);

      assert.deepEqual(functionGrants.rows, [
        {
          grantee: "service_role",
          privilege_type: "EXECUTE",
        },
      ]);

      await db.exec(`
        insert into auth.users (id, email)
        values
          ('${ids.userA}', 'user-a@example.test'),
          ('${ids.userOther}', 'other@example.test'),
          ('${ids.userInactive}', 'inactive@example.test'),
          ('${ids.userB}', 'user-b@example.test');

        insert into public.profiles (
          id,
          full_name,
          email,
          is_active_global
        )
        values
          (
            '${ids.userA}',
            'Usuário A',
            'user-a@example.test',
            true
          ),
          (
            '${ids.userOther}',
            'Outro usuário',
            'other@example.test',
            true
          ),
          (
            '${ids.userInactive}',
            'Usuário inativo',
            'inactive@example.test',
            true
          ),
          (
            '${ids.userB}',
            'Usuário B',
            'user-b@example.test',
            true
          );

        insert into public.companies (
          id,
          name,
          legal_name,
          trade_name
        )
        values
          (
            '${ids.companyA}',
            'Empresa A',
            'Empresa A LTDA',
            'Empresa A'
          ),
          (
            '${ids.companyB}',
            'Empresa B',
            'Empresa B LTDA',
            'Empresa B'
          );

        insert into public.company_memberships (
          company_id,
          user_id,
          role,
          is_active
        )
        values
          (
            '${ids.companyA}',
            '${ids.userA}',
            'member',
            true
          ),
          (
            '${ids.companyA}',
            '${ids.userOther}',
            'member',
            true
          ),
          (
            '${ids.companyA}',
            '${ids.userInactive}',
            'member',
            false
          ),
          (
            '${ids.companyB}',
            '${ids.userB}',
            'admin',
            true
          );

        insert into public.leads (
          id,
          company_id,
          name,
          created_by
        )
        values
          (
            '${ids.leadA}',
            '${ids.companyA}',
            'Lead A',
            '${ids.userA}'
          ),
          (
            '${ids.leadB}',
            '${ids.companyB}',
            'Lead B',
            '${ids.userB}'
          );

        insert into public.sales_cycles (
          id,
          company_id,
          lead_id,
          owner_user_id
        )
        values
          (
            '${ids.cycleA}',
            '${ids.companyA}',
            '${ids.leadA}',
            '${ids.userA}'
          ),
          (
            '${ids.cycleB}',
            '${ids.companyB}',
            '${ids.leadB}',
            '${ids.userB}'
          );
      `);

      const initialMessages = [
        buildTextMessage(),
        buildAudioMessage(),
      ];

      const firstIngestion = await callIngestion(db, {
        messages: initialMessages,
      });

      assert.equal(
        numberValue(firstIngestion.inserted_count),
        2,
      );
      assert.equal(
        numberValue(firstIngestion.unchanged_count),
        0,
      );
      assert.equal(
        numberValue(firstIngestion.state_version),
        1,
      );

      const firstLedger = await db.query(`
        select
          id,
          message_key,
          version,
          direction,
          content_type,
          text_content,
          audio_transcription,
          is_deleted
        from public.conversation_messages
        where company_id = '${ids.companyA}'
          and conversation_key = '${conversationA}'
        order by id
      `);

      assert.equal(firstLedger.rows.length, 2);
      assert.deepEqual(
        firstLedger.rows.map((row) => ({
          message_key: row.message_key,
          version: numberValue(row.version),
        })),
        [
          {
            message_key: "message-001",
            version: 1,
          },
          {
            message_key: "audio-001",
            version: 1,
          },
        ],
      );

      const firstState = await db.query(`
        select
          last_observed_message_id,
          last_processed_message_id,
          state_version
        from public.conversation_capture_state
        where company_id = '${ids.companyA}'
          and conversation_key = '${conversationA}'
          and device_key = '${ids.deviceA}'
      `);

      assert.equal(firstState.rows.length, 1);
      assert.equal(
        numberValue(
          firstState.rows[0].last_observed_message_id,
        ),
        numberValue(firstIngestion.last_observed_message_id),
      );
      assert.equal(
        firstState.rows[0].last_processed_message_id,
        null,
      );
      assert.equal(
        numberValue(firstState.rows[0].state_version),
        1,
      );

      const repeatedIngestion = await callIngestion(db, {
        messages: initialMessages,
      });

      assert.equal(
        numberValue(repeatedIngestion.inserted_count),
        0,
      );
      assert.equal(
        numberValue(repeatedIngestion.unchanged_count),
        2,
      );
      assert.equal(
        numberValue(repeatedIngestion.state_version),
        1,
      );
      assert.equal(
        numberValue(
          repeatedIngestion.last_observed_message_id,
        ),
        numberValue(
          firstIngestion.last_observed_message_id,
        ),
      );

      const countAfterReplay = await db.query(`
        select count(*)::integer as total
        from public.conversation_messages
        where company_id = '${ids.companyA}'
          and conversation_key = '${conversationA}'
      `);

      assert.equal(countAfterReplay.rows[0].total, 2);

      const editedMessages = [
        buildTextMessage({
          text_content:
            "Olá, quero conhecer especificamente o Plano Open.",
        }),
        buildAudioMessage(),
      ];

      const editedIngestion = await callIngestion(db, {
        messages: editedMessages,
      });

      assert.equal(
        numberValue(editedIngestion.inserted_count),
        1,
      );
      assert.equal(
        numberValue(editedIngestion.unchanged_count),
        1,
      );
      assert.equal(
        numberValue(editedIngestion.state_version),
        2,
      );

      const editedVersions = await db.query(`
        select
          version,
          text_content,
          is_deleted
        from public.conversation_messages
        where company_id = '${ids.companyA}'
          and conversation_key = '${conversationA}'
          and message_key = 'message-001'
        order by version
      `);

      assert.deepEqual(
        editedVersions.rows.map((row) => ({
          version: numberValue(row.version),
          text_content: row.text_content,
          is_deleted: row.is_deleted,
        })),
        [
          {
            version: 1,
            text_content:
              "Olá, quero conhecer os planos.",
            is_deleted: false,
          },
          {
            version: 2,
            text_content:
              "Olá, quero conhecer especificamente o Plano Open.",
            is_deleted: false,
          },
        ],
      );

      const deletedMessage = buildTextMessage({
        text_content:
          "Este conteúdo não pode permanecer na versão apagada.",
        is_deleted: true,
      });

      const deletedIngestion = await callIngestion(db, {
        messages: [deletedMessage],
      });

      assert.equal(
        numberValue(deletedIngestion.inserted_count),
        1,
      );
      assert.equal(
        numberValue(deletedIngestion.unchanged_count),
        0,
      );
      assert.equal(
        numberValue(deletedIngestion.state_version),
        3,
      );

      const deletedVersion = await db.query(`
        select
          version,
          text_content,
          audio_transcription,
          is_deleted
        from public.conversation_messages
        where company_id = '${ids.companyA}'
          and conversation_key = '${conversationA}'
          and message_key = 'message-001'
        order by version desc
        limit 1
      `);

      assert.deepEqual(
        {
          version: numberValue(
            deletedVersion.rows[0].version,
          ),
          text_content:
            deletedVersion.rows[0].text_content,
          audio_transcription:
            deletedVersion.rows[0].audio_transcription,
          is_deleted:
            deletedVersion.rows[0].is_deleted,
        },
        {
          version: 3,
          text_content: null,
          audio_transcription: null,
          is_deleted: true,
        },
      );

      const secondDeviceIngestion = await callIngestion(db, {
        deviceKey: ids.deviceB,
        messages: [
          deletedMessage,
          buildAudioMessage(),
        ],
      });

      assert.equal(
        numberValue(secondDeviceIngestion.inserted_count),
        0,
      );
      assert.equal(
        numberValue(secondDeviceIngestion.unchanged_count),
        2,
      );
      assert.equal(
        numberValue(secondDeviceIngestion.state_version),
        1,
      );

      const deviceStates = await db.query(`
        select
          device_key,
          last_observed_message_id,
          state_version
        from public.conversation_capture_state
        where company_id = '${ids.companyA}'
          and conversation_key = '${conversationA}'
        order by device_key
      `);

      assert.equal(deviceStates.rows.length, 2);
      assert.deepEqual(
        deviceStates.rows.map((row) => ({
          device_key: row.device_key,
          state_version: numberValue(row.state_version),
        })),
        [
          {
            device_key: ids.deviceA,
            state_version: 3,
          },
          {
            device_key: ids.deviceB,
            state_version: 1,
          },
        ],
      );

      await assert.rejects(
        callIngestion(db, {
          capturedBy: ids.userOther,
          messages: [buildTextMessage()],
        }),
        /ciclo pertencente a outro usuário/i,
      );

      await assert.rejects(
        callIngestion(db, {
          capturedBy: ids.userInactive,
          messages: [buildTextMessage()],
        }),
        /sem vínculo ativo/i,
      );

      await assert.rejects(
        callIngestion(db, {
          cycleId: ids.cycleB,
          messages: [buildTextMessage()],
        }),
        /ciclo comercial não encontrado/i,
      );

      const countBeforeDuplicateBatch = await db.query(`
        select count(*)::integer as total
        from public.conversation_messages
      `);

      await assert.rejects(
        callIngestion(db, {
          messages: [
            buildTextMessage({
              message_key: "duplicate-message",
            }),
            buildTextMessage({
              message_key: "duplicate-message",
              text_content: "Segunda ocorrência.",
            }),
          ],
        }),
        /apareceu mais de uma vez/i,
      );

      const countAfterDuplicateBatch = await db.query(`
        select count(*)::integer as total
        from public.conversation_messages
      `);

      assert.equal(
        countAfterDuplicateBatch.rows[0].total,
        countBeforeDuplicateBatch.rows[0].total,
        "O erro precisa desfazer toda a ingestão do lote.",
      );

      const companyBIngestion = await callIngestion(db, {
        companyId: ids.companyB,
        cycleId: ids.cycleB,
        capturedBy: ids.userB,
        conversationKey: conversationB,
        deviceKey: ids.deviceA,
        messages: [
          buildTextMessage({
            text_content:
              "Mesma message_key utilizada por outra empresa.",
          }),
        ],
      });

      assert.equal(
        numberValue(companyBIngestion.inserted_count),
        1,
      );

      const isolatedMessages = await db.query(`
        select
          company_id,
          conversation_key,
          message_key,
          version
        from public.conversation_messages
        where message_key = 'message-001'
        order by company_id, conversation_key, version
      `);

      assert.equal(
        isolatedMessages.rows.some(
          (row) =>
            row.company_id === ids.companyA &&
            row.conversation_key === conversationA,
        ),
        true,
      );

      assert.equal(
        isolatedMessages.rows.some(
          (row) =>
            row.company_id === ids.companyB &&
            row.conversation_key === conversationB,
        ),
        true,
      );

      await assert.rejects(
        callIngestion(db, {
          role: "authenticated",
          messages: [buildTextMessage()],
        }),
        /permission denied/i,
      );

      const countBeforeClosedCycle =
        await db.query(`
          select count(*)::integer as total
          from public.conversation_messages
          where company_id = '${ids.companyA}'
            and cycle_id = '${ids.cycleA}'
        `);

      await db.exec(`
        update public.sales_cycles
        set status = 'ganho'
        where company_id = '${ids.companyA}'
          and id = '${ids.cycleA}';
      `);

      await assert.rejects(
        callIngestion(db, {
          messages: [
            buildTextMessage({
              message_key:
                "message-after-cycle-close",
              text_content:
                "Esta mensagem não pode entrar no ciclo encerrado.",
            }),
          ],
        }),
        /ciclo comercial encerrado/i,
      );

      const countAfterClosedCycle =
        await db.query(`
          select count(*)::integer as total
          from public.conversation_messages
          where company_id = '${ids.companyA}'
            and cycle_id = '${ids.cycleA}'
        `);

      assert.equal(
        countAfterClosedCycle.rows[0].total,
        countBeforeClosedCycle.rows[0].total,
        "Ciclo encerrado não pode receber novas versões de mensagens.",
      );
    } finally {
      await db.close();
    }
  },
);
