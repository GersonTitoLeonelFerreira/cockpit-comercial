import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
  isPositiveStateVersion,
  isStatefulCommercialMemoryStatus,
  type StatefulCommercialCommitment,
  type StatefulCommercialFact,
  type StatefulCommercialMemoryBase,
  type StatefulCommercialObservedItem,
  type StatefulCommercialOpenLoop,
} from '@/app/lib/companion/stateful-commercial-state'

import {
  isStatefulCopilotCommitmentStatus,
  isStatefulCopilotConfidence,
} from '@/app/lib/companion/stateful-copilot-contract'

const CYCLE_COMMERCIAL_MEMORY_STATE_FIELDS = [
  'id',
  'company_id',
  'cycle_id',
  'conversation_key',
  'state_version',
  'state_contract_version',
  'state_updated_at',
  'state_snapshot',
].join(',')

const CYCLE_COMMERCIAL_MEMORY_EVENT_FIELDS = [
  'id',
  'state_record_id',
  'company_id',
  'cycle_id',
  'conversation_key',
  'candidate_state_version',
  'state_contract_version',
  'state_snapshot',
].join(',')

const CYCLE_MEMORY_STATE_PAGE_SIZE =
  500

const MAX_CYCLE_MEMORY_STATE_ROWS =
  10000

const CYCLE_MEMORY_EVENT_PAGE_SIZE =
  500

const MAX_CYCLE_MEMORY_EVENT_ROWS =
  10000

type JsonRecord =
  Record<string, unknown>

type SupabasePageResult = {
  data: unknown
  error: unknown
}

export type CycleCommercialMemoryProvenance = {
  conversation_key: string
  state_record_id: string
  state_version: number
}

export type CycleCommercialMemoryItem<
  T extends StatefulCommercialMemoryBase,
> =
  Omit<T, 'id'> & {
    memory_id: string
    origin_id: string
    provenance: CycleCommercialMemoryProvenance
  }

export type CanonicalCycleCommercialMemory = {
  company_id: string
  cycle_id: string
  reference_time: string

  conversation_keys: string[]

  facts:
    CycleCommercialMemoryItem<StatefulCommercialFact>[]

  needs:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]

  open_loops:
    CycleCommercialMemoryItem<StatefulCommercialOpenLoop>[]

  objections:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]

  commitments:
    CycleCommercialMemoryItem<StatefulCommercialCommitment>[]

  signals:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]

  uncertainties:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]
}

type ParsedMemoryRow = {
  provenance: CycleCommercialMemoryProvenance
  snapshot: JsonRecord
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeDateOrNull(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp =
    Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp).toISOString()
}

function readNonEmptyString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function readNullableString(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null) {
    return { ok: true, value: null }
  }

  if (typeof value === 'string') {
    return { ok: true, value }
  }

  return { ok: false }
}

function readStringArray(
  value: unknown,
): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const result: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') {
      return null
    }

    result.push(item)
  }

  return result
}

/**
 * Pagina uma consulta inteira via `.range(...)`, parando na primeira
 * página menor que `pageSize` (fim dos dados). Retorna `null` (nunca
 * lança) se qualquer página falhar ou se o total ultrapassar
 * `maxRows` — o mesmo padrão de segurança já usado por
 * loadLedgerRows em stateful-copilot-real-context-loader.ts, adaptado
 * para o contrato best-effort deste módulo (degrada para `null` em
 * vez de lançar, já que aqui uma leitura indisponível nunca deve
 * derrubar o chamador).
 */
async function readAllPages({
  pageSize,
  maxRows,
  fetchPage,
}: {
  pageSize: number
  maxRows: number
  fetchPage: (
    offset: number,
    limit: number,
  ) => PromiseLike<SupabasePageResult>
}): Promise<unknown[] | null> {
  const rows: unknown[] = []

  let offset = 0

  while (true) {
    const {
      data,
      error,
    } =
      await fetchPage(
        offset,
        pageSize,
      )

    if (
      error ||
      !Array.isArray(data)
    ) {
      return null
    }

    rows.push(
      ...data,
    )

    if (rows.length > maxRows) {
      return null
    }

    if (data.length < pageSize) {
      break
    }

    offset += pageSize
  }

  return rows
}

function parseSnapshot(
  rawSnapshot: unknown,
  cycleId: string,
): JsonRecord | null {
  if (!isRecord(rawSnapshot)) {
    return null
  }

  if (
    rawSnapshot.contract_version !==
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION ||
    rawSnapshot.cycle_id !== cycleId
  ) {
    return null
  }

  return rawSnapshot
}

/**
 * Valida somente os campos de identidade de uma linha de
 * `companion_commercial_states` (sem validar o state_snapshot ainda)
 * e devolve `state_updated_at` bruto para a classificação
 * fresh/drifted em `loadCanonicalCycleCommercialMemory`. Uma linha
 * "drifted" (versão atual gravada depois de reference_time) usa o
 * fallback histórico em companion_commercial_state_events — para essa
 * linha o `state_snapshot` atual nunca chega a ser lido, então não
 * faz sentido validá-lo aqui.
 */
function parseCurrentStateIdentity({
  row,
  companyId,
  cycleId,
}: {
  row: unknown
  companyId: string
  cycleId: string
}): {
  stateRecordId: string
  conversationKey: string
  stateVersion: number
  stateUpdatedAt: string
  rawSnapshot: unknown
} | null {
  if (!isRecord(row)) {
    return null
  }

  const stateRecordId =
    readNonEmptyString(row.id)

  const rowCompanyId =
    readNonEmptyString(row.company_id)

  const rowCycleId =
    readNonEmptyString(row.cycle_id)

  const conversationKey =
    readNonEmptyString(
      row.conversation_key,
    )

  const stateContractVersion =
    readNonEmptyString(
      row.state_contract_version,
    )

  const stateUpdatedAt =
    readNonEmptyString(
      row.state_updated_at,
    )

  if (
    !stateRecordId ||
    !rowCompanyId ||
    !rowCycleId ||
    !conversationKey ||
    !stateContractVersion ||
    !stateUpdatedAt ||
    rowCompanyId !== companyId ||
    rowCycleId !== cycleId ||
    stateContractVersion !==
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION ||
    !isPositiveStateVersion(
      row.state_version,
    ) ||
    !Number.isFinite(
      Date.parse(stateUpdatedAt),
    )
  ) {
    return null
  }

  return {
    stateRecordId,
    conversationKey,
    stateVersion:
      row.state_version,
    stateUpdatedAt,
    rawSnapshot:
      row.state_snapshot,
  }
}

/**
 * Valida uma linha de `companion_commercial_state_events` (o
 * histórico versionado, nunca atualizado em lugar) e a converte no
 * mesmo formato {provenance, snapshot} usado pelas linhas atuais de
 * `companion_commercial_states`.
 */
function parseHistoricalEventRow({
  row,
  companyId,
  cycleId,
}: {
  row: unknown
  companyId: string
  cycleId: string
}): ParsedMemoryRow | null {
  if (!isRecord(row)) {
    return null
  }

  const stateRecordId =
    readNonEmptyString(
      row.state_record_id,
    )

  const rowCompanyId =
    readNonEmptyString(row.company_id)

  const rowCycleId =
    readNonEmptyString(row.cycle_id)

  const conversationKey =
    readNonEmptyString(
      row.conversation_key,
    )

  const stateContractVersion =
    readNonEmptyString(
      row.state_contract_version,
    )

  if (
    !stateRecordId ||
    !rowCompanyId ||
    !rowCycleId ||
    !conversationKey ||
    !stateContractVersion ||
    rowCompanyId !== companyId ||
    rowCycleId !== cycleId ||
    stateContractVersion !==
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION ||
    !isPositiveStateVersion(
      row.candidate_state_version,
    )
  ) {
    return null
  }

  const snapshot =
    parseSnapshot(
      row.state_snapshot,
      cycleId,
    )

  if (!snapshot) {
    return null
  }

  return {
    provenance: {
      conversation_key:
        conversationKey,

      state_record_id:
        stateRecordId,

      state_version:
        row.candidate_state_version,
    },

    snapshot,
  }
}

/**
 * Valida SOMENTE a forma estrutural de um item de memória (id, status,
 * evidence_message_ids, versões de estado) — não revalida se as
 * mensagens referenciadas em evidence_message_ids ainda existem/estão
 * ativas na esteira daquela conversa. Essa revalidação é um conceito
 * por-conversa (exige o ledger daquela conversation_key específica) e
 * fica fora do escopo desta fase: o agregador lê muitas conversas de
 * uma vez e não paga o custo de N ledgers para uma leitura best-effort.
 * Limitação documentada, não uma lacuna silenciosa.
 */
function readMemoryItemBase(
  value: unknown,
): (
  Omit<StatefulCommercialMemoryBase, 'id'> & {
    origin_id: string
  }
) | null {
  if (!isRecord(value)) {
    return null
  }

  const originId =
    readNonEmptyString(value.id)

  const kind =
    readNonEmptyString(value.kind)

  const summary =
    readNonEmptyString(value.summary)

  const evidenceMessageIds =
    readStringArray(
      value.evidence_message_ids,
    )

  if (
    !originId ||
    !kind ||
    !summary ||
    !evidenceMessageIds ||
    !isStatefulCommercialMemoryStatus(
      value.memory_status,
    ) ||
    !isPositiveStateVersion(
      value.created_in_state_version,
    ) ||
    !isPositiveStateVersion(
      value.updated_in_state_version,
    )
  ) {
    return null
  }

  const closedInStateVersion =
    value.closed_in_state_version

  if (
    closedInStateVersion !== null &&
    !isPositiveStateVersion(
      closedInStateVersion,
    )
  ) {
    return null
  }

  return {
    origin_id:
      originId,

    kind,
    summary,

    evidence_message_ids:
      evidenceMessageIds,

    memory_status:
      value.memory_status,

    created_in_state_version:
      value.created_in_state_version,

    updated_in_state_version:
      value.updated_in_state_version,

    closed_in_state_version:
      closedInStateVersion as number | null,
  }
}

function qualifyMemoryId(
  conversationKey: string,
  originId: string,
): string {
  return `${conversationKey}::${originId}`
}

function collectActiveItems<
  T extends StatefulCommercialMemoryBase,
>(
  rawItems: unknown,
  provenance: CycleCommercialMemoryProvenance,
  extendExtra: (
    raw: JsonRecord,
  ) => Omit<
    T,
    keyof StatefulCommercialMemoryBase
  > | null,
): CycleCommercialMemoryItem<T>[] {
  if (!Array.isArray(rawItems)) {
    return []
  }

  const result: CycleCommercialMemoryItem<T>[] =
    []

  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) {
      continue
    }

    const base =
      readMemoryItemBase(rawItem)

    if (
      !base ||
      base.memory_status !== 'active'
    ) {
      continue
    }

    const extra =
      extendExtra(rawItem)

    if (!extra) {
      continue
    }

    const {
      origin_id: originId,
      ...baseRest
    } = base

    result.push({
      ...baseRest,
      ...extra,

      memory_id:
        qualifyMemoryId(
          provenance.conversation_key,
          originId,
        ),

      origin_id:
        originId,

      provenance,
    } as unknown as CycleCommercialMemoryItem<T>)
  }

  return result
}

function sortDeterministically<
  T extends StatefulCommercialMemoryBase,
>(
  items: CycleCommercialMemoryItem<T>[],
): CycleCommercialMemoryItem<T>[] {
  return [...items].sort((a, b) => {
    if (
      a.provenance.conversation_key !==
      b.provenance.conversation_key
    ) {
      return a.provenance.conversation_key <
        b.provenance.conversation_key
        ? -1
        : 1
    }

    if (
      a.created_in_state_version !==
      b.created_in_state_version
    ) {
      return (
        a.created_in_state_version -
        b.created_in_state_version
      )
    }

    return a.origin_id < b.origin_id
      ? -1
      : a.origin_id > b.origin_id
        ? 1
        : 0
  })
}

/**
 * Carrega, para o ciclo inteiro, todas as linhas atuais de
 * `companion_commercial_states` (paginado) e as classifica em:
 * - "fresh": a versão atual já reflete um instante <= reference_time
 *   — usa o snapshot atual diretamente, sem custo adicional.
 * - "drifted": a versão atual foi gravada DEPOIS de reference_time —
 *   `companion_commercial_states` é atualizada em lugar (a RPC faz
 *   UPDATE, não INSERT, a partir da segunda versão), então a linha
 *   atual não representa mais o que essa conversa sabia em
 *   reference_time. Essas conversation_keys precisam do fallback
 *   histórico via companion_commercial_state_events.
 *
 * A comparação fresh/drifted é feita em memória via Date.parse (não
 * comparação lexical de string) — mesma lição da FASE 16.3A: o
 * PostgREST pode serializar o mesmo instante em formatos diferentes
 * (`+00:00` vs `.000Z`), e uma comparação de string ingênua poderia
 * classificar um instante empatado como "no futuro" incorretamente.
 */
async function loadCurrentStateRows({
  admin,
  companyId,
  cycleId,
  referenceTime,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  referenceTime: string
}): Promise<{
  fresh: ParsedMemoryRow[]
  driftedConversationKeys: string[]
} | null> {
  const rows =
    await readAllPages({
      pageSize:
        CYCLE_MEMORY_STATE_PAGE_SIZE,

      maxRows:
        MAX_CYCLE_MEMORY_STATE_ROWS,

      fetchPage: (offset, limit) =>
        admin
          .from(
            'companion_commercial_states',
          )
          .select(
            CYCLE_COMMERCIAL_MEMORY_STATE_FIELDS,
          )
          .eq(
            'company_id',
            companyId,
          )
          .eq(
            'cycle_id',
            cycleId,
          )
          .order(
            'conversation_key',
            { ascending: true },
          )
          .range(
            offset,
            offset + limit - 1,
          ),
    })

  if (rows === null) {
    return null
  }

  const referenceInstant =
    Date.parse(referenceTime)

  const fresh: ParsedMemoryRow[] =
    []

  const driftedConversationKeys: string[] =
    []

  for (const row of rows) {
    const identity =
      parseCurrentStateIdentity({
        row,
        companyId,
        cycleId,
      })

    if (!identity) {
      continue
    }

    const updatedAtInstant =
      Date.parse(
        identity.stateUpdatedAt,
      )

    if (updatedAtInstant <= referenceInstant) {
      const snapshot =
        parseSnapshot(
          identity.rawSnapshot,
          cycleId,
        )

      if (snapshot) {
        fresh.push({
          provenance: {
            conversation_key:
              identity.conversationKey,

            state_record_id:
              identity.stateRecordId,

            state_version:
              identity.stateVersion,
          },

          snapshot,
        })
      }

      continue
    }

    driftedConversationKeys.push(
      identity.conversationKey,
    )
  }

  return {
    fresh,
    driftedConversationKeys,
  }
}

/**
 * Para conversas cuja linha atual já avançou além de reference_time
 * ("drifted"), busca em companion_commercial_state_events (histórico
 * imutável, nunca atualizado em lugar) o evento cujo SNAPSHOT era
 * válido no instante pedido — a fotografia com o maior
 * `state_snapshot.updated_at` que ainda seja `<= reference_time`.
 *
 * IMPORTANTE — por que `state_snapshot.updated_at`, não
 * `generated_at`: em `companion_commercial_states` (linha atual), uma
 * CHECK constraint garante `state_updated_at =
 * (state_snapshot->>'updated_at')::timestamptz`, então os dois
 * sempre coincidem — é seguro usar `state_updated_at` como
 * classificador (ver loadCurrentStateRows). Mas
 * `companion_commercial_state_events` NÃO tem essa constraint: a
 * validação em stateful-copilot-persistence-plan.ts só exige
 * `generated_at >= diagnostic_input.reference_time` (nunca `=`),
 * enquanto `state_snapshot.updated_at` É forçado a ser exatamente
 * `diagnostic_input.reference_time`. Ou seja, `generated_at` é
 * quando o evento foi GRAVADO (pode atrasar — fila, retry, job
 * assíncrono) e `state_snapshot.updated_at` é o instante que a
 * análise CONSIDERA como "agora". Usar `generated_at` para decidir
 * "isto era válido em reference_time" filtra pelo campo errado:
 * um evento com `updated_at` <= reference_time mas `generated_at`
 * tardio seria incorretamente excluído (achado do Codex, PR #277,
 * rodada 2).
 *
 * Por isso a consulta NÃO filtra por instante no banco (não há
 * caminho seguro/já usado no código para filtrar por um campo dentro
 * de state_snapshot via PostgREST aqui) — pagina TODOS os eventos das
 * conversation_keys "drifted" (protegido pelo teto de segurança de
 * readAllPages) e faz a comparação de instante inteiramente em
 * memória via Date.parse.
 *
 * A paginação usa `id` (chave primária, única) como critério de
 * ordenação — não `generated_at`, que pode se repetir entre
 * conversas diferentes. Um critério de ordenação não-único faz o
 * Postgres devolver empates em ordens potencialmente diferentes entre
 * chamadas de `.range()` separadas, duplicando ou pulando linhas na
 * borda de uma página (achado do Codex, PR #277, rodada 2). Como o
 * resultado é varrido por completo (sem parar na primeira ocorrência
 * por conversation_key), a ordem em si não afeta a correção — só a
 * ordenação por chave única garante que cada linha apareça em
 * exatamente uma página.
 *
 * Empate em `state_snapshot.updated_at` entre versões da MESMA
 * conversa é possível e legítimo: `stateful-copilot-input.ts` só
 * rejeita `reference_time` ESTRITAMENTE anterior ao `updated_at` do
 * estado anterior, nunca igual — uma versão nova pode ser produzida
 * no mesmo instante da anterior. Nesse caso o desempate usa
 * `candidate_state_version` (maior vence), não a ordem de chegada da
 * paginação (achado do Codex, PR #277, rodada 3).
 *
 * Escopo deliberado: a busca é restrita às conversation_keys que
 * realmente avançaram (normalmente zero, quando reference_time é
 * "agora"), nunca ao histórico inteiro do ciclo — evita carregar
 * anos de eventos de um ciclo de vida longa para servir uma leitura
 * best-effort.
 */
async function loadHistoricalEventRows({
  admin,
  companyId,
  cycleId,
  referenceTime,
  driftedConversationKeys,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  referenceTime: string
  driftedConversationKeys: string[]
}): Promise<ParsedMemoryRow[] | null> {
  if (driftedConversationKeys.length === 0) {
    return []
  }

  const rows =
    await readAllPages({
      pageSize:
        CYCLE_MEMORY_EVENT_PAGE_SIZE,

      maxRows:
        MAX_CYCLE_MEMORY_EVENT_ROWS,

      fetchPage: (offset, limit) =>
        admin
          .from(
            'companion_commercial_state_events',
          )
          .select(
            CYCLE_COMMERCIAL_MEMORY_EVENT_FIELDS,
          )
          .eq(
            'company_id',
            companyId,
          )
          .eq(
            'cycle_id',
            cycleId,
          )
          .in(
            'conversation_key',
            driftedConversationKeys,
          )
          .order(
            'id',
            { ascending: true },
          )
          .range(
            offset,
            offset + limit - 1,
          ),
    })

  if (rows === null) {
    return null
  }

  const referenceInstant =
    Date.parse(referenceTime)

  const latestPerConversationKey =
    new Map<
      string,
      {
        parsed: ParsedMemoryRow
        updatedAtInstant: number
      }
    >()

  for (const row of rows) {
    const parsed =
      parseHistoricalEventRow({
        row,
        companyId,
        cycleId,
      })

    if (!parsed) {
      continue
    }

    const snapshotUpdatedAt =
      parsed.snapshot.updated_at

    if (typeof snapshotUpdatedAt !== 'string') {
      continue
    }

    const updatedAtInstant =
      Date.parse(snapshotUpdatedAt)

    if (
      !Number.isFinite(
        updatedAtInstant,
      ) ||
      updatedAtInstant > referenceInstant
    ) {
      continue
    }

    const conversationKey =
      parsed.provenance.conversation_key

    const existing =
      latestPerConversationKey.get(
        conversationKey,
      )

    // stateful-copilot-input.ts só rejeita reference_time
    // ESTRITAMENTE anterior ao updated_at do estado anterior
    // (`Date.parse(referenceTime) < Date.parse(previousState.
    // updated_at)`), nunca igual — então duas versões sequenciais da
    // mesma conversa podem legitimamente compartilhar o mesmo
    // state_snapshot.updated_at (candidate_state_version avança, o
    // instante não). Num empate, a versão mais alta é a mais
    // completa (o reducer só adiciona/supersede, nunca remove um
    // item sem registrar isso numa versão nova) — desempatar por
    // `id` (ordem de paginação, alheia à ordem lógica das versões)
    // poderia manter a versão mais antiga. Achado do Codex, PR #277,
    // rodada 3.
    const isBetterCandidate =
      !existing ||
      updatedAtInstant >
        existing.updatedAtInstant ||
      (
        updatedAtInstant ===
          existing.updatedAtInstant &&
        parsed.provenance.state_version >
          existing.parsed.provenance
            .state_version
      )

    if (isBetterCandidate) {
      latestPerConversationKey.set(
        conversationKey,
        {
          parsed,
          updatedAtInstant,
        },
      )
    }
  }

  return [
    ...latestPerConversationKey.values(),
  ].map(
    (entry) => entry.parsed,
  )
}

function collectFromParsedRows(
  parsedRows: ParsedMemoryRow[],
): Omit<
  CanonicalCycleCommercialMemory,
  'company_id' | 'cycle_id' | 'reference_time'
> {
  const facts: CycleCommercialMemoryItem<
    StatefulCommercialFact
  >[] = []

  const needs: CycleCommercialMemoryItem<
    StatefulCommercialObservedItem
  >[] = []

  const openLoops: CycleCommercialMemoryItem<
    StatefulCommercialOpenLoop
  >[] = []

  const objections: CycleCommercialMemoryItem<
    StatefulCommercialObservedItem
  >[] = []

  const commitments: CycleCommercialMemoryItem<
    StatefulCommercialCommitment
  >[] = []

  const signals: CycleCommercialMemoryItem<
    StatefulCommercialObservedItem
  >[] = []

  const uncertainties: CycleCommercialMemoryItem<
    StatefulCommercialObservedItem
  >[] = []

  const conversationKeys: string[] =
    []

  for (const {
    provenance,
    snapshot,
  } of parsedRows) {
    conversationKeys.push(
      provenance.conversation_key,
    )

    facts.push(
      ...collectActiveItems<
        StatefulCommercialFact
      >(
        snapshot.facts,
        provenance,
        (raw) => {
          const value =
            raw.value === null ||
            typeof raw.value === 'string'
              ? raw.value
              : undefined

          if (
            value === undefined ||
            !isStatefulCopilotConfidence(
              raw.confidence,
            )
          ) {
            return null
          }

          return {
            value,
            confidence:
              raw.confidence,
          }
        },
      ),
    )

    const observed = (
      rawItems: unknown,
    ) =>
      collectActiveItems<
        StatefulCommercialObservedItem
      >(
        rawItems,
        provenance,
        (raw) => {
          if (
            !isStatefulCopilotConfidence(
              raw.confidence,
            )
          ) {
            return null
          }

          return {
            confidence:
              raw.confidence,
          }
        },
      )

    needs.push(
      ...observed(snapshot.needs),
    )

    objections.push(
      ...observed(
        snapshot.objections,
      ),
    )

    signals.push(
      ...observed(snapshot.signals),
    )

    uncertainties.push(
      ...observed(
        snapshot.uncertainties,
      ),
    )

    openLoops.push(
      ...collectActiveItems<
        StatefulCommercialOpenLoop
      >(
        snapshot.open_loops,
        provenance,
        () => ({}),
      ),
    )

    commitments.push(
      ...collectActiveItems<
        StatefulCommercialCommitment
      >(
        snapshot.commitments,
        provenance,
        (raw) => {
          const scheduledAt =
            readNullableString(
              raw.scheduled_at,
            )

          const proposedAt =
            readNullableString(
              raw.proposed_at,
            )

          if (
            !isStatefulCopilotCommitmentStatus(
              raw.commitment_status,
            ) ||
            !scheduledAt.ok ||
            !proposedAt.ok
          ) {
            return null
          }

          return {
            commitment_status:
              raw.commitment_status,
            scheduled_at:
              scheduledAt.value,
            proposed_at:
              proposedAt.value,
          }
        },
      ),
    )
  }

  return {
    conversation_keys:
      [...new Set(conversationKeys)].sort(),

    facts:
      sortDeterministically(facts),

    needs:
      sortDeterministically(needs),

    open_loops:
      sortDeterministically(
        openLoops,
      ),

    objections:
      sortDeterministically(
        objections,
      ),

    commitments:
      sortDeterministically(
        commitments,
      ),

    signals:
      sortDeterministically(
        signals,
      ),

    uncertainties:
      sortDeterministically(
        uncertainties,
      ),
  }
}

/**
 * Lê a memória comercial ATIVA de um ciclo consolidada através de
 * TODAS as conversas (conversation_key) que já persistiram estado
 * para ele — não apenas a conversa que está lendo agora.
 *
 * `companion_commercial_states` guarda um registro por
 * (company_id, cycle_id, conversation_key): a mesma oportunidade
 * discutida em dois canais (ex.: WhatsApp e ligação) produz duas
 * linhas independentes, cada uma com sua própria série de versões.
 * Sem este agregador, um fato ativo registrado na Conversation A fica
 * invisível para quem está na Conversation B do mesmo ciclo.
 *
 * IMPORTANTE — isolamento de identidade: o identificador de cada item
 * (`id` dentro do state_snapshot) é gerado deterministicamente a
 * partir de (cycle_id, collection, state_version, item_index) — SEM
 * conversation_key (ver createDeterministicStatefulCommercialMemoryId
 * em stateful-copilot-composition.ts). Duas conversas do mesmo ciclo
 * podem legitimamente colidir no mesmo `id` bruto ao descreverem
 * itens completamente diferentes (cada uma tem seu próprio contador
 * de versão começando em 1). Por isso este agregador NUNCA expõe o
 * `id` bruto como chave de leitura: todo item ganha um `memory_id`
 * qualificado por `${conversation_key}::${id}`, eliminando colisão
 * por construção e preservando a proveniência original em
 * `origin_id` + `provenance`.
 *
 * IMPORTANTE — leitura histórica em reference_time: como
 * `companion_commercial_states` é atualizada em lugar (a RPC de
 * persistência faz UPDATE a partir da segunda versão, nunca INSERT),
 * a linha atual de uma conversa pode já ter avançado para depois de
 * `reference_time` (jobs atrasados, replay). Para essas conversas
 * ("drifted"), a leitura cai para companion_commercial_state_events
 * — o histórico imutável — e usa o evento cujo `state_snapshot.
 * updated_at` (não `generated_at`, que pode divergir — ver
 * loadHistoricalEventRows) é o maior valor ainda `<= reference_time`,
 * em vez de simplesmente descartar a conversa inteira. Ver
 * loadCurrentStateRows/loadHistoricalEventRows.
 *
 * Toda consulta é paginada via `.range(...)` (mesmo padrão de
 * loadLedgerRows em stateful-copilot-real-context-loader.ts) com um
 * teto de segurança — excedê-lo degrada para `null` (best-effort),
 * nunca retorna uma leitura silenciosamente incompleta.
 *
 * Escopo deliberado desta leitura (documentado no próprio módulo, não
 * uma lacuna silenciosa):
 * - Somente itens com `memory_status: 'active'` são retornados.
 *   Resolved/superseded em uma conversa nunca reaparecem como ativos
 *   aqui, mesmo que outra conversa nunca os tenha fechado.
 * - A validação de cada item é estrutural (shape, status, versões).
 *   NÃO revalida se evidence_message_ids ainda pertence ao ledger
 *   ativo daquela conversa específica — isso exigiria carregar o
 *   ledger de cada conversation_key contribuinte, o que esta leitura
 *   best-effort e multi-conversa não faz nesta fase.
 * - "Mesma informação com ids diferentes" (duas conversas descrevendo
 *   o mesmo fato com ids distintos) NÃO é deduplicada: não existe no
 *   contrato atual nenhuma noção de equivalência semântica entre
 *   itens, então os dois convivem na leitura (coexistência), com
 *   proveniência própria cada um.
 * - Não promove memória de ciclo para memória de pessoa (e
 *   vice-versa): este agregador nunca cruza cycle_id. A herança
 *   entre ciclos continua sendo exclusivamente responsabilidade do
 *   contrato já endurecido em loadDurableMemorySeedForMissingState
 *   (FASE 16.3A), que este módulo não toca.
 * - Vazamento entre leads/empresas é estruturalmente impossível: a
 *   consulta filtra por (company_id, cycle_id) exatos, e um cycle_id
 *   pertence a exatamente um lead (sales_cycles.lead_id, FK fixa) e a
 *   exatamente uma company_id (sales_cycles_lead_id_fkey +
 *   companion_commercial_states_cycle_fkey).
 *
 * Este módulo é somente leitura. Desde a FASE 16.4, é chamado pelo
 * orquestrador canônico (`canonical-integrated-commercial-context-
 * source.ts`, que alimenta ANÁLISE) e, indiretamente, por Decision
 * State/AGORA (`canonical-decision-state-source.ts`) — nunca pelo
 * MIE nem por Commercial Reading, que permanecem fora do alcance
 * deste agregador (achado da auditoria FASE 16.8, mandato §6).
 */
export async function loadCanonicalCycleCommercialMemory({
  admin,
  company_id,
  cycle_id,
  reference_time,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  reference_time: string
}): Promise<CanonicalCycleCommercialMemory | null> {
  const referenceTime =
    normalizeDateOrNull(reference_time)

  if (!referenceTime) {
    return null
  }

  try {
    const currentRows =
      await loadCurrentStateRows({
        admin,
        companyId: company_id,
        cycleId: cycle_id,
        referenceTime,
      })

    if (currentRows === null) {
      return null
    }

    const historicalRows =
      await loadHistoricalEventRows({
        admin,
        companyId: company_id,
        cycleId: cycle_id,
        referenceTime,
        driftedConversationKeys:
          currentRows
            .driftedConversationKeys,
      })

    if (historicalRows === null) {
      return null
    }

    const collected =
      collectFromParsedRows([
        ...currentRows.fresh,
        ...historicalRows,
      ])

    return {
      company_id,
      cycle_id,
      reference_time:
        referenceTime,

      ...collected,
    }
  } catch (error) {
    console.error(
      '[CANONICAL_CYCLE_COMMERCIAL_MEMORY] lookup or aggregation failed, continuing without cycle memory',
      {
        company_id,
        cycle_id,
        error,
      },
    )

    return null
  }
}
