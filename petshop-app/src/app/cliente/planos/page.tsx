import { createClient } from '@/lib/supabase/server'
import { hojeBrasilISO } from '@/lib/agenda'
import type { AssinaturaDoCliente } from '@/lib/planos'
import PlanoClienteCard from '@/components/cliente/PlanoClienteCard'
import { IconAlert } from '@/components/icons'
import type { Metadata } from 'next'
import Ilustracao from '@/components/Ilustracao'

export const metadata: Metadata = { title: 'Meus Planos' }

export default async function MeusPlanosPage() {
  const supabase = await createClient()
  // Planos do próprio cliente (migration 068) — renova o período se venceu.
  const { data, error } = await supabase.rpc('fn_meus_planos')
  const assinaturas = (error ? [] : (data ?? [])) as AssinaturaDoCliente[]
  const ativas = assinaturas.filter(a => a.status === 'ativa')
  const canceladas = assinaturas.filter(a => a.status !== 'ativa')
  const hojeISO = hojeBrasilISO()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Meus Planos</h1>
        <p className="page-subtitle">Os planos dos seus pets: serviços incluídos, o que já foi usado e as cobranças</p>
      </div>

      {error ? (
        <div className="alert alert-info">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Os planos ainda não estão disponíveis. Tente de novo mais tarde.</span>
        </div>
      ) : assinaturas.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Ilustracao nome="planos" />
            <div className="empty-state-title">Nenhum plano ainda</div>
            <p>Quando a sua loja fizer um plano para o seu pet (ex.: banhos todo mês), ele aparece aqui.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 760 }}>
          {ativas.map(a => <PlanoClienteCard key={a.id_assinatura} a={a} hojeISO={hojeISO} />)}
          {canceladas.length > 0 && (
            <>
              <h3 style={{ margin: 'var(--space-4) 0 0', fontSize: '1rem' }}>Planos encerrados</h3>
              {canceladas.map(a => <PlanoClienteCard key={a.id_assinatura} a={a} hojeISO={hojeISO} />)}
            </>
          )}
        </div>
      )}
    </>
  )
}
