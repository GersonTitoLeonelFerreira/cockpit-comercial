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

const summaryMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260825120000_create_companion_lead_conversation_summaries.sql",
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

  ownerA: "40000000-0000-4000-8000-000000000001",
  adminA: "40000000-0000-4000-8000-000000000002",
  otherMemberA: "40000000-0000-4000-8000-000000000003",
  adminB: "40000000-0000-4000-8000-000000000004",
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
  as $$
    select nullif(
      current_setting('request.jwt.claim.sub', true),
      ''
    )::uuid
  $$;

  create function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$ select '{}'::jsonb $$;

  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.uid() to authenticated, service_role;
  grant execute on function auth.jwt() to authenticated, service_role;
`;

async function become(db, userId, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    userId,
  ]);
  await db.exec(`set role ${role}`);
}

async function becomePostgres(db) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

async function saveSummary(
  db,
  {
    companyId,
    leadId,
    actorUserId,
    conversationKey = "whatsapp:+5547999990001",
    summary,
    expectedVersion,
    watermark = "",
  },
) {
  const result = await db.query(
    `
      select *
      from public.rpc_save_companion_lead_conversation_summary(
        $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::integer, $7::text
      )
    `,
    [
      companyId,
      leadId,
      actorUserId,
      conversationKey,
      summary,
      expectedVersion,
      watermark,
    ],
  );

  return result.rows[0];
}

test(
  "Etapa 1: resumo persistente do lead (compare-and-set + isolamento)",
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
      await db.exec(await readFile(summaryMigrationPath, "utf8"));
      await db.exec("set search_path = public, extensions, pg_catalog");

      // --- metadados da RPC: security definer, search_path fixo, RLS off,
      // executável somente por service_role -----------------------------
      const functionMetadata = await db.query(`
        select
          procedure.prosecdef as security_definer,
          procedure.proconfig as settings
        from pg_proc procedure
        where procedure.oid =
          'public.rpc_save_companion_lead_conversation_summary(
            uuid, uuid, uuid, text, text, integer, text
          )'::regprocedure
      `);

      assert.equal(functionMetadata.rows[0].security_definer, true);
      assert.ok(
        functionMetadata.rows[0].settings.some((setting) =>
          setting.startsWith("search_path="),
        ),
      );
      assert.ok(
        functionMetadata.rows[0].settings.includes("row_security=off"),
      );

      const functionGrants = await db.query(`
        select role.rolname as grantee, privilege.privilege_type
        from pg_proc procedure
        cross join lateral aclexplode(procedure.proacl) privilege
        join pg_roles role on role.oid = privilege.grantee
        where procedure.oid =
          'public.rpc_save_companion_lead_conversation_summary(
            uuid, uuid, uuid, text, text, integer, text
          )'::regprocedure
          and role.rolname in ('anon', 'authenticated', 'service_role')
      `);

      assert.deepEqual(
        functionGrants.rows.map((row) => row.grantee).sort(),
        ["service_role"],
      );

      // --- seed --------------------------------------------------------
      await becomePostgres(db);

      await db.exec(`
        insert into auth.users (id, email)
        values
          ('${ids.ownerA}', 'owner-a@example.test'),
          ('${ids.adminA}', 'admin-a@example.test'),
          ('${ids.otherMemberA}', 'other-a@example.test'),
          ('${ids.adminB}', 'admin-b@example.test');

        insert into public.profiles (id, full_name, email, is_active_global)
        values
          ('${ids.ownerA}', 'Dono A', 'owner-a@example.test', true),
          ('${ids.adminA}', 'Admin A', 'admin-a@example.test', true),
          ('${ids.otherMemberA}', 'Outro A', 'other-a@example.test', true),
          ('${ids.adminB}', 'Admin B', 'admin-b@example.test', true);

        insert into public.companies (id, name, legal_name, trade_name)
        values
          ('${ids.companyA}', 'Empresa A', 'Empresa A LTDA', 'Empresa A'),
          ('${ids.companyB}', 'Empresa B', 'Empresa B LTDA', 'Empresa B');

        insert into public.company_memberships (
          company_id, user_id, role, is_active
        )
        values
          ('${ids.companyA}', '${ids.ownerA}', 'member', true),
          ('${ids.companyA}', '${ids.adminA}', 'admin', true),
          ('${ids.companyA}', '${ids.otherMemberA}', 'member', true),
          ('${ids.companyB}', '${ids.adminB}', 'admin', true);

        insert into public.leads (id, company_id, name, created_by)
        values
          ('${ids.leadA}', '${ids.companyA}', 'Larissa', '${ids.ownerA}'),
          ('${ids.leadB}', '${ids.companyB}', 'Mayara', '${ids.adminB}');

        insert into public.sales_cycles (
          id, company_id, lead_id, owner_user_id
        )
        values
          ('${ids.cycleA}', '${ids.companyA}', '${ids.leadA}', '${ids.ownerA}'),
          ('${ids.cycleB}', '${ids.companyB}', '${ids.leadB}', '${ids.adminB}');
      `);

      // 1) lead sem resumo -> nenhuma linha visível ----------------------
      await become(db, ids.ownerA, "authenticated");

      const emptyRead = await db.query(
        `
          select *
          from public.companion_lead_conversation_summaries
          where company_id = $1 and lead_id = $2
        `,
        [ids.companyA, ids.leadA],
      );

      assert.equal(emptyRead.rows.length, 0);

      // 2) salvar primeiro resumo -> version = 1 -------------------------
      await become(db, ids.ownerA, "service_role");

      const firstSave = await saveSummary(db, {
        companyId: ids.companyA,
        leadId: ids.leadA,
        actorUserId: ids.ownerA,
        summary: "Larissa perde oportunidades por falta de follow-up.",
        expectedVersion: null,
        watermark: "wm-1",
      });

      assert.equal(firstSave.conflict, false);
      assert.equal(firstSave.version, 1);
      assert.equal(firstSave.current_version, 1);

      // 3) buscar novamente -> retorna exatamente o resumo salvo ---------
      await become(db, ids.ownerA, "authenticated");

      const afterFirstSave = await db.query(
        `
          select summary, version, last_message_watermark
          from public.companion_lead_conversation_summaries
          where company_id = $1 and lead_id = $2
        `,
        [ids.companyA, ids.leadA],
      );

      assert.equal(afterFirstSave.rows.length, 1);
      assert.equal(
        afterFirstSave.rows[0].summary,
        "Larissa perde oportunidades por falta de follow-up.",
      );
      assert.equal(afterFirstSave.rows[0].version, 1);
      assert.equal(afterFirstSave.rows[0].last_message_watermark, "wm-1");

      // 4) atualizar com expected_version correto -> version incrementa --
      await become(db, ids.ownerA, "service_role");

      const secondSave = await saveSummary(db, {
        companyId: ids.companyA,
        leadId: ids.leadA,
        actorUserId: ids.ownerA,
        summary: "Proposta de piloto de 90 dias apresentada, valor questionado.",
        expectedVersion: 1,
        watermark: "wm-2",
      });

      assert.equal(secondSave.conflict, false);
      assert.equal(secondSave.version, 2);

      // 5) atualizar com expected_version antigo -> conflito -------------
      const staleSave = await saveSummary(db, {
        companyId: ids.companyA,
        leadId: ids.leadA,
        actorUserId: ids.ownerA,
        summary: "Tentativa de sobrescrita com versão desatualizada.",
        expectedVersion: 1,
        watermark: "wm-3",
      });

      assert.equal(staleSave.conflict, true);
      assert.equal(staleSave.current_version, 2);

      const afterStaleAttempt = await db.query(
        `
          select summary, version
          from public.companion_lead_conversation_summaries
          where company_id = $1 and lead_id = $2
        `,
        [ids.companyA, ids.leadA],
      );

      assert.equal(afterStaleAttempt.rows[0].version, 2);
      assert.equal(
        afterStaleAttempt.rows[0].summary,
        "Proposta de piloto de 90 dias apresentada, valor questionado.",
      );

      // 6) tenant isolation: company_id != empresa real do lead ----------
      await assert.rejects(
        saveSummary(db, {
          companyId: ids.companyB,
          leadId: ids.leadA,
          actorUserId: ids.adminB,
          summary: "Tentativa de escrever resumo de lead de outra empresa.",
          expectedVersion: null,
        }),
        /não encontrado/i,
      );

      // seed resumo do lead B para os testes de A -> B abaixo ------------
      await saveSummary(db, {
        companyId: ids.companyB,
        leadId: ids.leadB,
        actorUserId: ids.adminB,
        summary: "Resumo da Mayara, empresa B.",
        expectedVersion: null,
        watermark: "wm-b-1",
      });

      // 7) A -> B: dono do lead A nunca vê resumo do lead B ---------------
      await become(db, ids.ownerA, "authenticated");

      const crossLeadRead = await db.query(
        `
          select *
          from public.companion_lead_conversation_summaries
          where company_id = $1 and lead_id = $2
        `,
        [ids.companyB, ids.leadB],
      );

      assert.equal(crossLeadRead.rows.length, 0);

      // 8) tenant A -> tenant B: admin de B não vê resumo de A ------------
      await become(db, ids.adminB, "authenticated");

      const crossTenantRead = await db.query(
        `
          select *
          from public.companion_lead_conversation_summaries
          where company_id = $1 and lead_id = $2
        `,
        [ids.companyA, ids.leadA],
      );

      assert.equal(crossTenantRead.rows.length, 0);

      // 9) portfólio: membro comum de A, sem posse do ciclo, não vê -------
      await become(db, ids.otherMemberA, "authenticated");

      const nonOwnerRead = await db.query(
        `
          select *
          from public.companion_lead_conversation_summaries
          where company_id = $1 and lead_id = $2
        `,
        [ids.companyA, ids.leadA],
      );

      assert.equal(nonOwnerRead.rows.length, 0);

      // admin da empresa A vê tudo da empresa, mesmo sem ser dono ---------
      await become(db, ids.adminA, "authenticated");

      const adminRead = await db.query(
        `
          select summary, version
          from public.companion_lead_conversation_summaries
          where company_id = $1 and lead_id = $2
        `,
        [ids.companyA, ids.leadA],
      );

      assert.equal(adminRead.rows.length, 1);
      assert.equal(adminRead.rows[0].version, 2);

      // 10) nenhum SAVE fora da RPC: authenticated não tem INSERT direto --
      await become(db, ids.ownerA, "authenticated");

      await assert.rejects(
        db.exec(`
          insert into public.companion_lead_conversation_summaries (
            company_id, lead_id, conversation_key, summary,
            created_by, updated_by
          )
          values (
            '${ids.companyA}', '${ids.leadA}', 'whatsapp:+5547999990001',
            'Escrita direta indevida.', '${ids.ownerA}', '${ids.ownerA}'
          )
        `),
        /permission denied|row-level security/i,
      );
    } finally {
      await db.close();
    }
  },
);
