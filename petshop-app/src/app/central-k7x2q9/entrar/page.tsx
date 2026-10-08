import { redirect } from 'next/navigation'
import { getPlatformAdmin } from '@/lib/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import EntrarInterno from './EntrarInterno'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Entrar', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function PaginaEntrarInterno() {
  // Já logado como administrador: direto pro painel.
  if (await getPlatformAdmin()) redirect(ROTA_INTERNA)
  return <EntrarInterno />
}
