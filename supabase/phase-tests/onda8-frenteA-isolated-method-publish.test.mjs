import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// ============================================================================
// ONDA 8 / FRENTE A — publicação isolada do método comercial.
//
// Prova contra RPC real, constraints reais, triggers reais e o
// comportamento real de draft/published — não apenas FakeSupabase (ver
// commercial-method-publish.test.mjs para a cobertura unitária completa
// dos 12 testes obrigatórios). Este arquivo carrega, em ordem, as
// migrations reais que criam company_commercial_config_versions, suas
// políticas, as RPCs administrativas, as colunas V2 de método/produto/
// fato/objeção, e por fim 20260827010000_add_isolated_method_publish.sql
// (rpc_publish_builder_commercial_method) em cima delas, sem alterar
// nenhum arquivo existente.
// ============================================================================

const migrationPaths = [
  "../migrations/20260731000105_create_company_commercial_config.sql",
  "../migrations/20260731005400_split_company_commercial_write_policies.sql",
  "../migrations/20260731123000_create_company_commercial_admin_operations.sql",
  "../migrations/20260818013000_add_commercial_method_v2_persistence.sql",
  "../migrations/20260818043000_add_commercial_product_v2_persistence.sql",
  "../migrations/20260819012000_add_commercial_fact_v2_persistence.sql",
  "../migrations/20260819052000_add_commercial_objection_v2_persistence.sql",
  "../migrations/20260827010000_add_isolated_method_publish.sql",
].map((relative) => fileURLToPath(new URL(relative, import.meta.url)));

const ids = {
  companyA: "10000000-0000-4000-8000-000000000001",
  companyB: "10000000-0000-4000-8000-000000000002",
  adminA: "20000000-0000-4000-8000-000000000001",
  memberA: "20000000-0000-4000-8000-000000000002",
  adminB: "20000000-0000-4000-8000-000000000003",
  productA: "30000000-0000-4000-8000-000000000001",
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
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

function basePayload({ methodName, businessDescription, productBenefit }) {
  return {
    business_description: businessDescription,
    target_audience: "Empresas com equipes comerciais",
    value_proposition: "Acompanhamento da execução comercial",
    commercial_method_name: methodName,
    commercial_method_description: "Descrição do método legado.",
    communication_tone: `Tom: ${businessDescription}`,
    required_behaviors: [`Comportamento obrigatório: ${businessDescription}`],
    prohibited_behaviors: [`Comportamento proibido: ${businessDescription}`],
    method_steps: [
      {
        step_order: 1,
        name: "Diagnóstico",
        objective: "Compreender a necessidade real do cliente",
        completion_criteria: ["Necessidade identificada"],
        recommended_questions: ["O que você precisa resolver?"],
        is_required: true,
      },
    ],
    product_profiles: [
      {
        product_id: ids.productA,
        indicated_audiences: ["Empresas com equipes comerciais"],
        needs_addressed: ["Falta de processo comercial"],
        benefits: [productBenefit],
        verified_differentiators: ["Método comercial configurável"],
        limitations: ["Depende da execução da equipe"],
        contract_conditions: ["Conforme contrato vigente"],
        payment_conditions: ["Conforme proposta aprovada"],
        allowed_claims: ["Apoia o acompanhamento comercial"],
        forbidden_claims: ["Garante resultado sem execução"],
      },
    ],
    facts: [
      {
        category: "operacao",
        fact_key: "horario_atendimento",
        fact_value: `Fato: ${businessDescription}`,
        source_note: "Política operacional",
        is_active: true,
      },
    ],
    objection_guides: [
      {
        sort_order: 1,
        objection: `Objeção: ${businessDescription}`,
        signals: ["Está caro"],
        discovery_questions: ["Comparado a qual alternativa?"],
        recommended_approach: `Abordagem: ${businessDescription}`,
        response_limits: ["Não inventar desconto"],
        is_active: true,
      },
    ],
  };
}

function buildMethodAvancar() {
  const stageNames = [
    "Descoberta",
    "Tour",
    "Apresentação",
    "Decisão de compra",
    "Follow-up",
  ];

  return {
    contract_version: "commercial-method-v2",
    name: "Método AVANÇAR",
    description:
      "Método reconstruído pela jornada guiada, com cinco etapas explícitas.",
    principles: ["Avançar somente com evidência confirmada pelo comprador."],
    stages: stageNames.map((name, index) => ({
      key: name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z]+/g, "_"),
      display_order: index + 1,
      name,
      objective: `Objetivo confirmado da etapa ${name}.`,
      requirement: "required",
      completion_criteria: [
        `O comprador confirmou o resultado necessário em ${name}.`,
      ],
      partial_completion_criteria: [],
      skip_conditions: [],
      recommended_questions: [],
      common_mistakes: [],
      deepen_when: [],
      sufficient_when: [`A informação confirmada já é suficiente em ${name}.`],
      advance_when: [`O comprador confirmou avanço em ${name}.`],
      wait_when: [],
      stop_asking_when: [
        `Novas perguntas não alterariam a decisão em ${name}.`,
      ],
      dimensions: [],
    })),
  };
}

async function saveDraft(db, companyId, configVersionId, payload) {
  return db.query(
    `
      select *
      from public.rpc_save_company_commercial_config_draft(
        $1::uuid,
        $2::uuid,
        $3::jsonb
      )
    `,
    [companyId, configVersionId, JSON.stringify(payload)],
  );
}

async function publishDraft(db, companyId, configVersionId) {
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

async function publishBuilderMethod(db, companyId, methodDefinition) {
  return db.query(
    `
      select *
      from public.rpc_publish_builder_commercial_method(
        $1::uuid,
        $2::jsonb
      )
    `,
    [companyId, JSON.stringify(methodDefinition)],
  );
}

async function readVersions(db, companyId) {
  const result = await db.query(
    `
      select
        id,
        status,
        draft_purpose,
        version_number,
        business_description,
        communication_tone,
        commercial_method_name,
        commercial_method_contract_version,
        commercial_method_definition
      from public.company_commercial_config_versions
      where company_id = $1::uuid
      order by version_number asc
    `,
    [companyId],
  );
  return result.rows;
}

async function readProductBenefits(db, companyId, configVersionId) {
  const result = await db.query(
    `
      select benefits
      from public.company_commercial_product_profiles
      where company_id = $1::uuid
        and config_version_id = $2::uuid
    `,
    [companyId, configVersionId],
  );
  return result.rows.map((row) => row.benefits);
}

async function bootstrap() {
  const db = new PGlite({ extensions: { pgcrypto } });

  await db.exec(bootstrapSql);

  for (const migrationPath of migrationPaths) {
    await db.exec(await readFile(migrationPath, "utf8"));
  }

  await becomePostgres(db);

  await db.exec(`
    insert into auth.users (id, email)
    values
      ('${ids.adminA}', 'admin-a@example.test'),
      ('${ids.memberA}', 'member-a@example.test'),
      ('${ids.adminB}', 'admin-b@example.test');

    insert into public.profiles (id, is_active_global)
    values
      ('${ids.adminA}', true),
      ('${ids.memberA}', true),
      ('${ids.adminB}', true);

    insert into public.companies (id, name, legal_name, trade_name)
    values
      ('${ids.companyA}', 'Empresa A', 'Empresa A LTDA', 'Empresa A'),
      ('${ids.companyB}', 'Empresa B', 'Empresa B LTDA', 'Empresa B');

    insert into public.company_memberships (company_id, user_id, role, is_active)
    values
      ('${ids.companyA}', '${ids.adminA}', 'admin', true),
      ('${ids.companyA}', '${ids.memberA}', 'member', true),
      ('${ids.companyB}', '${ids.adminB}', 'admin', true);

    insert into public.products (id, company_id, name)
    values
      ('${ids.productA}', '${ids.companyA}', 'Produto A');
  `);

  return db;
}

test(
  "publicação isolada real: rascunho comercial paralelo com produto, fato, objeção e tom divergentes permanece intacto e não é publicado",
  async () => {
    const db = await bootstrap();

    try {
      await become(db, ids.adminA);

      // Publica a versão 1 (estado PUBLICADO atual).
      const draft1 = await saveDraft(
        db,
        ids.companyA,
        null,
        basePayload({
          methodName: "Método legado",
          businessDescription: "PUBLICADO",
          productBenefit: "Benefício PUBLICADO",
        }),
      );
      await publishDraft(db, ids.companyA, draft1.rows[0].config_version_id);

      // O gestor começa a editar um rascunho comercial paralelo — produto,
      // fato, objeção e tom todos divergentes do que está publicado — e
      // NÃO publica.
      const parallelDraft = await saveDraft(
        db,
        ids.companyA,
        null,
        basePayload({
          methodName: "Método legado",
          businessDescription: "EM EDIÇÃO",
          productBenefit: "Benefício EM EDIÇÃO",
        }),
      );
      const parallelDraftId = parallelDraft.rows[0].config_version_id;

      // Publica o método isoladamente.
      const published = await publishBuilderMethod(
        db,
        ids.companyA,
        buildMethodAvancar(),
      );

      assert.equal(published.rows[0].status, "published");

      const versions = await readVersions(db, ids.companyA);

      const newPublished = versions.find(
        (version) => version.status === "published",
      );
      const stillDraft = versions.find(
        (version) => version.id === parallelDraftId,
      );
      const archived = versions.find(
        (version) => version.id === draft1.rows[0].config_version_id,
      );

      // O rascunho geral paralelo permanece intacto, ainda em draft.
      assert.equal(stillDraft.status, "draft");
      assert.equal(stillDraft.draft_purpose, "general");
      assert.equal(stillDraft.business_description, "EM EDIÇÃO");
      assert.equal(stillDraft.communication_tone, "Tom: EM EDIÇÃO");

      // A nova versão publicada preserva o que estava PUBLICADO, nunca o
      // que está no rascunho paralelo.
      assert.equal(newPublished.business_description, "PUBLICADO");
      assert.equal(newPublished.communication_tone, "Tom: PUBLICADO");
      assert.equal(
        newPublished.commercial_method_contract_version,
        "commercial-method-v2",
      );
      assert.equal(
        newPublished.commercial_method_definition.name,
        "Método AVANÇAR",
      );
      assert.deepEqual(
        newPublished.commercial_method_definition.stages.map(
          (stage) => stage.name,
        ),
        ["Descoberta", "Tour", "Apresentação", "Decisão de compra", "Follow-up"],
      );

      const benefits = await readProductBenefits(
        db,
        ids.companyA,
        newPublished.id,
      );
      assert.deepEqual(benefits, [["Benefício PUBLICADO"]]);

      // A versão publicada anterior foi arquivada, não apagada.
      assert.equal(archived.status, "archived");
    } finally {
      await db.close();
    }
  },
);

test(
  "atomicidade real: método semanticamente inválido não deixa nenhuma versão nova para trás",
  async () => {
    const db = await bootstrap();

    try {
      await become(db, ids.adminA);

      const draft1 = await saveDraft(
        db,
        ids.companyA,
        null,
        basePayload({
          methodName: "Método legado",
          businessDescription: "PUBLICADO",
          productBenefit: "Benefício PUBLICADO",
        }),
      );
      await publishDraft(db, ids.companyA, draft1.rows[0].config_version_id);

      const versionsBefore = await readVersions(db, ids.companyA);

      const broken = { ...buildMethodAvancar(), stages: [] };

      await assert.rejects(
        publishBuilderMethod(db, ids.companyA, broken),
      );

      const versionsAfter = await readVersions(db, ids.companyA);

      assert.equal(versionsAfter.length, versionsBefore.length);
      const stillPublished = versionsAfter.find(
        (version) => version.status === "published",
      );
      assert.equal(stillPublished.commercial_method_name, "Método legado");
    } finally {
      await db.close();
    }
  },
);

test(
  "proteção real de concorrência: o índice único não permite dois rascunhos method_publish simultâneos para a mesma empresa",
  async () => {
    const db = await bootstrap();

    try {
      await become(db, ids.adminA);

      const draft1 = await saveDraft(
        db,
        ids.companyA,
        null,
        basePayload({
          methodName: "Método legado",
          businessDescription: "PUBLICADO",
          productBenefit: "Benefício PUBLICADO",
        }),
      );
      await publishDraft(db, ids.companyA, draft1.rows[0].config_version_id);

      await becomePostgres(db);

      await db.query(
        `
          insert into public.company_commercial_config_versions (
            company_id,
            draft_purpose,
            commercial_method_name,
            commercial_method_description,
            created_by
          )
          values (
            $1::uuid,
            'method_publish',
            'Concorrente 1',
            'Descrição',
            $2::uuid
          )
        `,
        [ids.companyA, ids.adminA],
      );

      await assert.rejects(
        db.query(
          `
            insert into public.company_commercial_config_versions (
              company_id,
              draft_purpose,
              commercial_method_name,
              commercial_method_description,
              created_by
            )
            values (
              $1::uuid,
              'method_publish',
              'Concorrente 2',
              'Descrição',
              $2::uuid
            )
          `,
          [ids.companyA, ids.adminA],
        ),
        (error) => {
          assert.match(
            String(error.message ?? error),
            /company_commercial_config_one_method_publish_draft_uidx/,
          );
          return true;
        },
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "acesso real: membro sem papel admin não consegue publicar o método isoladamente",
  async () => {
    const db = await bootstrap();

    try {
      await become(db, ids.adminA);
      const draft1 = await saveDraft(
        db,
        ids.companyA,
        null,
        basePayload({
          methodName: "Método legado",
          businessDescription: "PUBLICADO",
          productBenefit: "Benefício PUBLICADO",
        }),
      );
      await publishDraft(db, ids.companyA, draft1.rows[0].config_version_id);

      await become(db, ids.memberA);

      await assert.rejects(
        publishBuilderMethod(db, ids.companyA, buildMethodAvancar()),
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "isolamento multiempresa real: publicar o método da empresa A nunca altera a empresa B",
  async () => {
    const db = await bootstrap();

    try {
      await become(db, ids.adminA);
      const draftA = await saveDraft(
        db,
        ids.companyA,
        null,
        basePayload({
          methodName: "Método A",
          businessDescription: "A PUBLICADO",
          productBenefit: "Benefício A",
        }),
      );
      await publishDraft(db, ids.companyA, draftA.rows[0].config_version_id);

      await become(db, ids.adminB);
      const draftB = await saveDraft(
        db,
        ids.companyB,
        null,
        {
          ...basePayload({
            methodName: "Método B",
            businessDescription: "B PUBLICADO",
            productBenefit: "Benefício B",
          }),
          product_profiles: [],
        },
      );
      await publishDraft(db, ids.companyB, draftB.rows[0].config_version_id);

      await become(db, ids.adminA);
      await publishBuilderMethod(db, ids.companyA, buildMethodAvancar());

      // Leitura administrativa: adminA não tem RLS de leitura sobre a
      // empresa B, então a comprovação de isolamento é feita como postgres.
      await becomePostgres(db);
      const versionsB = await readVersions(db, ids.companyB);
      const publishedB = versionsB.find(
        (version) => version.status === "published",
      );
      assert.equal(publishedB.commercial_method_name, "Método B");
      assert.equal(versionsB.length, 1);
    } finally {
      await db.close();
    }
  },
);
