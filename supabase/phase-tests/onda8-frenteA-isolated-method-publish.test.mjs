import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// ============================================================================
// ONDA 8 / FRENTE A — publicação isolada do método comercial, com a
// correção do Controle Mestre (idempotência dentro da RPC,
// company_commercial_method_builder_drafts como única fonte de verdade,
// detecção de builder desatualizado, primeira publicação bloqueada).
//
// Prova contra RPC real, constraints reais, triggers reais e o
// comportamento real de draft/published/builder — não apenas FakeSupabase
// (ver commercial-method-publish.test.mjs para a cobertura unitária
// completa). Carrega, em ordem, as migrations reais que criam
// company_commercial_config_versions e suas políticas/RPCs, as colunas V2
// de método/produto/fato/objeção, o rascunho do builder assistido, e por
// fim as duas migrations desta frente (isolamento + correção) em cima
// delas, sem alterar nenhum arquivo existente.
// ============================================================================

const migrationPaths = [
  "../migrations/20260731000105_create_company_commercial_config.sql",
  "../migrations/20260731005400_split_company_commercial_write_policies.sql",
  "../migrations/20260731123000_create_company_commercial_admin_operations.sql",
  "../migrations/20260818013000_add_commercial_method_v2_persistence.sql",
  "../migrations/20260818043000_add_commercial_product_v2_persistence.sql",
  "../migrations/20260819012000_add_commercial_fact_v2_persistence.sql",
  "../migrations/20260819052000_add_commercial_objection_v2_persistence.sql",
  "../migrations/20260826032000_create_commercial_method_builder_draft.sql",
  "../migrations/20260826043000_add_assisted_method_construction.sql",
  "../migrations/20260827010000_add_isolated_method_publish.sql",
  "../migrations/20260827020000_fix_isolated_method_publish_review_ready_source.sql",
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

function buildMethod(name, stageNames) {
  return {
    contract_version: "commercial-method-v2",
    name,
    description: `Descrição do ${name}, construída na jornada guiada.`,
    principles: ["Avançar somente com evidência confirmada pelo comprador."],
    stages: stageNames.map((stageName, index) => ({
      key: stageName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z]+/g, "_"),
      display_order: index + 1,
      name: stageName,
      objective: `Objetivo confirmado da etapa ${stageName}.`,
      requirement: "required",
      completion_criteria: [
        `O comprador confirmou o resultado necessário em ${stageName}.`,
      ],
      partial_completion_criteria: [],
      skip_conditions: [],
      recommended_questions: [],
      common_mistakes: [],
      deepen_when: [],
      sufficient_when: [
        `A informação confirmada já é suficiente em ${stageName}.`,
      ],
      advance_when: [`O comprador confirmou avanço em ${stageName}.`],
      wait_when: [],
      stop_asking_when: [
        `Novas perguntas não alterariam a decisão em ${stageName}.`,
      ],
      dimensions: [],
    })),
  };
}

function buildMethodAvancar() {
  return buildMethod("Método AVANÇAR", [
    "Descoberta",
    "Tour",
    "Apresentação",
    "Decisão de compra",
    "Follow-up",
  ]);
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

// Não existe RPC dedicada para company_commercial_method_builder_drafts —
// a aplicação real escreve essa tabela diretamente (ver auditoria da
// Frente 1). Este helper simula exatamente isso: grava (ou atualiza) o
// rascunho do builder como review_ready, com a definição do método já
// materializada — a única forma real de chegar a esse estado.
async function seedReviewReadyBuilder(db, companyId, userId, methodDefinition) {
  const existing = await db.query(
    `select id from public.company_commercial_method_builder_drafts where company_id = $1::uuid`,
    [companyId],
  );

  if (existing.rows.length > 0) {
    const result = await db.query(
      `
        update public.company_commercial_method_builder_drafts
        set method_construction_status = 'review_ready',
            method_construction = '{}'::jsonb,
            method_definition = $2::jsonb,
            ready_for_method = true,
            method_started_at = coalesce(method_started_at, now()),
            method_updated_at = now()
        where company_id = $1::uuid
        returning method_updated_at
      `,
      [companyId, JSON.stringify(methodDefinition)],
    );
    return result.rows[0].method_updated_at;
  }

  const result = await db.query(
    `
      insert into public.company_commercial_method_builder_drafts (
        company_id,
        ready_for_method,
        current_step,
        completed_steps,
        draft_data,
        method_construction_status,
        method_construction,
        method_definition,
        method_started_at,
        method_updated_at,
        created_by
      )
      values (
        $1::uuid,
        true,
        4,
        array[1, 2, 3]::smallint[],
        '{}'::jsonb,
        'review_ready',
        '{}'::jsonb,
        $2::jsonb,
        now(),
        now(),
        $3::uuid
      )
      returning method_updated_at
    `,
    [companyId, JSON.stringify(methodDefinition), userId],
  );
  return result.rows[0].method_updated_at;
}

// Simula "outra aba" alterando o builder entre o carregamento da UI e o
// clique em publicar.
async function touchBuilderUpdatedAt(db, companyId) {
  const result = await db.query(
    `
      update public.company_commercial_method_builder_drafts
      set method_updated_at = method_updated_at + interval '1 second'
      where company_id = $1::uuid
      returning method_updated_at
    `,
    [companyId],
  );
  return result.rows[0].method_updated_at;
}

async function publishBuilderMethod(db, companyId, expectedMethodUpdatedAt) {
  return db.query(
    `
      select *
      from public.rpc_publish_builder_commercial_method(
        $1::uuid,
        $2::timestamptz
      )
    `,
    [companyId, expectedMethodUpdatedAt],
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

async function readMethodSteps(db, companyId, configVersionId) {
  const result = await db.query(
    `
      select name
      from public.company_commercial_method_steps
      where company_id = $1::uuid
        and config_version_id = $2::uuid
      order by step_order asc
    `,
    [companyId, configVersionId],
  );
  return result.rows.map((row) => row.name);
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

// Publica a versão 1 (estado PUBLICADO atual) usando o editor avançado
// existente — não relacionado ao builder/à jornada guiada.
async function publishBaseConfig(db, companyId, overrides = {}) {
  await become(db, ids.adminA);
  const draft = await saveDraft(
    db,
    companyId,
    null,
    basePayload({
      methodName: "Método legado",
      businessDescription: "PUBLICADO",
      productBenefit: "Benefício PUBLICADO",
      ...overrides,
    }),
  );
  await publishDraft(db, companyId, draft.rows[0].config_version_id);
  return draft.rows[0].config_version_id;
}

test(
  "publicação isolada real: rascunho comercial paralelo com produto, fato, objeção e tom divergentes permanece intacto e não é publicado",
  async () => {
    const db = await bootstrap();

    try {
      const publishedId = await publishBaseConfig(db, ids.companyA);

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

      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );

      const published = await publishBuilderMethod(
        db,
        ids.companyA,
        methodUpdatedAt,
      );

      assert.equal(published.rows[0].status, "published");
      assert.equal(published.rows[0].already_published, false);

      const versions = await readVersions(db, ids.companyA);

      const newPublished = versions.find(
        (version) => version.status === "published",
      );
      const stillDraft = versions.find(
        (version) => version.id === parallelDraftId,
      );
      const archived = versions.find((version) => version.id === publishedId);

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

      const stageNames = ["Descoberta", "Tour", "Apresentação", "Decisão de compra", "Follow-up"];
      assert.deepEqual(
        newPublished.commercial_method_definition.stages.map((stage) => stage.name),
        stageNames,
      );

      // Projeção de compatibilidade: method_steps vem do método NOVO
      // (AVANÇAR), nunca do "Diagnóstico" do método legado anterior.
      assert.deepEqual(
        await readMethodSteps(db, ids.companyA, newPublished.id),
        stageNames,
      );

      const benefits = await readProductBenefits(db, ids.companyA, newPublished.id);
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
      await publishBaseConfig(db, ids.companyA);

      const versionsBefore = await readVersions(db, ids.companyA);

      const broken = { ...buildMethodAvancar(), stages: [] };
      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        broken,
      );

      await assert.rejects(
        publishBuilderMethod(db, ids.companyA, methodUpdatedAt),
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
  "B: retry depois do commit retorna a versão publicada existente — idempotência real dentro do advisory lock, não deixa versão redundante",
  async () => {
    const db = await bootstrap();

    try {
      await publishBaseConfig(db, ids.companyA);
      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );

      const first = await publishBuilderMethod(db, ids.companyA, methodUpdatedAt);
      const second = await publishBuilderMethod(db, ids.companyA, methodUpdatedAt);

      assert.equal(first.rows[0].already_published, false);
      assert.equal(second.rows[0].already_published, true);
      assert.equal(first.rows[0].config_version_id, second.rows[0].config_version_id);
      assert.equal(first.rows[0].version_number, second.rows[0].version_number);

      const versions = await readVersions(db, ids.companyA);
      const published = versions.filter((version) => version.status === "published");
      const archived = versions.filter((version) => version.status === "archived");
      assert.equal(published.length, 1);
      assert.equal(archived.length, 1);
    } finally {
      await db.close();
    }
  },
);

test(
  "A: duas publicações disparadas ao mesmo tempo (mesmo método, mesma empresa) resultam em uma única versão nova publicada",
  async () => {
    // Limitação conhecida: PGlite executa contra um único mecanismo
    // Postgres embarcado em processo único — mesmo disparando as duas
    // chamadas sem aguardar sequencialmente (Promise.all), a execução SQL
    // em si é serializada pelo motor, não há duas conexões concorrentes
    // reais disputando o advisory lock como aconteceria com duas conexões
    // de rede distintas contra um Postgres real. Ainda assim, este teste
    // prova a propriedade que importa: depois de qualquer serialização —
    // real ou simulada — a lógica da RPC é deterministicamente idempotente:
    // exatamente uma versão nova é publicada, a segunda chamada retorna
    // already_published=true, e a versão anterior é arquivada uma única
    // vez. A prova de baixo nível do lock (índice único
    // company_commercial_config_one_method_publish_draft_uidx) está no
    // teste de "proteção real de concorrência" abaixo.
    const db = await bootstrap();

    try {
      await publishBaseConfig(db, ids.companyA);
      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );

      const [resultA, resultB] = await Promise.all([
        publishBuilderMethod(db, ids.companyA, methodUpdatedAt),
        publishBuilderMethod(db, ids.companyA, methodUpdatedAt),
      ]);

      const outcomes = [resultA.rows[0], resultB.rows[0]];
      const newlyPublished = outcomes.filter((row) => row.already_published === false);
      const idempotent = outcomes.filter((row) => row.already_published === true);

      assert.equal(newlyPublished.length, 1);
      assert.equal(idempotent.length, 1);
      assert.equal(newlyPublished[0].config_version_id, idempotent[0].config_version_id);

      const versions = await readVersions(db, ids.companyA);
      const published = versions.filter((version) => version.status === "published");
      const archived = versions.filter((version) => version.status === "archived");
      assert.equal(published.length, 1);
      assert.equal(archived.length, 1);
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
      await publishBaseConfig(db, ids.companyA);

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
  "C: RPC bloqueia quando o builder não está review_ready",
  async () => {
    const db = await bootstrap();

    try {
      await publishBaseConfig(db, ids.companyA);
      await become(db, ids.adminA);

      // Builder em 'editing', sem method_definition — nunca chegou a
      // review_ready.
      await db.query(
        `
          insert into public.company_commercial_method_builder_drafts (
            company_id, ready_for_method, current_step, completed_steps, draft_data,
            method_construction_status, method_construction, method_definition,
            created_by
          )
          values (
            $1::uuid, true, 4, array[1, 2, 3]::smallint[], '{}'::jsonb,
            'editing', '{}'::jsonb, null, $2::uuid
          )
        `,
        [ids.companyA, ids.adminA],
      );

      await assert.rejects(
        publishBuilderMethod(db, ids.companyA, new Date().toISOString()),
        (error) => {
          assert.match(String(error.message ?? error), /pronto para revisão final/);
          return true;
        },
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "D: não existe mais caminho para publicar uma definição arbitrária — a RPC não recebe mais json do cliente",
  async () => {
    const db = await bootstrap();

    try {
      await publishBaseConfig(db, ids.companyA);
      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );

      // A assinatura real só aceita (company_id, expected_method_updated_at)
      // — não há parâmetro de definição de método para injetar.
      const result = await publishBuilderMethod(db, ids.companyA, methodUpdatedAt);
      const versions = await readVersions(db, ids.companyA);
      const published = versions.find((version) => version.id === result.rows[0].config_version_id);

      assert.equal(published.commercial_method_definition.name, "Método AVANÇAR");
    } finally {
      await db.close();
    }
  },
);

test(
  "E: builder mudou entre o carregamento da UI e o clique em publicar — bloqueado como stale",
  async () => {
    const db = await bootstrap();

    try {
      await publishBaseConfig(db, ids.companyA);
      const staleMethodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );

      // Outra aba altera o método (ou o reconstrói) — method_updated_at
      // avança no banco depois que a UI já tinha carregado o valor antigo.
      await touchBuilderUpdatedAt(db, ids.companyA);

      await assert.rejects(
        publishBuilderMethod(db, ids.companyA, staleMethodUpdatedAt),
        (error) => {
          assert.match(String(error.message ?? error), /desde que a página foi carregada/);
          return true;
        },
      );

      const versions = await readVersions(db, ids.companyA);
      assert.equal(versions.length, 1);
      assert.equal(versions[0].status, "published");
      assert.equal(versions[0].commercial_method_name, "Método legado");
    } finally {
      await db.close();
    }
  },
);

test(
  "F: primeira publicação sem nenhuma versão publicada anterior é bloqueada, sem inventar contexto comercial",
  async () => {
    const db = await bootstrap();

    try {
      await become(db, ids.adminA);
      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );

      await assert.rejects(
        publishBuilderMethod(db, ids.companyA, methodUpdatedAt),
        (error) => {
          assert.match(
            String(error.message ?? error),
            /Ainda não existe uma configuração comercial publicada/,
          );
          return true;
        },
      );

      const versions = await readVersions(db, ids.companyA);
      assert.equal(versions.length, 0);
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
      await publishBaseConfig(db, ids.companyA);
      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );

      await become(db, ids.memberA);

      await assert.rejects(
        publishBuilderMethod(db, ids.companyA, methodUpdatedAt),
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "I: isolamento multiempresa real: publicar o método da empresa A nunca altera a empresa B",
  async () => {
    const db = await bootstrap();

    try {
      await publishBaseConfig(db, ids.companyA, { methodName: "Método A", businessDescription: "A PUBLICADO", productBenefit: "Benefício A" });

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
      const methodUpdatedAt = await seedReviewReadyBuilder(
        db,
        ids.companyA,
        ids.adminA,
        buildMethodAvancar(),
      );
      await publishBuilderMethod(db, ids.companyA, methodUpdatedAt);

      // Leitura administrativa: adminA não tem RLS de leitura sobre a
      // empresa B, então a comprovação de isolamento é feita como postgres.
      await becomePostgres(db);
      const versionsB = await readVersions(db, ids.companyB);
      const publishedB = versionsB.find((version) => version.status === "published");
      assert.equal(publishedB.commercial_method_name, "Método B");
      assert.equal(versionsB.length, 1);
    } finally {
      await db.close();
    }
  },
);
