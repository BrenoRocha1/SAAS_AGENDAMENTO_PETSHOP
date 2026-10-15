'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { completarCadastroLojistaGoogleAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import CadastroLojaEtapas from '@/components/CadastroLojaEtapas'

// Quem entrou com o Google, ainda não tem cadastro e escolheu "Tenho um
// petshop" (/completar-cadastro): o cadastro do petshop, uma pergunta por tela (CadastroLojaEtapas). No fim,
// a action cria a loja e leva ao painel.
export default function CompletarCadastroLojistaPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setEmail(user.email ?? null)
      setCarregando(false)
    })
  }, [router])

  if (carregando) {
    return <div className="cl" aria-busy="true" />
  }

  return (
    <CadastroLojaEtapas
      email={email}
      onEnviar={async campos => {
        const fd = new FormData()
        for (const [chave, valor] of Object.entries(campos)) if (valor) fd.set(chave, valor)
        return completarCadastroLojistaGoogleAction(fd)
      }}
      onVoltarInicio={() => router.push('/completar-cadastro')}
    />
  )
}
