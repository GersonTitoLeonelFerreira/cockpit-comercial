import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

// R2 — gate final de segurança: prova, contra um Postgres efêmero (nunca
// contra o projeto Supabase real — nenhuma migration é aplicada em
// produção por este teste), o contrato completo de
// rpc_link_companion_external_identity /
// rpc_touch_companion_external_identity_last_seen:
//
//   1. service_role only (anon/authenticated não podem executar nenhuma
//      das duas RPCs, e a tabela tem RLS forçado com policy restritiva
//      deny-all).
//   2. Uma vez vinculada, a identidade permanece no mesmo lead através de
//      qualquer operação "de rotina" (resolve por leitura direta, touch
//      de last_seen) — só uma segunda chamada EXPLÍCITA a
//      rpc_link_companion_external_identity com outro lead_id move o
//      vínculo. Isso prova que o ON CONFLICT DO UPDATE lead_id=excluded.
//      lead_id é uma primitiva de correção deliberada, nunca um efeito
//      colateral de leitura/touch/retry.
//
// Quem nunca chama rpc_link_companion_external_identity hoje
// (capture-ingestion.ts, app/api/companion/capture/messages/route.ts,
// app/api/companion/resolve-lead/route.ts) é verificado por ausência de
// referência no código-fonte, não por este teste de banco — ver
// EXTERNAL_IDENTITY_RELINK_CONTRACT.md.

function migrationPath(fileName) {
  return fileURLToPath(
    new URL(
      `../migrations/${fileName}`,
      import.meta.url,
    ),
  );
}

const migrationPaths = [
  migrationPath(
    "20260629040658_restore_simulator_metrics_rpc_shell.sql",
  ),
  migrationPath(
    "20260915020000_create_lead_external_identities.sql",
  ),
];

const ids = {
  company:
    "10000000-0000-4000-8000-000000000001",
  otherCompany:
    "10000000-0000-4000-8000-000000000002",
  leadOne:
    "20000000-0000-4000-8000-000000000001",
  leadTwo:
    "20000000-0000-4000-8000-000000000002",
  leadOtherCompany:
    "20000000-0000-4000-8000-000000000003",
  user:
    "40000000-0000-4000-8000-000000000001",
};

const PLATFORM = "manychat";
const EXTERNAL_IDENTITY_KEY =
  "manychat:contact:v1:sha256:deadbeef";

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

  for (const path of migrationPaths) {
    await db.exec(await readFile(path, "utf8"));
  }

  await db.exec(
    "set search_path = public, extensions, pg_catalog",
  );

  await db.exec(`
    insert into auth.users (id, email)
    values (
      '${ids.user}',
      'relink-user@example.test'
    );

    insert into public.profiles (
      id,
      full_name,
      email,
      is_active_global
    )
    values (
      '${ids.user}',
      'Usuário Relink',
      'relink-user@example.test',
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
        '${ids.company}',
        'Empresa Relink',
        'Empresa Relink LTDA',
        'Empresa Relink'
      ),
      (
        '${ids.otherCompany}',
        'Empresa Relink B',
        'Empresa Relink B LTDA',
        'Empresa Relink B'
      );

    insert into public.company_memberships (
      company_id,
      user_id,
      role,
      is_active
    )
    values (
      '${ids.company}',
      '${ids.user}',
      'member',
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
        '${ids.leadOne}',
        '${ids.company}',
        'Lead Um',
        '${ids.user}'
      ),
      (
        '${ids.leadTwo}',
        '${ids.company}',
        'Lead Dois',
        '${ids.user}'
      ),
      (
        '${ids.leadOtherCompany}',
        '${ids.otherCompany}',
        'Lead De Outra Empresa',
        '${ids.user}'
      );
  `);

  return db;
}

async function setRole(db, role) {
  await db.exec("reset role");
  await db.exec(`set role ${role}`);
}

async function callLink(
  db,
  { leadId, actorUserId = ids.user, role = "service_role" },
) {
  await setRole(db, role);

  try {
    const result = await db.query(
      `
        select *
        from public.rpc_link_companion_external_identity(
          $1::uuid,
          $2::uuid,
          $3::text,
          $4::text,
          $5::text,
          $6::uuid
        )
      `,
      [
        ids.company,
        leadId,
        PLATFORM,
        EXTERNAL_IDENTITY_KEY,
        "manychat_dom_reader",
        actorUserId,
      ],
    );

    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: null, error };
  } finally {
    await setRole(db, "service_role");
  }
}

async function callTouch(db, { role = "service_role" } = {}) {
  await setRole(db, role);

  try {
    await db.query(
      `
        select public.rpc_touch_companion_external_identity_last_seen(
          $1::uuid,
          $2::text,
          $3::text
        )
      `,
      [ids.company, PLATFORM, EXTERNAL_IDENTITY_KEY],
    );

    return { error: null };
  } catch (error) {
    return { error };
  } finally {
    await setRole(db, "service_role");
  }
}

async function resolveByIdentity(db) {
  // Mimetiza exatamente findLeadIdByExternalIdentity() em
  // app/api/companion/resolve-lead/route.ts: um SELECT direto, nunca uma
  // escrita.
  await setRole(db, "service_role");

  const result = await db.query(
    `
      select lead_id
      from public.lead_external_identities
      where company_id = $1
        and platform = $2
        and external_identity_key = $3
    `,
    [ids.company, PLATFORM, EXTERNAL_IDENTITY_KEY],
  );

  return result.rows[0]?.lead_id ?? null;
}

test(
  "rpc_link_companion_external_identity e rpc_touch_companion_external_identity_last_seen são service_role only",
  async () => {
    const db = await buildDb();

    try {
      const grants = await db.query(`
        select
          procedure.proname as function_name,
          role.rolname as grantee,
          privilege.privilege_type
        from pg_proc procedure
        cross join lateral aclexplode(procedure.proacl) privilege
        join pg_roles role
          on role.oid = privilege.grantee
        where procedure.proname in (
          'rpc_link_companion_external_identity',
          'rpc_touch_companion_external_identity_last_seen'
        )
      `);

      const grantees = grants.rows.map(
        (row) => row.grantee,
      );

      assert.ok(
        !grantees.includes("anon"),
      );
      assert.ok(
        !grantees.includes("authenticated"),
      );
      assert.ok(
        grantees.includes("service_role"),
      );

      const linkAsAnon = await callLink(db, {
        leadId: ids.leadOne,
        role: "anon",
      });

      assert.ok(linkAsAnon.error);

      const linkAsAuthenticated = await callLink(db, {
        leadId: ids.leadOne,
        role: "authenticated",
      });

      assert.ok(linkAsAuthenticated.error);

      const touchAsAnon = await callTouch(db, {
        role: "anon",
      });

      assert.ok(touchAsAnon.error);

      const tableSecurity = await db.query(`
        select
          relation.relrowsecurity as rls_enabled,
          relation.relforcerowsecurity as rls_forced
        from pg_class relation
        join pg_namespace namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'lead_external_identities'
      `);

      assert.equal(
        tableSecurity.rows[0].rls_enabled,
        true,
      );
      assert.equal(
        tableSecurity.rows[0].rls_forced,
        true,
      );

      const policies = await db.query(`
        select
          polcmd,
          polroles,
          pg_get_expr(polqual, polrelid) as using_expression,
          pg_get_expr(polwithcheck, polrelid) as check_expression
        from pg_policy
        where polrelid = 'public.lead_external_identities'::regclass
      `);

      assert.equal(policies.rows.length, 1);
      assert.equal(
        policies.rows[0].using_expression,
        "false",
      );
      assert.equal(
        policies.rows[0].check_expression,
        "false",
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "identidade vinculada permanece no mesmo lead por resolve/capture/touch de rotina; só relink explícito move para outro lead",
  async () => {
    const db = await buildDb();

    try {
      const initialLink = await callLink(db, {
        leadId: ids.leadOne,
      });

      assert.equal(initialLink.error, null);
      assert.equal(
        initialLink.rows[0].lead_id,
        ids.leadOne,
      );

      const initialLastSeen =
        initialLink.rows[0].last_seen_at;

      // "routine resolve/capture" — leitura direta, exatamente como o
      // resolve-lead real faz. Nunca escreve.
      const afterResolveOne =
        await resolveByIdentity(db);
      assert.equal(afterResolveOne, ids.leadOne);

      const afterResolveTwo =
        await resolveByIdentity(db);
      assert.equal(afterResolveTwo, ids.leadOne);

      // touch last_seen — única escrita que o caminho de rotina
      // (resolve-lead) realiza.
      const touch = await callTouch(db);
      assert.equal(touch.error, null);

      const afterTouch = await resolveByIdentity(db);
      assert.equal(afterTouch, ids.leadOne);

      const lastSeenAfterTouch = await db.query(
        `
          select last_seen_at, lead_id
          from public.lead_external_identities
          where company_id = $1
            and platform = $2
            and external_identity_key = $3
        `,
        [ids.company, PLATFORM, EXTERNAL_IDENTITY_KEY],
      );

      assert.equal(
        lastSeenAfterTouch.rows[0].lead_id,
        ids.leadOne,
      );
      assert.ok(
        new Date(
          lastSeenAfterTouch.rows[0].last_seen_at,
        ).getTime() >=
          new Date(initialLastSeen).getTime(),
      );

      // Repetir touch várias vezes (simulando retries) nunca move o
      // vínculo.
      await callTouch(db);
      await callTouch(db);

      const afterRetries = await resolveByIdentity(db);
      assert.equal(afterRetries, ids.leadOne);

      // Nenhuma operação "automática" (resolve, touch, retry) move o
      // vínculo para outro lead — só uma chamada explícita à RPC de
      // link, com outro lead_id, faz isso.
      const relink = await callLink(db, {
        leadId: ids.leadTwo,
      });

      assert.equal(relink.error, null);
      assert.equal(
        relink.rows[0].lead_id,
        ids.leadTwo,
      );

      const afterExplicitRelink =
        await resolveByIdentity(db);
      assert.equal(afterExplicitRelink, ids.leadTwo);
    } finally {
      await db.close();
    }
  },
);

test(
  "rpc_link_companion_external_identity recusa lead de outra empresa (nunca reassocia entre empresas)",
  async () => {
    const db = await buildDb();

    try {
      const crossCompanyLink = await callLink(db, {
        leadId: ids.leadOtherCompany,
      });

      assert.ok(crossCompanyLink.error);
      assert.match(
        String(crossCompanyLink.error.message ?? ""),
        /Lead não encontrado para a empresa informada/,
      );

      const afterAttempt = await resolveByIdentity(db);
      assert.equal(afterAttempt, null);
    } finally {
      await db.close();
    }
  },
);
