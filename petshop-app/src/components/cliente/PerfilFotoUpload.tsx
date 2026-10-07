'use client'

import { atualizarFotoClienteAction, removerFotoClienteAction } from '@/lib/actions'
import FotoUpload from '@/components/cliente/FotoUpload'

// A foto da conta do cliente (migration 085), em Meu Perfil — o mesmo
// cartão da foto do pet. Ela aparece no lugar das iniciais, no menu.
export default function PerfilFotoUpload({ fotoUrlInicial }: { fotoUrlInicial: string | null }) {
  return (
    <FotoUpload
      titulo="Foto do Perfil"
      deQuem="do perfil"
      fotoUrlInicial={fotoUrlInicial}
      convite="Adicione uma foto para aparecer na sua conta."
      mensagemSalva="Foto do perfil atualizada com sucesso!"
      enviar={atualizarFotoClienteAction}
      remover={removerFotoClienteAction}
      maxWidth={580}
    />
  )
}
