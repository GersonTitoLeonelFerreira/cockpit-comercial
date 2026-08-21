import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrationPath = fileURLToPath(
  new URL(
    '../migrations/20260818043000_add_commercial_product_v2_persistence.sql',
    import.meta.url,
  ),
)

const COMPANY_ID =
  '10000000-0000-4000-8000-000000000001'

const SOURCE_ID =
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
    name text not null,
    category text,
    base_price numeric(12,2) not null default 0,
    active boolean not null default true
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

    indicated_audiences text[] not null default '{}'::text[],
    needs_addressed text[] not null default '{}'::text[],
    benefits text[] not null default '{}'::text[],
    verified_differentiators text[] not null default '{}'::text[],
    limitations text[] not null default '{}'::text[],
    contract_conditions text[] not null default '{}'::text[],
    payment_conditions text[] not null default '{}'::text[],
    allowed_claims text[] not null default '{}'::text[],
    forbidden_claims text[] not null default '{}'::text[]
  );

  create or replace function
  public.rpc_save_company_commercial_config_draft_v2(
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

    delete from public.company_commercial_product_profiles profile
    where profile.company_id = p_company_id
      and profile.config_version_id = v_id;

    for v_item in
      select item.value
      from jsonb_array_elements(
        coalesce(
          p_payload -> 'product_profiles',
          '[]'::jsonb
        )
      ) as item(value)
    loop
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
        p_company_id,
        v_id,
        (v_item ->> 'product_id')::uuid,

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'indicated_audiences',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'needs_addressed',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'benefits',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'verified_differentiators',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'limitations',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'contract_conditions',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'payment_conditions',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'allowed_claims',
              '[]'::jsonb
            )
          )
        ),

        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(
              v_item -> 'forbidden_claims',
              '[]'::jsonb
            )
          )
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
    where version.company_id = p_company_id
      and version.id = v_id;
  end;
  $$;

  create or replace function
  public.rpc_clone_company_commercial_config_v2(
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
    select
      source.company_id,
      v_id,
      source.product_id,
      source.indicated_audiences,
      source.needs_addressed,
      source.benefits,
      source.verified_differentiators,
      source.limitations,
      source.contract_conditions,
      source.payment_conditions,
      source.allowed_claims,
      source.forbidden_claims
    from public.company_commercial_product_profiles source
    where source.company_id = p_company_id
      and source.config_version_id =
        p_source_config_version_id;

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

function buildProductDefinition() {
  return {
    contract_version:
      'commercial-product-v2',

    product_kind:
      'simple',

    name:
      'Plano Open',

    category:
      'Plano',

    commercial_description:
      'Plano comercial simples com acesso aos benefícios oficialmente configurados.',

    indicated_audiences: [
      'Clientes que precisam dos benefícios incluídos no plano.',
    ],

    needs_addressed: [
      'Acesso recorrente aos serviços previstos no plano.',
    ],

    benefits: [
      'Acesso aos benefícios oficialmente incluídos.',
    ],

    verified_differentiators: [
      'Condições específicas oficialmente configuradas.',
    ],

    limitations: [
      'Não inclui serviços não previstos na configuração oficial.',
    ],

    recommend_when: [
      'A necessidade do cliente corresponde ao que o plano realmente entrega.',
    ],

    avoid_when: [
      'O cliente depende de um serviço que o plano não cobre.',
    ],

    pricing: {
      model:
        'recurring',

      amount:
        199.9,

      currency:
        'BRL',

      amount_qualifier:
        'exact',

      recurrence:
        'monthly',

      installment_count:
        null,

      installment_amount_basis:
        null,

      note:
        'Valor mensal semanticamente confirmado.',
    },

    contract_conditions: [
      'Condições contratuais oficialmente configuradas.',
    ],

    payment_conditions: [
      'Pagamento conforme configuração oficial.',
    ],

    allowed_claims: [
      'O plano inclui os benefícios oficialmente configurados.',
    ],

    forbidden_claims: [
      'O plano garante resultado físico.',
    ],
  }
}

function buildProfilePayload(
  definition,
  overrides = {},
) {
  return {
    product_id:
      PRODUCT_ID,

    indicated_audiences:
      definition.indicated_audiences,

    needs_addressed:
      definition.needs_addressed,

    benefits:
      definition.benefits,

    verified_differentiators:
      definition.verified_differentiators,

    limitations:
      definition.limitations,

    contract_conditions:
      definition.contract_conditions,

    payment_conditions:
      definition.payment_conditions,

    allowed_claims:
      definition.allowed_claims,

    forbidden_claims:
      definition.forbidden_claims,

    commercial_product_definition:
      definition,

    ...overrides,
  }
}

test(
  'A1.2 persiste produto V2 sem converter ou quebrar perfis legados',
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
      },
    })

    try {
      await db.exec(
        bootstrapSql,
      )

      await db.query(
        `
          insert into public.products (
            id,
            company_id,
            name,
            category,
            base_price,
            active
          )
          values (
            $1::uuid,
            $2::uuid,
            'Plano Open',
            'Plano',
            1723.85,
            true
          )
        `,
        [
          PRODUCT_ID,
          COMPANY_ID,
        ],
      )

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

      await db.query(
        `
          insert into public.company_commercial_product_profiles (
            company_id,
            config_version_id,
            product_id,
            needs_addressed,
            benefits
          )
          values (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            array['Necessidade legada'],
            array['Benefício legado']
          )
        `,
        [
          COMPANY_ID,
          SOURCE_ID,
          PRODUCT_ID,
        ],
      )

      await db.exec(
        await readFile(
          migrationPath,
          'utf8',
        ),
      )

      const legacy =
        await db.query(
          `
            select
              commercial_product_contract_version,
              commercial_product_definition
            from public.company_commercial_product_profiles
            where company_id = $1::uuid
              and config_version_id = $2::uuid
              and product_id = $3::uuid
          `,
          [
            COMPANY_ID,
            SOURCE_ID,
            PRODUCT_ID,
          ],
        )

      assert.equal(
        legacy.rows[0]
          .commercial_product_contract_version,
        'commercial-product-v1',
      )

      assert.equal(
        legacy.rows[0]
          .commercial_product_definition,
        null,
      )

      const definition =
        buildProductDefinition()

      await db.query(
        `
          select *
          from public.rpc_save_company_commercial_config_draft_v3(
            $1::uuid,
            $2::uuid,
            $3::jsonb
          )
        `,
        [
          COMPANY_ID,
          SOURCE_ID,
          JSON.stringify({
            product_profiles: [
              buildProfilePayload(
                definition,
              ),
            ],
          }),
        ],
      )

      const persisted =
        await db.query(
          `
            select
              commercial_product_contract_version,
              commercial_product_definition
                ->> 'contract_version'
                as definition_contract,
              commercial_product_definition
                -> 'pricing'
                ->> 'model'
                as pricing_model,
              commercial_product_definition
                -> 'pricing'
                ->> 'recurrence'
                as recurrence
            from public.company_commercial_product_profiles
            where company_id = $1::uuid
              and config_version_id = $2::uuid
              and product_id = $3::uuid
          `,
          [
            COMPANY_ID,
            SOURCE_ID,
            PRODUCT_ID,
          ],
        )

      assert.equal(
        persisted.rows[0]
          .commercial_product_contract_version,
        'commercial-product-v2',
      )

      assert.equal(
        persisted.rows[0]
          .definition_contract,
        'commercial-product-v2',
      )

      assert.equal(
        persisted.rows[0]
          .pricing_model,
        'recurring',
      )

      assert.equal(
        persisted.rows[0]
          .recurrence,
        'monthly',
      )

      await db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [
          SOURCE_ID,
        ],
      )

      const cloneResult =
        await db.query(
          `
            select *
            from public.rpc_clone_company_commercial_config_v3(
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

      const cloned =
        await db.query(
          `
            select
              version.status,
              profile.commercial_product_contract_version,
              profile.commercial_product_definition
                ->> 'contract_version'
                as definition_contract,
              profile.commercial_product_definition
                -> 'pricing'
                ->> 'recurrence'
                as recurrence
            from public.company_commercial_config_versions version
            join public.company_commercial_product_profiles profile
              on profile.company_id = version.company_id
             and profile.config_version_id = version.id
            where version.id = $1::uuid
          `,
          [
            clonedId,
          ],
        )

      assert.equal(
        cloned.rows[0].status,
        'draft',
      )

      assert.equal(
        cloned.rows[0]
          .commercial_product_contract_version,
        'commercial-product-v2',
      )

      assert.equal(
        cloned.rows[0]
          .definition_contract,
        'commercial-product-v2',
      )

      assert.equal(
        cloned.rows[0]
          .recurrence,
        'monthly',
      )

      const invalidDefinition =
        structuredClone(
          definition,
        )

      invalidDefinition.pricing.recurrence =
        null

      const invalidDraft =
        await db.query(
          `
            select *
            from public.rpc_save_company_commercial_config_draft_v3(
              $1::uuid,
              null::uuid,
              $2::jsonb
            )
          `,
          [
            COMPANY_ID,
            JSON.stringify({
              product_profiles: [
                buildProfilePayload(
                  invalidDefinition,
                ),
              ],
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
          [
            invalidDraftId,
          ],
        ),
        /periodicidade válida/,
      )

      const projectionDraft =
        await db.query(
          `
            select *
            from public.rpc_save_company_commercial_config_draft_v3(
              $1::uuid,
              null::uuid,
              $2::jsonb
            )
          `,
          [
            COMPANY_ID,
            JSON.stringify({
              product_profiles: [
                buildProfilePayload(
                  definition,
                  {
                    benefits: [
                      'Benefício divergente da definição V2.',
                    ],
                  },
                ),
              ],
            }),
          ],
        )

      const projectionDraftId =
        projectionDraft.rows[0]
          .config_version_id

      await assert.rejects(
        db.query(
          `
            update public.company_commercial_config_versions
            set status = 'published'
            where id = $1::uuid
          `,
          [
            projectionDraftId,
          ],
        ),
        /projeção legada de benefícios/,
      )
      const ambiguousPriceDefinition =
        structuredClone(
          definition,
        )

      ambiguousPriceDefinition.pricing = {
        model:
          'unknown',

        amount:
          1723.85,

        currency:
          'BRL',

        amount_qualifier:
          null,

        recurrence:
          null,

        installment_count:
          null,

        installment_amount_basis:
          null,

        note:
          null,
      }

      const ambiguousPriceDraft =
        await db.query(
          `
            select *
            from public.rpc_save_company_commercial_config_draft_v3(
              $1::uuid,
              null::uuid,
              $2::jsonb
            )
          `,
          [
            COMPANY_ID,
            JSON.stringify({
              product_profiles: [
                buildProfilePayload(
                  ambiguousPriceDefinition,
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
            ambiguousPriceDraft.rows[0]
              .config_version_id,
          ],
        ),
        /não pode possuir valor numérico/,
      )

      const missingCurrencyDefinition =
        structuredClone(
          definition,
        )

      delete missingCurrencyDefinition
        .pricing
        .currency

      const missingCurrencyDraft =
        await db.query(
          `
            select *
            from public.rpc_save_company_commercial_config_draft_v3(
              $1::uuid,
              null::uuid,
              $2::jsonb
            )
          `,
          [
            COMPANY_ID,
            JSON.stringify({
              product_profiles: [
                buildProfilePayload(
                  missingCurrencyDefinition,
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
            missingCurrencyDraft.rows[0]
              .config_version_id,
          ],
        ),
        /moeda do produto comercial/,
      )

      const conflictingClaimDefinition =
        structuredClone(
          definition,
        )

      conflictingClaimDefinition
        .forbidden_claims = [
          conflictingClaimDefinition
            .allowed_claims[0],
        ]

      const conflictingClaimDraft =
        await db.query(
          `
            select *
            from public.rpc_save_company_commercial_config_draft_v3(
              $1::uuid,
              null::uuid,
              $2::jsonb
            )
          `,
          [
            COMPANY_ID,
            JSON.stringify({
              product_profiles: [
                buildProfilePayload(
                  conflictingClaimDefinition,
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
            conflictingClaimDraft.rows[0]
              .config_version_id,
          ],
        ),
        /mesma afirmação não pode ser permitida e proibida/i,
      )

      const mismatchedNameDefinition =
        structuredClone(
          definition,
        )

      mismatchedNameDefinition.name =
        'Produto diferente'

      const mismatchedNameDraft =
        await db.query(
          `
            select *
            from public.rpc_save_company_commercial_config_draft_v3(
              $1::uuid,
              null::uuid,
              $2::jsonb
            )
          `,
          [
            COMPANY_ID,
            JSON.stringify({
              product_profiles: [
                buildProfilePayload(
                  mismatchedNameDefinition,
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
            mismatchedNameDraft.rows[0]
              .config_version_id,
          ],
        ),
        /nome da definição V2 não corresponde ao produto vinculado/i,
      )
    } finally {
      await db.close()
    }
  },
)
