// Fase 12A, Frente 2B - Blocker 2.
//
// Valida ponta a ponta (contra Postgres real via PGlite, incluindo a RPC
// rpc_ingest_companion_messages e a coluna deletion_reason) que:
//   1. uma mensagem excluída com marcador explícito persiste
//      deletion_reason='explicit_deletion';
//   2. uma mensagem excluída por heurística de desaparecimento do DOM
//      persiste deletion_reason='dom_disappearance';
//   3. ausência/valor inválido de deletion_reason no payload NUNCA é
//      promovido a explicit_deletion — cai no default conservador;
//   4. upgrade de dom_disappearance para explicit_deletion (mesma
//      message_key, nova captura) cria uma NOVA versão persistida, não é
//      tratado como "sem mudança";
//   5. mensagem ativa sempre persiste deletion_reason nulo, mesmo que o
//      payload tente enviar um valor;
//   6. o CHECK constraint da tabela impede, mesmo via SQL direto, uma
//      combinação inválida (is_deleted=false com deletion_reason
//      preenchido, ou is_deleted=true com deletion_reason nulo).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

function migrationPath(fileName) {
  return fileURLToPath(
    new URL(`../migrations/${fileName}`, import.meta.url),
  );
}

const migrationPaths = [
  migrationPath("20260629040658_restore_simulator_metrics_rpc_shell.sql"),
  migrationPath("20260730155903_create_conversation_messages_ledger.sql"),
  migrationPath("20260730170515_create_conversation_capture_state.sql"),
  migrationPath("20260731235900_create_companion_message_ingestion_rpc.sql"),
  migrationPath("20260803064000_harden_companion_message_ingestion_rpc.sql"),
  migrationPath("20260803223345_prevent_stale_companion_captures.sql"),
  migrationPath("20260804120000_add_causal_companion_message_versions.sql"),
  migrationPath("20260829010000_add_message_deletion_reason.sql"),
];

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  lead: "20000000-0000-4000-8000-000000000001",
  cycle: "30000000-0000-4000-8000-000000000001",
  user: "40000000-0000-4000-8000-000000000001",
  deviceA: "50000000-0000-4000-8000-000000000001",
};

const conversationKey = "Cliente Deletion Reason::data:5511999990002";

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

async function setupDatabase() {
  const db = new PGlite({
    extensions: { pgcrypto, uuid_ossp },
  });

  await db.exec(supabaseBootstrap);

  for (const path of migrationPaths) {
    await db.exec(await readFile(path, "utf8"));
  }

  await db.exec(
    "set search_path = public, extensions, pg_catalog",
  );

  await db.exec(`
    insert into auth.users (id, email)
    values ('${ids.user}', 'deletion-reason-user@example.test');

    insert into public.profiles (
      id, full_name, email, is_active_global
    )
    values (
      '${ids.user}', 'Usuário Deletion Reason',
      'deletion-reason-user@example.test', true
    );

    insert into public.companies (id, name, legal_name, trade_name)
    values (
      '${ids.company}', 'Empresa Deletion Reason',
      'Empresa Deletion Reason LTDA', 'Empresa Deletion Reason'
    );

    insert into public.company_memberships (
      company_id, user_id, role, is_active
    )
    values ('${ids.company}', '${ids.user}', 'member', true);

    insert into public.leads (id, company_id, name, created_by)
    values ('${ids.lead}', '${ids.company}', 'Lead Deletion Reason', '${ids.user}');

    insert into public.sales_cycles (id, company_id, lead_id, owner_user_id)
    values ('${ids.cycle}', '${ids.company}', '${ids.lead}', '${ids.user}');
  `);

  return db;
}

function buildMessage(overrides = {}) {
  return {
    message_key: "message-deletion-001",
    direction: "incoming",
    occurred_at: "2026-08-04T12:00:00.000Z",
    observed_at: "2026-08-04T12:00:05.000Z",
    base_version: null,
    content_type: "text",
    text_content: "Conteúdo original antes da exclusão.",
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  };
}

async function callIngestion(
  db,
  { deviceKey = ids.deviceA, messages = [buildMessage()] } = {},
) {
  await db.exec("reset role");
  await db.exec("set role service_role");

  try {
    const result = await db.query(
      `
        select *
        from public.rpc_ingest_companion_messages(
          $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::jsonb
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

function getMessageResult(ingestion, messageKey) {
  assert.ok(
    Array.isArray(ingestion.message_results),
    "A RPC precisa retornar message_results.",
  );

  const result = ingestion.message_results.find(
    (item) => item.message_key === messageKey,
  );

  assert.ok(result, `Resultado da mensagem ${messageKey} não encontrado.`);

  return result;
}

async function loadLatestMessage(db, messageKey) {
  await db.exec("reset role");
  await db.exec("set role service_role");

  try {
    const result = await db.query(
      `
        select version, is_deleted, deletion_reason, text_content
        from public.conversation_messages
        where company_id = $1::uuid
          and conversation_key = $2::text
          and message_key = $3::text
        order by version desc
        limit 1
      `,
      [ids.company, conversationKey, messageKey],
    );

    return result.rows[0] ?? null;
  } finally {
    await db.exec("reset role");
  }
}

test(
  "exclusão com marcador explícito persiste deletion_reason=explicit_deletion",
  async () => {
    const db = await setupDatabase();

    try {
      const firstIngestion = await callIngestion(db, {
        messages: [buildMessage({ message_key: "msg-explicit" })],
      });
      const firstResult = getMessageResult(firstIngestion, "msg-explicit");

      const ingestion = await callIngestion(db, {
        messages: [
          buildMessage({
            message_key: "msg-explicit",
            base_version: firstResult.canonical_version,
            is_deleted: true,
            deletion_reason: "explicit_deletion",
          }),
        ],
      });

      assert.equal(Number(ingestion.inserted_count), 1);

      const row = await loadLatestMessage(db, "msg-explicit");

      assert.equal(row.is_deleted, true);
      assert.equal(row.deletion_reason, "explicit_deletion");
      assert.equal(row.text_content, null);
    } finally {
      await db.close();
    }
  },
);

test(
  "exclusão por desaparecimento do DOM persiste deletion_reason=dom_disappearance",
  async () => {
    const db = await setupDatabase();

    try {
      const firstIngestion = await callIngestion(db, {
        messages: [buildMessage({ message_key: "msg-disappeared" })],
      });
      const firstResult = getMessageResult(
        firstIngestion,
        "msg-disappeared",
      );

      await callIngestion(db, {
        messages: [
          buildMessage({
            message_key: "msg-disappeared",
            base_version: firstResult.canonical_version,
            is_deleted: true,
            deletion_reason: "dom_disappearance",
          }),
        ],
      });

      const row = await loadLatestMessage(db, "msg-disappeared");

      assert.equal(row.is_deleted, true);
      assert.equal(row.deletion_reason, "dom_disappearance");
    } finally {
      await db.close();
    }
  },
);

test(
  "ausência ou valor inválido de deletion_reason nunca é promovido a explicit_deletion",
  async () => {
    const db = await setupDatabase();

    try {
      for (const [label, rawValue] of [
        ["ausente", undefined],
        ["nulo", null],
        ["string inválida", "algo-nao-reconhecido"],
      ]) {
        const messageKey = `msg-fallback-${label.replace(/\s+/g, "-")}`;

        const firstIngestion = await callIngestion(db, {
          messages: [buildMessage({ message_key: messageKey })],
        });
        const firstResult = getMessageResult(firstIngestion, messageKey);

        const deletedMessage = buildMessage({
          message_key: messageKey,
          base_version: firstResult.canonical_version,
          is_deleted: true,
        });

        if (rawValue === undefined) {
          delete deletedMessage.deletion_reason;
        } else {
          deletedMessage.deletion_reason = rawValue;
        }

        await callIngestion(db, { messages: [deletedMessage] });

        const row = await loadLatestMessage(db, messageKey);

        assert.equal(
          row.deletion_reason,
          "dom_disappearance",
          `caso "${label}" deveria cair no default conservador`,
        );
      }
    } finally {
      await db.close();
    }
  },
);

test(
  "upgrade de dom_disappearance para explicit_deletion cria nova versão (não é tratado como inalterado)",
  async () => {
    const db = await setupDatabase();

    try {
      const firstIngestion = await callIngestion(db, {
        messages: [buildMessage({ message_key: "msg-upgrade" })],
      });
      const firstResult = getMessageResult(firstIngestion, "msg-upgrade");

      const disappearedIngestion = await callIngestion(db, {
        messages: [
          buildMessage({
            message_key: "msg-upgrade",
            base_version: firstResult.canonical_version,
            is_deleted: true,
            deletion_reason: "dom_disappearance",
          }),
        ],
      });
      const disappearedResult = getMessageResult(
        disappearedIngestion,
        "msg-upgrade",
      );

      const afterDisappearance = await loadLatestMessage(
        db,
        "msg-upgrade",
      );
      assert.equal(afterDisappearance.deletion_reason, "dom_disappearance");
      const versionAfterDisappearance = afterDisappearance.version;

      const upgradeIngestion = await callIngestion(db, {
        messages: [
          buildMessage({
            message_key: "msg-upgrade",
            base_version: disappearedResult.canonical_version,
            is_deleted: true,
            deletion_reason: "explicit_deletion",
          }),
        ],
      });

      assert.equal(
        Number(upgradeIngestion.inserted_count),
        1,
        "o upgrade de razão deveria persistir como uma NOVA versão, não como inalterado",
      );
      assert.equal(Number(upgradeIngestion.unchanged_count), 0);

      const afterUpgrade = await loadLatestMessage(db, "msg-upgrade");
      assert.equal(afterUpgrade.deletion_reason, "explicit_deletion");
      assert.ok(afterUpgrade.version > versionAfterDisappearance);
    } finally {
      await db.close();
    }
  },
);

test(
  "mensagem ativa sempre persiste deletion_reason nulo, mesmo se o payload tentar enviar um valor",
  async () => {
    const db = await setupDatabase();

    try {
      await callIngestion(db, {
        messages: [
          buildMessage({
            message_key: "msg-active-with-reason",
            is_deleted: false,
            deletion_reason: "explicit_deletion",
          }),
        ],
      });

      const row = await loadLatestMessage(db, "msg-active-with-reason");

      assert.equal(row.is_deleted, false);
      assert.equal(row.deletion_reason, null);
    } finally {
      await db.close();
    }
  },
);

test(
  "CHECK constraint impede combinação inválida mesmo via SQL direto",
  async () => {
    const db = await setupDatabase();

    try {
      await db.exec("reset role");
      await db.exec("set role service_role");

      await assert.rejects(
        db.query(
          `
            insert into public.conversation_messages (
              company_id, cycle_id, conversation_key, message_key,
              version, direction, occurred_at, observed_at,
              content_type, text_content, is_deleted, deletion_reason
            )
            values (
              $1::uuid, $2::uuid, $3::text, 'msg-invalid-active-with-reason',
              1, 'incoming', now(), now(),
              'text', 'texto', false, 'explicit_deletion'
            )
          `,
          [ids.company, ids.cycle, conversationKey],
        ),
        /conversation_messages_deletion_reason_check/,
      );

      await assert.rejects(
        db.query(
          `
            insert into public.conversation_messages (
              company_id, cycle_id, conversation_key, message_key,
              version, direction, occurred_at, observed_at,
              content_type, is_deleted, deletion_reason
            )
            values (
              $1::uuid, $2::uuid, $3::text, 'msg-invalid-deleted-without-reason',
              1, 'incoming', now(), now(),
              'text', true, null
            )
          `,
          [ids.company, ids.cycle, conversationKey],
        ),
        /conversation_messages_deletion_reason_check/,
      );
    } finally {
      await db.exec("reset role");
      await db.close();
    }
  },
);
