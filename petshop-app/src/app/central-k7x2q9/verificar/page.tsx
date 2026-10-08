import { notFound, redirect } from 'next/navigation'
import { getPlatformAdmin, segundoFatorOk } from '@/lib/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import Verificar2FA from './Verificar2FA'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Verificação', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function PaginaVerificar() {
  if (!(await getPlatformAdmin())) notFound()
  if (await segundoFatorOk()) redirect(ROTA_INTERNA)
  return <Verificar2FA />
}
