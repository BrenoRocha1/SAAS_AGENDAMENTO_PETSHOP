'use client'

import { atualizarFotoPetAction, removerFotoPetAction } from '@/lib/actions'
import FotoUpload from '@/components/cliente/FotoUpload'

interface Props {
  idPet: string
  fotoUrlInicial: string | null
}

export default function PetFotoUpload({ idPet, fotoUrlInicial }: Props) {
  return (
    <FotoUpload
      titulo="Foto do Pet"
      deQuem="do pet"
      fotoUrlInicial={fotoUrlInicial}
      convite="Adicione uma foto para identificar seu pet."
      mensagemSalva="Foto do pet atualizada com sucesso!"
      enviar={formData => atualizarFotoPetAction(idPet, formData)}
      remover={() => removerFotoPetAction(idPet)}
    />
  )
}
