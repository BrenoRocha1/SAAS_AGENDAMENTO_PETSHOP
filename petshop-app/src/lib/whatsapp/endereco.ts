import { headers } from 'next/headers'

// Endereço público do site: é ele que a Meta (ou o servidor da conexão por
// QR code) chama para entregar as mensagens. Em produção vem de
// NEXT_PUBLIC_SITE_URL; sem ela, do endereço em que a página foi aberta.
export async function enderecoDoSite(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocolo}://${host}`
}
