// Tipos espelhando as tabelas já existentes no banco (ver
// petshop-app/supabase/migrations) — nenhuma tabela nova é criada pro
// app mobile, só lemos/escrevemos nas mesmas de sempre.
import type { StatusAgendamento } from '@/lib/statusAgendamento'

export type Especie = 'Cão' | 'Gato'
export type Porte = 'Pequeno' | 'Médio' | 'Grande'
export type Sexo = 'Macho' | 'Fêmea'

export interface Agendamento {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: StatusAgendamento
  valor: number
  obs: string | null
  id_funcionario: string | null
  pet: { nome: string; raca: string; especie: Especie | null; porte: Porte | null; foto_url: string | null } | null
  servico: { nome: string } | null
  cliente: { nome: string } | null
  funcionario: { nome: string } | null
}

export interface ClienteLinha {
  id_cliente: string
  nome: string
  telefone: string
  email: string
  cpf: string
  qtd_pets: number
  pets_resumo: string[] | null
  qtd_agendamentos: number
}

export interface PetLinha {
  id_pet: string
  nome: string
  especie: Especie | null
  porte: Porte | null
  raca: string
  sexo: Sexo
  dt_nasc: string
  peso: number | null
  obs: string | null
  foto_url: string | null
  id_cliente: string
  nome_cliente: string
  telefone_cliente: string
}

export interface LojistaInfo {
  nome_loja: string
  email: string
  telefone: string
  endereco: string | null
  // Migration 045 — ausentes antes dela.
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade: string | null
  estado: string | null
  logo_url: string | null
}
