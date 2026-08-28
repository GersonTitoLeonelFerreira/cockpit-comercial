// Fase 12A, Frente 2B — Blocker 3.
//
// Valida a tabela companion_method_stage_state (migration
// 20260829020000_create_companion_method_stage_state.sql) diretamente
// contra Postgres real via PGlite: FK obrigatória, CHECK constraints,
// unicidade por escopo e comportamento de upsert.

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
  migrationPath("20260731000105_create_company_commercial_config.sql"),
  migrationPath("20260829020000_create_companion_method_stage_state.sql"),
];

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  lead: "20000000-0000-4000-8000-000000000001",
  leadOther: "20000000-0000-4000-8000-000000000002",
  cycle: "30000000-0000-4000-8000-000000000001",
  cycleOther: "30000000-0000-4000-8000-000000000002",
  user: "40000000-0000-4000-8000-000000000001",
  configVersion: null,
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
    values ('${ids.user}', 'stage-state-user@example.test');

    insert into public.profiles (id, full_name, email, is_active_global)
    values ('${ids.user}', 'Usuário Stage State', 'stage-state-user@example.test', true);

    insert into public.companies (id, name, legal_name, trade_name)
    values ('${ids.company}', 'Empresa Stage State', 'Empresa Stage State LTDA', 'Empresa Stage State');

    insert into public.company_memberships (company_id, user_id, role, is_active)
    values ('${ids.company}', '${ids.user}', 'member', true);

    insert into public.leads (id, company_id, name, created_by)
    values ('${ids.lead}', '${ids.company}', 'Lead Stage State', '${ids.user}');

    insert into public.leads (id, company_id, name, created_by)
    values ('${ids.leadOther}', '${ids.company}', 'Lead Stage State Other', '${ids.user}');

    insert into public.sales_cycles (id, company_id, lead_id, owner_user_id)
    values ('${ids.cycle}', '${ids.company}', '${ids.lead}', '${ids.user}');

    insert into public.sales_cycles (id, company_id, lead_id, owner_user_id)
    values ('${ids.cycleOther}', '${ids.company}', '${ids.leadOther}', '${ids.user}');
  `);

  const configVersionResult = await db.query(`
    insert into public.company_commercial_config_versions (
      company_id, version_number, created_by
    )
    values ('${ids.company}', 1, '${ids.user}')
    returning id
  `);

  ids.configVersion = configVersionResult.rows[0].id;

  return db;
}

async function insertStage(db, overrides = {}) {
  const row = {
    company_id: ids.company,
    cycle_id: ids.cycle,
    conversation_key: "conv-1",
    method_config_version_id: ids.configVersion,
    stage_key: "formalizacao",
    stage_name: "Formalização",
    stage_display_order: 5,
    stage_reason: "Decisão já confirmada.",
    ...overrides,
  };

  return db.query(
    `
      insert into public.companion_method_stage_state (
        company_id, cycle_id, conversation_key, method_config_version_id,
        stage_key, stage_name, stage_display_order, stage_reason
      )
      values ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::text, $6::text, $7::integer, $8::text)
      returning id
    `,
    [
      row.company_id,
      row.cycle_id,
      row.conversation_key,
      row.method_config_version_id,
      row.stage_key,
      row.stage_name,
      row.stage_display_order,
      row.stage_reason,
    ],
  );
}

test("insere um estágio válido com sucesso", async () => {
  const db = await setupDatabase();

  try {
    const result = await insertStage(db);
    assert.equal(result.rows.length, 1);
  } finally {
    await db.close();
  }
});

test("FK obrigatória: cycle_id inexistente é rejeitado", async () => {
  const db = await setupDatabase();

  try {
    await assert.rejects(
      insertStage(db, {
        cycle_id: "30000000-0000-4000-8000-0000000000ff",
      }),
    );
  } finally {
    await db.close();
  }
});

test("FK obrigatória: method_config_version_id inexistente é rejeitado", async () => {
  const db = await setupDatabase();

  try {
    await assert.rejects(
      insertStage(db, {
        method_config_version_id:
          "50000000-0000-4000-8000-0000000000ff",
      }),
    );
  } finally {
    await db.close();
  }
});

test("CHECK constraint rejeita stage_display_order negativo", async () => {
  const db = await setupDatabase();

  try {
    await assert.rejects(
      insertStage(db, { stage_display_order: -1 }),
      /companion_method_stage_state_display_order_check/,
    );
  } finally {
    await db.close();
  }
});

test("unicidade por escopo: segunda inserção para o mesmo (company, cycle, conversation_key) é rejeitada sem upsert", async () => {
  const db = await setupDatabase();

  try {
    await insertStage(db);
    await assert.rejects(
      insertStage(db, { stage_key: "descoberta", stage_name: "Descoberta", stage_display_order: 1 }),
      /companion_method_stage_state_scope_uidx/,
    );
  } finally {
    await db.close();
  }
});

test("upsert por (company_id, cycle_id, conversation_key) atualiza o estágio em vez de duplicar", async () => {
  const db = await setupDatabase();

  try {
    await insertStage(db);

    await db.query(
      `
        insert into public.companion_method_stage_state (
          company_id, cycle_id, conversation_key, method_config_version_id,
          stage_key, stage_name, stage_display_order, stage_reason
        )
        values ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::text, $6::text, $7::integer, $8::text)
        on conflict (company_id, cycle_id, conversation_key)
        do update set
          stage_key = excluded.stage_key,
          stage_name = excluded.stage_name,
          stage_display_order = excluded.stage_display_order,
          stage_reason = excluded.stage_reason,
          updated_at = now()
      `,
      [
        ids.company,
        ids.cycle,
        "conv-1",
        ids.configVersion,
        "descoberta",
        "Descoberta",
        1,
        "Regressão legítima confirmada.",
      ],
    );

    const rows = await db.query(
      `
        select stage_key, stage_display_order
        from public.companion_method_stage_state
        where company_id = $1::uuid and cycle_id = $2::uuid and conversation_key = $3::text
      `,
      [ids.company, ids.cycle, "conv-1"],
    );

    assert.equal(rows.rows.length, 1, "upsert não deveria criar uma segunda linha");
    assert.equal(rows.rows[0].stage_key, "descoberta");
    assert.equal(rows.rows[0].stage_display_order, 1);
  } finally {
    await db.close();
  }
});

test("diferentes conversation_key no mesmo ciclo podem ter estágios independentes", async () => {
  const db = await setupDatabase();

  try {
    await insertStage(db, { conversation_key: "conv-a", stage_key: "descoberta", stage_name: "Descoberta", stage_display_order: 1 });
    await insertStage(db, { conversation_key: "conv-b", stage_key: "formalizacao", stage_name: "Formalização", stage_display_order: 5 });

    const rows = await db.query(
      `
        select conversation_key, stage_key
        from public.companion_method_stage_state
        where company_id = $1::uuid and cycle_id = $2::uuid
        order by conversation_key
      `,
      [ids.company, ids.cycle],
    );

    assert.equal(rows.rows.length, 2);
    assert.equal(rows.rows[0].stage_key, "descoberta");
    assert.equal(rows.rows[1].stage_key, "formalizacao");
  } finally {
    await db.close();
  }
});

test("apagar o ciclo (cascade) remove o estágio persistido", async () => {
  const db = await setupDatabase();

  try {
    await insertStage(db, { cycle_id: ids.cycleOther });

    await db.exec("reset role");
    await db.query(
      `delete from public.sales_cycles where id = $1::uuid`,
      [ids.cycleOther],
    );

    const rows = await db.query(
      `select 1 from public.companion_method_stage_state where cycle_id = $1::uuid`,
      [ids.cycleOther],
    );

    assert.equal(rows.rows.length, 0);
  } finally {
    await db.close();
  }
});
