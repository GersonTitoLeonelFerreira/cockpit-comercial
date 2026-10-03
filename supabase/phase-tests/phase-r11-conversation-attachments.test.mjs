import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

// Rodada 11 (HML), item B5: tabela dos arquivos incluídos na leitura.
//
// Prova, contra Postgres efêmero (PGlite; nada é aplicado ao banco real),
// que a migração 20261003100000_create_companion_conversation_attachments.sql:
//   - cria a tabela com acesso só pelo servidor (service_role lê, grava e
//     atualiza; anon e authenticated não leem nem gravam; ninguém apaga);
//   - guarda só o resumo (sem coluna de conteúdo nem de URL);
//   - recusa tipo e status desconhecidos e "incluido" sem resumo;
//   - um registro por arquivo (mensagem) por conversa;
//   - não toca o ledger (conversation_messages).
// Fixtures sintéticas.

function migrationPath(fileName) {
  return fileURLToPath(new URL(`../migrations/${fileName}`, import.meta.url));
}

const shellPath = migrationPath(
  "20260629040658_restore_simulator_metrics_rpc_shell.sql",
);

const ledgerPath = migrationPath(
  "20260730155903_create_conversation_messages_ledger.sql",
);

const attachmentsPath = migrationPath(
  "20261003100000_create_companion_conversation_attachments.sql",
);

const ids = {
  company: "12000000-0000-4000-8000-000000000001",
  lead: "22000000-0000-4000-8000-000000000001",
  cycle: "32000000-0000-4000-8000-000000000001",
  user: "42000000-0000-4000-8000-000000000001",
};

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

async function buildDb() {
  const db = new PGlite({
    extensions: {
      pgcrypto,
      uuid_ossp,
    },
  });

  await db.exec(supabaseBootstrap);
  await db.exec(await readFile(shellPath, "utf8"));
  await db.exec(await readFile(ledgerPath, "utf8"));
  await db.exec(await readFile(attachmentsPath, "utf8"));
  await db.exec("set search_path = public, extensions, pg_catalog");

  await db.exec(`
    insert into auth.users (id, email)
    values ('${ids.user}', 'r11-attachments@example.test');

    insert into public.companies (id, name, legal_name, trade_name)
    values ('${ids.company}', 'Empresa Sintética', 'Empresa Sintética LTDA', 'Empresa Sintética');

    insert into public.leads (id, company_id, name, created_by)
    values ('${ids.lead}', '${ids.company}', 'Lead Sintético', '${ids.user}');

    insert into public.sales_cycles (id, company_id, lead_id, owner_user_id, status)
    values ('${ids.cycle}', '${ids.company}', '${ids.lead}', '${ids.user}', 'negociacao');
  `);

  return db;
}

const insertRow = (overrides = {}) => {
  const row = {
    company_id: ids.company,
    cycle_id: ids.cycle,
    conversation_key: "whatsapp:sintetico:contato-001",
    message_key: "mensagem-sintetica-arquivo-001",
    kind: "pdf",
    file_name: "Proposta.pdf",
    size_bytes: 120000,
    page_count: 3,
    status: "resumindo",
    included_by: ids.user,
    ...overrides,
  };

  const columns = Object.keys(row);

  return {
    sql: `insert into public.companion_conversation_attachments (${columns.join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")}) returning id`,
    params: columns.map((column) => row[column]),
  };
};

test("B5: service_role grava, lê e atualiza; o resumo fecha o registro", async () => {
  const db = await buildDb();

  try {
    await db.exec("set role service_role");

    const { sql, params } = insertRow();
    const inserted = await db.query(sql, params);
    const id = inserted.rows[0].id;

    await db.query(
      `update public.companion_conversation_attachments
         set status = 'incluido', summary = $2, summarized_at = now(), model = 'claude-haiku-4-5', input_tokens = 900, output_tokens = 120
       where id = $1`,
      [id, "Proposta do plano anual: R$ 100,00 por mês, validade até 10/10."],
    );

    const row = (await db.query("select status, summary from public.companion_conversation_attachments where id = $1", [id])).rows[0];

    assert.equal(row.status, "incluido");
    assert.match(row.summary, /plano anual/);
  } finally {
    await db.exec("reset role");
    await db.close();
  }
});

test("B5: anon e authenticated não leem nem gravam; ninguém apaga", async () => {
  const db = await buildDb();

  try {
    const { sql, params } = insertRow();
    await db.query(sql, params);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);

      try {
        await assert.rejects(
          db.query("select * from public.companion_conversation_attachments"),
          /permission denied/i,
          `${role} lê`,
        );

        const other = insertRow({ message_key: `mensagem-${role}` });

        await assert.rejects(
          db.query(other.sql, other.params),
          /permission denied/i,
          `${role} grava`,
        );
      } finally {
        await db.exec("reset role");
      }
    }

    await db.exec("set role service_role");

    try {
      await assert.rejects(
        db.query("delete from public.companion_conversation_attachments"),
        /permission denied/i,
      );
    } finally {
      await db.exec("reset role");
    }

    const privileges = await db.query(`
      select
        has_table_privilege('anon', 'public.companion_conversation_attachments', 'select') as anon_select,
        has_table_privilege('authenticated', 'public.companion_conversation_attachments', 'select') as authenticated_select,
        has_table_privilege('service_role', 'public.companion_conversation_attachments', 'select') as service_select,
        has_table_privilege('service_role', 'public.companion_conversation_attachments', 'delete') as service_delete
    `);

    assert.deepEqual(privileges.rows[0], {
      anon_select: false,
      authenticated_select: false,
      service_select: true,
      service_delete: false,
    });

    const rls = await db.query(`
      select relrowsecurity, relforcerowsecurity
      from pg_class
      where oid = 'public.companion_conversation_attachments'::regclass
    `);

    assert.deepEqual(rls.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
  } finally {
    await db.close();
  }
});

test("B5: só o resumo — sem coluna de conteúdo nem de URL; tipo, status e resumo validados; um registro por arquivo", async () => {
  const db = await buildDb();

  try {
    const columns = (await db.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'companion_conversation_attachments'
    `)).rows.map((row) => row.column_name);

    for (const forbidden of ["content", "content_base64", "file_url", "url", "data", "bytes"]) {
      assert.equal(columns.includes(forbidden), false, forbidden);
    }

    for (const required of ["company_id", "cycle_id", "conversation_key", "message_key", "kind", "file_name", "size_bytes", "status", "summary", "model", "input_tokens", "output_tokens", "included_by", "requested_at", "summarized_at"]) {
      assert.ok(columns.includes(required), required);
    }

    const badKind = insertRow({ kind: "video" });
    await assert.rejects(db.query(badKind.sql, badKind.params), /kind_check/);

    const badStatus = insertRow({ status: "baixado" });
    await assert.rejects(db.query(badStatus.sql, badStatus.params), /status_check/);

    const noSummary = insertRow({ status: "incluido" });
    await assert.rejects(db.query(noSummary.sql, noSummary.params), /summary_check/);

    const first = insertRow();
    await db.query(first.sql, first.params);

    const duplicate = insertRow();
    await assert.rejects(db.query(duplicate.sql, duplicate.params), /message_uidx|duplicate key/);
  } finally {
    await db.close();
  }
});

test("B5: a migração não toca o ledger", async () => {
  const source = await readFile(attachmentsPath, "utf8");
  const withoutComments = source.replace(/--.*$/gm, "");

  assert.doesNotMatch(withoutComments, /conversation_messages/);
  assert.doesNotMatch(withoutComments, /\b(delete\s+from|truncate|drop\s+table|alter\s+table\s+public\.conversation_messages)\b/i);
});
