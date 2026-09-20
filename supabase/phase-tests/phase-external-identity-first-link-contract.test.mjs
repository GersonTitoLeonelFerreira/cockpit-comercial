import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

// STEP 2A.1 — gate de atomicidade: prova, contra um Postgres efêmero (nunca
// contra o projeto Supabase real — nenhuma migration é aplicada em
// produção por este teste), o contrato completo de
// rpc_link_companion_external_identity_first:
//
//   1. service_role only (mesmas garantias de acesso de
//      rpc_link_companion_external_identity / da tabela).
//   2. Primeira chamada para uma identidade nova sempre cria o vínculo
//      (LINKED).
//   3. Repetir a mesma chamada para o mesmo lead é idempotente
//      (IDEMPOTENT_ALREADY_LINKED_TO_TARGET) e nunca duplica linha.
//   4. Chamar com um lead diferente para uma identidade já vinculada NUNCA
//      sobrescreve — responde ALREADY_LINKED_CONFLICT e a linha original
//      permanece byte-a-byte intacta (inclusive campos de auditoria).
//   5. A definição da função, via pg_get_functiondef, contém
//      `on conflict ... do nothing` e NÃO contém `do update` — prova
//      estrutural de que esta RPC é estruturalmente incapaz de relink,
//      distinta de rpc_link_companion_external_identity_first.
//   6. Regressão de concorrência: o harness PGlite é single-connection e
//      não oferece duas transações concorrentes reais (ver nota na seção
//      "concorrência" abaixo) — o gate de atomicidade combina o
//      comportamento sequencial provado aqui com o índice UNIQUE já
//      existente (lead_external_identities_identity_uidx, criado em
//      20260915020000) e a ausência estrutural de DO UPDATE nesta função:
//      sob esse índice, a segunda de duas inserções concorrentes para a
//      mesma chave SEMPRE bate no mesmo conflito provado aqui
//      sequencialmente, e esta função SEMPRE responde com DO NOTHING
//      (nunca DO UPDATE) para esse conflito — não há como pular esse
//      caminho de código, concorrente ou não.
//
// rpc_link_companion_external_identity (relink, upsert deliberado)
// continua existindo sem alteração — ver
// phase-lead-external-identity-relink-contract.test.mjs, executado à parte
// como regressão desta rodada.

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
  migrationPath(
    "20260919210200_create_companion_external_identity_first_link.sql",
  ),
];

const ids = {
  company:
    "10000000-0000-4000-8000-000000000101",
  otherCompany:
    "10000000-0000-4000-8000-000000000102",
  leadOne:
    "20000000-0000-4000-8000-000000000101",
  leadTwo:
    "20000000-0000-4000-8000-000000000102",
  leadDeleted:
    "20000000-0000-4000-8000-000000000103",
  leadOtherCompany:
    "20000000-0000-4000-8000-000000000104",
  user:
    "40000000-0000-4000-8000-000000000101",
};

const PLATFORM = "manychat";
const EXTERNAL_IDENTITY_KEY =
  "manychat:contact:v1:sha256:cafef00d";

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
      'first-link-user@example.test'
    );

    insert into public.profiles (
      id,
      full_name,
      email,
      is_active_global
    )
    values (
      '${ids.user}',
      'Usuário First Link',
      'first-link-user@example.test',
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
        'Empresa First Link',
        'Empresa First Link LTDA',
        'Empresa First Link'
      ),
      (
        '${ids.otherCompany}',
        'Empresa First Link B',
        'Empresa First Link B LTDA',
        'Empresa First Link B'
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
      created_by,
      deleted_at
    )
    values
      (
        '${ids.leadOne}',
        '${ids.company}',
        'Lead Um',
        '${ids.user}',
        null
      ),
      (
        '${ids.leadTwo}',
        '${ids.company}',
        'Lead Dois',
        '${ids.user}',
        null
      ),
      (
        '${ids.leadDeleted}',
        '${ids.company}',
        'Lead Excluído',
        '${ids.user}',
        now()
      ),
      (
        '${ids.leadOtherCompany}',
        '${ids.otherCompany}',
        'Lead De Outra Empresa',
        '${ids.user}',
        null
      );
  `);

  return db;
}

async function setRole(db, role) {
  await db.exec("reset role");
  await db.exec(`set role ${role}`);
}

async function callFirstLink(
  db,
  {
    leadId,
    actorUserId = ids.user,
    role = "service_role",
    companyId = ids.company,
    externalIdentityKey = EXTERNAL_IDENTITY_KEY,
  },
) {
  await setRole(db, role);

  try {
    const result = await db.query(
      `
        select *
        from public.rpc_link_companion_external_identity_first(
          $1::uuid,
          $2::uuid,
          $3::text,
          $4::text,
          $5::text,
          $6::uuid
        )
      `,
      [
        companyId,
        leadId,
        PLATFORM,
        externalIdentityKey,
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

async function readStoredRow(db, { externalIdentityKey = EXTERNAL_IDENTITY_KEY } = {}) {
  await setRole(db, "service_role");

  const result = await db.query(
    `
      select *
      from public.lead_external_identities
      where company_id = $1
        and platform = $2
        and external_identity_key = $3
    `,
    [ids.company, PLATFORM, externalIdentityKey],
  );

  return result.rows;
}

test(
  "rpc_link_companion_external_identity_first é service_role only (mesma garantia de acesso da RPC de relink)",
  async () => {
    const db = await buildDb();

    try {
      const grants = await db.query(`
        select
          procedure.proname as function_name,
          role.rolname as grantee
        from pg_proc procedure
        cross join lateral aclexplode(procedure.proacl) privilege
        join pg_roles role
          on role.oid = privilege.grantee
        where procedure.proname = 'rpc_link_companion_external_identity_first'
      `);

      const grantees = grants.rows.map((row) => row.grantee);

      assert.ok(!grantees.includes("anon"));
      assert.ok(!grantees.includes("authenticated"));
      assert.ok(grantees.includes("service_role"));

      const asAnon = await callFirstLink(db, {
        leadId: ids.leadOne,
        role: "anon",
      });
      assert.ok(asAnon.error);

      const asAuthenticated = await callFirstLink(db, {
        leadId: ids.leadOne,
        role: "authenticated",
      });
      assert.ok(asAuthenticated.error);

      const asServiceRole = await callFirstLink(db, {
        leadId: ids.leadOne,
      });
      assert.equal(asServiceRole.error, null);
      assert.equal(asServiceRole.rows[0].status, "LINKED");
    } finally {
      await db.close();
    }
  },
);

test(
  "primeira chamada cria o vínculo (LINKED); mesma identidade + mesmo lead é idempotente; mesma identidade + outro lead nunca sobrescreve",
  async () => {
    const db = await buildDb();

    try {
      // A. Primeira chamada.
      const first = await callFirstLink(db, { leadId: ids.leadOne });
      assert.equal(first.error, null);
      assert.equal(first.rows[0].status, "LINKED");
      assert.equal(first.rows[0].lead_id, ids.leadOne);
      assert.ok(first.rows[0].id);

      const afterFirst = await readStoredRow(db);
      assert.equal(afterFirst.length, 1);
      const storedAfterFirst = afterFirst[0];

      // B. Mesma identidade + mesmo lead → idempotente, 1 linha só.
      const idempotent = await callFirstLink(db, { leadId: ids.leadOne });
      assert.equal(idempotent.error, null);
      assert.equal(
        idempotent.rows[0].status,
        "IDEMPOTENT_ALREADY_LINKED_TO_TARGET",
      );
      assert.equal(idempotent.rows[0].lead_id, ids.leadOne);
      assert.equal(idempotent.rows[0].id, storedAfterFirst.id);

      const afterIdempotent = await readStoredRow(db);
      assert.equal(afterIdempotent.length, 1);

      // C. Mesma identidade + outro lead → conflito, nenhuma escrita.
      const conflict = await callFirstLink(db, { leadId: ids.leadTwo });
      assert.equal(conflict.error, null);
      assert.equal(conflict.rows[0].status, "ALREADY_LINKED_CONFLICT");

      // Nenhum detalhe do lead/linha existente é exposto no conflito.
      assert.equal(conflict.rows[0].id, null);
      assert.equal(conflict.rows[0].company_id, null);
      assert.equal(conflict.rows[0].lead_id, null);
      assert.equal(conflict.rows[0].platform, null);
      assert.equal(conflict.rows[0].external_identity_key, null);
      assert.equal(conflict.rows[0].identity_source, null);
      assert.equal(conflict.rows[0].channel, null);
      assert.equal(conflict.rows[0].created_at, null);
      assert.equal(conflict.rows[0].updated_at, null);
      assert.equal(conflict.rows[0].last_seen_at, null);

      // D. Linha original permanece byte-a-byte intacta após o conflito.
      const afterConflict = await readStoredRow(db);
      assert.equal(afterConflict.length, 1);
      const storedAfterConflict = afterConflict[0];

      assert.equal(storedAfterConflict.lead_id, ids.leadOne);
      assert.equal(storedAfterConflict.id, storedAfterFirst.id);
      assert.equal(
        storedAfterConflict.identity_source,
        storedAfterFirst.identity_source,
      );
      assert.equal(storedAfterConflict.channel, storedAfterFirst.channel);
      assert.equal(
        storedAfterConflict.linked_by,
        storedAfterFirst.linked_by,
      );
      assert.equal(
        new Date(storedAfterConflict.created_at).getTime(),
        new Date(storedAfterFirst.created_at).getTime(),
      );
      assert.equal(
        new Date(storedAfterConflict.updated_at).getTime(),
        new Date(storedAfterFirst.updated_at).getTime(),
      );
      assert.equal(
        new Date(storedAfterConflict.last_seen_at).getTime(),
        new Date(storedAfterFirst.last_seen_at).getTime(),
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "rpc_link_companion_external_identity_first recusa lead de outra empresa",
  async () => {
    const db = await buildDb();

    try {
      const crossCompany = await callFirstLink(db, {
        leadId: ids.leadOtherCompany,
        externalIdentityKey: `${EXTERNAL_IDENTITY_KEY}:cross`,
      });

      assert.ok(crossCompany.error);
      assert.match(
        String(crossCompany.error.message ?? ""),
        /Lead não encontrado para a empresa informada/,
      );

      const stored = await readStoredRow(db, {
        externalIdentityKey: `${EXTERNAL_IDENTITY_KEY}:cross`,
      });
      assert.equal(stored.length, 0);
    } finally {
      await db.close();
    }
  },
);

test(
  "rpc_link_companion_external_identity_first recusa lead soft-deleted",
  async () => {
    const db = await buildDb();

    try {
      const deleted = await callFirstLink(db, {
        leadId: ids.leadDeleted,
        externalIdentityKey: `${EXTERNAL_IDENTITY_KEY}:deleted`,
      });

      assert.ok(deleted.error);
      assert.match(
        String(deleted.error.message ?? ""),
        /Lead arquivado ou excluído não pode receber vínculo/,
      );

      const stored = await readStoredRow(db, {
        externalIdentityKey: `${EXTERNAL_IDENTITY_KEY}:deleted`,
      });
      assert.equal(stored.length, 0);
    } finally {
      await db.close();
    }
  },
);

test(
  "definição da função contém ON CONFLICT ... DO NOTHING e não contém DO UPDATE",
  async () => {
    const db = await buildDb();

    try {
      const definition = await db.query(
        `
          select pg_get_functiondef(procedure.oid) as source
          from pg_proc procedure
          where procedure.proname = 'rpc_link_companion_external_identity_first'
        `,
      );

      assert.equal(definition.rows.length, 1);
      const source = String(definition.rows[0].source).toLowerCase();

      assert.match(source, /on conflict[\s\S]*do nothing/);
      assert.doesNotMatch(source, /do update/);
    } finally {
      await db.close();
    }
  },
);

test(
  "concorrência: duas tentativas para a mesma identidade com leads diferentes — banco termina com exatamente 1 vínculo, sem mutação da linha vencedora " +
    "(NOTA DE LIMITAÇÃO: PGlite é single-connection; este teste prova o comportamento sequencial determinístico dos dois pedidos, não duas transações " +
    "concorrentes de fato. A alegação de atomicidade sob concorrência real combina este resultado sequencial com: 1) o índice único " +
    "lead_external_identities_identity_uidx de 20260915020000, que torna a segunda inserção de qualquer par concorrente sempre um conflito de linha " +
    "(nunca uma segunda linha), e 2) o teste anterior, que prova estruturalmente que esta função nunca executa DO UPDATE para esse conflito — logo o " +
    "caminho de resposta a um conflito é o mesmo, determinístico, seja ele disparado sequencial ou concorrentemente)",
  async () => {
    const db = await buildDb();

    try {
      const externalIdentityKey = `${EXTERNAL_IDENTITY_KEY}:race`;

      const [attemptA, attemptB] = await Promise.all([
        callFirstLink(db, { leadId: ids.leadOne, externalIdentityKey }),
        callFirstLink(db, { leadId: ids.leadTwo, externalIdentityKey }),
      ]);

      const statuses = [attemptA.rows?.[0]?.status, attemptB.rows?.[0]?.status]
        .filter(Boolean)
        .sort();

      assert.deepEqual(statuses, ["ALREADY_LINKED_CONFLICT", "LINKED"]);

      const stored = await readStoredRow(db, { externalIdentityKey });
      assert.equal(stored.length, 1);
      assert.ok(
        stored[0].lead_id === ids.leadOne || stored[0].lead_id === ids.leadTwo,
      );

      const winner =
        attemptA.rows?.[0]?.status === "LINKED" ? attemptA : attemptB;
      assert.equal(stored[0].id, winner.rows[0].id);
      assert.equal(stored[0].lead_id, winner.rows[0].lead_id);
    } finally {
      await db.close();
    }
  },
);
