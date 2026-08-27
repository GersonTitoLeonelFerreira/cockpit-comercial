/**
 * Guarda de revisão para autosave (seção 3.2 e 23) — "latest local edit
 * wins" implementado como funções puras (fáceis de testar sem React).
 *
 * Fluxo:
 *   edição local        → bumpRevision()      → revision N
 *   save N inicia        → beginSave()         → sentRevision = N
 *   usuário continua digitando → bumpRevision() → revision N+1
 *   resposta do save N chega   → applySaveResult(sentRevision=N)
 *                                → como revision atual (N+1) !== N,
 *                                  o retorno do servidor é descartado;
 *                                  o estado local (N+1) nunca é sobrescrito.
 */

export interface RevisionGuardState<T> {
  revision: number
  data: T
}

export function createRevisionGuardState<T>(data: T): RevisionGuardState<T> {
  return { revision: 0, data }
}

export function bumpRevision<T>(
  state: RevisionGuardState<T>,
  nextData: T,
): RevisionGuardState<T> {
  return { revision: state.revision + 1, data: nextData }
}

export function beginSave<T>(state: RevisionGuardState<T>): number {
  return state.revision
}

/**
 * Aplica o resultado de um save iniciado em `sentRevision`. Se o estado
 * local avançou desde então (o usuário continuou editando enquanto o
 * request estava em voo), o snapshot do servidor é descartado e o estado
 * local mais novo é preservado — apenas retorna `applied: false` para que o
 * chamador saiba que precisa agendar um novo save com o estado atual.
 */
export function applySaveResult<T>(
  state: RevisionGuardState<T>,
  sentRevision: number,
  serverData: T,
): { state: RevisionGuardState<T>; applied: boolean } {
  if (sentRevision !== state.revision) {
    return { state, applied: false }
  }

  return { state: { revision: state.revision, data: serverData }, applied: true }
}

export function isStale<T>(state: RevisionGuardState<T>, sentRevision: number): boolean {
  return sentRevision !== state.revision
}
