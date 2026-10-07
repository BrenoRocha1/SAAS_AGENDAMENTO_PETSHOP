import { CartaoFoto } from '@/components/CartaoFoto'
import { acoesFotoPet } from '@/components/TrocarFoto'

interface Props {
  idPet: string
  fotoUrl: string | null
  onMudou: (url: string | null) => void
}

// O cartão "Foto do pet" da página de edição do cliente no site
// (PetFotoUpload).
export function CartaoFotoPet({ idPet, fotoUrl, onMudou }: Props) {
  const acoes = acoesFotoPet(idPet)
  return (
    <CartaoFoto
      titulo="Foto do pet"
      deQuem="do pet"
      fotoUrl={fotoUrl}
      convite="Adicione uma foto para identificar seu pet."
      mensagemSalva="Foto do pet atualizada com sucesso!"
      enviar={acoes.enviar}
      remover={acoes.remover}
      onMudou={onMudou}
    />
  )
}
