import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrationPath = fileURLToPath(
  new URL(
    '../migrations/20260818013000_add_commercial_method_v2_persistence.sql',
    import.meta.url,
  ),
)

const COMPANY_ID =
  '10000000-0000-4000-8000-000000000001'

const SOURCE_ID =
  '20000000-0000-4000-8000-000000000001'

const bootstrapSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema private;

  create table public.company_commercial_config_versions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    version_number integer not null,
    status text not null default 'draft'
  );

  create or replace function public.rpc_save_company_commercial_config_draft(
    p_company_id uuid,
    p_config_version_id uuid,
    p_payload jsonb
  )
  returns table (
    company_id uuid,
    config_version_id uuid,
    version_number integer,
    status text
  )
  language plpgsql
  as $$
  declare
    v_id uuid;
  begin
    if p_config_version_id is null then
      insert into public.company_commercial_config_versions (
        company_id,
        version_number,
        status
      )
      select
        p_company_id,
        coalesce(max(version.version_number), 0) + 1,
        'draft'
      from public.company_commercial_config_versions version
      where version.company_id = p_company_id
      returning id into v_id;
    else
      v_id := p_config_version_id;
    end if;

    return query
    select
      version.company_id,
      version.id,
      version.version_number,
      version.status
    from public.company_commercial_config_versions version
    where version.company_id = p_company_id
      and version.id = v_id;
  end;
  $$;

  create or replace function public.rpc_clone_company_commercial_config(
    p_company_id uuid,
    p_source_config_version_id uuid
  )
  returns table (
    company_id uuid,
    config_version_id uuid,
    version_number integer,
    status text
  )
  language plpgsql
  as $$
  declare
    v_id uuid;
  begin
    insert into public.company_commercial_config_versions (
      company_id,
      version_number,
      status
    )
    select
      p_company_id,
      coalesce(max(version.version_number), 0) + 1,
      'draft'
    from public.company_commercial_config_versions version
    where version.company_id = p_company_id
    returning id into v_id;

    return query
    select
      version.company_id,
      version.id,
      version.version_number,
      version.status
    from public.company_commercial_config_versions version
    where version.company_id = p_company_id
      and version.id = v_id;
  end;
  $$;
`

function buildMethodDefinition() {
  return {
    contract_version: 'commercial-method-v2',

    name: 'Método ATO',

    description:
      'Acolher, realizar o Tour necessário e Obter o desfecho adequado sem roteiro mecânico.',

    principles: [
      'Responder antes de tentar avançar.',
      'Perguntar somente quando a resposta puder alterar a decisão.',
      'Esperar é uma decisão comercial válida.',
    ],

    stages: [
      {
        key: 'acolher',
        display_order: 1,
        name: 'Acolher',

        objective:
          'Compreender a intenção imediata do cliente.',

        requirement: 'required',

        completion_criteria: [
          'A intenção imediata foi compreendida.',
        ],

        partial_completion_criteria: [],

        skip_conditions: [],

        recommended_questions: [],

        common_mistakes: [
          'Ignorar a pergunta atual do cliente.',
        ],

        deepen_when: [],

        sufficient_when: [
          'Existe contexto suficiente para decidir o que é útil agora.',
        ],

        advance_when: [],

        wait_when: [
          'O cliente assumiu compromisso de retorno.',
        ],

        stop_asking_when: [
          'Novas perguntas não mudariam a decisão comercial.',
        ],

        dimensions: [],
      },
    ],
  }
}

test(
  'A1.1 persiste método V2 sem quebrar versões legadas',
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
      },
    })

    try {
      await db.exec(bootstrapSql)

      await db.query(
        `
          insert into public.company_commercial_config_versions (
            id,
            company_id,
            version_number,
            status
          )
          values (
            $1::uuid,
            $2::uuid,
            1,
            'draft'
          )
        `,
        [
          SOURCE_ID,
          COMPANY_ID,
        ],
      )

      await db.exec(
        await readFile(
          migrationPath,
          'utf8',
        ),
      )

      const legacy = await db.query(
        `
          select
            commercial_method_contract_version,
            commercial_method_definition
          from public.company_commercial_config_versions
          where id = $1::uuid
        `,
        [SOURCE_ID],
      )

      assert.equal(
        legacy.rows[0]
          .commercial_method_contract_version,
        'commercial-method-v1',
      )

      assert.equal(
        legacy.rows[0]
          .commercial_method_definition,
        null,
      )

      const definition =
        buildMethodDefinition()

      await db.query(
        `
          select *
          from public.rpc_save_company_commercial_config_draft_v2(
            $1::uuid,
            $2::uuid,
            $3::jsonb
          )
        `,
        [
          COMPANY_ID,
          SOURCE_ID,
          JSON.stringify({
            commercial_method_definition:
              definition,
          }),
        ],
      )

      const persisted = await db.query(
        `
          select
            commercial_method_contract_version,
            commercial_method_definition ->> 'contract_version'
              as definition_contract
          from public.company_commercial_config_versions
          where id = $1::uuid
        `,
        [SOURCE_ID],
      )

      assert.equal(
        persisted.rows[0]
          .commercial_method_contract_version,
        'commercial-method-v2',
      )

      assert.equal(
        persisted.rows[0]
          .definition_contract,
        'commercial-method-v2',
      )

      await db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [SOURCE_ID],
      )

      await assert.rejects(
        db.query(
          `
            update public.company_commercial_config_versions
            set commercial_method_definition =
              jsonb_set(
                commercial_method_definition,
                '{name}',
                '"Método alterado"'::jsonb
              )
            where id = $1::uuid
          `,
          [SOURCE_ID],
        ),
        /imutável/,
      )

      const cloneResult = await db.query(
        `
          select *
          from public.rpc_clone_company_commercial_config_v2(
            $1::uuid,
            $2::uuid
          )
        `,
        [
          COMPANY_ID,
          SOURCE_ID,
        ],
      )

      const clonedId =
        cloneResult.rows[0]
          .config_version_id

      const cloned = await db.query(
        `
          select
            status,
            commercial_method_contract_version,
            commercial_method_definition ->> 'contract_version'
              as definition_contract
          from public.company_commercial_config_versions
          where id = $1::uuid
        `,
        [clonedId],
      )

      assert.equal(
        cloned.rows[0].status,
        'draft',
      )

      assert.equal(
        cloned.rows[0]
          .commercial_method_contract_version,
        'commercial-method-v2',
      )

      assert.equal(
        cloned.rows[0]
          .definition_contract,
        'commercial-method-v2',
      )

      const invalidDefinition =
        structuredClone(definition)

      invalidDefinition.stages[0]
        .sufficient_when = []

      const invalidDraft = await db.query(
        `
          select *
          from public.rpc_save_company_commercial_config_draft_v2(
            $1::uuid,
            null::uuid,
            $2::jsonb
          )
        `,
        [
          COMPANY_ID,
          JSON.stringify({
            commercial_method_definition:
              invalidDefinition,
          }),
        ],
      )

      const invalidDraftId =
        invalidDraft.rows[0]
          .config_version_id

      await assert.rejects(
        db.query(
          `
            update public.company_commercial_config_versions
            set status = 'published'
            where id = $1::uuid
          `,
          [invalidDraftId],
        ),
        /informação suficiente/,
      )
    } finally {
      await db.close()
    }
  },
)
