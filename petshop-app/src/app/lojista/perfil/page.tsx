import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { obterContextoLojista } from '@/lib/lojista-context'
import PerfilLojistaForm from '@/components/lojista/PerfilLojistaForm'
import LogoLojaUpload from '@/components/lojista/LogoLojaUpload'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dados da loja' }

export default async function PerfilLojistaPage() {
  const supabase = await createClient()
  const user = await obterUsuario()
  // Dono ou administrador da equipe (acesso total) — o id é o da loja.
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null
  const lojistaId = contexto.idLojista

  const { data: lojista } = await supabase
    .from('lojista')
    .select('*')
    .eq('id_lojista', lojistaId)
    .single()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dados da loja</h1>
        <p className="page-subtitle">Como os clientes veem a sua loja.</p>
      </div>
      <div className="pf">
        <LogoLojaUpload logoUrlInicial={lojista?.logo_url ?? null} nomeLoja={lojista?.nome_loja ?? 'Loja'} />
        <PerfilLojistaForm lojista={lojista} />
      </div>
    </>
  )
}
