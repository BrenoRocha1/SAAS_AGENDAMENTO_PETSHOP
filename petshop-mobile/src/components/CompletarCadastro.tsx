import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { supabase } from '@/lib/supabase'
import { CadastroLoja } from './CadastroLoja'
import { CadastroClienteEtapas } from './CadastroClienteEtapas'
import { EscolhaPerfil, type PerfilCadastro } from './EscolhaPerfil'

// Quem entrou pelo Google e ainda não tem cadastro. Primeiro, obrigatório:
// é cliente ou tem um petshop (EscolhaPerfil, o /completar-cadastro do
// site). Depois, o cadastro em etapas de cada um — CadastroClienteEtapas ou
// CadastroLoja, os mesmos /completar-cadastro/cliente e /lojista do site.
export function CompletarCadastro() {
  const { user, recarregar, signOut } = useAuth()
  const [perfil, setPerfil] = useState<PerfilCadastro | null>(null)
  const nomeGoogle = (user?.user_metadata?.full_name as string | undefined) ?? (user?.user_metadata?.name as string | undefined) ?? null

  // Cadastro feito: o token novo já traz o papel, e o app passa para a área certa.
  async function concluir(acao: string, campos: Record<string, string>) {
    if (!acoesDisponiveis()) return { error: MSG_SEM_SITE }
    const r = await chamarAcao(acao, form(campos))
    if (r.error) return { error: r.error }
    await supabase.auth.refreshSession().catch(() => null)
    await recarregar()
    return {}
  }

  if (!perfil) {
    return <EscolhaPerfil nome={nomeGoogle} email={user?.email} onEscolher={setPerfil} onOutraConta={signOut} />
  }

  if (perfil === 'lojista') {
    return (
      <CadastroLoja
        email={user?.email}
        onVoltarInicio={() => setPerfil(null)}
        onEnviar={campos => concluir('completarCadastroLojistaGoogleAction', campos)}
      />
    )
  }

  return (
    <CadastroClienteEtapas
      email={user?.email}
      nomeGoogle={nomeGoogle}
      onVoltarInicio={() => setPerfil(null)}
      onEnviar={campos => concluir('completarCadastroClienteEtapasAction', campos)}
    />
  )
}
