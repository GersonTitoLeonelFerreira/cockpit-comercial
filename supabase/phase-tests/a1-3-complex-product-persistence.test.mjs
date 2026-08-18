import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrationV2Path = fileURLToPath(
  new URL(
    '../migrations/20260818043000_add_commercial_product_v2_persistence.sql',
    import.meta.url,
  ),
)

const migrationV3Path = fileURLToPath(
  new URL(
    '../migrations/20260818162000_add_commercial_product_v3_persistence.sql',
    import.meta.url,
  ),
)

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const LEGACY_CONFIG_ID = '20000000-0000-4000-8000-000000000001'
const SIMPLE_PRODUCT_ID = '30000000-0000-4000-8000-000000000001'
const COMPLEX_PRODUCT_ID = '30000000-0000-4000-8000-000000000002'

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
            coalesce(v_item -> 'indicated_audiences', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'needs_addressed', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'benefits', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'verified_differentiators', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'limitations', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'contract_conditions', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'payment_conditions', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'allowed_claims', '[]'::jsonb)
          )
        ),
        array(
          select btrim(value)
          from jsonb_array_elements_text(
            coalesce(v_item -> 'forbidden_claims', '[]'::jsonb)
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
    where version.id = v_id;
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
      and source.config_version_id = p_source_config_version_id;

    return query
    select
      version.company_id,
      version.id,
      version.version_number,
      version.status
    from public.company_commercial_config_versions version
    where version.id = v_id;
  end;
  $$;
`

function simpleDefinition() {
  return {
    contract_version: 'commercial-product-v2',
    product_kind: 'simple',
    name: 'Plano Open',
    category: 'Plano',
    commercial_description: 'Plano comercial simples.',
    indicated_audiences: ['Clientes elegíveis ao plano.'],
    needs_addressed: ['Uso recorrente dos serviços contratados.'],
    benefits: ['Acesso aos serviços previstos.'],
    verified_differentiators: ['Condição oficialmente configurada.'],
    limitations: ['Não inclui serviços não contratados.'],
    recommend_when: ['A necessidade corresponde ao plano.'],
    avoid_when: ['O cliente depende de serviço não incluído.'],
    pricing: {
      model: 'recurring',
      amount: 199.9,
      currency: 'BRL',
      amount_qualifier: 'exact',
      recurrence: 'monthly',
      installment_count: null,
      installment_amount_basis: null,
      note: 'Valor mensal.',
    },
    contract_conditions: ['Conforme contrato.'],
    payment_conditions: ['Cobrança mensal.'],
    allowed_claims: ['O plano possui cobrança mensal.'],
    forbidden_claims: ['O plano garante resultado.'],
  }
}

function variant(overrides = {}) {
  return {
    key: 'pro',
    name: 'Modelo Pro',
    sku: 'EQ-PRO-001',
    model: 'XP-900',
    version: '2026',
    commercial_description: 'Versão profissional do equipamento.',
    compatibility: {
      compatible_with: ['Rede elétrica 220V'],
      incompatible_with: ['Rede elétrica 110V'],
      notes: ['Verificar infraestrutura.'],
    },
    applications: ['Academias de médio e grande porte.'],
    specifications: [
      {
        key: 'motor',
        label: 'Motor',
        value: '5',
        unit: 'HP',
      },
    ],
    limitations: ['Exige instalação em 220V.'],
    recommend_when: ['A operação exige equipamento profissional.'],
    avoid_when: ['O local possui somente rede 110V.'],
    pricing: {
      model: 'one_time',
      amount: 18990,
      currency: 'BRL',
      amount_qualifier: 'exact',
      recurrence: null,
      installment_count: null,
      installment_amount_basis: null,
      note: 'Preço da variante.',
    },
    stock: {
      status: 'available',
      quantity: 4,
      checked_at: '2026-08-18T12:00:00.000Z',
      valid_until: '2026-08-19T12:00:00.000Z',
      note: 'Estoque confirmado.',
    },
    allowed_claims: ['Possui motor de 5 HP.'],
    forbidden_claims: ['Nunca necessita manutenção.'],
    ...overrides,
  }
}

function complexDefinition(overrides = {}) {
  return {
    contract_version: 'commercial-product-v3',
    product_kind: 'complex',
    name: 'Esteira Profissional',
    category: 'Equipamento fitness',
    commercial_description: 'Linha profissional com variantes técnicas.',
    indicated_audiences: ['Academias e centros de treinamento.'],
    needs_addressed: ['Equipar operação cardiovascular.'],
    benefits: ['Escolha da variante conforme a operação.'],
    verified_differentiators: ['Variantes tecnicamente diferenciadas.'],
    limitations: ['A escolha depende da infraestrutura.'],
    recommend_when: ['A empresa precisa de equipamento profissional.'],
    avoid_when: ['A aplicação não corresponde ao produto.'],
    contract_conditions: ['Instalação conforme escopo contratado.'],
    payment_conditions: ['Conforme condição da variante.'],
    allowed_claims: ['Existem variantes tecnicamente distintas.'],
    forbidden_claims: ['Qualquer variante atende qualquer infraestrutura.'],
    variants: [
      variant(),
      variant({
        key: 'standard',
        name: 'Modelo Standard',
        sku: 'EQ-STD-001',
        model: 'XP-700',
        applications: ['Academias de pequeno e médio porte.'],
        specifications: [
          {
            key: 'motor',
            label: 'Motor',
            value: '3',
            unit: 'HP',
          },
        ],
        pricing: {
          model: 'installment',
          amount: 1290,
          currency: 'BRL',
          amount_qualifier: 'starting_at',
          recurrence: null,
          installment_count: 12,
          installment_amount_basis: 'per_installment',
          note: 'Valor inicial por parcela.',
        },
        stock: {
          status: 'limited',
          quantity: 2,
          checked_at: '2026-08-18T12:00:00.000Z',
          valid_until: '2026-08-18T20:00:00.000Z',
          note: 'Estoque limitado.',
        },
      }),
    ],
    ...overrides,
  }
}

function profile(productId, definition, overrides = {}) {
  return {
    product_id: productId,
    indicated_audiences: definition?.indicated_audiences ?? [],
    needs_addressed: definition?.needs_addressed ?? [],
    benefits: definition?.benefits ?? [],
    verified_differentiators: definition?.verified_differentiators ?? [],
    limitations: definition?.limitations ?? [],
    contract_conditions: definition?.contract_conditions ?? [],
    payment_conditions: definition?.payment_conditions ?? [],
    allowed_claims: definition?.allowed_claims ?? [],
    forbidden_claims: definition?.forbidden_claims ?? [],
    commercial_product_definition: definition,
    ...overrides,
  }
}

async function createDb() {
  const db = new PGlite({
    extensions: {
      pgcrypto,
    },
  })

  await db.exec(bootstrapSql)

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
      values
        (
          $1::uuid,
          $3::uuid,
          'Plano Open',
          'Plano',
          1723.85,
          true
        ),
        (
          $2::uuid,
          $3::uuid,
          'Esteira Profissional',
          'Equipamento fitness',
          99999.99,
          true
        )
    `,
    [
      SIMPLE_PRODUCT_ID,
      COMPLEX_PRODUCT_ID,
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
      LEGACY_CONFIG_ID,
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
      LEGACY_CONFIG_ID,
      SIMPLE_PRODUCT_ID,
    ],
  )

  await db.exec(
    await readFile(
      migrationV2Path,
      'utf8',
    ),
  )

  await db.exec(
    await readFile(
      migrationV3Path,
      'utf8',
    ),
  )

  return db
}

async function saveDraft(
  db,
  productId,
  definition,
  overrides = {},
) {
  return db.query(
    `
      select *
      from public.rpc_save_company_commercial_config_draft_v4(
        $1::uuid,
        null::uuid,
        $2::jsonb
      )
    `,
    [
      COMPANY_ID,
      JSON.stringify({
        product_profiles: [
          profile(
            productId,
            definition,
            overrides,
          ),
        ],
      }),
    ],
  )
}

test(
  'A1.3 preserva V1 e continua persistindo V2',
  async () => {
    const db = await createDb()

    try {
      const legacy = await db.query(
        `
          select
            commercial_product_contract_version,
            commercial_product_definition
          from public.company_commercial_product_profiles
          where config_version_id = $1::uuid
        `,
        [LEGACY_CONFIG_ID],
      )

      assert.equal(
        legacy.rows[0].commercial_product_contract_version,
        'commercial-product-v1',
      )

      assert.equal(
        legacy.rows[0].commercial_product_definition,
        null,
      )

      const result = await saveDraft(
        db,
        SIMPLE_PRODUCT_ID,
        simpleDefinition(),
      )

      const id = result.rows[0].config_version_id

      const persisted = await db.query(
        `
          select
            commercial_product_contract_version,
            commercial_product_definition ->> 'contract_version'
              as definition_contract
          from public.company_commercial_product_profiles
          where config_version_id = $1::uuid
        `,
        [id],
      )

      assert.equal(
        persisted.rows[0].commercial_product_contract_version,
        'commercial-product-v2',
      )

      assert.equal(
        persisted.rows[0].definition_contract,
        'commercial-product-v2',
      )

      await db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [id],
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'A1.3 persiste publica e clona V3 integralmente',
  async () => {
    const db = await createDb()

    try {
      const definition = complexDefinition()

      const result = await saveDraft(
        db,
        COMPLEX_PRODUCT_ID,
        definition,
      )

      const id = result.rows[0].config_version_id

      const persisted = await db.query(
        `
          select
            commercial_product_contract_version,
            commercial_product_definition ->> 'contract_version'
              as definition_contract,
            commercial_product_definition -> 'variants' -> 0 ->> 'sku'
              as first_sku
          from public.company_commercial_product_profiles
          where config_version_id = $1::uuid
        `,
        [id],
      )

      assert.equal(
        persisted.rows[0].commercial_product_contract_version,
        'commercial-product-v3',
      )

      assert.equal(
        persisted.rows[0].definition_contract,
        'commercial-product-v3',
      )

      assert.equal(
        persisted.rows[0].first_sku,
        'EQ-PRO-001',
      )

      await db.query(
        `
          update public.company_commercial_config_versions
          set status = 'published'
          where id = $1::uuid
        `,
        [id],
      )

      const clone = await db.query(
        `
          select *
          from public.rpc_clone_company_commercial_config_v4(
            $1::uuid,
            $2::uuid
          )
        `,
        [
          COMPANY_ID,
          id,
        ],
      )

      const cloneId =
        clone.rows[0].config_version_id

      const cloned = await db.query(
        `
          select
            commercial_product_contract_version,
            commercial_product_definition
          from public.company_commercial_product_profiles
          where config_version_id = $1::uuid
        `,
        [cloneId],
      )

      assert.equal(
        cloned.rows[0].commercial_product_contract_version,
        'commercial-product-v3',
      )

      assert.deepEqual(
        cloned.rows[0].commercial_product_definition,
        definition,
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'A1.3 bloqueia SKU duplicado na publicação',
  async () => {
    const db = await createDb()

    try {
      const definition =
        complexDefinition()

      definition.variants[1].sku =
        definition.variants[0].sku

      const result = await saveDraft(
        db,
        COMPLEX_PRODUCT_ID,
        definition,
      )

      await assert.rejects(
        db.query(
          `
            update public.company_commercial_config_versions
            set status = 'published'
            where id = $1::uuid
          `,
          [result.rows[0].config_version_id],
        ),
        /SKU precisa ser único/i,
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'A1.3 bloqueia projeção legada divergente',
  async () => {
    const db = await createDb()

    try {
      const definition =
        complexDefinition()

      const result = await saveDraft(
        db,
        COMPLEX_PRODUCT_ID,
        definition,
        {
          benefits: [
            'Benefício divergente.',
          ],
        },
      )

      await assert.rejects(
        db.query(
          `
            update public.company_commercial_config_versions
            set status = 'published'
            where id = $1::uuid
          `,
          [result.rows[0].config_version_id],
        ),
        /projeção legada de benefícios.*V3/i,
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'A1.3 rejeita contrato desconhecido no wrapper V4',
  async () => {
    const db = await createDb()

    try {
      await assert.rejects(
        saveDraft(
          db,
          COMPLEX_PRODUCT_ID,
          complexDefinition({
            contract_version:
              'commercial-product-v99',
          }),
        ),
        /versão da definição comercial.*incompatível/i,
      )
    } finally {
      await db.close()
    }
  },
)

test(
  'A1.3 preserva null como produto legado V1',
  async () => {
    const db = await createDb()

    try {
      const result = await saveDraft(
        db,
        SIMPLE_PRODUCT_ID,
        null,
        {
          needs_addressed: [
            'Necessidade legada.',
          ],
          benefits: [
            'Benefício legado.',
          ],
        },
      )

      const persisted = await db.query(
        `
          select
            commercial_product_contract_version,
            commercial_product_definition
          from public.company_commercial_product_profiles
          where config_version_id = $1::uuid
        `,
        [result.rows[0].config_version_id],
      )

      assert.equal(
        persisted.rows[0].commercial_product_contract_version,
        'commercial-product-v1',
      )

      assert.equal(
        persisted.rows[0].commercial_product_definition,
        null,
      )
    } finally {
      await db.close()
    }
  },
)
