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

const actionEventsMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260818140000_create_companion_action_events.sql",
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
  managerA: "40000000-0000-4000-8000-000000000002",
  otherSellerA: "40000000-0000-4000-8000-000000000003",
  userB: "40000000-0000-4000-8000-000000000004",

  coachingNoteA: "50000000-0000-4000-8000-000000000001",
  coachingNoteB: "50000000-0000-4000-8000-000000000002",
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

async function recordEvent(
  db,
  {
    companyId = ids.companyA,
    cycleId = ids.cycleA,
    sellerUserId = ids.userA,
    actionType = "suggestion_shown",
    idempotencyKey = "evt-001",
    coachingNoteId = null,
    conversationKey = null,
    metadata = {},
    role = "service_role",
  } = {},
) {
  await db.exec("reset role");
  await db.exec(`set role ${role}`);

  try {
    const result = await db.query(
      `
        select *
        from public.rpc_record_companion_action_event(
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::text,
          $5::text,
          $6::uuid,
          $7::text,
          $8::jsonb
        )
      `,
      [
        companyId,
        cycleId,
        sellerUserId,
        actionType,
        idempotencyKey,
        coachingNoteId,
        conversationKey,
        JSON.stringify(metadata),
      ],
    );

    return result.rows[0];
  } finally {
    await db.exec("reset role");
  }
}

async function listEvents(
  db,
  {
    companyId = ids.companyA,
    requestingUserId = ids.userA,
    isAdminOrManager = false,
    cycleId = null,
    actionType = null,
    since = null,
    until = null,
    limit = 100,
    role = "service_role",
  } = {},
) {
  await db.exec("reset role");
  await db.exec(`set role ${role}`);

  try {
    const result = await db.query(
      `
        select *
        from public.rpc_list_companion_action_events(
          $1::uuid,
          $2::uuid,
          $3::boolean,
          $4::uuid,
          $5::text,
          $6::timestamptz,
          $7::timestamptz,
          $8::integer
        )
      `,
      [
        companyId,
        requestingUserId,
        isAdminOrManager,
        cycleId,
        actionType,
        since,
        until,
        limit,
      ],
    );

    return result.rows;
  } finally {
    await db.exec("reset role");
  }
}

test(
  "Fase C1 registra e consulta telemetria de ações do Companion de forma segura e idempotente",
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
      await db.exec(await readFile(actionEventsMigrationPath, "utf8"));
      await db.exec("set search_path = public, extensions, pg_catalog");

      // ---------------------------------------------------------------
      // Postura de segurança: RLS deny-all + escrita só via RPC definer
      // ---------------------------------------------------------------
      const tableSecurity = await db.query(`
        select
          relation.relrowsecurity as rls_enabled,
          relation.relforcerowsecurity as rls_forced
        from pg_class relation
        join pg_namespace namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'companion_action_events'
      `);

      assert.deepEqual(tableSecurity.rows, [
        { rls_enabled: true, rls_forced: true },
      ]);

      const tableGrants = await db.query(`
        select
          role.rolname as grantee,
          privilege.privilege_type
        from pg_class relation
        join pg_namespace namespace
          on namespace.oid = relation.relnamespace
        cross join lateral aclexplode(relation.relacl) privilege
        join pg_roles role
          on role.oid = privilege.grantee
        where namespace.nspname = 'public'
          and relation.relname = 'companion_action_events'
          and role.rolname in ('anon', 'authenticated', 'service_role')
        order by role.rolname, privilege.privilege_type
      `);

      assert.deepEqual(tableGrants.rows, [
        { grantee: "service_role", privilege_type: "SELECT" },
      ]);

      const recordFunctionGrants = await db.query(`
        select
          role.rolname as grantee,
          privilege.privilege_type
        from pg_proc procedure
        cross join lateral aclexplode(procedure.proacl) privilege
        join pg_roles role
          on role.oid = privilege.grantee
        where procedure.oid =
          'public.rpc_record_companion_action_event(
            uuid, uuid, uuid, text, text, uuid, text, jsonb
          )'::regprocedure
          and role.rolname in ('anon', 'authenticated', 'service_role')
        order by role.rolname, privilege.privilege_type
      `);

      assert.deepEqual(recordFunctionGrants.rows, [
        { grantee: "service_role", privilege_type: "EXECUTE" },
      ]);

      // ---------------------------------------------------------------
      // Fixtures
      // ---------------------------------------------------------------
      await db.exec(`
        insert into auth.users (id, email)
        values
          ('${ids.userA}', 'user-a@example.test'),
          ('${ids.managerA}', 'manager-a@example.test'),
          ('${ids.otherSellerA}', 'other-seller-a@example.test'),
          ('${ids.userB}', 'user-b@example.test');

        insert into public.profiles (id, full_name, email, is_active_global)
        values
          ('${ids.userA}', 'Usuário A', 'user-a@example.test', true),
          ('${ids.managerA}', 'Gerente A', 'manager-a@example.test', true),
          ('${ids.otherSellerA}', 'Outro Vendedor A', 'other-seller-a@example.test', true),
          ('${ids.userB}', 'Usuário B', 'user-b@example.test', true);

        insert into public.companies (id, name, legal_name, trade_name)
        values
          ('${ids.companyA}', 'Empresa A', 'Empresa A LTDA', 'Empresa A'),
          ('${ids.companyB}', 'Empresa B', 'Empresa B LTDA', 'Empresa B');

        insert into public.company_memberships (company_id, user_id, role, is_active)
        values
          ('${ids.companyA}', '${ids.userA}', 'member', true),
          ('${ids.companyA}', '${ids.managerA}', 'manager', true),
          ('${ids.companyA}', '${ids.otherSellerA}', 'member', true),
          ('${ids.companyB}', '${ids.userB}', 'admin', true);

        insert into public.leads (id, company_id, name, created_by)
        values
          ('${ids.leadA}', '${ids.companyA}', 'Lead A', '${ids.userA}'),
          ('${ids.leadB}', '${ids.companyB}', 'Lead B', '${ids.userB}');

        insert into public.sales_cycles (id, company_id, lead_id, owner_user_id)
        values
          ('${ids.cycleA}', '${ids.companyA}', '${ids.leadA}', '${ids.userA}'),
          ('${ids.cycleB}', '${ids.companyB}', '${ids.leadB}', '${ids.userB}');

        insert into public.ai_coaching_notes (
          id, company_id, cycle_id, created_by, coaching
        )
        values
          (
            '${ids.coachingNoteA}',
            '${ids.companyA}',
            '${ids.cycleA}',
            '${ids.userA}',
            '{"summary": "sugestão de teste"}'::jsonb
          ),
          (
            '${ids.coachingNoteB}',
            '${ids.companyB}',
            '${ids.cycleB}',
            '${ids.userB}',
            '{"summary": "sugestão de outra empresa"}'::jsonb
          );
      `);

      // ---------------------------------------------------------------
      // Caso 1: evento válido
      // ---------------------------------------------------------------
      const validEvent = await recordEvent(db, {
        actionType: "suggestion_shown",
        idempotencyKey: "evt-shown-001",
        coachingNoteId: ids.coachingNoteA,
        conversationKey: "Cliente Exemplo::5511999990001",
        metadata: { channel: "whatsapp" },
      });

      assert.ok(validEvent.event_id);
      assert.equal(validEvent.already_registered, false);

      const storedRow = await db.query(`
        select company_id, cycle_id, seller_user_id, action_type, coaching_note_id
        from public.companion_action_events
        where id = '${validEvent.event_id}'
      `);

      assert.deepEqual(storedRow.rows[0], {
        company_id: ids.companyA,
        cycle_id: ids.cycleA,
        seller_user_id: ids.userA,
        action_type: "suggestion_shown",
        coaching_note_id: ids.coachingNoteA,
      });

      // ---------------------------------------------------------------
      // Caso 2: evento inválido (action_type fora da lista)
      // ---------------------------------------------------------------
      await assert.rejects(
        recordEvent(db, {
          actionType: "suggestion_deleted",
          idempotencyKey: "evt-invalid-001",
        }),
        /action_type inválido/i,
      );

      // ---------------------------------------------------------------
      // Caso: metadata inválida (não é objeto) e metadata com conteúdo de conversa
      // ---------------------------------------------------------------
      await assert.rejects(
        db.query(
          `
            select *
            from public.rpc_record_companion_action_event(
              $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
              null, null, $6::jsonb
            )
          `,
          [
            ids.companyA,
            ids.cycleA,
            ids.userA,
            "suggestion_shown",
            "evt-bad-metadata-001",
            JSON.stringify(["not", "an", "object"]),
          ],
        ),
        /metadata precisa ser um objeto json/i,
      );

      await assert.rejects(
        recordEvent(db, {
          idempotencyKey: "evt-conversation-content-001",
          metadata: { messages: ["não pode"] },
        }),
        /não pode armazenar conteúdo da conversa/i,
      );

      // ---------------------------------------------------------------
      // Caso: usuário não autenticado (papel sem EXECUTE na função)
      // ---------------------------------------------------------------
      await assert.rejects(
        recordEvent(db, {
          role: "authenticated",
          idempotencyKey: "evt-unauth-001",
        }),
        /permission denied/i,
      );

      // ---------------------------------------------------------------
      // Caso: empresa errada (cycle_id não pertence à empresa informada)
      // ---------------------------------------------------------------
      await assert.rejects(
        recordEvent(db, {
          companyId: ids.companyA,
          cycleId: ids.cycleB,
          idempotencyKey: "evt-wrong-company-001",
        }),
        /ciclo comercial não encontrado/i,
      );

      // ---------------------------------------------------------------
      // Caso: cycle de outra empresa (mesma checagem, ids trocados)
      // ---------------------------------------------------------------
      await assert.rejects(
        recordEvent(db, {
          companyId: ids.companyB,
          cycleId: ids.cycleA,
          sellerUserId: ids.userB,
          idempotencyKey: "evt-cross-cycle-001",
        }),
        /ciclo comercial não encontrado/i,
      );

      // ---------------------------------------------------------------
      // Caso: lead/coaching_note de outra empresa
      // ---------------------------------------------------------------
      await assert.rejects(
        recordEvent(db, {
          idempotencyKey: "evt-cross-coaching-001",
          coachingNoteId: ids.coachingNoteB,
        }),
        /coaching_note_id não pertence a esta empresa ou ciclo/i,
      );

      // ---------------------------------------------------------------
      // Caso: duplicidade / retry idempotente
      // ---------------------------------------------------------------
      const countBeforeRetry = await db.query(`
        select count(*)::integer as total from public.companion_action_events
      `);

      const retryEvent = await recordEvent(db, {
        actionType: "suggestion_shown",
        idempotencyKey: "evt-shown-001",
        coachingNoteId: ids.coachingNoteA,
        conversationKey: "Cliente Exemplo::5511999990001",
        metadata: { channel: "whatsapp" },
      });

      assert.equal(retryEvent.event_id, validEvent.event_id);
      assert.equal(
        new Date(retryEvent.occurred_at).getTime(),
        new Date(validEvent.occurred_at).getTime(),
      );
      assert.equal(retryEvent.already_registered, true);

      const countAfterRetry = await db.query(`
        select count(*)::integer as total from public.companion_action_events
      `);

      assert.equal(
        countAfterRetry.rows[0].total,
        countBeforeRetry.rows[0].total,
        "Retry idempotente não pode criar uma segunda linha.",
      );

      // ---------------------------------------------------------------
      // Caso: mesma idempotency_key reaproveitada para um evento diferente
      // ---------------------------------------------------------------
      await assert.rejects(
        recordEvent(db, {
          actionType: "suggestion_ignored",
          idempotencyKey: "evt-shown-001",
        }),
        /idempotency_key já foi usada para um evento diferente/i,
      );

      // ---------------------------------------------------------------
      // Isolamento multiempresa: eventos de A e B não se misturam
      // ---------------------------------------------------------------
      const eventB = await recordEvent(db, {
        companyId: ids.companyB,
        cycleId: ids.cycleB,
        sellerUserId: ids.userB,
        actionType: "crm_accepted",
        idempotencyKey: "evt-shown-001",
        coachingNoteId: ids.coachingNoteB,
      });

      assert.equal(eventB.already_registered, false);

      const isolationCheck = await db.query(`
        select company_id, action_type
        from public.companion_action_events
        where idempotency_key = 'evt-shown-001'
        order by company_id
      `);

      assert.deepEqual(isolationCheck.rows, [
        { company_id: ids.companyA, action_type: "suggestion_shown" },
        { company_id: ids.companyB, action_type: "crm_accepted" },
      ]);

      // ---------------------------------------------------------------
      // Consulta: vendedor comum só vê os próprios eventos
      // ---------------------------------------------------------------
      await recordEvent(db, {
        sellerUserId: ids.otherSellerA,
        actionType: "suggestion_ignored",
        idempotencyKey: "evt-other-seller-001",
      });

      const ownEventsOnly = await listEvents(db, {
        companyId: ids.companyA,
        requestingUserId: ids.userA,
        isAdminOrManager: false,
      });

      assert.ok(ownEventsOnly.length >= 1);
      assert.ok(
        ownEventsOnly.every((row) => row.seller_user_id === ids.userA),
      );

      // ---------------------------------------------------------------
      // Consulta: admin/manager vê todos os eventos da empresa
      // ---------------------------------------------------------------
      const managerView = await listEvents(db, {
        companyId: ids.companyA,
        requestingUserId: ids.managerA,
        isAdminOrManager: true,
      });

      assert.ok(
        managerView.some((row) => row.seller_user_id === ids.userA),
      );
      assert.ok(
        managerView.some((row) => row.seller_user_id === ids.otherSellerA),
      );

      // ---------------------------------------------------------------
      // Consulta: filtro por company isola B de A mesmo para admin
      // ---------------------------------------------------------------
      const companyAView = await listEvents(db, {
        companyId: ids.companyA,
        requestingUserId: ids.managerA,
        isAdminOrManager: true,
      });

      assert.ok(
        companyAView.every((row) => row.action_type !== "crm_accepted"),
        "Consulta da empresa A não pode retornar eventos da empresa B.",
      );

      // ---------------------------------------------------------------
      // Consulta: action_type inválido é rejeitado
      // ---------------------------------------------------------------
      await assert.rejects(
        listEvents(db, {
          companyId: ids.companyA,
          requestingUserId: ids.managerA,
          isAdminOrManager: true,
          actionType: "not_a_real_action",
        }),
        /action_type inválido/i,
      );

      // ---------------------------------------------------------------
      // Consulta: papel sem EXECUTE não acessa a RPC de leitura
      // ---------------------------------------------------------------
      await assert.rejects(
        listEvents(db, {
          companyId: ids.companyA,
          requestingUserId: ids.userA,
          isAdminOrManager: false,
          role: "authenticated",
        }),
        /permission denied/i,
      );
    } finally {
      await db.close();
    }
  },
);
