/**
 * Feature Flags — Fase 0
 *
 * Constantes de controle de funcionalidades futuras.
 * Todas as flags estão desabilitadas (false) por padrão.
 * Nenhuma dessas constantes está em uso pelo runtime ainda.
 *
 * Consulte docs/product/lead-lifecycle.md para o contexto completo.
 */

/** Habilita campos de ganho estendidos (won_owner, revenue date override) na UI */
export const ENABLE_WON_FIELDS = false

/** Habilita reativação de leads ganhos/perdidos durante reimportação Excel */
export const ENABLE_IMPORT_REACTIVATE = false

/** Habilita override manual de receita por Admin com trilha de auditoria */
export const ENABLE_REVENUE_OVERRIDES = false
