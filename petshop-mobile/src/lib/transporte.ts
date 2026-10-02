// Transporte do pet (TaxiDog) no agendamento do cliente — espelha os
// tipos de petshop-app/src/lib/taxidog.ts e o estado de
// components/cliente/TaxiDogEtapa. O preço mostrado vem SEMPRE da cotação
// do servidor (cotarTaxiDogAction → fn_cotar_taxidog) e é calculado de
// novo na hora de agendar — nunca aceito do aparelho.
import type { ModalidadeTaxiDog } from '@/lib/taxidog'

export const MODALIDADES: ModalidadeTaxiDog[] = ['buscar', 'entregar', 'buscar_entregar']

export const DESCRICAO_MODALIDADE: Record<ModalidadeTaxiDog, string> = {
  buscar: 'Buscamos o pet no seu endereço. Você retira na loja depois.',
  entregar: 'Você leva o pet até a loja. Entregamos no seu endereço depois.',
  buscar_entregar: 'Buscamos o pet e levamos de volta quando o serviço terminar.',
}

export interface EnderecoTaxiDog {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const ENDERECO_VAZIO: EnderecoTaxiDog = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }

export interface CotacaoTaxiDog {
  disponivel: boolean
  valor: number | null
  distanciaKm: number | null
  criterio: string | null
  motivo: string | null
}

export interface EstadoTransporte {
  opcao: 'levar' | 'taxidog' | null
  modalidade: ModalidadeTaxiDog
  endereco: EnderecoTaxiDog
  cotacoes: Record<ModalidadeTaxiDog, CotacaoTaxiDog> | null
  precisao: 'endereco' | 'bairro' | 'cidade' | null
}

export const ESTADO_TRANSPORTE_INICIAL: EstadoTransporte = {
  opcao: null,
  modalidade: 'buscar_entregar',
  endereco: ENDERECO_VAZIO,
  cotacoes: null,
  precisao: null,
}

export interface EscolhaTaxiDog {
  modalidade: ModalidadeTaxiDog
  endereco: EnderecoTaxiDog
  cotacao: CotacaoTaxiDog
}

// O que efetivamente vai pro agendamento: null = o pet vai sem TaxiDog.
export function escolhaDoTransporte(estado: EstadoTransporte): EscolhaTaxiDog | null {
  if (estado.opcao !== 'taxidog') return null
  const cotacao = estado.cotacoes?.[estado.modalidade]
  if (!cotacao?.disponivel) return null
  return { modalidade: estado.modalidade, endereco: estado.endereco, cotacao }
}

export function transportePronto(estado: EstadoTransporte): boolean {
  return estado.opcao === 'levar' || escolhaDoTransporte(estado) !== null
}

export function enderecoCompleto(e: EnderecoTaxiDog): boolean {
  return (
    e.cep.replace(/\D/g, '').length === 8 &&
    e.logradouro.trim().length >= 2 &&
    e.numero.trim().length >= 1 &&
    e.bairro.trim().length >= 2 &&
    e.cidade.trim().length >= 2 &&
    /^[A-Za-z]{2}$/.test(e.uf.trim())
  )
}

// Campo JSON `taxidog` que criarAgendamentoAction espera. O cliente não
// escolhe quem faz a corrida (só a loja).
export function taxiDogParaFormulario(escolha: EscolhaTaxiDog): string {
  return JSON.stringify({ modalidade: escolha.modalidade, endereco: escolha.endereco, id_funcionario: null })
}
