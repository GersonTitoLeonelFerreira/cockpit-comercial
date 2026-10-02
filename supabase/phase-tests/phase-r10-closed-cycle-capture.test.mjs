import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

// Rodada 10 (HML), item J: captura em ciclo encerrado.
//
// Prova, contra Postgres efêmero (PGlite; nada é aplicado ao banco real),
// que a migração 20261003090000_allow_closed_cycle_companion_capture.sql:
//   - com p_allow_closed_cycle = false (ou sem o parâmetro), recusa o ciclo
//     em ganho, perdido ou cancelado com a mesma mensagem de hoje;
//   - com true, aceita;
//   - ciclo aberto se comporta igual nos dois casos;
//   - continua security definer, com search_path vazio, executável só por
//     service_role (anon e authenticated não executam).
// Fixtures sintéticas.

function migrationPath(fileName) {
  return fileURLToPath(new URL(`../migrations/${fileName}`, import.meta.url));
}

const chainPaths = [
  migrationPath("20260629040658_restore_simulator_metrics_rpc_shell.sql"),
  migrationPath("20260730155903_create_conversation_messages_ledger.sql"),
  migrationPath("20260730170515_create_conversation_capture_state.sql"),
  migrationPath("20260803030154_create_companion_message_ingestion_rpc.sql"),
  migrationPath("20260803223345_prevent_stale_companion_captures.sql"),
  migrationPath("20260804120000_add_causal_companion_message_versions.sql"),
];

const authorKindPath = migrationPath(
  "20260915010000_add_message_author_kind.sql",
);

const closedCyclePath = migrationPath(
  "20261003090000_allow_closed_cycle_companion_capture.sql",
);

const CLOSED_REFUSAL =
  "Ciclo comercial encerrado não aceita captura de mensagens";

const ids = {
  company: "11000000-0000-4000-8000-000000000001",
  lead: "21000000-0000-4000-8000-000000000001",
  // Um ciclo ativo por lead: o cancelado fica em outro lead.
  leadCanceled: "21000000-0000-4000-8000-000000000002",
  user: "41000000-0000-4000-8000-000000000001",
  device: "51000000-0000-4000-8000-000000000001",
  cycles: {
    contato: "31000000-0000-4000-8000-000000000001",
    ganho: "31000000-0000-4000-8000-000000000002",
    perdido: "31000000-0000-4000-8000-000000000003",
    cancelado: "31000000-0000-4000-8000-000000000004",
  },
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

function buildMessage(overrides = {}) {
  return {
    message_key: "r10-message-001",
    direction: "incoming",
    occurred_at: "2026-10-02T15:20:00-03:00",
    observed_at: "2026-10-02T18:20:05.000Z",
    content_type: "text",
    text_content: "Mensagem sintética depois do fechamento.",
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  };
}

async function buildDb({ withClosedCycleMigration }) {
  const db = new PGlite({
    extensions: {
      pgcrypto,
      uuid_ossp,
    },
  });

  await db.exec(supabaseBootstrap);

  for (const path of chainPaths) {
    await db.exec(await readFile(path, "utf8"));
  }

  // Mesmo end-state de deletion_reason usado pelo teste de contrato do
  // ledger (o arquivo local antigo não é reexecutado).
  await db.exec(`
    alter table public.conversation_messages
      add column if not exists deletion_reason text;

    alter table public.conversation_messages
      add constraint conversation_messages_deletion_reason_check
      check (
        (is_deleted = false and deletion_reason is null)
        or (
          is_deleted = true
          and deletion_reason is not null
          and deletion_reason in ('explicit_deletion', 'dom_disappearance')
        )
      );
  `);

  await db.exec(await readFile(authorKindPath, "utf8"));

  if (withClosedCycleMigration) {
    await db.exec(await readFile(closedCyclePath, "utf8"));
  }

  await db.exec("set search_path = public, extensions, pg_catalog");

  await db.exec(`
    insert into auth.users (id, email)
    values ('${ids.user}', 'r10-closed-cycle@example.test');

    insert into public.profiles (id, full_name, email, is_active_global)
    values ('${ids.user}', 'Vendedor Sintético', 'r10-closed-cycle@example.test', true);

    insert into public.companies (id, name, legal_name, trade_name)
    values ('${ids.company}', 'Empresa Sintética', 'Empresa Sintética LTDA', 'Empresa Sintética');

    insert into public.company_memberships (company_id, user_id, role, is_active)
    values ('${ids.company}', '${ids.user}', 'member', true);

    insert into public.leads (id, company_id, name, created_by)
    values
      ('${ids.lead}', '${ids.company}', 'Lead Sintético', '${ids.user}'),
      ('${ids.leadCanceled}', '${ids.company}', 'Lead Sintético B', '${ids.user}');

    insert into public.sales_cycles (id, company_id, lead_id, owner_user_id, status)
    values ('${ids.cycles.contato}', '${ids.company}', '${ids.lead}', '${ids.user}', 'contato');

    insert into public.sales_cycles (
      id, company_id, lead_id, owner_user_id, status,
      won_at, closed_at, won_owner_user_id
    )
    values (
      '${ids.cycles.ganho}', '${ids.company}', '${ids.lead}', '${ids.user}', 'ganho',
      now(), now(), '${ids.user}'
    );

    insert into public.sales_cycles (
      id, company_id, lead_id, owner_user_id, status,
      lost_at, closed_at, lost_reason
    )
    values (
      '${ids.cycles.perdido}', '${ids.company}', '${ids.lead}', '${ids.user}', 'perdido',
      now(), now(), 'Motivo sintético'
    );

    insert into public.sales_cycles (
      id, company_id, lead_id, owner_user_id, status,
      canceled_at, canceled_reason
    )
    values (
      '${ids.cycles.cancelado}', '${ids.company}', '${ids.leadCanceled}', '${ids.user}', 'cancelado',
      now(), 'Motivo sintético'
    );
  `);

  return db;
}

// allowClosedCycle: undefined → chamada de hoje (6 parâmetros, sem o novo).
async function ingest(db, { cycleId, allowClosedCycle, conversationKey }) {
  const params = [
    ids.company,
    cycleId,
    ids.user,
    conversationKey,
    ids.device,
    JSON.stringify([buildMessage()]),
  ];

  if (allowClosedCycle === undefined) {
    const result = await db.query(
      `select * from public.rpc_ingest_companion_messages(
        $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::jsonb
      )`,
      params,
    );

    return result.rows[0];
  }

  const result = await db.query(
    `select * from public.rpc_ingest_companion_messages(
      p_company_id => $1::uuid,
      p_cycle_id => $2::uuid,
      p_captured_by => $3::uuid,
      p_conversation_key => $4::text,
      p_device_key => $5::text,
      p_messages => $6::jsonb,
      p_allow_closed_cycle => $7::boolean
    )`,
    [...params, allowClosedCycle],
  );

  return result.rows[0];
}

async function ledgerCount(db, cycleId) {
  const result = await db.query(
    "select count(*)::int as total from public.conversation_messages where cycle_id = $1",
    [cycleId],
  );

  return result.rows[0].total;
}

test("J: sem a migração, o ciclo encerrado é recusado (comportamento de hoje, base de comparação)", async () => {
  const db = await buildDb({ withClosedCycleMigration: false });

  try {
    for (const status of ["ganho", "perdido", "cancelado"]) {
      await assert.rejects(
        ingest(db, {
          cycleId: ids.cycles[status],
          conversationKey: `whatsapp:r10:${status}`,
        }),
        (error) => error.message === CLOSED_REFUSAL,
      );
    }
  } finally {
    await db.close();
  }
});

test("J: com p_allow_closed_cycle = false (ou sem o parâmetro), ganho, perdido e cancelado são recusados com a mesma mensagem", async () => {
  const db = await buildDb({ withClosedCycleMigration: true });

  try {
    for (const status of ["ganho", "perdido", "cancelado"]) {
      for (const allowClosedCycle of [undefined, false, null]) {
        await assert.rejects(
          ingest(db, {
            cycleId: ids.cycles[status],
            allowClosedCycle,
            conversationKey: `whatsapp:r10:${status}`,
          }),
          (error) => error.message === CLOSED_REFUSAL,
          `${status} com ${String(allowClosedCycle)} deveria recusar`,
        );
      }

      assert.equal(await ledgerCount(db, ids.cycles[status]), 0);
    }
  } finally {
    await db.close();
  }
});

test("J: com p_allow_closed_cycle = true, ganho, perdido e cancelado aceitam a captura", async () => {
  const db = await buildDb({ withClosedCycleMigration: true });

  try {
    for (const status of ["ganho", "perdido", "cancelado"]) {
      const result = await ingest(db, {
        cycleId: ids.cycles[status],
        allowClosedCycle: true,
        conversationKey: `whatsapp:r10:${status}`,
      });

      assert.equal(result.inserted_count, 1, status);
      assert.equal(result.conflict_count, 0, status);
      assert.equal(await ledgerCount(db, ids.cycles[status]), 1, status);

      // Repetir a mesma mensagem não duplica (resto das regras igual).
      const again = await ingest(db, {
        cycleId: ids.cycles[status],
        allowClosedCycle: true,
        conversationKey: `whatsapp:r10:${status}`,
      });

      assert.equal(again.inserted_count, 0, status);
      assert.equal(again.unchanged_count, 1, status);
      assert.equal(await ledgerCount(db, ids.cycles[status]), 1, status);
    }
  } finally {
    await db.close();
  }
});

test("J: ciclo aberto se comporta igual com e sem o parâmetro", async () => {
  const db = await buildDb({ withClosedCycleMigration: true });

  try {
    const results = [];

    for (const [index, allowClosedCycle] of [undefined, false, true].entries()) {
      const result = await ingest(db, {
        cycleId: ids.cycles.contato,
        allowClosedCycle,
        conversationKey: `whatsapp:r10:aberto:${index}`,
      });

      results.push({
        inserted_count: result.inserted_count,
        unchanged_count: result.unchanged_count,
        conflict_count: result.conflict_count,
        state_version: String(result.state_version),
        statuses: result.message_results.map((item) => item.status ?? item.result ?? null),
      });
    }

    assert.deepEqual(results[1], results[0]);
    assert.deepEqual(results[2], results[0]);
    assert.equal(results[0].inserted_count, 1);
    assert.equal(await ledgerCount(db, ids.cycles.contato), 3);
  } finally {
    await db.close();
  }
});

test("J: a função continua security definer, search_path vazio, row_security off e executável só por service_role", async () => {
  const db = await buildDb({ withClosedCycleMigration: true });

  try {
    const overloads = await db.query(`
      select
        p.oid::regprocedure::text as signature,
        p.prosecdef as security_definer,
        p.proconfig as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'rpc_ingest_companion_messages'
    `);

    // Uma assinatura só: a antiga (6 parâmetros) saiu.
    assert.equal(overloads.rows.length, 1);

    const [fn] = overloads.rows;

    assert.match(fn.signature, /,boolean\)$/);
    assert.equal(fn.security_definer, true);
    assert.ok(fn.config.some((item) => /^search_path=("")?$/.test(item)), fn.config.join(","));
    assert.ok(fn.config.includes("row_security=off"), fn.config.join(","));

    const privileges = await db.query(`
      select
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
        has_function_privilege('service_role', p.oid, 'execute') as service_role
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'rpc_ingest_companion_messages'
    `);

    assert.deepEqual(privileges.rows[0], {
      anon: false,
      authenticated: false,
      service_role: true,
    });

    // anon e authenticated, de fato, não executam.
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);

      try {
        await assert.rejects(
          ingest(db, {
            cycleId: ids.cycles.contato,
            allowClosedCycle: true,
            conversationKey: `whatsapp:r10:${role}`,
          }),
          /permission denied/i,
        );
      } finally {
        await db.exec("reset role");
      }
    }

    // service_role executa.
    await db.exec("set role service_role");

    try {
      const result = await ingest(db, {
        cycleId: ids.cycles.ganho,
        allowClosedCycle: true,
        conversationKey: "whatsapp:r10:service-role",
      });

      assert.equal(result.inserted_count, 1);
    } finally {
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("J: a migração não apaga nem altera linhas do ledger", async () => {
  const db = await buildDb({ withClosedCycleMigration: false });

  try {
    await ingest(db, {
      cycleId: ids.cycles.contato,
      conversationKey: "whatsapp:r10:antes",
    });

    const before = await db.query(
      "select id, message_key, version, text_content, observed_at from public.conversation_messages order by id",
    );

    await db.exec(await readFile(closedCyclePath, "utf8"));

    const after = await db.query(
      "select id, message_key, version, text_content, observed_at from public.conversation_messages order by id",
    );

    assert.equal(before.rows.length, 1);
    assert.deepEqual(after.rows, before.rows);

    const source = await readFile(closedCyclePath, "utf8");
    const withoutComments = source.replace(/--.*$/gm, "");

    assert.doesNotMatch(withoutComments, /\b(delete\s+from|truncate|update\s+public\.conversation_messages)\b/i);
  } finally {
    await db.close();
  }
});
