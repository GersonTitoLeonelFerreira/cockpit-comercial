// Frente Paralela 3 (FASE 12A) — validação adversarial independente do
// PR #209 ("feat: entrega o resultado da análise profunda ao
// seller-facing").
//
// Este arquivo testa `loadCompanionAnalysisJobStatus`
// (app/lib/server/companion-analysis-job-reader.ts) DIRETAMENTE — a função
// recebe `admin: SupabaseClient` como parâmetro injetado (ao contrário do
// worker de background, que cria seu próprio client internamente), então
// dá para escrever um teste de unidade real, sem HTTP e sem
// `node:test`'s `mock.module`, usando um fake admin construído aqui.
//
// Histórico: escrito originalmente contra um worktree temporário do head
// 0661ff6893299b9a912a2653c2f902cfa3cdac1c do PR #209 (BLOCKER de stale
// watermark + FAIL de raw output). A Frente 1 avançou a branch para
// 8dafed050c1e7ef18899a899265979d0a7a80088 (raw output corrigido via DTO
// seller-facing, retry real adicionado) e este arquivo foi reexecutado
// contra esse head — algumas asserções foram atualizadas para acompanhar
// mudanças estruturais reais (nunca para tolerar regressão; ver
// comentários inline em cada teste afetado). O PR #209 foi então
// mergeado em `main` e esta branch sincronizada — o arquivo agora roda
// de verdade contra o código mergeado (13/13 passando). Resultados
// completos registrados em
// docs/companion-v2/phase12/DEEP_RESULT_DELIVERY_ADVERSARIAL_MATRIX.md.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  CompanionAnalysisJobReadError,
  loadCompanionAnalysisJobStatus,
} from './companion-analysis-job-reader.ts'

const COMPANY_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const COMPANY_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const USER_A = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const USER_OTHER = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const CYCLE_A = 'aaaaaaaa-0000-4000-8000-0000000000d1'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'

function jobId(label) {
  return createHash('sha256').update(`job:${label}`).digest('hex')
}

// Um admin fake que reproduz fielmente a semântica REAL de
// `.maybeSingle()` do supabase-js/PostgREST: 0 linhas -> {data: null,
// error: null}; 1 linha -> {data: linha, error: null}; 2+ linhas -> erro
// (nunca escolhe uma arbitrariamente). O fake admin já usado em
// analysis-job-status-route.test.mjs (`buildQueryClass`) faz
// `data[0] ?? null` sempre — ou seja, ele PRÓPRIO não consegue provar o
// cenário de 2+ linhas, porque nunca gera esse erro. Esta é uma lacuna
// real do harness de teste já existente, não deste arquivo.
function buildAccurateQueryClass(tables) {
  return class Query {
    constructor(table) {
      this.table = table
      this.filters = []
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    resolveRows() {
      return (tables[this.table] ?? []).filter((row) =>
        this.filters.every((filter) => row[filter.column] === filter.value),
      )
    }

    maybeSingle() {
      const rows = this.resolveRows()

      if (rows.length > 1) {
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
        })
      }

      return Promise.resolve({ data: rows[0] ?? null, error: null })
    }

    // Adicionado ao reauditar o head 8dafed0 do PR #209: a query de junção
    // com companion_commercial_state_events passou a usar `.limit(2)` +
    // checagem manual de `length !== 1`, em vez de `.maybeSingle()`. Fiel à
    // semântica real do PostgREST: `.limit(n)` sempre devolve um array,
    // nunca falha por "múltiplas linhas" sozinho — quem decide o que fazer
    // com 2+ linhas é o código chamador.
    limit(n) {
      return Promise.resolve({ data: this.resolveRows().slice(0, n), error: null })
    }
  }
}

function createAccurateFakeAdmin({ memberships, cycles, jobs, events }) {
  const Query = buildAccurateQueryClass({
    company_memberships: memberships,
    sales_cycles: cycles,
    companion_background_analysis_jobs: jobs,
    companion_commercial_state_events: events,
  })

  return {
    from(table) {
      return new Query(table)
    },
  }
}

function baseFixtures() {
  return {
    memberships: [
      { company_id: COMPANY_A, user_id: USER_A, role: 'member', is_active: true },
    ],
    cycles: [
      { id: CYCLE_A, company_id: COMPANY_A, owner_user_id: USER_A },
    ],
    jobs: [],
    events: [],
  }
}

function jobRow({
  analysisJobId,
  companyId = COMPANY_A,
  cycleId = CYCLE_A,
  conversationKey = CONVERSATION_KEY,
  status,
  candidateStateVersion = null,
  failureCode = null,
  messageWatermark = 'watermark-1',
}) {
  return {
    analysis_job_id: analysisJobId,
    company_id: companyId,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    message_watermark: messageWatermark,
    status,
    candidate_state_version: candidateStateVersion,
    failure_code: failureCode,
  }
}

function deepOutput(overrides = {}) {
  return {
    contract_version: 'phase-5.2-stateful-copilot-v3',
    previous_state_version: null,
    analyzed_message_ids: ['m1'],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    interpretation: {
      what_changed: null,
      what_remains_valid: [],
      current_moment: { summary: 'Momento atual.', evidence_message_ids: ['m1'], memory_ids: [] },
      customer_need: null,
      uncertainties: [],
    },
    state_patch: {
      facts_to_add: [], fact_ids_to_supersede: [], needs_to_add: [], need_ids_to_resolve: [],
      open_loops_to_add: [], open_loop_ids_to_resolve: [], objections_to_add: [],
      objection_ids_to_resolve: [], objection_ids_to_supersede: [], commitments_to_upsert: [],
      signals_to_add: [], signal_ids_to_resolve: [], uncertainties_to_add: [], uncertainty_ids_to_resolve: [],
    },
    strategy: {
      method_application: 'SPIN',
      rationale: 'Motivo interno do modelo.',
      next_move: 'Próximo movimento interno.',
      recommended_question: null,
      suggested_message: 'Mensagem sugerida.',
      evidence_message_ids: ['m1'],
      memory_ids: ['mem-1'],
    },
    operational_suggestions: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    // Adicionado ao reauditar o head 8dafed0 do PR #209: buildSellerResult()
    // agora exige um `communication` aninhado (contrato
    // phase-5.2-communication-v5) com `commercial_reading` (contrato
    // commercial-reading-v1) — ausente na forma V3 original que esta
    // fixture reproduzia. Sem isso, todo teste que chega ao join V3 falha
    // com DEEP_RESULT_INTEGRITY_ERROR por engano de fixture, não por um
    // achado real — daí a atualização.
    communication: {
      contract_version: 'phase-5.2-communication-v5',
      intervention_needed: true,
      method_application: 'SPIN',
      guidance: 'Orientação interna do modelo.',
      recommended_question: null,
      suggested_message: 'Mensagem sugerida.',
      commercial_reading: {
        contract_version: 'commercial-reading-v1',
        commercial_role: 'buyer',
        commercial_relevance: 'commercial',
        analysis_status: 'complete',
        method: { status: 'active', name: 'SPIN', adherence: 'on_method' },
        customer: { needs: [] },
      },
    },
    evidence_message_ids: ['m1'],
    memory_ids: ['mem-1'],
    ...overrides,
  }
}

function eventRow({
  companyId = COMPANY_A,
  cycleId = CYCLE_A,
  conversationKey = CONVERSATION_KEY,
  candidateStateVersion = 1,
  normalizedOutput = deepOutput(),
  generatedAt = '2026-08-23T12:00:00.000Z',
  // Corrigido ao reauditar o head 8dafed0: `output_contract_version` é uma
  // COLUNA própria de companion_commercial_state_events (ver migration
  // 20260806193000_create_stateful_copilot_storage.sql:133), distinta do
  // `contract_version` interno do JSON normalized_output. O reader novo
  // filtra e revalida as DUAS. A fixture original só setava a versão
  // interna do JSON; faltava a coluna, o que fazia até o caminho feliz
  // falhar por engano de fixture.
  outputContractVersion = 'phase-5.2-stateful-copilot-v3',
}) {
  return {
    company_id: companyId,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    candidate_state_version: candidateStateVersion,
    generated_at: generatedAt,
    normalized_output: normalizedOutput,
    output_contract_version: outputContractVersion,
  }
}

function baseToken({ companyId = COMPANY_A, sub = USER_A } = {}) {
  return { company_id: companyId, sub }
}

// ---------------------------------------------------------------------
// Join a companion_commercial_state_events — 0 / 1 / 2+ linhas
// (mandato, seção 6: "não aceite limit(1)/first row/latest row/ordenação
// arbitrária" — confirma que a implementação real usa `.maybeSingle()`,
// que falha fechado em vez de escolher arbitrariamente).
// ---------------------------------------------------------------------

test('(join V3) 0 event rows para um job succeeded -> ANALYSIS_JOB_RESULT_MISSING (integrity error), nunca 200 vazio', async () => {
  const fixtures = baseFixtures()
  const id = jobId('zero-events')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'succeeded', candidateStateVersion: 1 }))
  // Nenhum evento inserido — simula job succeeded sem a linha correspondente persistida.

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken(),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: id,
      }),
    // Reauditado no head 8dafed0: a Frente 1 unificou os códigos de erro de
    // integridade (0 linhas / 2+ linhas / evento V2 / DTO malformado) sob
    // um único `DEEP_RESULT_INTEGRITY_ERROR`, em vez de códigos distintos
    // por caso. Continua 500/não-retryable/fail-closed — mesma garantia,
    // nome de código consolidado.
    (error) =>
      error instanceof CompanionAnalysisJobReadError &&
      error.code === 'DEEP_RESULT_INTEGRITY_ERROR' &&
      error.status_code === 500,
  )
})

test('(join V3) 1 event row correta -> sucesso, devolve o resultado', async () => {
  const fixtures = baseFixtures()
  const id = jobId('one-event')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'succeeded', candidateStateVersion: 1 }))
  fixtures.events.push(eventRow({ candidateStateVersion: 1 }))

  const result = await loadCompanionAnalysisJobStatus({
    admin: createAccurateFakeAdmin(fixtures),
    token: baseToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: id,
  })

  assert.equal(result.status, 'succeeded')
  assert.equal(result.candidate_state_version, 1)
  assert.ok(result.result)
})

test('(join V3) 2+ event rows para o mesmo (company,cycle,conversation,candidate_state_version) -> falha fechada (integrity error), nunca escolhe uma linha arbitrária', async () => {
  const fixtures = baseFixtures()
  const id = jobId('two-events')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'succeeded', candidateStateVersion: 1 }))
  // Duas linhas de evento para a MESMA versão candidata — cenário que a
  // migration não impede estruturalmente (nenhum `unique` cobre
  // (company_id, cycle_id, conversation_key, candidate_state_version) em
  // companion_commercial_state_events; só `unique(operation_key)` existe).
  fixtures.events.push(eventRow({ candidateStateVersion: 1, normalizedOutput: deepOutput({ strategy: deepOutput().strategy }) }))
  fixtures.events.push(eventRow({ candidateStateVersion: 1, normalizedOutput: deepOutput({ strategy: { ...deepOutput().strategy, suggested_message: 'Mensagem DIFERENTE — prova de que não é a mesma linha' } }) }))

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken(),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: id,
      }),
    // Ver nota acima sobre a consolidação de códigos de integridade.
    (error) =>
      error instanceof CompanionAnalysisJobReadError &&
      error.code === 'DEEP_RESULT_INTEGRITY_ERROR' &&
      error.status_code === 500,
    'com 2+ linhas correspondentes, o join deve falhar fechado — nunca escolher uma linha arbitrária',
  )
})

test('(join V3) event row com output_contract_version antigo (V2) não é aceita mesmo batendo o resto da chave', async () => {
  const fixtures = baseFixtures()
  const id = jobId('v2-event')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'succeeded', candidateStateVersion: 1 }))
  fixtures.events.push(
    eventRow({
      candidateStateVersion: 1,
      // output_contract_version é uma COLUNA própria (ver nota em
      // eventRow) — uma linha V2 real teria essa coluna em V2 também, não
      // só o JSON interno. Setando as duas para simular o caso real.
      outputContractVersion: 'phase-5.1-stateful-copilot-v2',
      normalizedOutput: deepOutput({ contract_version: 'phase-5.1-stateful-copilot-v2' }),
    }),
  )

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken(),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: id,
      }),
    // Ver nota acima sobre a consolidação de códigos de integridade.
    (error) =>
      error instanceof CompanionAnalysisJobReadError &&
      error.code === 'DEEP_RESULT_INTEGRITY_ERROR',
    'uma linha de evento V2 não deveria satisfazer o join do contrato V3',
  )
})

// ---------------------------------------------------------------------
// Raw output exposure — mandato, seção 7.
// ---------------------------------------------------------------------

test('(raw output) CORRIGIDO no head 8dafed0: result agora é um DTO seller-facing real (CompanionDeepSellerResult), sem state_patch/operational_suggestions/memory_ids internos', async () => {
  // Este teste originalmente provava um FAIL de contrato (result =
  // normalized_output inteiro, sem filtragem). No head 8dafed0 do PR
  // #209, a Frente 1 introduziu `buildSellerResult()` produzindo um DTO
  // próprio (`CompanionDeepSellerResult`, contrato
  // `phase12a-deep-seller-v1`). A asserção foi invertida porque o
  // comportamento que ela media genuinamente mudou — mantê-la na forma
  // antiga testaria uma exposição que não existe mais.
  const fixtures = baseFixtures()
  const id = jobId('raw-output')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'succeeded', candidateStateVersion: 1 }))
  fixtures.events.push(eventRow({ candidateStateVersion: 1 }))

  const result = await loadCompanionAnalysisJobStatus({
    admin: createAccurateFakeAdmin(fixtures),
    token: baseToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: id,
  })

  const topLevelKeys = Object.keys(result.result).sort()

  // Campos do DTO seller-facing real (CompanionDeepSellerResult) — devem
  // estar presentes.
  const sellerFacingFields = [
    'contract_version', 'engine_source', 'commercial_relevance', 'commercial_role',
    'summary', 'commercial_reading', 'recommended_next_approach', 'recommended_question', 'suggested_message',
  ]

  // Campos internos do motor que NUNCA deveriam sair verbatim para um
  // cliente externo.
  const internalFields = [
    'state_patch', 'operational_suggestions', 'memory_ids', 'previous_state_version',
    'analyzed_message_ids', 'evidence_message_ids', 'interpretation', 'strategy', 'communication',
  ]

  for (const field of sellerFacingFields) {
    assert.ok(topLevelKeys.includes(field), `esperava o campo seller-facing "${field}" presente no DTO`)
  }

  const exposedInternalFields = internalFields.filter((field) => topLevelKeys.includes(field))

  assert.deepEqual(
    exposedInternalFields,
    [],
    `PASS confirmado: nenhum campo interno deveria vazar no DTO seller-facing; encontrados: ${exposedInternalFields.join(', ')}`,
  )

  assert.equal(result.result.contract_version, 'phase12a-deep-seller-v1')
})

// ---------------------------------------------------------------------
// IDOR / cross-tenant — mandato, seção 10.
// ---------------------------------------------------------------------

test('(IDOR) Empresa A não localiza analysis_job_id real de Empresa B -> 404 fail-closed, nenhum metadado vaza', async () => {
  const fixtures = baseFixtures()
  fixtures.memberships.push({ company_id: COMPANY_B, user_id: USER_OTHER, role: 'admin', is_active: true })
  fixtures.cycles.push({ id: 'bbbbbbbb-0000-4000-8000-0000000000d1', company_id: COMPANY_B, owner_user_id: USER_OTHER })

  const jobIdB = jobId('company-b-job')
  fixtures.jobs.push(
    jobRow({
      analysisJobId: jobIdB,
      companyId: COMPANY_B,
      cycleId: 'bbbbbbbb-0000-4000-8000-0000000000d1',
      status: 'succeeded',
      candidateStateVersion: 3,
      failureCode: null,
      messageWatermark: 'watermark-empresa-b',
    }),
  )
  fixtures.events.push(
    eventRow({
      companyId: COMPANY_B,
      cycleId: 'bbbbbbbb-0000-4000-8000-0000000000d1',
      candidateStateVersion: 3,
    }),
  )

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken({ companyId: COMPANY_A, sub: USER_A }),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: jobIdB,
      }),
    (error) =>
      error instanceof CompanionAnalysisJobReadError &&
      error.code === 'ANALYSIS_JOB_NOT_FOUND' &&
      error.status_code === 404 &&
      // O erro não carrega nenhum campo do job de B — CompanionAnalysisJobReadError só tem code/message/status_code/retryable.
      !('status' in error) &&
      !('candidate_state_version' in error) &&
      !('message_watermark' in error),
    'acesso cross-tenant a um analysis_job_id real deveria ser um 404 limpo, sem nenhum metadado do job de B',
  )
})

test('(IDOR) endurecido no head 8dafed0: cycle_id/conversation_key deixaram de ser parâmetros aceitos do cliente — só analysis_job_id + token importam, cycle/conversation são sempre derivados do job autorizado', async () => {
  // Este teste originalmente provava que um conversation_key incorreto
  // enviado pelo cliente era rejeitado. No head 8dafed0, essa superfície
  // de ataque foi ELIMINADA: `loadCompanionAnalysisJobStatus` não aceita
  // mais cycle_id/conversation_key como entrada (assinatura agora é só
  // `{ admin, token, analysis_job_id }`) — são sempre lidos da própria
  // linha do job já autorizado. Passar valores incorretos nesses campos
  // (herdados de chamadas antigas) é hoje um no-op silencioso, o que é
  // uma postura MELHOR (menos superfície controlável pelo cliente), não
  // uma regressão. Este teste prova exatamente isso: mesmo com um
  // conversation_key adulterado no payload, o resultado devolvido é o do
  // job real, com o conversation_key REAL (nunca o que o cliente mandou).
  const fixtures = baseFixtures()
  const id = jobId('wrong-conversation-key')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'succeeded', candidateStateVersion: 1, conversationKey: CONVERSATION_KEY }))
  fixtures.events.push(eventRow({ candidateStateVersion: 1 }))

  const result = await loadCompanionAnalysisJobStatus({
    admin: createAccurateFakeAdmin(fixtures),
    token: baseToken(),
    cycle_id: CYCLE_A,
    conversation_key: 'whatsapp:+5500000000000',
    analysis_job_id: id,
  })

  assert.equal(
    result.conversation_key,
    CONVERSATION_KEY,
    'conversation_key devolvido deve ser o REAL do job, nunca o valor adulterado enviado pelo cliente',
  )
})

// ---------------------------------------------------------------------
// Role / ownership — mandato, seção 11.
// ---------------------------------------------------------------------

test('(role) membro sem ser dono do ciclo é negado mesmo dentro da mesma empresa', async () => {
  const fixtures = baseFixtures()
  fixtures.memberships[0] = { company_id: COMPANY_A, user_id: USER_A, role: 'member', is_active: true }
  fixtures.cycles[0] = { id: CYCLE_A, company_id: COMPANY_A, owner_user_id: USER_OTHER }

  const id = jobId('member-not-owner')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'queued' }))

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken(),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: id,
      }),
    // Reauditado no head 8dafed0 do PR #209: a Frente 1 unificou
    // "sem posse do ciclo" com "não encontrado" no mesmo 404 uniforme
    // (ANALYSIS_JOB_NOT_FOUND), em vez de um 403 distinto que revelaria
    // a um atacante que o job EXISTE mas não é dele — isso é exatamente
    // o comportamento que a seção 1 (S2) desta auditoria recomendava
    // ("404 uniforme é preferível a 403 que confirma existência"). A
    // asserção foi atualizada para refletir esse endurecimento real, não
    // para tolerar uma regressão: o acesso continua negado (fail-closed),
    // só a forma do erro melhorou.
    (error) => error instanceof CompanionAnalysisJobReadError && error.code === 'ANALYSIS_JOB_NOT_FOUND' && error.status_code === 404,
  )
})

test('(role) ciclo sem dono (owner_user_id null) nunca é acessível por um member', async () => {
  const fixtures = baseFixtures()
  fixtures.memberships[0] = { company_id: COMPANY_A, user_id: USER_A, role: 'member', is_active: true }
  fixtures.cycles[0] = { id: CYCLE_A, company_id: COMPANY_A, owner_user_id: null }

  const id = jobId('owner-null')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'queued' }))

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken(),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: id,
      }),
    // Ver nota acima: mesmo endurecimento (404 uniforme em vez de 403).
    (error) => error instanceof CompanionAnalysisJobReadError && error.code === 'ANALYSIS_JOB_NOT_FOUND',
  )
})

test('(role) admin acessa job de qualquer ciclo da própria empresa, mesmo não sendo o dono', async () => {
  const fixtures = baseFixtures()
  fixtures.memberships[0] = { company_id: COMPANY_A, user_id: USER_A, role: 'admin', is_active: true }
  fixtures.cycles[0] = { id: CYCLE_A, company_id: COMPANY_A, owner_user_id: USER_OTHER }

  const id = jobId('admin-any-cycle')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'queued' }))

  const result = await loadCompanionAnalysisJobStatus({
    admin: createAccurateFakeAdmin(fixtures),
    token: baseToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: id,
  })

  assert.equal(result.status, 'queued')
})

test('(role downgrade) token emitido quando o usuário era admin, mas a membership ATUAL no banco já é member sem posse do ciclo -> negado pelo papel atual, não pelo papel do token', async () => {
  // O token em si não carrega `role` nenhum (só company_id/sub) — a
  // função sempre consulta company_memberships de verdade a cada
  // chamada. Este teste prova isso simulando o cenário adversarial: o
  // token continua "válido" (mesmo sub/company_id), mas a membership no
  // banco já foi rebaixada.
  const fixtures = baseFixtures()
  fixtures.memberships[0] = { company_id: COMPANY_A, user_id: USER_A, role: 'member', is_active: true }
  fixtures.cycles[0] = { id: CYCLE_A, company_id: COMPANY_A, owner_user_id: USER_OTHER }

  const id = jobId('downgraded-admin')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'queued' }))

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken({ companyId: COMPANY_A, sub: USER_A }),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: id,
      }),
    // Ver nota acima: mesmo endurecimento (404 uniforme em vez de 403).
    (error) => error instanceof CompanionAnalysisJobReadError && error.code === 'ANALYSIS_JOB_NOT_FOUND',
    'a membership ATUAL (member, sem posse do ciclo) deveria valer, não qualquer privilégio antigo implícito no token',
  )
})

test('(membership inativa) usuário com membership desativada (is_active=false) é negado mesmo com token válido', async () => {
  const fixtures = baseFixtures()
  fixtures.memberships[0] = { company_id: COMPANY_A, user_id: USER_A, role: 'admin', is_active: false }

  const id = jobId('inactive-membership')
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'queued' }))

  await assert.rejects(
    () =>
      loadCompanionAnalysisJobStatus({
        admin: createAccurateFakeAdmin(fixtures),
        token: baseToken(),
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
        analysis_job_id: id,
      }),
    (error) => error instanceof CompanionAnalysisJobReadError && error.code === 'ANALYSIS_JOB_MEMBERSHIP_REQUIRED' && error.status_code === 403,
  )
})

// ---------------------------------------------------------------------
// Stale watermark (T16-T19) — mandato, seção 3, prioridade máxima.
// ---------------------------------------------------------------------

test('(stale, T16-T19 — estrutural) loadCompanionAnalysisJobStatus nunca consulta companion_commercial_states (o estado CORRENTE do ciclo) — não existe nenhum mecanismo para detectar que o candidate_state_version do job é mais antigo que o estado atual', async () => {
  const fixtures = baseFixtures()
  const id = jobId('stale-no-check')

  // Job succeeded na versão 1 (calculada ANTES de uma edição/exclusão/
  // restauração/transcrição de áudio hipotética).
  fixtures.jobs.push(jobRow({ analysisJobId: id, status: 'succeeded', candidateStateVersion: 1, messageWatermark: 'watermark-pre-edicao' }))
  fixtures.events.push(
    eventRow({
      candidateStateVersion: 1,
      normalizedOutput: deepOutput({
        strategy: { ...deepOutput().strategy, suggested_message: 'Mensagem baseada na conversa ANTES da edição.' },
        communication: { ...deepOutput().communication, suggested_message: 'Mensagem baseada na conversa ANTES da edição.' },
      }),
    }),
  )

  // Um segundo job, mais novo, JÁ terminou com sucesso na versão 2
  // (representando a análise pós-edição/pós-mensagem-nova) — a função
  // sob teste não recebe esse segundo job_id, só o antigo, exatamente
  // como o poller faria se ainda estivesse de posse do analysis_job_id
  // antigo por qualquer motivo (guard do cliente falhou, reload, etc.).
  const newerId = jobId('stale-no-check-newer')
  fixtures.jobs.push(jobRow({ analysisJobId: newerId, status: 'succeeded', candidateStateVersion: 2, messageWatermark: 'watermark-pos-edicao' }))
  fixtures.events.push(
    eventRow({
      candidateStateVersion: 2,
      normalizedOutput: deepOutput({
        strategy: { ...deepOutput().strategy, suggested_message: 'Mensagem correta, pós-edição.' },
        communication: { ...deepOutput().communication, suggested_message: 'Mensagem correta, pós-edição.' },
      }),
    }),
  )

  const result = await loadCompanionAnalysisJobStatus({
    admin: createAccurateFakeAdmin(fixtures),
    token: baseToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: id,
  })

  // A função devolve alegremente o resultado ANTIGO como "succeeded",
  // sem nenhum sinal de que já existe uma versão mais nova (2) para o
  // mesmo ciclo/conversa. Isso É o gap: quem chama este endpoint com um
  // analysis_job_id desatualizado nunca fica sabendo que está obsoleto.
  // (Campo movido de `result.result.strategy.suggested_message` para
  // `result.result.suggested_message` — o novo DTO seller-facing expõe
  // `suggested_message` no topo, não mais aninhado em `strategy`.)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.candidate_state_version, 1)
  assert.match(result.result.suggested_message, /ANTES da edição/)

  // Documentação executável do gap: nenhuma tabela de estado corrente é
  // consultada pela função.
  const readerSource = await (await import('node:fs/promises')).readFile(
    new URL('./companion-analysis-job-reader.ts', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    readerSource,
    /companion_commercial_states\b/,
    'FAIL DE CONTRATO (documentado, não corrigido por esta frente): loadCompanionAnalysisJobStatus nunca compara ' +
      'o candidate_state_version do job com o estado CORRENTE do ciclo (companion_commercial_states) — um job ' +
      '"succeeded" antigo é servido como resultado válido para sempre, mesmo que um job mais novo já tenha ' +
      'produzido uma versão mais atual para o mesmo (company_id, cycle_id, conversation_key). A defesa real hoje ' +
      'está inteiramente no lado do cliente (extensão), que só reaplica um resultado se o analysis_job_id ainda ' +
      'for o que a UI está esperando — não há nenhuma segunda barreira no servidor. Isso é exatamente a classe de ' +
      'risco descrita nos cenários T16 (edit), T17 (delete), T18 (restore) e T19 (audio transcription) do mandato: ' +
      'qualquer mutação de conversa que gere um watermark novo enquanto um job antigo ainda está em voo, ou ainda ' +
      'acessível por um cliente que não atualizou seu analysis_job_id, pode ser servida como resultado corrente ' +
      'sem nenhum aviso de obsolescência.',
  )
})
