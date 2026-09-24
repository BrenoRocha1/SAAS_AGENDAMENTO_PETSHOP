// Espelha petshop-app/src/lib/taxidog.ts — só o que o app ainda usa. A
// execução do TaxiDog é por rotas (src/lib/taxidog-rotas.ts, migration
// 052); a etapa de cada corrida anda junto com as paradas, no banco.

export type ModalidadeTaxiDog = 'buscar' | 'entregar' | 'buscar_entregar'

export const ROTULO_MODALIDADE: Record<ModalidadeTaxiDog, string> = {
  buscar: 'Somente buscar',
  entregar: 'Somente entregar',
  buscar_entregar: 'Buscar e entregar',
}

export function formatarReais(valor: number | string | null | undefined): string {
  return `R$ ${Number(valor ?? 0).toFixed(2).replace('.', ',')}`
}
