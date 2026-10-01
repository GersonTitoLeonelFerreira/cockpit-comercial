import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

// Rodada 5 (Parte B) — "Nova oportunidade" pelo Companion. Prova contra um
// Postgres efêmero (PGlite; nunca o projeto Supabase real, a migration NÃO
// é aplicada em lugar nenhum por este teste) que
// rpc_create_successor_cycle_from_companion:
//   - só é executável por service_role, e a função da Yolen perde anon;
//   - refaz as regras da Yolen (Ganho/Perdido, lead ativo, carteira,
//     uma oportunidade aberta por lead, tipo obrigatório);
//   - cria o ciclo em Novo na carteira do ator, com origem e tipo, sem
//     copiar nada financeiro nem da perda, sem tocar no ciclo fechado;
//   - grava os mesmos eventos de auditoria da Yolen, com created_via.
// Dados sintéticos.

function migrationPath(fileName) {
  return fileURLToPath(new URL(`../migrations/${fileName}`, import.meta.url));
}

const migrationPaths = [
  migrationPath("20260629040658_restore_simulator_metrics_rpc_shell.sql"),
  migrationPath("20261001150000_create_companion_successor_cycle.sql"),
];

const ids = {
  company: "60000000-0000-4000-8000-000000000001",
  otherCompany: "60000000-0000-4000-8000-000000000002",
  me: "61000000-0000-4000-8000-000000000001",
  other: "61000000-0000-4000-8000-000000000002",
  boss: "61000000-0000-4000-8000-000000000003",
  inactive: "61000000-0000-4000-8000-000000000004",
  leadWon: "62000000-0000-4000-8000-000000000001",
  leadLost: "62000000-0000-4000-8000-000000000002",
  leadCanceled: "62000000-0000-4000-8000-000000000003",
  leadDeleted: "62000000-0000-4000-8000-000000000004",
  leadOpen: "62000000-0000-4000-8000-000000000005",
  cycleWon: "63000000-0000-4000-8000-000000000001",
  cycleLost: "63000000-0000-4000-8000-000000000002",
  cycleCanceled: "63000000-0000-4000-8000-000000000003",
  cycleDeleted: "63000000-0000-4000-8000-000000000004",
  cycleOpenWon: "63000000-0000-4000-8000-000000000005",
  cycleOpenNew: "63000000-0000-4000-8000-000000000006",
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
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });

  await db.exec(supabaseBootstrap);

  for (const path of migrationPaths) {
    await db.exec(await readFile(path, "utf8"));
  }

  await db.exec("set search_path = public, extensions, pg_catalog");

  const users = [
    [ids.me, true],
    [ids.other, true],
    [ids.boss, true],
    [ids.inactive, false],
  ];

  for (const [id, active] of users) {
    await db.exec(`
      insert into auth.users (id, email) values ('${id}', '${id}@example.test');
      insert into public.profiles (id, full_name, email, is_active_global)
      values ('${id}', 'Pessoa ${id.slice(-1)}', '${id}@example.test', ${active});
    `);
  }

  await db.exec(`
    insert into public.companies (id, name, legal_name, trade_name)
    values
      ('${ids.company}', 'Empresa R5', 'Empresa R5 LTDA', 'Empresa R5'),
      ('${ids.otherCompany}', 'Outra R5', 'Outra R5 LTDA', 'Outra R5');

    insert into public.company_memberships (company_id, user_id, role, is_active)
    values
      ('${ids.company}', '${ids.me}', 'member', true),
      ('${ids.company}', '${ids.other}', 'member', true),
      ('${ids.company}', '${ids.boss}', 'admin', true),
      ('${ids.company}', '${ids.inactive}', 'member', true);

    insert into public.leads (id, company_id, name, created_by, deleted_at)
    values
      ('${ids.leadWon}', '${ids.company}', 'Lead Ganho', '${ids.me}', null),
      ('${ids.leadLost}', '${ids.company}', 'Lead Perdido', '${ids.other}', null),
      ('${ids.leadCanceled}', '${ids.company}', 'Lead Cancelado', '${ids.me}', null),
      ('${ids.leadDeleted}', '${ids.company}', 'Lead Excluído', '${ids.me}', now()),
      ('${ids.leadOpen}', '${ids.company}', 'Lead Aberto', '${ids.me}', null);

    insert into public.sales_cycles (
      id, company_id, lead_id, owner_user_id, status, created_at,
      closed_at, won_owner_user_id, won_at, won_total, payment_method,
      lost_at, lost_owner_user_id, lost_reason, canceled_at, canceled_reason
    )
    values
      ('${ids.cycleWon}', '${ids.company}', '${ids.leadWon}', '${ids.me}', 'ganho', now() - interval '30 days',
        now() - interval '1 day', '${ids.me}', now() - interval '1 day', 1250, 'pix',
        null, null, null, null, null),
      ('${ids.cycleLost}', '${ids.company}', '${ids.leadLost}', '${ids.other}', 'perdido', now() - interval '30 days',
        now() - interval '2 days', null, null, null, null,
        now() - interval '2 days', '${ids.other}', 'Preço', null, null),
      ('${ids.cycleCanceled}', '${ids.company}', '${ids.leadCanceled}', '${ids.me}', 'cancelado', now() - interval '30 days',
        null, null, null, null, null,
        null, null, null, now() - interval '3 days', 'Desistiu'),
      ('${ids.cycleDeleted}', '${ids.company}', '${ids.leadDeleted}', '${ids.me}', 'ganho', now() - interval '30 days',
        now() - interval '1 day', '${ids.me}', now() - interval '1 day', 90, null,
        null, null, null, null, null),
      ('${ids.cycleOpenWon}', '${ids.company}', '${ids.leadOpen}', '${ids.me}', 'ganho', now() - interval '30 days',
        now() - interval '1 day', '${ids.me}', now() - interval '1 day', 90, null,
        null, null, null, null, null),
      ('${ids.cycleOpenNew}', '${ids.company}', '${ids.leadOpen}', '${ids.me}', 'contato', now() - interval '1 day',
        null, null, null, null, null,
        null, null, null, null, null);
  `);

  return db;
}

async function createSuccessor(db, { company = ids.company, actor = ids.me, source, type = "recompra" }) {
  const result = await db.query(
    "select public.rpc_create_successor_cycle_from_companion($1, $2, $3, $4, null) as r",
    [company, actor, source, type],
  );

  return result.rows[0].r;
}

async function cycleRow(db, id) {
  const result = await db.query("select to_jsonb(sc) as row from public.sales_cycles sc where id = $1", [id]);
  return result.rows[0]?.row ?? null;
}

test("grants: só service_role executa a função do Companion; a da Yolen perde anon e mantém authenticated", async () => {
  const db = await buildDb();
  const companion = "public.rpc_create_successor_cycle_from_companion(uuid, uuid, uuid, text, text)";
  const yolen = "public.rpc_create_successor_cycle_for_company(uuid, uuid, text, text, uuid, uuid, text)";

  const result = await db.query(`
    select
      has_function_privilege('anon', '${companion}', 'execute') as companion_anon,
      has_function_privilege('authenticated', '${companion}', 'execute') as companion_authenticated,
      has_function_privilege('service_role', '${companion}', 'execute') as companion_service,
      has_function_privilege('anon', '${yolen}', 'execute') as yolen_anon,
      has_function_privilege('authenticated', '${yolen}', 'execute') as yolen_authenticated
  `);

  assert.deepEqual(result.rows[0], {
    companion_anon: false,
    companion_authenticated: false,
    companion_service: true,
    yolen_anon: false,
    yolen_authenticated: true,
  });
});

test("vendedor cria a partir do próprio Ganho: Novo, na carteira dele, com origem e tipo; nada financeiro; ciclo fechado intacto; auditoria", async () => {
  const db = await buildDb();
  const before = await cycleRow(db, ids.cycleWon);

  const result = await createSuccessor(db, { source: ids.cycleWon, type: "recompra" });

  assert.equal(result.success, true);
  assert.equal(result.owner_user_id, ids.me);
  assert.equal(result.opportunity_type, "recompra");

  const created = await cycleRow(db, result.cycle_id);

  assert.equal(created.status, "novo");
  assert.equal(created.owner_user_id, ids.me);
  assert.equal(created.lead_id, ids.leadWon);
  assert.equal(created.origin_cycle_id, ids.cycleWon);
  assert.equal(created.opportunity_type, "recompra");
  for (const field of [
    "won_total", "won_at", "won_owner_user_id", "payment_method", "payment_type",
    "entry_amount", "installments_count", "lost_reason", "lost_at", "lost_owner_user_id",
    "closed_at", "canceled_at", "product_id", "current_group_id",
  ]) {
    assert.equal(created[field], null, field);
  }

  assert.deepEqual(await cycleRow(db, ids.cycleWon), before);

  const events = await db.query(
    "select cycle_id, event_type, metadata, created_by from public.cycle_events order by event_type",
  );

  assert.equal(events.rows.length, 2);
  const createdEvent = events.rows.find((row) => row.event_type === "cycle_created");
  const successorEvent = events.rows.find((row) => row.event_type === "successor_cycle_created");

  assert.equal(createdEvent.cycle_id, result.cycle_id);
  assert.equal(createdEvent.created_by, ids.me);
  assert.equal(createdEvent.metadata.source, "successor_cycle");
  assert.equal(createdEvent.metadata.entry_mode, "successor_cycle");
  assert.equal(createdEvent.metadata.created_via, "companion");
  assert.equal(createdEvent.metadata.origin_cycle_id, ids.cycleWon);
  assert.equal(createdEvent.metadata.origin_status, "ganho");
  assert.equal(createdEvent.metadata.assignment_mode, "same_seller");

  assert.equal(successorEvent.cycle_id, ids.cycleWon);
  assert.equal(successorEvent.created_by, ids.me);
  assert.equal(successorEvent.metadata.successor_cycle_id, result.cycle_id);
  assert.equal(successorEvent.metadata.created_via, "companion");
});

test("uma oportunidade aberta por lead: a segunda criação é recusada (active_cycle_exists) e nada é duplicado", async () => {
  const db = await buildDb();

  assert.equal((await createSuccessor(db, { source: ids.cycleWon })).success, true);

  const second = await createSuccessor(db, { source: ids.cycleWon, type: "upgrade" });

  assert.equal(second.success, false);
  assert.equal(second.error, "active_cycle_exists");

  const count = await db.query("select count(*)::int as n from public.sales_cycles where lead_id = $1", [ids.leadWon]);
  assert.equal(count.rows[0].n, 2);

  const open = await createSuccessor(db, { source: ids.cycleOpenWon });
  assert.equal(open.error, "active_cycle_exists");
});

test("vendedor não cria a partir de ciclo que nunca foi dele; admin cria, sempre para si", async () => {
  const db = await buildDb();

  const denied = await createSuccessor(db, { source: ids.cycleLost, actor: ids.me });
  assert.deepEqual(denied, { success: false, error: "permission_denied" });

  const asBoss = await createSuccessor(db, { source: ids.cycleLost, actor: ids.boss, type: "reativacao" });
  assert.equal(asBoss.success, true);
  assert.equal((await cycleRow(db, asBoss.cycle_id)).owner_user_id, ids.boss);

  const ownLost = await buildDb();
  const asOwner = await createSuccessor(ownLost, { source: ids.cycleLost, actor: ids.other });
  assert.equal(asOwner.success, true);
});

test("Cancelado, lead excluído, tipo inválido, sem ator, usuário inativo e outra empresa: nada é criado", async () => {
  const db = await buildDb();

  assert.equal((await createSuccessor(db, { source: ids.cycleCanceled })).error, "source_cycle_not_terminal");
  assert.equal((await createSuccessor(db, { source: ids.cycleDeleted })).error, "lead_not_available");
  assert.equal((await createSuccessor(db, { source: ids.cycleWon, type: "pool" })).error, "invalid_opportunity_type");
  assert.equal((await createSuccessor(db, { source: ids.cycleWon, actor: null })).error, "not_authenticated");
  assert.equal((await createSuccessor(db, { source: ids.cycleWon, actor: ids.inactive })).error, "membership_not_found");
  assert.equal((await createSuccessor(db, { source: ids.cycleWon, company: ids.otherCompany })).error, "membership_not_found");

  const count = await db.query("select count(*)::int as n from public.sales_cycles");
  assert.equal(count.rows[0].n, 6);
  const events = await db.query("select count(*)::int as n from public.cycle_events");
  assert.equal(events.rows[0].n, 0);
});
