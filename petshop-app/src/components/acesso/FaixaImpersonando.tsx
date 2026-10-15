import { cookies } from 'next/headers'
import { COOKIE_IMPERSONANDO } from '@/lib/impersonar'
import { sairDaContaAction } from '@/lib/actions-interno'

// Faixa fixa no topo quando alguém da equipe entrou na conta de uma loja
// pelo painel interno. O menu e a página descem para ela não cobrir nada
// (ver .faixa-interna no globals.css). "Voltar ao painel" sai da loja e
// restaura a sessão do administrador.
export default async function FaixaImpersonando() {
  const valor = (await cookies()).get(COOKIE_IMPERSONANDO)?.value
  if (!valor) return null
  let nome = valor
  try { nome = decodeURIComponent(valor) } catch { /* nome como veio */ }
  return (
    <form action={sairDaContaAction} className="faixa-interna" role="status">
      <span className="faixa-interna-texto">
        <span className="faixa-interna-longo">Acesso interno · você está na conta de </span>
        <span className="faixa-interna-curto">Conta de </span>
        <strong>{nome}</strong>
      </span>
      <button type="submit" className="faixa-interna-botao">Voltar ao painel</button>
    </form>
  )
}
