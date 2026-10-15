// Cadastro do cliente em etapas (completar o cadastro depois de entrar com o
// Google pelo site ou pelo app — quem vem do link de agendamento completa lá
// mesmo). Uma pergunta por tela, cada uma com a sua ilustração, e o primeiro
// pet já sai cadastrado. As regras são as que o servidor confere de novo no
// fim (completarCadastroClienteGoogleSchema e petSchema). O app tem uma
// cópia deste arquivo (petshop-mobile/src/lib/cadastro-cliente-etapas.ts) — se
// mudar aqui, muda lá.

import { cpfValido, soDigitos } from './cadastro-loja'

export type EtapaCliente = 'nome' | 'whatsapp' | 'cpf' | 'pet' | 'pet_detalhes' | 'pronto'

export const ETAPAS_CLIENTE: EtapaCliente[] = ['nome', 'whatsapp', 'cpf', 'pet', 'pet_detalhes', 'pronto']

export interface DadosCliente {
  nome: string
  telefone: string
  cpf: string
  pet_nome: string
  especie: '' | 'Cão' | 'Gato'
  sexo: '' | 'Macho' | 'Fêmea'
  porte: '' | 'Pequeno' | 'Médio' | 'Grande'
  raca: string
  nascimento: string
  aceita_termos: boolean
}

export const DADOS_CLIENTE_VAZIOS: DadosCliente = {
  nome: '', telefone: '', cpf: '', pet_nome: '', especie: '', sexo: '', porte: '', raca: '', nascimento: '', aceita_termos: false,
}

export const ESPECIES = ['Cão', 'Gato'] as const
export const SEXOS = ['Macho', 'Fêmea'] as const
export const PORTES = ['Pequeno', 'Médio', 'Grande'] as const

// Os textos e a ilustração de cada etapa (os nomes das ilustrações são os
// mesmos no site e no app).
export const TEXTO_ETAPA_CLIENTE: Record<EtapaCliente, { ilustracao: string; titulo: string; sub: string; opcional?: boolean }> = {
  nome: {
    ilustracao: 'boas-vindas',
    titulo: 'Como podemos te chamar?',
    sub: 'É o nome que as lojas vão ver nos seus agendamentos.',
  },
  whatsapp: {
    ilustracao: 'agendar',
    titulo: 'Qual é o seu WhatsApp?',
    sub: 'A loja usa para confirmar o horário e avisar quando o seu pet estiver pronto.',
  },
  cpf: {
    ilustracao: 'codigo',
    titulo: 'Qual é o seu CPF?',
    sub: 'Para identificar você com segurança nos agendamentos.',
  },
  pet: {
    ilustracao: 'pets',
    titulo: 'Quem é o seu pet?',
    sub: 'Cadastre agora e agende em poucos toques. Tem mais de um? Os outros você adiciona depois.',
    opcional: true,
  },
  pet_detalhes: {
    ilustracao: 'servicos',
    titulo: 'Mais sobre o seu pet',
    sub: 'Com isso a loja já mostra o preço certo do banho e da tosa.',
  },
  pronto: {
    ilustracao: 'tudo-em-dia',
    titulo: 'Tudo pronto!',
    sub: 'Confira os seus dados. Depois é só escolher um petshop e agendar.',
  },
}

export const temPet = (d: DadosCliente) => d.pet_nome.trim() !== ''
export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

export function mascaraCpfCliente(t: string): string {
  return soDigitos(t).slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2')
}

// "25/12/2020" enquanto digita.
export function mascaraDataCliente(t: string): string {
  const d = soDigitos(t).slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// "25/12/2020" -> "2020-12-25" (null se não for uma data de verdade).
export function dataParaISOCliente(texto: string): string | null {
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dia, mes, ano] = m
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))
  const confere = d.getUTCFullYear() === Number(ano) && d.getUTCMonth() === Number(mes) - 1 && d.getUTCDate() === Number(dia)
  return confere && Number(ano) >= 1990 ? `${ano}-${mes}-${dia}` : null
}

function hojeISO(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

// O que falta para sair da etapa (ou null).
export function problemaDaEtapaCliente(etapa: EtapaCliente, d: DadosCliente): string | null {
  switch (etapa) {
    case 'nome':
      return d.nome.trim().length < 2 ? 'Escreva o seu nome (pelo menos 2 letras).' : null
    case 'whatsapp': {
      const n = soDigitos(d.telefone).length
      return n < 10 || n > 11 ? 'Informe o WhatsApp com DDD.' : null
    }
    case 'cpf': {
      const cpf = soDigitos(d.cpf)
      if (cpf.length !== 11) return 'Informe o CPF com 11 dígitos.'
      return cpfValido(cpf) ? null : 'Esse CPF não é válido. Confira os números.'
    }
    case 'pet':
      if (!temPet(d)) return 'Escreva o nome do pet — ou toque em "Pular por agora".'
      return d.especie ? null : 'É cão ou gato?'
    case 'pet_detalhes': {
      if (!d.sexo) return 'Escolha se é macho ou fêmea.'
      if (!d.raca.trim()) return 'Informe a raça (ou "SRD", se não tiver raça definida).'
      const iso = dataParaISOCliente(d.nascimento)
      if (!iso) return 'Informe a data de nascimento (dia/mês/ano). Pode ser aproximada.'
      return iso > hojeISO() ? 'A data de nascimento não pode ser futura.' : null
    }
    case 'pronto':
      return d.aceita_termos ? null : 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.'
  }
}

// Etapa seguinte / anterior: sem pet, os detalhes dele ficam de fora.
export function proximaEtapaCliente(i: number, d: DadosCliente): number {
  const etapa = ETAPAS_CLIENTE[i]
  if (etapa === 'pet' && !temPet(d)) return ETAPAS_CLIENTE.indexOf('pronto')
  return Math.min(ETAPAS_CLIENTE.length - 1, i + 1)
}
export function etapaAnteriorCliente(i: number, d: DadosCliente): number {
  if (ETAPAS_CLIENTE[i] === 'pronto' && !temPet(d)) return ETAPAS_CLIENTE.indexOf('pet')
  return Math.max(0, i - 1)
}

// Erro que o servidor devolveu no fim → a etapa onde corrigir.
export function etapaDoErroCliente(mensagem: string): EtapaCliente {
  const m = mensagem.toLowerCase()
  if (m.startsWith('pet:')) return m.includes('nome') ? 'pet' : 'pet_detalhes'
  if (m.includes('telefone') || m.includes('whatsapp')) return 'whatsapp'
  if (m.includes('cpf')) return 'cpf'
  if (m.includes('nome')) return 'nome'
  return 'pronto'
}

// O pet numa linha, para a revisão.
export function petEmUmaLinha(d: DadosCliente): string {
  if (!temPet(d)) return ''
  return [d.pet_nome.trim(), d.especie, d.raca.trim(), d.porte].filter(Boolean).join(' · ')
}

// Os campos que o servidor espera (completarCadastroClienteEtapasAction).
export function camposDoCadastroCliente(d: DadosCliente): Record<string, string> {
  const campos: Record<string, string> = {
    nome: d.nome.trim(),
    cpf: soDigitos(d.cpf),
    telefone: soDigitos(d.telefone),
    aceita_termos: d.aceita_termos ? 'on' : '',
  }
  if (temPet(d)) {
    Object.assign(campos, {
      pet_nome: d.pet_nome.trim(),
      pet_especie: d.especie,
      pet_sexo: d.sexo,
      pet_porte: d.porte,
      pet_raca: d.raca.trim(),
      pet_dt_nasc: dataParaISOCliente(d.nascimento) ?? '',
    })
  }
  return campos
}
