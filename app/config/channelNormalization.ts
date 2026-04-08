/**
 * Mapa de normalização de canal.
 *
 * Duas origens de dados coexistem:
 * 1. QuickActionModal → metadata.channel ('whatsapp' | 'copy')
 * 2. StageCheckpointModal/LostDealModal → checkpoint.action_channel
 *    ('Whats' | 'Ligação' | 'Email' | 'Presencial' | 'DM' | 'Outro')
 *
 * Decisão sobre 'copy':
 * - 'copy' significa que o vendedor copiou o telefone para ligar ou usar outro app.
 * - NÃO é um canal de comunicação real — é uma ação intermediária.
 * - Normalizar como 'Outro' para não poluir o relatório com um pseudo-canal.
 */

export const CHANNEL_NORMALIZE_MAP: Record<string, string> = {
  // QuickActionModal values
  whatsapp: 'WhatsApp',
  copy: 'Outro', // Copiar telefone não é canal comercial — agrupar como Outro

  // StageCheckpointModal / LostDealModal values
  Whats: 'WhatsApp',
  'Ligação': 'Ligação',
  Email: 'Email',
  Presencial: 'Presencial',
  DM: 'DM',
  Outro: 'Outro',
}

/** Todos os canais canônicos na ordem de exibição */
export const CANONICAL_CHANNELS = ['WhatsApp', 'Ligação', 'Email', 'Presencial', 'DM', 'Outro'] as const
export type CanonicalChannel = typeof CANONICAL_CHANNELS[number]

/** Cores por canal canônico */
export const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: '#25d366',
  'Ligação': '#60a5fa',
  Email: '#a78bfa',
  Presencial: '#fbbf24',
  DM: '#f472b6',
  Outro: '#6b7280',
}

/** Labels pt-BR (já canônicos, mas útil para referência) */
export const CHANNEL_LABELS: Record<string, string> = {
  WhatsApp: 'WhatsApp',
  'Ligação': 'Ligação',
  Email: 'Email',
  Presencial: 'Presencial',
  DM: 'DM (mensagem direta)',
  Outro: 'Outro',
}

/**
 * Normaliza um valor de canal para o formato canônico.
 * Aceita valores de ambas origens (QuickActionModal e StageCheckpointModal).
 * Retorna null se o valor não existe ou é vazio.
 */
export function normalizeChannel(raw: unknown): CanonicalChannel | null {
  if (raw == null) return null
  const str = String(raw).trim()
  if (!str) return null

  // Lookup direto
  const mapped = CHANNEL_NORMALIZE_MAP[str]
  if (mapped) return mapped as CanonicalChannel

  // Case-insensitive fallback
  const lower = str.toLowerCase()
  for (const [key, value] of Object.entries(CHANNEL_NORMALIZE_MAP)) {
    if (key.toLowerCase() === lower) return value as CanonicalChannel
  }

  // Valor desconhecido → Outro
  return 'Outro'
}

/**
 * Extrai e normaliza o canal de um evento, unificando as duas origens:
 * 1. checkpoint.action_channel (StageCheckpointModal / LostDealModal)
 * 2. metadata.channel (QuickActionModal)
 *
 * Prioridade: action_channel > channel (checkpoint é mais estruturado)
 */
export function extractChannelFromEvent(metadata: Record<string, unknown>): CanonicalChannel | null {
  // Tenta extrair de checkpoint (formato 1: metadata.checkpoint, formato 2: metadata.metadata)
  const checkpoint = (
    (metadata.checkpoint && typeof metadata.checkpoint === 'object' ? metadata.checkpoint : null) ??
    (metadata.metadata && typeof metadata.metadata === 'object' ? metadata.metadata : null) ??
    {}
  ) as Record<string, unknown>

  const fromCheckpoint = normalizeChannel(checkpoint.action_channel)
  if (fromCheckpoint) return fromCheckpoint

  // Fallback: metadata.channel (QuickActionModal)
  const fromMeta = normalizeChannel(metadata.channel)
  if (fromMeta) return fromMeta

  // Tenta action_channel no nível raiz da metadata (formato legado)
  const fromRoot = normalizeChannel(metadata.action_channel)
  if (fromRoot) return fromRoot

  return null
}
