import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrationPath =
  fileURLToPath(
    new URL(
      '../migrations/20260819052000_add_commercial_objection_v2_persistence.sql',
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

  create table public.company_commercial_objection_guides (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    config_version_id uuid not null,
    sort_order integer not null,
    objection text not null,
    signals text[] not null default '{}'::text[],
    discovery_questions text[] not null default '{}'::text[],
    recommended_approach text not null,
    response_limits text[] not null default '{}'::text[],
    is_active boolean not null default true
  );

  create unique index
    company_commercial_objection_guides_test_unique
  on public.company_commercial_objection_guides (
    config_version_id,
    sort_order
  );

  create or replace function
  public.rpc_save_company_commercial_config_draft_v5(
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

    delete from
      public.company_commercial_objection_guides guide
    where guide.company_id =
      p_company_id
      and guide.config_version_id =
        v_id;

    for v_item in
      select item.value
      from jsonb_array_elements(
        coalesce(
          p_payload -> 'objection_guides',
          '[]'::jsonb
        )
      ) as item(value)
    loop
      insert into
        public.company_commercial_objection_guides (
          company_id,
          config_version_id,
          sort_order,
          objection,
          signals,
          discovery_questions,
          recommended_approach,
          response_limits,
          is_active
        )
      values (
        p_company_id,
        v_id,
        (
          v_item ->> 'sort_order'
        )::integer,
        btrim(
          v_item ->> 'objection'
        ),
        coalesce(
          array(
            select
              btrim(value)
            from jsonb_array_elements_text(
              coalesce(
                v_item -> 'signals',
                '[]'::jsonb
              )
            ) as value
          ),
          '{}'::text[]
        ),
        coalesce(
          array(
            select
              btrim(value)
            from jsonb_array_elements_text(
              coalesce(
                v_item -> 'discovery_questions',
                '[]'::jsonb
              )
            ) as value
          ),
          '{}'::text[]
        ),
        btrim(
          v_item ->> 'recommended_approach'
        ),
        coalesce(
          array(
            select
              btrim(value)
            from jsonb_array_elements_text(
              coalesce(
                v_item -> 'response_limits',
                '[]'::jsonb
              )
            ) as value
          ),
          '{}'::text[]
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
  public.rpc_clone_company_commercial_config_v5(
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

    insert into
      public.company_commercial_objection_guides (
        company_id,
        config_version_id,
        sort_order,
        objection,
        signals,
        discovery_questions,
        recommended_approach,
        response_limits,
        is_active
      )
    select
      source.company_id,
      v_id,
      source.sort_order,
      source.objection,
      source.signals,
      source.discovery_questions,
      source.recommended_approach,
      source.response_limits,
      source.is_active
    from public.company_commercial_objection_guides source
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

function buildPriceObjection(
  overrides = {},
) {
  return {
    contract_version:
      'commercial-objection-v2',

    objection_kind:
      'commercial_objection',

    objection_key:
      'price_value',

    objection:
      'Preço percebido como alto',

    category:
      'price',

    description:
      'Resistência em que preço ou relação entre preço e valor percebido dificulta materialmente o avanço.',

    scope: {
      type:
        'company',

      product_id:
        null,

      variant_key:
        null,
    },

    signals: [
      'Está caro.',
      'Ficou acima do que eu esperava.',
    ],

    objection_when: [
      'O cliente relaciona o preço a uma resistência real para avançar.',
    ],

    not_objection_when: [
      'O cliente apenas pergunta qual é o preço.',
    ],

    distinguish_from: [
      'question',
      'information_request',
      'condition',
      'postponement',
      'rejection',
      'uncertainty',
    ],

    discovery_questions: [
      'O que está pesando mais nessa condição?',
    ],

    recommended_approach:
      'Compreender a resistência antes de responder e utilizar somente informações comerciais comprovadas.',

    response_limits: [
      'Não presumir falta de dinheiro.',
      'Não oferecer desconto sem política aplicável.',
    ],

    resolution_criteria: [
      'Está claro se ainda existe bloqueio real para a decisão.',
    ],

    wait_when: [
      'O cliente assumiu compromisso explícito de retorno.',
    ],

    give_space_when: [
      'Insistir agora aumentaria a resistência.',
    ],

    stop_when: [
      'O cliente realizou recusa explícita sem solicitar continuidade.',
    ],

    ...overrides,
  }
}

function payloadGuide(
  definition,
  overrides = {},
) {
  return {
    sort_order:
      1,

    objection:
      definition?.objection ??
      'Objeção legada',

    signals:
      definition?.signals ??
      [
        'Sinal legado.',
      ],

    discovery_questions:
      definition
        ?.discovery_questions ??
      [],

    recommended_approach:
      definition
        ?.recommended_approach ??
      'Abordagem legada.',

    response_limits:
      definition
        ?.response_limits ??
      [
        'Limite legado.',
      ],

    is_active:
      true,

    commercial_objection_definition:
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
      insert into
        public.company_commercial_objection_guides (
          company_id,
          config_version_id,
          sort_order,
          objection,
          signals,
          discovery_questions,
          recommended_approach,
          response_limits,
          is_active
        )
      values (
        $1::uuid,
        $2::uuid,
        1,
        'Objeção legada',
        array['Sinal legado.'],
        array[]::text[],
        'Abordagem legada.',
        array['Limite legado.'],
        true
      )
    `,
    [
      COMPANY_ID,
      LEGACY_CONFIG_ID,
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
  'migração preserva guias existentes como V1 sem definição semântica',
  async () => {
    const db =
      await createDb()

    const result =
      await db.query(
        `
          select
            commercial_objection_contract_version,
            commercial_objection_definition
          from public.company_commercial_objection_guides
          where config_version_id =
            $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_objection_contract_version,
      'commercial-objection-v1',
    )

    assert.equal(
      result.rows[0]
        .commercial_objection_definition,
      null,
    )

    await db.close()
  },
)

test(
  'wrapper V6 salva objeção V2 preservando projeção legada',
  async () => {
    const db =
      await createDb()

    const definition =
      buildPriceObjection()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
              definition,
            ),
          ],
        }),
      ],
    )

    const result =
      await db.query(
        `
          select
            objection,
            signals,
            discovery_questions,
            recommended_approach,
            response_limits,
            commercial_objection_contract_version,
            commercial_objection_definition
          from public.company_commercial_objection_guides
          where config_version_id =
            $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_objection_contract_version,
      'commercial-objection-v2',
    )

    assert.deepEqual(
      result.rows[0]
        .commercial_objection_definition,
      definition,
    )

    assert.equal(
      result.rows[0].objection,
      definition.objection,
    )

    assert.deepEqual(
      result.rows[0].signals,
      definition.signals,
    )

    assert.deepEqual(
      result.rows[0]
        .discovery_questions,
      definition.discovery_questions,
    )

    assert.equal(
      result.rows[0]
        .recommended_approach,
      definition.recommended_approach,
    )

    assert.deepEqual(
      result.rows[0]
        .response_limits,
      definition.response_limits,
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
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
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
            commercial_objection_contract_version,
            commercial_objection_definition
          from public.company_commercial_objection_guides
          where config_version_id =
            $1::uuid
        `,
        [
          LEGACY_CONFIG_ID,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_objection_contract_version,
      'commercial-objection-v1',
    )

    assert.equal(
      result.rows[0]
        .commercial_objection_definition,
      null,
    )

    await db.close()
  },
)

test(
  'publicação aceita objeção V2 semanticamente válida',
  async () => {
    const db =
      await createDb()

    const definition =
      buildPriceObjection()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
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
      buildPriceObjection({
        category:
          'categoria-invalida',
      })

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
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
      /categoria/,
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
      buildPriceObjection()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
              definition,
              {
                recommended_approach:
                  'Abordagem divergente.',
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
      /recommended_approach/,
    )

    await db.close()
  },
)

test(
  'objeção de produto exige produto configurado na mesma versão',
  async () => {
    const db =
      await createDb()

    const definition =
      buildPriceObjection({
        scope: {
          type:
            'product',

          product_id:
            PRODUCT_ID,

          variant_key:
            null,
        },
      })

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
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
  'objeção de variante exige variante existente em produto V3',
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
                'enterprise',
            },
          ],
        }),
      ],
    )

    const definition =
      buildPriceObjection({
        scope: {
          type:
            'product_variant',

          product_id:
            PRODUCT_ID,

          variant_key:
            'variante-inexistente',
        },
      })

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
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
  'publicação rejeita objection_key duplicada no mesmo escopo',
  async () => {
    const db =
      await createDb()

    const firstDefinition =
      buildPriceObjection()

    const secondDefinition =
      buildPriceObjection({
        objection:
          'Preço alto em condição alternativa',

        description:
          'Segunda definição indevida para a mesma objection_key e o mesmo escopo.',

        recommended_approach:
          'Abordagem alternativa que não pode coexistir com a mesma identidade semântica.',
      })

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
              firstDefinition,
              {
                sort_order:
                  1,
              },
            ),

            payloadGuide(
              secondDefinition,
              {
                sort_order:
                  2,
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
      /objection_key duplicada/,
    )

    await db.close()
  },
)

test(
  'wrapper V6 de clonagem preserva integralmente contrato e definição da objeção',
  async () => {
    const db =
      await createDb()

    const definition =
      buildPriceObjection()

    await db.query(
      `
        select *
        from public.rpc_save_company_commercial_config_draft_v6(
          $1::uuid,
          $2::uuid,
          $3::jsonb
        )
      `,
      [
        COMPANY_ID,
        LEGACY_CONFIG_ID,
        JSON.stringify({
          objection_guides: [
            payloadGuide(
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
          from public.rpc_clone_company_commercial_config_v6(
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
            commercial_objection_contract_version,
            commercial_objection_definition
          from public.company_commercial_objection_guides
          where config_version_id =
            $1::uuid
        `,
        [
          clonedId,
        ],
      )

    assert.equal(
      result.rows[0]
        .commercial_objection_contract_version,
      'commercial-objection-v2',
    )

    assert.deepEqual(
      result.rows[0]
        .commercial_objection_definition,
      definition,
    )

    await db.close()
  },
)
