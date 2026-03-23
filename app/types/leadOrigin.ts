/**
 * Modos de entrada de um lead no CRM.
 * Deve refletir exatamente os valores aceitos pela constraint leads_entry_mode_check.
 */
export type EntryMode =
  | 'manual'
  | 'import_excel'
  | 'import_api'
  | 'webhook'
  | 'crm_migration'
  | 'unknown'

export const ENTRY_MODE_LABELS: Record<EntryMode, string> = {
  manual: 'Cadastro manual',
  import_excel: 'Importação Excel',
  import_api: 'Importação via API',
  webhook: 'Webhook externo',
  crm_migration: 'Migração de CRM',
  unknown: 'Desconhecido',
}
