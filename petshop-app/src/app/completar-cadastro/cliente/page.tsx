'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { completarCadastroClienteEtapasAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import CadastroClienteEtapas from '@/components/CadastroClienteEtapas'

// Quem entrou com o Google pelo site, ainda não tem cadastro e escolheu
// "Sou cliente" (/completar-cadastro): o cadastro do cliente, uma pergunta
// por tela (CadastroClienteEtapas). Quem vem do link de agendamento não
// passa aqui — completa o cadastro no próprio link.
export default function CompletarCadastroClientePage() {
  const router = useRouter()
  const [conta, setConta] = useState<{ email: string | null; nome: string | null } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setConta({
        email: user.email ?? null,
        nome: user.user_metadata?.full_name || user.user_metadata?.name || null,
      })
    })
  }, [router])

  if (!conta) {
    return <div className="cl" aria-busy="true" />
  }

  return (
    <CadastroClienteEtapas
      email={conta.email}
      nomeGoogle={conta.nome}
      onEnviar={async campos => {
        const fd = new FormData()
        for (const [chave, valor] of Object.entries(campos)) if (valor) fd.set(chave, valor)
        return completarCadastroClienteEtapasAction(fd)
      }}
      onVoltarInicio={() => router.push('/completar-cadastro')}
    />
  )
}
