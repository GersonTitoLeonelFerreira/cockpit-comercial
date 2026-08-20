import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrationPath =
  fileURLToPath(
    new URL(
      '../migrations/20260819012000_add_commercial_fact_v2_persistence.sql',
      import.meta.url,
    ),
  )

const COMPANY_ID =
  '10000000-0000-4000-8000-000000000001'

const LEGACY_CONFIG_ID =
  '20000000-0000-4000-8000-000000000001'

const PRODUCT_ID =
  '30000000-0000-4000-8000-000000000001'

const bootstrapSql = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema private;

  create table public.products (
    id uuid primary key,
    company_id uuid not null,
    name text not null
  );

  create table public.company_commercial_config_versions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    version_number integer not null,
    status text not null default 'draft'
  );

  create table public.company_commercial_product_profiles (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    config_version_id uuid not null,
    product_id uuid not null,
    commercial_product_contract_version text
      not null
      default 'commercial-product-v1',
    commercial_product_definition jsonb
  );

  create table public.company_commercial_facts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    config_version_id uuid not null,
    category text not null,
    fact_key text not null,
    fact_value text not null,
    source_note text,
    is_active boolean not null default true
  );

  create unique index
    company_commercial_facts_test_unique
  on public.company_commercial_facts (
    config_version_id,
    category,
    fact_key
  );

  create or replace function
  public.rpc_save_company_commercial_config_draft_v4(
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
    v_item jsonb;
  begin
    if p_config_version_id is null then
      insert into
        public.company_commercial_config_versions (
          company_id,
          version_number,
          status
        )
      select
        p_company_id,
        coalesce(
          max(version.version_number),
          0
        ) + 1,
        'draft'
      from public.company_commercial_config_versions version
      where version.company_id =
        p_company_id
      returning id
      into v_id;
    else
      v_id :=
        p_config_version_id;
    end if;

    delete from public.company_commercial_facts fact
    where fact.company_id =
      p_company_id
      and fact.config_version_id =
        v_id;

    for v_item in
      select item.value
      from jsonb_array_elements(
        coalesce(
          p_payload -> 'facts',
          '[]'::jsonb
        )
      ) as item(value)
    loop
      insert into public.company_commercial_facts (
        company_id,
        config_version_id,
        category,
        fact_key,
        fact_value,
        source_note,
        is_active
      )
      values (
        p_company_id,
        v_id,
        btrim(v_item ->> 'category'),
        btrim(v_item ->> 'fact_key'),
        btrim(v_item ->> 'fact_value'),
        nullif(
          btrim(
            coalesce(
              v_item ->> 'source_note',
              ''
            )
          ),
          ''
        ),
        coalesce(
          nullif(
            v_item ->> 'is_active',
            ''
          )::boolean,
          true
        )
      );
    end loop;

    return query
    select
      version.company_id,
      version.id,
      version.version_number,
      version.status
    from public.company_commercial_config_versions version
    where version.id =
      v_id;
  end;
  $$;

  create or replace function
  public.rpc_clone_company_commercial_config_v4(
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
    insert into
      public.company_commercial_config_versions (
        company_id,
        version_number,
        status
      )
    select
      p_company_id,
      coalesce(
        max(version.version_number),
        0
      ) + 1,
      'draft'
    from public.company_commercial_config_versions version
    where version.company_id =
      p_company_id
    returning id
    into v_id;

    insert into
      public.company_commercial_product_profiles (
        company_id,
        config_version_id,
        product_id,
        commercial_product_contract_version,
        commercial_product_definition
      )
    select
      source.company_id,
      v_id,
      source.product_id,
      source.commercial_product_contract_version,
      source.commercial_product_definition
    from public.company_commercial_product_profiles source
    where source.company_id =
      p_company_id
      and source.config_version_id =
        p_source_config_version_id;

    insert into public.company_commercial_facts (
      company_id,
      config_version_id,
      category,
      fact_key,
      fact_value,
      source_note,
      is_active
    )
    select
      source.company_id,
      v_id,
      source.category,
      source.fact_key,
      source.fact_value,
      source.source_note,
      source.is_active
    from public.company_commercial_facts source
    where source.company_id =
      p_company_id
      and source.config_version_id =
        p_source_config_version_id;

    return query
    select
      version.company_id,
      version.id,
      version.version_number,
      version.status
    from public.company_commercial_config_versions version
    where version.id =
      v_id;
  end;
  $$;
`

function companyFact(
  overrides = {},
) {
  return {
    contract_version:
      'commercial-fact-v2',

    fact_kind:
      'official',

    category:
      'empresa',

    fact_key:
      'horario_atendimento',

    fact_value:
      'Atendimento de segunda a sexta-feira, das 8h às 18h.',

    scope: {
      type:
        'company',

      product_id:
        null,

      variant_key:
        null,

      reference_key:
        null,
    },

    conditions: [],

    limitations: [
      'Não inclui feriados.',
    ],

    validity: {
      mode:
        'ongoing',

      valid_from:
        '2026-08-01T00:00:00.000Z',

      valid_until:
        null,
    },

    source: {
      type:
        'internal_policy',

      reference:
        'Política oficial de atendimento.',

      verified_at:
        '2026-08-18T12:00:00.000Z',
    },

    ...overrides,
  }
}

function payloadFact(
  definition,
  overrides = {},
) {
  return {
    category:
      definition?.category ??
      'legado',

    fact_key:
      definition?.fact_key ??
      'fato_legado',

    fact_value:
      definition?.fact_value ??
      'Valor legado.',

    source_note:
      'Nota legada.',

    is_active:
      true,

    commercial_fact_definition:
      definition,

    ...overrides,
  }
}

async function createDb() {
  const db =
    new PGlite({
      extensions: {
        pgcrypto,
      },
    })

  await db.exec(
    bootstrapSql,
  )

  await db.query(
    `
      insert into
        public.company_commercial_config_versions (
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
      LEGACY_CONFIG_ID,
      COMPANY_ID,
    ],
  )

  await db.query(
    `
      insert into public.company_commercial_facts (
        company_id,
        config_version_id,
        category,
        fact_key,
        fact_value,
        source_note,
        is_active
      )
      values (
        $1::uuid,
        $2::uuid,
        'legado',
        'fato_legado',
        'Valor legado.',
        'Fonte antiga.',
        true
      )
    `,
    [
      COMPANY_ID,
      LEGACY_CONFIG_ID,
    ],
  )

  await db.query(
    `
      insert into public.products (
        id,
        company_id,
        name
      )
      values (
        $1::uuid,
        $2::uuid,
        'Produto Teste'
      )
    `,
    [
      PRODUCT_ID,
      COMPANY_ID,
    ],
  )

  await db.exec(
    await readFile(
      migrationPath,
      'utf8',
    ),
  )

  return db
}

test(
  'migração preserva fatos existentes como V1 sem definição semântica',
  async () => {
    const db =
      await createDb()

    const result =
      await db.query(
        `
          select
            commercial_fact_contract_version,
            commercial_fact_definition
          from public.company_commercial_facts
          where config_version_id =
            $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_fact_contract_version,
      'commercial-fact-v1',
    )

    assert.equal(
      result.rows[0]
        .commercial_fact_definition,
      null,
    )

    await db.close()
  },
)

test(
  'wrapper V5 salva fato oficial V2 preservando projeção legada',
  async () => {
    const db =
      await createDb()

    const definition =
      companyFact()

    const save =
      await db.query(
        `
          select *
          from public.rpc_save_company_commercial_config_draft_v5(
            $1::uuid,
            $2::uuid,
            $3::jsonb
          )
        `,
        [
          COMPANY_ID,
          LEGACY_CONFIG_ID,
          JSON.stringify({
            facts: [
              payloadFact(
                definition,
              ),
            ],
          }),
        ],
      )

    assert.equal(
      save.rows.length,
      1,
    )

    const result =
      await db.query(
        `
          select
            category,
            fact_key,
            fact_value,
            commercial_fact_contract_version,
            commercial_fact_definition
          from public.company_commercial_facts
          where config_version_id =
            $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_fact_contract_version,
      'commercial-fact-v2',
    )

    assert.deepEqual(
      result.rows[0]
        .commercial_fact_definition,
      definition,
    )

    assert.equal(
      result.rows[0].category,
      definition.category,
    )

    assert.equal(
      result.rows[0].fact_key,
      definition.fact_key,
    )

    assert.equal(
      result.rows[0].fact_value,
      definition.fact_value,
    )

    await db.close()
  },
)

test(
  'definition null permanece explicitamente no contrato legado V1',
  async () => {
    const db =
      await createDb()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v5(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          facts: [
            payloadFact(
              null,
            ),
          ],
        }),
      ],
    )

    const result =
      await db.query(
        `
          select
            commercial_fact_contract_version,
            commercial_fact_definition
          from public.company_commercial_facts
          where config_version_id =
            $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_fact_contract_version,
      'commercial-fact-v1',
    )

    assert.equal(
      result.rows[0]
        .commercial_fact_definition,
      null,
    )

    await db.close()
  },
)

test(
  'publicação aceita fato V2 semanticamente válido',
  async () => {
    const db =
      await createDb()

    const definition =
      companyFact()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v5(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          facts: [
            payloadFact(
              definition,
            ),
          ],
        }),
      ],
    )

    await db.query(
      `
        update public.company_commercial_config_versions
        set status = 'published'
        where id = $1::uuid
      `,
      [
        LEGACY_CONFIG_ID,
      ],
    )

    const result =
      await db.query(
        `
          select status
          from public.company_commercial_config_versions
          where id = $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      )

    assert.equal(
      result.rows[0].status,
      'published',
    )

    await db.close()
  },
)

test(
  'publicação rejeita definição V2 semanticamente inválida',
  async () => {
    const db =
      await createDb()

    const definition =
      companyFact({
        source: {
          type:
            'system_record',

          reference:
            'Registro oficial.',

          verified_at:
            'data-invalida',
        },
      })

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v5(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          facts: [
            payloadFact(
              definition,
            ),
          ],
        }),
      ],
    )

    await assert.rejects(
      db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      ),
      /verificada/,
    )

    await db.close()
  },
)

test(
  'publicação rejeita divergência entre definição V2 e projeção legada',
  async () => {
    const db =
      await createDb()

    const definition =
      companyFact()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v5(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          facts: [
            payloadFact(
              definition,
              {
                fact_value:
                  'Valor divergente.',
              },
            ),
          ],
        }),
      ],
    )

    await assert.rejects(
      db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      ),
      /fact_value/,
    )

    await db.close()
  },
)

test(
  'fato de produto exige produto configurado na mesma versão',
  async () => {
    const db =
      await createDb()

    const definition =
      companyFact({
        category:
          'produto',

        fact_key:
          'prazo_implantacao',

        fact_value:
          'Implantação em até cinco dias úteis.',

        scope: {
          type:
            'product',

          product_id:
            PRODUCT_ID,

          variant_key:
            null,

          reference_key:
            null,
        },
      })

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v5(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          facts: [
            payloadFact(
              definition,
            ),
          ],
        }),
      ],
    )

    await assert.rejects(
      db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      ),
      /produto não configurado/,
    )

    await db.close()
  },
)

test(
  'fato de variante exige variante existente em produto V3',
  async () => {
    const db =
      await createDb()

    await db.query(
      `
        insert into
          public.company_commercial_product_profiles (
            company_id,
            config_version_id,
            product_id,
            commercial_product_contract_version,
            commercial_product_definition
          )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          'commercial-product-v3',
          $4::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        PRODUCT_ID,
        JSON.stringify({
          contract_version:
            'commercial-product-v3',

          variants: [
            {
              key:
                'variant-a',
            },
          ],
        }),
      ],
    )

    const definition =
      companyFact({
        category:
          'produto',

        fact_key:
          'prazo_variante',

        fact_value:
          'Prazo específico da variante.',

        scope: {
          type:
            'product_variant',

          product_id:
            PRODUCT_ID,

          variant_key:
            'variant-inexistente',

          reference_key:
            null,
        },
      })

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v5(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          facts: [
            payloadFact(
              definition,
            ),
          ],
        }),
      ],
    )

    await assert.rejects(
      db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      ),
      /variante inexistente/,
    )

    await db.close()
  },
)

test(
  'wrapper V5 de clonagem preserva integralmente contrato e definição do fato',
  async () => {
    const db =
      await createDb()

    const definition =
      companyFact()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v5(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          facts: [
            payloadFact(
              definition,
            ),
          ],
        }),
      ],
    )

    const clone =
      await db.query(
        `
          select *
          from public.rpc_clone_company_commercial_config_v5(
            $1::uuid,
            $2::uuid
          )
        `,
        [
          COMPANY_ID,
          LEGACY_CONFIG_ID,
        ],
      )

    const clonedId =
      clone.rows[0]
        .config_version_id

    const result =
      await db.query(
        `
          select
            commercial_fact_contract_version,
            commercial_fact_definition
          from public.company_commercial_facts
          where config_version_id =
            $1::uuid
        `,
        [
          clonedId,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_fact_contract_version,
      'commercial-fact-v2',
    )

    assert.deepEqual(
      result.rows[0]
        .commercial_fact_definition,
      definition,
    )

    await db.close()
  },
)
