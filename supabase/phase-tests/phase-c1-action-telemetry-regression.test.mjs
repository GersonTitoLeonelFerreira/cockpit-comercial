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

const refinementMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260818150000_refine_companion_action_events.sql",
    import.meta.url,
  ),
);

const ids = {
  companyA: "10000000-0000-4000-8000-000000000001",
  companyB: "10000000-0000-4000-8000-000000000002",
  leadA: "20000000-0000-4000-8000-000000000001",
  leadOtherA: "20000000-0000-4000-8000-000000000002",
  leadB: "20000000-0000-4000-8000-000000000003",
  cycleA: "30000000-0000-4000-8000-000000000001",
  cycleAOld: "30000000-0000-4000-8000-000000000002",
  cycleOtherA: "30000000-0000-4000-8000-000000000003",
  cycleB: "30000000-0000-4000-8000-000000000004",
  userA: "40000000-0000-4000-8000-000000000001",
  managerA: "40000000-0000-4000-8000-000000000002",
  userB: "40000000-0000-4000-8000-000000000003",
  coachingNoteA: "50000000-0000-4000-8000-000000000001",
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
    idempotencyKey,
    coachingNoteId = null,
    conversationKey = null,
    metadata = {},
  },
) {
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
}

async function listEvents(
  db,
  {
    companyId = ids.companyA,
    requestingUserId = ids.managerA,
    isAdminOrManager = true,
    cycleId = null,
    leadId = null,
    actionType = null,
    since = null,
    until = null,
    limit = 100,
  } = {},
) {
  const result = await db.query(
    `
      select *
      from public.rpc_list_companion_action_events(
        $1::uuid,
        $2::uuid,
        $3::boolean,
        $4::uuid,
        $5::uuid,
        $6::text,
        $7::timestamptz,
        $8::timestamptz,
        $9::integer
      )
    `,
    [
      companyId,
      requestingUserId,
      isAdminOrManager,
      cycleId,
      leadId,
      actionType,
      since,
      until,
      limit,
    ],
  );

  return result.rows;
}

test(
  "Fase C1 fecha regressões de correlação, metadata e consulta por lead",
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
      await db.exec(await readFile(refinementMigrationPath, "utf8"));
      await db.exec("set search_path = public, extensions, pg_catalog");

      await db.exec(`
        insert into auth.users (id, email)
        values
          ('${ids.userA}', 'user-a@example.test'),
          ('${ids.managerA}', 'manager-a@example.test'),
          ('${ids.userB}', 'user-b@example.test');

        insert into public.profiles (id, full_name, email, is_active_global)
        values
          ('${ids.userA}', 'Usuário A', 'user-a@example.test', true),
          ('${ids.managerA}', 'Gerente A', 'manager-a@example.test', true),
          ('${ids.userB}', 'Usuário B', 'user-b@example.test', true);

        insert into public.companies (id, name, legal_name, trade_name)
        values
          ('${ids.companyA}', 'Empresa A', 'Empresa A LTDA', 'Empresa A'),
          ('${ids.companyB}', 'Empresa B', 'Empresa B LTDA', 'Empresa B');

        insert into public.company_memberships (company_id, user_id, role, is_active)
        values
          ('${ids.companyA}', '${ids.userA}', 'member', true),
          ('${ids.companyA}', '${ids.managerA}', 'manager', true),
          ('${ids.companyB}', '${ids.userB}', 'admin', true);

        insert into public.leads (id, company_id, name, created_by)
        values
          ('${ids.leadA}', '${ids.companyA}', 'Lead A', '${ids.userA}'),
          ('${ids.leadOtherA}', '${ids.companyA}', 'Lead Outro A', '${ids.userA}'),
          ('${ids.leadB}', '${ids.companyB}', 'Lead B', '${ids.userB}');

        insert into public.sales_cycles (id, company_id, lead_id, owner_user_id)
        values
          ('${ids.cycleA}', '${ids.companyA}', '${ids.leadA}', '${ids.userA}'),
          ('${ids.cycleOtherA}', '${ids.companyA}', '${ids.leadOtherA}', '${ids.userA}'),
          ('${ids.cycleB}', '${ids.companyB}', '${ids.leadB}', '${ids.userB}');

        insert into public.sales_cycles (
          id,
          company_id,
          lead_id,
          owner_user_id,
          status,
          won_at,
          closed_at,
          won_owner_user_id
        )
        values (
          '${ids.cycleAOld}',
          '${ids.companyA}',
          '${ids.leadA}',
          '${ids.userA}',
          'ganho',
          now(),
          now(),
          '${ids.userA}'
        );

        insert into public.ai_coaching_notes (
          id, company_id, cycle_id, created_by, coaching
        )
        values (
          '${ids.coachingNoteA}',
          '${ids.companyA}',
          '${ids.cycleA}',
          '${ids.userA}',
          '{"summary": "sugestão de teste"}'::jsonb
        );
      `);

      await db.exec("set role service_role");

      const first = await recordEvent(db, {
        idempotencyKey: "evt-correlation-001",
        conversationKey: "conversation-a",
      });

      const retry = await recordEvent(db, {
        idempotencyKey: "evt-correlation-001",
        conversationKey: "conversation-a",
      });

      assert.equal(retry.event_id, first.event_id);
      assert.equal(retry.already_registered, true);

      await assert.rejects(
        recordEvent(db, {
          idempotencyKey: "evt-correlation-001",
          coachingNoteId: ids.coachingNoteA,
          conversationKey: "conversation-a",
        }),
        /idempotency_key já foi usada para um evento diferente/i,
      );

      await assert.rejects(
        recordEvent(db, {
          idempotencyKey: "evt-correlation-001",
          conversationKey: "conversation-b",
        }),
        /idempotency_key já foi usada para um evento diferente/i,
      );

      await assert.rejects(
        recordEvent(db, {
          idempotencyKey: "evt-nested-content-001",
          metadata: {
            debug: {
              nested: [{ messages: ["conteúdo não permitido"] }],
            },
          },
        }),
        /metadata não pode armazenar conteúdo da conversa/i,
      );

      await recordEvent(db, {
        cycleId: ids.cycleA,
        actionType: "suggestion_sent",
        idempotencyKey: "evt-lead-active-001",
      });

      await recordEvent(db, {
        cycleId: ids.cycleAOld,
        actionType: "crm_accepted",
        idempotencyKey: "evt-lead-old-001",
      });

      await recordEvent(db, {
        cycleId: ids.cycleOtherA,
        actionType: "agenda_accepted",
        idempotencyKey: "evt-other-lead-001",
      });

      const leadHistory = await listEvents(db, {
        leadId: ids.leadA,
      });

      const leadCycleIds = new Set(leadHistory.map((row) => row.cycle_id));

      assert.ok(leadCycleIds.has(ids.cycleA));
      assert.ok(leadCycleIds.has(ids.cycleAOld));
      assert.ok(!leadCycleIds.has(ids.cycleOtherA));

      const crossCompanyLeadQuery = await listEvents(db, {
        companyId: ids.companyB,
        requestingUserId: ids.userB,
        leadId: ids.leadA,
      });

      assert.deepEqual(crossCompanyLeadQuery, []);

      const functionSignatures = await db.query(`
        select
          pg_get_function_identity_arguments(procedure.oid) as args
        from pg_proc procedure
        join pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = 'rpc_list_companion_action_events'
      `);

      assert.equal(functionSignatures.rows.length, 1);
      assert.match(functionSignatures.rows[0].args, /p_lead_id uuid/);

      await db.exec("reset role");
      await db.exec("set role authenticated");

      await assert.rejects(
        db.query(
          `
            select *
            from public.rpc_list_companion_action_events(
              $1::uuid,
              $2::uuid,
              false,
              null,
              null,
              null,
              null,
              null,
              100
            )
          `,
          [ids.companyA, ids.userA],
        ),
        /permission denied/i,
      );
    } finally {
      await db.exec("reset role").catch(() => undefined);
      await db.close();
    }
  },
);
