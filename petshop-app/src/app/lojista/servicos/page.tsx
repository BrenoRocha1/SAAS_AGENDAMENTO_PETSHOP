import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import ServicosList from '@/components/lojista/ServicosList'
import { obterContextoLojista } from '@/lib/lojista-context'
import type { Metadata } from 'next'
import Ilustracao from '@/components/Ilustracao'

export const metadata: Metadata = { title: 'Serviços' }

export default async function ServicosPage() {
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarServicos) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Serviços</h1>
        </div>
        <div className="empty-state card">
          <Ilustracao nome="sem-permissao" />
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
    // Serviço excluído (migration 081) fica só no histórico e no relatório.
    .is('excluido_em', null)
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
