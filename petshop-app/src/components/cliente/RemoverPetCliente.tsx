'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { desativarPetAction } from '@/lib/actions'
import { Confirmacao } from '@/components/app/PecasApp'
import { IconAlert, IconTrash } from '@/components/icons'

// "Remover pet" na página de edição, só no celular: lá a lista de pets é de
// linhas que abrem esta página, sem o cartão do computador (que tem a
// lixeira) — sem este botão não havia como tirar um pet pelo celular. É o
// mesmo botão e a mesma pergunta do app.
export default function RemoverPetCliente({ idPet, nome }: { idPet: string; nome: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function remover() {
    setErro(null)
    startTransition(async () => {
      const result = await desativarPetAction(idPet)
      setConfirmando(false)
      if (result?.error) {
        setErro(result.error)
        return
      }
      router.push('/cliente/pets')
      router.refresh()
    })
  }

  return (
    <div className="so-celular">
      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-3)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}
      <button type="button" className="btn btn-full tela-app-perigo" onClick={() => setConfirmando(true)} disabled={isPending}>
        <IconTrash style={{ width: 15, height: 15 }} /> Remover pet
      </button>

      {confirmando && (
        <Confirmacao
          titulo="Remover pet"
          mensagem={`Tirar ${nome} da sua lista? Os agendamentos já feitos continuam no histórico.`}
          confirmar="Remover"
          ocupado={isPending}
          onConfirmar={remover}
          onFechar={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}
