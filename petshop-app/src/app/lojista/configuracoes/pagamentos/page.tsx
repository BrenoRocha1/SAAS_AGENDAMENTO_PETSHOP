import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { obterContextoLojista } from '@/lib/lojista-context'
import { normalizarFormasLoja } from '@/lib/pagamento'
import FormasPagamentoForm from '@/components/lojista/FormasPagamentoForm'
import { IconAlert, IconChevronLeft, IconLock } from '@/components/icons'

export const metadata: Metadata = { title: 'Formas de pagamentos aceitas — Configurações' }

// Configurações → Loja → "Formas de pagamentos aceitas" (migration 057).
export default async function FormasPagamentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  const voltar = (
    <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
      <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
    </Link>
  )

  if (contexto.role === 'funcionario' && !contexto.acessoTotal) {
    return (
      <>
        {voltar}
        <div className="empty-state card">
          <IconLock style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para mudar as formas de pagamento</div>
          <p>Apenas o responsável pela loja ou um administrador pode alterar essa configuração.</p>
        </div>
      </>
    )
  }

  const { data, error } = await supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: contexto.idLojista })

  return (
    <>
      {voltar}
      <div className="page-header">
        <h1 className="page-title">Formas de pagamentos aceitas</h1>
        <p className="page-subtitle">Só as formas ativadas aparecem para o cliente e no agendamento feito pela loja.</p>
      </div>

      {error ? (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar as formas de pagamento. Execute a migration 057_formas_pagamento.sql se ainda não rodou.
            {process.env.NODE_ENV !== 'production' && ` [DEV: ${error.message}]`}
          </span>
        </div>
      ) : (
        <FormasPagamentoForm inicial={normalizarFormasLoja(data)} />
      )}
    </>
  )
}
