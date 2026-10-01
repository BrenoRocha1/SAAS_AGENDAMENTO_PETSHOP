// Endereço do painel web (o mesmo NEXT_PUBLIC_SITE_URL do site), usado
// pelo que só existe lá: link de acompanhamento que vai no WhatsApp,
// "esqueci minha senha" e o cálculo de distância das rotas (a chave do
// Google Maps é só do servidor). Sem ele o app funciona — esses atalhos
// é que ficam indisponíveis.
const bruto = (process.env.EXPO_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '')

export const SITE_URL: string | null = /^https?:\/\//i.test(bruto) ? bruto : null

export function urlDoSite(caminho: string): string | null {
  return SITE_URL ? `${SITE_URL}${caminho.startsWith('/') ? caminho : `/${caminho}`}` : null
}
