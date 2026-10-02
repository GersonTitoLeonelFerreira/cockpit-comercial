// Leitura completa no painel (HML): só existe com
// COMPANION_FULL_READING_PANEL=on E VERCEL_ENV=preview. Módulo leve, sem
// dependência do resto da leitura, para rotas que só precisam saber se a
// flag está ligada (ex.: resolve-lead, successor-opportunity).

export type FullReadingFlagEnv =
  Record<string, string | undefined>

export function isFullReadingPanelEnabled(
  env: FullReadingFlagEnv = process.env,
): boolean {
  return (
    env.COMPANION_FULL_READING_PANEL === 'on' &&
    env.VERCEL_ENV === 'preview'
  )
}
