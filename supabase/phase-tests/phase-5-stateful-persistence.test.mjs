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

const migrationPath = fileURLToPath(
  new URL(
    "../migrations/20260806193000_create_stateful_copilot_storage.sql",
    import.meta.url,
  ),
);

const correctiveMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260806214500_align_stateful_contract_versions.sql",
    import.meta.url,
  ),
);

const sellerAttributionMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260820200000_add_stateful_seller_attribution.sql",
    import.meta.url,
  ),
);

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

const companyId =
  "10000000-0000-4000-8000-000000000001";

const leadId =
  "20000000-0000-4000-8000-000000000001";

const cycleId =
  "30000000-0000-4000-8000-000000000001";

const userId =
  "40000000-0000-4000-8000-000000000001";

const conversationKey =
  "whatsapp:+5547999990001";

function jsonLiteral(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function buildState({
  version,
  updatedAt,
}) {
  return {
    contract_version:
      "phase-5.1-commercial-state-v1",

    cycle_id:
      cycleId,

    version,

    commercial_role:
      "buyer",

    current_moment: {
      summary:
        "O cliente está avaliando a solução.",

      evidence_message_ids: [
        `m${version}`,
      ],
    },

    current_priority: {
      summary:
        "Conduzir a próxima etapa comercial.",

      evidence_message_ids: [
        `m${version}`,
      ],
    },

    last_analyzed_message_ids: [
      `m${version}`,
    ],

    last_evidence_message_ids: [
      `m${version}`,
    ],

    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at:
      "2026-08-06T18:00:00-03:00",

    updated_at:
      updatedAt,
  };
}

function buildAudit({
  previousVersion,
  candidateVersion,
  generatedAt,
}) {
  return {
    event_type:
      "stateful_copilot_analysis_completed",

    generated_at:
      generatedAt,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    previous_state_version:
      previousVersion,

    candidate_state_version:
      candidateVersion,

    analyzed_message_ids: [
      `m${candidateVersion}`,
    ],

    evidence_message_ids: [
      `m${candidateVersion}`,
    ],

    memory_ids: [],

    normalized_output: {
      contract_version:
        "phase-5.1-stateful-copilot-v2",
    },

    execution: {
      provider:
        "test-provider",

      model:
        "test-model",

      attempts:
        1,
    },

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  };
}

async function callRpc(
  db,
  {
    operationKey,
    expectedVersion,
    expectedUpdatedAt,
    candidateVersion,
    state,
    audit,
  },
) {
  const expectedVersionSql =
    expectedVersion === null
      ? "null"
      : String(expectedVersion);

  const expectedUpdatedAtSql =
    expectedUpdatedAt === null
      ? "null"
      : `'${expectedUpdatedAt}'::timestamp with time zone`;

  await db.exec(
    "set role service_role",
  );

  try {
    return await db.query(`
      select *
      from public.rpc_persist_stateful_copilot_state(
        p_operation_key =>
          '${operationKey}',
        p_company_id =>
          '${companyId}',
        p_cycle_id =>
          '${cycleId}',
        p_conversation_key =>
          '${conversationKey}',
        p_expected_previous_state_version =>
          ${expectedVersionSql},
        p_expected_previous_state_updated_at =>
          ${expectedUpdatedAtSql},
        p_candidate_state_version =>
          ${candidateVersion},
        p_state_snapshot =>
          ${jsonLiteral(state)},
        p_audit_event =>
          ${jsonLiteral(audit)}
      )
    `);
  } finally {
    await db.exec(
      "reset role",
    );
  }
}

test(
  "Fase 5.1 persiste memória comercial com versão, auditoria e idempotência",
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

      await db.exec(
        await readFile(
          baselinePath,
          "utf8",
        ),
      );

      await db.exec(
        await readFile(
          migrationPath,
          "utf8",
        ),
      );

      await db.exec(
        await readFile(
          correctiveMigrationPath,
          "utf8",
        ),
      );

      await db.exec(
        await readFile(
          sellerAttributionMigrationPath,
          "utf8",
        ),
      );

      await db.exec(
        "set search_path = public, extensions, pg_catalog",
      );

      const tables =
        await db.query(`
          select
            c.relname as name,
            c.relrowsecurity as rls_enabled,
            c.relforcerowsecurity as rls_forced
          from pg_class c
          join pg_namespace n
            on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname in (
              'companion_commercial_states',
              'companion_commercial_state_events'
            )
          order by c.relname
        `);

      assert.deepEqual(
        tables.rows,
        [
          {
            name:
              "companion_commercial_state_events",

            rls_enabled:
              true,

            rls_forced:
              true,
          },
          {
            name:
              "companion_commercial_states",

            rls_enabled:
              true,

            rls_forced:
              true,
          },
        ],
      );

      const tableGrants =
        await db.query(`
          select
            c.relname as table_name,
            r.rolname as grantee,
            x.privilege_type
          from pg_class c
          cross join lateral
            aclexplode(c.relacl) x
          join pg_roles r
            on r.oid = x.grantee
          where c.relname in (
              'companion_commercial_states',
              'companion_commercial_state_events'
            )
            and r.rolname in (
              'anon',
              'authenticated',
              'service_role'
            )
          order by
            c.relname,
            r.rolname,
            x.privilege_type
        `);

      assert.deepEqual(
        tableGrants.rows,
        [
          {
            table_name:
              "companion_commercial_state_events",

            grantee:
              "service_role",

            privilege_type:
              "SELECT",
          },
          {
            table_name:
              "companion_commercial_states",

            grantee:
              "service_role",

            privilege_type:
              "SELECT",
          },
        ],
      );

      const functionGrants =
        await db.query(`
          select
            r.rolname as grantee,
            x.privilege_type
          from pg_proc p
          cross join lateral
            aclexplode(p.proacl) x
          join pg_roles r
            on r.oid = x.grantee
          where p.oid =
            'public.rpc_persist_stateful_copilot_state(
              text,
              uuid,
              uuid,
              text,
              integer,
              timestamp with time zone,
              integer,
              jsonb,
              jsonb
            )'::regprocedure
            and r.rolname in (
              'anon',
              'authenticated',
              'service_role'
            )
          order by r.rolname
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

      await db.exec(`
        insert into auth.users (
          id,
          email
        )
        values (
          '${userId}',
          'operator@example.test'
        );

        insert into public.companies (
          id,
          name,
          legal_name,
          trade_name
        )
        values (
          '${companyId}',
          'Empresa A',
          'Empresa A LTDA',
          'Empresa A'
        );

        insert into public.leads (
          id,
          company_id,
          name,
          created_by
        )
        values (
          '${leadId}',
          '${companyId}',
          'Lead A',
          '${userId}'
        );

        insert into public.sales_cycles (
          id,
          company_id,
          lead_id,
          owner_user_id
        )
        values (
          '${cycleId}',
          '${companyId}',
          '${leadId}',
          '${userId}'
        );
      `);

      const state1 =
        buildState({
          version:
            1,

          updatedAt:
            "2026-08-06T18:00:00-03:00",
        });

      const audit1 =
        buildAudit({
          previousVersion:
            null,

          candidateVersion:
            1,

          generatedAt:
            "2026-08-06T18:00:01-03:00",
        });

      const firstPersist =
        await callRpc(
          db,
          {
            operationKey:
              "stateful-copilot:company-1:cycle-1:v1",

            expectedVersion:
              null,

            expectedUpdatedAt:
              null,

            candidateVersion:
              1,

            state:
              state1,

            audit:
              audit1,
          },
        );

      assert.equal(
        firstPersist.rows[0].status,
        "persisted",
      );

      assert.equal(
        firstPersist
          .rows[0]
          .persisted_state_version,
        1,
      );

      const repeatedPersist =
        await callRpc(
          db,
          {
            operationKey:
              "stateful-copilot:company-1:cycle-1:v1",

            expectedVersion:
              null,

            expectedUpdatedAt:
              null,

            candidateVersion:
              1,

            state:
              state1,

            audit:
              audit1,
          },
        );

      assert.equal(
        repeatedPersist
          .rows[0]
          .status,
        "persisted",
      );

      assert.equal(
        repeatedPersist
          .rows[0]
          .audit_event_id,
        firstPersist
          .rows[0]
          .audit_event_id,
      );

      await db.exec(`
        update public.sales_cycles
        set owner_user_id = null
        where id = '${cycleId}'
          and company_id = '${companyId}';
      `);

      const state2 =
        buildState({
          version:
            2,

          updatedAt:
            "2026-08-06T18:10:00-03:00",
        });

      const audit2 =
        buildAudit({
          previousVersion:
            1,

          candidateVersion:
            2,

          generatedAt:
            "2026-08-06T18:10:01-03:00",
        });

      const secondPersist =
        await callRpc(
          db,
          {
            operationKey:
              "stateful-copilot:company-1:cycle-1:v2",

            expectedVersion:
              1,

            expectedUpdatedAt:
              "2026-08-06T18:00:00-03:00",

            candidateVersion:
              2,

            state:
              state2,

            audit:
              audit2,
          },
        );

      assert.equal(
        secondPersist.rows[0].status,
        "persisted",
      );

      assert.equal(
        secondPersist
          .rows[0]
          .persisted_state_version,
        2,
      );

      const staleAttempt =
        await callRpc(
          db,
          {
            operationKey:
              "stateful-copilot:company-1:cycle-1:stale-v2",

            expectedVersion:
              1,

            expectedUpdatedAt:
              "2026-08-06T18:00:00-03:00",

            candidateVersion:
              2,

            state:
              state2,

            audit:
              audit2,
          },
        );

      assert.equal(
        staleAttempt.rows[0].status,
        "conflict",
      );

      assert.equal(
        staleAttempt
          .rows[0]
          .current_state_version,
        2,
      );

      const currentState =
        await db.query(`
          select
            state_version,
            state_updated_at,
            state_snapshot ->>
              'contract_version'
              as contract_version
          from public.companion_commercial_states
          where company_id =
              '${companyId}'
            and cycle_id =
              '${cycleId}'
            and conversation_key =
              '${conversationKey}'
        `);

      assert.equal(
        currentState.rows.length,
        1,
      );

      assert.equal(
        currentState
          .rows[0]
          .state_version,
        2,
      );

      assert.equal(
        currentState
          .rows[0]
          .contract_version,
        "phase-5.1-commercial-state-v1",
      );

      const eventHistory =
        await db.query(`
          select
            operation_key,
            previous_state_version,
            candidate_state_version,
            seller_user_id,
            automatic_crm_write,
            automatic_agenda_write
          from public.companion_commercial_state_events
          order by candidate_state_version
        `);

      assert.deepEqual(
        eventHistory.rows.map(
          (row) => ({
            operation_key:
              row.operation_key,

            previous_state_version:
              row.previous_state_version,

            candidate_state_version:
              row.candidate_state_version,

            seller_user_id:
              row.seller_user_id,

            automatic_crm_write:
              row.automatic_crm_write,

            automatic_agenda_write:
              row.automatic_agenda_write,
          }),
        ),
        [
          {
            operation_key:
              "stateful-copilot:company-1:cycle-1:v1",

            previous_state_version:
              null,

            candidate_state_version:
              1,

            seller_user_id:
              userId,

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          },
          {
            operation_key:
              "stateful-copilot:company-1:cycle-1:v2",

            previous_state_version:
              1,

            candidate_state_version:
              2,

            seller_user_id:
              null,

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          },
        ],
      );

      await db.exec(
        "set role service_role",
      );

      await assert.rejects(
        db.exec(`
          insert into
            public.companion_commercial_states (
              company_id,
              cycle_id,
              conversation_key,
              state_version,
              state_updated_at,
              state_snapshot
            )
          values (
            '${companyId}',
            '${cycleId}',
            'direct-write',
            1,
            '2026-08-06T18:00:00-03:00',
            ${jsonLiteral(state1)}
          )
        `),
        /permission denied/i,
      );

      await db.exec(
        "reset role",
      );

      await db.exec(
        "set role authenticated",
      );

      await assert.rejects(
        db.query(`
          select *
          from public.rpc_persist_stateful_copilot_state(
            'unauthorized',
            '${companyId}',
            '${cycleId}',
            '${conversationKey}',
            null,
            null,
            1,
            ${jsonLiteral(state1)},
            ${jsonLiteral(audit1)}
          )
        `),
        /permission denied/i,
      );

      await db.exec(
        "reset role",
      );
    } finally {
      await db.close();
    }
  },
);
