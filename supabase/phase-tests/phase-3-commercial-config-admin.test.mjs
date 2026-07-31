import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const commercialConfigMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260731000105_create_company_commercial_config.sql",
    import.meta.url,
  ),
);

const commercialPoliciesMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260731005400_split_company_commercial_write_policies.sql",
    import.meta.url,
  ),
);

const commercialAdminMigrationPath = fileURLToPath(
  new URL(
    "../migrations/20260731123000_create_company_commercial_admin_operations.sql",
    import.meta.url,
  ),
);

const ids = {
  companyA: "10000000-0000-4000-8000-000000000001",
  companyB: "10000000-0000-4000-8000-000000000002",

  adminA: "20000000-0000-4000-8000-000000000001",
  managerA: "20000000-0000-4000-8000-000000000002",
  memberA: "20000000-0000-4000-8000-000000000003",
  inactiveAdminA: "20000000-0000-4000-8000-000000000004",
  adminB: "20000000-0000-4000-8000-000000000005",

  productA: "30000000-0000-4000-8000-000000000001",
  productB: "30000000-0000-4000-8000-000000000002",
};

const bootstrapSql = `
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

  grant usage on schema auth
  to authenticated, service_role;

  grant execute on function auth.uid()
  to authenticated, service_role;

  create table public.profiles (
    id uuid primary key
      references auth.users (id) on delete cascade,
    is_active_global boolean not null default true
  );

  create table public.companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    legal_name text not null,
    trade_name text not null
  );

  create table public.company_memberships (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null
      references public.companies (id) on delete cascade,
    user_id uuid not null
      references auth.users (id) on delete cascade,
    role text not null
      check (role in ('admin', 'manager', 'member')),
    is_active boolean not null default true,
    unique (company_id, user_id)
  );

  create table public.products (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null
      references public.companies (id) on delete cascade,
    name text not null,
    category text not null default '',
    base_price numeric not null default 0,
    active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
  );

  grant select
  on table public.products
  to authenticated, service_role;
`;

async function become(db, userId, role = "authenticated") {
  await db.exec("reset role");

  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false)",
    [userId],
  );

  await db.exec(`set role ${role}`);
}

async function becomePostgres(db) {
  await db.exec("reset role");

  await db.query(
    "select set_config('request.jwt.claim.sub', '', false)",
  );
}

function createIncompletePayload(productId) {
  return {
    business_description: "Empresa com operação comercial estruturada",
    target_audience: "Empresas com equipes comerciais",
    value_proposition: "Acompanhamento da execução comercial",

    commercial_method_name: "Método consultivo",
    commercial_method_description:
      "Compreender a necessidade antes de apresentar uma solução",
    communication_tone: "Direto, consultivo e respeitoso",

    required_behaviors: [
      "Responder a pergunta do cliente",
      "Investigar a necessidade antes de oferecer",
    ],
    prohibited_behaviors: [
      "Inventar condições comerciais",
      "Pressionar sem diagnóstico",
    ],

    method_steps: [
      {
        step_order: 1,
        name: "Diagnóstico",
        objective: "Compreender a necessidade real do cliente",
        completion_criteria: [],
        recommended_questions: [
          "O que você precisa resolver neste momento?",
        ],
        is_required: true,
      },
    ],

    product_profiles: [
      {
        product_id: productId,
        indicated_audiences: [
          "Empresas com equipes comerciais",
        ],
        needs_addressed: [],
        benefits: [],
        verified_differentiators: [
          "Método comercial configurável",
        ],
        limitations: [
          "Depende da utilização correta pela equipe",
        ],
        contract_conditions: [
          "Conforme contrato vigente",
        ],
        payment_conditions: [
          "Conforme proposta comercial aprovada",
        ],
        allowed_claims: [
          "Apoia o acompanhamento comercial",
        ],
        forbidden_claims: [
          "Garante resultados sem execução da equipe",
        ],
      },
    ],

    facts: [],

    objection_guides: [],
  };
}

function createCompletePayload(productId) {
  return {
    business_description:
      "Empresa que estrutura e acompanha operações comerciais",
    target_audience:
      "Empresas com vendedores e gestores comerciais",
    value_proposition:
      "Dar método, acompanhamento e previsibilidade à execução comercial",

    commercial_method_name: "Método consultivo Yolen",
    commercial_method_description:
      "Diagnosticar a necessidade antes de apresentar a solução",
    communication_tone:
      "Direto, consultivo, profissional e sem pressão indevida",

    required_behaviors: [
      "Responder claramente as perguntas do cliente",
      "Investigar a necessidade antes de apresentar a solução",
    ],
    prohibited_behaviors: [
      "Inventar condições comerciais",
      "Prometer resultados que não podem ser garantidos",
    ],

    method_steps: [
      {
        step_order: 1,
        name: "Diagnóstico",
        objective:
          "Compreender o problema, o objetivo e a urgência do cliente",
        completion_criteria: [
          "Problema principal identificado",
          "Objetivo esperado identificado",
        ],
        recommended_questions: [
          "O que você precisa resolver neste momento?",
          "Qual resultado você espera alcançar?",
        ],
        is_required: true,
      },
    ],

    product_profiles: [
      {
        product_id: productId,
        indicated_audiences: [
          "Empresas com equipes comerciais",
        ],
        needs_addressed: [
          "Falta de processo comercial",
          "Falta de acompanhamento da execução",
        ],
        benefits: [
          "Execução comercial estruturada",
          "Maior visibilidade para o gestor",
        ],
        verified_differentiators: [
          "Método comercial configurável por empresa",
        ],
        limitations: [
          "Os resultados dependem da execução da equipe",
        ],
        contract_conditions: [
          "Conforme contrato vigente",
        ],
        payment_conditions: [
          "Conforme proposta comercial aprovada",
        ],
        allowed_claims: [
          "Apoia a organização e o acompanhamento comercial",
        ],
        forbidden_claims: [
          "Garante vendas independentemente da execução",
        ],
      },
    ],

    facts: [
      {
        category: "operacao",
        fact_key: "horario_atendimento",
        fact_value: "Segunda a sexta, das 08h às 18h",
        source_note: "Política operacional aprovada",
        is_active: true,
      },
    ],

    objection_guides: [
      {
        sort_order: 1,
        objection: "Preço",
        signals: [
          "Está caro",
          "Achei acima do esperado",
        ],
        discovery_questions: [
          "Comparado a qual alternativa?",
          "Qual ponto está pesando mais na decisão?",
        ],
        recommended_approach:
          "Entender o critério de comparação antes de defender valor",
        response_limits: [
          "Não inventar desconto",
          "Não prometer condição não aprovada",
        ],
        is_active: true,
      },
    ],
  };
}

async function saveDraft(
  db,
  companyId,
  configVersionId,
  payload,
) {
  return db.query(
    `
      select *
      from public.rpc_save_company_commercial_config_draft(
        $1::uuid,
        $2::uuid,
        $3::jsonb
      )
    `,
    [
      companyId,
      configVersionId,
      JSON.stringify(payload),
    ],
  );
}

async function publishDraft(
  db,
  companyId,
  configVersionId,
) {
  return db.query(
    `
      select *
      from public.rpc_publish_company_commercial_config(
        $1::uuid,
        $2::uuid
      )
    `,
    [companyId, configVersionId],
  );
}

async function cloneConfig(
  db,
  companyId,
  sourceConfigVersionId,
) {
  return db.query(
    `
      select *
      from public.rpc_clone_company_commercial_config(
        $1::uuid,
        $2::uuid
      )
    `,
    [companyId, sourceConfigVersionId],
  );
}

async function deleteDraft(
  db,
  companyId,
  configVersionId,
) {
  return db.query(
    `
      select *
      from public.rpc_delete_company_commercial_config_draft(
        $1::uuid,
        $2::uuid
      )
    `,
    [companyId, configVersionId],
  );
}

async function readDraftSnapshot(
  db,
  companyId,
  configVersionId,
) {
  const result = await db.query(
    `
      select
        version.business_description,

        (
          select count(*)::integer
          from public.company_commercial_method_steps step
          where step.company_id = version.company_id
            and step.config_version_id = version.id
        ) as step_count,

        (
          select min(step.name)
          from public.company_commercial_method_steps step
          where step.company_id = version.company_id
            and step.config_version_id = version.id
        ) as first_step_name,

        (
          select count(*)::integer
          from public.company_commercial_product_profiles profile
          where profile.company_id = version.company_id
            and profile.config_version_id = version.id
        ) as product_profile_count,

        (
          select count(*)::integer
          from public.company_commercial_facts fact
          where fact.company_id = version.company_id
            and fact.config_version_id = version.id
        ) as fact_count,

        (
          select count(*)::integer
          from public.company_commercial_objection_guides guide
          where guide.company_id = version.company_id
            and guide.config_version_id = version.id
        ) as objection_count

      from public.company_commercial_config_versions version
      where version.company_id = $1
        and version.id = $2
    `,
    [companyId, configVersionId],
  );

  assert.equal(result.rows.length, 1);

  return result.rows[0];
}

test(
  "Fase 3 protege e executa as operações comerciais de forma transacional",
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
      },
    });

    try {
      await db.exec(bootstrapSql);

      await db.exec(
        await readFile(
          commercialConfigMigrationPath,
          "utf8",
        ),
      );

      await db.exec(
        await readFile(
          commercialPoliciesMigrationPath,
          "utf8",
        ),
      );

      await db.exec(
        await readFile(
          commercialAdminMigrationPath,
          "utf8",
        ),
      );

      await becomePostgres(db);

      await db.exec(`
        insert into auth.users (id, email)
        values
          ('${ids.adminA}', 'admin-a@example.test'),
          ('${ids.managerA}', 'manager-a@example.test'),
          ('${ids.memberA}', 'member-a@example.test'),
          ('${ids.inactiveAdminA}', 'inactive-admin-a@example.test'),
          ('${ids.adminB}', 'admin-b@example.test');

        insert into public.profiles (
          id,
          is_active_global
        )
        values
          ('${ids.adminA}', true),
          ('${ids.managerA}', true),
          ('${ids.memberA}', true),
          ('${ids.inactiveAdminA}', false),
          ('${ids.adminB}', true);

        insert into public.companies (
          id,
          name,
          legal_name,
          trade_name
        )
        values
          (
            '${ids.companyA}',
            'Empresa A',
            'Empresa A LTDA',
            'Empresa A'
          ),
          (
            '${ids.companyB}',
            'Empresa B',
            'Empresa B LTDA',
            'Empresa B'
          );

        insert into public.company_memberships (
          company_id,
          user_id,
          role,
          is_active
        )
        values
          (
            '${ids.companyA}',
            '${ids.adminA}',
            'admin',
            true
          ),
          (
            '${ids.companyA}',
            '${ids.managerA}',
            'manager',
            true
          ),
          (
            '${ids.companyA}',
            '${ids.memberA}',
            'member',
            true
          ),
          (
            '${ids.companyA}',
            '${ids.inactiveAdminA}',
            'admin',
            true
          ),
          (
            '${ids.companyB}',
            '${ids.adminB}',
            'admin',
            true
          );

        insert into public.products (
          id,
          company_id,
          name
        )
        values
          (
            '${ids.productA}',
            '${ids.companyA}',
            'Produto A'
          ),
          (
            '${ids.productB}',
            '${ids.companyB}',
            'Produto B'
          );
      `);

      const functions = await db.query(`
        select p.proname as name
        from pg_proc p
        join pg_namespace n
          on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any(array[
            'rpc_save_company_commercial_config_draft',
            'rpc_clone_company_commercial_config',
            'rpc_publish_company_commercial_config',
            'rpc_delete_company_commercial_config_draft'
          ])
        order by p.proname
      `);

      assert.deepEqual(
        functions.rows.map((row) => row.name),
        [
          "rpc_clone_company_commercial_config",
          "rpc_delete_company_commercial_config_draft",
          "rpc_publish_company_commercial_config",
          "rpc_save_company_commercial_config_draft",
        ],
      );

      const privileges = await db.query(`
        select
          has_function_privilege(
            'anon',
            'public.rpc_save_company_commercial_config_draft(uuid, uuid, jsonb)',
            'EXECUTE'
          ) as anon_can_save,

          has_function_privilege(
            'authenticated',
            'public.rpc_save_company_commercial_config_draft(uuid, uuid, jsonb)',
            'EXECUTE'
          ) as authenticated_can_save,

          has_function_privilege(
            'anon',
            'public.rpc_publish_company_commercial_config(uuid, uuid)',
            'EXECUTE'
          ) as anon_can_publish,

          has_function_privilege(
            'authenticated',
            'public.rpc_publish_company_commercial_config(uuid, uuid)',
            'EXECUTE'
          ) as authenticated_can_publish
      `);

      assert.deepEqual(privileges.rows, [
        {
          anon_can_save: false,
          authenticated_can_save: true,
          anon_can_publish: false,
          authenticated_can_publish: true,
        },
      ]);

      const incompletePayload =
        createIncompletePayload(ids.productA);

      await become(db, ids.managerA);

      await assert.rejects(
        saveDraft(
          db,
          ids.companyA,
          null,
          incompletePayload,
        ),
        /Apenas um administrador ativo da empresa/i,
      );

      await become(db, ids.memberA);

      await assert.rejects(
        saveDraft(
          db,
          ids.companyA,
          null,
          incompletePayload,
        ),
        /Apenas um administrador ativo da empresa/i,
      );

      await become(db, ids.inactiveAdminA);

      await assert.rejects(
        saveDraft(
          db,
          ids.companyA,
          null,
          incompletePayload,
        ),
        /Usuário globalmente inativo/i,
      );

      await become(db, ids.adminA);

      await assert.rejects(
        saveDraft(
          db,
          ids.companyB,
          null,
          createIncompletePayload(ids.productB),
        ),
        /Apenas um administrador ativo da empresa/i,
      );

      const incompleteSave = await saveDraft(
        db,
        ids.companyA,
        null,
        incompletePayload,
      );

      assert.equal(incompleteSave.rows.length, 1);
      assert.equal(incompleteSave.rows[0].company_id, ids.companyA);
      assert.equal(incompleteSave.rows[0].version_number, 1);
      assert.equal(incompleteSave.rows[0].status, "draft");

      const configVersionId =
        incompleteSave.rows[0].config_version_id;

      await assert.rejects(
        publishDraft(
          db,
          ids.companyA,
          configVersionId,
        ),
        /critério de conclusão/i,
      );

      const statusAfterFailedPublish = await db.query(
        `
          select status
          from public.company_commercial_config_versions
          where company_id = $1
            and id = $2
        `,
        [ids.companyA, configVersionId],
      );

      assert.deepEqual(statusAfterFailedPublish.rows, [
        {
          status: "draft",
        },
      ]);

      const completePayload =
        createCompletePayload(ids.productA);

      const completeSave = await saveDraft(
        db,
        ids.companyA,
        configVersionId,
        completePayload,
      );

      assert.equal(completeSave.rows.length, 1);
      assert.equal(completeSave.rows[0].status, "draft");

      const snapshotBeforeFailure =
        await readDraftSnapshot(
          db,
          ids.companyA,
          configVersionId,
        );

      assert.deepEqual(snapshotBeforeFailure, {
        business_description:
          completePayload.business_description,
        step_count: 1,
        first_step_name: "Diagnóstico",
        product_profile_count: 1,
        fact_count: 1,
        objection_count: 1,
      });

      const invalidCrossCompanyPayload = {
        ...completePayload,
        business_description:
          "Este conteúdo não pode permanecer",
        product_profiles: [
          {
            ...completePayload.product_profiles[0],
            product_id: ids.productB,
          },
        ],
      };

      await assert.rejects(
        saveDraft(
          db,
          ids.companyA,
          configVersionId,
          invalidCrossCompanyPayload,
        ),
        /company_commercial_product_profiles_product_fkey|foreign key/i,
      );

      const snapshotAfterFailure =
        await readDraftSnapshot(
          db,
          ids.companyA,
          configVersionId,
        );

      assert.deepEqual(
        snapshotAfterFailure,
        snapshotBeforeFailure,
      );

      const publication = await publishDraft(
        db,
        ids.companyA,
        configVersionId,
      );

      assert.equal(publication.rows.length, 1);
      assert.equal(publication.rows[0].status, "published");
      assert.equal(publication.rows[0].version_number, 1);
      assert.ok(publication.rows[0].published_at);

      await assert.rejects(
        db.query(
          `
            update public.company_commercial_config_versions
            set business_description =
              'Tentativa de alterar conteúdo publicado'
            where company_id = $1
              and id = $2
          `,
          [ids.companyA, configVersionId],
        ),
        /Versão publicada só pode avançar para arquivada|Conteúdo publicado é imutável/i,
      );

      await assert.rejects(
        saveDraft(
          db,
          ids.companyA,
          configVersionId,
          completePayload,
        ),
        /Rascunho não encontrado/i,
      );

      const cloned = await cloneConfig(
        db,
        ids.companyA,
        configVersionId,
      );

      assert.equal(cloned.rows.length, 1);
      assert.equal(cloned.rows[0].status, "draft");
      assert.equal(cloned.rows[0].version_number, 2);

      const clonedConfigVersionId =
        cloned.rows[0].config_version_id;

      const clonedSnapshot = await readDraftSnapshot(
        db,
        ids.companyA,
        clonedConfigVersionId,
      );

      assert.deepEqual(
        clonedSnapshot,
        snapshotBeforeFailure,
      );

      const deleted = await deleteDraft(
        db,
        ids.companyA,
        clonedConfigVersionId,
      );

      assert.deepEqual(deleted.rows, [
        {
          company_id: ids.companyA,
          config_version_id: clonedConfigVersionId,
          deleted: true,
        },
      ]);

      const remainingDrafts = await db.query(
        `
          select count(*)::integer as total
          from public.company_commercial_config_versions
          where company_id = $1
            and status = 'draft'
        `,
        [ids.companyA],
      );

      assert.deepEqual(remainingDrafts.rows, [
        {
          total: 0,
        },
      ]);

      await assert.rejects(
        deleteDraft(
          db,
          ids.companyA,
          configVersionId,
        ),
        /não pode mais ser excluído/i,
      );
    } finally {
      await db.close();
    }
  },
);