import { createClient } from '@/lib/supabase/server'
import ServicosList from '@/components/lojista/ServicosList'
import { obterContextoLojista } from '@/lib/lojista-context'
import { IconScissors } from '@/components/icons'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Serviços' }

export default async function ServicosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarServicos) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Serviços</h1>
        </div>
        <div className="empty-state card">
          <IconScissors style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para gerenciar serviços</div>
          <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
        </div>
      </>
    )
  }

  const { data: servicos } = await supabase
    .from('servico')
    .select('*')
    .eq('id_lojista', contexto.idLojista)
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Serviços</h1>
        <p className="page-subtitle">Gerencie os serviços do seu petshop</p>
      </div>
      <ServicosList servicos={servicos ?? []} />
    </>
  )
}
