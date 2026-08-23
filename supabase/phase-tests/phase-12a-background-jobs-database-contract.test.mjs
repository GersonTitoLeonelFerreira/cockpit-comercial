// Frente Paralela 3 (FASE 12A) — validação adversarial da arquitetura
// progressiva do Companion (PR #206), contra a fundação de background real
// entregue pelo PR #207 (migration
// 20260823001500_create_companion_background_analysis_jobs.sql).
//
// A cobertura já existente para essa migration
// (app/lib/companion/phase12a-background-analysis-foundation.test.mjs,
// phase12a-background-concurrency.test.mjs) é inteiramente baseada em
// regex/substring sobre o texto-fonte do worker e da migration — ela prova
// que o código *contém os padrões certos*, não que o banco de dados
// *aplica* essas garantias de verdade quando exercitado.
//
// Este arquivo, seguindo o mesmo padrão já usado em
// supabase/phase-tests/phase-5-stateful-persistence.test.mjs (PGlite +
// migrations reais + banco descartável), aplica a migration real do PR #207
// e exercita as constraints com SQL de verdade — sem mockar nada e sem
// tocar em nenhum arquivo de runtime. Cada teste aqui mapeia para um
// cenário da matriz de condição de corrida
// (docs/companion-v2/phase12/RACE_CONDITIONS_MATRIX.md).
//
// Não altera runtime de produção. Não grava em banco real. Banco
// inteiramente descartável, recriado a cada teste.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'

const baselinePath = fileURLToPath(
  new URL(
    '../migrations/20260629040658_restore_simulator_metrics_rpc_shell.sql',
    import.meta.url,
  ),
)

const backgroundJobsMigrationPath = fileURLToPath(
  new URL(
    '../migrations/20260823001500_create_companion_background_analysis_jobs.sql',
    import.meta.url,
  ),
)

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
`

const COMPANY_A = '10000000-0000-4000-8000-000000000001'
const COMPANY_B = '10000000-0000-4000-8000-000000000002'
const LEAD_A = '20000000-0000-4000-8000-000000000001'
const LEAD_B = '20000000-0000-4000-8000-000000000002'
const CYCLE_A = '30000000-0000-4000-8000-000000000001'
const CYCLE_B = '30000000-0000-4000-8000-000000000002'
const USER_A = '40000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'

// `message_watermark` não tem formato exigido pela migration — só
// `not null`. Ainda assim geramos hex sintético, nunca dado de conversa
// real.
function watermark(label) {
  return createHash('sha256').update(`watermark:${label}`).digest('hex')
}

// `analysis_job_id` PRECISA bater com o CHECK real da coluna
// (`^[a-f0-9]{64}$`, como um sha256 de verdade) — gerado a partir do rótulo
// legível do teste via hash, nunca inventado com caracteres fora de a-f0-9.
function jobId(label) {
  return createHash('sha256').update(`job:${label}`).digest('hex')
}

async function createSeededDb() {
  const db = new PGlite({
    extensions: {
      pgcrypto,
      uuid_ossp,
    },
  })

  await db.exec(supabaseBootstrap)
  await db.exec(await readFile(baselinePath, 'utf8'))
  await db.exec(await readFile(backgroundJobsMigrationPath, 'utf8'))
  await db.exec('set search_path = public, extensions, pg_catalog')

  await db.exec(`
    insert into auth.users (id, email)
    values
      ('${USER_A}', 'vendedor@example.test');

    insert into public.companies (id, name, legal_name, trade_name)
    values
      ('${COMPANY_A}', 'Empresa A', 'Empresa A LTDA', 'Empresa A'),
      ('${COMPANY_B}', 'Empresa B', 'Empresa B LTDA', 'Empresa B');

    insert into public.leads (id, company_id, name, created_by)
    values
      ('${LEAD_A}', '${COMPANY_A}', 'Lead A', '${USER_A}'),
      ('${LEAD_B}', '${COMPANY_B}', 'Lead B', '${USER_A}');

    insert into public.sales_cycles (id, company_id, lead_id, owner_user_id)
    values
      ('${CYCLE_A}', '${COMPANY_A}', '${LEAD_A}', '${USER_A}'),
      ('${CYCLE_B}', '${COMPANY_B}', '${LEAD_B}', '${USER_A}');
  `)

  return db
}

function insertJobSql({
  analysisJobId,
  companyId = COMPANY_A,
  cycleId = CYCLE_A,
  conversationKey = CONVERSATION_KEY,
  messageWatermark,
  status = 'queued',
  requestedAt,
  automaticCrmWrite = false,
  automaticAgendaWrite = false,
  attemptCount = 0,
  communicationAttempts = null,
}) {
  return `
    insert into public.companion_background_analysis_jobs (
      analysis_job_id,
      company_id,
      cycle_id,
      conversation_key,
      message_watermark,
      status,
      requested_at,
      automatic_crm_write,
      automatic_agenda_write,
      attempt_count,
      communication_attempts
    )
    values (
      '${analysisJobId}',
      '${companyId}',
      '${cycleId}',
      '${conversationKey}',
      '${messageWatermark}',
      '${status}',
      '${requestedAt}',
      ${automaticCrmWrite},
      ${automaticAgendaWrite},
      ${attemptCount},
      ${communicationAttempts === null ? 'null' : communicationAttempts}
    );
  `
}

async function withDb(fn) {
  const db = await createSeededDb()
  try {
    await fn(db)
  } finally {
    await db.close()
  }
}

// Cenário D: dois triggers equivalentes para o mesmo snapshot — a unicidade
// de escopo+watermark é o mecanismo real de coalescing/idempotência no
// enqueue (o worker trata a violação 23505 como "job já existe, reusar").
test(
  '(D) dois enqueues para o mesmo escopo+watermark colidem na constraint de unicidade (coalescing real)',
  async () => {
    await withDb(async (db) => {
      await db.exec(
        insertJobSql({
          analysisJobId: jobId('job-a'),
          messageWatermark: watermark('wm-1'),
          requestedAt: '2026-08-23T10:00:00Z',
        }),
      )

      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-a-retry'),
              messageWatermark: watermark('wm-1'),
              requestedAt: '2026-08-23T10:00:01Z',
            }),
          ),
        /companion_background_analysis_jobs_scope_unique|duplicate key/i,
        'um segundo enqueue com o mesmo (company_id, cycle_id, conversation_key, message_watermark) deveria colidir na constraint de unicidade',
      )
    })
  },
)

// Cenário G: lease concorrente — só um job pode estar "running" por
// conversa ao mesmo tempo, mesmo com watermarks diferentes.
test(
  '(G) apenas um job "running" é permitido por (company_id, cycle_id, conversation_key), mesmo com watermarks diferentes',
  async () => {
    await withDb(async (db) => {
      await db.exec(
        insertJobSql({
          analysisJobId: jobId('job-running-1'),
          messageWatermark: watermark('wm-1'),
          status: 'running',
          requestedAt: '2026-08-23T10:00:00Z',
        }),
      )

      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-running-2'),
              messageWatermark: watermark('wm-2'),
              status: 'running',
              requestedAt: '2026-08-23T10:05:00Z',
            }),
          ),
        /companion_background_analysis_jobs_one_running_per_conversation_idx|duplicate key/i,
        'um segundo job "running" para a mesma conversa deveria colidir no índice único parcial',
      )

      // Depois que o primeiro job termina (deixa de ser "running"), a
      // mesma conversa pode ter um novo job "running" — a constraint é
      // sobre concorrência, não sobre nunca mais rodar de novo.
      await db.exec(`
        update public.companion_background_analysis_jobs
        set status = 'succeeded', completed_at = '2026-08-23T10:02:00Z'
        where analysis_job_id = '${jobId('job-running-1')}';
      `)

      await db.exec(
        insertJobSql({
          analysisJobId: jobId('job-running-2'),
          messageWatermark: watermark('wm-2'),
          status: 'running',
          requestedAt: '2026-08-23T10:05:00Z',
        }),
      )

      const { rows } = await db.query(`
        select analysis_job_id, status
        from public.companion_background_analysis_jobs
        where status = 'running'
      `)

      assert.equal(rows.length, 1)
      assert.equal(rows[0].analysis_job_id, jobId('job-running-2'))
    })
  },
)

// Cenário E/I: job antigo que demora enquanto um job mais novo já existe
// para a mesma conversa — reproduz exatamente a query que
// stateful-copilot-background-worker.ts usa para decidir "superseded"
// (`.gt('requested_at', job.requested_at)`), sem invocar a função TS (que
// não é injetável nesta sandbox — cria o client Supabase real
// internamente). Isso prova o CONTRATO de dados que a função depende,
// diretamente contra o banco real.
test(
  '(E/I) job antigo consegue detectar, via a mesma query do worker, que existe job mais novo para a mesma conversa',
  async () => {
    await withDb(async (db) => {
      await db.exec(
        insertJobSql({
          analysisJobId: jobId('job-old'),
          messageWatermark: watermark('wm-1'),
          status: 'running',
          requestedAt: '2026-08-23T10:00:00Z',
        }),
      )

      // O job mais novo só pode ser enfileirado depois que o antigo deixa
      // de estar "running" (índice parcial do teste G) — simula o antigo
      // ainda rodando enquanto o watermark avança e um novo job é
      // solicitado para quando ele finalmente puder ser aceito.
      await db.exec(`
        update public.companion_background_analysis_jobs
        set status = 'queued'
        where analysis_job_id = '${jobId('job-old')}';
      `)

      await db.exec(
        insertJobSql({
          analysisJobId: jobId('job-new'),
          messageWatermark: watermark('wm-2'),
          status: 'queued',
          requestedAt: '2026-08-23T10:05:00Z',
        }),
      )

      // Query idêntica em espírito à do worker (§2 da auditoria desta
      // frente): existe job mais novo para o mesmo escopo?
      const { rows } = await db.query(`
        select analysis_job_id
        from public.companion_background_analysis_jobs
        where company_id = '${COMPANY_A}'
          and cycle_id = '${CYCLE_A}'
          and conversation_key = '${CONVERSATION_KEY}'
          and requested_at > '2026-08-23T10:00:00Z'
      `)

      assert.deepEqual(
        rows.map((row) => row.analysis_job_id),
        [jobId('job-new')],
        'o job antigo deveria conseguir enxergar que um job mais novo já existe para a mesma conversa',
      )
    })
  },
)

// Cenário L (parcial): o job nunca pode apontar para um ciclo que não
// existe (ou que pertence a outra empresa via id incorreto) — a FK
// composta (company_id, cycle_id) -> sales_cycles(company_id, id) é a
// única coisa que impede um job "órfão" ou com cycle_id de outra empresa
// colado a um company_id errado.
test(
  '(L) job não pode ser criado para um ciclo inexistente, nem para a combinação errada de company_id/cycle_id entre empresas',
  async () => {
    await withDb(async (db) => {
      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-orphan'),
              cycleId: '30000000-0000-4000-8000-000000000099',
              messageWatermark: watermark('wm-1'),
              requestedAt: '2026-08-23T10:00:00Z',
            }),
          ),
        /companion_background_analysis_jobs_cycle_fkey|violates foreign key/i,
        'um job para um cycle_id inexistente deveria violar a FK',
      )

      // cycle_id de A com company_id de B: a FK composta exige que o par
      // (company_id, cycle_id) exista junto em sales_cycles — cross-tenant
      // spoofing de cycle_id não passa pela FK.
      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-cross-tenant'),
              companyId: COMPANY_B,
              cycleId: CYCLE_A,
              messageWatermark: watermark('wm-1'),
              requestedAt: '2026-08-23T10:00:00Z',
            }),
          ),
        /companion_background_analysis_jobs_cycle_fkey|violates foreign key/i,
        'um job com cycle_id de A mas company_id de B deveria violar a FK composta',
      )
    })
  },
)

// K1/K2 no nível de dados: automatic_crm_write/automatic_agenda_write
// jamais podem ser gravados como true, mesmo por engano/bug futuro no
// worker — o banco é a última linha de defesa, não só o tipo TypeScript.
test(
  'CRM/Agenda permanecem fail-closed mesmo se o worker tentasse gravar true (constraint de banco, não só tipo)',
  async () => {
    await withDb(async (db) => {
      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-bad-crm'),
              messageWatermark: watermark('wm-1'),
              requestedAt: '2026-08-23T10:00:00Z',
              automaticCrmWrite: true,
            }),
          ),
        /companion_background_analysis_jobs_no_auto_write_check|violates check constraint/i,
      )

      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-bad-agenda'),
              messageWatermark: watermark('wm-1'),
              requestedAt: '2026-08-23T10:00:00Z',
              automaticAgendaWrite: true,
            }),
          ),
        /companion_background_analysis_jobs_no_auto_write_check|violates check constraint/i,
      )
    })
  },
)

// Limites de retry (seção 6H / 10 do mandato): attempt_count e
// communication_attempts têm faixas válidas fechadas por constraint.
test(
  'attempt_count e communication_attempts respeitam os limites declarados',
  async () => {
    await withDb(async (db) => {
      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-bad-attempt'),
              messageWatermark: watermark('wm-1'),
              requestedAt: '2026-08-23T10:00:00Z',
              attemptCount: 101,
            }),
          ),
        /companion_background_analysis_jobs_attempt_count_check|violates check constraint/i,
      )

      await assert.rejects(
        () =>
          db.exec(
            insertJobSql({
              analysisJobId: jobId('job-bad-comm'),
              messageWatermark: watermark('wm-1'),
              requestedAt: '2026-08-23T10:00:00Z',
              communicationAttempts: 3,
            }),
          ),
        /companion_background_analysis_jobs_communication_attempts_check|violates check constraint/i,
      )
    })
  },
)

// Isolamento (seção 7 do mandato): confirma, com dado real no banco, que
// `company_id` isola corretamente QUANDO a query filtra por ele — e
// documenta explicitamente que a tabela em si não tem RLS efetiva para
// `service_role` (a role usada pelo worker tem o atributo `bypassrls`,
// então a proteção real contra cross-tenant leak está inteiramente no
// filtro `.eq('company_id', ...)` do código do worker, não em uma barreira
// estrutural do banco). Isso não é um BLOCKER em si — a auditoria desta
// frente confirmou que o worker sempre filtra por company_id — mas é uma
// lacuna estrutural que vale registrar: um único `.eq('company_id', ...)`
// esquecido no futuro não seria pego pelo banco.
test(
  '(isolamento) company_id isola corretamente quando a query filtra por ele; RLS não é uma segunda barreira para service_role',
  async () => {
    await withDb(async (db) => {
      await db.exec(
        insertJobSql({
          analysisJobId: jobId('job-company-a'),
          companyId: COMPANY_A,
          cycleId: CYCLE_A,
          conversationKey: CONVERSATION_KEY,
          messageWatermark: watermark('wm-1'),
          requestedAt: '2026-08-23T10:00:00Z',
        }),
      )

      await db.exec(
        insertJobSql({
          analysisJobId: jobId('job-company-b'),
          companyId: COMPANY_B,
          cycleId: CYCLE_B,
          conversationKey: CONVERSATION_KEY,
          messageWatermark: watermark('wm-1'),
          requestedAt: '2026-08-23T10:00:00Z',
        }),
      )

      const scopedToA = await db.query(`
        select analysis_job_id
        from public.companion_background_analysis_jobs
        where company_id = '${COMPANY_A}'
          and conversation_key = '${CONVERSATION_KEY}'
      `)

      assert.deepEqual(
        scopedToA.rows.map((row) => row.analysis_job_id),
        [jobId('job-company-a')],
        'query corretamente escopada por company_id deve isolar A de B',
      )

      const rlsStatus = await db.query(`
        select relrowsecurity, relforcerowsecurity
        from pg_class
        where relname = 'companion_background_analysis_jobs'
      `)

      assert.equal(rlsStatus.rows[0].relrowsecurity, true)
      assert.equal(rlsStatus.rows[0].relforcerowsecurity, true)

      const serviceRoleBypassesRls = await db.query(`
        select rolbypassrls
        from pg_roles
        where rolname = 'service_role'
      `)

      assert.equal(
        serviceRoleBypassesRls.rows[0].rolbypassrls,
        true,
        'confirma que service_role tem bypassrls — RLS habilitada+forçada nesta tabela não impede um vazamento cross-tenant ' +
          'de um `.eq(company_id, ...)` esquecido no código do worker; a proteção real hoje é inteiramente no filtro aplicado em app/lib/server/stateful-copilot-background-worker.ts, não no banco',
      )
    })
  },
)
