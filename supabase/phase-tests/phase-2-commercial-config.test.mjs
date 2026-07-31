import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrationPath = fileURLToPath(
  new URL(
    "../migrations/20260731000105_create_company_commercial_config.sql",
    import.meta.url,
  ),
);

const ids = {
  companyA: "10000000-0000-4000-8000-000000000001",
  companyB: "10000000-0000-4000-8000-000000000002",
  adminA: "20000000-0000-4000-8000-000000000001",
  managerA: "20000000-0000-4000-8000-000000000002",
  memberA: "20000000-0000-4000-8000-000000000003",
  adminB: "20000000-0000-4000-8000-000000000004",
  memberB: "20000000-0000-4000-8000-000000000005",
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

  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.uid() to authenticated, service_role;

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
    category text,
    base_price numeric not null default 0,
    active boolean not null default true,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
  );

  grant select on table public.products to authenticated, service_role;

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

async function assertSqlRejects(db, sql, pattern) {
  await assert.rejects(db.exec(sql), pattern);
}

async function createDraft(db, companyId) {
  const result = await db.query(
    `
      insert into public.company_commercial_config_versions (
        company_id
      )
      values ($1)
      returning id, version_number, status
    `,
    [companyId],
  );

  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

async function completeDraft(db, {
  companyId,
  configId,
  productId,
  suffix,
}) {
  await db.query(
    `
      update public.company_commercial_config_versions
         set business_description = $2,
             target_audience = $3,
             value_proposition = $4,
             commercial_method_name = $5,
             commercial_method_description = $6,
             communication_tone = $7,
             required_behaviors = $8::text[],
             prohibited_behaviors = $9::text[]
       where company_id = $1
         and id = $10
    `,
    [
      companyId,
      `Empresa de treinamento ${suffix}`,
      `Times comerciais ${suffix}`,
      `Execução previsível ${suffix}`,
      `Método diagnóstico ${suffix}`,
      `Descobrir antes de apresentar ${suffix}`,
      "Direto e consultivo",
      ["Responder perguntas do cliente", "Investigar a necessidade"],
      ["Inventar condições", "Pressionar sem diagnóstico"],
      configId,
    ],
  );

  await db.query(
    `
      insert into public.company_commercial_method_steps (
        company_id,
        config_version_id,
        step_order,
        name,
        objective,
        completion_criteria,
        recommended_questions
      )
      values (
        $1,
        $2,
        1,
        'Diagnosticar',
        'Compreender a necessidade comprovada do cliente',
        array['Necessidade registrada'],
        array['O que você quer resolver agora?']
      )
    `,
    [companyId, configId],
  );

  await db.query(
    `
      insert into public.company_commercial_product_profiles (
        company_id,
        config_version_id,
        product_id,
        indicated_audiences,
        needs_addressed,
        benefits,
        verified_differentiators,
        limitations,
        contract_conditions,
        payment_conditions,
        allowed_claims,
        forbidden_claims
      )
      values (
        $1,
        $2,
        $3,
        array['Empresa com time comercial'],
        array['Falta de processo'],
        array['Acompanhamento estruturado'],
        array['Método configurável'],
        array['Depende de uso consistente'],
        array['Conforme contrato vigente'],
        array['Conforme proposta aprovada'],
        array['Apoia a execução comercial'],
        array['Garante resultado sem execução']
      )
    `,
    [companyId, configId, productId],
  );

  await db.query(
    `
      insert into public.company_commercial_facts (
        company_id,
        config_version_id,
        category,
        fact_key,
        fact_value,
        source_note
      )
      values (
        $1,
        $2,
        'operacao',
        'horario_atendimento',
        'Segunda a sexta, das 08h às 18h',
        'Política operacional aprovada'
      )
    `,
    [companyId, configId],
  );

  await db.query(
    `
      insert into public.company_commercial_objection_guides (
        company_id,
        config_version_id,
        sort_order,
        objection,
        signals,
        discovery_questions,
        recommended_approach,
        response_limits
      )
      values (
        $1,
        $2,
        1,
        'Preço',
        array['Está caro'],
        array['Comparado a qual alternativa?'],
        'Entender o critério antes de defender valor',
        array['Não inventar desconto']
      )
    `,
    [companyId, configId],
  );
}

test(
  "Fase 2 cria configuração comercial versionada, imutável e multiempresa",
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
      },
    });

    try {
      await db.exec(bootstrapSql);
      await db.exec(await readFile(migrationPath, "utf8"));

      await becomePostgres(db);
      await db.exec(`
        insert into auth.users (id, email)
        values
          ('${ids.adminA}', 'admin-a@example.test'),
          ('${ids.managerA}', 'manager-a@example.test'),
          ('${ids.memberA}', 'member-a@example.test'),
          ('${ids.adminB}', 'admin-b@example.test'),
          ('${ids.memberB}', 'member-b@example.test');

        insert into public.companies (id, name, legal_name, trade_name)
        values
          ('${ids.companyA}', 'Empresa A', 'Empresa A LTDA', 'Empresa A'),
          ('${ids.companyB}', 'Empresa B', 'Empresa B LTDA', 'Empresa B');

        insert into public.company_memberships (
          company_id,
          user_id,
          role
        )
        values
          ('${ids.companyA}', '${ids.adminA}', 'admin'),
          ('${ids.companyA}', '${ids.managerA}', 'manager'),
          ('${ids.companyA}', '${ids.memberA}', 'member'),
          ('${ids.companyB}', '${ids.adminB}', 'admin'),
          ('${ids.companyB}', '${ids.memberB}', 'member');

        insert into public.products (id, company_id, name)
        values
          ('${ids.productA}', '${ids.companyA}', 'Produto A'),
          ('${ids.productB}', '${ids.companyB}', 'Produto B');
      `);

      const security = await db.query(`
        select
          c.relname as table_name,
          c.relrowsecurity as rls_enabled,
          c.relforcerowsecurity as rls_forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = any(array[
            'company_commercial_config_versions',
            'company_commercial_method_steps',
            'company_commercial_product_profiles',
            'company_commercial_facts',
            'company_commercial_objection_guides'
          ])
        order by c.relname
      `);

      assert.equal(security.rows.length, 5);
      assert.ok(
        security.rows.every(
          (row) => row.rls_enabled === true && row.rls_forced === true,
        ),
      );

      const grants = await db.query(`
        select
          c.relname as table_name,
          r.rolname as grantee,
          x.privilege_type
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) x
        join pg_roles r on r.oid = x.grantee
        where n.nspname = 'public'
          and c.relname like 'company_commercial_%'
          and r.rolname in ('anon', 'authenticated', 'service_role')
        order by c.relname, r.rolname, x.privilege_type
      `);

      assert.equal(
        grants.rows.filter((row) => row.grantee === "anon").length,
        0,
      );
      assert.equal(
        grants.rows.filter((row) => row.grantee === "authenticated").length,
        20,
      );
      assert.equal(
        grants.rows.filter((row) => row.grantee === "service_role").length,
        20,
      );

      const policies = await db.query(`
        select p.polname as name
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname like 'company_commercial_%'
        order by p.polname
      `);
      assert.equal(policies.rows.length, 12);

      const triggerFunctions = await db.query(`
        select
          p.proname as name,
          p.prosecdef as security_definer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname in (
            'guard_company_commercial_config_version',
            'guard_company_commercial_config_child',
            'has_company_commercial_access'
          )
        order by p.proname
      `);
      assert.deepEqual(triggerFunctions.rows, [
        {
          name: "guard_company_commercial_config_child",
          security_definer: false,
        },
        {
          name: "guard_company_commercial_config_version",
          security_definer: false,
        },
        {
          name: "has_company_commercial_access",
          security_definer: true,
        },
      ]);

      const callableTriggerFunctions = await db.query(`
        select
          p.proname as name,
          coalesce(r.rolname, 'public') as grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(
          coalesce(p.proacl, acldefault('f', p.proowner))
        ) x
        left join pg_roles r on r.oid = x.grantee
        where n.nspname = 'private'
          and p.proname in (
            'guard_company_commercial_config_version',
            'guard_company_commercial_config_child'
          )
          and (
            x.grantee = 0
            or r.rolname in ('anon', 'authenticated', 'service_role')
          )
      `);
      assert.deepEqual(callableTriggerFunctions.rows, []);

      const accessHelperPrivileges = await db.query(`
        select
          has_function_privilege(
            'authenticated',
            'private.has_company_commercial_access(uuid, text[])',
            'EXECUTE'
          ) as authenticated_execute,
          has_function_privilege(
            'anon',
            'private.has_company_commercial_access(uuid, text[])',
            'EXECUTE'
          ) as anon_execute,
          has_schema_privilege(
            'authenticated',
            'private',
            'USAGE'
          ) as authenticated_schema_usage
      `);
      assert.deepEqual(accessHelperPrivileges.rows, [
        {
          authenticated_execute: true,
          anon_execute: false,
          authenticated_schema_usage: false,
        },
      ]);

      const requiredIndexes = await db.query(`
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and indexname = any(array[
            'company_commercial_config_one_draft_uidx',
            'company_commercial_config_one_published_uidx',
            'company_commercial_config_created_by_idx',
            'company_commercial_config_published_by_idx',
            'company_commercial_config_archived_by_idx',
            'company_commercial_method_steps_config_order_idx',
            'company_commercial_product_profiles_config_idx',
            'company_commercial_product_profiles_product_idx',
            'company_commercial_facts_config_idx',
            'company_commercial_objection_guides_config_order_idx'
          ])
        order by indexname
      `);
      assert.equal(requiredIndexes.rows.length, 10);

      await become(db, ids.memberA);
      await assertSqlRejects(
        db,
        `
          select private.has_company_commercial_access(
            '${ids.companyA}',
            null
          )
        `,
        /permission denied for schema private/i,
      );
      await assertSqlRejects(
        db,
        `
          insert into public.company_commercial_config_versions (
            company_id
          )
          values ('${ids.companyA}')
        `,
        /row-level security/i,
      );

      await become(db, ids.managerA);
      await assertSqlRejects(
        db,
        `
          insert into public.company_commercial_config_versions (
            company_id
          )
          values ('${ids.companyA}')
        `,
        /row-level security/i,
      );

      await become(db, ids.adminA);
      const versionA1 = await createDraft(db, ids.companyA);
      assert.equal(versionA1.version_number, 1);
      assert.equal(versionA1.status, "draft");

      await assertSqlRejects(
        db,
        `
          insert into public.company_commercial_config_versions (
            company_id
          )
          values ('${ids.companyA}')
        `,
        /company_commercial_config_one_draft_uidx/i,
      );

      await become(db, ids.adminB);
      const versionB1 = await createDraft(db, ids.companyB);
      assert.equal(versionB1.version_number, 1);

      await become(db, ids.memberA);
      const memberDrafts = await db.query(
        `
          select id
          from public.company_commercial_config_versions
        `,
      );
      assert.deepEqual(memberDrafts.rows, []);

      await become(db, ids.adminA);
      const adminVisibleDrafts = await db.query(
        `
          select company_id
          from public.company_commercial_config_versions
          order by company_id
        `,
      );
      assert.deepEqual(adminVisibleDrafts.rows, [
        { company_id: ids.companyA },
      ]);

      await assertSqlRejects(
        db,
        `
          insert into public.company_commercial_method_steps (
            company_id,
            config_version_id,
            step_order,
            name,
            objective,
            completion_criteria
          )
          values (
            '${ids.companyB}',
            '${versionA1.id}',
            1,
            'Inválida',
            'Cruzar empresa',
            array['Não permitido']
          )
        `,
        /row-level security|foreign key|Itens só podem ser alterados/i,
      );

      await completeDraft(db, {
        companyId: ids.companyA,
        configId: versionA1.id,
        productId: ids.productA,
        suffix: "v1",
      });

      await assertSqlRejects(
        db,
        `
          update public.company_commercial_product_profiles
             set product_id = '${ids.productB}'
           where company_id = '${ids.companyA}'
             and config_version_id = '${versionA1.id}'
        `,
        /company_commercial_product_profiles_product_fkey/i,
      );

      const publishedA1 = await db.query(
        `
          update public.company_commercial_config_versions
             set status = 'published'
           where id = $1
          returning version_number, status, published_by
        `,
        [versionA1.id],
      );
      assert.deepEqual(publishedA1.rows, [
        {
          version_number: 1,
          status: "published",
          published_by: ids.adminA,
        },
      ]);

      await become(db, ids.memberA);
      const publishedForMember = await db.query(`
        select
          v.version_number,
          v.status,
          count(s.id)::integer as method_steps
        from public.company_commercial_config_versions v
        left join public.company_commercial_method_steps s
          on s.company_id = v.company_id
         and s.config_version_id = v.id
        group by v.version_number, v.status
      `);
      assert.deepEqual(publishedForMember.rows, [
        {
          version_number: 1,
          status: "published",
          method_steps: 1,
        },
      ]);

      await become(db, ids.adminB);
      const crossCompanyRead = await db.query(`
        select id
        from public.company_commercial_config_versions
        where company_id = '${ids.companyA}'
      `);
      assert.deepEqual(crossCompanyRead.rows, []);

      await become(db, ids.adminA);
      await assertSqlRejects(
        db,
        `
          update public.company_commercial_config_versions
             set value_proposition = 'Conteúdo adulterado'
           where id = '${versionA1.id}'
        `,
        /Versão publicada só pode avançar para arquivada/i,
      );
      await assertSqlRejects(
        db,
        `
          delete from public.company_commercial_config_versions
           where id = '${versionA1.id}'
        `,
        /imutáveis/i,
      );

      await become(db, ids.adminA, "service_role");
      await assertSqlRejects(
        db,
        `
          update public.company_commercial_method_steps
             set objective = 'Conteúdo adulterado'
           where config_version_id = '${versionA1.id}'
        `,
        /Itens só podem ser alterados em uma versão rascunho/i,
      );

      await become(db, ids.adminA);
      const versionA2 = await createDraft(db, ids.companyA);
      assert.equal(versionA2.version_number, 2);

      await completeDraft(db, {
        companyId: ids.companyA,
        configId: versionA2.id,
        productId: ids.productA,
        suffix: "v2",
      });

      await db.query(
        `
          update public.company_commercial_config_versions
             set status = 'published'
           where id = $1
        `,
        [versionA2.id],
      );

      const versionsAfterPromotion = await db.query(
        `
          select version_number, status
          from public.company_commercial_config_versions
          where company_id = $1
          order by version_number
        `,
        [ids.companyA],
      );
      assert.deepEqual(versionsAfterPromotion.rows, [
        { version_number: 1, status: "archived" },
        { version_number: 2, status: "published" },
      ]);

      await assertSqlRejects(
        db,
        `
          update public.company_commercial_config_versions
             set status = 'published'
           where company_id = '${ids.companyA}'
             and version_number = 1
        `,
        /Versões arquivadas são imutáveis/i,
      );

      await become(db, ids.memberA);
      const currentPublishedOnly = await db.query(`
        select version_number, status
        from public.company_commercial_config_versions
        order by version_number
      `);
      assert.deepEqual(currentPublishedOnly.rows, [
        { version_number: 2, status: "published" },
      ]);

      await become(db, ids.adminB);
      await assertSqlRejects(
        db,
        `
          update public.company_commercial_config_versions
             set status = 'published'
           where id = '${versionB1.id}'
        `,
        /Contexto, método e tom são obrigatórios/i,
      );

      await db.query(
        `
          update public.company_commercial_config_versions
             set business_description = 'Empresa B',
                 target_audience = 'Público B',
                 value_proposition = 'Valor B',
                 commercial_method_name = 'Método B',
                 commercial_method_description = 'Descrição B',
                 communication_tone = 'Consultivo',
                 required_behaviors = array['Diagnosticar'],
                 prohibited_behaviors = array['Inventar']
           where id = $1
        `,
        [versionB1.id],
      );

      await db.query(
        `
          insert into public.company_commercial_method_steps (
            company_id,
            config_version_id,
            step_order,
            name,
            objective,
            completion_criteria
          )
          values (
            $1,
            $2,
            1,
            'Diagnosticar',
            'Entender',
            array['Necessidade registrada']
          )
        `,
        [ids.companyB, versionB1.id],
      );

      await assertSqlRejects(
        db,
        `
          update public.company_commercial_config_versions
             set status = 'published'
           where id = '${versionB1.id}'
        `,
        /Todo produto ativo precisa de perfil comercial/i,
      );
    } finally {
      await db.close();
    }
  },
);
