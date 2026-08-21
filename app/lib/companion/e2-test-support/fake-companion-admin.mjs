// Cliente Supabase falso, reutilizado pelos testes de rota da E2
// (create-lead, resolve-lead, message-action, transcribe-audio).
//
// Design: uma fila ORDENADA de "passos" esperados. Cada chamada real que a
// rota faz (`admin.from(table)...`) consome o próximo passo da fila; se a
// tabela ou o método não baterem com o que o passo espera, o teste falha
// com uma mensagem explícita (em vez de silenciosamente devolver dado
// errado) — isso mantém os testes honestos sobre a ORDEM real das
// chamadas que a rota faz, sem exigir reimplementar um banco de verdade.
//
// Não depende de nenhum pacote novo — é só JavaScript simulando a forma
// mínima da API encadeada do `@supabase/supabase-js` que as rotas usam
// (`select/insert/update/delete/eq/in/order/limit/maybeSingle`, e o
// próprio builder sendo "thenable" para os `await` sem `.maybeSingle()`).

function createBuilder(table, { calls, nextStep }) {
  const state = { table, method: null, filters: [] }

  async function resolveStep() {
    calls.push({ table, method: state.method, filters: state.filters, payload: state.payload })

    const step = nextStep(table, state.method)
    const result = await (typeof step.respond === 'function' ? step.respond(state) : step.respond)

    return {
      data: result.data ?? null,
      error: result.error ?? null,
    }
  }

  const builder = {
    select() {
      if (!state.method) {
        state.method = 'select'
      }
      return builder
    },
    insert(payload) {
      state.method = 'insert'
      state.payload = payload
      return builder
    },
    update(payload) {
      state.method = 'update'
      state.payload = payload
      return builder
    },
    delete() {
      state.method = 'delete'
      return builder
    },
    eq(column, value) {
      state.filters.push({ op: 'eq', column, value })
      return builder
    },
    in(column, values) {
      state.filters.push({ op: 'in', column, values })
      return builder
    },
    order() {
      return builder
    },
    limit() {
      return builder
    },
    async maybeSingle() {
      const { data, error } = await resolveStep()
      const single = Array.isArray(data) ? (data[0] ?? null) : data
      return { data: single, error }
    },
    then(resolve, reject) {
      return resolveStep().then(resolve, reject)
    },
  }

  return builder
}

export function createStepAdmin(steps) {
  const remaining = [...steps]
  const calls = []

  function nextStep(table, method) {
    const step = remaining.shift()

    if (!step) {
      throw new Error(
        `[fake-companion-admin] fila de passos vazia — chamada inesperada: tabela="${table}" método="${method}"`,
      )
    }

    if (step.table !== table) {
      throw new Error(
        `[fake-companion-admin] esperava tabela "${step.table}" (método "${step.method ?? '?'}"), recebida "${table}" (método "${method}")`,
      )
    }

    if (step.method && step.method !== method) {
      throw new Error(
        `[fake-companion-admin] esperava método "${step.method}" na tabela "${table}", recebido "${method}"`,
      )
    }

    return step
  }

  const admin = {
    from(table) {
      return createBuilder(table, { calls, nextStep })
    },
  }

  return { admin, calls, remaining }
}

export function selectStep(table, data, error = null) {
  return { table, method: 'select', respond: () => ({ data, error }) }
}

export function insertStep(table, data, error = null) {
  return { table, method: 'insert', respond: () => ({ data, error }) }
}

export function updateStep(table, data = null, error = null) {
  return { table, method: 'update', respond: () => ({ data, error }) }
}

export function deleteStep(table, error = null) {
  return { table, method: 'delete', respond: () => ({ data: null, error }) }
}
