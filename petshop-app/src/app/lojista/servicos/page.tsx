import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import ServicosList from '@/components/lojista/ServicosList'
import ServicosAdicionais from '@/components/lojista/ServicosAdicionais'
import { COLUNAS_ADICIONAL, lerAdicionais } from '@/lib/adicionais'
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

  const [{ data: servicos }, adicionais] = await Promise.all([
    supabase
      .from('servico')
      .select('*')
      .eq('id_lojista', contexto.idLojista)
      // Serviço excluído (migration 081) fica só no histórico e no relatório.
      .is('excluido_em', null)
      .order('created_at', { ascending: false }),
    // Serviços adicionais (migration 095). Sem a migration a consulta falha
    // e a seção não aparece — a tela de Serviços segue como era.
    supabase
      .from('servico_adicional')
      .select(COLUNAS_ADICIONAL)
      .eq('id_lojista', contexto.idLojista)
      .is('excluido_em', null)
      .order('created_at', { ascending: false }),
  ])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Serviços</h1>
        <p className="page-subtitle">Gerencie os serviços do seu petshop</p>
      </div>
      <ServicosList servicos={servicos ?? []} />
      {!adicionais.error && (
        <ServicosAdicionais
          adicionais={lerAdicionais(adicionais.data)}
          servicos={(servicos ?? []).map(s => ({ id_servico: s.id_servico as string, nome: s.nome as string }))}
          podeExcluir={contexto.role === 'lojista' || contexto.acessoTotal}
        />
      )}
    </>
  )
}
