import { TelaQuadroTaxiDog } from '@/telas/TelaQuadroTaxiDog'

// "Minhas corridas" do TaxiDog: o mesmo quadro do site, com as corridas dele
// e as que ainda estão sem TaxiDog — a etapa seguinte é um botão no card.
export default function CorridasScreen() {
  return <TelaQuadroTaxiDog modo="motorista" />
}
