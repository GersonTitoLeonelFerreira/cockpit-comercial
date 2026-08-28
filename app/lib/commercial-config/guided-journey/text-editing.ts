/**
 * Edição textual lossless (seções 3.1 e 24).
 *
 * A causa raiz do bug do hotfix anterior era aplicar `.trim()` e
 * `.filter(Boolean)` durante o `onChange`, o que fazia "Acesso " virar
 * "Acesso" a cada tecla digitada. A regra da Jornada Guiada:
 *
 *   edição local = lossless
 *
 * `editingTextToLines` NUNCA remove espaços, linhas vazias ou caracteres —
 * ela apenas divide por linha. A normalização (trim + remoção de linhas
 * vazias) só deve acontecer na cópia destinada à persistência final (ex.:
 * `buildCommercialMethodDefinitionFromConstruction`, que já usa
 * `cleanList`) — nunca no valor controlado durante a digitação.
 */

export function editingTextToLines(value: string): string[] {
  return value.split('\n')
}

export function linesToEditingText(value: string[]): string {
  return value.join('\n')
}

/**
 * Normalização apenas para exibição/consumo final (resumo de capítulo,
 * construção do método). Nunca usar isso no `onChange` de um campo em
 * edição.
 */
export function normalizeLinesForFinalization(value: string[]): string[] {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)))
}
