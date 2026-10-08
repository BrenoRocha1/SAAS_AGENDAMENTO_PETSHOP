import { cookies } from 'next/headers'
import { COOKIE_IMPERSONANDO } from '@/lib/impersonar'
import { sairDaContaAction } from '@/lib/actions-interno'

// Faixa fixa no topo quando alguém da equipe entrou na conta de um cliente
// ou de uma loja pelo painel interno.
export default async function FaixaImpersonando() {
  const nome = (await cookies()).get(COOKIE_IMPERSONANDO)?.value
  if (!nome) return null
  return (
    <form
      action={sairDaContaAction}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, display: 'flex', gap: 12,
        alignItems: 'center', justifyContent: 'center', padding: '6px 12px', fontSize: '0.8125rem',
        background: 'var(--warning-500)', color: '#1f2937', fontWeight: 600,
      }}
    >
      <span>Você está dentro da conta de {decodeURIComponent(nome)} (acesso interno)</span>
      <button type="submit" className="btn btn-sm" style={{ background: '#111827', color: '#fff' }}>Sair desta conta</button>
    </form>
  )
}
