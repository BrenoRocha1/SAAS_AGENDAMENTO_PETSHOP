import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PerfilLojistaForm from '@/components/lojista/PerfilLojistaForm'
import LogoLojaUpload from '@/components/lojista/LogoLojaUpload'
import { IconSettings } from '@/components/icons'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Perfil da Loja' }

export default async function PerfilLojistaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: lojista } = await supabase
    .from('lojista')
    .select('*')
    .eq('id_lojista', user!.id)
    .single()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Perfil da Loja</h1>
        <p className="page-subtitle">Atualize as informações do seu estabelecimento</p>
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>
        Procurando o Kanban ou o agendamento online? Isso agora fica em{' '}
        <Link href="/lojista/configuracoes" style={{ color: 'var(--primary-400)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconSettings style={{ width: 13, height: 13 }} /> Configurações
        </Link>.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <LogoLojaUpload logoUrlInicial={lojista?.logo_url ?? null} />
        <PerfilLojistaForm lojista={lojista} />
      </div>
    </>
  )
}
