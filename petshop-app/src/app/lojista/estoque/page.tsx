import { createClient } from '@/lib/supabase/server'
import EstoqueGrid from '@/components/lojista/EstoqueGrid'
import { obterContextoLojista } from '@/lib/lojista-context'
import { IconPackage } from '@/components/icons'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Estoque' }

export default async function EstoquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarServicos) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Estoque</h1>
        </div>
        <div className="empty-state card">
          <IconPackage style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para gerenciar estoque</div>
          <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
        </div>
      </>
    )
  }

  // Ver comentário equivalente em lojista/produtos/page.tsx: categoria
  // é resolvida no cliente por id_categoria, sem embed no select.
  const [{ data: produtos }, { data: categorias }] = await Promise.all([
    supabase
      .from('produto')
      .select('*')
      .eq('id_lojista', contexto.idLojista)
      .eq('status', 'Ativo')
      .order('nome'),
    supabase
      .from('categoria_produto')
      .select('id_categoria, nome')
      .eq('id_lojista', contexto.idLojista)
      .order('nome'),
  ])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Estoque</h1>
        <p className="page-subtitle">Veja de relance quanto tem de cada produto e ajuste rápido pelo card</p>
      </div>
      <EstoqueGrid produtos={produtos ?? []} categorias={categorias ?? []} />
    </>
  )
}
