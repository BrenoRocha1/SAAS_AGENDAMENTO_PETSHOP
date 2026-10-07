import { dialogo } from '@/lib/dialogo'
import type { TaxiDogPendente } from '@/lib/agendamentos'

// A busca do TaxiDog ainda não chegou e a loja quer iniciar/finalizar:
// avisa (não bloqueia) — o cliente pode ter trazido o pet. `seguir` recebe a
// resposta: 'cliente_trouxe' tira a busca, 'ignorar' segue sem mexer nela.
export function perguntarBuscaTaxiDog(p: TaxiDogPendente, seguir: (escolha: 'ignorar' | 'cliente_trouxe') => void) {
  if (p.emMovimento) {
    dialogo(
      'TaxiDog a caminho',
      `${p.pet} já está no carro do TaxiDog, a caminho da loja. Quer seguir mesmo assim?`,
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Seguir mesmo assim', onPress: () => seguir('ignorar') },
      ],
    )
    return
  }
  dialogo(
    'Busca do TaxiDog pendente',
    `O TaxiDog ainda não buscou ${p.pet}. O cliente trouxe o pet?`,
    [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Seguir sem mexer no TaxiDog', onPress: () => seguir('ignorar') },
      { text: 'Cliente trouxe o pet', onPress: () => seguir('cliente_trouxe') },
    ],
  )
}
