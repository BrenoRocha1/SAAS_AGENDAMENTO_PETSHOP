// Cadastro do petshop em etapas (completar o cadastro depois de entrar com o
// Google): uma pergunta por tela, cada uma com a sua ilustração. As regras
// de cada etapa são as mesmas que o servidor confere de novo no fim
// (completarCadastroLojistaGoogleSchema). O app tem uma cópia deste arquivo
// (petshop-mobile/src/lib/cadastro-loja.ts) — se mudar aqui, muda lá.

export type EtapaLoja = 'nome' | 'whatsapp' | 'documento' | 'endereco' | 'sobre' | 'pronto'

export const ETAPAS_LOJA: EtapaLoja[] = ['nome', 'whatsapp', 'documento', 'endereco', 'sobre', 'pronto']

export interface DadosLoja {
  nome_loja: string
  telefone: string
  documento: string
  cep: string
  endereco: string
  numero: string
  bairro: string
  cidade: string
  estado: string
  descricao: string
  aceita_termos: boolean
}

export const DADOS_LOJA_VAZIOS: DadosLoja = {
  nome_loja: '', telefone: '', documento: '', cep: '', endereco: '', numero: '', bairro: '', cidade: '', estado: '', descricao: '', aceita_termos: false,
}

// Os textos e a ilustração de cada etapa (os nomes das ilustrações são os
// mesmos no site e no app).
export const TEXTO_ETAPA: Record<EtapaLoja, { ilustracao: string; titulo: string; sub: string; opcional?: boolean }> = {
  nome: {
    ilustracao: 'loja',
    titulo: 'Como se chama o seu petshop?',
    sub: 'É o nome que os seus clientes vão ver no link de agendamento.',
  },
  whatsapp: {
    ilustracao: 'clientes',
    titulo: 'Qual é o WhatsApp da loja?',
    sub: 'Os clientes falam com você e recebem os avisos dos agendamentos por ele.',
  },
  documento: {
    ilustracao: 'codigo',
    titulo: 'CPF ou CNPJ do responsável',
    sub: 'Só para confirmar que a loja é sua. Não aparece para os clientes.',
  },
  endereco: {
    ilustracao: 'taxidog',
    titulo: 'Onde fica a loja?',
    sub: 'Aparece para os clientes e é o ponto de partida do TaxiDog. Dá para completar depois.',
    opcional: true,
  },
  sobre: {
    ilustracao: 'servicos',
    titulo: 'Conte um pouco sobre a loja',
    sub: 'Os serviços, o cuidado com os pets, o que faz a loja ser especial.',
    opcional: true,
  },
  pronto: {
    ilustracao: 'tudo-em-dia',
    titulo: 'Tudo pronto!',
    sub: 'Confira os dados. Depois é só cadastrar os serviços e começar a receber agendamentos.',
  },
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export const soDigitos = (t: string) => t.replace(/\D/g, '')

export function mascaraTelefoneLoja(t: string): string {
  const d = soDigitos(t).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// CPF enquanto tem até 11 dígitos; CNPJ a partir do 12º.
export function mascaraDocumentoLoja(t: string): string {
  const d = soDigitos(t).slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export function mascaraCepLoja(t: string): string {
  const d = soDigitos(t).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== Number(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  return resto === Number(cpf[10])
}

function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false
  const digito = (base: string, pesos: number[]) => {
    const resto = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0) % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return digito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[12])
    && digito(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[13])
}

// O que falta para sair da etapa (ou null).
export function problemaDaEtapa(etapa: EtapaLoja, d: DadosLoja): string | null {
  switch (etapa) {
    case 'nome':
      return d.nome_loja.trim().length < 2 ? 'Escreva o nome do petshop (pelo menos 2 letras).' : null
    case 'whatsapp': {
      const n = soDigitos(d.telefone).length
      return n < 10 || n > 11 ? 'Informe o WhatsApp com DDD.' : null
    }
    case 'documento': {
      const doc = soDigitos(d.documento)
      if (doc.length !== 11 && doc.length !== 14) return 'Informe o CPF (11 dígitos) ou o CNPJ (14 dígitos).'
      return (doc.length === 11 ? cpfValido(doc) : cnpjValido(doc)) ? null : 'Esse CPF ou CNPJ não é válido. Confira os números.'
    }
    case 'endereco': {
      const cep = soDigitos(d.cep)
      if (cep && cep.length !== 8) return 'O CEP tem 8 números.'
      if (d.endereco.trim() && !d.numero.trim()) return 'Informe o número da loja (use S/N se não tiver).'
      return null
    }
    case 'sobre':
      return d.descricao.length > 500 ? 'Use no máximo 500 letras.' : null
    case 'pronto':
      return d.aceita_termos ? null : 'Para criar a loja, aceite os Termos de Uso e a Política de Privacidade.'
  }
}

// Erro que o servidor devolveu no fim → a etapa onde corrigir.
export function etapaDoErro(mensagem: string): EtapaLoja {
  const m = mensagem.toLowerCase()
  if (m.includes('telefone') || m.includes('whatsapp')) return 'whatsapp'
  if (m.includes('cpf') || m.includes('cnpj') || m.includes('documento')) return 'documento'
  if (m.includes('nome')) return 'nome'
  if (m.includes('cep') || m.includes('número') || m.includes('endereço')) return 'endereco'
  return 'pronto'
}

// O endereço numa linha, para a revisão.
export function enderecoEmUmaLinha(d: DadosLoja): string {
  const rua = [d.endereco.trim(), d.numero.trim()].filter(Boolean).join(', ')
  const cidade = [d.cidade.trim(), d.estado].filter(Boolean).join(' - ')
  return [rua, d.bairro.trim(), cidade].filter(Boolean).join(' · ')
}

// Os campos que o servidor espera (completarCadastroLojistaGoogleAction).
export function camposDoCadastro(d: DadosLoja): Record<string, string> {
  return {
    nome_loja: d.nome_loja.trim(),
    telefone: soDigitos(d.telefone),
    documento: soDigitos(d.documento),
    descricao: d.descricao.trim(),
    endereco: d.endereco.trim(),
    numero: d.numero.trim(),
    bairro: d.bairro.trim(),
    cidade: d.cidade.trim(),
    estado: d.estado,
    cep: soDigitos(d.cep),
    aceita_termos: d.aceita_termos ? 'on' : '',
  }
}
