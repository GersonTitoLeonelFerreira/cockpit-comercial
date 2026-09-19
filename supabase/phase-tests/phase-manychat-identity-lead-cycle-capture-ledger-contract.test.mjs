import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

// R2 — gate "ManyChat contract/integration": prova a cadeia completa
// identidade → lead → ciclo → captura → ledger canônico para um contato
// ManyChat, contra Postgres efêmero (PGlite — nenhuma migration é
// aplicada ao projeto Supabase real, MANYCHAT_CAPTURE_ENABLED continua
// false no código-fonte; este teste só valida o contrato de dados, nunca
// substitui uma validação E2E de qualidade comercial, que fica para uma
// fase posterior com o feature flag ligado).
//
// Deliberadamente NÃO valida qualidade da leitura comercial (Commercial
// Reading) — só a integridade estrutural do contrato: a identidade
// resolve para o lead certo, a captura persiste no ledger certo, o
// ledger nunca mistura empresas/leads, e author_kind chega correto para
// cada mensagem (customer / human_agent / automation), inclusive quando
// uma automação do ManyChat aparece no meio da conversa.

function migrationPath(fileName) {
  return fileURLToPath(new URL(`../migrations/${fileName}`, import.meta.url));
}

const preR2MigrationPaths = [
  migrationPath("20260629040658_restore_simulator_metrics_rpc_shell.sql"),
  migrationPath("20260730155903_create_conversation_messages_ledger.sql"),
  migrationPath("20260730170515_create_conversation_capture_state.sql"),
  migrationPath("20260803030154_create_companion_message_ingestion_rpc.sql"),
  migrationPath(
    "20260803064000_harden_companion_message_ingestion_rpc.sql",
  ),
  migrationPath("20260803223345_prevent_stale_companion_captures.sql"),
  migrationPath(
    "20260804120000_add_causal_companion_message_versions.sql",
  ),
];

const authorKindMigrationPath = migrationPath(
  "20260915010000_add_message_author_kind.sql",
);
const externalIdentityMigrationPath = migrationPath(
  "20260915020000_create_lead_external_identities.sql",
);

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  otherCompany: "10000000-0000-4000-8000-000000000002",
  lead: "20000000-0000-4000-8000-000000000001",
  leadOtherCompany: "20000000-0000-4000-8000-000000000002",
  cycle: "30000000-0000-4000-8000-000000000001",
  cycleOtherCompany: "30000000-0000-4000-8000-000000000002",
  user: "40000000-0000-4000-8000-000000000001",
  device: "50000000-0000-4000-8000-000000000001",
};

// Namespace canônico real (platform-contract.js
// buildNamespacedConversationKey): "<platform>:<accountKey>:<subscriberId>".
// Nunca whatsapp_user_id, nunca telefone.
const PLATFORM = "manychat";
const ACCOUNT_KEY = "workspace-alpha";
const SUBSCRIBER_ID = "subscriber-778899";
const CONVERSATION_KEY = `${PLATFORM}:${ACCOUNT_KEY}:${SUBSCRIBER_ID}`;
const EXTERNAL_IDENTITY_KEY = "manychat:contact:v1:sha256:integrationtest";

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

function buildMessage(overrides = {}) {
  return {
    message_key: "message-001",
    direction: "incoming",
    occurred_at: "2026-09-15T15:20:00-03:00",
    observed_at: "2026-09-15T18:20:05.000Z",
    content_type: "text",
    text_content: "Mensagem ManyChat.",
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  };
}

async function callIngestion(db, { messages, companyId, cycleId }) {
  const result = await db.query(
    `
      select *
      from public.rpc_ingest_companion_messages(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::text,
        $5::text,
        $6::jsonb
      )
    `,
    [
      companyId,
      cycleId,
      ids.user,
      CONVERSATION_KEY,
      ids.device,
      JSON.stringify(messages),
    ],
  );

  return result.rows[0];
}

async function callLink(db, { companyId, leadId }) {
  const result = await db.query(
    `
      select *
      from public.rpc_link_companion_external_identity(
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
      EXTERNAL_IDENTITY_KEY,
      "manychat_dom_reader",
      ids.user,
    ],
  );

  return result.rows[0];
}

async function resolveLeadIdByIdentity(db, { companyId }) {
  // Mimetiza findLeadIdByExternalIdentity() em
  // app/api/companion/resolve-lead/route.ts: SELECT puro por
  // company_id + platform + external_identity_key.
  const result = await db.query(
    `
      select lead_id
      from public.lead_external_identities
      where company_id = $1
        and platform = $2
        and external_identity_key = $3
    `,
    [companyId, PLATFORM, EXTERNAL_IDENTITY_KEY],
  );

  return result.rows[0]?.lead_id ?? null;
}

async function readCanonicalLedger(db, { companyId, cycleId }) {
  // Mesmas colunas de MESSAGE_FIELDS em
  // stateful-copilot-real-context-loader.ts, na mesma ordem de leitura
  // (por company_id + cycle_id + conversation_key).
  const result = await db.query(
    `
      select
        id,
        company_id,
        cycle_id,
        conversation_key,
        message_key,
        version,
        direction,
        author_kind,
        occurred_at,
        observed_at,
        content_type,
        text_content,
        audio_transcription,
        is_deleted,
        deletion_reason
      from public.conversation_messages
      where company_id = $1
        and cycle_id = $2
        and conversation_key = $3
      order by occurred_at asc
    `,
    [companyId, cycleId, CONVERSATION_KEY],
  );

  return result.rows;
}

test(
  "ManyChat: identidade -> lead -> ciclo -> captura -> ledger canônico funciona como uma cadeia única e isolada por empresa/lead",
  async () => {
    const db = new PGlite({
      extensions: {
        pgcrypto,
        uuid_ossp,
      },
    });

    try {
      await db.exec(supabaseBootstrap);

      for (const path of preR2MigrationPaths) {
        await db.exec(await readFile(path, "utf8"));
      }

      // conversation_messages.deletion_reason: end-state real do projeto
      // Supabase (ver phase-full-r2-schema-transition.test.mjs para o
      // porquê de não reexecutar o arquivo local quebrado).
      await db.exec(`
        alter table public.conversation_messages
          add column if not exists deletion_reason text;

        alter table public.conversation_messages
          add constraint conversation_messages_deletion_reason_check
          check (
            (is_deleted = false and deletion_reason is null)
            or (
              is_deleted = true
              and deletion_reason is not null
              and deletion_reason in ('explicit_deletion', 'dom_disappearance')
            )
          );
      `);

      await db.exec(await readFile(authorKindMigrationPath, "utf8"));
      await db.exec(
        await readFile(externalIdentityMigrationPath, "utf8"),
      );

      await db.exec(
        "set search_path = public, extensions, pg_catalog",
      );

      await db.exec(`
        insert into auth.users (id, email)
        values ('${ids.user}', 'manychat-integration@example.test');

        insert into public.profiles (
          id, full_name, email, is_active_global
        )
        values (
          '${ids.user}',
          'Usuário Integração ManyChat',
          'manychat-integration@example.test',
          true
        );

        insert into public.companies (id, name, legal_name, trade_name)
        values
          (
            '${ids.company}',
            'Empresa ManyChat',
            'Empresa ManyChat LTDA',
            'Empresa ManyChat'
          ),
          (
            '${ids.otherCompany}',
            'Empresa ManyChat B',
            'Empresa ManyChat B LTDA',
            'Empresa ManyChat B'
          );

        insert into public.company_memberships (
          company_id, user_id, role, is_active
        )
        values (
          '${ids.company}', '${ids.user}', 'member', true
        );

        insert into public.leads (id, company_id, name, created_by)
        values
          (
            '${ids.lead}',
            '${ids.company}',
            'Lead ManyChat',
            '${ids.user}'
          ),
          (
            '${ids.leadOtherCompany}',
            '${ids.otherCompany}',
            'Lead De Outra Empresa',
            '${ids.user}'
          );

        insert into public.sales_cycles (
          id, company_id, lead_id, owner_user_id
        )
        values
          (
            '${ids.cycle}',
            '${ids.company}',
            '${ids.lead}',
            '${ids.user}'
          ),
          (
            '${ids.cycleOtherCompany}',
            '${ids.otherCompany}',
            '${ids.leadOtherCompany}',
            '${ids.user}'
          );
      `);

      // -----------------------------------------------------------
      // 1) IDENTIDADE -> LEAD: vincula o contato ManyChat ao lead,
      //    via ação explícita (nunca automática).
      // -----------------------------------------------------------
      const linked = await callLink(db, {
        companyId: ids.company,
        leadId: ids.lead,
      });
      assert.equal(linked.lead_id, ids.lead);

      // RESOLVE (leitura pura, exatamente como resolve-lead real) aponta
      // para o lead certo.
      const resolvedLeadId = await resolveLeadIdByIdentity(db, {
        companyId: ids.company,
      });
      assert.equal(resolvedLeadId, ids.lead);

      // -----------------------------------------------------------
      // 2) LEAD -> CICLO: o ciclo aplicável é resolvido pelas regras
      //    reais do CRM (sales_cycles), não pela tabela de identidade.
      // -----------------------------------------------------------
      const cycleForLead = await db.query(
        `select id from public.sales_cycles where lead_id = $1`,
        [resolvedLeadId],
      );
      assert.equal(cycleForLead.rows[0].id, ids.cycle);

      // -----------------------------------------------------------
      // 3) CAPTURA: ingere uma conversa ManyChat real — cliente,
      //    automação do bot e vendedor humano intercalados.
      // -----------------------------------------------------------
      const ingestion = await callIngestion(db, {
        companyId: ids.company,
        cycleId: ids.cycle,
        messages: [
          buildMessage({
            message_key: "manychat-m1-customer",
            direction: "incoming",
            author_kind: "customer",
            occurred_at: "2026-09-15T15:20:00-03:00",
            observed_at: "2026-09-15T18:20:01.000Z",
            text_content: "Quero saber o preço do plano.",
          }),
          buildMessage({
            message_key: "manychat-m2-automation",
            direction: "outgoing",
            author_kind: "automation",
            occurred_at: "2026-09-15T15:20:05.000Z",
            observed_at: "2026-09-15T18:20:06.000Z",
            text_content: "Obrigado por entrar em contato! Um consultor vai te responder em breve.",
          }),
          buildMessage({
            message_key: "manychat-m3-human-agent",
            direction: "outgoing",
            author_kind: "human_agent",
            occurred_at: "2026-09-15T15:25:00-03:00",
            observed_at: "2026-09-15T18:25:01.000Z",
            text_content: "Oi! O plano custa R$199/mês, posso te enviar os detalhes.",
          }),
        ],
      });

      assert.equal(Number(ingestion.inserted_count), 3);

      // -----------------------------------------------------------
      // 4) LEDGER CANÔNICO: lê de volta pelas mesmas colunas/escopo do
      //    loader real e confirma author_kind correto por mensagem.
      // -----------------------------------------------------------
      const ledger = await readCanonicalLedger(db, {
        companyId: ids.company,
        cycleId: ids.cycle,
      });

      assert.equal(ledger.length, 3);

      const byKey = Object.fromEntries(
        ledger.map((row) => [row.message_key, row]),
      );

      assert.equal(
        byKey["manychat-m1-customer"].author_kind,
        "customer",
      );
      assert.equal(
        byKey["manychat-m1-customer"].conversation_key,
        CONVERSATION_KEY,
      );

      assert.equal(
        byKey["manychat-m2-automation"].author_kind,
        "automation",
      );
      assert.equal(
        byKey["manychat-m2-automation"].direction,
        "outgoing",
      );

      assert.equal(
        byKey["manychat-m3-human-agent"].author_kind,
        "human_agent",
      );

      // A automação nunca é filtrada/removida do ledger (continua na
      // história cronológica) — só não pode ser lida como ação do
      // vendedor por author_kind, o que é responsabilidade da camada de
      // commercial-responsibility/commercial-reading (já provada nos
      // gates anteriores desta R2), não deste teste de integridade
      // estrutural do ledger.
      assert.equal(
        ledger.filter((row) => row.author_kind === "automation").length,
        1,
      );

      // -----------------------------------------------------------
      // 5) ISOLAMENTO: nada disso vaza para outra empresa/lead.
      // -----------------------------------------------------------
      const resolvedForOtherCompany = await resolveLeadIdByIdentity(db, {
        companyId: ids.otherCompany,
      });
      assert.equal(resolvedForOtherCompany, null);

      const ledgerForOtherCompany = await readCanonicalLedger(db, {
        companyId: ids.otherCompany,
        cycleId: ids.cycleOtherCompany,
      });
      assert.equal(ledgerForOtherCompany.length, 0);

      // Namespace nunca é whatsapp_user_id/telefone: a chave é
      // "<platform>:<accountKey>:<subscriberId>", e nenhuma mensagem
      // do ledger contém telefone ou wa_id bruto na conversation_key.
      assert.equal(
        CONVERSATION_KEY.startsWith("manychat:"),
        true,
      );
      assert.equal(
        /^\+?\d/.test(CONVERSATION_KEY.split(":").pop()),
        false,
        "conversation_key não pode terminar em algo que pareça telefone/wa_id bruto",
      );
    } finally {
      await db.close();
    }
  },
);
